import { NextResponse, type NextRequest } from 'next/server';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import PocketBase from 'pocketbase';

export const runtime = 'nodejs';

const VALID_TYPES = new Set(['url', 'screenshot', 'youtube', 'video', 'receipt', 'pdf', 'audio']);
const URL_TYPES = new Set(['url', 'youtube', 'video']);

type AuthResult = { ok: true; userId: string; token: string } | { ok: false };

async function authenticate(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return { ok: false };
  const token = header.slice('Bearer '.length).trim();
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

let _queue: Queue | null = null;
function getQueue(): Queue {
  if (_queue) return _queue;
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  _queue = new Queue('ingest', { connection });
  return _queue;
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

  const { type, raw_url, raw_image, source_url } = body;
  if (!type || typeof type !== 'string' || !VALID_TYPES.has(type)) {
    return NextResponse.json({ error: 'INVALID_TYPE' }, { status: 400 });
  }

  if (URL_TYPES.has(type)) {
    if (!raw_url || typeof raw_url !== 'string') {
      return NextResponse.json({ error: 'MISSING_URL' }, { status: 400 });
    }
  }

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
