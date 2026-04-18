'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Item } from '@/types';
import { getPb } from '@/lib/pocketbase';
import { ItemCard } from './ItemCard';
import { FilterBar, type SortMode } from './FilterBar';

const PAGE_SIZE = 20;

interface Props {
  filter?: string | null;
  sort?: SortMode;
}

export function InboxGrid({ filter: filterProp = null, sort: sortProp = 'date' }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<string | null>(filterProp);
  const [sort, setSort] = useState<SortMode>(sortProp);

  const sortExpr = useMemo(() => {
    switch (sort) {
      case 'category': return '+category,-created';
      case 'type': return '+type,-created';
      default: return '-created';
    }
  }, [sort]);

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

  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  const readyForEmpty = !loading && items.length === 0;

  return (
    <section>
      <FilterBar
        items={items}
        activeCategory={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
      />
      {readyForEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white/5 py-16 text-center text-white/70">
          <div className="text-5xl" aria-hidden>📥</div>
          <h2 className="text-base font-semibold text-white">Nothing saved yet</h2>
          <p className="text-xs">Share something from any app to get started.</p>
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
      {hasMore && filter === null ? (
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
