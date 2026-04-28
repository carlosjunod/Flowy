import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import 'dotenv/config';

import { createEmbedding, type ItemRecord, type MediaSlide } from '../lib/pocketbase.js';
import { extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import { ffmpegPath } from '../lib/binaries.js';
import { ProcessorError } from './url.processor.js';

const execFileP = promisify(execFile);
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

type VideoMime = 'video/mp4' | 'video/quicktime' | 'video/webm';

function normalizeMime(raw: string | undefined): VideoMime {
  const m = (raw ?? '').toLowerCase();
  if (m.includes('quicktime') || m.includes('mov')) return 'video/quicktime';
  if (m.includes('webm')) return 'video/webm';
  return 'video/mp4';
}

function extFor(mime: VideoMime): string {
  if (mime === 'video/quicktime') return 'mov';
  if (mime === 'video/webm') return 'webm';
  return 'mp4';
}

function stripDataUrl(input: string): string {
  const comma = input.indexOf(',');
  if (input.startsWith('data:') && comma !== -1) return input.slice(comma + 1);
  return input;
}

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY ?? '';
  if (!key) throw new ProcessorError('OPENAI_KEY_MISSING', 'OPENAI_API_KEY required for screen recording transcription');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

function ffmpegEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':'),
  };
}

async function extractAudio(videoPath: string, audioPath: string): Promise<boolean> {
  try {
    await execFileP(
      ffmpegPath(),
      ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-q:a', '4', audioPath],
      { timeout: 120_000, env: ffmpegEnv() },
    );
    return existsSync(audioPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[screen_recording] audio extract failed: ${msg}`);
    return false;
  }
}

async function extractPoster(videoPath: string, posterPath: string): Promise<boolean> {
  try {
    await execFileP(
      ffmpegPath(),
      ['-y', '-i', videoPath, '-ss', '00:00:01', '-frames:v', '1', '-q:v', '3', posterPath],
      { timeout: 30_000, env: ffmpegEnv() },
    );
    return existsSync(posterPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[screen_recording] poster extract failed: ${msg}`);
    return false;
  }
}

async function transcribe(audioPath: string): Promise<string> {
  const info = await stat(audioPath);
  if (info.size > WHISPER_MAX_BYTES) {
    console.warn(`[screen_recording] audio ${info.size} bytes exceeds whisper limit — skipping`);
    return '';
  }
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
    return '';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[screen_recording] transcription failed: ${msg}`);
    return '';
  }
}

export async function processScreenRecording(
  item: ItemRecord,
  rawVideoBase64: string,
  rawMime: string | undefined,
): Promise<void> {
  if (!rawVideoBase64) throw new ProcessorError('MISSING_VIDEO');
  const mime = normalizeMime(rawMime);
  const ext = extFor(mime);

  const clean = stripDataUrl(rawVideoBase64);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(clean, 'base64');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('INVALID_VIDEO', msg);
  }
  if (buffer.length === 0) throw new ProcessorError('INVALID_VIDEO', 'empty buffer');

  const videoKey = `screen_recordings/${item.id}.${ext}`;
  try {
    await uploadFile(videoKey, buffer, mime);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('R2_UPLOAD_FAILED', msg);
  }

  const base = join(tmpdir(), `tryflowy-sr-${item.id}`);
  const videoPath = `${base}.${ext}`;
  const audioPath = `${base}.mp3`;
  const posterPath = `${base}.jpg`;

  let transcript = '';
  let posterKey: string | undefined;

  try {
    await writeFile(videoPath, buffer);

    const [hasAudio, hasPoster] = await Promise.all([
      extractAudio(videoPath, audioPath),
      extractPoster(videoPath, posterPath),
    ]);

    if (hasAudio) {
      transcript = await transcribe(audioPath);
    }

    if (hasPoster) {
      try {
        const { readFile } = await import('node:fs/promises');
        const posterBuf = await readFile(posterPath);
        posterKey = `screen_recordings/${item.id}.jpg`;
        await uploadFile(posterKey, posterBuf, 'image/jpeg');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[screen_recording] poster upload failed: ${msg}`);
        posterKey = undefined;
      }
    }
  } finally {
    await Promise.allSettled([
      rm(videoPath, { force: true }),
      rm(audioPath, { force: true }),
      rm(posterPath, { force: true }),
    ]);
  }

  let structured;
  try {
    structured = await extractStructuredData(transcript || '[screen recording with no audio]');
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  let vector: number[];
  try {
    vector = await generateEmbedding(`${structured.title} ${structured.summary} ${transcript}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  const media: MediaSlide[] = [
    {
      index: 0,
      kind: 'video',
      r2_key: videoKey,
      extracted_text: transcript || undefined,
    },
  ];

  await finalizeItem(item.id, {
    title: structured.title,
    summary: structured.summary,
    content: transcript.slice(0, 40_000),
    tags: structured.tags,
    category: structured.category,
    r2_key: posterKey ?? videoKey,
    media,
  });

  await createEmbedding(item.id, vector);
}
