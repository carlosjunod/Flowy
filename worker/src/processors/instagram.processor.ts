import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createEmbedding, type ItemRecord, type MediaSlide, type MediaSlideKind } from '../lib/pocketbase.js';
import { analyzeImage, extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import { ytdlpCookieArgs } from '../lib/ytdlp.js';
import { ytdlpPath } from '../lib/binaries.js';
import { transcribeMediaUrl } from '../lib/transcription.js';
import { ProcessorError } from './url.processor.js';

const execFileP = promisify(execFile);

// Per-phase diagnostic logs are noisy for normal dev. Opt-in via DEBUG_INSTAGRAM=1.
// Warnings/errors always log regardless.
const DEBUG = process.env.DEBUG_INSTAGRAM === '1';
const MEDIA_FETCH_TIMEOUT_MS = 20_000;

const INSTAGRAM_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/reels\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/stories\//,
];

export const MAX_SLIDES = 10;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export function isInstagramUrl(url: string): boolean {
  return INSTAGRAM_PATTERNS.some((r) => r.test(url));
}

interface YtDlpEntry {
  url?: string;
  ext?: string;
  thumbnail?: string;
  webpage_url?: string;
  vcodec?: string;
  acodec?: string;
  _type?: string;
  timestamp?: number;
  upload_date?: string;
  duration?: number;
}

interface YtDlpDump extends YtDlpEntry {
  entries?: YtDlpEntry[];
}

function ytDlpEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: [process.env.PATH ?? '', '/opt/homebrew/bin', '/usr/local/bin']
      .filter(Boolean)
      .join(':'),
  };
}

async function dumpMetadata(url: string): Promise<YtDlpEntry[]> {
  try {
    const { stdout } = await execFileP(
      ytdlpPath(),
      [...ytdlpCookieArgs(), '--yes-playlist', '--dump-single-json', '--no-warnings', url],
      { timeout: 60_000, maxBuffer: 32 * 1024 * 1024, env: ytDlpEnv() },
    );
    const parsed = JSON.parse(stdout) as YtDlpDump;
    if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
      return parsed.entries;
    }
    if (parsed.url || parsed.thumbnail) return [parsed];
    return [];
  } catch (err) {
    // Capture every signal the runtime gives us. yt-dlp on a stale Railway
    // image was failing here with empty stderr, so falling back to one channel
    // hid the cause. Pull stderr + stdout + exit code + signal + message into
    // one string so the next failure tells the full story.
    const e = (err ?? {}) as {
      stderr?: unknown;
      stdout?: unknown;
      code?: unknown;
      signal?: unknown;
      killed?: unknown;
      message?: unknown;
    };
    const stderr = typeof e.stderr === 'string' ? e.stderr : '';
    const stdout = typeof e.stdout === 'string' ? e.stdout : '';
    const exitCode = e.code === undefined ? 'unknown' : String(e.code);
    const signal = e.signal ? ` signal=${String(e.signal)}` : '';
    const killed = e.killed ? ' killed=true' : '';
    const baseMsg = err instanceof Error ? err.message : '';
    const detail = (
      stderr.trim() ||
      baseMsg ||
      `exit=${exitCode}${signal}${killed} stdout=${stdout.slice(0, 200).trim()}`
    ).slice(0, 500);
    const lower = detail.toLowerCase();
    console.warn(
      `[instagram:dumpMetadata] yt-dlp failed url=${url.slice(0, 80)} exit=${exitCode}${signal}${killed} stderr.len=${stderr.length} stdout.len=${stdout.length}`,
    );
    if (lower.includes('private')) throw new ProcessorError('PRIVATE_PROFILE', detail);
    if (lower.includes('login required') || lower.includes('login_required')) {
      throw new ProcessorError('LOGIN_REQUIRED', detail);
    }
    if (err instanceof SyntaxError) throw new ProcessorError('METADATA_PARSE_FAILED', err.message);
    throw new ProcessorError('DOWNLOAD_FAILED', detail);
  }
}

function detectKind(entry: YtDlpEntry): MediaSlideKind {
  if (entry.vcodec && entry.vcodec !== 'none') return 'video';
  if (entry.ext && /^(mp4|mov|webm|mkv|m4v)$/i.test(entry.ext)) return 'video';
  if (entry.acodec && entry.acodec !== 'none') return 'video';
  return 'image';
}

function sniffMediaType(buffer: Buffer): ImageMediaType {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function extFromMediaType(mt: ImageMediaType): string {
  const suffix = mt.split('/')[1];
  return suffix === 'jpeg' ? 'jpg' : suffix ?? 'jpg';
}

async function fetchMedia(url: string): Promise<Buffer> {
  const startedAt = Date.now();
  if (DEBUG) console.log(`[instagram:fetchMedia] start ${url.slice(0, 120)}`);
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(MEDIA_FETCH_TIMEOUT_MS) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[instagram:fetchMedia] threw after ${Date.now() - startedAt}ms: ${msg}`);
    throw new ProcessorError('MEDIA_FETCH_FAILED', msg);
  }
  if (DEBUG) console.log(`[instagram:fetchMedia] headers ${res.status} after ${Date.now() - startedAt}ms`);
  if (!res.ok) throw new ProcessorError('MEDIA_FETCH_FAILED', `${res.status} ${url.slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (DEBUG) console.log(`[instagram:fetchMedia] body ${buf.length}B after ${Date.now() - startedAt}ms`);
  if (buf.length === 0) throw new ProcessorError('MEDIA_FETCH_FAILED', 'empty response body');
  return buf;
}

interface SlideProbe {
  kind: MediaSlideKind;
  buffer: Buffer;
  mediaType: ImageMediaType;
  sourceUrl: string;
}

async function fetchSlide(entry: YtDlpEntry, index: number): Promise<SlideProbe | null> {
  const kind = detectKind(entry);
  // For video slides we analyze the poster/thumbnail; for image slides the direct URL is already an image.
  const primary = kind === 'video' ? entry.thumbnail : entry.url;
  const fallback = kind === 'video' ? entry.url : entry.thumbnail;
  const candidates = [primary, fallback].filter((u): u is string => typeof u === 'string' && u.length > 0);
  if (candidates.length === 0) return null;

  for (const url of candidates) {
    try {
      const buffer = await fetchMedia(url);
      const mediaType = sniffMediaType(buffer);
      return { kind, buffer, mediaType, sourceUrl: url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[instagram] slide ${index} candidate fetch failed: ${msg}`);
    }
  }
  return null;
}

function composeContent(slides: MediaSlide[]): string {
  return slides
    .map((s) => {
      const lines = [`Slide ${s.index + 1} (${s.kind})`];
      if (s.summary) lines.push(`Visual summary: ${s.summary}`);
      if (s.extracted_text) lines.push(`On-screen text: ${s.extracted_text}`);
      if (s.transcript) lines.push(`Spoken audio: ${s.transcript}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

function toIsoTimestamp(epochSec?: number): string | undefined {
  if (typeof epochSec !== 'number' || !Number.isFinite(epochSec) || epochSec <= 0) return undefined;
  try {
    return new Date(epochSec * 1000).toISOString();
  } catch {
    return undefined;
  }
}

export async function processInstagram(item: ItemRecord): Promise<void> {
  const t0 = Date.now();
  const log = DEBUG
    ? (phase: string, extra = '') =>
        console.log(`[instagram:${item.id}] +${Date.now() - t0}ms ${phase}${extra ? ' ' + extra : ''}`)
    : (_phase: string, _extra?: string) => {};

  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isInstagramUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_INSTAGRAM_URL', rawUrl);

  log('dumpMetadata:start', rawUrl.slice(0, 80));
  const entries = await dumpMetadata(rawUrl);
  log('dumpMetadata:done', `entries=${entries.length}`);
  if (entries.length === 0) throw new ProcessorError('EMPTY_CAROUSEL', 'no slides found');

  const limited = entries.slice(0, MAX_SLIDES);
  const slides: MediaSlide[] = [];

  for (let i = 0; i < limited.length; i++) {
    const entry = limited[i]!;
    log(`slide[${i}]:fetch:start`, `kind=${detectKind(entry)} hasUrl=${!!entry.url} hasThumb=${!!entry.thumbnail}`);
    const probe = await fetchSlide(entry, i);
    if (!probe) {
      log(`slide[${i}]:fetch:skipped`, 'no candidate succeeded');
      continue;
    }
    log(`slide[${i}]:fetch:done`, `bytes=${probe.buffer.length} mt=${probe.mediaType}`);

    const r2Key = `instagram/${item.id}/${i}.${extFromMediaType(probe.mediaType)}`;
    log(`slide[${i}]:upload:start`, r2Key);
    try {
      await uploadFile(r2Key, probe.buffer, probe.mediaType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProcessorError('R2_UPLOAD_FAILED', msg);
    }
    log(`slide[${i}]:upload:done`);

    let summary: string | undefined;
    let extractedText: string | undefined;
    log(`slide[${i}]:vision:start`);
    try {
      const vision = await analyzeImage({
        mediaType: probe.mediaType,
        data: probe.buffer.toString('base64'),
      });
      summary = vision.summary;
      extractedText = vision.extracted_text;
      log(`slide[${i}]:vision:done`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[instagram] slide ${i} vision failed: ${msg}`);
    }

    let transcript: string | undefined;
    if (probe.kind === 'video') {
      // yt-dlp entries for Instagram stories leave `entry.url` null and set
      // `webpage_url` to the parent carousel — per-slide URLs are only
      // addressable via --playlist-items N against the original URL. Use that
      // regardless of carousel shape (reels with N=1 work identically).
      log(`slide[${i}]:transcription:start`);
      try {
        const result = await transcribeMediaUrl({
          url: rawUrl,
          tmpPrefix: `tryflowy-${item.id}-slide${i}`,
          playlistIndex: i + 1,
        });
        transcript = result.transcript;
        log(`slide[${i}]:transcription:done`, `chars=${transcript.length}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[instagram] slide ${i} transcription failed: ${msg}`);
      }
    }

    slides.push({
      index: i,
      kind: probe.kind,
      r2_key: r2Key,
      source_url: entry.webpage_url ?? entry.url,
      summary,
      extracted_text: extractedText,
      transcript,
      taken_at: toIsoTimestamp(entry.timestamp),
    });
  }

  if (slides.length === 0) throw new ProcessorError('ALL_SLIDES_FAILED', 'no slides could be processed');

  const joined = composeContent(slides);

  log('extractStructured:start', `chars=${joined.length}`);
  let structured;
  try {
    structured = await extractStructuredData(joined);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }
  log('extractStructured:done');

  log('embedding:start');
  let vector: number[];
  try {
    vector = await generateEmbedding(`${structured.summary} ${structured.tags.join(' ')}`);
  } catch (err) {
    if (err instanceof ClaudeError) throw new ProcessorError(err.code, err.message);
    throw err;
  }
  log('embedding:done', `dims=${vector.length}`);

  log('finalize:start');
  await finalizeItem(item.id, {
    title: structured.title,
    summary: structured.summary,
    content: joined.slice(0, 40_000),
    tags: structured.tags,
    category: structured.category,
    source_url: rawUrl,
    r2_key: slides[0]!.r2_key,
    media: slides,
  });
  log('finalize:done');

  log('createEmbedding:start');
  await createEmbedding(item.id, vector);
  log('createEmbedding:done');
}
