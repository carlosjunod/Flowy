import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { probeUrl } from '../../worker/src/lib/linkProbe.js';

const originalFetch = globalThis.fetch;

function mockFetchOnce(
  ...responses: (Response | (() => Promise<Response>) | { throwName: string })[]
) {
  const queue = [...responses];
  globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const next = queue.shift();
    if (!next) throw new Error('no more mock responses');
    if (typeof next === 'function') return next();
    if ('throwName' in next) {
      const e = new Error('synthetic');
      e.name = next.throwName;
      if (init?.signal) init.signal.addEventListener('abort', () => {
        /* noop */
      });
      throw e;
    }
    return next;
  }) as typeof fetch;
}

function makeResponse(init: { status: number; url?: string }): Response {
  return new Response(null, { status: init.status });
}

describe('probeUrl', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('200 → ok:true, status 200', async () => {
    mockFetchOnce(makeResponse({ status: 200 }));
    const r = await probeUrl('https://example.com/');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.reason).toBeUndefined();
  });

  it('404 → DEAD_LINK', async () => {
    mockFetchOnce(makeResponse({ status: 404 }));
    const r = await probeUrl('https://example.com/gone');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(r.reason).toBe('DEAD_LINK');
  });

  it('500 → DEAD_LINK', async () => {
    mockFetchOnce(makeResponse({ status: 503 }));
    const r = await probeUrl('https://example.com/down');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('DEAD_LINK');
  });

  it('429 → treated as alive (rate limit, not dead)', async () => {
    mockFetchOnce(makeResponse({ status: 429 }));
    const r = await probeUrl('https://rate-limited.com/');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(429);
  });

  it('403 → BLOCKED (still dead)', async () => {
    mockFetchOnce(makeResponse({ status: 403 }));
    const r = await probeUrl('https://forbidden.com/');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('BLOCKED');
  });

  it('HEAD 405 falls back to ranged GET', async () => {
    mockFetchOnce(makeResponse({ status: 405 }), makeResponse({ status: 200 }));
    const r = await probeUrl('https://head-refused.com/');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('network error → DNS_FAILURE, status 0', async () => {
    mockFetchOnce({ throwName: 'TypeError' });
    const r = await probeUrl('https://dns-dead.xyz/');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.reason).toBe('DNS_FAILURE');
  });

  it('abort (timeout) → TIMEOUT, status 0', async () => {
    mockFetchOnce({ throwName: 'AbortError' });
    const r = await probeUrl('https://slow.example.com/', { timeoutMs: 10 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.reason).toBe('TIMEOUT');
  });
});
