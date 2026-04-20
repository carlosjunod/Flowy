'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '@/types';
import { getPb, updateItem, deleteItem, type ItemPatch } from '@/lib/pocketbase';
import { shareItem } from '@/lib/share';

const TYPE_GLYPH: Record<string, string> = {
  url: '🔗', screenshot: '🖼️', youtube: '▶', receipt: '🧾', pdf: '📄', audio: '🎧', video: '🎬',
};

const CONTENT_LABEL: Record<string, string> = {
  url: 'Article text',
  youtube: 'Transcript',
  video: 'Transcript',
  screenshot: 'OCR text',
  receipt: 'Receipt text',
  pdf: 'Extracted text',
  audio: 'Transcript',
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
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Item details">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="flex-1 bg-black/60 backdrop-blur-sm"
        tabIndex={-1}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        data-testid="item-drawer"
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0a0a0a] p-5 text-sm text-white shadow-2xl outline-none"
      >
        {loadError ? (
          <div className="flex flex-col gap-3">
            <button type="button" onClick={onClose} className="self-start text-white/60 hover:text-white">✕ Close</button>
            <p className="rounded-lg bg-red-500/10 p-3 text-red-300">{loadError}</p>
          </div>
        ) : !merged ? (
          <div className="flex items-center gap-2 text-white/60">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Loading…
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="text-lg" aria-hidden>{TYPE_GLYPH[merged.type] ?? '📎'}</span>
                <input
                  aria-label="Title"
                  value={draft.title ?? merged.title ?? ''}
                  placeholder="(untitled)"
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-white/30 focus:border-b focus:border-white/30"
                />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >✕</button>
            </div>

            <Hero item={merged} zoomed={zoomed} onToggleZoom={() => setZoomed((z) => !z)} />

            <div className="mt-4 flex flex-wrap gap-2">
              {(merged.source_url || merged.raw_url) ? (
                <a
                  href={merged.source_url ?? merged.raw_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-white/30"
                >↗ Open source</a>
              ) : null}
              <button
                type="button"
                onClick={handleShare}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-white/30"
              >↗ Share</button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:border-red-400/60 disabled:opacity-50"
              >{deleting ? 'Deleting…' : '🗑 Delete'}</button>
            </div>

            <section className="mt-6 flex flex-col gap-3">
              <Field label="Category">
                <input
                  value={draft.category !== undefined ? (draft.category ?? '') : (merged.category ?? '')}
                  placeholder="uncategorized"
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value || null }))}
                  className="w-full rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-white/40"
                />
              </Field>

              <Field label="Tags">
                <div className="flex flex-wrap gap-1 rounded-md border border-white/15 bg-black/40 p-1.5">
                  {(draft.tags ?? merged.tags ?? []).map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`Remove ${tag}`}
                        className="text-white/50 hover:text-white"
                      >×</button>
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
                    className="flex-1 min-w-[6rem] bg-transparent px-1 text-xs outline-none placeholder:text-white/30"
                  />
                </div>
              </Field>

              <Field label="Summary">
                <textarea
                  value={draft.summary ?? merged.summary ?? ''}
                  placeholder="Short summary…"
                  onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                  rows={3}
                  className="w-full resize-y rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm outline-none focus:border-white/40"
                />
              </Field>

              <Field label={CONTENT_LABEL[merged.type] ?? 'Content'}>
                <textarea
                  value={draft.content ?? merged.content ?? ''}
                  placeholder="No content extracted yet."
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  rows={10}
                  className="w-full resize-y rounded-md border border-white/15 bg-black/40 px-2 py-1.5 font-mono text-xs outline-none focus:border-white/40"
                />
              </Field>
            </section>

            <div className="sticky bottom-0 mt-4 -mx-5 flex items-center justify-between gap-2 border-t border-white/10 bg-[#0a0a0a]/95 px-5 py-3">
              <span className="text-[11px] text-white/40">
                {formatDate(merged.created)}
                {merged.updated && merged.updated !== merged.created ? ` · edited ${formatDate(merged.updated)}` : ''}
              </span>
              <div className="flex items-center gap-2">
                {hasChanges ? (
                  <button
                    type="button"
                    onClick={() => setDraft({})}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs hover:border-white/30"
                  >Discard</button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
                >{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-white/30">
              <button
                type="button"
                onClick={() => { void navigator.clipboard?.writeText(merged.id); showToast('ID copied'); }}
                className="font-mono hover:text-white/60"
                title="Copy id"
              >{merged.id}</button>
            </div>
          </>
        )}

        {toast ? (
          <div className="fixed bottom-6 right-6 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black shadow-lg">
            {toast}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
      {children}
    </label>
  );
}

function Hero({ item, zoomed, onToggleZoom }: { item: Item; zoomed: boolean; onToggleZoom: () => void }) {
  const imageTypes = new Set(['screenshot', 'receipt', 'pdf']);
  if (imageTypes.has(item.type)) {
    const url = r2Url(item);
    if (!url) return <HeroFallback item={item} />;
    return (
      <button
        type="button"
        onClick={onToggleZoom}
        className={`relative block w-full overflow-hidden rounded-lg border border-white/10 bg-black ${zoomed ? '' : 'max-h-96'}`}
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
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
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
          className="w-full max-h-96 rounded-lg border border-white/10 bg-black"
        />
      );
    }
  }
  return <HeroFallback item={item} />;
}

function HeroFallback({ item }: { item: Item }) {
  const domain = domainFromUrl(item.source_url ?? item.raw_url);
  const favicon = domain ? `https://www.google.com/s2/favicons?sz=128&domain=${domain}` : null;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
      {favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" className="h-10 w-10 rounded" />
      ) : (
        <span className="text-3xl" aria-hidden>{TYPE_GLYPH[item.type] ?? '📎'}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{domain ?? item.type}</div>
        {item.source_url || item.raw_url ? (
          <div className="truncate text-xs text-white/50">{item.source_url ?? item.raw_url}</div>
        ) : null}
      </div>
    </div>
  );
}
