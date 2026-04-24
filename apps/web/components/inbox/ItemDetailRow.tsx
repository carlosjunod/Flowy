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

export function ItemDetailRow({ item }: { item: Item }) {
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
      data-testid="item-detail-row"
      data-category={item.category ?? ''}
      className={`group relative flex w-full cursor-pointer gap-4 rounded-2xl border border-border bg-surface-elevated p-3 text-left shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${selectedClass}`}
    >
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => { e.stopPropagation(); selection.toggle(item.id); }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${item.title ?? 'item'}`}
          className="h-5 w-5 shrink-0 cursor-pointer self-start rounded border-border accent-accent"
        />
      ) : null}
      <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <TypeIcon type={item.type} size={28} strokeWidth={1.5} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            <TypeIcon type={item.type} size={12} strokeWidth={2} />
            <span>{item.category ?? 'uncategorized'}</span>
          </span>
          <span className="text-[11px] text-muted">{relativeDate(item.created)}</span>
        </div>
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
          {isPending ? `${item.status}…` : isError ? (item.error_msg ?? 'error') : (item.title ?? '(untitled)')}
        </h3>
        {item.summary ? <p className="line-clamp-2 text-xs leading-relaxed text-muted">{item.summary}</p> : null}
        <div className="mt-auto flex items-center gap-2 text-[11px] text-muted">
          {domain ? <span>{domain}</span> : null}
          {item.tags && item.tags.length > 0 ? (
            <span className="truncate">· {item.tags.slice(0, 4).join(' · ')}</span>
          ) : null}
        </div>
      </div>
      {!selectionMode ? (
        <div className="absolute right-3 top-3" onClick={(e) => e.stopPropagation()}>
          <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
        </div>
      ) : null}
    </div>
  );
}
