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

export function ItemDetailRow({ item }: { item: Item }) {
  const drawer = useItemDrawer();
  const isPending = item.status === 'pending' || item.status === 'processing';
  const isError = item.status === 'error';
  const thumb = thumbnailUrl(item);
  const domain = domainFromUrl(item.source_url ?? item.raw_url);

  return (
    <button
      type="button"
      onClick={() => drawer.open(item.id)}
      data-testid="item-detail-row"
      data-category={item.category ?? ''}
      className="flex w-full gap-4 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/30 hover:bg-white/10"
    >
      <div className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40 text-2xl">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        ) : (
          <span aria-hidden>{TYPE_GLYPH[item.type] ?? '📎'}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-white/50">
            {TYPE_GLYPH[item.type] ?? '📎'} {item.category ?? 'uncategorized'}
          </span>
          <span className="text-[11px] text-white/40">{relativeDate(item.created)}</span>
        </div>
        <h3 className="line-clamp-1 text-sm font-semibold text-white">
          {isPending ? `${item.status}…` : isError ? (item.error_msg ?? 'error') : (item.title ?? '(untitled)')}
        </h3>
        {item.summary ? <p className="line-clamp-2 text-xs text-white/60">{item.summary}</p> : null}
        <div className="mt-auto flex items-center gap-2 text-[11px] text-white/40">
          {domain ? <span>{domain}</span> : null}
          {item.tags && item.tags.length > 0 ? (
            <span className="truncate">· {item.tags.slice(0, 4).join(' · ')}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
