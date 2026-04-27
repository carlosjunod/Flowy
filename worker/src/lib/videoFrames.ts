import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import 'dotenv/config';

import { ytdlpCookieArgs } from './ytdlp.js';

const execFileP = promisify(execFile);

export class VideoFramesError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'VideoFramesError';
  }
}

export interface SampledFrame {
  buffer: Buffer;
  mediaType: 'image/jpeg';
}

export interface SampleVideoFramesOptions {
  url: string;
  count?: number;
  prefix?: string;
}

const DEFAULT_FRAME_COUNT = 4;
const MAX_FRAMES = 8;
const DOWNLOAD_TIMEOUT_MS = 90_000;
const FFMPEG_TIMEOUT_MS = 30_000;
const FFPROBE_TIMEOUT_MS = 10_000;

function ytdlpPath(): string {
  return process.env.YTDLP_PATH ?? 'yt-dlp';
}

function ffmpegPath(): string {
  return process.env.FFMPEG_PATH ?? 'ffmpeg';
}

function ffprobePath(): string {
  return process.env.FFPROBE_PATH ?? 'ffprobe';
}

function homebrewEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin']
      .filter(Boolean)
      .join(':'),
  };
}

async function downloadLowQualityVideo(url: string, outTemplate: string): Promise<string> {
  const args = [
    ...ytdlpCookieArgs(),
    '--no-playlist',
    '-f', 'worst[height>=240]/worst',
    '-o', outTemplate,
    url,
  ];
  try {
    await execFileP(ytdlpPath(), args, {
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      env: homebrewEnv(),
    });
  } catch (err) {
    const detail = err && typeof err === 'object' && 'stderr' in err
      ? String((err as { stderr?: unknown }).stderr ?? '')
      : err instanceof Error ? err.message : String(err);
    throw new VideoFramesError('VIDEO_DOWNLOAD_FAILED', detail.slice(0, 500));
  }
  // yt-dlp picks the extension; find the file matching the template prefix.
  const dir = outTemplate.substring(0, outTemplate.lastIndexOf('/'));
  const base = outTemplate.substring(outTemplate.lastIndexOf('/') + 1).replace('.%(ext)s', '');
  const files = await readdir(dir);
  const match = files.find((f) => f.startsWith(`${base}.`) && !f.endsWith('.part'));
  if (!match) throw new VideoFramesError('VIDEO_DOWNLOAD_FAILED', 'no output file found');
  return join(dir, match);
}

async function probeDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execFileP(
      ffprobePath(),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      { timeout: FFPROBE_TIMEOUT_MS, env: homebrewEnv() },
    );
    const dur = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(dur) || dur <= 0) return 0;
    return dur;
  } catch {
    return 0;
  }
}

async function extractFrames(videoPath: string, count: number, outDir: string): Promise<string[]> {
  const duration = await probeDuration(videoPath);
  const safeCount = Math.max(1, Math.min(count, MAX_FRAMES));
  // Sample at evenly spaced offsets, skipping the very first second to avoid
  // black intros and the last second to avoid end cards.
  const offsets: number[] = [];
  if (duration > 2) {
    const span = duration - 2;
    for (let i = 0; i < safeCount; i++) {
      offsets.push(1 + (span * (i + 0.5)) / safeCount);
    }
  } else {
    // Short clip: just grab the first frame.
    offsets.push(0);
  }

  const files: string[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const out = join(outDir, `frame_${i}.jpg`);
    try {
      await execFileP(
        ffmpegPath(),
        ['-y', '-ss', String(offsets[i]), '-i', videoPath, '-frames:v', '1', '-q:v', '4', '-vf', 'scale=720:-2', out],
        { timeout: FFMPEG_TIMEOUT_MS, env: homebrewEnv() },
      );
      files.push(out);
    } catch {
      // ignore individual frame failures; we'll use whatever we got.
    }
  }
  if (files.length === 0) throw new VideoFramesError('FRAME_EXTRACT_FAILED', 'no frames extracted');
  return files;
}

export async function sampleVideoFrames(opts: SampleVideoFramesOptions): Promise<SampledFrame[]> {
  const { url } = opts;
  const count = opts.count ?? DEFAULT_FRAME_COUNT;
  const prefix = opts.prefix ?? 'flowy-frames-';
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    const template = join(dir, 'video.%(ext)s');
    const videoPath = await downloadLowQualityVideo(url, template);
    const framePaths = await extractFrames(videoPath, count, dir);
    const buffers = await Promise.all(framePaths.map((p) => readFile(p)));
    return buffers.map((buffer) => ({ buffer, mediaType: 'image/jpeg' as const }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
