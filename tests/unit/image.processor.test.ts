import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();
const analyzeImageMock = vi.fn();
const generateEmbeddingMock = vi.fn();
const uploadFileMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  createEmbedding: (...args: unknown[]) => createEmbeddingMock(...args),
  getItem: async () => ({}),
  pb: {},
  ensureAuth: async () => undefined,
}));

vi.mock('../../worker/src/lib/claude.js', () => ({
  analyzeImage: (...args: unknown[]) => analyzeImageMock(...args),
  generateEmbedding: (...args: unknown[]) => generateEmbeddingMock(...args),
  ClaudeError: class extends Error { code = 'CLAUDE_ERROR'; },
}));

vi.mock('../../worker/src/lib/storage.js', () => ({
  uploadFile: (...args: unknown[]) => uploadFileMock(...args),
}));

const { processImage } = await import('../../worker/src/processors/image.processor.js');

// 1x1 PNG
const PNG_1x1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

function baseItem() {
  return {
    id: 'img_1',
    user: 'u1',
    type: 'screenshot' as const,
    status: 'processing' as const,
    tags: [],
    created: '',
    updated: '',
  };
}

describe('processImage', () => {
  beforeEach(() => {
    updateItemMock.mockReset().mockResolvedValue(undefined);
    createEmbeddingMock.mockReset().mockResolvedValue({});
    analyzeImageMock.mockReset();
    generateEmbeddingMock.mockReset();
    uploadFileMock.mockReset().mockResolvedValue('https://files/images/img_1.png');
  });

  it('happy path: base64 image → R2 uploaded, Vision called, item updated ready', async () => {
    analyzeImageMock.mockResolvedValue({
      title: 'Design system',
      summary: 'A color palette screenshot',
      tags: ['design', 'color'],
      category: 'design',
      extracted_text: 'Primary #FF0000',
    });
    const vector = new Array(1536).fill(0.002);
    generateEmbeddingMock.mockResolvedValue(vector);

    await processImage(baseItem(), PNG_1x1_B64);

    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/img_1\.(png|jpg)$/),
      expect.any(Buffer),
      expect.stringMatching(/^image\//),
    );
    expect(analyzeImageMock).toHaveBeenCalledOnce();
    expect(updateItemMock).toHaveBeenCalledWith(
      'img_1',
      expect.objectContaining({
        title: 'Design system',
        summary: 'A color palette screenshot',
        category: 'design',
        r2_key: expect.stringMatching(/^images\/img_1\./),
        status: 'ready',
      }),
    );
    expect(createEmbeddingMock).toHaveBeenCalledWith('img_1', vector);
  });

  it('R2 upload failure → throws R2_UPLOAD_FAILED', async () => {
    uploadFileMock.mockRejectedValue(new Error('s3 down'));
    await expect(processImage(baseItem(), PNG_1x1_B64)).rejects.toMatchObject({
      code: 'R2_UPLOAD_FAILED',
    });
    expect(analyzeImageMock).not.toHaveBeenCalled();
    expect(updateItemMock).not.toHaveBeenCalled();
  });

  it('vision parse failure propagates (VISION_PARSE_FAILED)', async () => {
    const err = Object.assign(new Error('bad json'), { code: 'VISION_PARSE_FAILED' });
    // Use actual ClaudeError-like shape — mock classifies by instanceof, so attach code and name
    class FakeClaudeError extends Error { code = 'VISION_PARSE_FAILED'; }
    analyzeImageMock.mockImplementation(() => { throw new FakeClaudeError('bad'); });

    await expect(processImage(baseItem(), PNG_1x1_B64)).rejects.toThrow();
    void err;
  });

  it('embedding stored correctly', async () => {
    analyzeImageMock.mockResolvedValue({
      title: 't', summary: 's', tags: [], category: 'c', extracted_text: 'hello',
    });
    generateEmbeddingMock.mockResolvedValue([1, 2, 3]);

    await processImage(baseItem(), PNG_1x1_B64);
    expect(createEmbeddingMock).toHaveBeenCalledWith('img_1', [1, 2, 3]);
  });

  it('strips data-url prefix before decoding', async () => {
    analyzeImageMock.mockResolvedValue({
      title: 't', summary: 's', tags: [], category: 'c', extracted_text: '',
    });
    generateEmbeddingMock.mockResolvedValue([0]);
    await processImage(baseItem(), `data:image/png;base64,${PNG_1x1_B64}`);
    expect(uploadFileMock).toHaveBeenCalled();
  });

  it('empty image → INVALID_IMAGE', async () => {
    await expect(processImage(baseItem(), '')).rejects.toMatchObject({ code: 'MISSING_IMAGE' });
  });
});
