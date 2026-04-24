import { describe, it, expect } from 'vitest';
import {
  isPinterestUrl,
  isDribbbleUrl,
  isLinkedinUrl,
  isTwitterUrl,
  extractTweetId,
} from '../../worker/src/lib/socialUrls.js';

describe('isPinterestUrl', () => {
  it.each([
    ['https://www.pinterest.com/pin/123456789/', true],
    ['https://pinterest.com/pin/123/', true],
    ['https://pinterest.co.uk/pin/abc/', true],
    ['https://uk.pinterest.com/pin/abc/', true],
    ['https://pin.it/abcDEF123', true],
    ['https://www.pinterest.com/user/board/', false],
    ['https://example.com/pin/foo', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isPinterestUrl(url)).toBe(expected);
  });
});

describe('isDribbbleUrl', () => {
  it.each([
    ['https://dribbble.com/shots/12345678-My-Shot', true],
    ['https://www.dribbble.com/shots/abc', true],
    ['https://dribbble.com/designer/profile', false],
    ['https://example.com/shots/abc', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isDribbbleUrl(url)).toBe(expected);
  });
});

describe('isLinkedinUrl', () => {
  it.each([
    ['https://www.linkedin.com/posts/someuser_activity-123', true],
    ['https://linkedin.com/posts/abc-activity-12345', true],
    ['https://uk.linkedin.com/posts/x_y', true],
    ['https://www.linkedin.com/pulse/great-article', true],
    ['https://www.linkedin.com/feed/update/urn:li:activity:123/', true],
    ['https://lnkd.in/abc', true],
    ['https://www.linkedin.com/in/username', false],
    ['https://example.com/posts/foo', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isLinkedinUrl(url)).toBe(expected);
  });
});

describe('isTwitterUrl', () => {
  it.each([
    ['https://twitter.com/elonmusk/status/1234567890', true],
    ['https://www.twitter.com/user/status/123', true],
    ['https://mobile.twitter.com/user/status/123', true],
    ['https://x.com/user/status/123', true],
    ['https://www.x.com/user/status/123', true],
    ['https://t.co/abcDEF', true],
    ['https://twitter.com/user', false],
    ['https://x.com/user', false],
    ['https://example.com/status/123', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isTwitterUrl(url)).toBe(expected);
  });
});

describe('extractTweetId', () => {
  it('extracts numeric id from twitter URL', () => {
    expect(extractTweetId('https://twitter.com/user/status/1234567890')).toBe('1234567890');
  });
  it('extracts numeric id from x.com URL', () => {
    expect(extractTweetId('https://x.com/user/status/987654321?s=20')).toBe('987654321');
  });
  it('returns null when no id present', () => {
    expect(extractTweetId('https://twitter.com/user')).toBeNull();
  });
});
