import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchTranscriptMock = vi.fn();
const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();
const extractStructuredDataMock = vi.fn();
const generateEmbeddingMock = vi.fn();

vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: (...args: unknown[]) => fetchTranscriptMock(...args),
  },
}));

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  createEmbedding: (...args: unknown[]) => createEmbeddingMock(...args),
  getItem: async () => ({}),
  pb: {},
  ensureAuth: async () => undefined,
}));

vi.mock('../../worker/src/lib/claude.js', () => ({
  extractStructuredData: (...args: unknown[]) => extractStructuredDataMock(...args),
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
  ClaudeError: class extends Error { code = 'CLAUDE_ERROR'; },
}));

const { processYoutube, extractVideoId } = await import(
  '../../worker/src/processors/youtube.processor.js'
);

function baseItem(raw_url: string) {
  return {
    id: 'yt_1',
    user: 'u1',
    type: 'youtube' as const,
    status: 'processing' as const,
    raw_url,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('extractVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=abcDEFghij1', 'abcDEFghij1'],
    ['https://youtu.be/abcDEFghij1', 'abcDEFghij1'],
    ['https://youtube.com/shorts/abcDEFghij1', 'abcDEFghij1'],
    ['https://youtube.com/embed/abcDEFghij1', 'abcDEFghij1'],
  ])('extracts id from %s', (url, id) => {
    expect(extractVideoId(url)).toBe(id);
  });

  it('returns null for non-youtube URL', () => {
    expect(extractVideoId('https://vimeo.com/abc')).toBeNull();
  });
});

describe('processYoutube', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    fetchTranscriptMock.mockReset();
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    extractStructuredDataMock.mockReset();
    generateEmbeddingMock.mockReset().mockResolvedValue([0.1, 0.2]);
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('valid URL + transcript → item updated ready with all fields', async () => {
    fetchTranscriptMock.mockResolvedValue([
      { text: 'hello', duration: 1, offset: 0 },
      { text: 'world', duration: 1, offset: 1 },
    ]);
    extractStructuredDataMock.mockResolvedValue({
      title: 'Greet',
      summary: 'hello world video',
      tags: ['greet'],
      category: 'misc',
    });

    await processYoutube(baseItem('https://youtu.be/abcDEFghij1'));

    expect(updateItemMock).toHaveBeenCalledWith(
      'yt_1',
      expect.objectContaining({
        title: 'Greet',
        summary: 'hello world video',
        tags: ['greet'],
        category: 'misc',
        status: 'ready',
      }),
    );
    expect(createEmbeddingMock).toHaveBeenCalled();
  });

  it('no transcript → falls back to oembed metadata, item still ready', async () => {
    fetchTranscriptMock.mockRejectedValue(new Error('no captions'));
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Fallback Title', author_name: 'Someone' }),
    });
    extractStructuredDataMock.mockResolvedValue({
      title: 'Fallback Title',
      summary: 'metadata only',
      tags: [],
      category: 'uncategorized',
    });

    await processYoutube(baseItem('https://www.youtube.com/watch?v=abcDEFghij1'));

    expect(updateItemMock).toHaveBeenCalledWith(
      'yt_1',
      expect.objectContaining({ status: 'ready' }),
    );
  });

  it('no transcript + oembed fails → still reaches ready (using bare URL note)', async () => {
    fetchTranscriptMock.mockRejectedValue(new Error('no captions'));
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    extractStructuredDataMock.mockResolvedValue({
      title: 'Some video',
      summary: 'cannot determine',
      tags: [],
      category: 'uncategorized',
    });
    await processYoutube(baseItem('https://www.youtube.com/watch?v=abcDEFghij1'));
    expect(updateItemMock).toHaveBeenCalledWith('yt_1', expect.objectContaining({ status: 'ready' }));
  });

  it('invalid URL → throws INVALID_YOUTUBE_URL', async () => {
    await expect(processYoutube(baseItem('https://vimeo.com/x'))).rejects.toMatchObject({
      code: 'INVALID_YOUTUBE_URL',
    });
    expect(updateItemMock).not.toHaveBeenCalled();
  });
});

// vitest's expect.any / afterAll import
import { afterAll } from 'vitest';
