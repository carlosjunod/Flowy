'use client';

import type { Item } from '@/types';
import type { ReactNode } from 'react';
import { SearchIcon, XIcon, GridIcon, ListIcon, RowsIcon, ArrowUpIcon, ArrowDownIcon } from '@/components/ui/icons';

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
    <div className="flex flex-col gap-4 pb-5">
      {/* Search gets its own row on mobile so it never collapses to an icon; on sm+ it shares the bar with view/sort controls. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative flex min-w-0 flex-1 items-center">
          <SearchIcon size={16} className="pointer-events-none absolute left-3.5 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search titles, content, tags…"
            aria-label="Search inbox"
            data-testid="inbox-search"
            className="w-full rounded-full border border-border bg-surface-elevated py-2.5 pl-10 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQuery('')}
              aria-label="Clear search"
              className="absolute right-3 rounded-full p-1 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
            ><XIcon size={14} /></button>
          ) : null}
        </label>

        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="View mode" className="flex overflow-hidden rounded-full border border-border bg-surface-elevated p-0.5">
            <ViewButton active={view === 'grid'}   onClick={() => onView('grid')}   label="Grid"   testId="view-grid"   icon={<GridIcon size={14} />} />
            <ViewButton active={view === 'list'}   onClick={() => onView('list')}   label="List"   testId="view-list"   icon={<ListIcon size={14} />} />
            <ViewButton active={view === 'detail'} onClick={() => onView('detail')} label="Detail" testId="view-detail" icon={<RowsIcon size={14} />} />
          </div>

          <label className="flex items-center gap-1.5 text-xs text-muted">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value as SortMode)}
              className="rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
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
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface-elevated p-1.5 text-foreground/80 transition-all hover:border-foreground/30 hover:text-foreground active:scale-95"
          >
            {direction === 'asc' ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Filter by category"
        className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5"
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
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId: string;
  icon: ReactNode;
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
      className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-sm transition-all ${
        active
          ? 'bg-primary text-background shadow-card'
          : 'text-muted hover:bg-foreground/5 hover:text-foreground'
      }`}
    >{icon}</button>
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
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-out-expo active:scale-[0.97] ${
        active
          ? 'border-primary bg-primary text-background shadow-card'
          : 'border-border bg-surface-elevated text-muted hover:border-foreground/25 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
