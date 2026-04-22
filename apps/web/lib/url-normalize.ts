// Web-side mirror of worker/src/lib/elements.ts#normalizeUrl.
// Kept byte-equivalent by a shared-corpus test; drift would break dedup.

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
]);

function extractYoutubeId(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      const shortsMatch = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1] ?? null;
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    }
    return null;
  } catch {
    return null;
  }
}

function isYoutubeHost(host: string): boolean {
  return (
    host === 'youtube.com' ||
    host === 'www.youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'www.youtu.be'
  );
}

export function normalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();

  const videoId = extractYoutubeId(parsed.toString());
  if (videoId && isYoutubeHost(parsed.hostname)) {
    return `https://youtube.com/watch?v=${videoId}`;
  }

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }

  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }

  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  return parsed.toString();
}

/**
 * SHA-256 of the normalized URL as lowercase hex — mirrors worker's sha256.
 * Uses Web Crypto (browser + Node 20+).
 */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
