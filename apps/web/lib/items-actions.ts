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

export interface BulkFailure {
  id: string;
  code: string;
  message?: string;
}

export interface BulkOutcome {
  succeeded: string[];
  failed: BulkFailure[];
}

export async function reloadItems(ids: string[]): Promise<ActionResult<BulkOutcome>> {
  const res = await fetch('/api/items/bulk/reload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return parse<BulkOutcome>(res);
}

export async function deleteItems(ids: string[]): Promise<ActionResult<BulkOutcome>> {
  const res = await fetch('/api/items/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return parse<BulkOutcome>(res);
}
