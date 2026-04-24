import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getOneMock = vi.fn();
const updateMock = vi.fn();
const queueAddMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getOne: (id: string) => getOneMock(name, id),
        update: (id: string, patch: unknown) => updateMock(name, id, patch),
      };
    }
  }
  return { default: MockPocketBase };
});

vi.mock('@/lib/queue', () => ({
  getQueue: () => ({
    add: (...args: unknown[]) => queueAddMock(...args),
  }),
}));

const { POST } = await import('../../apps/web/app/api/items/[id]/retry/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId, email: 'a@b.c' } });
}

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:4000/api/items/i1/retry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function ctx(id = 'i1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/items/[id]/retry', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getOneMock.mockReset();
    updateMock.mockReset();
    queueAddMock.mockReset();
  });

  it('401 when no auth', async () => {
    authRefreshMock.mockRejectedValue(new Error('bad'));
    const res = await POST(req() as never, ctx());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('404 when item not found', async () => {
    authOk();
    getOneMock.mockRejectedValue(new Error('not found'));
    const res = await POST(req({ authorization: 'Bearer t' }) as never, ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'ITEM_NOT_FOUND' });
  });

  it('404 when item belongs to another user', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u2', type: 'url', status: 'error' });
    const res = await POST(req({ authorization: 'Bearer t' }) as never, ctx());
    expect(res.status).toBe(404);
  });

  it('happy path: flips status to pending, clears error_msg, enqueues job', async () => {
    authOk();
    getOneMock.mockResolvedValue({
      id: 'i1',
      user: 'u1',
      type: 'url',
      raw_url: 'https://example.com',
      status: 'error',
      error_msg: 'boom',
    });
    updateMock.mockResolvedValue({
      id: 'i1',
      user: 'u1',
      type: 'url',
      status: 'pending',
      error_msg: '',
    });

    const res = await POST(req({ authorization: 'Bearer t' }) as never, ctx());

    expect(res.status).toBe(201);
    expect(updateMock).toHaveBeenCalledWith(
      'items',
      'i1',
      expect.objectContaining({ status: 'pending', error_msg: '' }),
    );
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    expect(queueAddMock).toHaveBeenCalledWith(
      'ingest',
      expect.objectContaining({ itemId: 'i1', type: 'url', raw_url: 'https://example.com' }),
    );
    const body = (await res.json()) as { data: { id: string; status: string } };
    expect(body.data).toMatchObject({ id: 'i1', status: 'pending' });
  });

  it('returns 500 when update throws', async () => {
    authOk();
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', type: 'url', status: 'error' });
    updateMock.mockRejectedValue(new Error('db down'));
    const res = await POST(req({ authorization: 'Bearer t' }) as never, ctx());
    expect(res.status).toBe(500);
  });
});

describe('widened reload gate', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getOneMock.mockReset();
    updateMock.mockReset();
    queueAddMock.mockReset();
  });

  it('accepts status=ready and re-enqueues', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'ready', type: 'url', raw_url: 'https://x.test' });
    updateMock.mockResolvedValue({ id: 'i1', status: 'pending', user: 'u1', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(201);
    expect(updateMock).toHaveBeenCalledWith('items', 'i1', { status: 'pending', error_msg: '' });
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });

  it('rejects status=pending with ALREADY_PROCESSING', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'pending', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PROCESSING');
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('rejects status=processing with ALREADY_PROCESSING', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'processing', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PROCESSING');
  });

  it('still accepts status=error (preserves existing behavior)', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'error', type: 'url', raw_url: 'https://x.test' });
    updateMock.mockResolvedValue({ id: 'i1', status: 'pending', user: 'u1', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(201);
  });
});
