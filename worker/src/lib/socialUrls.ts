const PINTEREST_PATTERNS = [
  /^https?:\/\/(?:www\.|[a-z]{2}\.)?pinterest\.(?:com|co\.uk|ca|fr|de|es|it|jp|mx|pt|nz|com\.au)\/pin\//i,
  /^https?:\/\/pin\.it\//i,
];

const DRIBBBLE_PATTERNS = [
  /^https?:\/\/(?:www\.)?dribbble\.com\/shots\//i,
];

const LINKEDIN_PATTERNS = [
  /^https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/posts\//i,
  /^https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/pulse\//i,
  /^https?:\/\/(?:www\.|[a-z]{2}\.)?linkedin\.com\/feed\/update\//i,
  /^https?:\/\/lnkd\.in\//i,
];

const TWITTER_PATTERNS = [
  /^https?:\/\/(?:www\.|mobile\.)?twitter\.com\/[^/]+\/status\/\d+/i,
  /^https?:\/\/(?:www\.|mobile\.)?x\.com\/[^/]+\/status\/\d+/i,
  /^https?:\/\/t\.co\//i,
];

export function isPinterestUrl(url: string): boolean {
  return PINTEREST_PATTERNS.some((r) => r.test(url));
}

export function isDribbbleUrl(url: string): boolean {
  return DRIBBBLE_PATTERNS.some((r) => r.test(url));
}

export function isLinkedinUrl(url: string): boolean {
  return LINKEDIN_PATTERNS.some((r) => r.test(url));
}

export function isTwitterUrl(url: string): boolean {
  return TWITTER_PATTERNS.some((r) => r.test(url));
}

export function extractTweetId(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m ? (m[1] ?? null) : null;
}
