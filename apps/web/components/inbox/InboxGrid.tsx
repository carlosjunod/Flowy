'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { ItemCard } from './ItemCard';
import { ItemRow } from './ItemRow';
import { ItemDetailRow } from './ItemDetailRow';
import { FilterBar, type SortMode, type SortDirection, type ViewMode } from './FilterBar';
import { useItemDrawer } from './ItemDrawerProvider';
import { InboxIcon, SearchIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';

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
      } else if (m.kind === 'updated' || m.kind === 'retried') {
        setItems((prev) => prev.map((i) => (i.id === m.item.id ? { ...i, ...m.item } : i)));
      } else if (m.kind === 'created') {
        setItems((prev) => (prev.some((i) => i.id === m.item.id) ? prev : [m.item, ...prev]));
      } else if (m.kind === 'bulk-deleted') {
        const set = new Set(m.ids);
        setItems((prev) => prev.filter((i) => !set.has(i.id)));
      } else if (m.kind === 'bulk-retried') {
        const set = new Set(m.ids);
        setItems((prev) => prev.map((i) => (set.has(i.id) ? { ...i, status: 'pending', error_msg: '' } : i)));
      }
    });
    return unsubscribe;
  }, [drawer]);

  // PocketBase realtime — observes the worker's status transitions (pending → ready)
  // and any external mutations. The items collection listRule restricts events to the
  // authenticated user, so no client-side user filter is needed.
  useEffect(() => {
    const pb = getPb();
    if (!pb.authStore.isValid) return;
    let cancelled = false;
    const unsubPromise = pb.collection('items').subscribe<Item>('*', (e) => {
      if (cancelled) return;
      if (e.action === 'update') {
        setItems((prev) => prev.map((i) => (i.id === e.record.id ? { ...i, ...e.record } : i)));
      } else if (e.action === 'delete') {
        setItems((prev) => prev.filter((i) => i.id !== e.record.id));
      } else if (e.action === 'create') {
        setItems((prev) => (prev.some((i) => i.id === e.record.id) ? prev : [e.record, ...prev]));
      }
    });
    return () => {
      cancelled = true;
      void unsubPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);

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
          {filtered.map((item) => <ItemRow key={item.id} item={item} />)}
        </div>
      ) : view === 'detail' ? (
        <div data-testid="inbox-detail" className="flex flex-col gap-3 stagger-child">
          {filtered.map((item) => <ItemDetailRow key={item.id} item={item} />)}
        </div>
      ) : (
        <div
          data-testid="inbox-grid"
          className="grid grid-cols-1 gap-4 stagger-child sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
        >
          {filtered.map((item) => (
            <ItemCard key={item.id} item={item} />
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
