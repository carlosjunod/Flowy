'use client';

import type { Item } from '@/types';
import { useItemDrawer } from './ItemDrawerProvider';
import { thumbnailUrl } from './ItemCard';

const TYPE_GLYPH: Record<string, string> = {
  url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬',
};

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
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = domainFromUrl(item.source_url ?? item.raw_url);

  return (
    <button
      type="button"
      onClick={() => drawer.open(item.id)}
      data-testid="item-row"
      data-category={item.category ?? ''}
      className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2 text-left transition hover:border-white/30 hover:bg-white/10"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40 text-lg">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <span aria-hidden>{TYPE_GLYPH[item.type] ?? '📎'}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white/90">
          {isPending ? `${item.status}…` : isError ? (item.error_msg ?? 'error') : (item.title ?? '(untitled)')}
        </div>
        <div className="truncate text-xs text-white/40">
          {domain ? `${domain} · ` : ''}{item.type}
        </div>
      </div>
      {item.category ? (
        <span className="hidden shrink-0 rounded bg-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70 sm:inline">
          {item.category}
        </span>
      ) : null}
      <span className="hidden shrink-0 text-[11px] text-white/40 sm:inline">{relativeDate(item.created)}</span>
    </button>
  );
}
