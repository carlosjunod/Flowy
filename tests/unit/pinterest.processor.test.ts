import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const { processPinterest, isPinterestUrl } = await import(
  '../../worker/src/processors/pinterest.processor.js'
);

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
}
function imageResponse(buf: Buffer): Response {
  return new Response(buf, { status: 200, headers: { 'content-type': 'image/jpeg' } });
}

function baseItem(raw_url: string, id = `pi_${Math.random().toString(36).slice(2, 8)}`) {
  return {
    id,
    user: 'u1',
    type: 'pinterest' as const,
    status: 'processing' as const,
    raw_url,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('isPinterestUrl', () => {
  it('matches /pin/ urls', () => {
    expect(isPinterestUrl('https://www.pinterest.com/pin/12345/')).toBe(true);
    expect(isPinterestUrl('https://pin.it/abcDEF')).toBe(true);
  });
  it('rejects non-pin urls', () => {
    expect(isPinterestUrl('https://www.pinterest.com/user/board/')).toBe(false);
  });
});

describe('processPinterest', () => {
  beforeEach(() => {
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    getItemMock.mockReset().mockResolvedValue({});
    finalizeItemMock.mockReset().mockResolvedValue(undefined);
    analyzeImageMock.mockReset().mockResolvedValue({
      title: 'Image', summary: 'pretty pic', tags: ['design'], category: 'design', extracted_text: '',
    });
    extractStructuredDataMock.mockReset().mockResolvedValue({
      title: 'Claude title', summary: 'claude summary', tags: ['design', 'inspiration'], category: 'design',
    });
    generateEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    uploadFileMock.mockReset().mockResolvedValue('https://files.example/x');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('missing URL → MISSING_URL', async () => {
    await expect(
      processPinterest({ ...baseItem(''), raw_url: undefined } as never),
    ).rejects.toMatchObject({ code: 'MISSING_URL' });
  });

  it('non-pinterest URL → UNSUPPORTED_PINTEREST_URL', async () => {
    await expect(processPinterest(baseItem('https://example.com/pin/1') as never)).rejects.toMatchObject({
      code: 'UNSUPPORTED_PINTEREST_URL',
    });
  });

  it('fetches OG tags, uploads hero image, runs Claude and finalizes', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Cool Pin" />
        <meta property="og:description" content="Lovely design idea." />
        <meta property="og:image" content="https://i.pinimg.com/originals/aa/bb/cc.jpg" />
        <meta property="og:site_name" content="Pinterest" />
      </head></html>`;

    let call = 0;
    vi.stubGlobal('fetch', async (_url: string): Promise<Response> => {
      call += 1;
      if (call === 1) return htmlResponse(html);
      return imageResponse(FAKE_JPEG);
    });

    const item = baseItem('https://www.pinterest.com/pin/12345/');
    await processPinterest(item as never);

    expect(uploadFileMock).toHaveBeenCalledOnce();
    const [key, buf, mime] = uploadFileMock.mock.calls[0] as [string, Buffer, string];
    expect(key).toMatch(new RegExp(`^pinterest/${item.id}/0\\.`));
    expect(buf).toBeInstanceOf(Buffer);
    expect(mime).toBe('image/jpeg');

    expect(finalizeItemMock).toHaveBeenCalledOnce();
    const [id, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe(item.id);
    expect(patch.title).toBe('Claude title');
    expect(patch.source_url).toBe(item.raw_url);
    expect(patch.og_image).toBe('https://i.pinimg.com/originals/aa/bb/cc.jpg');
    expect(patch.site_name).toBe('Pinterest');
    expect(String(patch.content)).toContain('Cool Pin');
    expect(String(patch.content)).toContain('Lovely design idea.');
    const media = patch.media as Array<{ index: number; r2_key: string }>;
    expect(media).toHaveLength(1);
    expect(media[0]!.index).toBe(0);
    expect(createEmbeddingMock).toHaveBeenCalled();
  });

  it('no OG metadata at all → PINTEREST_PARSE_FAILED', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => htmlResponse('<html></html>'));
    await expect(
      processPinterest(baseItem('https://www.pinterest.com/pin/12345/') as never),
    ).rejects.toMatchObject({ code: 'PINTEREST_PARSE_FAILED' });
  });

  it('HTML fetch failure → FETCH_FAILED', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => new Response('nope', { status: 500 }));
    await expect(
      processPinterest(baseItem('https://www.pinterest.com/pin/12345/') as never),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
  });

  it('OG tags without image still finalizes (no media, no upload)', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Text-only pin" />
        <meta property="og:description" content="no image" />
      </head></html>`;
    vi.stubGlobal('fetch', async (): Promise<Response> => htmlResponse(html));

    await processPinterest(baseItem('https://www.pinterest.com/pin/12345/') as never);
    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(finalizeItemMock).toHaveBeenCalledOnce();
    const [, patch] = finalizeItemMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.media).toBeUndefined();
  });
});
