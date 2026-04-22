'use client';

import { useState } from 'react';
import type { Item } from '@/types';
import { useItemDrawer } from './ItemDrawerProvider';
import { retryItem, deleteItem } from '@/lib/items-actions';
import { TypeIcon, RotateIcon, TrashIcon, AlertTriangleIcon } from '@/components/ui/icons';

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

interface HoverActionsProps {
  item: Item;
  onRetry?: () => void;
  onDelete: () => void;
  busy: boolean;
}

function HoverActions({ item, onRetry, onDelete, busy }: HoverActionsProps) {
  const stopAll = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };
  const base =
    'rounded-full border border-border bg-surface-elevated/90 p-1.5 text-foreground/70 backdrop-blur-sm transition-all hover:border-foreground/30 hover:bg-surface-elevated hover:text-foreground disabled:opacity-40 active:scale-95 dark:bg-surface-elevated/80';
  return (
    <div
      data-testid="item-card-actions"
      className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
    >
      {onRetry ? (
        <button
          type="button"
          title="Retry"
          aria-label="Retry item"
          data-testid="item-card-retry"
          disabled={busy}
          onClick={(e) => { stopAll(e); onRetry(); }}
          onKeyDown={stopAll}
          className={base}
        >
          <RotateIcon size={14} />
        </button>
      ) : null}
      <button
        type="button"
        title="Delete"
        aria-label="Delete item"
        data-testid="item-card-delete"
        disabled={busy}
        onClick={(e) => { stopAll(e); onDelete(); }}
        onKeyDown={stopAll}
        className={`${base} hover:border-red-400 hover:text-red-700 dark:hover:border-red-700 dark:hover:text-red-300`}
      >
        <TrashIcon size={14} />
        <span className="sr-only">Delete {item.title ?? 'item'}</span>
      </button>
    </div>
  );
}

export function ItemCard({ item }: Props) {
  const drawer = useItemDrawer();
  const [busy, setBusy] = useState(false);
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = item.site_name ?? domainFromUrl(item.source_url ?? item.raw_url);
  const categoryClass = categoryColor(item.category);

  const confirmDelete = async () => {
    if (busy) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this item?')) return;
    setBusy(true);
    const res = await deleteItem(item.id);
    if (res.ok) {
      drawer.emit({ kind: 'deleted', id: item.id });
    } else {
      setBusy(false);
      if (typeof window !== 'undefined') window.alert(`Delete failed: ${res.error}`);
    }
  };

  const triggerRetry = async () => {
    if (busy) return;
    setBusy(true);
    const res = await retryItem(item.id);
    if (res.ok) {
      drawer.emit({ kind: 'retried', item: res.data });
    } else {
      setBusy(false);
      if (typeof window !== 'undefined') window.alert(`Retry failed: ${res.error}`);
    }
  };

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
        className="group relative flex h-48 flex-col gap-2 rounded-2xl border border-red-300 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/40"
      >
        <div className="flex h-28 items-center justify-center">
          <AlertTriangleIcon size={32} strokeWidth={1.5} className="text-red-500 dark:text-red-400" />
        </div>
        <span className="line-clamp-3 text-xs text-red-700 dark:text-red-300">{item.error_msg ?? 'error'}</span>
        <HoverActions item={item} onRetry={triggerRetry} onDelete={confirmDelete} busy={busy} />
      </article>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => drawer.open(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          drawer.open(item.id);
        }
      }}
      data-testid="item-card"
      data-category={item.category ?? ''}
      className="group relative flex h-48 cursor-pointer flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-surface-elevated p-3 text-left shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-card-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
      <HoverActions item={item} onDelete={confirmDelete} busy={busy} />
    </div>
  );
}
