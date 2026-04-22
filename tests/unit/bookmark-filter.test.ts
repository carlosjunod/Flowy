import { describe, it, expect } from 'vitest';
import {
  filterBookmarks,
  isAllowedScheme,
  isLocalOrPrivateHost,
} from '../../apps/web/lib/bookmarks/filter.js';
import type { ParsedBookmark } from '../../apps/web/lib/bookmarks/parser.js';

function bm(url: string, over: Partial<ParsedBookmark> = {}): ParsedBookmark {
  return { url, title: url, folder_path: [], ...over };
}

describe('isAllowedScheme', () => {
  it.each([
    ['http://x.com', true],
    ['https://x.com', true],
    ['ftp://x.com', false],
    ['javascript:alert(1)', false],
    ['data:text/html,xxx', false],
  ])('%s → %s', (url, expected) => {
    expect(isAllowedScheme(new URL(url))).toBe(expected);
  });
});

describe('isLocalOrPrivateHost', () => {
  it.each([
    ['localhost', true],
    ['127.0.0.1', true],
    ['10.0.0.5', true],
    ['192.168.1.10', true],
    ['172.16.0.1', true],
    ['172.31.255.1', true],
    ['172.32.0.1', false],
    ['169.254.10.10', true],
    ['foo.local', true],
    ['intranet', true],
    ['example.com', false],
    ['sub.example.com', false],
  ])('%s → %s', (host, expected) => {
    expect(isLocalOrPrivateHost(host)).toBe(expected);
  });
});

describe('filterBookmarks', () => {
  it('rejects non-http(s) schemes', async () => {
    const res = await filterBookmarks([
      bm('chrome://extensions/'),
      bm('chrome-extension://abc/page.html'),
      bm('about:blank'),
      bm('file:///etc/passwd'),
      bm('javascript:void(0)'),
      bm('data:text/html,x'),
      bm('moz-extension://abc/x'),
    ]);
    expect(res.accepted).toHaveLength(0);
    expect(res.rejected_invalid.every((r) => r.reason === 'BAD_SCHEME')).toBe(true);
    expect(res.rejected_invalid).toHaveLength(7);
  });

  it('rejects localhost and private hosts', async () => {
    const res = await filterBookmarks([
      bm('http://localhost:3000/'),
      bm('http://127.0.0.1/'),
      bm('http://192.168.1.1/'),
      bm('https://foo.local/'),
      bm('http://10.0.0.1/'),
    ]);
    expect(res.accepted).toHaveLength(0);
    expect(res.rejected_invalid.every((r) => r.reason === 'LOCAL_HOST')).toBe(true);
  });

  it('accepts a clean public URL', async () => {
    const res = await filterBookmarks([bm('https://example.com/article')]);
    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0]?.normalized_url).toBe('https://example.com/article');
    expect(res.accepted[0]?.element_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('dedupes within import (utm variants collapse)', async () => {
    const res = await filterBookmarks([
      bm('https://example.com/post?utm_source=a'),
      bm('https://example.com/post?utm_source=b'),
      bm('https://example.com/post?fbclid=xyz'),
    ]);
    expect(res.accepted).toHaveLength(1);
    expect(res.duplicates_in_import).toHaveLength(2);
  });

  it('first seen wins for duplicates', async () => {
    const first = bm('https://example.com/p', { title: 'First', folder_path: ['A'] });
    const second = bm('https://example.com/p', { title: 'Second', folder_path: ['B'] });
    const res = await filterBookmarks([first, second]);
    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0]?.bookmark.title).toBe('First');
    expect(res.accepted[0]?.bookmark.folder_path).toEqual(['A']);
  });

  it('flags unparseable URLs', async () => {
    const res = await filterBookmarks([bm('not a url'), bm('')]);
    expect(res.accepted).toHaveLength(0);
    expect(res.rejected_invalid.length).toBe(2);
    expect(res.rejected_invalid.map((r) => r.reason).sort()).toEqual([
      'EMPTY_URL',
      'UNPARSEABLE_URL',
    ]);
  });
});
