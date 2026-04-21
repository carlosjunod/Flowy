import { NextResponse, type NextRequest } from 'next/server';
import PocketBase from 'pocketbase';
import { getQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const VALID_TYPES = new Set(['url', 'screenshot', 'youtube', 'video', 'instagram', 'receipt', 'pdf', 'audio']);
const URL_TYPES = new Set(['url', 'youtube', 'video', 'instagram']);

const INSTAGRAM_POST_PATTERNS = [
  /^https?:\/\/(?:www\.)?instagram\.com\/p\//,
  /^https?:\/\/(?:www\.)?instagram\.com\/tv\//,
];

function isInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_PATTERNS.some((r) => r.test(url));
}

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

interface IngestBody {
  type?: string;
  raw_url?: string;
  raw_image?: string;
  source_url?: string;
}

async function createItem(userToken: string, userId: string, data: Record<string, unknown>): Promise<{ id: string }> {
  const pb = new PocketBase(process.env.PB_URL ?? 'http://localhost:8090');
  pb.authStore.save(userToken, null);
  const record = await pb.collection('items').create({ ...data, user: userId, status: 'pending' });
  return { id: record.id };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  const { type: incomingType, raw_url, raw_image, source_url } = body;
  if (!incomingType || typeof incomingType !== 'string' || !VALID_TYPES.has(incomingType)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  if (URL_TYPES.has(incomingType)) {
    if (!raw_url || typeof raw_url !== 'string') {
      return NextResponse.json({ error: 'MISSING_URL' }, { status: 400 });
    }
  }

  // Auto-route Instagram post/carousel URLs to the instagram processor.
  // Reels stay on whatever type the client picked (usually `video`).
  const type =
    (incomingType === 'url' || incomingType === 'video') && raw_url && isInstagramPostUrl(raw_url)
      ? 'instagram'
      : incomingType;

  if (type === 'screenshot') {
    if (!raw_image || typeof raw_image !== 'string') {
      return NextResponse.json({ error: 'MISSING_IMAGE' }, { status: 400 });
    }
  }

  try {
    const itemData: Record<string, unknown> = {
      type,
      tags: [],
    };
    if (raw_url) itemData.raw_url = raw_url;
    if (source_url) itemData.source_url = source_url;
    else if (raw_url) itemData.source_url = raw_url;

    const { id } = await createItem(auth.token, auth.userId, itemData);

    const queue = getQueue();
    await queue.add('ingest', {
      itemId: id,
      type,
      raw_url,
      raw_image,
    });

    return NextResponse.json({ data: { id, status: 'pending' } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'INGEST_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
