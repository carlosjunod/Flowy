import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getOneMock = vi.fn();
const updateMock = vi.fn();
const deleteMock = vi.fn();
const getFullListMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    filter(template: string, vars: Record<string, unknown>): string {
      return template.replace('{:id}', `"${vars.id}"`);
    }
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getOne: (id: string) => getOneMock(name, id),
        update: (id: string, patch: unknown) => updateMock(name, id, patch),
        delete: (id: string) => deleteMock(name, id),
        getFullList: (opts: unknown) => getFullListMock(name, opts),
      };
    }
  }
  return { default: MockPocketBase };
});

const { PATCH, DELETE } = await import('../../apps/web/app/api/items/[id]/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId, email: 'a@b.c' } });
}

function req(method: 'PATCH' | 'DELETE', body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:4000/api/items/i1', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = 'i1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/items/[id]', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getOneMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    getFullListMock.mockReset();
  });

  it('unauthenticated → 401', async () => {
    const res = await PATCH(req('PATCH', { title: 'x' }) as never, ctx());
    expect(res.status).toBe(401);
  });

  it('missing body → 400', async () => {
    authOk();
    const noBody = new Request('http://localhost:4000/api/items/i1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer t' },
    });
    const res = await PATCH(noBody as never, ctx());
    expect(res.status).toBe(400);
  });

  it('whitelists allowed fields, ignores immutable ones', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url' });
    updateMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url', title: 'new', tags: ['a'] });
    const res = await PATCH(
      req('PATCH', {
        title: 'new',
        tags: ['a'],
        type: 'screenshot',
        user: 'other',
        r2_key: 'hacked',
        status: 'ready',
      }, { authorization: 'Bearer t' }) as never,
      ctx(),
    );
    expect(res.status).toBe(200);
    const [, , patch] = updateMock.mock.calls[0]!;
    expect(patch).toEqual({ title: 'new', tags: ['a'] });
    expect(patch).not.toHaveProperty('type');
    expect(patch).not.toHaveProperty('user');
    expect(patch).not.toHaveProperty('r2_key');
    expect(patch).not.toHaveProperty('status');
  });

  it('no valid fields → 400', async () => {
    authOk();
    const res = await PATCH(
      req('PATCH', { type: 'url', user: 'other' }, { authorization: 'Bearer t' }) as never,
      ctx(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('NO_VALID_FIELDS');
  });

  it('cross-user item → 404', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'someone_else', type: 'url' });
    const res = await PATCH(
      req('PATCH', { title: 'x' }, { authorization: 'Bearer t' }) as never,
      ctx(),
    );
    expect(res.status).toBe(404);
  });

  it('category = null clears the field', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url' });
    updateMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url', category: null });
    const res = await PATCH(
      req('PATCH', { category: null }, { authorization: 'Bearer t' }) as never,
      ctx(),
    );
    expect(res.status).toBe(200);
    const [, , patch] = updateMock.mock.calls[0]!;
    expect(patch).toEqual({ category: null });
  });

  it('tags filtered to strings only', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url' });
    updateMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url', tags: ['ok'] });
    const res = await PATCH(
      req('PATCH', { tags: ['ok', 42, { x: 1 }, null, 'also-ok'] }, { authorization: 'Bearer t' }) as never,
      ctx(),
    );
    expect(res.status).toBe(200);
    const [, , patch] = updateMock.mock.calls[0]!;
    expect(patch.tags).toEqual(['ok', 'also-ok']);
  });
});

describe('DELETE /api/items/[id]', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getOneMock.mockReset();
    deleteMock.mockReset();
    getFullListMock.mockReset();
  });

  it('unauthenticated → 401', async () => {
    const res = await DELETE(req('DELETE') as never, ctx());
    expect(res.status).toBe(401);
  });

  it('deletes embeddings then item', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'userA', type: 'url' });
    getFullListMock.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    deleteMock.mockResolvedValue(true);
    const res = await DELETE(req('DELETE', undefined, { authorization: 'Bearer t' }) as never, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: 'i1' });
    const embCalls = deleteMock.mock.calls.filter((c) => c[0] === 'embeddings').map((c) => c[1]);
    expect(embCalls.sort()).toEqual(['e1', 'e2']);
    const itemCalls = deleteMock.mock.calls.filter((c) => c[0] === 'items').map((c) => c[1]);
    expect(itemCalls).toEqual(['i1']);
  });

  it('cross-user delete → 404, no side effects', async () => {
    authOk('userA');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'other', type: 'url' });
    const res = await DELETE(req('DELETE', undefined, { authorization: 'Bearer t' }) as never, ctx());
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(getFullListMock).not.toHaveBeenCalled();
  });
});
