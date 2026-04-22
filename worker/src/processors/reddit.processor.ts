import { extract } from '@extractus/article-extractor';

import {
  createEmbedding,
  type ItemRecord,
  type MediaSlide,
  type MediaSlideKind,
} from '../lib/pocketbase.js';
import { analyzeImage, extractStructuredData, generateEmbedding, ClaudeError } from '../lib/claude.js';
import { uploadFile } from '../lib/storage.js';
import { finalizeItem } from '../lib/finalize.js';
import {
  redditFetch,
  resolveRedditPermalink,
  extractCommentId,
  RedditError,
  isRedditUrl,
} from '../lib/reddit.js';
import { ProcessorError } from './url.processor.js';

export { isRedditUrl };

export const MAX_GALLERY = 10;
const MAX_COMMENTS = 5;
const COMMENT_BODY_CAP = 500;
const CONTENT_CAP = 40_000;

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

type RedditKind = 'self' | 'link' | 'image' | 'gallery' | 'video' | 'unknown';

interface RawRedditPost {
  title?: string;
  author?: string;
  subreddit?: string;
  permalink?: string;
  selftext?: string;
  url?: string;
  url_overridden_by_dest?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  over_18?: boolean;
  is_self?: boolean;
  is_gallery?: boolean;
  is_video?: boolean;
  post_hint?: string;
  domain?: string;
  removed_by_category?: string | null;
  gallery_data?: { items?: Array<{ media_id?: string }> };
  media_metadata?: Record<
    string,
    { m?: string; s?: { u?: string; gif?: string }; status?: string }
  >;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  media?: {
    reddit_video?: { fallback_url?: string; is_gif?: boolean; duration?: number };
  };
  crosspost_parent_list?: RawRedditPost[];
}

interface RawListingChild<T> {
  kind: string;
  data: T;
}

interface RawListing<T> {
  kind: 'Listing';
  data: { children: RawListingChild<T>[] };
}

interface RawComment {
  author?: string;
  body?: string;
  score?: number;
  stickied?: boolean;
}

interface RedditComment {
  author: string;
  body: string;
  score: number;
}

// ---------- media helpers (duplicated from instagram.processor.ts on purpose) ----------

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

function decodeEntities(u: string): string {
  return u.replace(/&amp;/g, '&');
}

async function fetchImage(url: string): Promise<Buffer> {
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

// ---------- classification ----------

function classifyPost(post: RawRedditPost): RedditKind {
  if (post.is_self) return 'self';
  if (post.is_gallery && post.gallery_data?.items?.length) return 'gallery';
  if (post.is_video || post.post_hint === 'hosted:video') return 'video';
  if (post.post_hint === 'image') return 'image';
  if (post.domain === 'i.redd.it' || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(post.url ?? '')) {
    return 'image';
  }
  if (post.url_overridden_by_dest || post.url) return 'link';
  return 'unknown';
}

function pickPost(raw: RawRedditPost): RawRedditPost {
  const cp = raw.crosspost_parent_list?.[0];
  if (cp) return cp;
  return raw;
}

function isRemoved(post: RawRedditPost): boolean {
  if (post.removed_by_category) return true;
  if (post.author === '[deleted]') return true;
  const st = post.selftext;
  if (typeof st === 'string' && (st === '[removed]' || st === '[deleted]')) return true;
  return false;
}

// ---------- composition ----------

function header(post: RawRedditPost): string {
  const sub = post.subreddit ?? '?';
  const author = post.author ?? '[deleted]';
  const score = post.score ?? 0;
  const comments = post.num_comments ?? 0;
  return `r/${sub} · u/${author} · ⬆ ${score} · 💬 ${comments}`;
}

function composeContent(
  post: RawRedditPost,
  body: string,
  comments: RedditComment[],
): string {
  const parts = [header(post), '', post.title ?? '', '', body.trim()];
  if (comments.length > 0) {
    parts.push('', '--- Top Comments ---');
    parts.push(
      comments
        .map((c) => `u/${c.author} (⬆${c.score}): ${c.body}`)
        .join('\n\n'),
    );
  }
  return parts.filter((p) => p !== undefined).join('\n');
}

// ---------- per-kind handlers ----------

interface LinkExtras {
  og_image?: string;
  og_description?: string;
  site_name?: string;
}

async function handleLink(post: RawRedditPost): Promise<{ body: string; extras: LinkExtras }> {
  const target = post.url_overridden_by_dest ?? post.url;
  if (!target) return { body: post.title ?? '', extras: {} };
  try {
    const scraped = await extract(target);
    if (scraped && scraped.content) {
      const plain = stripHtml(scraped.content).trim();
      return {
        body: plain.slice(0, 20_000),
        extras: {
          og_image: scraped.image ?? '',
          og_description: scraped.description?.slice(0, 500) ?? '',
          site_name: scraped.source?.slice(0, 100) ?? '',
        },
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reddit] external link extract failed: ${msg}`);
  }
  const previewImage = post.preview?.images?.[0]?.source?.url;
  return {
    body: `Link: ${target}`,
    extras: previewImage ? { og_image: decodeEntities(previewImage) } : {},
  };
}

async function handleImage(
  itemId: string,
  post: RawRedditPost,
): Promise<MediaSlide[]> {
  const src = post.url_overridden_by_dest ?? post.url;
  if (!src) return [];
  const buf = await fetchImage(src);
  const mediaType = sniffMediaType(buf);
  const r2Key = `reddit/${itemId}/0.${extFromMediaType(mediaType)}`;
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
    console.warn(`[reddit] vision failed: ${msg}`);
  }
  return [
    {
      index: 0,
      kind: 'image',
      r2_key: r2Key,
      source_url: src,
      summary,
      extracted_text: extractedText,
    },
  ];
}

async function handleGallery(
  itemId: string,
  post: RawRedditPost,
): Promise<MediaSlide[]> {
  const items = post.gallery_data?.items ?? [];
  const metadata = post.media_metadata ?? {};
  const slides: MediaSlide[] = [];

  const limited = items.slice(0, MAX_GALLERY);
  for (let i = 0; i < limited.length; i++) {
    const mediaId = limited[i]?.media_id;
    if (!mediaId) continue;
    const meta = metadata[mediaId];
    if (!meta) continue;
    const rawUrl = meta.s?.gif ?? meta.s?.u;
    if (!rawUrl) continue;
    const srcUrl = decodeEntities(rawUrl);

    let buf: Buffer;
    try {
      buf = await fetchImage(srcUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[reddit] gallery item ${i} fetch failed: ${msg}`);
      continue;
    }

    const mediaType: ImageMediaType = meta.m === 'image/gif'
      ? 'image/gif'
      : meta.m === 'image/png'
      ? 'image/png'
      : meta.m === 'image/webp'
      ? 'image/webp'
      : sniffMediaType(buf);
    const r2Key = `reddit/${itemId}/${i}.${extFromMediaType(mediaType)}`;

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
      console.warn(`[reddit] gallery ${i} vision failed: ${msg}`);
    }

    slides.push({
      index: i,
      kind: 'image',
      r2_key: r2Key,
      source_url: srcUrl,
      summary,
      extracted_text: extractedText,
    });
  }

  return slides;
}

async function handleVideoPreview(
  itemId: string,
  post: RawRedditPost,
): Promise<MediaSlide[]> {
  // v1: just grab the preview thumbnail. v2 will route to processVideo for full
  // yt-dlp + Whisper transcription — yt-dlp already supports v.redd.it natively.
  const preview = post.preview?.images?.[0]?.source?.url;
  if (!preview) return [];
  const src = decodeEntities(preview);
  let buf: Buffer;
  try {
    buf = await fetchImage(src);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[reddit] video preview fetch failed: ${msg}`);
    return [];
  }
  const mediaType = sniffMediaType(buf);
  const r2Key = `reddit/${itemId}/0.${extFromMediaType(mediaType)}`;
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
    console.warn(`[reddit] video preview vision failed: ${msg}`);
  }
  return [
    {
      index: 0,
      kind: 'video' satisfies MediaSlideKind,
      r2_key: r2Key,
      source_url: post.media?.reddit_video?.fallback_url ?? src,
      summary,
      extracted_text: extractedText,
    },
  ];
}

function pickTopComments(listing: RawListing<RawComment> | undefined): RedditComment[] {
  if (!listing) return [];
  const out: RedditComment[] = [];
  for (const child of listing.data.children) {
    if (child.kind !== 't1') continue;
    const c = child.data;
    if (c.stickied) continue;
    const body = typeof c.body === 'string' ? c.body : '';
    if (!body || body === '[deleted]' || body === '[removed]') continue;
    out.push({
      author: c.author ?? '[deleted]',
      body: body.slice(0, COMMENT_BODY_CAP),
      score: typeof c.score === 'number' ? c.score : 0,
    });
    if (out.length >= MAX_COMMENTS) break;
  }
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- entry point ----------

export async function processReddit(item: ItemRecord): Promise<void> {
  const rawUrl = item.raw_url;
  if (!rawUrl) throw new ProcessorError('MISSING_URL');
  if (!isRedditUrl(rawUrl)) throw new ProcessorError('UNSUPPORTED_REDDIT_URL', rawUrl);

  let permalink: string;
  try {
    permalink = await resolveRedditPermalink(rawUrl);
  } catch (err) {
    if (err instanceof RedditError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  const commentId = extractCommentId(permalink);
  if (!commentId) throw new ProcessorError('INVALID_REDDIT_URL', `no comment id in ${permalink}`);

  let payload: unknown;
  try {
    const res = await redditFetch(`/comments/${commentId}?raw_json=1&limit=${MAX_COMMENTS}&depth=1`);
    payload = await res.json();
  } catch (err) {
    if (err instanceof RedditError) throw new ProcessorError(err.code, err.message);
    throw err;
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new ProcessorError('REDDIT_PARSE_FAILED', 'unexpected response shape');
  }

  const postListing = payload[0] as RawListing<RawRedditPost>;
  const commentsListing = payload[1] as RawListing<RawComment> | undefined;
  const rawPost = postListing?.data?.children?.[0]?.data;
  if (!rawPost) throw new ProcessorError('REDDIT_PARSE_FAILED', 'no post in listing');

  const post = pickPost(rawPost);

  if (isRemoved(post)) {
    throw new ProcessorError('REMOVED_POST', 'post is removed or deleted');
  }

  const comments = pickTopComments(commentsListing);
  const kind = classifyPost(post);

  let body = '';
  let extras: LinkExtras = {};
  let slides: MediaSlide[] = [];

  switch (kind) {
    case 'self':
      body = (post.selftext ?? '').trim();
      break;
    case 'link': {
      const res = await handleLink(post);
      body = res.body;
      extras = res.extras;
      break;
    }
    case 'image':
      slides = await handleImage(item.id, post);
      body = slides[0]?.summary ?? `Image: ${post.url_overridden_by_dest ?? post.url ?? ''}`;
      break;
    case 'gallery':
      slides = await handleGallery(item.id, post);
      if (slides.length === 0) {
        throw new ProcessorError('ALL_SLIDES_FAILED', 'no gallery items could be fetched');
      }
      body = slides
        .map((s) => {
          const segs = [`Slide ${s.index + 1}`];
          if (s.summary) segs.push(s.summary);
          if (s.extracted_text) segs.push(`Text: ${s.extracted_text}`);
          return segs.join(' — ');
        })
        .join('\n\n');
      break;
    case 'video':
      slides = await handleVideoPreview(item.id, post);
      body = slides[0]?.summary ?? 'Reddit-hosted video';
      break;
    default:
      body = post.title ?? '';
      break;
  }

  const content = composeContent(post, body, comments);

  let structured;
  try {
    structured = await extractStructuredData(content);
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
    title: structured.title || post.title || permalink,
    summary: structured.summary,
    content: content.slice(0, CONTENT_CAP),
    tags: structured.tags,
    category: structured.category,
    source_url: permalink,
    og_image: extras.og_image ?? '',
    og_description: extras.og_description ?? '',
    site_name: extras.site_name ?? (post.subreddit ? `r/${post.subreddit}` : ''),
    ...(slides.length > 0
      ? { media: slides, r2_key: slides[0]!.r2_key }
      : {}),
  });

  await createEmbedding(item.id, vector);
}
