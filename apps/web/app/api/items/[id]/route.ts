import { NextResponse, type NextRequest } from 'next/server';
import type { Item } from '@/types';
import { authenticate } from '@/lib/auth';
import { deleteItemWithCascade } from '@/lib/items-delete';

export const runtime = 'nodejs';

interface ItemPatchBody {
  title?: string;
  summary?: string;
  category?: string | null;
  tags?: string[];
  content?: string;
}

const ALLOWED_FIELDS = new Set<keyof ItemPatchBody>(['title', 'summary', 'category', 'tags', 'content']);

function sanitizePatch(raw: unknown): Partial<ItemPatchBody> {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  const out: Partial<ItemPatchBody> = {};
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key as keyof ItemPatchBody)) continue;
    const value = input[key];
    if (key === 'tags') {
      if (!Array.isArray(value)) continue;
      out.tags = value.filter((v): v is string => typeof v === 'string').slice(0, 20);
    } else if (key === 'category') {
      if (value === null) out.category = null;
      else if (typeof value === 'string') out.category = value.trim().slice(0, 64) || null;
    } else if (typeof value === 'string') {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

async function loadOwnedItem(pb: ReturnType<typeof Object>, id: string, userId: string): Promise<Item | null> {
  const client = pb as { collection: (n: string) => { getOne: (id: string) => Promise<Item> } };
  try {
    const item = await client.collection('items').getOne(id);
    if (item.user !== userId) return null;
    return item;
  } catch {
    return null;
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const patch = sanitizePatch(raw);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'NO_VALID_FIELDS' }, { status: 400 });
  }

  const owned = await loadOwnedItem(auth.pb, id, auth.userId);
  if (!owned) return NextResponse.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });

  try {
    const updated = await auth.pb.collection('items').update<Item>(id, patch);
    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UPDATE_FAILED';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const result = await deleteItemWithCascade(auth.pb, id, auth.userId);
  if (!result.ok) {
    const status = result.code === 'ITEM_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ data: { id } });
}
