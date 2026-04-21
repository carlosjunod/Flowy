# Inbox hover actions + OG metadata enrichment

**Date:** 2026-04-20
**Area:** `apps/web/components/inbox`, `worker/src/processors`, `pb/pb_migrations`, `worker/scripts`

## Problem

The inbox grid currently shows failed items as dead-end red cards with no way to retry or clear them, and healthy URL items show a low-signal favicon thumbnail instead of the OpenGraph image the site already publishes. Screenshot of the current state shows ~7 error cards with no affordances among ~20 visible items.

## Goals

1. Let users retry failed items without deleting + re-sharing.
2. Let users delete any item directly from the grid.
3. Show rich previews for URL items using OG image + site_name + description — the `@extractus/article-extractor` library already returns these but the processor discards them.

Non-goals: proxying images through R2 (deferred), retry-on-ready (collision with drawer edits), OG for non-URL types.

## Decisions

- **Hover affordances**: retry on `error` cards only; delete on all cards.
- **OG storage**: three flat columns on `items` — `og_image`, `og_description`, `site_name`. No JSON blob, no R2 proxy.
- **Retry**: simple re-enqueue — PATCH `status=pending` + clear `error_msg` + `queue.add('ingest', ...)` with existing payload shape.
- **Backfill**: one-shot script `worker/scripts/backfill-og.ts` for the ~20 URL items already in the inbox.
- **No permanent-error detection** — trivial to add later if needed; premature for now.

## Data model

Migration `pb/pb_migrations/4_add_og_fields.js` adds to `items`:

| field            | type | options              |
| ---------------- | ---- | -------------------- |
| `og_image`       | text | optional             |
| `og_description` | text | optional, max 500    |
| `site_name`      | text | optional, max 100    |

No indexes — display-only.

`apps/web/types/index.ts` `Item` gets three optional string fields.

## Worker change

`worker/src/processors/url.processor.ts` — augment the `updateItem` call in `processUrl` to pass `og_image: scraped.image ?? null`, `og_description: scraped.description?.slice(0, 500) ?? null`, `site_name: scraped.source ?? null`. Nulls (not undefined) so retries overwrite stale values. No new dependencies, no extra HTTP request.

## API

New route `apps/web/app/api/items/[id]/retry/route.ts` — `POST` handler:

1. Authenticate (reuse existing `authenticate` helper from `lib/auth`).
2. Load item, verify ownership — 404 on miss.
3. Guard: `status !== 'error'` → 409 `NOT_RETRIABLE`.
4. PATCH item → `{ status: 'pending', error_msg: '' }` (PocketBase treats empty string as cleared for text fields).
5. Re-enqueue via shared `getQueue()` — `{ itemId, type: item.type, raw_url: item.raw_url, raw_image: null }`. Worker already branches on `r2_key` vs `raw_image` for screenshots, so `raw_image: null` is safe.
6. Return `{ data: { id, status: 'pending' } }` (201).

Extract BullMQ queue factory from `apps/web/app/api/ingest/route.ts` into `apps/web/lib/queue.ts` — one lazy `getQueue()` singleton shared across both routes, preventing two Redis clients per serverless instance.

Error codes: `UNAUTHORIZED` 401, `ITEM_NOT_FOUND` 404, `NOT_RETRIABLE` 409, `RETRY_FAILED` 500.

## UI

**`apps/web/components/inbox/ItemCard.tsx`** — three edits:

1. `thumbnailUrl()` — for `type === 'url'`, prefer `og_image` over favicon fallback.
2. Domain line — prefer `site_name` over raw hostname.
3. **Hover overlay** — absolute top-right, `opacity-0 group-hover:opacity-100`, with:
   - Error cards: ↻ retry + 🗑 delete
   - Ready cards: 🗑 delete
   - Both buttons `stopPropagation` so they don't trigger drawer-open.
   - Delete uses native `window.confirm` — no new toast infrastructure.

The current `<button>` wrapper becomes a `<div role="button" tabIndex={0}>` with explicit keyboard handlers, because nested `<button>` elements are invalid HTML and some screen readers refuse to announce them. Error cards stay non-interactive at the root (they open nothing on click) but get the hover actions.

**`apps/web/lib/items-actions.ts`** — new module exporting `retryItem(id)` and `deleteItem(id)` that wrap `fetch`, return `{ data } | { error }`, and publish to the existing `useItemDrawer` pub/sub so `InboxGrid`'s existing subscriber (`InboxGrid.tsx:100`) updates the UI without a re-fetch.

**`apps/web/components/inbox/InboxGrid.tsx`** — add a new `retried` message kind to the existing switch. When a retry fires, the item flips to `status=pending` optimistically so the card re-renders as the pending skeleton.

**`apps/web/components/inbox/ItemDrawerProvider.tsx`** — extend the message union type with `{ kind: 'retried'; id: string }`.

## Backfill script

`worker/scripts/backfill-og.ts`:

1. Auth as PB admin.
2. `getFullList({ filter: 'type = "url" && og_image = ""' })`.
3. For each: `extract(source_url ?? raw_url)` and update only the three OG fields. Never change `status` — item is already `ready`.
4. `await sleep(250)` between items.
5. Print summary `{ scanned, updated, skipped, failed }` and exit.

Run with `pnpm --filter worker exec tsx scripts/backfill-og.ts` (or `npm --workspace worker exec tsx ...`).

Idempotent — re-running will only touch items that still lack `og_image`.

## Tests

- `tests/unit/url-processor-og.test.ts` — extractor returns `image/description/source` → processor writes them; extractor returns undefined → processor writes `null` for those fields.
- `tests/unit/retry-route.test.ts` — 401 unauth, 404 not owned, 409 not-in-error, 201 happy path asserts `queue.add` called once with correct payload and `update` called with `status: 'pending'`.
- `tests/unit/item-card.test.tsx` — hover reveals retry+delete on error cards and delete-only on ready cards; clicks on hover buttons do not trigger drawer-open.

No e2e tests — hover UX is flaky on CI and the behavior is covered by unit tests.

## Risks

- **Redis connection explosion**: if the lib/queue.ts refactor isn't done carefully, each route could open its own client. Mitigate by making `getQueue()` a true module-level singleton (cache in file scope, not per-request).
- **Backfill hitting rate limits**: 250ms throttle per item. For ~20 items this is 5s total. If a single site refuses (e.g., LinkedIn), the try/catch logs and moves on.
- **OG image hotlink blocks**: some sites (Medium, Twitter) block hotlinking and the `<img>` will 404. Existing `onError` handler in `ItemCard.tsx:131` already hides broken images — the glyph shows through. Accepted.

## Acceptance

- Fresh URL ingest: card shows OG image (or falls back cleanly) and site_name.
- Hovering any ready card reveals a delete icon; confirming deletes the item optimistically.
- Hovering any error card reveals retry + delete icons; retry flips the card to pending skeleton and re-runs the worker.
- Backfill script populates OG data for all existing URL items that lack it.
- `npm test` passes; `npm run typecheck` clean.
