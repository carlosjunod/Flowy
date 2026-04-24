'use client';

import { useEffect, useRef, useState } from 'react';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import { useItemActions } from '@/lib/hooks/useItemActions';
import type { ChatItemRef } from './ChatMessage';
import { TypeIcon } from '@/components/ui/icons';

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

interface Props {
  id: string;
  item?: ChatItemRef;
  status?: 'pending' | 'processing' | 'ready' | 'error';
}

export function ItemChip({ id, item, status = 'ready' }: Props) {
  const drawer = useItemDrawer();
  const actions = useItemActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const label = item?.title ? truncate(item.title, 32) : id;
  const reloadDisabled = status === 'pending' || status === 'processing';

  const clearLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation(); fn(); setMenuOpen(false);
  };

  return (
    <span ref={rootRef} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => { if (!menuOpen) drawer.open(id); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
        onPointerDown={() => { longPressTimer.current = setTimeout(() => setMenuOpen(true), 500); }}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'F10') { e.preventDefault(); setMenuOpen(true); }
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="chat-item-chip"
        className="inline-flex items-baseline gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/20"
      >
        <TypeIcon type={item?.type ?? 'url'} size={11} strokeWidth={2} className="translate-y-[1px]" />
        <span className="max-w-[18ch] truncate">{label}</span>
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface-elevated text-sm shadow-lg"
        >
          <button role="menuitem" type="button" onClick={run(() => actions.openItem(id))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10">Open</button>
          <button role="menuitem" type="button" disabled={reloadDisabled}
            onClick={run(() => { void actions.reloadItem(id); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50">Reload</button>
          <button role="menuitem" type="button" onClick={run(() => { void actions.deleteItem(id); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-500/10">Delete</button>
        </div>
      ) : null}
    </span>
  );
}
