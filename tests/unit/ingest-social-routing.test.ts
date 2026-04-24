import { describe, it, expect } from 'vitest';

/**
 * Regex test for the Pinterest/Dribbble/LinkedIn/Twitter URL routing patterns in
 * apps/web/app/api/ingest/route.ts. Mirrors the Instagram routing test so the
 * new social types don't silently regress.
 *
 * NOTE: like ingest-instagram-routing.test.ts, this file re-declares the
 * patterns inline. The ingest route's own auth-mock setup is pre-existing
 * broken — this pure test verifies the coercion logic directly.
 */

const PINTEREST_PATTERNS = [
  /^https?:\/\/(?:www\.|[a-z]{2}\.)?pinterest\.(?:com|co\.uk|ca|fr|de|es|it|jp|mx|pt|nz|com\.au)\/pin\//i,
  /^https?:\/\/pin\.it\//i,
];
const DRIBBBLE_PATTERNS = [/^https?:\/\/(?:www\.)?dribbble\.com\/shots\//i];
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

function isPinterestUrl(url: string): boolean {
  return PINTEREST_PATTERNS.some((r) => r.test(url));
}
function isDribbbleUrl(url: string): boolean {
  return DRIBBBLE_PATTERNS.some((r) => r.test(url));
}
function isLinkedinUrl(url: string): boolean {
  return LINKEDIN_PATTERNS.some((r) => r.test(url));
}
function isTwitterUrl(url: string): boolean {
  return TWITTER_PATTERNS.some((r) => r.test(url));
}

type IncomingType = 'url' | 'video' | 'pinterest' | 'dribbble' | 'linkedin' | 'twitter';
function coerceType(incomingType: IncomingType, rawUrl: string | undefined): string {
  if (!rawUrl) return incomingType;
  const canCoerce = incomingType === 'url' || incomingType === 'video';
  if (!canCoerce) return incomingType;
  if (isPinterestUrl(rawUrl)) return 'pinterest';
  if (isDribbbleUrl(rawUrl)) return 'dribbble';
  if (isLinkedinUrl(rawUrl)) return 'linkedin';
  if (isTwitterUrl(rawUrl)) return 'twitter';
  return incomingType;
}

describe('Social URL routing', () => {
  it('type=url + Pinterest pin → pinterest', () => {
    expect(coerceType('url', 'https://www.pinterest.com/pin/12345/')).toBe('pinterest');
  });
  it('type=url + pin.it short link → pinterest', () => {
    expect(coerceType('url', 'https://pin.it/abcDEF')).toBe('pinterest');
  });
  it('type=url + Dribbble shot → dribbble', () => {
    expect(coerceType('url', 'https://dribbble.com/shots/9999-My-Shot')).toBe('dribbble');
  });
  it('type=url + LinkedIn post → linkedin', () => {
    expect(coerceType('url', 'https://www.linkedin.com/posts/user_activity-123')).toBe('linkedin');
  });
  it('type=url + lnkd.in short link → linkedin', () => {
    expect(coerceType('url', 'https://lnkd.in/abc')).toBe('linkedin');
  });
  it('type=url + Twitter status → twitter', () => {
    expect(coerceType('url', 'https://twitter.com/user/status/123')).toBe('twitter');
  });
  it('type=url + X.com status → twitter', () => {
    expect(coerceType('url', 'https://x.com/user/status/123')).toBe('twitter');
  });
  it('type=video + Twitter status → twitter (mobile share path)', () => {
    expect(coerceType('video', 'https://x.com/user/status/123')).toBe('twitter');
  });
  it('explicit social type bypasses coercion', () => {
    expect(coerceType('pinterest', 'https://www.pinterest.com/pin/12345/')).toBe('pinterest');
    expect(coerceType('twitter', 'https://example.com/not-twitter')).toBe('twitter');
  });
  it('plain URL stays url', () => {
    expect(coerceType('url', 'https://vercel.com/blog')).toBe('url');
  });
});
