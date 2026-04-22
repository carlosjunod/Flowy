import type { ItemType } from '@/types';

const INSTAGRAM_POST_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
];

export function isInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_PATTERNS.some((r) => r.test(url));
}

const REDDIT_POST_PATTERNS = [
  /^https?:\/\/(?:www\.|old\.|new\.|np\.|i\.)?reddit\.com\/r\/[^/]+\/comments\//i,
  /^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/s\//i,
  /^https?:\/\/(?:www\.)?redd\.it\//i,
];

export function isRedditPostUrl(url: string): boolean {
  return REDDIT_POST_PATTERNS.some((r) => r.test(url));
}

const YOUTUBE_PATTERNS = [
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?/i,
  /^https?:\/\/(?:www\.)?youtu\.be\//i,
  /^https?:\/\/(?:www\.|m\.)?youtube\.com\/shorts\//i,
];

export function isYoutubeUrl(url: string): boolean {
  return YOUTUBE_PATTERNS.some((r) => r.test(url));
}

/**
 * Coerce the generic `url` item type to a platform-specific processor type
 * when the URL pattern matches. Used by both single-ingest and bulk-ingest so
 * bookmarks of e.g. a Reddit thread end up with the right processor.
 */
export function coerceTypeFromUrl(url: string): ItemType {
  if (isInstagramPostUrl(url)) return 'instagram';
  if (isRedditPostUrl(url)) return 'reddit';
  if (isYoutubeUrl(url)) return 'youtube';
  return 'url';
}
