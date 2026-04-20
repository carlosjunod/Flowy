'use client';

import type { Item } from '@/types';

export type SortMode = 'date' | 'category' | 'type';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list' | 'detail';

interface Props {
  items: Item[];
  activeCategory: string | null;
  onFilter: (category: string | null) => void;
  sort: SortMode;
  onSort: (sort: SortMode) => void;
  direction: SortDirection;
  onDirection: (dir: SortDirection) => void;
  view: ViewMode;
  onView: (view: ViewMode) => void;
  query: string;
  onQuery: (q: string) => void;
}

export function FilterBar({
  items,
  activeCategory,
  onFilter,
  sort,
  onSort,
  direction,
  onDirection,
  view,
  onView,
  query,
  onQuery,
}: Props) {
  const categories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c))),
  ).sort();

  return (
    <div className="flex flex-col gap-3 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="absolute left-3 text-white/40" aria-hidden>⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search titles, content, tags…"
            aria-label="Search inbox"
            data-testid="inbox-search"
            className="w-full rounded-full border border-white/15 bg-black/40 px-9 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/40"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="absolute right-3 text-white/40 hover:text-white"
            >✕</button>
          ) : null}
        </label>

        <div role="radiogroup" aria-label="View mode" className="flex overflow-hidden rounded-full border border-white/15">
          <ViewButton active={view === 'grid'} onClick={() => onView('grid')} label="Grid" testId="view-grid" glyph="▦" />
          <ViewButton active={view === 'list'} onClick={() => onView('list')} label="List" testId="view-list" glyph="≡" />
          <ViewButton active={view === 'detail'} onClick={() => onView('detail')} label="Detail" testId="view-detail" glyph="☰" />
        </div>

        <label className="flex items-center gap-2 text-xs text-white/60">
          Sort:
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value as SortMode)}
            className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white"
            data-testid="sort-select"
          >
            <option value="date">Date</option>
            <option value="category">Category</option>
            <option value="type">Type</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => onDirection(direction === 'asc' ? 'desc' : 'asc')}
          aria-label={`Direction: ${direction === 'asc' ? 'ascending' : 'descending'}`}
          title={direction === 'asc' ? 'Ascending' : 'Descending'}
          data-testid="sort-direction"
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-sm text-white hover:border-white/30"
        >{direction === 'asc' ? '↑' : '↓'}</button>
      </div>

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
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  testId,
  glyph,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      className={`px-2.5 py-1 text-sm transition ${
        active ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >{glyph}</button>
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
