import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const mockAuthRefresh = vi.fn();
const mockSave = vi.fn();
const mockGetFullList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = {
      save: (token: string, model: unknown) => mockSave(token, model),
      get isValid() {
        return mockAuthRefresh.mock.results.some((r) => r.type === 'return' && r.value);
      },
    };
    collection(_name: string) {
      return {
        authRefresh: () => mockAuthRefresh(),
        getFullList: (opts: unknown) => mockGetFullList(_name, opts),
        create: (data: unknown) => mockCreate(_name, data),
        update: (id: string, patch: unknown) => mockUpdate(_name, id, patch),
      };
    }
  }
  return { default: MockPocketBase };
});

const mockBulkQueueAdd = vi.fn();
const mockRegularQueueAdd = vi.fn();
vi.mock('bullmq', () => ({
  Queue: class {
    private name: string;
    constructor(name: string) { this.name = name; }
    add(jobName: string, data: unknown, opts?: unknown) {
      return this.name === 'ingest-bulk'
        ? mockBulkQueueAdd(jobName, data, opts)
        : mockRegularQueueAdd(jobName, data, opts);
    }
  },
}));

vi.mock('ioredis', () => ({
  default: class { constructor() { /* noop */ } },
}));

const { POST } = await import('../../apps/web/app/api/ingest/bulk/route.js');

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

interface JsonBody {
  error?: string;
  data?: {
    batch_id?: string | null;
    accepted?: number;
    skipped_duplicates?: number;
    skipped_invalid?: number;
    items?: { id: string; raw_url: string }[];
  };
}

function makeEntry(url: string, over: Partial<{ title: string; folder_path: string[]; add_date: string; element_hash: string; normalized_url: string }> = {}) {
  const normalized = over.normalized_url ?? url;
  const element_hash = over.element_hash ?? sha256(normalized);
  return {
    raw_url: url,
    normalized_url: normalized,
    element_hash,
    title: over.title ?? url,
    folder_path: over.folder_path ?? [],
    ...(over.add_date ? { add_date: over.add_date } : {}),
  };
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:4000/api/ingest/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function authOk(userId = 'user_abc') {
  mockAuthRefresh.mockResolvedValue({ record: { id: userId, email: 'a@b.c' } });
}
function authFail() {
  mockAuthRefresh.mockRejectedValue(new Error('invalid'));
}

describe('POST /api/ingest/bulk', () => {
  beforeEach(() => {
    mockAuthRefresh.mockReset();
    mockSave.mockReset();
    mockGetFullList.mockReset().mockResolvedValue([]);
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockBulkQueueAdd.mockReset().mockResolvedValue({ id: 'job_1' });
    mockRegularQueueAdd.mockReset();
  });

  it('no auth → 401', async () => {
    const res = await POST(makeRequest({ items: [] }) as never);
    expect(res.status).toBe(401);
  });

  it('invalid token → 401', async () => {
    authFail();
    const res = await POST(makeRequest({ items: [] }, { authorization: 'Bearer bad' }) as never);
    expect(res.status).toBe(401);
  });

  it('items not array → 400 INVALID_BODY', async () => {
    authOk();
    const res = await POST(makeRequest({}, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as JsonBody).error).toBe('INVALID_BODY');
  });

  it('> 5000 items → 413 BATCH_TOO_LARGE', async () => {
    authOk();
    const items = Array.from({ length: 5001 }, (_, i) => makeEntry(`https://ex.com/${i}`));
    const res = await POST(makeRequest({ items }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(413);
    expect(((await res.json()) as JsonBody).error).toBe('BATCH_TOO_LARGE');
  });

  it('tampered element_hash → 400 HASH_MISMATCH', async () => {
    authOk();
    const entry = makeEntry('https://example.com/x', { element_hash: 'f'.repeat(64) });
    const res = await POST(makeRequest({ items: [entry] }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as JsonBody).error).toBe('HASH_MISMATCH');
  });

  it('all entries invalid → 400 EMPTY_BATCH', async () => {
    authOk();
    const items = [
      { raw_url: 'chrome://foo/', normalized_url: 'chrome://foo/', element_hash: sha256('chrome://foo/') },
      { raw_url: 'not a url', normalized_url: 'not a url', element_hash: sha256('not a url') },
    ];
    const res = await POST(makeRequest({ items }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    expect(((await res.json()) as JsonBody).error).toBe('EMPTY_BATCH');
  });

  it('dry_run returns counts and creates nothing', async () => {
    authOk();
    const items = [
      makeEntry('https://example.com/a'),
      makeEntry('https://example.com/b'),
    ];
    const res = await POST(
      makeRequest({ items, dry_run: true }, { authorization: 'Bearer t' }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.data?.accepted).toBe(2);
    expect(body.data?.batch_id).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBulkQueueAdd).not.toHaveBeenCalled();
  });

  it('happy path creates items + batch + enqueues on bulk queue', async () => {
    authOk('user_abc');
    mockCreate.mockImplementation(async (coll: string, data: { raw_url?: string }) => {
      if (coll === 'import_batches') return { id: 'batch_1' };
      return { id: `item_${data.raw_url?.slice(-1)}` };
    });

    const items = [
      makeEntry('https://example.com/a', { folder_path: ['Recipes', 'Italian'] }),
      makeEntry('https://example.com/b'),
    ];
    const res = await POST(makeRequest({ items }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as JsonBody;
    expect(body.data?.accepted).toBe(2);
    expect(body.data?.batch_id).toBe('batch_1');

    // Batch row created with expected shape
    expect(mockCreate).toHaveBeenCalledWith(
      'import_batches',
      expect.objectContaining({ user: 'user_abc', status: 'running', total: 2 }),
    );
    // Items created with source + folder tags
    const itemCreates = mockCreate.mock.calls.filter((c) => c[0] === 'items');
    expect(itemCreates).toHaveLength(2);
    const [, firstItemData] = itemCreates[0]!;
    expect(firstItemData).toMatchObject({
      source: 'bookmark_import',
      import_batch: 'batch_1',
      status: 'pending',
      tags: expect.arrayContaining(['source:bookmark_import', 'folder:recipes', 'folder:italian']),
    });
    // Jobs enqueued on bulk queue, not live queue
    expect(mockBulkQueueAdd).toHaveBeenCalledTimes(2);
    expect(mockRegularQueueAdd).not.toHaveBeenCalled();
    expect(mockBulkQueueAdd).toHaveBeenCalledWith(
      'ingest-bulk',
      expect.objectContaining({ import_batch_id: 'batch_1', type: 'url' }),
      expect.objectContaining({ priority: 10 }),
    );
  });

  it('skips entries already in user\'s library (by element hash)', async () => {
    authOk('user_abc');
    // First call → global_elements lookup: one URL already exists globally
    mockGetFullList.mockImplementation(async (coll: string) => {
      if (coll === 'global_elements') {
        return [{ id: 'el_a', element_hash: sha256('https://example.com/a') }];
      }
      if (coll === 'items') {
        return [{ id: 'existing_item', element: 'el_a' }];
      }
      return [];
    });
    mockCreate.mockImplementation(async (coll: string) => {
      if (coll === 'import_batches') return { id: 'batch_2' };
      return { id: 'item_new' };
    });

    const items = [
      makeEntry('https://example.com/a'),
      makeEntry('https://example.com/b'),
    ];
    const res = await POST(makeRequest({ items }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as JsonBody;
    expect(body.data?.accepted).toBe(1);
    expect(body.data?.skipped_duplicates).toBe(1);
    // Only the non-duplicate item was created
    const itemCreates = mockCreate.mock.calls.filter((c) => c[0] === 'items');
    expect(itemCreates).toHaveLength(1);
  });

  it('coerces reddit bookmark URL to reddit type', async () => {
    authOk();
    mockCreate.mockImplementation(async (coll: string) => {
      if (coll === 'import_batches') return { id: 'b' };
      return { id: 'i' };
    });
    // Use URL without trailing slash to match what normalizeUrl produces.
    const entry = makeEntry('https://www.reddit.com/r/programming/comments/abc/title');
    const res = await POST(makeRequest({ items: [entry] }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(201);
    const itemCreate = mockCreate.mock.calls.find((c) => c[0] === 'items');
    expect(itemCreate?.[1]).toMatchObject({ type: 'reddit' });
    expect(mockBulkQueueAdd).toHaveBeenCalledWith(
      'ingest-bulk',
      expect.objectContaining({ type: 'reddit' }),
      expect.anything(),
    );
  });
});
