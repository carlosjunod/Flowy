import { describe, it, expect, vi, beforeEach } from 'vitest';

const getItemMock = vi.fn();
const updateItemMock = vi.fn();
const createEmbeddingMock = vi.fn();

vi.mock('../../worker/src/lib/pocketbase.js', () => ({
  getItem: (...args: unknown[]) => getItemMock(...args),
  updateItem: (...args: unknown[]) => updateItemMock(...args),
  createEmbedding: (...args: unknown[]) => createEmbeddingMock(...args),
  deleteItem: async () => undefined,
  incrementImportBatchCounter: async () => undefined,
  pb: {},
  ensureAuth: async () => undefined,
}));

vi.mock('../../worker/src/lib/linkProbe.js', () => ({
  probeUrl: async () => ({ ok: true, status: 200 }),
}));

const processUrlMock = vi.fn();
const processImageMock = vi.fn();
const processYoutubeMock = vi.fn();

vi.mock('../../worker/src/processors/url.processor.js', () => ({
  processUrl: (...args: unknown[]) => processUrlMock(...args),
}));
vi.mock('../../worker/src/processors/image.processor.js', () => ({
  processImage: (...args: unknown[]) => processImageMock(...args),
}));
vi.mock('../../worker/src/processors/youtube.processor.js', () => ({
  processYoutube: (...args: unknown[]) => processYoutubeMock(...args),
}));

vi.mock('../../worker/src/queues.js', () => ({
  createIngestWorker: () => ({
    on: () => undefined,
    close: async () => undefined,
  }),
  createBulkIngestWorker: () => ({
    on: () => undefined,
    close: async () => undefined,
  }),
}));

const { handleJob } = await import('../../worker/src/index.js');

type Job = { id: string; data: { itemId: string; type: string; raw_image?: string } };

function makeJob(partial: Partial<Job['data']>): Job {
  return {
    id: 'job1',
    data: { itemId: 'i1', type: 'url', ...partial },
  };
}

describe('worker handleJob', () => {
  beforeEach(() => {
    getItemMock.mockReset();
    updateItemMock.mockReset();
    processUrlMock.mockReset();
    processImageMock.mockReset();
    processYoutubeMock.mockReset();

    getItemMock.mockResolvedValue({
      id: 'i1',
      user: 'u1',
      type: 'url',
      status: 'pending',
      raw_url: 'https://x.com',
      created: '',
      updated: '',
    });
    updateItemMock.mockResolvedValue(undefined);
    processUrlMock.mockResolvedValue(undefined);
  });

  it('valid url job → item status updated to processing, url processor called', async () => {
    await handleJob(makeJob({ type: 'url' }) as never);
    const statuses = updateItemMock.mock.calls.map((c) => (c[1] as { status?: string }).status);
    expect(statuses).toContain('processing');
    expect(processUrlMock).toHaveBeenCalledOnce();
  });

  it('screenshot job with image → image processor called with base64', async () => {
    getItemMock.mockResolvedValue({
      id: 'i2',
      user: 'u1',
      type: 'screenshot',
      status: 'pending',
      created: '',
      updated: '',
    });
    await handleJob(makeJob({ type: 'screenshot', raw_image: 'b64' }) as never);
    expect(processImageMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }), 'b64');
  });

  it('youtube job → youtube processor called', async () => {
    getItemMock.mockResolvedValue({
      id: 'i3',
      user: 'u1',
      type: 'youtube',
      status: 'pending',
      raw_url: 'https://youtu.be/abc',
      created: '',
      updated: '',
    });
    await handleJob(makeJob({ type: 'youtube' }) as never);
    expect(processYoutubeMock).toHaveBeenCalledOnce();
  });

  it('worker error → item status updated to error with error_msg', async () => {
    processUrlMock.mockRejectedValueOnce(new Error('SCRAPE_FAILED'));
    await handleJob(makeJob({ type: 'url' }) as never);
    const errorCall = updateItemMock.mock.calls.find((c) => (c[1] as { status?: string }).status === 'error');
    expect(errorCall).toBeDefined();
    expect((errorCall?.[1] as { error_msg?: string }).error_msg).toBe('SCRAPE_FAILED');
  });
});
