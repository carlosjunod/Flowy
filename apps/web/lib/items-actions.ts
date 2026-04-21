import type { Item } from '@/types';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function parse<T>(res: Response): Promise<ActionResult<T>> {
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) return { ok: false, error: body.error ?? `HTTP_${res.status}` };
  return { ok: true, data: body.data as T };
}

export async function retryItem(id: string): Promise<ActionResult<Item>> {
  const res = await fetch(`/api/items/${encodeURIComponent(id)}/retry`, { method: 'POST' });
  return parse<Item>(res);
}

export async function deleteItem(id: string): Promise<ActionResult<{ id: string }>> {
  const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return parse<{ id: string }>(res);
}
