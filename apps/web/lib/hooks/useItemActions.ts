'use client';

import { useCallback, useMemo, useState } from 'react';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import {
  deleteItem as deleteItemAction,
  deleteItems as deleteItemsAction,
  exploreItems as exploreItemsAction,
  retryItem as retryItemAction,
  reloadItems as reloadItemsAction,
  type ActionResult,
  type BulkOutcome,
  type ExploreOptions,
} from '@/lib/items-actions';

export interface UseItemActions {
  openItem: (id: string) => void;
  reloadItem: (id: string) => Promise<ActionResult<unknown>>;
  deleteItem: (id: string) => Promise<ActionResult<unknown>>;
  reloadMany: (ids: string[]) => Promise<ActionResult<BulkOutcome>>;
  deleteMany: (ids: string[]) => Promise<ActionResult<BulkOutcome> | { ok: false; error: 'CANCELLED' }>;
  exploreMany: (ids: string[], options?: ExploreOptions) => Promise<ActionResult<BulkOutcome>>;
  pending: ReadonlySet<string>;
}

export function useItemActions(): UseItemActions {
  const drawer = useItemDrawer();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const mark = useCallback((ids: string[], on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const openItem = useCallback((id: string) => drawer.open(id), [drawer]);

  const reloadItem = useCallback(async (id: string) => {
    mark([id], true);
    const res = await retryItemAction(id);
    mark([id], false);
    if (res.ok) drawer.emit({ kind: 'retried', item: res.data });
    return res;
  }, [drawer, mark]);

  const deleteItem = useCallback(async (id: string) => {
    mark([id], true);
    const res = await deleteItemAction(id);
    mark([id], false);
    if (res.ok) drawer.emit({ kind: 'deleted', id });
    return res;
  }, [drawer, mark]);

  const reloadMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { ok: true as const, data: { succeeded: [], failed: [] } };
    mark(ids, true);
    const res = await reloadItemsAction(ids);
    mark(ids, false);
    if (res.ok) drawer.emit({ kind: 'bulk-retried', ids: res.data.succeeded });
    return res;
  }, [drawer, mark]);

  const deleteMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { ok: true as const, data: { succeeded: [], failed: [] } };
    const msg = ids.length === 1 ? 'Delete 1 item?' : `Delete ${ids.length} items? This cannot be undone.`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) {
      return { ok: false as const, error: 'CANCELLED' as const };
    }
    mark(ids, true);
    const res = await deleteItemsAction(ids);
    mark(ids, false);
    if (res.ok) drawer.emit({ kind: 'bulk-deleted', ids: res.data.succeeded });
    return res;
  }, [drawer, mark]);

  const exploreMany = useCallback(async (ids: string[], options?: ExploreOptions) => {
    if (ids.length === 0) return { ok: true as const, data: { succeeded: [], failed: [] } };
    mark(ids, true);
    const res = await exploreItemsAction(ids, options);
    mark(ids, false);
    return res;
  }, [mark]);

  return useMemo(() => ({ openItem, reloadItem, deleteItem, reloadMany, deleteMany, exploreMany, pending }),
    [openItem, reloadItem, deleteItem, reloadMany, deleteMany, exploreMany, pending]);
}
