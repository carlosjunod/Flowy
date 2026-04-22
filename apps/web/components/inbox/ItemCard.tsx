'use client';

import { useState } from 'react';
import type { Item } from '@/types';
import { useItemDrawer } from './ItemDrawerProvider';
import { retryItem, deleteItem } from '@/lib/items-actions';

interface Props {
  item: Item;
}

const TYPE_GLYPH: Record<string, string> = {
  url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬', screen_recording: '🎥',
};

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
  if (!category) return 'bg-white/10 text-white/70';
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  const palette = [
    'bg-rose-500/20 text-rose-200',
    'bg-amber-500/20 text-amber-200',
    'bg-emerald-500/20 text-emerald-200',
    'bg-sky-500/20 text-sky-200',
    'bg-violet-500/20 text-violet-200',
    'bg-fuchsia-500/20 text-fuchsia-200',
  ];
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
    'rounded-full bg-black/70 p-1.5 text-white/80 backdrop-blur transition hover:bg-black/90 hover:text-white disabled:opacity-40';
  return (
    <div
      data-testid="item-card-actions"
      className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
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
          ↻
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
        className={base}
      >
        {/* trash glyph */}
        <span aria-hidden>🗑</span>
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
        className="pointer-events-none flex h-44 flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3"
      >
        <div className="h-24 w-full animate-pulse rounded-md bg-white/10" />
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <span>{item.status}…</span>
        </div>
      </article>
    );
  }

  if (isError) {
    return (
      <article
        data-testid="item-card-error"
        title={item.error_msg ?? 'Processing error'}
        className="group relative flex h-44 flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3"
      >
        <div className="flex h-24 items-center justify-center text-3xl" aria-hidden>⚠️</div>
        <span className="line-clamp-3 text-xs text-red-300">{item.error_msg ?? 'error'}</span>
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
      className="group relative flex h-44 cursor-pointer flex-col gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/30 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div className="relative h-24 w-full overflow-hidden rounded-md bg-black/40">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden>
            {TYPE_GLYPH[item.type] ?? '📎'}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs" aria-hidden>
          {TYPE_GLYPH[item.type] ?? '📎'}
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
        <span className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wide ${categoryClass}`}>
          {item.category ?? 'uncategorized'}
        </span>
        <span className="text-[11px] text-white/40">{relativeDate(item.created)}</span>
      </div>
      <p className="line-clamp-2 text-sm font-medium text-white/90">
        {item.title ?? '(untitled)'}
      </p>
      {domain ? <span className="text-xs text-white/40">{domain}</span> : null}
      <HoverActions item={item} onDelete={confirmDelete} busy={busy} />
    </div>
  );
}
