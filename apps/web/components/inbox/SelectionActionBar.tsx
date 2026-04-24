'use client';

import { useState } from 'react';
import { useSelection } from './SelectionProvider';
import { useItemActions } from '@/lib/hooks/useItemActions';

export function SelectionActionBar() {
  const selection = useSelection();
  const actions = useItemActions();
  const [toast, setToast] = useState<string | null>(null);

  if (!selection.mode) return null;
  const ids = Array.from(selection.selectedIds);
  const empty = ids.length === 0;

  async function onReload() {
    const res = await actions.reloadMany(ids);
    selection.clear();
    if (!res.ok) { setToast(`Reload failed: ${res.error}`); return; }
    const { succeeded, failed } = res.data;
    setToast(failed.length === 0
      ? `Reloaded ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}`
      : `${succeeded.length} reloaded, ${failed.length} failed`);
  }

  async function onDelete() {
    const res = await actions.deleteMany(ids);
    if (!res.ok && res.error === 'CANCELLED') return;
    selection.exit();
    if (!res.ok) { setToast(`Delete failed: ${res.error}`); return; }
    const { succeeded, failed } = res.data;
    setToast(failed.length === 0
      ? `Deleted ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}`
      : `${succeeded.length} deleted, ${failed.length} failed`);
  }

  return (
    <>
      <div role="toolbar" aria-label="Bulk actions"
        className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-surface-elevated px-4 py-2 shadow-xl">
        <span className="text-sm font-medium">{ids.length} selected</span>
        <button type="button" disabled={empty} onClick={() => void onReload()}
          className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent/10 disabled:opacity-50">Reload</button>
        <button type="button" disabled={empty} onClick={() => void onDelete()}
          className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50">Delete</button>
        <button type="button" onClick={() => selection.exit()}
          className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">Cancel</button>
      </div>
      {toast ? (
        <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm shadow-lg">
          {toast}
          <button type="button" onClick={() => setToast(null)} className="ml-3 text-muted hover:text-foreground" aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </>
  );
}
