import { NextResponse, type NextRequest } from 'next/server';
import type { Item } from '@/types';
import { authenticate } from '@/lib/auth';
import { getQueue } from '@/lib/queue';

export const runtime = 'nodejs';

async function loadOwnedItem(
  pb: ReturnType<typeof Object>,
  id: string,
  userId: string,
): Promise<Item | null> {
  const client = pb as { collection: (n: string) => { getOne: (id: string) => Promise<Item> } };
  try {
    const item = await client.collection('items').getOne(id);
    if (item.user !== userId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const item = await loadOwnedItem(auth.pb, id, auth.userId);
  if (!item) return NextResponse.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });

  if (item.status !== 'error') {
    return NextResponse.json({ error: 'NOT_RETRIABLE' }, { status: 409 });
  }

  try {
    const updated = await auth.pb.collection('items').update<Item>(id, {
      status: 'pending',
      error_msg: '',
    });

    const queue = getQueue();
    await queue.add('ingest', {
      itemId: id,
      type: item.type,
      raw_url: item.raw_url,
    });

    return NextResponse.json({ data: updated }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'RETRY_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
