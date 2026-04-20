import PocketBase from 'pocketbase';
import type { NextRequest } from 'next/server';

export type AuthOk = { ok: true; userId: string; token: string; pb: PocketBase };
export type AuthResult = AuthOk | { ok: false };

function readCookie(req: NextRequest | Request, name: string): string | null {
  const withCookies = req as { cookies?: { get?: (n: string) => { value?: string } | undefined } };
  const direct = withCookies.cookies?.get?.(name)?.value;
  if (direct) return direct;
  const header = req.headers.get('cookie');
  if (!header) return null;
  const match = header.split(/;\s*/).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractToken(req: NextRequest | Request): string | null {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  const cookieVal = readCookie(req, 'pb_auth');
  if (!cookieVal) return null;
  const decoded = safeDecode(cookieVal);
  if (decoded.startsWith('{')) {
    try {
      const parsed = JSON.parse(decoded) as { token?: string };
      return parsed.token ?? null;
    } catch {
      return null;
    }
  }
  return decoded;
}

export async function authenticate(req: NextRequest | Request): Promise<AuthResult> {
  const token = extractToken(req);
  if (!token) return { ok: false };
  const pb = new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    return { ok: true, userId: auth.record.id, token, pb };
  } catch {
    return { ok: false };
  }
}
