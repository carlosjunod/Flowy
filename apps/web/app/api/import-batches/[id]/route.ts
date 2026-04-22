import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import type { ImportBatch } from '@/types';

export const runtime = 'nodejs';

type AuthResult = { ok: true; userId: string; token: string } | { ok: false };

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
  if (header?.startsWith('Bearer ')) token = header.slice('Bearer '.length).trim();
  else token = tokenFromCookie(readCookie(req, 'pb_auth'));
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 });

  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(auth.token, null);

  try {
    const batch = await pb.collection('import_batches').getOne<ImportBatch>(id);
    if (batch.user !== auth.userId) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ data: batch });
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err
      ? (err as { status: number }).status
      : 500;
    if (status === 404) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const message = err instanceof Error ? err.message : 'BATCH_FETCH_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
