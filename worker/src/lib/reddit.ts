import 'dotenv/config';

export class RedditError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message?: string, status?: number) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.name = 'RedditError';
  }
}

const REDDIT_HOST_RE = /(^|\.)reddit\.com$/i;
const REDDIT_SHORT_HOSTS = new Set(['redd.it', 'www.redd.it']);

const REDDIT_POST_PATTERNS: RegExp[] = [
  /^https?:\/\/(?:www\.|old\.|new\.|np\.|i\.)?reddit\.com\/r\/[^/]+\/comments\//i,
  /^https?:\/\/(?:www\.)?reddit\.com\/r\/[^/]+\/s\//i,
  /^https?:\/\/(?:www\.)?redd\.it\//i,
];

export function isRedditUrl(url: string): boolean {
  return REDDIT_POST_PATTERNS.some((r) => r.test(url));
}

export function extractCommentId(permalink: string): string | null {
  const m = permalink.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i);
  return m ? (m[1] ?? null) : null;
}

function stripUtm(u: string): string {
  try {
    const url = new URL(u);
    const drop: string[] = [];
    url.searchParams.forEach((_, k) => {
      if (k.toLowerCase().startsWith('utm_')) drop.push(k);
    });
    drop.forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * Resolve `/r/<sub>/s/<id>` and `redd.it/<id>` short share links to their canonical
 * `/r/<sub>/comments/<id>/<slug>` permalink. Plain comments URLs are returned as-is.
 */
export async function resolveRedditPermalink(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new RedditError('INVALID_URL', rawUrl);
  }

  const isShort =
    REDDIT_SHORT_HOSTS.has(parsed.hostname.toLowerCase()) ||
    /\/r\/[^/]+\/s\//i.test(parsed.pathname);

  if (!isShort) return stripUtm(rawUrl);

  let res: Response;
  try {
    res = await fetch(rawUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': getUserAgent() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RedditError('SHORT_LINK_RESOLVE_FAILED', msg);
  }

  const finalUrl = res.url || rawUrl;
  let final: URL;
  try {
    final = new URL(finalUrl);
  } catch {
    throw new RedditError('SHORT_LINK_RESOLVE_FAILED', `bad final url: ${finalUrl}`);
  }
  if (!REDDIT_HOST_RE.test(final.hostname)) {
    throw new RedditError('SHORT_LINK_OFF_DOMAIN', final.hostname);
  }
  return stripUtm(finalUrl);
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let _tokenCache: TokenCache | null = null;

function getUserAgent(): string {
  return process.env.REDDIT_USER_AGENT ?? 'node:app.tryflowy.app:v1.0.0 (by /u/tryflowy)';
}

function getCreds(): { id: string; secret: string } {
  const id = process.env.REDDIT_CLIENT_ID ?? '';
  const secret = process.env.REDDIT_CLIENT_SECRET ?? '';
  if (!id || !secret) {
    throw new RedditError(
      'REDDIT_NOT_CONFIGURED',
      'REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set',
    );
  }
  return { id, secret };
}

async function fetchToken(): Promise<TokenCache> {
  const { id, secret } = getCreds();
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  let res: Response;
  try {
    res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': getUserAgent(),
      },
      body: 'grant_type=client_credentials',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RedditError('AUTH_FAILED', msg);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RedditError('AUTH_FAILED', `${res.status} ${body.slice(0, 200)}`, res.status);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new RedditError('AUTH_FAILED', 'no access_token in response');
  }
  const ttl = (json.expires_in ?? 3600) * 1000;
  return { token: json.access_token, expiresAt: Date.now() + ttl - 60_000 };
}

export async function getRedditToken(force = false): Promise<string> {
  if (!force && _tokenCache && _tokenCache.expiresAt > Date.now()) {
    return _tokenCache.token;
  }
  _tokenCache = await fetchToken();
  return _tokenCache.token;
}

/**
 * Fetch a path against oauth.reddit.com with bearer auth + correct UA.
 * Retries once on 401 with a fresh token. Maps common HTTP errors to RedditError codes.
 */
export async function redditFetch(path: string): Promise<Response> {
  const url = path.startsWith('http')
    ? path
    : `https://oauth.reddit.com${path.startsWith('/') ? path : `/${path}`}`;

  const doFetch = async (token: string): Promise<Response> => {
    return fetch(url, {
      headers: {
        authorization: `bearer ${token}`,
        'user-agent': getUserAgent(),
        accept: 'application/json',
      },
    });
  };

  let token = await getRedditToken();
  let res = await doFetch(token);

  if (res.status === 401) {
    token = await getRedditToken(true);
    res = await doFetch(token);
  }

  if (res.status === 429) {
    throw new RedditError('RATE_LIMITED', `429 from ${url}`, 429);
  }
  if (res.status === 404) {
    throw new RedditError('REMOVED_POST', `404 from ${url}`, 404);
  }
  if (res.status === 403) {
    const body = await res.clone().text().catch(() => '');
    const lower = body.toLowerCase();
    if (lower.includes('quarantined') || lower.includes('private') || lower.includes('gold')) {
      throw new RedditError('NSFW_LOCKED', body.slice(0, 200), 403);
    }
    throw new RedditError('FORBIDDEN', body.slice(0, 200), 403);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new RedditError('REDDIT_HTTP_ERROR', `${res.status}: ${body.slice(0, 200)}`, res.status);
  }
  return res;
}

/** Internal — exposed for tests. */
export function _resetTokenCache(): void {
  _tokenCache = null;
}
