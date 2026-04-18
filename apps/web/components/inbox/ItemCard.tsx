'use client';

import type { Item } from '@/types';

interface Props {
  item: Item;
}

const TYPE_GLYPH: Record<string, string> = {
  url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬',
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

function thumbnailUrl(item: Item): string | null {
  const r2Public = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '';
  if (item.r2_key && r2Public) return `${r2Public.replace(/\/$/, '')}/${item.r2_key}`;
  if (item.type === 'youtube') {
    const id = youtubeIdFromUrl(item.source_url ?? item.raw_url);
    if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }
  if (item.type === 'url') {
    const host = domainFromUrl(item.source_url ?? item.raw_url);
    if (host) return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  }
  return null;
}

export function ItemCard({ item }: Props) {
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = domainFromUrl(item.source_url ?? item.raw_url);
  const categoryClass = categoryColor(item.category);

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
        className="flex h-44 flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3"
      >
        <div className="flex h-24 items-center justify-center text-3xl" aria-hidden>⚠️</div>
        <span className="text-xs text-red-300">{item.error_msg ?? 'error'}</span>
      </article>
    );
  }

  return (
    <a
      href={item.source_url ?? item.raw_url ?? '#'}
      target="_blank"
      rel="noreferrer"
      data-testid="item-card"
      data-category={item.category ?? ''}
      className="group flex h-44 flex-col gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-white/30 hover:bg-white/10"
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
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs" aria-hidden>
          {TYPE_GLYPH[item.type] ?? '📎'}
        </span>
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
    </a>
  );
}
