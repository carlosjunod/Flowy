import { NextResponse, type NextRequest } from 'next/server';
import type { Item } from '@/types';
import { authenticate } from '@/lib/auth';
import { getQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const MAX_IDS = 100;

type FailureCode = 'ITEM_NOT_FOUND' | 'ALREADY_PROCESSING' | 'RELOAD_FAILED';

interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; code: FailureCode; message?: string }>;
}

async function reloadOne(
  pb: unknown,
  id: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: FailureCode; message?: string }> {
  const client = pb as {
    collection: (n: string) => {
      getOne: (id: string) => Promise<Item>;
      update: <T>(id: string, patch: unknown) => Promise<T>;
    };
  };
  let item: Item;
  try {
    item = await client.collection('items').getOne(id);
  } catch {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }
  if (item.user !== userId) return { ok: false, code: 'ITEM_NOT_FOUND' };
  if (item.status === 'pending' || item.status === 'processing') {
    return { ok: false, code: 'ALREADY_PROCESSING' };
  }
  try {
    await client.collection('items').update<Item>(id, { status: 'pending', error_msg: '' });
    await getQueue().add('ingest', { itemId: id, type: item.type, raw_url: item.raw_url });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: 'RELOAD_FAILED', message: err instanceof Error ? err.message : undefined };
  }
}

export async function POST(req: NextRequest | Request): Promise<Response> {
  const auth = await authenticate(req as NextRequest);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const body = raw as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 413 });
  }

  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of ids) {
    const r = await reloadOne(auth.pb, id, auth.userId);
    if (r.ok) result.succeeded.push(id);
    else result.failed.push({ id, code: r.code, message: r.message });
  }

  return NextResponse.json({ data: result });
}
