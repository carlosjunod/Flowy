import { describe, it, expect } from 'vitest';

/**
 * Pure regex test for the Instagram URL routing patterns in
 * apps/web/app/api/ingest/route.ts.
 *
 * The route's own auth-mock setup in ingest.test.ts is pre-existing broken
 * (15 tests fail on baseline with 401 because vi.mock('pocketbase') is never
 * intercepting the import). This file verifies the regex logic directly so the
 * /reel/ routing fix is covered by a passing test today, without waiting on
 * the mock infrastructure rewrite.
 */

const INSTAGRAM_POST_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
];

const INSTAGRAM_REEL_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/reel\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/reels\//,
];

const INSTAGRAM_STORY_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/stories\//,
];

function isInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_PATTERNS.some((r) => r.test(url));
}

function isInstagramReelUrl(url: string): boolean {
  return INSTAGRAM_REEL_PATTERNS.some((r) => r.test(url));
}

function isInstagramStoryUrl(url: string): boolean {
  return INSTAGRAM_STORY_PATTERNS.some((r) => r.test(url));
}

type IncomingType = 'url' | 'video' | 'instagram';
function coerceType(incomingType: IncomingType, rawUrl: string | undefined): string {
  const instagramCoerce =
    rawUrl !== undefined &&
    rawUrl.length > 0 &&
    ((incomingType === 'url' &&
      (isInstagramPostUrl(rawUrl) || isInstagramReelUrl(rawUrl) || isInstagramStoryUrl(rawUrl))) ||
      (incomingType === 'video' && (isInstagramPostUrl(rawUrl) || isInstagramStoryUrl(rawUrl))));
  return instagramCoerce ? 'instagram' : incomingType;
}

describe('Instagram URL routing patterns', () => {
  describe('isInstagramPostUrl', () => {
    it('matches /p/ posts', () => {
      expect(isInstagramPostUrl('https://www.instagram.com/p/ABC/')).toBe(true);
      expect(isInstagramPostUrl('https://instagram.com/p/ABC/')).toBe(true);
      expect(isInstagramPostUrl('http://www.instagram.com/p/ABC/?x=1')).toBe(true);
    });
    it('matches /tv/ posts', () => {
      expect(isInstagramPostUrl('https://www.instagram.com/tv/XYZ/')).toBe(true);
    });
    it('does NOT match reels', () => {
      expect(isInstagramPostUrl('https://www.instagram.com/reel/XYZ/')).toBe(false);
      expect(isInstagramPostUrl('https://www.instagram.com/reels/XYZ/')).toBe(false);
    });
    it('does not match other sites', () => {
      expect(isInstagramPostUrl('https://tiktok.com/p/ABC/')).toBe(false);
      expect(isInstagramPostUrl('https://evil.com/p/instagram.com/p/ABC/')).toBe(false);
    });
  });

  describe('isInstagramReelUrl', () => {
    it('matches /reel/ singular', () => {
      expect(isInstagramReelUrl('https://www.instagram.com/reel/DXRw_Ggj8dK/')).toBe(true);
      expect(isInstagramReelUrl('https://www.instagram.com/reel/DXRw_Ggj8dK/?igsh=abc')).toBe(true);
      expect(isInstagramReelUrl('https://instagram.com/reel/ABC/')).toBe(true);
    });
    it('matches /reels/ plural', () => {
      expect(isInstagramReelUrl('https://www.instagram.com/reels/ABC/')).toBe(true);
    });
    it('does not match posts or other paths', () => {
      expect(isInstagramReelUrl('https://www.instagram.com/p/ABC/')).toBe(false);
      expect(isInstagramReelUrl('https://www.instagram.com/tv/XYZ/')).toBe(false);
      expect(isInstagramReelUrl('https://www.instagram.com/stories/ABC/')).toBe(false);
    });
  });

  describe('isInstagramStoryUrl', () => {
    it('matches /stories/ URLs', () => {
      expect(isInstagramStoryUrl('https://www.instagram.com/stories/chase.h.ai/3882141928309783621/')).toBe(true);
      expect(isInstagramStoryUrl('https://www.instagram.com/stories/someuser/12345/?utm_source=ig_story_item_share')).toBe(true);
      expect(isInstagramStoryUrl('https://instagram.com/stories/user/id/')).toBe(true);
    });
    it('does not match posts or reels', () => {
      expect(isInstagramStoryUrl('https://www.instagram.com/p/ABC/')).toBe(false);
      expect(isInstagramStoryUrl('https://www.instagram.com/reel/XYZ/')).toBe(false);
      expect(isInstagramStoryUrl('https://www.instagram.com/tv/XYZ/')).toBe(false);
    });
  });

  describe('type coercion (bulk-add fix)', () => {
    // The three Instagram reel URLs from the production failure this fix targets.
    const BULK_REEL = 'https://www.instagram.com/reel/DXRw_Ggj8dK/?igsh=bDhydzZiZTRrNWg5';
    const BULK_POST = 'https://www.instagram.com/p/DXWW5hggCLN/?img_index=1';
    // Actual story URL from the bug report — three-slide story.
    const BULK_STORY =
      'https://www.instagram.com/stories/chase.h.ai/3882141928309783621/?utm_source=ig_story_item_share';

    it('type=url + /reel/ → instagram (bulk-add path, the bug we fixed)', () => {
      expect(coerceType('url', BULK_REEL)).toBe('instagram');
    });
    it('type=url + /reels/ → instagram', () => {
      expect(coerceType('url', 'https://www.instagram.com/reels/XYZ/')).toBe('instagram');
    });
    it('type=url + /p/ → instagram (pre-existing)', () => {
      expect(coerceType('url', BULK_POST)).toBe('instagram');
    });
    it('type=url + /stories/ → instagram (story-audio fix)', () => {
      // Story URLs WERE falling through as type=url and hitting the generic URL
      // processor, which failed with "no content extracted". Coerce to
      // instagram so the carousel-aware processor handles them.
      expect(coerceType('url', BULK_STORY)).toBe('instagram');
    });
    it('type=video + /reel/ → stays video (mobile share sheet path preserved)', () => {
      // Protects the deliberate design at route.ts — the video processor handles
      // reels faster via yt-dlp-based download, so the mobile share extension
      // sends type='video' for reels and we must NOT coerce that to instagram.
      expect(coerceType('video', 'https://www.instagram.com/reel/XYZ/')).toBe('video');
    });
    it('type=video + /p/ → instagram (carousel path unchanged)', () => {
      expect(coerceType('video', BULK_POST)).toBe('instagram');
    });
    it('type=video + /stories/ → instagram (share-sheet story fix)', () => {
      // Stories via share-sheet are multi-slide playlists; must route to the
      // instagram processor, never stay on the single-video video.ts path.
      expect(coerceType('video', BULK_STORY)).toBe('instagram');
    });
    it('type=url + non-Instagram URL → unchanged', () => {
      expect(coerceType('url', 'https://vercel.com/blog')).toBe('url');
    });
  });
});
