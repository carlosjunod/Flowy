import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import OpenAI from 'openai';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

import { ytdlpCookieArgs } from './ytdlp.js';
import { ProcessorError } from '../processors/url.processor.js';

const execFileP = promisify(execFile);

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SEC = 600;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key) throw new ProcessorError('OPENAI_KEY_MISSING', 'OPENAI_API_KEY required for audio transcription');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

interface Paths {
  audio: string;
  thumbnail: string;
  template: string;
}

function paths(tmpPrefix: string): Paths {
  const base = join(tmpdir(), tmpPrefix);
  return {
    audio: `${base}.mp3`,
    thumbnail: `${base}.jpg`,
    template: `${base}.%(ext)s`,
  };
}

async function cleanup(p: Paths): Promise<void> {
  await Promise.allSettled([
    rm(p.audio, { force: true }),
    rm(p.thumbnail, { force: true }),
  ]);
}

async function runYtDlp(url: string, template: string, playlistIndex?: number): Promise<void> {
  const ytdlpPath = process.env.YTDLP_PATH ?? 'yt-dlp';
  const ffmpegPath = process.env.FFMPEG_PATH;
  const args = [
    ...ytdlpCookieArgs(),
    // Playlist vs single-video selection. Instagram stories are playlists where
    // per-entry `url` fields are null — we MUST target a slide by 1-indexed
    // position via --playlist-items. Single reels keep the historical
    // --no-playlist behavior.
    ...(typeof playlistIndex === 'number'
      ? ['--yes-playlist', '--playlist-items', String(playlistIndex)]
      : ['--no-playlist']),
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
    '-x', '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', template,
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  args.push(url);

  // Homebrew PATH patch so ffprobe/ffmpeg resolve when the worker is launched
  // from a shell that doesn't inherit it (e.g. Finder-launched dev process).
  const env = {
    ...process.env,
    PATH: [
      process.env.PATH ?? '',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ].filter(Boolean).join(':'),
  };

  try {
    await execFileP(ytdlpPath, args, {
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
  } catch (err) {
    const detail =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: unknown }).stderr ?? '')
        : err instanceof Error
          ? err.message
          : String(err);
    const lower = detail.toLowerCase();
    if (lower.includes('private')) {
      throw new ProcessorError('PRIVATE_PROFILE', detail.slice(0, 500));
    }
    if (lower.includes('login required') || lower.includes('login_required')) {
      throw new ProcessorError('LOGIN_REQUIRED', detail.slice(0, 500));
    }
    throw new ProcessorError('DOWNLOAD_FAILED', detail.slice(0, 500));
  }
}

async function maybeTrimAudio(audioPath: string, maxDurationSec: number): Promise<void> {
  const info = await stat(audioPath);
  if (info.size <= WHISPER_MAX_BYTES) return;
  const trimmed = `${audioPath}.trimmed.mp3`;
  try {
    await execFileP(
      'ffmpeg',
      ['-y', '-i', audioPath, '-t', String(maxDurationSec), '-c', 'copy', trimmed],
      { timeout: 30_000 },
    );
    await rm(audioPath, { force: true });
    const { rename } = await import('node:fs/promises');
    await rename(trimmed, audioPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('AUDIO_TRIM_FAILED', msg);
  }
}

async function transcribe(audioPath: string): Promise<string> {
  try {
    const client = getOpenAI();
    const { createReadStream } = await import('node:fs');
    const result = await client.audio.transcriptions.create({
      file: createReadStream(audioPath) as unknown as File,
      model: 'whisper-1',
      response_format: 'text',
    });
    if (typeof result === 'string') return result;
    if (result && typeof result === 'object' && 'text' in result) {
      return String((result as { text: string }).text);
    }
    throw new ProcessorError('TRANSCRIPTION_FAILED', 'unexpected response shape');
  } catch (err) {
    if (err instanceof ProcessorError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('TRANSCRIPTION_FAILED', msg);
  }
}

export interface TranscribeOptions {
  url: string;
  tmpPrefix: string;
  maxDurationSec?: number;
  /**
   * 1-indexed slide position within a playlist (Instagram story / carousel).
   * When set, the parent playlist URL MUST be passed as `url` — yt-dlp will
   * fetch only the targeted slide. Omit for single-video URLs (reels, posts).
   */
  playlistIndex?: number;
}

export interface TranscribeResult {
  transcript: string;
  thumbnailBuffer: Buffer | null;
}

export async function transcribeMediaUrl(opts: TranscribeOptions): Promise<TranscribeResult> {
  const p = paths(opts.tmpPrefix);
  const maxDur = opts.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  try {
    await runYtDlp(opts.url, p.template, opts.playlistIndex);
    if (!existsSync(p.audio)) {
      throw new ProcessorError('AUDIO_NOT_FOUND', `no audio at ${p.audio}`);
    }
    await maybeTrimAudio(p.audio, maxDur);
    const [transcript, thumbnailBuffer] = await Promise.all([
      transcribe(p.audio),
      existsSync(p.thumbnail)
        ? readFile(p.thumbnail).catch(() => null)
        : Promise.resolve<Buffer | null>(null),
    ]);
    return { transcript, thumbnailBuffer };
  } finally {
    await cleanup(p);
  }
}
