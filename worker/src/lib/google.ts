import 'dotenv/config';

// Minimal Google OAuth2 + Gmail API client used by the worker. We avoid the
// `googleapis` package so the worker's dependency surface stays tight — all
// we need is token refresh and two REST calls against gmail.googleapis.com.

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export class GoogleError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'GoogleError';
  }
}

export interface RefreshResult {
  accessToken: string;
  expiresAt: Date;
  scope: string[];
}

export async function refreshAccessToken(refreshToken: string, now: number = Date.now()): Promise<RefreshResult> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) {
    throw new GoogleError('GOOGLE_OAUTH_NOT_CONFIGURED', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    // 400 invalid_grant → refresh token is dead (user revoked, 6 months of
    // inactivity, etc.). Callers should mark the integration as revoked.
    const code = res.status === 400 ? 'REFRESH_REJECTED' : 'REFRESH_FAILED';
    throw new GoogleError(code, `google ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: { access_token?: string; expires_in?: number; scope?: string };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new GoogleError('REFRESH_PARSE_FAILED', `non-JSON body: ${text.slice(0, 200)}`);
  }
  if (!json.access_token) throw new GoogleError('REFRESH_FAILED', 'missing access_token');
  const expiresMs = (json.expires_in ?? 0) * 1000;
  return {
    accessToken: json.access_token,
    expiresAt: new Date(now + expiresMs),
    scope: json.scope ? json.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export interface GmailMessageListItem {
  id: string;
  threadId: string;
}

export async function listGmailMessages(
  accessToken: string,
  opts: { query?: string; maxResults?: number } = {},
): Promise<GmailMessageListItem[]> {
  const params = new URLSearchParams();
  if (opts.query) params.set('q', opts.query);
  if (opts.maxResults) params.set('maxResults', String(opts.maxResults));

  const res = await fetch(`${GMAIL_API_BASE}/users/me/messages?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    const code = res.status === 401 ? 'GMAIL_UNAUTHORIZED' : 'GMAIL_LIST_FAILED';
    throw new GoogleError(code, `gmail ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { messages?: GmailMessageListItem[] };
  return json.messages ?? [];
}

export interface GmailPayloadHeader {
  name: string;
  value: string;
}

export interface GmailPayloadBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

export interface GmailPayload {
  mimeType: string;
  headers?: GmailPayloadHeader[];
  body?: GmailPayloadBody;
  parts?: GmailPayload[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet?: string;
  payload?: GmailPayload;
}

export async function getGmailMessage(accessToken: string, id: string): Promise<GmailMessage> {
  const res = await fetch(`${GMAIL_API_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    const code = res.status === 401 ? 'GMAIL_UNAUTHORIZED' : 'GMAIL_GET_FAILED';
    throw new GoogleError(code, `gmail ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as GmailMessage;
}

export function extractHeader(payload: GmailPayload | undefined, name: string): string | undefined {
  if (!payload?.headers) return undefined;
  const lower = name.toLowerCase();
  const found = payload.headers.find((h) => h.name.toLowerCase() === lower);
  return found?.value;
}

function decodeBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(normalized, 'base64').toString('utf8');
}

// Walk the MIME tree and pull out the best-looking text. Prefer text/plain,
// fall back to stripped text/html. Attachments are skipped — we only want
// the email body itself for now.
export function extractPlainBody(payload: GmailPayload | undefined): string {
  if (!payload) return '';
  const parts = flattenParts(payload);

  const plain = parts.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  if (plain?.body?.data) return decodeBase64Url(plain.body.data);

  const html = parts.find((p) => p.mimeType === 'text/html' && p.body?.data);
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data));

  // Single-part message — body might live on the top-level payload.
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded;
  }
  return '';
}

function flattenParts(payload: GmailPayload): GmailPayload[] {
  const out: GmailPayload[] = [payload];
  if (payload.parts) for (const p of payload.parts) out.push(...flattenParts(p));
  return out;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
