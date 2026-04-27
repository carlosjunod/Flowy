import { NextResponse, type NextRequest } from 'next/server';
import type { Item, ItemExploration } from '@/types';
import { authenticate } from '@/lib/auth';
import { getExploreQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const MAX_IDS = 100;

type FailureCode = 'ITEM_NOT_FOUND' | 'ALREADY_EXPLORING' | 'NOT_READY' | 'ENQUEUE_FAILED';

interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; code: FailureCode; message?: string }>;
}

async function exploreOne(
  pb: unknown,
  id: string,
  userId: string,
  includeVideoFrames: boolean,
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
  if (item.status !== 'ready') return { ok: false, code: 'NOT_READY' };
  if (item.exploration?.status === 'exploring') return { ok: false, code: 'ALREADY_EXPLORING' };

  const pending: ItemExploration = {
    status: 'exploring',
    candidates: [],
    last_explored_at: new Date().toISOString(),
  };
  try {
    await client.collection('items').update<Item>(id, { exploration: pending });
    await getExploreQueue().add('advanced-exploration', {
      itemId: id,
      userId,
      includeVideoFrames,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'ENQUEUE_FAILED',
      message: err instanceof Error ? err.message : undefined,
    };
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
  const body = raw as { ids?: unknown; includeVideoFrames?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 413 });
  }
  const includeVideoFrames = body.includeVideoFrames !== false;

  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of ids) {
    const r = await exploreOne(auth.pb, id, auth.userId, includeVideoFrames);
    if (r.ok) result.succeeded.push(id);
    else result.failed.push({ id, code: r.code, message: r.message });
  }

  return NextResponse.json({ data: result });
}
