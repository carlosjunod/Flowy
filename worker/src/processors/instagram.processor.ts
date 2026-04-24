import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createEmbedding, type ItemRecord, type MediaSlide, type MediaSlideKind } from '../lib/pocketbase.js';
import { analyzeImage, extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import { ytdlpCookieArgs } from '../lib/ytdlp.js';
import { ProcessorError } from './url.processor.js';

const execFileP = promisify(execFile);

const INSTAGRAM_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/reels\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
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
  const ytdlpPath = process.env.YTDLP_PATH ?? 'yt-dlp';
  try {
    const { stdout } = await execFileP(
      ytdlpPath,
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
    const detail =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: unknown }).stderr ?? '')
        : err instanceof Error
          ? err.message
          : String(err);
    const lower = detail.toLowerCase();
    if (lower.includes('private')) throw new ProcessorError('PRIVATE_PROFILE', detail.slice(0, 500));
    if (lower.includes('login required') || lower.includes('login_required')) {
      throw new ProcessorError('LOGIN_REQUIRED', detail.slice(0, 500));
    }
    if (err instanceof SyntaxError) throw new ProcessorError('METADATA_PARSE_FAILED', err.message);
    throw new ProcessorError('DOWNLOAD_FAILED', detail.slice(0, 500));
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
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('MEDIA_FETCH_FAILED', msg);
  }
  if (!res.ok) throw new ProcessorError('MEDIA_FETCH_FAILED', `${res.status} ${url.slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
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
      const parts = [`Slide ${s.index + 1} (${s.kind})`];
      if (s.summary) parts.push(s.summary);
      if (s.extracted_text) parts.push(`Text: ${s.extracted_text}`);
      return parts.join(' — ');
    })
    .join('\n\n');
}

export async function processInstagram(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isInstagramUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_INSTAGRAM_URL', rawUrl);

  const entries = await dumpMetadata(rawUrl);
  if (entries.length === 0) throw new ProcessorError('EMPTY_CAROUSEL', 'no slides found');

  const limited = entries.slice(0, MAX_SLIDES);
  const slides: MediaSlide[] = [];

  for (let i = 0; i < limited.length; i++) {
    const entry = limited[i]!;
    const probe = await fetchSlide(entry, i);
    if (!probe) continue;

    const r2Key = `instagram/${item.id}/${i}.${extFromMediaType(probe.mediaType)}`;
    try {
      await uploadFile(r2Key, probe.buffer, probe.mediaType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ProcessorError('R2_UPLOAD_FAILED', msg);
    }

    let summary: string | undefined;
    let extractedText: string | undefined;
    try {
      const vision = await analyzeImage({
        mediaType: probe.mediaType,
        data: probe.buffer.toString('base64'),
      });
      summary = vision.summary;
      extractedText = vision.extracted_text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[instagram] slide ${i} vision failed: ${msg}`);
    }

    slides.push({
      index: i,
      kind: probe.kind,
      r2_key: r2Key,
      source_url: entry.webpage_url ?? entry.url,
      summary,
      extracted_text: extractedText,
    });
  }

  if (slides.length === 0) throw new ProcessorError('ALL_SLIDES_FAILED', 'no slides could be processed');

  const joined = composeContent(slides);

  let structured;
  try {
    structured = await extractStructuredData(joined);
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

  await createEmbedding(item.id, vector);
}
