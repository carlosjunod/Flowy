'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { ItemCard } from './ItemCard';
import { ItemRow } from './ItemRow';
import { ItemDetailRow } from './ItemDetailRow';
import { FilterBar, type SortMode, type SortDirection, type ViewMode } from './FilterBar';
import { useItemDrawer } from './ItemDrawerProvider';

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
  const [sort, setSort] = useState<SortMode>(sortProp);
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [view, setView] = useState<ViewMode>('grid');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    setView(readPref<ViewMode>(VIEW_KEY, 'grid', ['grid', 'list', 'detail']));
    setSort(readPref<SortMode>(SORT_KEY, sortProp, ['date', 'category', 'type']));
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
      const result = await pb.collection('items').getList<Item>(nextPage, PAGE_SIZE, {
        filter: `user = "${pb.authStore.model?.id}"`,
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
  }, [sortExpr]);

  useEffect(() => {
    setPage(1);
    void load(1, true);
  }, [load]);

  useEffect(() => {
    const unsubscribe = drawer.subscribe((m) => {
      if (m.kind === 'deleted') {
        setItems((prev) => prev.filter((i) => i.id !== m.id));
      } else if (m.kind === 'updated') {
        setItems((prev) => prev.map((i) => (i.id === m.item.id ? { ...i, ...m.item } : i)));
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
      />
      {readyForEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 py-16 text-center text-white/70">
          <div className="text-5xl" aria-hidden>📥</div>
          <h2 className="text-base font-semibold text-white">Nothing saved yet</h2>
          <p className="text-xs">Share something from any app to get started.</p>
        </div>
      ) : filteredEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-12 text-center text-white/60">
          <div className="text-3xl" aria-hidden>🔍</div>
          <p className="text-sm">No items match your search.</p>
          {hasMore ? (
            <p className="text-xs text-white/40">Load more below to search older items.</p>
          ) : null}
        </div>
      ) : view === 'list' ? (
        <div data-testid="inbox-list" className="flex flex-col gap-2">
          {filtered.map((item) => <ItemRow key={item.id} item={item} />)}
        </div>
      ) : view === 'detail' ? (
        <div data-testid="inbox-detail" className="flex flex-col gap-3">
          {filtered.map((item) => <ItemDetailRow key={item.id} item={item} />)}
        </div>
      ) : (
        <div
          data-testid="inbox-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load(next, false);
            }}
            className="rounded-full border border-white/15 px-4 py-2 text-sm hover:border-white/30"
            data-testid="load-more"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
