'use client';

import type { Item } from '@/types';
import { useItemDrawer } from './ItemDrawerProvider';
import { thumbnailUrl } from './ItemCard';
import { ItemActionsMenu } from './ItemActionsMenu';
import { useSelection } from './SelectionProvider';
import { TypeIcon } from '@/components/ui/icons';

function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ItemRow({ item }: { item: Item }) {
  const drawer = useItemDrawer();
  const selection = useSelection();
  const selectionMode = selection.mode;
  const selected = selection.selectedIds.has(item.id);
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = domainFromUrl(item.source_url ?? item.raw_url);
  const selectedClass = selected ? 'border-l-2 border-l-accent bg-accent/5' : '';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selectionMode ? selected : undefined}
      onClick={(e) => {
        if (selectionMode) { e.preventDefault(); selection.toggle(item.id); return; }
        drawer.open(item.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selectionMode) selection.toggle(item.id);
          else drawer.open(item.id);
        }
      }}
      data-testid="item-row"
      data-category={item.category ?? ''}
      className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-elevated p-2.5 text-left shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${selectedClass}`}
    >
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); selection.toggle(item.id); }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${item.title ?? 'item'}`}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-accent"
        />
      ) : null}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <TypeIcon type={item.type} size={18} strokeWidth={1.75} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {isPending ? `${item.status}…` : isError ? (item.error_msg ?? 'error') : (item.title ?? '(untitled)')}
        </div>
        <div className="truncate text-xs text-muted">
          {domain ? `${domain} · ` : ''}{item.type}
        </div>
      </div>
      {item.category ? (
        <span className="hidden shrink-0 rounded-md bg-foreground/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted sm:inline">
          {item.category}
        </span>
      ) : null}
      <span className="hidden shrink-0 text-[11px] text-muted sm:inline">{relativeDate(item.created)}</span>
      {!selectionMode ? (
        <div className="ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
        </div>
      ) : null}
    </div>
  );
}
