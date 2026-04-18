'use client';

import type { Item } from '@/types';

export type SortMode = 'date' | 'category' | 'type';

interface Props {
  items: Item[];
  activeCategory: string | null;
  onFilter: (category: string | null) => void;
  sort: SortMode;
  onSort: (sort: SortMode) => void;
}

export function FilterBar({ items, activeCategory, onFilter, sort, onSort }: Props) {
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c))),
  ).sort();

  return (
    <div className="flex flex-wrap items-center gap-3 pb-4">
      <div
        role="tablist"
        aria-label="Filter by category"
        className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
      >
        <FilterPill
          active={activeCategory === null}
          onClick={() => onFilter(null)}
          testId="filter-All"
        >
          All
        </FilterPill>
        {categories.map((cat) => (
          <FilterPill
            key={cat}
            active={activeCategory === cat}
            onClick={() => onFilter(cat)}
            testId={`filter-${cat}`}
          >
            {cat}
          </FilterPill>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-white/60">
        Sort:
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortMode)}
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
          data-testid="sort-select"
        >
          <option value="date">Newest</option>
          <option value="category">Category</option>
          <option value="type">Type</option>
        </select>
      </label>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-white bg-white text-black'
          : 'border-white/15 text-white/70 hover:border-white/30 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
