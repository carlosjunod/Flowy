'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item, ItemExploration } from '@/types';
import { getPb, updateItem, deleteItem, type ItemPatch } from '@/lib/pocketbase';
import { shareItem } from '@/lib/share';
import { TypeIcon, XIcon, ArrowUpRightIcon, ShareIcon, TrashIcon, RotateIcon, SparkleIcon } from '@/components/ui/icons';
import { useItemActions } from '@/lib/hooks/useItemActions';
import { Spinner } from '@/components/ui/Spinner';

const CONTENT_LABEL: Record<string, string> = {
  url: 'Article text',
  youtube: 'Transcript',
  video: 'Transcript',
  screenshot: 'OCR text',
  receipt: 'Receipt text',
  pdf: 'Extracted text',
  audio: 'Transcript',
  screen_recording: 'Transcript',
};

interface Props {
  itemId: string;
  onClose: () => void;
  onUpdated: (item: Item) => void;
  onDeleted: (id: string) => void;
}

function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

function youtubeIdFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) { const m = url.match(p); if (m && m[1]) return m[1]; }
  return null;
}

function r2Url(item: Item): string | null {
  const pub = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '';
  if (!item.r2_key || !pub) return null;
  return `${pub.replace(/\/$/, '')}/${item.r2_key}`;
}

function r2UrlForKey(key?: string): string | null {
  const pub = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '';
  if (!key || !pub) return null;
  return `${pub.replace(/\/$/, '')}/${key}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function ItemDrawer({ itemId, onClose, onUpdated, onDeleted }: Props) {
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemPatch>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [zoomed, setZoomed] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const actions = useItemActions();
  const reloadDisabled = !item || item.status === 'pending' || item.status === 'processing';
  const exploring = item?.exploration?.status === 'exploring';
  const exploreDisabled = !item || item.status !== 'ready' || exploring;

  useEffect(() => {
    let cancelled = false;
    setItem(null);
    setLoadError(null);
    setDraft({});
    (async () => {
      try {
        const pb = getPb();
        const fetched = await pb.collection('items').getOne<Item>(itemId);
        if (cancelled) return;
        setItem(fetched);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load');
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  useEffect(() => {
    panelRef.current?.focus();
  }, [item]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  const merged: Item | null = useMemo(() => {
    if (!item) return null;
    return {
      ...item,
      title: draft.title ?? item.title,
      summary: draft.summary ?? item.summary,
      category: draft.category !== undefined ? (draft.category ?? undefined) : item.category,
      tags: draft.tags ?? item.tags,
      content: draft.content ?? item.content,
    };
  }, [item, draft]);

  const hasChanges = useMemo(() => {
    if (!item) return false;
    if (draft.title !== undefined && draft.title !== (item.title ?? '')) return true;
    if (draft.summary !== undefined && draft.summary !== (item.summary ?? '')) return true;
    if (draft.content !== undefined && draft.content !== (item.content ?? '')) return true;
    if (draft.category !== undefined && (draft.category ?? null) !== (item.category ?? null)) return true;
    if (draft.tags !== undefined) {
      const a = draft.tags.join('\u0001');
      const b = (item.tags ?? []).join('\u0001');
      if (a !== b) return true;
    }
    return false;
  }, [item, draft]);

  const commitPatch = useCallback(async (patch: ItemPatch) => {
    if (!item) return;
    setSaving(true);
    try {
      const updated = await updateItem(item.id, patch);
      const next: Item = { ...item, ...updated } as Item;
      setItem(next);
      setDraft({});
      onUpdated(next);
      showToast('Saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [item, onUpdated, showToast]);

  const handleSave = useCallback(() => {
    if (!hasChanges) return;
    const patch: ItemPatch = {};
    if (draft.title !== undefined) patch.title = draft.title;
    if (draft.summary !== undefined) patch.summary = draft.summary;
    if (draft.content !== undefined) patch.content = draft.content;
    if (draft.category !== undefined) patch.category = draft.category;
    if (draft.tags !== undefined) patch.tags = draft.tags;
    void commitPatch(patch);
  }, [commitPatch, draft, hasChanges]);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    if (!window.confirm('Delete this item? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteItem(item.id);
      onDeleted(item.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }, [item, onDeleted, showToast]);

  const handleShare = useCallback(async () => {
    if (!merged) return;
    const result = await shareItem(merged);
    if (result === 'copied') showToast('Link copied');
    else if (result === 'failed') showToast('Share not supported');
  }, [merged, showToast]);

  const addTag = useCallback((raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    const current = draft.tags ?? item?.tags ?? [];
    if (current.includes(v)) return;
    setDraft((d) => ({ ...d, tags: [...current, v] }));
    setTagInput('');
  }, [draft.tags, item]);

  const removeTag = useCallback((tag: string) => {
    const current = draft.tags ?? item?.tags ?? [];
    setDraft((d) => ({ ...d, tags: current.filter((t) => t !== tag) }));
  }, [draft.tags, item]);

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in" role="dialog" aria-modal="true" aria-label="Item details">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="flex-1 bg-foreground/40 backdrop-blur-sm"
        tabIndex={-1}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        data-testid="item-drawer"
        className="h-full w-full max-w-xl animate-fade-up overflow-y-auto border-l border-border bg-background p-5 text-sm text-foreground shadow-elev outline-none"
      >
        {loadError ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground">
              <XIcon size={14} /> Close
            </button>
            <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{loadError}</p>
          </div>
        ) : !merged ? (
          <div className="flex items-center gap-2 text-muted">
            <Spinner size={14} tone="accent" />
            Loading…
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted" aria-hidden>
                  <TypeIcon type={merged.type} size={16} strokeWidth={1.75} />
                </span>
                <input
                  aria-label="Title"
                  value={draft.title ?? merged.title ?? ''}
                  placeholder="(untitled)"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="min-w-0 flex-1 bg-transparent pb-1 text-lg font-semibold text-foreground outline-none placeholder:text-muted/60 focus:border-b focus:border-accent"
                />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
              ><XIcon size={16} /></button>
            </div>

            <Hero item={merged} zoomed={zoomed} onToggleZoom={() => setZoomed((z) => !z)} />

            <div className="mt-4 flex flex-wrap gap-2">
              {(merged.source_url || merged.raw_url) ? (
                <a
                  href={merged.source_url ?? merged.raw_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-accent/40 hover:text-accent active:scale-[0.97]"
                >
                  <ArrowUpRightIcon size={12} />
                  <span>Open source</span>
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-foreground/30 active:scale-[0.97]"
              >
                <ShareIcon size={12} />
                <span>Share</span>
              </button>
              <button
                type="button"
                onClick={() => item && actions.reloadItem(item.id)}
                disabled={reloadDisabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-foreground/30 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateIcon size={12} />
                <span>Reload</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!item) return;
                  const res = await actions.exploreMany([item.id]);
                  if (res.ok) showToast('Exploring…');
                  else showToast(`Explore failed: ${res.error}`);
                }}
                disabled={exploreDisabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-all hover:bg-accent/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparkleIcon size={12} />
                <span>{exploring ? 'Exploring…' : 'Explore'}</span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-all hover:border-red-400 active:scale-[0.97] disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:border-red-800"
              >
                <TrashIcon size={12} />
                <span>{deleting ? 'Deleting…' : 'Delete'}</span>
              </button>
            </div>

            <section className="mt-6 flex flex-col gap-4">
              <Field label="Category">
                <input
                  value={draft.category !== undefined ? (draft.category ?? '') : (merged.category ?? '')}
                  placeholder="uncategorized"
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value || null }))}
                  className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </Field>

              <Field label="Tags">
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface-elevated p-2">
                  {(draft.tags ?? merged.tags ?? []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-xs text-foreground">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove ${tag}`}
                        className="text-muted hover:text-foreground"
                      ><XIcon size={10} /></button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    placeholder="add tag…"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag(tagInput);
                      } else if (e.key === 'Backspace' && !tagInput) {
                        const list = draft.tags ?? merged.tags ?? [];
                        if (list.length) removeTag(list[list.length - 1]!);
                      }
                    }}
                    onBlur={() => tagInput && addTag(tagInput)}
                    className="min-w-[6rem] flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted/70"
                  />
                </div>
              </Field>

              <Field label="Summary">
                <textarea
                  value={draft.summary ?? merged.summary ?? ''}
                  placeholder="Short summary…"
                  onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </Field>

              <Field label={CONTENT_LABEL[merged.type] ?? 'Content'}>
                <textarea
                  value={draft.content ?? merged.content ?? ''}
                  placeholder="No content extracted yet."
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
              </Field>

              {merged.exploration ? <ExplorationSection exploration={merged.exploration} /> : null}
            </section>

            <div className="sticky bottom-0 -mx-5 mt-6 flex items-center justify-between gap-2 border-t border-border bg-background/95 px-5 py-3 backdrop-blur-xl">
              <span className="text-[11px] text-muted">
                {formatDate(merged.created)}
                {merged.updated && merged.updated !== merged.created ? ` · edited ${formatDate(merged.updated)}` : ''}
              </span>
              <div className="flex items-center gap-2">
                {hasChanges ? (
                  <button
                    type="button"
                    onClick={() => setDraft({})}
                    className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
                  >Discard</button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background shadow-card transition-all hover:bg-accent/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-foreground/20 disabled:text-muted disabled:shadow-none"
                >{saving ? <Spinner size={12} tone="background" /> : null}{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted/70">
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(merged.id); showToast('ID copied'); }}
                className="font-mono hover:text-muted"
                title="Copy id"
              >{merged.id}</button>
            </div>
          </>
        )}

        {toast ? (
          <div className="fixed bottom-6 right-6 animate-fade-up rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-background shadow-elev">
            {toast}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ExplorationSection({ exploration }: { exploration: ItemExploration }) {
  const { status, primary_link, candidates, video_insights, notes, error_msg } = exploration;
  return (
    <div data-testid="exploration-section" className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-accent">
        <SparkleIcon size={12} strokeWidth={2} />
        <span>Advanced exploration</span>
        <span className="ml-auto text-muted">{status}</span>
      </div>
      {status === 'exploring' ? (
        <p className="text-xs text-muted">Re-evaluating this item with web search…</p>
      ) : null}
      {status === 'error' ? (
        <p className="text-xs text-red-500">{error_msg ?? 'Exploration failed'}</p>
      ) : null}
      {primary_link ? (
        <a
          href={primary_link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
        >
          <ArrowUpRightIcon size={12} />
          <span className="truncate">{primary_link.title || primary_link.url}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-accent/70">{primary_link.kind}</span>
        </a>
      ) : null}
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Candidates</span>
          <ul className="flex flex-col gap-1">
            {candidates.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-elevated p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">{c.kind}</span>
                  <span className="ml-auto text-[10px] text-muted">{(c.confidence * 100).toFixed(0)}%</span>
                </div>
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-accent hover:underline">{c.url}</a>
                ) : null}
                {c.reason ? <p className="text-muted">{c.reason}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {video_insights && video_insights.frames_analyzed > 0 ? (
        <div className="rounded-md border border-border bg-surface p-2 text-[11px] text-muted">
          <span className="font-medium text-foreground">Video frames:</span> analyzed {video_insights.frames_analyzed}
          {video_insights.on_screen_text ? ` · on-screen text captured` : ''}
        </div>
      ) : null}
      {notes ? <p className="text-[11px] text-muted">{notes}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Hero({ item, zoomed, onToggleZoom }: { item: Item; zoomed: boolean; onToggleZoom: () => void }) {
  const hasMultiMedia = Array.isArray(item.media) && item.media.length > 1;
  const imageTypes = new Set(['screenshot', 'receipt', 'pdf']);

  if (hasMultiMedia) {
    return <MediaCarousel item={item} zoomed={zoomed} onToggleZoom={onToggleZoom} />;
  }

  if (item.type === 'screen_recording') {
    const mediaKey = item.media?.[0]?.r2_key;
    const videoUrl = r2UrlForKey(mediaKey) ?? r2Url(item);
    if (videoUrl) {
      return (
        <video
          controls
          src={videoUrl}
          poster={r2Url(item) ?? undefined}
          className="w-full max-h-96 rounded-lg border border-white/10 bg-black"
        />
      );
    }
  }

  if (imageTypes.has(item.type)) {
    const url = r2Url(item);
    if (!url) return <HeroFallback item={item} />;
    return (
      <button
        type="button"
        onClick={onToggleZoom}
        className={`relative block w-full overflow-hidden rounded-xl border border-border bg-surface ${zoomed ? '' : 'max-h-96'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={item.title ?? ''} className={`w-full ${zoomed ? '' : 'max-h-96 object-contain'}`} />
      </button>
    );
  }
  if (item.type === 'youtube') {
    const id = youtubeIdFromUrl(item.source_url ?? item.raw_url);
    if (!id) return <HeroFallback item={item} />;
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface">
        <iframe
          src={`https://www.youtube.com/embed/${id}`}
          title={item.title ?? 'YouTube video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  if (item.type === 'video') {
    const url = r2Url(item);
    if (url) {
      return (
        <video
          controls
          src={url}
          poster={r2Url(item) ?? undefined}
          className="w-full max-h-96 rounded-xl border border-border bg-surface"
        />
      );
    }
  }
  return <HeroFallback item={item} />;
}

function MediaCarousel({ item, zoomed, onToggleZoom }: { item: Item; zoomed: boolean; onToggleZoom: () => void }) {
  const slides = (item.media ?? []).slice().sort((a, b) => a.index - b.index);
  const [active, setActive] = useState(0);
  const activeSlide = slides[active] ?? slides[0];
  if (!activeSlide) return <HeroFallback item={item} />;
  const activeUrl = r2UrlForKey(activeSlide.r2_key);
  const count = slides.length;

  const go = (delta: number) => {
    setActive((i) => (i + delta + count) % count);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="item-carousel">
      <div className={`relative w-full overflow-hidden rounded-lg border border-white/10 bg-black ${zoomed ? '' : 'max-h-96'}`}>
        {activeUrl ? (
          activeSlide.kind === 'video' ? (
            <video
              key={activeSlide.r2_key}
              controls
              src={activeUrl}
              className="w-full max-h-96 bg-black"
            />
          ) : (
            <button
              type="button"
              onClick={onToggleZoom}
              className="block w-full"
              aria-label={`Image ${active + 1} of ${count}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeUrl}
                alt={activeSlide.summary ?? `Image ${active + 1}`}
                className={`w-full ${zoomed ? '' : 'max-h-96 object-contain'}`}
              />
            </button>
          )
        ) : (
          <HeroFallback item={item} />
        )}

        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white/80">
          {active + 1} / {count}
        </span>

        <button
          type="button"
          aria-label="Previous image"
          onClick={() => go(-1)}
          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-white/80 hover:bg-black/80"
        >‹</button>
        <button
          type="button"
          aria-label="Next image"
          onClick={() => go(1)}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2 py-1 text-white/80 hover:bg-black/80"
        >›</button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {slides.map((s, i) => {
          const thumbUrl = r2UrlForKey(s.r2_key);
          return (
            <button
              type="button"
              key={s.r2_key}
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === active}
              className={`relative h-14 w-14 flex-shrink-0 overflow-hidden rounded border ${
                i === active ? 'border-white/70' : 'border-white/15 hover:border-white/40'
              }`}
            >
              {thumbUrl ? (
                s.kind === 'video' ? (
                  <div className="flex h-full w-full items-center justify-center bg-black text-lg">🎬</div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/5 text-xs text-white/40">{i + 1}</div>
              )}
            </button>
          );
        })}
      </div>

      {activeSlide.summary ? (
        <p className="text-xs text-white/60">{activeSlide.summary}</p>
      ) : null}
    </div>
  );
}

function HeroFallback({ item }: { item: Item }) {
  const domain = domainFromUrl(item.source_url ?? item.raw_url);
  const favicon = domain ? `https://www.google.com/s2/favicons?sz=128&domain=${domain}` : null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
      {favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" className="h-10 w-10 rounded-md" />
      ) : (
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-elevated text-muted" aria-hidden>
          <TypeIcon type={item.type} size={20} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{domain ?? item.type}</div>
        {item.source_url || item.raw_url ? (
          <div className="truncate text-xs text-muted">{item.source_url ?? item.raw_url}</div>
        ) : null}
      </div>
    </div>
  );
}
