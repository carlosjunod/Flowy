export type ProbeReason = 'DEAD_LINK' | 'DNS_FAILURE' | 'TIMEOUT' | 'BLOCKED';

export interface ProbeResult {
  ok: boolean;
  status: number; // 0 = DNS/network failure or timeout
  final_url?: string;
  reason?: ProbeReason;
}

const DEFAULT_TIMEOUT_MS = 3000;

// Some sites refuse HEAD; fall back to a 1-byte GET so we still spend only a
// round-trip of bandwidth instead of pulling the whole document.
const HEAD_FALLBACK_STATUSES = new Set([405, 501]);

function isDeadStatus(status: number): boolean {
  if (status === 0) return true; // treated as dead only when paired with a network failure
  if (status === 429) return false; // rate-limited, not dead
  return status >= 400;
}

function statusToReason(status: number): ProbeReason {
  if (status === 0) return 'DNS_FAILURE';
  if (status === 403 || status === 451) return 'BLOCKED';
  return 'DEAD_LINK';
}

async function doFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'FlowyBookmarkProbe/1.0 (+https://tryflowy.app)',
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function probeUrl(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<ProbeResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    let res = await doFetch(url, { method: 'HEAD' }, timeoutMs);

    if (HEAD_FALLBACK_STATUSES.has(res.status)) {
      res = await doFetch(
        url,
        { method: 'GET', headers: { range: 'bytes=0-0' } },
        timeoutMs,
      );
    }

    const ok = !isDeadStatus(res.status);
    return {
      ok,
      status: res.status,
      final_url: res.url || url,
      reason: ok ? undefined : statusToReason(res.status),
    };
  } catch (err) {
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError');
    return {
      ok: false,
      status: 0,
      reason: isAbort ? 'TIMEOUT' : 'DNS_FAILURE',
    };
  }
}
