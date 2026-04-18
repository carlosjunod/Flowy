import { describe, it, expect, vi, beforeEach } from 'vitest';

type AnyFn = (...args: unknown[]) => unknown;

const mockAuthRefresh = vi.fn<AnyFn>();
const mockCreate = vi.fn<AnyFn>();
const mockSave = vi.fn<AnyFn>();

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
        create: (data: unknown) => mockCreate(data),
      };
    }
  }
  return { default: MockPocketBase };
});

const mockQueueAdd = vi.fn<AnyFn>();
vi.mock('bullmq', () => ({
  Queue: class {
    add(name: string, data: unknown) {
      return mockQueueAdd(name, data);
    }
  },
}));

vi.mock('ioredis', () => ({
  default: class {
    constructor() { /* noop */ }
  },
}));

const { POST } = await import('../../apps/web/app/api/ingest/route.js');

interface JsonBody { error?: string; data?: { id: string; status: string } }

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/ingest', {
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

describe('POST /api/ingest', () => {
  beforeEach(() => {
    mockAuthRefresh.mockReset();
    mockCreate.mockReset();
    mockSave.mockReset();
    mockQueueAdd.mockReset();
    mockCreate.mockResolvedValue({ id: 'item_123' });
    mockQueueAdd.mockResolvedValue({ id: 'job_1' });
  });

  it('missing auth header → 401 UNAUTHORIZED', async () => {
    const res = await POST(makeRequest({ type: 'url', raw_url: 'https://x.com' }) as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as JsonBody;
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('invalid token → 401 UNAUTHORIZED', async () => {
    authFail();
    const res = await POST(makeRequest({ type: 'url', raw_url: 'https://x.com' }, { authorization: 'Bearer bad' }) as never);
    expect(res.status).toBe(401);
    const body = (await res.json()) as JsonBody;
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('invalid type → 400 INVALID_TYPE', async () => {
    authOk();
    const res = await POST(makeRequest({ type: 'foo' }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as JsonBody;
    expect(body.error).toBe('INVALID_TYPE');
  });

  it('type url missing raw_url → 400 MISSING_URL', async () => {
    authOk();
    const res = await POST(makeRequest({ type: 'url' }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as JsonBody;
    expect(body.error).toBe('MISSING_URL');
  });

  it('type screenshot missing raw_image → 400 MISSING_IMAGE', async () => {
    authOk();
    const res = await POST(makeRequest({ type: 'screenshot' }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as JsonBody;
    expect(body.error).toBe('MISSING_IMAGE');
  });

  it('valid URL payload → 201 with { data: { id, status: pending } }', async () => {
    authOk('user_abc');
    const res = await POST(
      makeRequest({ type: 'url', raw_url: 'https://vercel.com/blog' }, { authorization: 'Bearer t' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as JsonBody;
    expect(body.data).toEqual({ id: 'item_123', status: 'pending' });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'url', user: 'user_abc', status: 'pending' }));
    expect(mockQueueAdd).toHaveBeenCalledWith('ingest', expect.objectContaining({ itemId: 'item_123', type: 'url' }));
  });

  it('valid screenshot payload → 201 with { data: { id, status: pending } }', async () => {
    authOk();
    const res = await POST(
      makeRequest({ type: 'screenshot', raw_image: 'aGVsbG8=' }, { authorization: 'Bearer t' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as JsonBody;
    expect(body.data?.status).toBe('pending');
    expect(mockQueueAdd).toHaveBeenCalledWith('ingest', expect.objectContaining({ type: 'screenshot', raw_image: 'aGVsbG8=' }));
  });
});
