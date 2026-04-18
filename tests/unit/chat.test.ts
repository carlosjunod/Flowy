import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getFullListMock = vi.fn();
const getClaudeMock = vi.fn();
const generateEmbeddingMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getFullList: (opts: unknown) => getFullListMock(name, opts),
      };
    }
  }
  return { default: MockPocketBase };
});

vi.mock('../../apps/web/lib/claude.ts', () => ({
  getClaude: () => getClaudeMock(),
  generateEmbedding: (t: string) => generateEmbeddingMock(t),
  cosineSimilarity: (a: number[], b: number[]): number => {
    let d = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) d += (a[i] ?? 0) * (b[i] ?? 0);
    return d;
  },
  CHAT_MODEL: 'claude-sonnet-4-5',
  EMBEDDING_DIMS: 1536,
  ClaudeError: class extends Error {},
}));

const { POST } = await import('../../apps/web/app/api/chat/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId, email: 'a@b.c' } });
}
function authFail(): void {
  authRefreshMock.mockRejectedValue(new Error('bad'));
}

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function claudeStreamMock(text: string) {
  // build async iterator that yields one text_delta then completes
  const events = [
    { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  ];
  return {
    [Symbol.asyncIterator](): AsyncIterator<unknown> {
      let i = 0;
      return {
        async next() {
          if (i < events.length) return { done: false, value: events[i++] };
          return { done: true, value: undefined };
        },
      };
    },
  };
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getFullListMock.mockReset();
    getClaudeMock.mockReset();
    generateEmbeddingMock.mockReset();
  });

  it('unauthenticated → 401', async () => {
    const res = await POST(makeReq({ message: 'hello' }) as never);
    expect(res.status).toBe(401);
  });

  it('missing message → 400', async () => {
    authOk();
    const res = await POST(makeReq({}, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(400);
  });

  it('valid query → streams response, queries user embeddings with user filter', async () => {
    authOk('user_abc');
    generateEmbeddingMock.mockResolvedValue([0.5, 0.5, 0]);
    const embedCalls = [
      { id: 'e1', item: 'item_1', vector: [0.5, 0.5, 0] },
      { id: 'e2', item: 'item_2', vector: [0, 0, 1] },
    ];
    getFullListMock.mockImplementation(async (name: string, opts: unknown) => {
      if (name === 'embeddings') return embedCalls;
      // items call
      return [
        { id: 'item_1', type: 'url', title: 'A', category: 'c', user: 'user_abc' },
        { id: 'item_2', type: 'url', title: 'B', category: 'c', user: 'user_abc' },
      ];
    });
    getClaudeMock.mockReturnValue({
      messages: { stream: async () => claudeStreamMock('hello there') },
    });

    const res = await POST(
      makeReq({ message: 'find item A' }, { authorization: 'Bearer t' }) as never,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-items')).toBeTruthy();

    const embedCallOpts = getFullListMock.mock.calls.find((c) => c[0] === 'embeddings')?.[1] as {
      filter?: string;
    } | undefined;
    expect(embedCallOpts?.filter).toContain('user_abc');

    const text = await res.text();
    expect(text).toBe('hello there');
  });

  it('no matching items → Claude still gets empty context, response still streams', async () => {
    authOk();
    generateEmbeddingMock.mockResolvedValue([1, 0, 0]);
    getFullListMock.mockResolvedValue([]);
    getClaudeMock.mockReturnValue({
      messages: { stream: async () => claudeStreamMock("I couldn't find anything") },
    });
    const res = await POST(makeReq({ message: 'x' }, { authorization: 'Bearer t' }) as never);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("couldn't find");
  });

  it('user filter applied — embeddings query scopes to authenticated user id', async () => {
    authOk('userA');
    generateEmbeddingMock.mockResolvedValue([0.9, 0.1, 0]);
    getFullListMock.mockImplementation(async (name: string, opts: { filter?: string } = {}) => {
      if (name === 'embeddings') {
        expect(opts.filter).toContain('userA');
        return [];
      }
      return [];
    });
    getClaudeMock.mockReturnValue({
      messages: { stream: async () => claudeStreamMock('ok') },
    });
    await POST(makeReq({ message: 'hi' }, { authorization: 'Bearer t' }) as never);
    const embCall = getFullListMock.mock.calls.find((c) => c[0] === 'embeddings');
    expect(embCall).toBeDefined();
  });
});
