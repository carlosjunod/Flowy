import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_OAUTH_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const DEFAULT_SCOPES = ['openid', 'email', 'profile', GMAIL_READONLY_SCOPE];

export class GoogleOAuthError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'GoogleOAuthError';
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function loadGoogleConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? '';
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GoogleOAuthError(
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

function stateSecret(): Buffer {
  const secret = process.env.JWT_SECRET ?? '';
  if (!secret || secret.length < 32) {
    throw new GoogleOAuthError('STATE_SECRET_MISSING', 'JWT_SECRET must be set (32+ chars) to sign OAuth state');
  }
  return Buffer.from(secret, 'utf8');
}

export interface StatePayload {
  userId: string;
  nonce: string;
  issuedAt: number;
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64');
}

export function createState(userId: string, now: number = Date.now()): string {
  const payload: StatePayload = { userId, nonce: randomBytes(12).toString('hex'), issuedAt: now };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', stateSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export function verifyState(token: string, now: number = Date.now()): StatePayload {
  if (!token || typeof token !== 'string') throw new GoogleOAuthError('INVALID_STATE', 'empty state');
  const dot = token.indexOf('.');
  if (dot < 1) throw new GoogleOAuthError('INVALID_STATE', 'malformed state');
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = createHmac('sha256', stateSecret()).update(payloadB64).digest();
  const provided = b64urlDecode(sigB64);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new GoogleOAuthError('INVALID_STATE', 'signature mismatch');
  }

  let parsed: StatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf8')) as StatePayload;
  } catch {
    throw new GoogleOAuthError('INVALID_STATE', 'payload parse failed');
  }
  if (!parsed.userId || !parsed.nonce || typeof parsed.issuedAt !== 'number') {
    throw new GoogleOAuthError('INVALID_STATE', 'payload incomplete');
  }
  if (now - parsed.issuedAt > STATE_MAX_AGE_MS) {
    throw new GoogleOAuthError('STATE_EXPIRED', `state older than ${STATE_MAX_AGE_MS}ms`);
  }
  return parsed;
}

export interface BuildAuthUrlArgs {
  config: GoogleOAuthConfig;
  state: string;
  scopes?: string[];
  loginHint?: string;
}

export function buildAuthUrl({ config, state, scopes = DEFAULT_SCOPES, loginHint }: BuildAuthUrlArgs): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    // `consent` forces Google to re-issue a refresh_token on reconnect. Without
    // this, Google skips the refresh_token on subsequent authorizations for
    // the same user — which silently breaks re-linking an account.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string[];
  idToken?: string;
}

function parseTokenResponse(json: GoogleTokenResponse, now: number = Date.now()): ExchangedTokens {
  if (!json.access_token || typeof json.access_token !== 'string') {
    throw new GoogleOAuthError('TOKEN_RESPONSE_INVALID', 'missing access_token');
  }
  const expiresInMs = (typeof json.expires_in === 'number' ? json.expires_in : 0) * 1000;
  const scopeStr = typeof json.scope === 'string' ? json.scope : '';
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : undefined,
    expiresAt: new Date(now + expiresInMs),
    scope: scopeStr ? scopeStr.split(/\s+/).filter(Boolean) : [],
    idToken: typeof json.id_token === 'string' ? json.id_token : undefined,
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function postForm(
  url: string,
  body: Record<string, string>,
  fetchImpl: FetchLike = fetch,
): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
}

export async function exchangeCodeForTokens(
  code: string,
  config: GoogleOAuthConfig = loadGoogleConfig(),
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<ExchangedTokens> {
  const res = await postForm(
    GOOGLE_OAUTH_TOKEN_URL,
    {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleOAuthError('CODE_EXCHANGE_FAILED', `google ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: GoogleTokenResponse;
  try {
    json = JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new GoogleOAuthError('TOKEN_RESPONSE_INVALID', `non-JSON body: ${text.slice(0, 200)}`);
  }
  return parseTokenResponse(json, now);
}

export async function refreshAccessToken(
  refreshToken: string,
  config: GoogleOAuthConfig = loadGoogleConfig(),
  fetchImpl: FetchLike = fetch,
  now: number = Date.now(),
): Promise<ExchangedTokens> {
  const res = await postForm(
    GOOGLE_OAUTH_TOKEN_URL,
    {
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    },
    fetchImpl,
  );
  const text = await res.text();
  if (!res.ok) {
    throw new GoogleOAuthError('REFRESH_FAILED', `google ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: GoogleTokenResponse;
  try {
    json = JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new GoogleOAuthError('TOKEN_RESPONSE_INVALID', `non-JSON body: ${text.slice(0, 200)}`);
  }
  const parsed = parseTokenResponse(json, now);
  // Refresh responses usually omit refresh_token — surface the old one so
  // callers always get a usable record back.
  return { ...parsed, refreshToken: parsed.refreshToken ?? refreshToken };
}

export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  // Best-effort: Google returns 200 on success, 400 for already-revoked.
  // We don't throw on 400 since the end state is the same.
  const res = await postForm(GOOGLE_OAUTH_REVOKE_URL, { token }, fetchImpl);
  if (!res.ok && res.status !== 400) {
    const body = await res.text();
    throw new GoogleOAuthError('REVOKE_FAILED', `google ${res.status}: ${body.slice(0, 200)}`);
  }
}

export interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function fetchUserInfo(accessToken: string, fetchImpl: FetchLike = fetch): Promise<GoogleUserInfo> {
  const res = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new GoogleOAuthError('USERINFO_FAILED', `google ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as GoogleUserInfo;
  if (!json || typeof json.sub !== 'string' || !json.sub) {
    throw new GoogleOAuthError('USERINFO_INVALID', 'missing sub');
  }
  return json;
}
