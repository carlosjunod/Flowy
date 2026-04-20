import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ExecCb = (err: (Error & { stderr?: string }) | null, value?: { stdout: string; stderr: string }) => void;
type ExecImpl = (cmd: string, args: string[], opts: unknown, cb: ExecCb) => void;

const execFileCallback = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const [cmd, cargs, opts, cb] = args as [string, string[], unknown, ExecCb];
    return (execFileCallback as unknown as ExecImpl)(cmd, cargs, opts, cb);
  },
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

const { processInstagram, isInstagramUrl, MAX_SLIDES } = await import(
  '../../worker/src/processors/instagram.processor.js'
);

// 1x1 JPEG (minimal SOI/EOI) is not parseable as a real image, but sniffMediaType
// falls through to image/jpeg for unknown headers, so any non-PNG/GIF/WEBP buffer is fine.
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mockFetchOnce(payloads: Buffer[]): void {
  let i = 0;
  const fetchImpl = async (): Promise<Response> => {
    const buf = payloads[i++] ?? FAKE_JPEG;
    return new Response(buf, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  vi.stubGlobal('fetch', fetchImpl);
}

function mockYtDlpDump(dump: Record<string, unknown>): void {
  const impl: ExecImpl = (cmd, _args, _opts, cb) => {
    if (cmd === 'yt-dlp' || cmd.endsWith('/yt-dlp')) {
      cb(null, { stdout: JSON.stringify(dump), stderr: '' });
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  };
  execFileCallback.mockImplementation(impl as unknown as () => void);
}

function mockYtDlpFail(stderr: string): void {
  const impl: ExecImpl = (_cmd, _args, _opts, cb) => {
    const err = new Error('Command failed') as Error & { stderr?: string };
    err.stderr = stderr;
    cb(err);
  };
  execFileCallback.mockImplementation(impl as unknown as () => void);
}

function baseItem(raw_url: string, id = `ig_${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    user: 'u1',
    type: 'instagram' as const,
    status: 'processing' as const,
    raw_url,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('isInstagramUrl', () => {
  it.each([
    ['https://www.instagram.com/p/DXWW5hggCLN/', true],
    ['https://www.instagram.com/p/DXWW5hggCLN/?img_index=1', true],
    ['https://instagram.com/reel/abc/', true],
    ['https://www.instagram.com/tv/xyz/', true],
    ['https://example.com/p/abc/', false],
    ['https://tiktok.com/@user/video/123', false],
  ])('matches %s → %s', (url, expected) => {
    expect(isInstagramUrl(url)).toBe(expected);
  });
});

describe('processInstagram', () => {
  beforeEach(() => {
    execFileCallback.mockReset();
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    getItemMock.mockReset().mockResolvedValue({});
    finalizeItemMock.mockReset().mockResolvedValue(undefined);
    analyzeImageMock.mockReset().mockResolvedValue({
      title: 'Slide', summary: 'cool pic', tags: ['art'], category: 'art', extracted_text: 'caption',
    });
    extractStructuredDataMock.mockReset().mockResolvedValue({
      title: 'Carousel', summary: 'A 3-slide carousel', tags: ['design'], category: 'design',
    });
    generateEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    uploadFileMock.mockReset().mockResolvedValue('https://files.example/x');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('3-slide image carousel → uploads each slide, calls Vision 3 times, finalizes with media array', async () => {
    mockYtDlpDump({
      _type: 'playlist',
      entries: [
        { url: 'https://cdn.instagram.com/s1.jpg', ext: 'jpg' },
        { url: 'https://cdn.instagram.com/s2.jpg', ext: 'jpg' },
        { url: 'https://cdn.instagram.com/s3.jpg', ext: 'jpg' },
      ],
    });
    mockFetchOnce([FAKE_JPEG, FAKE_PNG, FAKE_JPEG]);

    const item = baseItem('https://www.instagram.com/p/DXWW5hggCLN/?img_index=1');
    await processInstagram(item);

    expect(uploadFileMock).toHaveBeenCalledTimes(3);
    expect(uploadFileMock).toHaveBeenNthCalledWith(
      1,
      `instagram/${item.id}/0.jpg`,
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(uploadFileMock).toHaveBeenNthCalledWith(
      2,
      `instagram/${item.id}/1.png`,
      expect.any(Buffer),
      'image/png',
    );
    expect(analyzeImageMock).toHaveBeenCalledTimes(3);
    expect(extractStructuredDataMock).toHaveBeenCalledOnce();

    const patch = finalizeItemMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch.title).toBe('Carousel');
    expect(patch.r2_key).toBe(`instagram/${item.id}/0.jpg`);
    expect(Array.isArray(patch.media)).toBe(true);
    expect((patch.media as unknown[]).length).toBe(3);
    expect(createEmbeddingMock).toHaveBeenCalled();
  });

  it('video slide → uses thumbnail for Vision, marks kind=video', async () => {
    mockYtDlpDump({
      _type: 'playlist',
      entries: [
        { url: 'https://cdn.instagram.com/v.mp4', ext: 'mp4', vcodec: 'h264', thumbnail: 'https://cdn.instagram.com/v.jpg' },
      ],
    });
    mockFetchOnce([FAKE_JPEG]);

    const item = baseItem('https://www.instagram.com/p/ABC/');
    await processInstagram(item);

    const patch = finalizeItemMock.mock.calls.at(-1)?.[1] as { media?: Array<{ kind: string }> };
    expect(patch.media?.[0]?.kind).toBe('video');
  });

  it('single-entry post (no entries array) still works', async () => {
    mockYtDlpDump({ url: 'https://cdn.instagram.com/single.jpg', ext: 'jpg' });
    mockFetchOnce([FAKE_JPEG]);

    const item = baseItem('https://www.instagram.com/p/SINGLE/');
    await processInstagram(item);

    const patch = finalizeItemMock.mock.calls.at(-1)?.[1] as { media?: unknown[] };
    expect(patch.media?.length).toBe(1);
  });

  it('caps at MAX_SLIDES when Instagram returns more', async () => {
    const many = Array.from({ length: MAX_SLIDES + 3 }, (_, i) => ({
      url: `https://cdn.instagram.com/s${i}.jpg`,
      ext: 'jpg',
    }));
    mockYtDlpDump({ _type: 'playlist', entries: many });
    mockFetchOnce(Array(MAX_SLIDES + 3).fill(FAKE_JPEG));

    const item = baseItem('https://www.instagram.com/p/MANY/');
    await processInstagram(item);

    expect(uploadFileMock).toHaveBeenCalledTimes(MAX_SLIDES);
  });

  it('non-instagram URL → throws UNSUPPORTED_INSTAGRAM_URL', async () => {
    await expect(processInstagram(baseItem('https://example.com/foo'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_INSTAGRAM_URL',
    });
    expect(execFileCallback).not.toHaveBeenCalled();
  });

  it('yt-dlp private error → throws PRIVATE_PROFILE', async () => {
    mockYtDlpFail('ERROR: This account is private');
    await expect(processInstagram(baseItem('https://www.instagram.com/p/X/'))).rejects.toMatchObject({
      code: 'PRIVATE_PROFILE',
    });
  });

  it('yt-dlp login required → throws LOGIN_REQUIRED', async () => {
    mockYtDlpFail('ERROR: login required to access this post');
    await expect(processInstagram(baseItem('https://www.instagram.com/p/X/'))).rejects.toMatchObject({
      code: 'LOGIN_REQUIRED',
    });
  });

  it('empty metadata → throws EMPTY_CAROUSEL', async () => {
    mockYtDlpDump({ _type: 'playlist', entries: [] });
    await expect(processInstagram(baseItem('https://www.instagram.com/p/X/'))).rejects.toMatchObject({
      code: 'EMPTY_CAROUSEL',
    });
  });

  it('all slide fetches fail → throws ALL_SLIDES_FAILED', async () => {
    mockYtDlpDump({
      _type: 'playlist',
      entries: [
        { url: 'https://cdn.instagram.com/s0.jpg', ext: 'jpg' },
        { url: 'https://cdn.instagram.com/s1.jpg', ext: 'jpg' },
      ],
    });
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));

    await expect(processInstagram(baseItem('https://www.instagram.com/p/X/'))).rejects.toMatchObject({
      code: 'ALL_SLIDES_FAILED',
    });
  });

  it('vision failure on one slide → still finalizes with remaining summaries', async () => {
    mockYtDlpDump({
      _type: 'playlist',
      entries: [
        { url: 'https://cdn.instagram.com/s0.jpg', ext: 'jpg' },
        { url: 'https://cdn.instagram.com/s1.jpg', ext: 'jpg' },
      ],
    });
    mockFetchOnce([FAKE_JPEG, FAKE_JPEG]);
    analyzeImageMock.mockReset();
    analyzeImageMock.mockRejectedValueOnce(new Error('vision down'));
    analyzeImageMock.mockResolvedValueOnce({
      title: 't', summary: 'ok', tags: [], category: 'x', extracted_text: 'y',
    });

    await processInstagram(baseItem('https://www.instagram.com/p/X/'));

    expect(finalizeItemMock).toHaveBeenCalledOnce();
    const patch = finalizeItemMock.mock.calls.at(-1)?.[1] as { media?: Array<{ summary?: string }> };
    expect(patch.media?.length).toBe(2);
    expect(patch.media?.[0]?.summary).toBeUndefined();
    expect(patch.media?.[1]?.summary).toBe('ok');
  });
});
