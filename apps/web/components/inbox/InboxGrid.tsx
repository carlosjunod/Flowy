'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { deleteItem as deleteItemAction } from '@/lib/items-actions';
import { ItemCard } from './ItemCard';
import { ItemRow } from './ItemRow';
import { ItemDetailRow } from './ItemDetailRow';
import { FilterBar, type SortMode, type SortDirection, type ViewMode } from './FilterBar';
import { useItemDrawer } from './ItemDrawerProvider';
import { InboxIcon, SearchIcon, TrashIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 20;
const VIEW_KEY = 'flowy:view-mode';
const SORT_KEY = 'flowy:sort';
const DIR_KEY = 'flowy:sort-dir';

interface Props {
  filter?: string | null;
  sort?: SortMode;
}

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function InboxGrid({ filter: filterProp = null, sort: sortProp = 'date' }: Props) {
  const drawer = useItemDrawer();
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<string | null>(filterProp);
  const [importedOnly, setImportedOnly] = useState(false);
  const [sort, setSort] = useState<SortMode>(sortProp);
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setView(readPref<ViewMode>(VIEW_KEY, 'grid', ['grid', 'list', 'detail']));
    setSort(readPref<SortMode>(SORT_KEY, sortProp, ['date', 'category', 'type', 'bookmarked_at']));
    setDirection(readPref<SortDirection>(DIR_KEY, 'desc', ['asc', 'desc']));
  }, [sortProp]);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, view);
  }, [view]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(SORT_KEY, sort);
  }, [sort]);
  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(DIR_KEY, direction);
  }, [direction]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const sortExpr = useMemo(() => {
    const prefix = direction === 'asc' ? '+' : '-';
    switch (sort) {
      case 'category': return `${prefix}category,-created`;
      case 'type': return `${prefix}type,-created`;
      case 'bookmarked_at':
        // Oldest bookmarks first pushes the decade-old cruft to the top for
        // triage, so ascending is the useful default regardless of user dir.
        return `${direction === 'asc' ? '+' : '-'}bookmarked_at,-created`;
      default: return `${prefix}created`;
    }
  }, [sort, direction]);

  const load = useCallback(async (nextPage: number, reset: boolean) => {
    setLoading(true);
    try {
      const pb = getPb();
      if (!pb.authStore.isValid) {
        setItems([]);
        setHasMore(false);
        return;
      }
      const parts = [`user = "${pb.authStore.model?.id}"`];
      if (importedOnly) parts.push(`source = "bookmark_import"`);
      const filterExpr = parts.join(' && ');
      const result = await pb.collection('items').getList<Item>(nextPage, PAGE_SIZE, {
        filter: filterExpr,
        sort: sortExpr,
      });
      setHasMore(result.page * result.perPage < result.totalItems);
      setItems((prev) => (reset ? result.items : [...prev, ...result.items]));
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [sortExpr, importedOnly]);

  useEffect(() => {
    setPage(1);
    void load(1, true);
  }, [load]);

  useEffect(() => {
    const unsubscribe = drawer.subscribe((m) => {
      if (m.kind === 'deleted') {
        setItems((prev) => prev.filter((i) => i.id !== m.id));
        setSelectedIds((prev) => {
          if (!prev.has(m.id)) return prev;
          const next = new Set(prev);
          next.delete(m.id);
          return next;
        });
      } else if (m.kind === 'updated' || m.kind === 'retried') {
        setItems((prev) => prev.map((i) => (i.id === m.item.id ? { ...i, ...m.item } : i)));
      } else if (m.kind === 'created') {
        setItems((prev) => (prev.some((i) => i.id === m.item.id) ? prev : [m.item, ...prev]));
      }
    });
    return unsubscribe;
  }, [drawer]);

  const filtered = useMemo(() => {
    let out = items;
    if (filter) out = out.filter((i) => i.category === filter);
    if (debouncedQuery) {
      const q = debouncedQuery;
      out = out.filter((i) => {
        const hay = [
          i.title,
          i.summary,
          i.content,
          i.category,
          (i.tags ?? []).join(' '),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return out;
  }, [items, filter, debouncedQuery]);

  const hasImportedItems = useMemo(
    () => items.some((i) => i.source === 'bookmark_import'),
    [items],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filtered.map((i) => i.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${ids.length} item${ids.length === 1 ? '' : 's'}?`)) return;
    setBulkBusy(true);
    const results = await Promise.all(ids.map((id) => deleteItemAction(id)));
    const deletedIds = ids.filter((_, i) => results[i]?.ok);
    if (deletedIds.length > 0) {
      setItems((prev) => prev.filter((i) => !deletedIds.includes(i.id)));
      for (const id of deletedIds) drawer.emit({ kind: 'deleted', id });
    }
    setBulkBusy(false);
    exitSelectMode();
  }, [selectedIds, drawer, exitSelectMode]);

  const readyForEmpty = !loading && items.length === 0;
  const filteredEmpty = !loading && items.length > 0 && filtered.length === 0;

  return (
    <section>
      <FilterBar
        items={items}
        activeCategory={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
        direction={direction}
        onDirection={setDirection}
        view={view}
        onView={setView}
        query={query}
        onQuery={setQuery}
        importedOnly={importedOnly}
        onImportedOnly={setImportedOnly}
        hasImportedItems={hasImportedItems}
      />

      {items.length > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          {selecting ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted" data-testid="selection-count">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="rounded-md px-2 py-1 text-xs text-foreground/80 hover:bg-foreground/5"
                >
                  Select all visible
                </button>
                {selectedIds.size > 0 ? (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-md px-2 py-1 text-xs text-muted hover:bg-foreground/5 hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={exitSelectMode} disabled={bulkBusy}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => void confirmBulkDelete()}
                  disabled={selectedIds.size === 0 || bulkBusy}
                  data-testid="bulk-delete"
                >
                  {bulkBusy ? <Spinner size={12} /> : <TrashIcon size={12} />}
                  Delete {selectedIds.size || ''}
                </Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelecting(true)}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-foreground/5 hover:text-foreground"
              data-testid="enter-select-mode"
            >
              Select items
            </button>
          )}
        </div>
      ) : null}

      {readyForEmpty ? (
        <EmptyState
          icon={<InboxIcon size={36} strokeWidth={1.5} className="text-accent" />}
          title="Nothing saved yet"
          body="Share something from any app to get started — Flowy will extract, classify, and file it automatically."
        />
      ) : filteredEmpty ? (
        <EmptyState
          icon={<SearchIcon size={32} strokeWidth={1.5} className="text-muted" />}
          title="No matches"
          body={hasMore ? 'No items match your search. Load more below to search older items.' : 'No items match your search.'}
          compact
        />
      ) : view === 'list' ? (
        <div data-testid="inbox-list" className="flex flex-col gap-2 stagger-child">
          {filtered.map((item) => (
            <SelectableWrap
              key={item.id}
              item={item}
              selecting={selecting}
              selected={selectedIds.has(item.id)}
              onToggle={toggleSelected}
            >
              <ItemRow item={item} />
            </SelectableWrap>
          ))}
        </div>
      ) : view === 'detail' ? (
        <div data-testid="inbox-detail" className="flex flex-col gap-3 stagger-child">
          {filtered.map((item) => (
            <SelectableWrap
              key={item.id}
              item={item}
              selecting={selecting}
              selected={selectedIds.has(item.id)}
              onToggle={toggleSelected}
            >
              <ItemDetailRow item={item} />
            </SelectableWrap>
          ))}
        </div>
      ) : (
        <div
          data-testid="inbox-grid"
          className="grid grid-cols-1 gap-4 stagger-child sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        >
          {filtered.map((item) => (
            <SelectableWrap
              key={item.id}
              item={item}
              selecting={selecting}
              selected={selectedIds.has(item.id)}
              onToggle={toggleSelected}
            >
              <ItemCard item={item} />
            </SelectableWrap>
          ))}
        </div>
      )}
      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load(next, false);
            }}
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-5 py-2 text-sm text-foreground transition-all duration-200 ease-out-expo hover:border-foreground/30 hover:bg-surface hover:shadow-card-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            data-testid="load-more"
          >
            {loading ? <Spinner size={14} /> : null}
            <span>{loading ? 'Loading…' : 'Load more'}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function SelectableWrap({
  item,
  selecting,
  selected,
  onToggle,
  children,
}: {
  item: Item;
  selecting: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  if (!selecting) return <>{children}</>;
  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={selected}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle(item.id);
        }}
        className="absolute inset-0 z-10 rounded-2xl ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        data-testid="select-item"
        data-selected={selected ? 'true' : 'false'}
      >
        <span className="sr-only">{selected ? 'Deselect' : 'Select'} item</span>
      </button>
      <div
        className={[
          'relative transition-all',
          selected ? 'ring-2 ring-accent rounded-2xl' : '',
        ].join(' ')}
      >
        {children}
      </div>
      <span
        aria-hidden
        className={[
          'absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded border',
          selected
            ? 'border-accent bg-accent text-background'
            : 'border-border bg-background/85 text-transparent',
        ].join(' ')}
      >
        ✓
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border border-border bg-surface-elevated text-center',
        'flex flex-col items-center gap-3 animate-fade-up',
        compact ? 'py-12' : 'py-20',
      ].join(' ')}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-halo-accent blur-2xl animate-halo-drift"
      />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10">
        {icon}
      </div>
      <h2 className="relative font-display text-2xl leading-tight text-foreground">{title}</h2>
      <p className="relative max-w-sm px-6 text-sm text-muted">{body}</p>
    </div>
  );
}
