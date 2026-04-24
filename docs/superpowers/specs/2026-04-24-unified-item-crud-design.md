# Unified item CRUD + bulk selection

**Date:** 2026-04-24
**Area:** `apps/web/app/api/items`, `apps/web/components/inbox`, `apps/web/components/chat`, `apps/web/lib`

## Problem

Item CRUD is fragmented across the six views that render items. Only `ItemCard` (grid) has open + delete + reload; `ItemRow`, `ItemDetailRow`, `ItemChip`, and the chat items rail are open-only; `ItemDrawer` has delete but no reload. The `/retry` endpoint only accepts `status === 'error'`, so even when a view *does* expose the action, it's unavailable for `ready` items the user wants to re-process (e.g. bad Claude classification on a healthy URL). No bulk selection exists anywhere — users delete/reload one item at a time.

## Goals

1. Every item view exposes Open, Reload, and Delete through one shared affordance.
2. Reload is available for any item that isn't currently in-flight (`ready` and `error`, not `pending` or `processing`).
3. Inbox views support multi-select → bulk Reload / Delete with a single confirmation for destructive actions.
4. Chat views get individual Reload/Delete but no selection UI — chat is a read/cite surface, not a curation surface.

Non-goals: mobile long-press, undo-after-delete toasts, `⌘A` select-all UI (provider stub only), bulk edit/tag operations.

## Decisions

- **Reload scope** — widen `/retry` server-side to accept `ready` + `error`, reject `pending` + `processing` with 409. Keep the route path at `/retry` (no rename); flip UI label to "Reload". Rationale: renaming the route forces updates in every caller and tests for zero user-visible gain.
- **Action affordance** — one `ItemActionsMenu` (⋯ → Open / Reload / Delete) reused by every view except `ItemDrawer`, which uses inline toolbar buttons because it's already a detail context.
- **Selection pattern** — explicit "Select" mode toggle with a bottom `SelectionActionBar` (Photos/Mail/Things pattern). Chosen over always-on hover checkboxes because Flowy has five layouts (grid, list, detail, drawer, chat) and will wrap in Capacitor — a toggle works on touch without hover.
- **Scope of selection** — `SelectionProvider` mounts only on inbox routes (`app/(app)/inbox/layout.tsx`). Chat and digest routes do not mount it.
- **Bulk endpoints** — dedicated `POST /api/items/bulk/reload` and `POST /api/items/bulk/delete` returning `{ succeeded: string[], failed: { id, code, message }[] }`. Chosen over client-side `Promise.allSettled` over N endpoints to avoid hammering PocketBase at large N and to centralize the partial-failure shape.
- **Confirmation** — single-item delete keeps current inline behavior (no modal). Bulk delete requires a confirmation dialog with the item count, since N-item deletion is irreversible and easy to misfire.
- **Chat ⋯ affordance** — `ItemChip` uses right-click / long-press / Shift+F10 to open the menu, because it's inline text and a visible ⋯ button would break the sentence flow. The chat items rail uses the standard hover ⋯ pattern.

## Data model

No schema changes. All existing `items` fields stay as-is.

TypeScript types change in `apps/web/types/index.ts`:

- Extend `ItemMutation` union with `{ kind: 'bulk-deleted'; ids: string[] }` and `{ kind: 'bulk-retried'; ids: string[] }`.

## API

### `apps/web/app/api/items/[id]/retry/route.ts` — widen gate

Current: `if (item.status !== 'error') return 409 NOT_RETRIABLE`.

New: `if (item.status === 'pending' || item.status === 'processing') return 409 ALREADY_PROCESSING`. All other statuses pass. The re-enqueue logic (PATCH to `pending` + clear `error_msg` + `queue.add('ingest', ...)`) is unchanged.

### `apps/web/app/api/items/bulk/reload/route.ts` — new

`POST { ids: string[] }`. For each id: authenticate + ownership check + status gate + re-enqueue. Returns `200 { data: { succeeded: string[], failed: { id, code, message }[] } }`. Size cap: 100 ids per request (413 over).

Error codes per item: `ITEM_NOT_FOUND`, `ALREADY_PROCESSING`, `RELOAD_FAILED`. Top-level: `UNAUTHORIZED` 401, `INVALID_PAYLOAD` 400, `TOO_MANY_IDS` 413.

### `apps/web/app/api/items/bulk/delete/route.ts` — new

`POST { ids: string[] }`. Same shape as bulk reload. Per-item: ownership check + `pb.collection('items').delete(id)` + cascade embeddings delete. Returns `{ succeeded, failed }`. Same 100-id cap.

**Refactor prerequisite**: extract the cascade-embeddings logic from `apps/web/app/api/items/[id]/route.ts` (lines 76-98) into `apps/web/lib/items-delete.ts` exporting `deleteItemWithCascade(pb, id, userId)`. The single-item route calls this helper after the extraction; the bulk route loops over it. Keeps behavior identical, prevents drift.

Error codes: `ITEM_NOT_FOUND`, `DELETE_FAILED`, plus the top-level set.

Both bulk routes consult `api-design-principles` skill for final contract review (status code semantics, idempotency headers).

## Client lib

### `apps/web/lib/items-actions.ts` — extend

Add:

- `reloadItems(ids: string[])` → POST bulk/reload, returns `{ succeeded, failed }`.
- `deleteItems(ids: string[])` → POST bulk/delete.

Both emit the new `bulk-retried` / `bulk-deleted` events through the existing `ItemDrawerProvider` pub/sub.

### `apps/web/lib/hooks/useItemActions.ts` — new

Thin React hook exposing `{ openItem, reloadItem, deleteItem, reloadMany, deleteMany, pending }`. Wraps the functions in `items-actions.ts`. Responsibilities:

1. Hold per-id `pending` state for button spinners (`Set<string>`).
2. Show confirmation dialogs: none for single delete, required for bulk delete.
3. Call `useItemDrawer().open(id)` for `openItem`.

Returns pure functions — views call `reloadItem(id)` directly instead of re-wiring fetch + event emit + loading state.

## UI

### New shared components

**`apps/web/components/inbox/ItemActionsMenu.tsx`**
Dropdown: Open / Reload / Delete. Props `{ itemId, status, variant: 'hover' | 'inline' }`. Reload item disabled when `status === 'pending' | 'processing'`. Uses existing UI primitives (no new dependency). Click handlers call `useItemActions` directly.

**`apps/web/components/inbox/SelectionProvider.tsx`**
React context: `{ mode: boolean, selectedIds: Set<string>, toggle, selectAll, clear, enter, exit }`. Mounted in `app/(app)/inbox/layout.tsx`. Exposes `useSelection()` hook. Exits mode automatically on route change via `usePathname` effect.

**`apps/web/components/inbox/SelectionActionBar.tsx`**
Floating bottom bar, slides in when `mode === true`. Layout: "N selected · [Reload] [Delete] [Cancel]". Calls `reloadMany(selectedIds)` / `deleteMany(selectedIds)` from `useItemActions`, then `clear()` + `exit()`. Partial-failure toast: "38 reloaded, 2 failed — [Details]" on `failed.length > 0`.

### Per-view edits

**`components/inbox/ItemCard.tsx`** — replace inline delete button + conditional retry button with `<ItemActionsMenu itemId=... status=... variant="hover" />` in the top-right corner (reuses the same `opacity-0 group-hover:opacity-100` pattern from the 2026-04-20 spec). When `useSelection().mode === true`: checkbox overlay in top-left; card click calls `toggle(id)` instead of opening the drawer; selected state renders as a 2px accent ring.

**`components/inbox/ItemRow.tsx`** — add `<ItemActionsMenu variant="hover" />` at the right edge, hidden until row hover. In selection mode: checkbox left, row click toggles selection.

**`components/inbox/ItemDetailRow.tsx`** — same treatment as `ItemRow`. Keep the menu pattern (not inline icons) to stay consistent — users learn one affordance.

**`components/inbox/ItemDrawer.tsx`** — add a Reload button to the existing toolbar, left of Delete. Calls `reloadItem(id)`; status flips to `pending` inside the drawer (skeleton re-renders in place). No selection UI. Delete closes the drawer as today.

**`components/chat/ItemChip.tsx`** — wire `onContextMenu`, long-press (`pointerdown` + 500ms timer), and `Shift+F10` to `ItemActionsMenu` anchored to the chip. Primary click still opens the item (preserves the "tap a citation" affordance).

**`components/chat/ChatMessage.tsx`** (items rail, lines 94-118) — add `<ItemActionsMenu variant="hover" />` to each card's top-right on hover. Primary card click still opens. No selection.

### Entry points

**`apps/web/app/(app)/inbox/layout.tsx`** — mount `<SelectionProvider>` and `<SelectionActionBar>`.

**`apps/web/components/inbox/FilterBar.tsx`** — add a "Select" button next to the existing grid/list/detail `ViewButton` group that calls `useSelection().enter()`. Esc key (global `keydown` listener in `SelectionProvider`) calls `exit()`. `⌘A` handler is stubbed in the provider but not surfaced in UI this cycle.

### Event-bus extension

**`components/inbox/ItemDrawerProvider.tsx`** — extend the `ItemMutation` union with the two `bulk-*` kinds.

**`components/inbox/InboxGrid.tsx`** — add cases for `bulk-retried` (flip listed items to `pending` optimistically) and `bulk-deleted` (remove from local state) in the existing switch at line 100-ish.

## Tests

- **Unit — `tests/unit/retry-route-widened.test.ts`** — 201 for `ready`, 201 for `error`, 409 for `pending`, 409 for `processing`. Asserts `queue.add` called once per happy path.
- **Unit — `tests/unit/bulk-reload-route.test.ts`** — mixed batch: 2 ready, 1 processing, 1 not-owned → returns `{ succeeded: [id1, id2], failed: [id3 ALREADY_PROCESSING, id4 ITEM_NOT_FOUND] }`. 413 on 101 ids.
- **Unit — `tests/unit/bulk-delete-route.test.ts`** — mixed batch; asserts embeddings cascade called per succeeded id.
- **Unit — `tests/unit/use-item-actions.test.tsx`** — covers `pending` state toggle, confirmation dialog triggered for bulk delete only, events emitted on success.
- **Unit — `tests/unit/selection-provider.test.tsx`** — enter/exit, toggle, selectAll, clear, auto-exit on route change.
- **E2E — `tests/e2e/bulk-delete.spec.ts`** (Playwright) — inbox → Select → click 3 cards → SelectionActionBar shows "3 selected" → Delete → confirm → grid refreshes → 3 fewer cards. Single smoke test; other behaviors covered at unit level.

Delegate the a11y audit (focus trap in action bar, keyboard reachability of `ItemChip` menu, ESC behavior, `aria-selected` on cards) to `frontend-design-pro:review` as a final pass before shipping.

## Rollout order

Each step is independently shippable and reviewable. Suggest one `[CYCLE-XX]` commit per step.

1. Widen `/retry` gate + add `/bulk/reload` + `/bulk/delete`. Server-only; no UI changes.
2. Extend `items-actions.ts` + add `useItemActions` hook + extend `ItemMutation`. Hook tested in isolation.
3. Build `ItemActionsMenu`. Replace `ItemCard`'s inline delete/retry — regression target for parity.
4. Add the menu to `ItemRow`, `ItemDetailRow`, `ItemDrawer` (inline Reload button), `ItemChip` (context-menu), chat rail. Uniform CRUD reached here — if we stop, primary complaint is fixed.
5. `SelectionProvider` + inbox "Select" toolbar button + checkbox overlays.
6. `SelectionActionBar` + `reloadMany`/`deleteMany` wiring + confirmation dialog + partial-failure toast.
7. Playwright E2E + `frontend-design-pro:review` a11y pass.

## Specialists to invoke during implementation

- `frontend-design` — visual language for `SelectionActionBar`, checkbox overlays, hover/selected ring tokens, ⋯ menu motion. Flowy's inbox is a feel surface and this must not look bolted-on.
- `backend-development:api-design-principles` — final arbitration on bulk endpoint response shape and status code semantics (200 + partial payload vs 207 Multi-Status). Current decision: 200 + payload for client simplicity.
- `superpowers:test-driven-development` — red-green-refactor on the widened `/retry` gate and the bulk endpoints before any UI work.
- `frontend-design-pro:review` — pre-ship a11y audit (step 7 above).
- `webapp-testing` — authors the Playwright bulk-delete E2E.

## Risks

- **Bulk endpoint failure modes** — 100-item cap protects PocketBase but not BullMQ; a reload of 100 items enqueues 100 jobs. Acceptable because Redis queue has no meaningful burst limit at that scale, but flag during implementation if worker backpressure materializes.
- **ItemChip context-menu collision on iPad** — long-press default is "copy link" for anchors. Chip is a `<button>`, not `<a>`, so this should be fine, but verify on a physical iPad before closing the cycle.
- **Event-bus fan-out on bulk actions** — a single `bulk-deleted` event with `ids: string[]` is cheaper than N `deleted` events. InboxGrid's listener must handle the array case or it will leak ghost items in local state.
- **Selection state persistence across view-mode switches** — user enters selection in grid, selects 3, switches to list. Expected: selection persists (same collection, different render). `SelectionProvider` lives at the layout level, so this works automatically, but worth an explicit unit test.

## Acceptance

- Every item view (grid card, list row, detail row, drawer, chat chip, chat rail) exposes Open, Reload, and Delete.
- Reload works for `ready` and `error` items; blocked with a visible disabled state for `pending` / `processing`.
- "Select" button in the inbox toolbar enters selection mode across grid/list/detail; checkboxes appear; card/row click toggles.
- Selecting N items and clicking bulk Reload flips all N to `pending` optimistically; partial failures render a toast.
- Selecting N items and clicking bulk Delete shows a confirmation with the count; confirming removes all N from the grid.
- Esc exits selection mode and clears selection.
- `npm test` passes; `npm run typecheck` clean; Playwright E2E passes.
