import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getOneMock = vi.fn();
const getFullListMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    filter(template: string, vars: Record<string, unknown>) {
      return template.replace('{:id}', `"${vars.id}"`);
    }
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getOne: (id: string) => getOneMock(name, id),
        getFullList: (opts: unknown) => getFullListMock(name, opts),
        delete: (id: string) => deleteMock(name, id),
      };
    }
  }
  return { default: MockPocketBase };
});

const { POST } = await import('../../apps/web/app/api/items/bulk/delete/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId } });
}

function req(body: unknown): Request {
  return new Request('http://localhost:4000/api/items/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authRefreshMock.mockReset();
  getOneMock.mockReset();
  getFullListMock.mockReset();
  deleteMock.mockReset();
});

describe('POST /api/items/bulk/delete', () => {
  it('returns 401 when unauthenticated', async () => {
    authRefreshMock.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ ids: ['i1'] }));
    expect(res.status).toBe(401);
  });

  it('returns 413 when over 100 ids', async () => {
    authOk();
    const ids = Array.from({ length: 101 }, (_, i) => `i${i}`);
    const res = await POST(req({ ids }));
    expect(res.status).toBe(413);
  });

  it('cascades embeddings delete per owned item', async () => {
    authOk('u1');
    getOneMock.mockImplementation((_col: string, id: string) => {
      if (id === 'i1') return Promise.resolve({ id: 'i1', user: 'u1' });
      if (id === 'i2') return Promise.resolve({ id: 'i2', user: 'u2' });
      return Promise.reject(new Error('404'));
    });
    getFullListMock.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    deleteMock.mockResolvedValue(undefined);

    const res = await POST(req({ ids: ['i1', 'i2', 'i3'] }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.succeeded).toEqual(['i1']);
    const failed = body.data.failed.map((f: { id: string; code: string }) => [f.id, f.code]);
    expect(failed.sort()).toEqual([['i2', 'ITEM_NOT_FOUND'], ['i3', 'ITEM_NOT_FOUND']]);

    expect(getFullListMock).toHaveBeenCalledTimes(1);
    expect(getFullListMock).toHaveBeenCalledWith('embeddings', { filter: 'item = "i1"', fields: 'id' });
    expect(deleteMock).toHaveBeenCalledWith('embeddings', 'e1');
    expect(deleteMock).toHaveBeenCalledWith('embeddings', 'e2');
    expect(deleteMock).toHaveBeenCalledWith('items', 'i1');
  });
});
