import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';

export const runtime = 'nodejs';

type AuthResult = { ok: true; userId: string; token: string } | { ok: false };

interface InterestRecord {
  topic: string;
  source: 'tag' | 'category';
  count: number;
  last_seen: string;
}

function readCookie(req: NextRequest | Request, name: string): string | null {
  const withCookies = req as { cookies?: { get?: (n: string) => { value?: string } | undefined } };
  const direct = withCookies.cookies?.get?.(name)?.value;
  if (direct) return direct;
  const header = req.headers.get('cookie');
  if (!header) return null;
  const match = header.split(/;\s*/).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

function tokenFromCookie(raw: string | null): string | null {
  if (!raw) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
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

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get('authorization');
  let token: string | null = null;
  if (header?.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else {
    token = tokenFromCookie(readCookie(req, 'pb_auth'));
  }
  if (!token) return { ok: false };

  const pb = new PocketBase(process.env.PB_URL ?? process.env.NEXT_PUBLIC_PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(token, null);
  try {
    const auth = await pb.collection('users').authRefresh();
    if (!pb.authStore.isValid || !auth.record?.id) return { ok: false };
    return { ok: true, userId: auth.record.id, token };
  } catch {
    return { ok: false };
  }
}

function parseLimit(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(n, 100);
}

function parseSource(raw: string | null): 'tag' | 'category' | null {
  if (raw === 'tag' || raw === 'category') return raw;
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'));
  const source = parseSource(searchParams.get('source'));

  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(auth.token, null);

  const filterParts = [`user="${auth.userId}"`];
  if (source) filterParts.push(`source="${source}"`);

  try {
    const result = await pb.collection('user_interests').getList(1, limit, {
      filter: filterParts.join(' && '),
      sort: '-count,-last_seen',
    });

    const data: InterestRecord[] = result.items.map((r) => ({
      topic: String(r.topic ?? ''),
      source: (r.source === 'tag' ? 'tag' : 'category') as 'tag' | 'category',
      count: Number(r.count ?? 0),
      last_seen: String(r.last_seen ?? ''),
    }));

    return NextResponse.json({ data, error: null }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'INTERESTS_FETCH_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
