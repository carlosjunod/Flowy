'use client';

import { useEffect, useRef, useState } from 'react';
import type { ItemStatus } from '@/types';
import { useItemActions } from '@/lib/hooks/useItemActions';

interface Props {
  itemId: string;
  status: ItemStatus;
  variant?: 'hover' | 'inline';
  className?: string;
}

export function ItemActionsMenu({ itemId, status, variant = 'hover', className = '' }: Props) {
  const actions = useItemActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reloadDisabled = status === 'pending' || status === 'processing';

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const run = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); setOpen(false); };

  const triggerCls = variant === 'hover'
    ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
    : '';

  return (
    <div ref={rootRef} className={`relative ${className}`} onClick={stop}>
      <button
        type="button"
        aria-label="Item actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted shadow-sm hover:text-foreground ${triggerCls}`}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface-elevated text-sm shadow-lg">
          <button role="menuitem" type="button" onClick={run(() => actions.openItem(itemId))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10">Open</button>
          <button role="menuitem" type="button" disabled={reloadDisabled}
            onClick={run(() => { void actions.reloadItem(itemId); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50">Reload</button>
          <button role="menuitem" type="button" onClick={run(() => { void actions.deleteItem(itemId); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-500/10">Delete</button>
        </div>
      ) : null}
    </div>
  );
}
