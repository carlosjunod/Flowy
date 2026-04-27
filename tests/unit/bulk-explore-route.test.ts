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
  getExploreQueue: () => ({ add: (...a: unknown[]) => queueAddMock(...a) }),
}));

const { POST } = await import('../../apps/web/app/api/items/bulk/explore/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId } });
}

function req(body: unknown): Request {
  return new Request('http://localhost:4000/api/items/bulk/explore', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authRefreshMock.mockReset();
  getOneMock.mockReset();
  updateMock.mockReset();
  queueAddMock.mockReset();
});

describe('POST /api/items/bulk/explore', () => {
  it('returns 401 when unauthenticated', async () => {
    authRefreshMock.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ ids: ['i1'] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid payload', async () => {
    authOk();
    const res = await POST(req({ ids: 'not-array' }));
    expect(res.status).toBe(400);
  });

  it('returns 413 when over 100 ids', async () => {
    authOk();
    const ids = Array.from({ length: 101 }, (_, i) => `i${i}`);
    const res = await POST(req({ ids }));
    expect(res.status).toBe(413);
  });

  it('processes a mixed batch: ready→succeeds, exploring→fails, not-owned→fails, pending→fails', async () => {
    authOk('u1');
    getOneMock.mockImplementation((_col: string, id: string) => {
      if (id === 'i1') return Promise.resolve({ id: 'i1', user: 'u1', status: 'ready', type: 'url' });
      if (id === 'i2') return Promise.resolve({ id: 'i2', user: 'u1', status: 'ready', type: 'youtube', exploration: { status: 'exploring', candidates: [] } });
      if (id === 'i3') return Promise.resolve({ id: 'i3', user: 'u2', status: 'ready', type: 'url' });
      if (id === 'i4') return Promise.resolve({ id: 'i4', user: 'u1', status: 'pending', type: 'url' });
      return Promise.reject(new Error('404'));
    });
    updateMock.mockResolvedValue({ id: 'i1', user: 'u1' });

    const res = await POST(req({ ids: ['i1', 'i2', 'i3', 'i4'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { succeeded: string[]; failed: Array<{ id: string; code: string }> } };

    expect(body.data.succeeded).toEqual(['i1']);
    const byId = Object.fromEntries(body.data.failed.map((f) => [f.id, f.code]));
    expect(byId.i2).toBe('ALREADY_EXPLORING');
    expect(byId.i3).toBe('ITEM_NOT_FOUND');
    expect(byId.i4).toBe('NOT_READY');

    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [, jobData] = queueAddMock.mock.calls[0]!;
    expect(jobData).toMatchObject({ itemId: 'i1', userId: 'u1', includeVideoFrames: true });
  });

  it('forwards includeVideoFrames=false when explicitly disabled', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'ready', type: 'youtube' });
    updateMock.mockResolvedValue({});
    await POST(req({ ids: ['i1'], includeVideoFrames: false }));
    expect(queueAddMock).toHaveBeenCalledTimes(1);
    const [, jobData] = queueAddMock.mock.calls[0]!;
    expect(jobData.includeVideoFrames).toBe(false);
  });
});
