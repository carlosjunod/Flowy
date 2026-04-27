'use client';

import type { Item } from '@/types';
import { useItemDrawer } from './ItemDrawerProvider';
import { ItemActionsMenu } from './ItemActionsMenu';
import { useSelection } from './SelectionProvider';
import { TypeIcon, AlertTriangleIcon, ArrowUpRightIcon, SparkleIcon } from '@/components/ui/icons';

interface Props {
  item: Item;
}

function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function youtubeIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

function categoryColor(category?: string | null): string {
  if (!category) return 'cat-default';
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  const palette = ['cat-rose', 'cat-amber', 'cat-emerald', 'cat-sky', 'cat-violet', 'cat-fuchsia'];
  return palette[hash % palette.length] ?? palette[0]!;
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function thumbnailUrl(item: Item): string | null {
  const r2Public = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '';
  if (item.r2_key && r2Public) return `${r2Public.replace(/\/$/, '')}/${item.r2_key}`;
  if (r2Public && Array.isArray(item.media) && item.media.length > 0) {
    const first = item.media[0];
    if (first?.r2_key) return `${r2Public.replace(/\/$/, '')}/${first.r2_key}`;
  }
  if (item.type === 'youtube') {
    const id = youtubeIdFromUrl(item.source_url ?? item.raw_url);
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }
  if (item.type === 'url') {
    if (item.og_image) return item.og_image;
    const host = domainFromUrl(item.source_url ?? item.raw_url);
    if (host) return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  }
  return null;
}

function mediaCount(item: Item): number {
  return Array.isArray(item.media) ? item.media.length : 0;
}

function CardActionsSlot({ item }: { item: Item }) {
  return (
    <div
      data-testid="item-card-actions"
      className="absolute right-2 top-2 z-10"
      onClick={(e) => e.stopPropagation()}
    >
      <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
    </div>
  );
}

function ExplorationChip({ item }: { item: Item }) {
  const exp = item.exploration;
  if (!exp) return null;
  if (exp.status === 'exploring') {
    return (
      <span
        data-testid="explore-chip-loading"
        className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
        title="Exploring…"
      >
        <SparkleIcon size={10} strokeWidth={2} />
        <span>Exploring…</span>
      </span>
    );
  }
  if (exp.primary_link) {
    return (
      <a
        href={exp.primary_link.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        data-testid="explore-chip-primary"
        className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20"
        title={exp.primary_link.url}
      >
        <ArrowUpRightIcon size={10} strokeWidth={2} />
        <span className="truncate">{exp.primary_link.title || exp.primary_link.url}</span>
      </a>
    );
  }
  if (exp.candidates.length > 0) {
    return (
      <span
        data-testid="explore-chip-candidates"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated px-2 py-0.5 text-[10px] font-medium text-muted"
        title="Open the item to see candidate matches"
      >
        <SparkleIcon size={10} strokeWidth={2} />
        <span>{exp.candidates.length} candidate{exp.candidates.length === 1 ? '' : 's'}</span>
      </span>
    );
  }
  return null;
}

function SelectionCheckbox({ itemId, title }: { itemId: string; title?: string }) {
  const { selectedIds, toggle } = useSelection();
  const selected = selectedIds.has(itemId);
  return (
    <div className="absolute left-2 top-2 z-20" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => toggle(itemId)}
        aria-label={`Select ${title ?? 'item'}`}
        aria-checked={selected}
        className="h-5 w-5 cursor-pointer rounded border-border accent-accent"
      />
    </div>
  );
}

export function ItemCard({ item }: Props) {
  const drawer = useItemDrawer();
  const selection = useSelection();
  const selectionMode = selection.mode;
  const selected = selection.selectedIds.has(item.id);
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = item.site_name ?? domainFromUrl(item.source_url ?? item.raw_url);
  const categoryClass = categoryColor(item.category);
  const ringClass = selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : '';

  if (isPending) {
    return (
      <article
        data-testid="item-card-pending"
        className="pointer-events-none flex h-48 flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-3 shadow-card"
      >
        <div className="relative h-28 w-full overflow-hidden rounded-lg bg-surface">
          <div className="absolute inset-0 animate-shimmer bg-shimmer" />
        </div>
        <div className="relative h-3 w-2/3 overflow-hidden rounded bg-surface">
          <div className="absolute inset-0 animate-shimmer bg-shimmer" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted/30 border-t-accent" />
          <span className="capitalize">{item.status}…</span>
        </div>
      </article>
    );
  }

  if (isError) {
    return (
      <article
        data-testid="item-card-error"
        title={item.error_msg ?? 'Processing error'}
        aria-selected={selectionMode ? selected : undefined}
        onClick={selectionMode ? () => selection.toggle(item.id) : undefined}
        className={`group relative flex h-48 flex-col gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40 ${selectionMode ? 'cursor-pointer' : ''} ${ringClass}`}
      >
        <div className="flex h-28 items-center justify-center">
          <AlertTriangleIcon size={32} strokeWidth={1.5} className="text-red-500 dark:text-red-400" />
        </div>
        <span className="line-clamp-3 text-xs text-red-700 dark:text-red-300">{item.error_msg ?? 'error'}</span>
        {selectionMode ? <SelectionCheckbox itemId={item.id} title={item.title} /> : <CardActionsSlot item={item} />}
      </article>
    );
  }

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
      data-testid="item-card"
      data-category={item.category ?? ''}
      className={`group relative flex h-48 cursor-pointer flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface-elevated p-3 text-left shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${ringClass}`}
    >
      <div className="relative h-28 w-full overflow-hidden rounded-lg bg-surface">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.03]"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <TypeIcon type={item.type} size={32} strokeWidth={1.5} />
          </div>
        )}
        <span
          className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/85 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70 backdrop-blur-sm"
          aria-hidden
        >
          <TypeIcon type={item.type} size={11} strokeWidth={2} />
          <span>{item.type}</span>
        </span>
        {mediaCount(item) > 1 ? (
          <span
            data-testid="item-card-count"
            className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white/90"
            aria-label={`${mediaCount(item)} items`}
          >
            ▦ {mediaCount(item)}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryClass}`}>
          {item.category ?? 'uncategorized'}
        </span>
        <span className="text-[11px] text-muted">{relativeDate(item.created)}</span>
      </div>
      <p className="line-clamp-2 text-sm font-medium text-foreground">
        {item.title ?? '(untitled)'}
      </p>
      {domain ? <span className="truncate text-xs text-muted">{domain}</span> : null}
      {item.exploration ? <ExplorationChip item={item} /> : null}
      {selectionMode ? <SelectionCheckbox itemId={item.id} title={item.title} /> : <CardActionsSlot item={item} />}
    </div>
  );
}
