# CYCLE-07 — Inbox Grid

**Dependencies**: Cycle 05  
**Complexity**: Medium

---

## Goal
Visual grid of all saved items with dynamic category filters and sort options.

---

## Tasks

### T01 — Create InboxGrid component
**File**: `apps/web/components/inbox/InboxGrid.tsx`  
**Action**: Fetches items from PocketBase (authenticated user only, `status: 'ready'`), renders grid of `ItemCard` components. Supports `filter: string | null` prop (category filter) and `sort: 'date' | 'category' | 'type'` prop. Paginated: 20 items per page, load more button.  
**Acceptance**: Grid renders with seeded items.

### T02 — Create ItemCard component
**File**: `apps/web/components/inbox/ItemCard.tsx`  
**Action**: Card renders: thumbnail (R2 URL for images, favicon for URLs, YouTube thumbnail for YT, type icon fallback), title, category badge (colored by category hash), type icon, relative date, source domain. Click → opens `source_url` in new tab.  
**Acceptance**: Card renders correctly for all 3 item types (url, screenshot, youtube).

### T03 — Create FilterBar component
**File**: `apps/web/components/inbox/FilterBar.tsx`  
**Action**: Derives unique categories from loaded items. Renders horizontal scroll of category pills. "All" pill always first. Active pill highlighted. Clicking pill calls `onFilter(category)`. Also renders sort dropdown.  
**Acceptance**: Categories derived from items, not hardcoded. Filter updates grid.

### T04 — Add pending/error states to ItemCard
**File**: `apps/web/components/inbox/ItemCard.tsx`  
**Action**: If `status: 'pending'` or `status: 'processing'` → show skeleton card with spinner. If `status: 'error'` → show card with error icon and `error_msg` tooltip. Pending/processing cards not clickable.  
**Acceptance**: Pending item shows spinner. Error item shows error icon.

### T05 — E2E inbox test
**File**: `tests/e2e/inbox.spec.ts`  
**Action**:
1. Seed 5 items: 2 with category "Design", 2 with "Dev", 1 with "Food"
2. Login → `/inbox`
3. Verify all 5 items visible
4. Click "Design" filter → only 2 items visible
5. Click "All" → all 5 visible again
6. Click item → correct URL opens in new tab

**Acceptance**: All steps pass.

---

## Cycle Exit Criteria

- [ ] `/inbox` shows all `ready` items for authenticated user
- [ ] Category filter shows correct subset
- [ ] Pending items show spinner, are not clickable
- [ ] Error items show error icon
- [ ] `npx playwright test tests/e2e/inbox.spec.ts` — all pass
- [ ] No TypeScript errors

---

