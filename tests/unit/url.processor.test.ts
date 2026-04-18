import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractMock = vi.fn();
const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();
const extractStructuredDataMock = vi.fn();
const generateEmbeddingMock = vi.fn();

vi.mock('@extractus/article-extractor', () => ({
  extract: (...args: unknown[]) => extractMock(...args),
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
  MODEL: 'claude-sonnet-4-5',
  EMBEDDING_DIMS: 1536,
}));

const { processUrl } = await import('../../worker/src/processors/url.processor.js');

function baseItem() {
  return {
    id: 'item_1',
    user: 'u1',
    type: 'url' as const,
    raw_url: 'https://vercel.com/blog',
    status: 'processing' as const,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('processUrl', () => {
  beforeEach(() => {
    extractMock.mockReset();
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    extractStructuredDataMock.mockReset();
    generateEmbeddingMock.mockReset();
  });

  it('happy path: valid URL → item updated with AI fields and status=ready, embedding stored', async () => {
    extractMock.mockResolvedValue({
      title: 'Vercel Blog',
      content: '<p>Hello world from Vercel</p>',
      url: 'https://vercel.com/blog',
    });
    extractStructuredDataMock.mockResolvedValue({
      title: 'Vercel Blog',
      summary: 'Posts from Vercel',
      tags: ['vercel', 'dev'],
      category: 'dev',
    });
    const vector = new Array(1536).fill(0.001);
    generateEmbeddingMock.mockResolvedValue(vector);

    await processUrl(baseItem());

    expect(updateItemMock).toHaveBeenCalledWith(
      'item_1',
      expect.objectContaining({
        title: 'Vercel Blog',
        summary: 'Posts from Vercel',
        tags: ['vercel', 'dev'],
        category: 'dev',
        status: 'ready',
      }),
    );
    expect(createEmbeddingMock).toHaveBeenCalledWith('item_1', vector);
  });

  it('scrape failure (throws) → throws SCRAPE_FAILED, item not updated', async () => {
    extractMock.mockRejectedValue(new Error('network down'));
    await expect(processUrl(baseItem())).rejects.toMatchObject({ code: 'SCRAPE_FAILED' });
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it('scrape returns no content → throws SCRAPE_FAILED', async () => {
    extractMock.mockResolvedValue({ title: 't', content: '', url: 'x' });
    await expect(processUrl(baseItem())).rejects.toMatchObject({ code: 'SCRAPE_FAILED' });
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it('Claude extraction error propagates', async () => {
    extractMock.mockResolvedValue({ title: 't', content: '<p>Some content</p>', url: 'x' });
    extractStructuredDataMock.mockRejectedValue(new Error('claude boom'));
    await expect(processUrl(baseItem())).rejects.toThrow();
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(createEmbeddingMock).not.toHaveBeenCalled();
  });

  it('embedding is stored in embeddings collection', async () => {
    extractMock.mockResolvedValue({ title: 't', content: '<p>hello</p>', url: 'x' });
    extractStructuredDataMock.mockResolvedValue({
      title: 't',
      summary: 's',
      tags: ['a'],
      category: 'c',
    });
    generateEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);

    await processUrl(baseItem());
    expect(createEmbeddingMock).toHaveBeenCalledWith('item_1', [0.1, 0.2, 0.3]);
  });
});
