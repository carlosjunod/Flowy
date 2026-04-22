import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const redditFetchMock = vi.fn();
const resolveRedditPermalinkMock = vi.fn();
vi.mock('../../worker/src/lib/reddit.js', async () => {
  class RedditError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message?: string, status?: number) {
      super(message ?? code);
      this.code = code;
      this.status = status;
      this.name = 'RedditError';
    }
  }
  return {
    redditFetch: (...args: unknown[]) => redditFetchMock(...args),
    resolveRedditPermalink: (...args: unknown[]) => resolveRedditPermalinkMock(...args),
    extractCommentId: (permalink: string): string | null => {
      const m = permalink.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i);
      return m ? (m[1] ?? null) : null;
    },
    isRedditUrl: (url: string): boolean =>
      /^https?:\/\/(?:www\.|old\.|new\.|np\.|i\.)?reddit\.com\/r\/[^/]+\/comments\//i.test(url) ||
      /^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/s\//i.test(url) ||
      /^https?:\/\/(?:www\.)?redd\.it\//i.test(url),
    RedditError,
  };
});

const extractMock = vi.fn();
vi.mock('@extractus/article-extractor', () => ({
  extract: (...args: unknown[]) => extractMock(...args),
}));

const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();
const getItemMock = vi.fn();
vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  createEmbedding: (...args: unknown[]) => createEmbeddingMock(...args),
  getItem: (...args: unknown[]) => getItemMock(...args),
  pb: {},
  ensureAuth: async () => undefined,
}));

const finalizeItemMock = vi.fn();
vi.mock('../../worker/src/lib/finalize.js', () => ({
  finalizeItem: (...args: unknown[]) => finalizeItemMock(...args),
}));

const analyzeImageMock = vi.fn();
const extractStructuredDataMock = vi.fn();
const generateEmbeddingMock = vi.fn();
vi.mock('../../worker/src/lib/claude.js', () => ({
  analyzeImage: (...args: unknown[]) => analyzeImageMock(...args),
  extractStructuredData: (...args: unknown[]) => extractStructuredDataMock(...args),
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
  ClaudeError: class extends Error { code = 'CLAUDE_ERROR'; },
}));

const uploadFileMock = vi.fn();
vi.mock('../../worker/src/lib/storage.js', () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

const { processReddit, isRedditUrl } = await import(
  '../../worker/src/processors/reddit.processor.js'
);

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function listingJson(post: Record<string, unknown>, comments: Array<Record<string, unknown>> = []): Response {
  const payload = [
    { kind: 'Listing', data: { children: [{ kind: 't3', data: post }] } },
    { kind: 'Listing', data: { children: comments.map((c) => ({ kind: 't1', data: c })) } },
  ];
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mockImageFetch(buffers: Buffer[]): void {
  let i = 0;
  vi.stubGlobal('fetch', async (): Promise<Response> => {
    const buf = buffers[i++] ?? FAKE_JPEG;
    return new Response(buf, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  });
}

function baseItem(raw_url: string, id = `rd_${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    user: 'u1',
    type: 'reddit' as const,
    status: 'processing' as const,
    raw_url,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('isRedditUrl', () => {
  it.each([
    ['https://www.reddit.com/r/programming/comments/abc/title/', true],
    ['https://old.reddit.com/r/news/comments/abc/', true],
    ['https://np.reddit.com/r/news/comments/abc/', true],
    ['https://www.reddit.com/r/sub/s/sharetoken', true],
    ['https://redd.it/abc', true],
    ['https://www.reddit.com/user/example', false],
    ['https://twitter.com/foo', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isRedditUrl(url)).toBe(expected);
  });
});

describe('processReddit', () => {
  beforeEach(() => {
    redditFetchMock.mockReset();
    resolveRedditPermalinkMock.mockReset();
    extractMock.mockReset();
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    getItemMock.mockReset().mockResolvedValue({});
    finalizeItemMock.mockReset().mockResolvedValue(undefined);
    analyzeImageMock.mockReset().mockResolvedValue({
      title: 'Slide', summary: 'a pic', tags: ['art'], category: 'art', extracted_text: 'caption',
    });
    extractStructuredDataMock.mockReset().mockResolvedValue({
      title: 'Claude title', summary: 'claude summary', tags: ['reddit'], category: 'discussion',
    });
    generateEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    uploadFileMock.mockReset().mockResolvedValue('https://files.example/x');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('missing URL → MISSING_URL', async () => {
    const item = baseItem('');
    item.raw_url = '';
    await expect(processReddit({ ...item, raw_url: undefined } as never)).rejects.toMatchObject({ code: 'MISSING_URL' });
  });

  it('non-reddit URL → UNSUPPORTED_REDDIT_URL', async () => {
    await expect(processReddit(baseItem('https://example.com/foo') as never)).rejects.toMatchObject({
      code: 'UNSUPPORTED_REDDIT_URL',
    });
  });

  it('self post → finalizes with selftext + top comments in content', async () => {
    const permalink = 'https://www.reddit.com/r/programming/comments/abc1/my_post/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson(
        {
          title: 'Hello world',
          author: 'alice',
          subreddit: 'programming',
          selftext: 'This is the body of my post.',
          score: 42,
          num_comments: 2,
          is_self: true,
          permalink: '/r/programming/comments/abc1/my_post/',
        },
        [
          { author: 'bob', body: 'Great post!', score: 10 },
          { author: 'eve', body: '[deleted]', score: 1 }, // filtered out
          { author: 'carol', body: 'I agree.', score: 5 },
        ],
      ),
    );

    await processReddit(baseItem(permalink) as never);

    expect(finalizeItemMock).toHaveBeenCalledOnce();
    const [id, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toMatch(/^rd_/);
    const content = String(patch.content);
    expect(content).toContain('r/programming · u/alice');
    expect(content).toContain('Hello world');
    expect(content).toContain('This is the body of my post.');
    expect(content).toContain('--- Top Comments ---');
    expect(content).toContain('u/bob');
    expect(content).toContain('u/carol');
    expect(content).not.toContain('u/eve');
    expect(patch.source_url).toBe(permalink);
    expect(patch.site_name).toBe('r/programming');
    expect(patch.title).toBe('Claude title');
    expect(createEmbeddingMock).toHaveBeenCalled();
  });

  it('linkpost → fetches external via article-extractor and sets og_image', async () => {
    const permalink = 'https://www.reddit.com/r/tech/comments/lnk1/cool_article/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 'Cool article',
        author: 'dev',
        subreddit: 'tech',
        url: 'https://example.com/article',
        url_overridden_by_dest: 'https://example.com/article',
        score: 5,
        num_comments: 0,
        is_self: false,
      }),
    );
    extractMock.mockResolvedValueOnce({
      title: 'external title',
      content: '<p>External article body text.</p>',
      url: 'https://example.com/article',
      image: 'https://example.com/cover.jpg',
      description: 'desc',
      source: 'example.com',
    });

    await processReddit(baseItem(permalink) as never);

    expect(extractMock).toHaveBeenCalledWith('https://example.com/article');
    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.og_image).toBe('https://example.com/cover.jpg');
    expect(patch.og_description).toBe('desc');
    expect(String(patch.content)).toContain('External article body text.');
  });

  it('linkpost extractor failure → falls back to preview image', async () => {
    const permalink = 'https://www.reddit.com/r/tech/comments/lnk2/t/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 't',
        author: 'x',
        subreddit: 'tech',
        url: 'https://example.com/broken',
        url_overridden_by_dest: 'https://example.com/broken',
        preview: { images: [{ source: { url: 'https://preview.redd.it/abc.jpg&amp;w=640' } }] },
        is_self: false,
      }),
    );
    extractMock.mockRejectedValueOnce(new Error('scrape failed'));

    await processReddit(baseItem(permalink) as never);

    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.og_image).toBe('https://preview.redd.it/abc.jpg&w=640');
    expect(String(patch.content)).toContain('Link: https://example.com/broken');
  });

  it('gallery post → uploads each item, calls Vision N times, stores media[]', async () => {
    const permalink = 'https://www.reddit.com/r/pics/comments/gal1/slideshow/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 'Slideshow',
        author: 'photog',
        subreddit: 'pics',
        is_self: false,
        is_gallery: true,
        gallery_data: {
          items: [{ media_id: 'm1' }, { media_id: 'm2' }, { media_id: 'm3' }],
        },
        media_metadata: {
          m1: { m: 'image/jpg', s: { u: 'https://i.redd.it/m1.jpg&amp;t=1' } },
          m2: { m: 'image/png', s: { u: 'https://i.redd.it/m2.png' } },
          m3: { m: 'image/jpg', s: { u: 'https://i.redd.it/m3.jpg' } },
        },
      }),
    );
    mockImageFetch([FAKE_JPEG, FAKE_PNG, FAKE_JPEG]);

    const item = baseItem(permalink);
    await processReddit(item as never);

    expect(uploadFileMock).toHaveBeenCalledTimes(3);
    expect(uploadFileMock).toHaveBeenNthCalledWith(1, `reddit/${item.id}/0.jpg`, expect.any(Buffer), 'image/jpeg');
    expect(uploadFileMock).toHaveBeenNthCalledWith(2, `reddit/${item.id}/1.png`, expect.any(Buffer), 'image/png');
    expect(analyzeImageMock).toHaveBeenCalledTimes(3);

    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Array.isArray(patch.media)).toBe(true);
    expect((patch.media as unknown[]).length).toBe(3);
    expect(patch.r2_key).toBe(`reddit/${item.id}/0.jpg`);
    // HTML entity decoded before fetching (asserted via upload happening = no throw):
    const mediaArr = patch.media as Array<{ source_url?: string }>;
    expect(mediaArr[0]?.source_url).toBe('https://i.redd.it/m1.jpg&t=1');
  });

  it('image post → uploads single file and finalizes with media[0]', async () => {
    const permalink = 'https://www.reddit.com/r/pics/comments/img1/cat/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 'Cat',
        author: 'kitty',
        subreddit: 'pics',
        is_self: false,
        post_hint: 'image',
        url: 'https://i.redd.it/cat.jpg',
        url_overridden_by_dest: 'https://i.redd.it/cat.jpg',
      }),
    );
    mockImageFetch([FAKE_JPEG]);

    const item = baseItem(permalink);
    await processReddit(item as never);

    expect(uploadFileMock).toHaveBeenCalledTimes(1);
    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect((patch.media as unknown[]).length).toBe(1);
    expect(patch.r2_key).toBe(`reddit/${item.id}/0.jpg`);
  });

  it('removed post → throws REMOVED_POST', async () => {
    const permalink = 'https://www.reddit.com/r/x/comments/rem1/x/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 'gone',
        author: '[deleted]',
        subreddit: 'x',
        selftext: '[removed]',
        is_self: true,
      }),
    );

    await expect(processReddit(baseItem(permalink) as never)).rejects.toMatchObject({
      code: 'REMOVED_POST',
    });
  });

  it('reddit api 429 → re-thrown as ProcessorError(RATE_LIMITED)', async () => {
    const permalink = 'https://www.reddit.com/r/x/comments/rl1/x/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    const { RedditError } = await import('../../worker/src/lib/reddit.js');
    redditFetchMock.mockRejectedValueOnce(new RedditError('RATE_LIMITED', '429 from url', 429));

    await expect(processReddit(baseItem(permalink) as never)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('crosspost → processes parent post body', async () => {
    const permalink = 'https://www.reddit.com/r/outer/comments/xp1/x/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(permalink);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 'wrapper',
        author: 'xposter',
        subreddit: 'outer',
        is_self: false,
        crosspost_parent_list: [
          {
            title: 'original',
            author: 'original_author',
            subreddit: 'inner',
            selftext: 'the real body',
            is_self: true,
            score: 100,
            num_comments: 0,
          },
        ],
      }),
    );

    await processReddit(baseItem(permalink) as never);

    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(String(patch.content)).toContain('the real body');
    expect(patch.site_name).toBe('r/inner');
  });

  it('short /s/ link → resolves permalink first', async () => {
    const shortUrl = 'https://www.reddit.com/r/sub/s/AbCdEf';
    const resolved = 'https://www.reddit.com/r/sub/comments/abc1/title/';
    resolveRedditPermalinkMock.mockResolvedValueOnce(resolved);
    redditFetchMock.mockResolvedValueOnce(
      listingJson({
        title: 't',
        author: 'a',
        subreddit: 'sub',
        selftext: 'body',
        is_self: true,
      }),
    );

    await processReddit(baseItem(shortUrl) as never);

    expect(resolveRedditPermalinkMock).toHaveBeenCalledWith(shortUrl);
    expect(redditFetchMock).toHaveBeenCalledWith(expect.stringContaining('/comments/abc1'));
    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.source_url).toBe(resolved);
  });
});
