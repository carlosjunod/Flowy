import { uploadFile } from './storage.js';
import { analyzeImage } from './claude.js';
import type { MediaSlide } from './pocketbase.js';
import { ProcessorError } from '../processors/url.processor.js';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/123.0 Safari/537.36';

function browserHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'user-agent': DEFAULT_UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    ...(extra ?? {}),
  };
}

export async function fetchHtml(url: string, extraHeaders?: Record<string, string>): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: browserHeaders(extraHeaders), redirect: 'follow' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('FETCH_FAILED', msg);
  }
  if (!res.ok) throw new ProcessorError('FETCH_FAILED', `${res.status} ${url.slice(0, 200)}`);
  return res.text();
}

export function sniffMediaType(buffer: Buffer): ImageMediaType {
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

export function extFromMediaType(mt: ImageMediaType): string {
  const suffix = mt.split('/')[1];
  return suffix === 'jpeg' ? 'jpg' : suffix ?? 'jpg';
}

export async function fetchImage(url: string, referer?: string): Promise<Buffer> {
  let res: Response;
  const headers: Record<string, string> = { 'user-agent': DEFAULT_UA };
  if (referer) headers.referer = referer;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('MEDIA_FETCH_FAILED', msg);
  }
  if (!res.ok) throw new ProcessorError('MEDIA_FETCH_FAILED', `${res.status} ${url.slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new ProcessorError('MEDIA_FETCH_FAILED', 'empty response body');
  return buf;
}

export interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  author?: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/g, ' ');
}

function matchMeta(html: string, keyAttr: string, keyValue: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+${keyAttr}=['"]${keyValue}['"][^>]*content=['"]([^'"]*)['"]`,
    'i',
  );
  const alt = new RegExp(
    `<meta[^>]+content=['"]([^'"]*)['"][^>]*${keyAttr}=['"]${keyValue}['"]`,
    'i',
  );
  const m = html.match(re) ?? html.match(alt);
  if (!m || !m[1]) return undefined;
  return decodeHtmlEntities(m[1]).trim() || undefined;
}

export function parseOgMetadata(html: string): OgMetadata {
  const og = (k: string): string | undefined => matchMeta(html, 'property', `og:${k}`);
  const tw = (k: string): string | undefined => matchMeta(html, 'name', `twitter:${k}`);
  const meta = (k: string): string | undefined => matchMeta(html, 'name', k);

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return {
    title: og('title') ?? tw('title') ?? (titleTag?.[1] ? decodeHtmlEntities(titleTag[1]).trim() : undefined),
    description: og('description') ?? tw('description') ?? meta('description'),
    image: og('image') ?? og('image:secure_url') ?? tw('image') ?? tw('image:src'),
    siteName: og('site_name'),
    author: meta('author') ?? og('article:author'),
  };
}

export interface HeroImageResult {
  slide: MediaSlide;
  summary?: string;
  extractedText?: string;
}

/**
 * Download a hero image, upload to R2 under `<prefix>/<itemId>/0.<ext>`, and run vision.
 * Returns a single-slide MediaSlide. Vision failures are logged but do not throw — callers
 * still get the slide so the source URL remains linked.
 */
export async function processHeroImage(
  itemId: string,
  prefix: string,
  imageUrl: string,
  sourceUrl: string,
  referer?: string,
): Promise<HeroImageResult> {
  const buf = await fetchImage(imageUrl, referer);
  const mediaType = sniffMediaType(buf);
  const r2Key = `${prefix}/${itemId}/0.${extFromMediaType(mediaType)}`;

  try {
    await uploadFile(r2Key, buf, mediaType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProcessorError('R2_UPLOAD_FAILED', msg);
  }

  let summary: string | undefined;
  let extractedText: string | undefined;
  try {
    const vision = await analyzeImage({ mediaType, data: buf.toString('base64') });
    summary = vision.summary;
    extractedText = vision.extracted_text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${prefix}] vision failed: ${msg}`);
  }

  return {
    slide: {
      index: 0,
      kind: 'image',
      r2_key: r2Key,
      source_url: imageUrl,
      summary,
      extracted_text: extractedText,
    },
    summary,
    extractedText,
  };
}

export function resolveImageUrl(imageUrl: string, pageUrl: string): string {
  try {
    return new URL(imageUrl, pageUrl).toString();
  } catch {
    return imageUrl;
  }
}
