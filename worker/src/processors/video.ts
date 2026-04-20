import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import OpenAI from 'openai';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

import { updateItem, createEmbedding, type ItemRecord } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { ProcessorError } from './url.processor.js';

const execFileP = promisify(execFile);

const TIKTOK_PATTERNS = [
  /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
  /^https?:\/\/vm\.tiktok\.com\//,
];
const INSTAGRAM_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
];

export type VideoPlatform = 'tiktok' | 'instagram';

export function detectPlatform(url: string): VideoPlatform | null {
  if (TIKTOK_PATTERNS.some((r) => r.test(url))) return 'tiktok';
  if (INSTAGRAM_PATTERNS.some((r) => r.test(url))) return 'instagram';
  return null;
}

const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key) throw new ProcessorError('OPENAI_KEY_MISSING', 'OPENAI_API_KEY required for video transcription');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

interface Paths {
  audio: string;
  thumbnail: string;
  template: string;
}

function paths(itemId: string): Paths {
  const base = join(tmpdir(), `tryflowy-${itemId}`);
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

async function runYtDlp(url: string, template: string): Promise<void> {
  const ytdlpPath = process.env.YTDLP_PATH ?? 'yt-dlp';
  const ffmpegPath = process.env.FFMPEG_PATH;
  const args = [
    '--no-playlist',
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
    '-x', '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', template,
  ];
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  args.push(url);

  // Ensure common Homebrew locations are on PATH so bundled conversion tools
  // (ffprobe, etc.) resolve even when the worker was launched without them.
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
    if (detail.toLowerCase().includes('private')) {
      throw new ProcessorError('PRIVATE_PROFILE', detail.slice(0, 500));
    }
    throw new ProcessorError('DOWNLOAD_FAILED', detail.slice(0, 500));
  }
}

async function maybeTrimAudio(audioPath: string): Promise<void> {
  const info = await stat(audioPath);
  if (info.size <= WHISPER_MAX_BYTES) return;
  // Trim to first 10 minutes via ffmpeg
  const trimmed = `${audioPath}.trimmed.mp3`;
  try {
    await execFileP(
      'ffmpeg',
      ['-y', '-i', audioPath, '-t', '00:10:00', '-c', 'copy', trimmed],
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

export async function processVideo(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');

  const platform = detectPlatform(rawUrl);
  if (!platform) throw new ProcessorError('UNSUPPORTED_VIDEO_URL', rawUrl);

  const p = paths(item.id);
  try {
    await runYtDlp(rawUrl, p.template);

    if (!existsSync(p.audio)) {
      throw new ProcessorError('AUDIO_NOT_FOUND', `no audio at ${p.audio}`);
    }

    await maybeTrimAudio(p.audio);

    const [transcript, thumbnailBuf] = await Promise.all([
      transcribe(p.audio),
      existsSync(p.thumbnail)
        ? readFile(p.thumbnail).catch(() => null)
        : Promise.resolve(null),
    ]);

    let r2Key: string | undefined;
    if (thumbnailBuf) {
      try {
        r2Key = `thumbnails/${item.id}.jpg`;
        await uploadFile(r2Key, thumbnailBuf, 'image/jpeg');
      } catch (err) {
        console.warn(`[video] thumbnail upload failed: ${err instanceof Error ? err.message : String(err)}`);
        r2Key = undefined;
      }
    }

    let structured;
    try {
      structured = await extractStructuredData(transcript || '[no transcript]');
    } catch (err) {
      if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
      throw err;
    }

    let vector: number[];
    try {
      vector = await generateEmbedding(`${structured.summary} ${structured.tags.join(' ')}`);
    } catch (err) {
      if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
      throw err;
    }

    const patch: Partial<ItemRecord> = {
      title: structured.title,
      summary: structured.summary,
      content: transcript.slice(0, 40_000),
      tags: structured.tags,
      category: structured.category,
      source_url: rawUrl,
      status: 'ready',
    };
    if (r2Key) patch.r2_key = r2Key;

    await updateItem(item.id, patch);
    await createEmbedding(item.id, vector);
  } finally {
    await cleanup(p);
  }
}
