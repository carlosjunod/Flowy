# Unified Item CRUD + Bulk Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every item view in Flowy (grid, list, detail, drawer, chat chip, chat rail) exposes Open/Reload/Delete through one shared affordance, plus multi-select bulk Reload/Delete in inbox views.

**Architecture:** New shared `ItemActionsMenu` (⋯ dropdown) and `useItemActions` React hook replace per-view ad-hoc CRUD. Server gains widened `/retry` gate + two bulk endpoints returning `{ succeeded, failed }`. Inbox routes mount a `SelectionProvider` context + `SelectionActionBar`; chat routes do not.

**Tech Stack:** Next.js 15 App Router, TypeScript 5, PocketBase SDK, BullMQ, Vitest 1.6, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-24-unified-item-crud-design.md`

---

## File Structure

**New files:**

- `apps/web/lib/items-delete.ts` — shared `deleteItemWithCascade(pb, id, userId)` helper
- `apps/web/app/api/items/bulk/reload/route.ts` — `POST` bulk reload
- `apps/web/app/api/items/bulk/delete/route.ts` — `POST` bulk delete
- `apps/web/lib/hooks/useItemActions.ts` — single-entry React hook for all item CRUD
- `apps/web/components/inbox/ItemActionsMenu.tsx` — ⋯ dropdown (Open/Reload/Delete)
- `apps/web/components/inbox/SelectionProvider.tsx` — selection-mode context
- `apps/web/components/inbox/SelectionActionBar.tsx` — floating bulk action bar
- `apps/web/app/(app)/inbox/layout.tsx` — mounts `SelectionProvider` + action bar
- `tests/unit/bulk-reload-route.test.ts`
- `tests/unit/bulk-delete-route.test.ts`
- `tests/unit/items-delete-helper.test.ts`
- `tests/unit/use-item-actions.test.tsx`
- `tests/unit/selection-provider.test.tsx`
- `tests/unit/item-actions-menu.test.tsx`
- `tests/e2e/bulk-delete.spec.ts`

**Modified files:**

- `apps/web/app/api/items/[id]/retry/route.ts` — widen status gate
- `apps/web/app/api/items/[id]/route.ts` — DELETE calls shared helper
- `apps/web/lib/items-actions.ts` — add `reloadItems`, `deleteItems`
- `apps/web/types/index.ts` — extend `ItemMutation` union (if union lives here) OR
- `apps/web/components/inbox/ItemDrawerProvider.tsx` — extend `ItemMutation` union
- `apps/web/components/inbox/InboxGrid.tsx` — handle `bulk-*` events
- `apps/web/components/inbox/ItemCard.tsx` — use `ItemActionsMenu` + checkbox
- `apps/web/components/inbox/ItemRow.tsx` — add `ItemActionsMenu` + checkbox
- `apps/web/components/inbox/ItemDetailRow.tsx` — add `ItemActionsMenu` + checkbox
- `apps/web/components/inbox/ItemDrawer.tsx` — add Reload toolbar button
- `apps/web/components/inbox/FilterBar.tsx` — add "Select" button
- `apps/web/components/chat/ItemChip.tsx` — context-menu + long-press
- `apps/web/components/chat/ChatMessage.tsx` — rail cards get hover menu
- `tests/unit/retry-route.test.ts` — new gate cases

---

## Task 1: Widen /retry gate (TDD)

**Files:**

- Modify: `apps/web/app/api/items/[id]/retry/route.ts:33-35`
- Test: `tests/unit/retry-route.test.ts`

- [ ] **Step 1.1: Write the failing tests for the new gate**

Append to `tests/unit/retry-route.test.ts` (after existing cases — keep existing imports/mocks intact):

```typescript
describe('widened reload gate', () => {
  beforeEach(() => {
    authRefreshMock.mockReset();
    getOneMock.mockReset();
    updateMock.mockReset();
    queueAddMock.mockReset();
  });

  it('accepts status=ready and re-enqueues', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'ready', type: 'url', raw_url: 'https://x.test' });
    updateMock.mockResolvedValue({ id: 'i1', status: 'pending', user: 'u1', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(201);
    expect(updateMock).toHaveBeenCalledWith('items', 'i1', { status: 'pending', error_msg: '' });
    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });

  it('rejects status=pending with ALREADY_PROCESSING', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'pending', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PROCESSING');
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('rejects status=processing with ALREADY_PROCESSING', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'processing', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_PROCESSING');
  });

  it('still accepts status=error (preserves existing behavior)', async () => {
    authOk('u1');
    getOneMock.mockResolvedValue({ id: 'i1', user: 'u1', status: 'error', type: 'url', raw_url: 'https://x.test' });
    updateMock.mockResolvedValue({ id: 'i1', status: 'pending', user: 'u1', type: 'url' });

    const res = await POST(
      req({ authorization: 'Bearer t' }),
      { params: Promise.resolve({ id: 'i1' }) },
    );

    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 1.2: Run tests and verify the ready/pending/processing cases fail**

```bash
npx vitest run tests/unit/retry-route.test.ts
```

Expected: 2 failures — `accepts status=ready` (currently rejected as NOT_RETRIABLE) and the `rejects status=pending` / `processing` cases (currently return NOT_RETRIABLE, test expects ALREADY_PROCESSING).

- [ ] **Step 1.3: Widen the gate**

Edit `apps/web/app/api/items/[id]/retry/route.ts` lines 33-35:

```typescript
  if (item.status === 'pending' || item.status === 'processing') {
    return NextResponse.json({ error: 'ALREADY_PROCESSING' }, { status: 409 });
  }
```

(Replaces the `if (item.status !== 'error')` block.)

- [ ] **Step 1.4: Run tests and verify they pass**

```bash
npx vitest run tests/unit/retry-route.test.ts
```

Expected: all green.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/app/api/items/\[id\]/retry/route.ts tests/unit/retry-route.test.ts
git commit -m "$(cat <<'EOF'
[CYCLE-12] widen /retry gate to accept ready items

Previously rejected anything not 'error' with NOT_RETRIABLE. Now only
rejects 'pending' and 'processing' with ALREADY_PROCESSING. Unblocks
"Reload" UX on healthy items with stale classification.
EOF
)"
```

---

## Task 2: Extract cascade-delete helper

**Files:**

- Create: `apps/web/lib/items-delete.ts`
- Modify: `apps/web/app/api/items/[id]/route.ts:85-95` (DELETE handler body)
- Test: `tests/unit/items-delete-helper.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/items-delete-helper.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { deleteItemWithCascade } from '@/lib/items-delete';

describe('deleteItemWithCascade', () => {
  function makePb(overrides: Record<string, unknown> = {}) {
    const getFullList = vi.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    const deleteEmbedding = vi.fn().mockResolvedValue(undefined);
    const deleteItem = vi.fn().mockResolvedValue(undefined);
    const getOne = vi.fn().mockResolvedValue({ id: 'i1', user: 'u1' });

    const pb = {
      collection: (name: string) => {
        if (name === 'embeddings') return { getFullList, delete: deleteEmbedding };
        if (name === 'items') return { getOne, delete: deleteItem };
        throw new Error('unknown');
      },
    } as unknown;
    return { pb, getFullList, deleteEmbedding, deleteItem, getOne, ...overrides };
  }

  it('deletes embeddings then item when owned', async () => {
    const { pb, getFullList, deleteEmbedding, deleteItem } = makePb();
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');

    expect(result.ok).toBe(true);
    expect(getFullList).toHaveBeenCalledWith({ filter: 'item = "i1"', fields: 'id' });
    expect(deleteEmbedding).toHaveBeenCalledTimes(2);
    expect(deleteItem).toHaveBeenCalledWith('i1');
  });

  it('returns ITEM_NOT_FOUND when item missing', async () => {
    const pb = {
      collection: (name: string) => ({
        getOne: vi.fn().mockRejectedValue(new Error('404')),
        getFullList: vi.fn(),
        delete: vi.fn(),
      }),
    } as unknown;
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ITEM_NOT_FOUND');
  });

  it('returns ITEM_NOT_FOUND when owned by another user', async () => {
    const pb = {
      collection: () => ({
        getOne: vi.fn().mockResolvedValue({ id: 'i1', user: 'u2' }),
        getFullList: vi.fn(),
        delete: vi.fn(),
      }),
    } as unknown;
    const result = await deleteItemWithCascade(pb, 'i1', 'u1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ITEM_NOT_FOUND');
  });
});
```

- [ ] **Step 2.2: Run test and verify failure (module not found)**

```bash
npx vitest run tests/unit/items-delete-helper.test.ts
```

Expected: module not found / cannot resolve `@/lib/items-delete`.

- [ ] **Step 2.3: Create the helper**

Create `apps/web/lib/items-delete.ts`:

```typescript
export type DeleteResult =
  | { ok: true }
  | { ok: false; code: 'ITEM_NOT_FOUND' | 'DELETE_FAILED'; message?: string };

interface PbLike {
  collection: (name: string) => {
    getOne: (id: string) => Promise<{ id: string; user: string }>;
    getFullList: (opts: { filter: string; fields: string }) => Promise<{ id: string }[]>;
    delete: (id: string) => Promise<unknown>;
  };
}

export async function deleteItemWithCascade(
  pb: unknown,
  id: string,
  userId: string,
): Promise<DeleteResult> {
  const client = pb as PbLike;
  let item: { id: string; user: string };
  try {
    item = await client.collection('items').getOne(id);
  } catch {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }
  if (item.user !== userId) return { ok: false, code: 'ITEM_NOT_FOUND' };

  try {
    const embeddings = await client.collection('embeddings').getFullList({
      filter: `item = "${id}"`,
      fields: 'id',
    });
    await Promise.all(embeddings.map((e) => client.collection('embeddings').delete(e.id)));
    await client.collection('items').delete(id);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    return { ok: false, code: 'DELETE_FAILED', message };
  }
}
```

- [ ] **Step 2.4: Refactor DELETE route to use the helper**

Replace the body of the `DELETE` handler in `apps/web/app/api/items/[id]/route.ts` starting at line 75. The full new handler:

```typescript
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const result = await deleteItemWithCascade(auth.pb, id, auth.userId);
  if (!result.ok) {
    const status = result.code === 'ITEM_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ data: { id } });
}
```

Add at the top of the file (next to the existing imports):

```typescript
import { deleteItemWithCascade } from '@/lib/items-delete';
```

- [ ] **Step 2.5: Run both helper tests and existing items route tests**

```bash
npx vitest run tests/unit/items-delete-helper.test.ts tests/unit/items.route.test.ts
```

Expected: all green. The existing `items.route.test.ts` must still pass — behavior is unchanged.

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/lib/items-delete.ts apps/web/app/api/items/\[id\]/route.ts tests/unit/items-delete-helper.test.ts
git commit -m "[CYCLE-12] extract deleteItemWithCascade helper"
```

---

## Task 3: Bulk reload endpoint (TDD)

**Files:**

- Create: `apps/web/app/api/items/bulk/reload/route.ts`
- Test: `tests/unit/bulk-reload-route.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `tests/unit/bulk-reload-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getOneMock = vi.fn();
const updateMock = vi.fn();
const queueAddMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getOne: (id: string) => getOneMock(name, id),
        update: (id: string, patch: unknown) => updateMock(name, id, patch),
      };
    }
  }
  return { default: MockPocketBase };
});

vi.mock('@/lib/queue', () => ({
  getQueue: () => ({ add: (...a: unknown[]) => queueAddMock(...a) }),
}));

const { POST } = await import('../../apps/web/app/api/items/bulk/reload/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId } });
}

function req(body: unknown): Request {
  return new Request('http://localhost:4000/api/items/bulk/reload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authRefreshMock.mockReset();
  getOneMock.mockReset();
  updateMock.mockReset();
  queueAddMock.mockReset();
});

describe('POST /api/items/bulk/reload', () => {
  it('returns 401 when unauthenticated', async () => {
    authRefreshMock.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ ids: ['i1'] }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid payload', async () => {
    authOk();
    const res = await POST(req({ ids: 'not-array' }));
    expect(res.status).toBe(400);
  });

  it('returns 413 when over 100 ids', async () => {
    authOk();
    const ids = Array.from({ length: 101 }, (_, i) => `i${i}`);
    const res = await POST(req({ ids }));
    expect(res.status).toBe(413);
  });

  it('processes a mixed batch: ready succeeds, processing fails, not-owned fails', async () => {
    authOk('u1');
    getOneMock.mockImplementation((_col: string, id: string) => {
      if (id === 'i1') return Promise.resolve({ id: 'i1', user: 'u1', status: 'ready', type: 'url', raw_url: 'https://a' });
      if (id === 'i2') return Promise.resolve({ id: 'i2', user: 'u1', status: 'processing', type: 'url', raw_url: 'https://b' });
      if (id === 'i3') return Promise.resolve({ id: 'i3', user: 'u2', status: 'error', type: 'url', raw_url: 'https://c' });
      return Promise.reject(new Error('404'));
    });
    updateMock.mockResolvedValue({ id: 'i1', status: 'pending', user: 'u1' });

    const res = await POST(req({ ids: ['i1', 'i2', 'i3', 'i4'] }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.succeeded).toEqual(['i1']);
    const failedIds = body.data.failed.map((f: { id: string }) => f.id).sort();
    expect(failedIds).toEqual(['i2', 'i3', 'i4']);

    const byId = Object.fromEntries(body.data.failed.map((f: { id: string; code: string }) => [f.id, f.code]));
    expect(byId.i2).toBe('ALREADY_PROCESSING');
    expect(byId.i3).toBe('ITEM_NOT_FOUND');
    expect(byId.i4).toBe('ITEM_NOT_FOUND');

    expect(queueAddMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Run test and verify module-not-found failure**

```bash
npx vitest run tests/unit/bulk-reload-route.test.ts
```

Expected: FAIL — cannot resolve route module.

- [ ] **Step 3.3: Implement the endpoint**

Create `apps/web/app/api/items/bulk/reload/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import type { Item } from '@/types';
import { authenticate } from '@/lib/auth';
import { getQueue } from '@/lib/queue';

export const runtime = 'nodejs';

const MAX_IDS = 100;

type FailureCode = 'ITEM_NOT_FOUND' | 'ALREADY_PROCESSING' | 'RELOAD_FAILED';

interface BulkResult {
  succeeded: string[];
  failed: Array<{ id: string; code: FailureCode; message?: string }>;
}

async function reloadOne(pb: unknown, id: string, userId: string): Promise<{ ok: true } | { ok: false; code: FailureCode; message?: string }> {
  const client = pb as { collection: (n: string) => {
    getOne: (id: string) => Promise<Item>;
    update: <T>(id: string, patch: unknown) => Promise<T>;
  } };
  let item: Item;
  try {
    item = await client.collection('items').getOne(id);
  } catch {
    return { ok: false, code: 'ITEM_NOT_FOUND' };
  }
  if (item.user !== userId) return { ok: false, code: 'ITEM_NOT_FOUND' };
  if (item.status === 'pending' || item.status === 'processing') {
    return { ok: false, code: 'ALREADY_PROCESSING' };
  }
  try {
    await client.collection('items').update<Item>(id, { status: 'pending', error_msg: '' });
    await getQueue().add('ingest', { itemId: id, type: item.type, raw_url: item.raw_url });
    return { ok: true };
  } catch (err) {
    return { ok: false, code: 'RELOAD_FAILED', message: err instanceof Error ? err.message : undefined };
  }
}

export async function POST(req: NextRequest | Request): Promise<Response> {
  const auth = await authenticate(req as NextRequest);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const body = raw as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 413 });
  }

  const result: BulkResult = { succeeded: [], failed: [] };
  for (const id of ids) {
    const r = await reloadOne(auth.pb, id, auth.userId);
    if (r.ok) result.succeeded.push(id);
    else result.failed.push({ id, code: r.code, message: r.message });
  }

  return NextResponse.json({ data: result });
}
```

- [ ] **Step 3.4: Run tests and verify they pass**

```bash
npx vitest run tests/unit/bulk-reload-route.test.ts
```

Expected: all green.

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/app/api/items/bulk/reload/route.ts tests/unit/bulk-reload-route.test.ts
git commit -m "[CYCLE-12] add POST /api/items/bulk/reload"
```

---

## Task 4: Bulk delete endpoint (TDD)

**Files:**

- Create: `apps/web/app/api/items/bulk/delete/route.ts`
- Test: `tests/unit/bulk-delete-route.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `tests/unit/bulk-delete-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authRefreshMock = vi.fn();
const getOneMock = vi.fn();
const getFullListMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('pocketbase', () => {
  class MockPocketBase {
    authStore = { save: () => undefined };
    collection(name: string) {
      return {
        authRefresh: () => authRefreshMock(),
        getOne: (id: string) => getOneMock(name, id),
        getFullList: (opts: unknown) => getFullListMock(name, opts),
        delete: (id: string) => deleteMock(name, id),
      };
    }
  }
  return { default: MockPocketBase };
});

const { POST } = await import('../../apps/web/app/api/items/bulk/delete/route.js');

function authOk(userId = 'u1'): void {
  authRefreshMock.mockResolvedValue({ record: { id: userId } });
}

function req(body: unknown): Request {
  return new Request('http://localhost:4000/api/items/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authRefreshMock.mockReset();
  getOneMock.mockReset();
  getFullListMock.mockReset();
  deleteMock.mockReset();
});

describe('POST /api/items/bulk/delete', () => {
  it('returns 401 when unauthenticated', async () => {
    authRefreshMock.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ ids: ['i1'] }));
    expect(res.status).toBe(401);
  });

  it('returns 413 when over 100 ids', async () => {
    authOk();
    const ids = Array.from({ length: 101 }, (_, i) => `i${i}`);
    const res = await POST(req({ ids }));
    expect(res.status).toBe(413);
  });

  it('cascades embeddings delete per owned item', async () => {
    authOk('u1');
    getOneMock.mockImplementation((_col: string, id: string) => {
      if (id === 'i1') return Promise.resolve({ id: 'i1', user: 'u1' });
      if (id === 'i2') return Promise.resolve({ id: 'i2', user: 'u2' });
      return Promise.reject(new Error('404'));
    });
    getFullListMock.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);
    deleteMock.mockResolvedValue(undefined);

    const res = await POST(req({ ids: ['i1', 'i2', 'i3'] }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.succeeded).toEqual(['i1']);
    const failed = body.data.failed.map((f: { id: string; code: string }) => [f.id, f.code]);
    expect(failed.sort()).toEqual([['i2', 'ITEM_NOT_FOUND'], ['i3', 'ITEM_NOT_FOUND']]);

    expect(getFullListMock).toHaveBeenCalledTimes(1);
    expect(getFullListMock).toHaveBeenCalledWith('embeddings', { filter: 'item = "i1"', fields: 'id' });
    expect(deleteMock).toHaveBeenCalledWith('embeddings', 'e1');
    expect(deleteMock).toHaveBeenCalledWith('embeddings', 'e2');
    expect(deleteMock).toHaveBeenCalledWith('items', 'i1');
  });
});
```

- [ ] **Step 4.2: Run test and verify module-not-found failure**

```bash
npx vitest run tests/unit/bulk-delete-route.test.ts
```

Expected: FAIL — cannot resolve route module.

- [ ] **Step 4.3: Implement the endpoint**

Create `apps/web/app/api/items/bulk/delete/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/lib/auth';
import { deleteItemWithCascade } from '@/lib/items-delete';

export const runtime = 'nodejs';

const MAX_IDS = 100;

export async function POST(req: NextRequest | Request): Promise<Response> {
  const auth = await authenticate(req as NextRequest);
  if (!auth.ok) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const body = raw as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'string')) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }
  const ids = body.ids as string[];
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: 'TOO_MANY_IDS' }, { status: 413 });
  }

  const succeeded: string[] = [];
  const failed: Array<{ id: string; code: string; message?: string }> = [];

  for (const id of ids) {
    const result = await deleteItemWithCascade(auth.pb, id, auth.userId);
    if (result.ok) succeeded.push(id);
    else failed.push({ id, code: result.code, message: result.message });
  }

  return NextResponse.json({ data: { succeeded, failed } });
}
```

- [ ] **Step 4.4: Run tests and verify they pass**

```bash
npx vitest run tests/unit/bulk-delete-route.test.ts
```

Expected: all green.

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/app/api/items/bulk/delete/route.ts tests/unit/bulk-delete-route.test.ts
git commit -m "[CYCLE-12] add POST /api/items/bulk/delete"
```

---

## Task 5: Extend ItemMutation union + InboxGrid handler

**Files:**

- Modify: `apps/web/components/inbox/ItemDrawerProvider.tsx:7-10`
- Modify: `apps/web/components/inbox/InboxGrid.tsx:101-112`

- [ ] **Step 5.1: Extend the union**

Edit `apps/web/components/inbox/ItemDrawerProvider.tsx` — replace the `ItemMutation` type (lines 7-10) with:

```typescript
export type ItemMutation =
  | { kind: 'updated'; item: Item }
  | { kind: 'deleted'; id: string }
  | { kind: 'retried'; item: Item }
  | { kind: 'created'; item: Item }
  | { kind: 'bulk-deleted'; ids: string[] }
  | { kind: 'bulk-retried'; ids: string[] };
```

- [ ] **Step 5.2: Handle new kinds in InboxGrid**

Edit `apps/web/components/inbox/InboxGrid.tsx` — replace the subscribe callback body at lines 102-110 with:

```typescript
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
```

- [ ] **Step 5.3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no TS errors. (If the codebase has any exhaustiveness checks on `ItemMutation.kind`, TypeScript will flag them — but none exist per the grep we ran.)

- [ ] **Step 5.4: Commit**

```bash
git add apps/web/components/inbox/ItemDrawerProvider.tsx apps/web/components/inbox/InboxGrid.tsx
git commit -m "[CYCLE-12] extend ItemMutation with bulk-deleted + bulk-retried"
```

---

## Task 6: Bulk client helpers in items-actions.ts

**Files:**

- Modify: `apps/web/lib/items-actions.ts`

- [ ] **Step 6.1: Append the bulk helpers**

Edit `apps/web/lib/items-actions.ts` — append at the bottom (after existing `deleteItem`):

```typescript
export interface BulkFailure {
  id: string;
  code: string;
  message?: string;
}

export interface BulkOutcome {
  succeeded: string[];
  failed: BulkFailure[];
}

export async function reloadItems(ids: string[]): Promise<ActionResult<BulkOutcome>> {
  const res = await fetch('/api/items/bulk/reload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return parse<BulkOutcome>(res);
}

export async function deleteItems(ids: string[]): Promise<ActionResult<BulkOutcome>> {
  const res = await fetch('/api/items/bulk/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return parse<BulkOutcome>(res);
}
```

- [ ] **Step 6.2: Verify typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/lib/items-actions.ts
git commit -m "[CYCLE-12] add reloadItems/deleteItems bulk client helpers"
```

---

## Task 7: useItemActions hook

**Files:**

- Create: `apps/web/lib/hooks/useItemActions.ts`
- Test: `tests/unit/use-item-actions.test.tsx`

- [ ] **Step 7.1: Write the failing test**

Create `tests/unit/use-item-actions.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const openMock = vi.fn();
const emitMock = vi.fn();
const subscribeMock = vi.fn().mockReturnValue(() => undefined);

vi.mock('@/components/inbox/ItemDrawerProvider', () => ({
  useItemDrawer: () => ({ open: openMock, close: vi.fn(), emit: emitMock, subscribe: subscribeMock }),
}));

const deleteItemMock = vi.fn();
const retryItemMock = vi.fn();
const deleteItemsMock = vi.fn();
const reloadItemsMock = vi.fn();

vi.mock('@/lib/items-actions', () => ({
  deleteItem: (id: string) => deleteItemMock(id),
  retryItem: (id: string) => retryItemMock(id),
  deleteItems: (ids: string[]) => deleteItemsMock(ids),
  reloadItems: (ids: string[]) => reloadItemsMock(ids),
}));

const confirmSpy = vi.spyOn(globalThis, 'confirm' as never);

const { useItemActions } = await import('../../apps/web/lib/hooks/useItemActions');

function wrapper({ children }: { children: ReactNode }) {
  return children as unknown as JSX.Element;
}

beforeEach(() => {
  openMock.mockReset();
  emitMock.mockReset();
  deleteItemMock.mockReset();
  retryItemMock.mockReset();
  deleteItemsMock.mockReset();
  reloadItemsMock.mockReset();
  confirmSpy.mockReset();
});

describe('useItemActions', () => {
  it('openItem delegates to drawer.open', () => {
    const { result } = renderHook(() => useItemActions(), { wrapper });
    act(() => { result.current.openItem('i1'); });
    expect(openMock).toHaveBeenCalledWith('i1');
  });

  it('reloadItem calls retryItem and emits retried on success', async () => {
    retryItemMock.mockResolvedValue({ ok: true, data: { id: 'i1', status: 'pending' } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.reloadItem('i1'); });
    expect(retryItemMock).toHaveBeenCalledWith('i1');
    expect(emitMock).toHaveBeenCalledWith({ kind: 'retried', item: { id: 'i1', status: 'pending' } });
  });

  it('deleteItem (single) does not trigger confirm dialog', async () => {
    deleteItemMock.mockResolvedValue({ ok: true, data: { id: 'i1' } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteItem('i1'); });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith({ kind: 'deleted', id: 'i1' });
  });

  it('deleteMany confirms and emits bulk-deleted on success', async () => {
    confirmSpy.mockReturnValue(true);
    deleteItemsMock.mockResolvedValue({ ok: true, data: { succeeded: ['i1', 'i2'], failed: [] } });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteMany(['i1', 'i2']); });
    expect(confirmSpy).toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith({ kind: 'bulk-deleted', ids: ['i1', 'i2'] });
  });

  it('deleteMany aborts when confirm is cancelled', async () => {
    confirmSpy.mockReturnValue(false);
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.deleteMany(['i1']); });
    expect(deleteItemsMock).not.toHaveBeenCalled();
  });

  it('reloadMany emits bulk-retried with only succeeded ids', async () => {
    reloadItemsMock.mockResolvedValue({
      ok: true,
      data: { succeeded: ['i1'], failed: [{ id: 'i2', code: 'ALREADY_PROCESSING' }] },
    });
    const { result } = renderHook(() => useItemActions(), { wrapper });
    await act(async () => { await result.current.reloadMany(['i1', 'i2']); });
    expect(emitMock).toHaveBeenCalledWith({ kind: 'bulk-retried', ids: ['i1'] });
  });
});
```

- [ ] **Step 7.2: Run test and verify failure**

```bash
npx vitest run tests/unit/use-item-actions.test.tsx
```

Expected: FAIL — hook module not found.

- [ ] **Step 7.3: Implement the hook**

Create `apps/web/lib/hooks/useItemActions.ts`:

```typescript
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import {
  deleteItem as deleteItemAction,
  deleteItems as deleteItemsAction,
  retryItem as retryItemAction,
  reloadItems as reloadItemsAction,
  type ActionResult,
  type BulkOutcome,
} from '@/lib/items-actions';

export interface UseItemActions {
  openItem: (id: string) => void;
  reloadItem: (id: string) => Promise<ActionResult<unknown>>;
  deleteItem: (id: string) => Promise<ActionResult<unknown>>;
  reloadMany: (ids: string[]) => Promise<ActionResult<BulkOutcome>>;
  deleteMany: (ids: string[]) => Promise<ActionResult<BulkOutcome> | { ok: false; error: 'CANCELLED' }>;
  pending: ReadonlySet<string>;
}

export function useItemActions(): UseItemActions {
  const drawer = useItemDrawer();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const mark = useCallback((ids: string[], on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const openItem = useCallback((id: string) => drawer.open(id), [drawer]);

  const reloadItem = useCallback(async (id: string) => {
    mark([id], true);
    const res = await retryItemAction(id);
    mark([id], false);
    if (res.ok) drawer.emit({ kind: 'retried', item: res.data });
    return res;
  }, [drawer, mark]);

  const deleteItem = useCallback(async (id: string) => {
    mark([id], true);
    const res = await deleteItemAction(id);
    mark([id], false);
    if (res.ok) drawer.emit({ kind: 'deleted', id });
    return res;
  }, [drawer, mark]);

  const reloadMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { ok: true as const, data: { succeeded: [], failed: [] } };
    mark(ids, true);
    const res = await reloadItemsAction(ids);
    mark(ids, false);
    if (res.ok) drawer.emit({ kind: 'bulk-retried', ids: res.data.succeeded });
    return res;
  }, [drawer, mark]);

  const deleteMany = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return { ok: true as const, data: { succeeded: [], failed: [] } };
    const msg = ids.length === 1 ? 'Delete 1 item?' : `Delete ${ids.length} items? This cannot be undone.`;
    if (typeof window !== 'undefined' && !window.confirm(msg)) {
      return { ok: false as const, error: 'CANCELLED' as const };
    }
    mark(ids, true);
    const res = await deleteItemsAction(ids);
    mark(ids, false);
    if (res.ok) drawer.emit({ kind: 'bulk-deleted', ids: res.data.succeeded });
    return res;
  }, [drawer, mark]);

  return useMemo(() => ({ openItem, reloadItem, deleteItem, reloadMany, deleteMany, pending }),
    [openItem, reloadItem, deleteItem, reloadMany, deleteMany, pending]);
}
```

- [ ] **Step 7.4: Run tests and verify green**

```bash
npx vitest run tests/unit/use-item-actions.test.tsx
```

Expected: all green.

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/lib/hooks/useItemActions.ts tests/unit/use-item-actions.test.tsx
git commit -m "[CYCLE-12] add useItemActions hook"
```

---

## Task 8: ItemActionsMenu component

**Files:**

- Create: `apps/web/components/inbox/ItemActionsMenu.tsx`
- Test: `tests/unit/item-actions-menu.test.tsx`

**Invoke `frontend-design` skill for visual tokens (ring color, hover/focus states, menu motion) before writing the component.**

- [ ] **Step 8.1: Write the failing test**

Create `tests/unit/item-actions-menu.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const openItemMock = vi.fn();
const reloadItemMock = vi.fn();
const deleteItemMock = vi.fn();

vi.mock('@/lib/hooks/useItemActions', () => ({
  useItemActions: () => ({
    openItem: openItemMock,
    reloadItem: reloadItemMock,
    deleteItem: deleteItemMock,
    reloadMany: vi.fn(),
    deleteMany: vi.fn(),
    pending: new Set<string>(),
  }),
}));

const { ItemActionsMenu } = await import('../../apps/web/components/inbox/ItemActionsMenu');

beforeEach(() => {
  openItemMock.mockReset();
  reloadItemMock.mockReset();
  deleteItemMock.mockReset();
});

describe('ItemActionsMenu', () => {
  it('renders Open/Reload/Delete when status=ready', () => {
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /open/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeEnabled();
  });

  it('disables Reload when status=pending', () => {
    render(<ItemActionsMenu itemId="i1" status="pending" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeDisabled();
  });

  it('disables Reload when status=processing', () => {
    render(<ItemActionsMenu itemId="i1" status="processing" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    expect(screen.getByRole('menuitem', { name: /reload/i })).toBeDisabled();
  });

  it('calls openItem on Open click', () => {
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /open/i }));
    expect(openItemMock).toHaveBeenCalledWith('i1');
  });

  it('calls reloadItem on Reload click', () => {
    reloadItemMock.mockResolvedValue({ ok: true, data: {} });
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /reload/i }));
    expect(reloadItemMock).toHaveBeenCalledWith('i1');
  });

  it('calls deleteItem on Delete click', () => {
    deleteItemMock.mockResolvedValue({ ok: true, data: { id: 'i1' } });
    render(<ItemActionsMenu itemId="i1" status="ready" />);
    fireEvent.click(screen.getByRole('button', { name: /item actions/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
    expect(deleteItemMock).toHaveBeenCalledWith('i1');
  });
});
```

- [ ] **Step 8.2: Run test — expect module-not-found**

```bash
npx vitest run tests/unit/item-actions-menu.test.tsx
```

- [ ] **Step 8.3: Implement the component**

Create `apps/web/components/inbox/ItemActionsMenu.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ItemStatus } from '@/types';
import { useItemActions } from '@/lib/hooks/useItemActions';

interface Props {
  itemId: string;
  status: ItemStatus;
  variant?: 'hover' | 'inline';
  className?: string;
}

export function ItemActionsMenu({ itemId, status, variant = 'hover', className = '' }: Props) {
  const actions = useItemActions();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reloadDisabled = status === 'pending' || status === 'processing';

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const run = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); setOpen(false); };

  const triggerCls = variant === 'hover'
    ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'
    : '';

  return (
    <div ref={rootRef} className={`relative ${className}`} onClick={stop}>
      <button
        type="button"
        aria-label="Item actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted shadow-sm hover:text-foreground ${triggerCls}`}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface-elevated text-sm shadow-lg">
          <button role="menuitem" type="button" onClick={run(() => actions.openItem(itemId))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10">Open</button>
          <button role="menuitem" type="button" disabled={reloadDisabled}
            onClick={run(() => { void actions.reloadItem(itemId); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50">Reload</button>
          <button role="menuitem" type="button" onClick={run(() => { void actions.deleteItem(itemId); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-500/10">Delete</button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8.4: Run tests — expect green**

```bash
npx vitest run tests/unit/item-actions-menu.test.tsx
```

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/components/inbox/ItemActionsMenu.tsx tests/unit/item-actions-menu.test.tsx
git commit -m "[CYCLE-12] add ItemActionsMenu shared component"
```

---

## Task 9: Refactor ItemCard to use ItemActionsMenu

**Files:**

- Modify: `apps/web/components/inbox/ItemCard.tsx` — remove inline `confirmDelete`, `triggerRetry`, and the hover-overlay buttons; mount `ItemActionsMenu` instead.

- [ ] **Step 9.1: Remove old handlers, mount the menu**

In `apps/web/components/inbox/ItemCard.tsx`:

1. Delete lines 139-160 (the `confirmDelete` and `triggerRetry` functions). Also delete the `busy` state variable and its setter if no other code reads it (search within the file).
2. Delete the existing hover overlay JSX that renders retry/delete icons (the block using `opacity-0 group-hover:opacity-100` containing the ↻ and 🗑 buttons).
3. Add this import near the other imports at the top:

```typescript
import { ItemActionsMenu } from './ItemActionsMenu';
```

4. Inside the card JSX (inside the outer wrapper that already has `group` class), add the menu in the top-right corner:

```tsx
<div className="absolute right-2 top-2 z-10">
  <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
</div>
```

5. Delete the now-unused imports `retryItem` and `deleteItem` from `@/lib/items-actions`, plus the `useItemDrawer().emit` call site if it was only used for delete/retry (leave `drawer.open` alone).

- [ ] **Step 9.2: Run typecheck + unit tests**

```bash
npm run typecheck
npx vitest run tests/unit/
```

Expected: clean. The existing `item-card.test.tsx` (from the 2026-04-20 spec) expected inline retry/delete buttons — it needs updating. Find it:

```bash
ls tests/unit/item-card.test.tsx 2>/dev/null && cat tests/unit/item-card.test.tsx | head -5
```

If the file exists and references the old hover buttons (e.g. `getByLabelText('Retry')`), update its assertions to open the ⋯ menu first: `fireEvent.click(getByLabelText('Item actions'))` then assert the menu items. If it doesn't exist, skip.

- [ ] **Step 9.3: Smoke-check in browser**

```bash
npm run dev:web
```

Open `http://localhost:4000/inbox`, hover a card, click ⋯, verify Open/Reload/Delete all work and that Reload is disabled on a `pending` item.

- [ ] **Step 9.4: Commit**

```bash
git add apps/web/components/inbox/ItemCard.tsx tests/unit/item-card.test.tsx
git commit -m "[CYCLE-12] ItemCard uses shared ItemActionsMenu"
```

---

## Task 10: Add ItemActionsMenu to ItemRow + ItemDetailRow

**Files:**

- Modify: `apps/web/components/inbox/ItemRow.tsx`
- Modify: `apps/web/components/inbox/ItemDetailRow.tsx`

- [ ] **Step 10.1: Wire menu into ItemRow**

Edit `apps/web/components/inbox/ItemRow.tsx`:

1. Add import at top:

```typescript
import { ItemActionsMenu } from './ItemActionsMenu';
```

2. Ensure the root element has `className` containing `group relative`. If it already has `group`, add `relative`. The root is the outermost `<div>` or `<button>` wrapper around the row.
3. Immediately before the closing tag of the root element, insert:

```tsx
<div className="ml-auto flex-shrink-0 pr-2" onClick={(e) => e.stopPropagation()}>
  <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
</div>
```

If the row's layout uses flexbox (likely — rows almost always do), the `ml-auto` pushes the menu to the right edge. If not, replace with absolute positioning: `<div className="absolute right-2 top-1/2 -translate-y-1/2">...`.

- [ ] **Step 10.2: Wire menu into ItemDetailRow**

Edit `apps/web/components/inbox/ItemDetailRow.tsx`:

1. Add import at top:

```typescript
import { ItemActionsMenu } from './ItemActionsMenu';
```

2. Ensure the root element's `className` contains `group relative`. Add the missing token(s) if absent.
3. Immediately before the closing tag of the root element, insert:

```tsx
<div className="ml-auto flex-shrink-0 pr-2" onClick={(e) => e.stopPropagation()}>
  <ItemActionsMenu itemId={item.id} status={item.status} variant="hover" />
</div>
```

The detail row uses the same flex layout as `ItemRow`, so `ml-auto` pushes the menu to the right edge. If the layout is not flex, replace the wrapper with `<div className="absolute right-2 top-4">...</div>`.

- [ ] **Step 10.3: Typecheck + run dev server smoke-check**

```bash
npm run typecheck
npm run dev:web
```

Visit `/inbox`, switch to List view, hover a row — menu appears at right. Switch to Detail view, same. Confirm Open/Reload/Delete all work.

- [ ] **Step 10.4: Commit**

```bash
git add apps/web/components/inbox/ItemRow.tsx apps/web/components/inbox/ItemDetailRow.tsx
git commit -m "[CYCLE-12] ItemRow + ItemDetailRow get ItemActionsMenu"
```

---

## Task 11: Add Reload toolbar button to ItemDrawer

**Files:**

- Modify: `apps/web/components/inbox/ItemDrawer.tsx`

- [ ] **Step 11.1: Add the Reload button**

Edit `apps/web/components/inbox/ItemDrawer.tsx`:

1. Add import at top (if `useItemActions` isn't already imported):

```typescript
import { useItemActions } from '@/lib/hooks/useItemActions';
```

2. Inside the drawer component body, call the hook and grab the loaded `item` (it's already available — the drawer loads the item by id):

```typescript
const actions = useItemActions();
const reloadDisabled = item?.status === 'pending' || item?.status === 'processing';
```

3. In the toolbar row where the existing Delete button lives (find the button at line 262 per earlier mapping — the one calling delete), insert a new button immediately to the left:

```tsx
<button
  type="button"
  disabled={reloadDisabled || !item}
  onClick={() => item && actions.reloadItem(item.id)}
  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
>
  Reload
</button>
```

4. The drawer should NOT close on reload. The existing `onDeleted` handler in `ItemDrawerProvider` (line 47) closes on delete — leave that alone. Reload just flips the local item state to `pending` via the emitted `retried` event.

- [ ] **Step 11.2: Smoke-check**

```bash
npm run dev:web
```

Open a ready item in the drawer, click Reload — drawer stays open, item flips to pending (skeleton or pending state renders inside).

- [ ] **Step 11.3: Commit**

```bash
git add apps/web/components/inbox/ItemDrawer.tsx
git commit -m "[CYCLE-12] ItemDrawer: add Reload toolbar button"
```

---

## Task 12: Context-menu on ItemChip + hover menu on chat rail

**Files:**

- Modify: `apps/web/components/chat/ItemChip.tsx`
- Modify: `apps/web/components/chat/ChatMessage.tsx:94-118`

- [ ] **Step 12.1: Wire ItemChip context-menu**

The chip needs a popover that opens *directly* on right-click / long-press / Shift+F10 — not a ⋯ trigger that reveals another trigger. Do NOT use `ItemActionsMenu` here; render the Open/Reload/Delete items inline via `useItemActions`.

Replace the full content of `apps/web/components/chat/ItemChip.tsx` with:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { useItemDrawer } from '@/components/inbox/ItemDrawerProvider';
import { useItemActions } from '@/lib/hooks/useItemActions';
import type { ChatItemRef } from './ChatMessage';
import { TypeIcon } from '@/components/ui/icons';

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}

interface Props {
  id: string;
  item?: ChatItemRef;
  status?: 'pending' | 'processing' | 'ready' | 'error';
}

export function ItemChip({ id, item, status = 'ready' }: Props) {
  const drawer = useItemDrawer();
  const actions = useItemActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const label = item?.title ? truncate(item.title, 32) : id;
  const reloadDisabled = status === 'pending' || status === 'processing';

  const clearLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation(); fn(); setMenuOpen(false);
  };

  return (
    <span ref={rootRef} className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => { if (!menuOpen) drawer.open(id); }}
        onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
        onPointerDown={() => { longPressTimer.current = setTimeout(() => setMenuOpen(true), 500); }}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'F10') { e.preventDefault(); setMenuOpen(true); }
        }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="chat-item-chip"
        className="inline-flex items-baseline gap-1 rounded-md border border-accent/20 bg-accent/10 px-1.5 py-0.5 align-baseline text-xs font-medium text-accent transition-colors hover:border-accent/40 hover:bg-accent/20"
      >
        <TypeIcon type={item?.type ?? 'url'} size={11} strokeWidth={2} className="translate-y-[1px]" />
        <span className="max-w-[18ch] truncate">{label}</span>
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[140px] overflow-hidden rounded-md border border-border bg-surface-elevated text-sm shadow-lg"
        >
          <button role="menuitem" type="button" onClick={run(() => actions.openItem(id))}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10">Open</button>
          <button role="menuitem" type="button" disabled={reloadDisabled}
            onClick={run(() => { void actions.reloadItem(id); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50">Reload</button>
          <button role="menuitem" type="button" onClick={run(() => { void actions.deleteItem(id); })}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-500 hover:bg-red-500/10">Delete</button>
        </div>
      ) : null}
    </span>
  );
}
```

Why this shape: `ItemActionsMenu` is optimized for the "card corner hover ⋯" pattern — it owns its own trigger button. The chip needs the opposite: the chip IS the trigger, and the menu body renders directly below it. Reusing `ItemActionsMenu` with `variant="inline"` would create a double-trigger (right-click the chip → ⋯ button appears → click ⋯ → menu shows). The inline menu-items above give single-gesture UX while reusing the same `useItemActions` handlers, so behavior stays consistent with the other views.

- [ ] **Step 12.2: Update ChatMessage callers if they pass extra props**

Search for `ItemChip` call sites:

```bash
grep -rn "ItemChip" apps/web/components apps/web/app
```

Verify callers pass an `item` prop. If the call site has access to `item.status`, pass it along (`status={item.status}`). If not, leave the default `ready`.

- [ ] **Step 12.3: Wire hover menu on chat rail**

Edit `apps/web/components/chat/ChatMessage.tsx` at lines 94-118. Replace the `<button>` for each rail item with:

```tsx
{railItems.map((item) => (
  <div key={item.id} className="group relative">
    <button
      type="button"
      onClick={() => drawer.open(item.id)}
      data-testid="item-card"
      className="flex min-w-[220px] snap-start flex-col gap-1.5 rounded-xl border border-border bg-surface-elevated p-3 text-left text-xs shadow-card transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover"
    >
      <span className="flex items-center gap-1.5 text-muted">
        <TypeIcon type={item.type} size={12} strokeWidth={2} />
        <span className="truncate">{domainFromUrl(item.source_url) ?? item.type}</span>
      </span>
      <span className="line-clamp-2 font-medium text-foreground">{truncate(item.title ?? '(untitled)', 40)}</span>
      <span className="inline-flex items-center gap-1 text-accent opacity-80 transition-opacity group-hover:opacity-100">
        Open details →
      </span>
    </button>
    <div className="absolute right-2 top-2">
      <ItemActionsMenu itemId={item.id} status={(item as { status?: 'pending' | 'processing' | 'ready' | 'error' }).status ?? 'ready'} variant="hover" />
    </div>
  </div>
))}
```

Add this import near the existing imports at the top of the file:

```typescript
import { ItemActionsMenu } from '@/components/inbox/ItemActionsMenu';
```

Note: `ChatItemRef` may not carry `status`. If it doesn't, the cast-with-default above works at runtime — `'ready'` is a safe default for chat citations since the AI only cites items that had content to embed. If the type does carry status, TypeScript will narrow correctly.

- [ ] **Step 12.4: Smoke-check**

```bash
npm run dev:web
```

Open `/chat`, trigger a response with item citations, right-click a chip → menu. Hover a rail card → ⋯ appears. Verify Open/Reload/Delete work from both.

- [ ] **Step 12.5: Commit**

```bash
git add apps/web/components/chat/ItemChip.tsx apps/web/components/chat/ChatMessage.tsx
git commit -m "[CYCLE-12] chat: add item actions menu to chip + rail"
```

---

## Task 13: SelectionProvider (TDD)

**Files:**

- Create: `apps/web/components/inbox/SelectionProvider.tsx`
- Test: `tests/unit/selection-provider.test.tsx`

- [ ] **Step 13.1: Write the failing test**

Create `tests/unit/selection-provider.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

const usePathnameMock = vi.fn().mockReturnValue('/inbox');
vi.mock('next/navigation', () => ({ usePathname: () => usePathnameMock() }));

const { SelectionProvider, useSelection } = await import('../../apps/web/components/inbox/SelectionProvider');

function wrapper({ children }: { children: ReactNode }) {
  return <SelectionProvider>{children}</SelectionProvider>;
}

describe('SelectionProvider', () => {
  it('starts in mode=false with empty selection', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    expect(result.current.mode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('enter() flips mode to true', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.enter(); });
    expect(result.current.mode).toBe(true);
  });

  it('toggle adds then removes ids', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.toggle('i1'); });
    expect(result.current.selectedIds.has('i1')).toBe(true);
    act(() => { result.current.toggle('i1'); });
    expect(result.current.selectedIds.has('i1')).toBe(false);
  });

  it('selectAll populates and clear empties', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.selectAll(['a', 'b', 'c']); });
    expect(result.current.selectedIds.size).toBe(3);
    act(() => { result.current.clear(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('exit() flips mode off and clears selection', () => {
    const { result } = renderHook(() => useSelection(), { wrapper });
    act(() => { result.current.enter(); result.current.toggle('i1'); });
    act(() => { result.current.exit(); });
    expect(result.current.mode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});
```

- [ ] **Step 13.2: Run test — expect module-not-found**

```bash
npx vitest run tests/unit/selection-provider.test.tsx
```

- [ ] **Step 13.3: Implement the provider**

Create `apps/web/components/inbox/SelectionProvider.tsx`:

```typescript
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

interface SelectionApi {
  mode: boolean;
  selectedIds: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  enter: () => void;
  exit: () => void;
}

const SelectionContext = createContext<SelectionApi | null>(null);

export function useSelection(): SelectionApi {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within <SelectionProvider>');
  return ctx;
}

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => { setSelectedIds(new Set(ids)); }, []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const enter = useCallback(() => setMode(true), []);
  const exit = useCallback(() => { setMode(false); setSelectedIds(new Set()); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mode) exit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, exit]);

  useEffect(() => {
    exit();
  }, [pathname, exit]);

  const api = useMemo<SelectionApi>(() => ({ mode, selectedIds, toggle, selectAll, clear, enter, exit }),
    [mode, selectedIds, toggle, selectAll, clear, enter, exit]);

  return <SelectionContext.Provider value={api}>{children}</SelectionContext.Provider>;
}
```

- [ ] **Step 13.4: Run tests — expect green**

```bash
npx vitest run tests/unit/selection-provider.test.tsx
```

- [ ] **Step 13.5: Commit**

```bash
git add apps/web/components/inbox/SelectionProvider.tsx tests/unit/selection-provider.test.tsx
git commit -m "[CYCLE-12] add SelectionProvider context"
```

---

## Task 14: Create inbox layout + mount SelectionProvider

**Files:**

- Create: `apps/web/app/(app)/inbox/layout.tsx`

- [ ] **Step 14.1: Create the layout**

Create `apps/web/app/(app)/inbox/layout.tsx`:

```typescript
import { SelectionProvider } from '@/components/inbox/SelectionProvider';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return <SelectionProvider>{children}</SelectionProvider>;
}
```

(Parent `(app)/layout.tsx` already mounts `ItemDrawerProvider`, so selection nests inside that.)

- [ ] **Step 14.2: Verify inbox still renders**

```bash
npm run dev:web
```

Visit `/inbox` — grid should render with no visible change yet. Visit `/chat` — confirm selection context is NOT available (would throw if a chat component called `useSelection()`; it doesn't).

- [ ] **Step 14.3: Commit**

```bash
git add apps/web/app/\(app\)/inbox/layout.tsx
git commit -m "[CYCLE-12] mount SelectionProvider on inbox routes"
```

---

## Task 15: "Select" button in FilterBar

**Files:**

- Modify: `apps/web/components/inbox/FilterBar.tsx`

- [ ] **Step 15.1: Add the Select button**

Edit `apps/web/components/inbox/FilterBar.tsx`. Immediately after line 72 (after the closing `</div>` of the view-mode `radiogroup`), insert:

```tsx
<SelectionButton />
```

Add the `SelectionButton` component at the bottom of the file (after the existing `ViewButton` export):

```typescript
function SelectionButton() {
  const { mode, enter, exit } = useSelection();
  return (
    <button
      type="button"
      onClick={mode ? exit : enter}
      className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
        mode
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-surface-elevated text-muted hover:text-foreground'
      }`}
    >
      {mode ? 'Done' : 'Select'}
    </button>
  );
}
```

Add the import near the top imports:

```typescript
import { useSelection } from './SelectionProvider';
```

- [ ] **Step 15.2: Typecheck and smoke-check**

```bash
npm run typecheck
npm run dev:web
```

Visit `/inbox`, click "Select" — button turns accent color, label changes to "Done". Click again or press Esc — back to normal.

- [ ] **Step 15.3: Commit**

```bash
git add apps/web/components/inbox/FilterBar.tsx
git commit -m "[CYCLE-12] FilterBar: add Select mode toggle"
```

---

## Task 16: Checkbox overlays in ItemCard/ItemRow/ItemDetailRow

**Files:**

- Modify: `apps/web/components/inbox/ItemCard.tsx`
- Modify: `apps/web/components/inbox/ItemRow.tsx`
- Modify: `apps/web/components/inbox/ItemDetailRow.tsx`

- [ ] **Step 16.1: ItemCard checkbox + selection-mode click behavior**

Edit `apps/web/components/inbox/ItemCard.tsx`:

1. Add import near top:

```typescript
import { useSelection } from './SelectionProvider';
```

2. Inside the component body, add:

```typescript
const selection = useSelection();
const selected = selection.selectedIds.has(item.id);
const selectionMode = selection.mode;
```

3. Replace the outer card root's `onClick` handler. Whatever it currently does (e.g. `onClick={() => drawer.open(item.id)}`), wrap it:

```tsx
onClick={(e) => {
  if (selectionMode) { e.preventDefault(); selection.toggle(item.id); return; }
  drawer.open(item.id);
}}
```

4. Add a ring to the outer wrapper when selected. Find the `className` of the root and append:

```
${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''}
```

5. Mount a checkbox overlay (only when `selectionMode === true`) at the top-left:

```tsx
{selectionMode ? (
  <div className="absolute left-2 top-2 z-20" onClick={(e) => e.stopPropagation()}>
    <input
      type="checkbox"
      checked={selected}
      onChange={() => selection.toggle(item.id)}
      aria-label={`Select ${item.title ?? 'item'}`}
      className="h-5 w-5 rounded border-border"
    />
  </div>
) : null}
```

- [ ] **Step 16.2: ItemRow checkbox + selection-mode click behavior**

Edit `apps/web/components/inbox/ItemRow.tsx`:

1. Add import near top:

```typescript
import { useSelection } from './SelectionProvider';
```

2. Inside the component body, add:

```typescript
const selection = useSelection();
const selected = selection.selectedIds.has(item.id);
const selectionMode = selection.mode;
```

3. Wrap the row's existing `onClick` (which likely calls `drawer.open(item.id)`):

```tsx
onClick={(e) => {
  if (selectionMode) { e.preventDefault(); selection.toggle(item.id); return; }
  drawer.open(item.id);
}}
```

4. Append to the root element's `className` a conditional selected state — use a left-border accent (rings on thin rows look cramped):

```
${selected ? 'border-l-2 border-l-accent bg-accent/5' : ''}
```

5. At the very start of the row's flex container (before the thumbnail), render a checkbox that only appears in selection mode:

```tsx
{selectionMode ? (
  <input
    type="checkbox"
    checked={selected}
    onChange={(e) => { e.stopPropagation(); selection.toggle(item.id); }}
    aria-label={`Select ${item.title ?? 'item'}`}
    className="h-4 w-4 rounded border-border"
  />
) : null}
```

- [ ] **Step 16.3: ItemDetailRow checkbox + selection-mode click behavior**

Edit `apps/web/components/inbox/ItemDetailRow.tsx`:

1. Add import near top:

```typescript
import { useSelection } from './SelectionProvider';
```

2. Inside the component body, add:

```typescript
const selection = useSelection();
const selected = selection.selectedIds.has(item.id);
const selectionMode = selection.mode;
```

3. Wrap the row's existing `onClick`:

```tsx
onClick={(e) => {
  if (selectionMode) { e.preventDefault(); selection.toggle(item.id); return; }
  drawer.open(item.id);
}}
```

4. Append to the root element's `className`:

```
${selected ? 'border-l-2 border-l-accent bg-accent/5' : ''}
```

5. At the very start of the detail row's flex container (before the thumbnail), render the checkbox — the larger detail row uses `h-5 w-5` to match the card:

```tsx
{selectionMode ? (
  <input
    type="checkbox"
    checked={selected}
    onChange={(e) => { e.stopPropagation(); selection.toggle(item.id); }}
    aria-label={`Select ${item.title ?? 'item'}`}
    className="h-5 w-5 rounded border-border"
  />
) : null}
```

- [ ] **Step 16.4: Smoke-check**

```bash
npm run dev:web
```

Visit `/inbox`, click Select, click several cards/rows — they visibly select. Click again to deselect. Press Esc — selection clears, mode exits.

- [ ] **Step 16.5: Commit**

```bash
git add apps/web/components/inbox/ItemCard.tsx apps/web/components/inbox/ItemRow.tsx apps/web/components/inbox/ItemDetailRow.tsx
git commit -m "[CYCLE-12] selection-mode checkboxes in grid/list/detail views"
```

---

## Task 17: SelectionActionBar + bulk wiring + toast

**Files:**

- Create: `apps/web/components/inbox/SelectionActionBar.tsx`
- Modify: `apps/web/app/(app)/inbox/layout.tsx`

- [ ] **Step 17.1: Create the action bar**

Create `apps/web/components/inbox/SelectionActionBar.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useSelection } from './SelectionProvider';
import { useItemActions } from '@/lib/hooks/useItemActions';

export function SelectionActionBar() {
  const selection = useSelection();
  const actions = useItemActions();
  const [toast, setToast] = useState<string | null>(null);

  if (!selection.mode) return null;
  const ids = Array.from(selection.selectedIds);
  const empty = ids.length === 0;

  async function onReload() {
    const res = await actions.reloadMany(ids);
    selection.clear();
    if (!res.ok) { setToast(`Reload failed: ${res.error}`); return; }
    const { succeeded, failed } = res.data;
    setToast(failed.length === 0
      ? `Reloaded ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}`
      : `${succeeded.length} reloaded, ${failed.length} failed`);
  }

  async function onDelete() {
    const res = await actions.deleteMany(ids);
    if (!res.ok && res.error === 'CANCELLED') return;
    selection.exit();
    if (!res.ok) { setToast(`Delete failed: ${res.error}`); return; }
    const { succeeded, failed } = res.data;
    setToast(failed.length === 0
      ? `Deleted ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}`
      : `${succeeded.length} deleted, ${failed.length} failed`);
  }

  return (
    <>
      <div role="toolbar" aria-label="Bulk actions"
        className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-surface-elevated px-4 py-2 shadow-xl">
        <span className="text-sm font-medium">{ids.length} selected</span>
        <button type="button" disabled={empty} onClick={() => void onReload()}
          className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent/10 disabled:opacity-50">Reload</button>
        <button type="button" disabled={empty} onClick={() => void onDelete()}
          className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50">Delete</button>
        <button type="button" onClick={() => selection.exit()}
          className="rounded-full px-3 py-1 text-xs text-muted hover:text-foreground">Cancel</button>
      </div>
      {toast ? (
        <div role="status" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-surface-elevated px-4 py-2 text-sm shadow-lg">
          {toast}
          <button type="button" onClick={() => setToast(null)} className="ml-3 text-muted hover:text-foreground" aria-label="Dismiss">×</button>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 17.2: Mount in inbox layout**

Edit `apps/web/app/(app)/inbox/layout.tsx`:

```typescript
import { SelectionProvider } from '@/components/inbox/SelectionProvider';
import { SelectionActionBar } from '@/components/inbox/SelectionActionBar';

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <SelectionProvider>
      {children}
      <SelectionActionBar />
    </SelectionProvider>
  );
}
```

- [ ] **Step 17.3: Smoke-check the full flow**

```bash
npm run dev:web
```

1. Visit `/inbox`, click Select, select 3 items.
2. Action bar at bottom shows "3 selected".
3. Click Reload — items flip to pending, toast shows "Reloaded 3 items". Selection clears.
4. Select 2 items, click Delete — confirm dialog, accept, items vanish, toast shows "Deleted 2 items". Mode exits.
5. Press Esc mid-selection — mode exits cleanly.

- [ ] **Step 17.4: Commit**

```bash
git add apps/web/components/inbox/SelectionActionBar.tsx apps/web/app/\(app\)/inbox/layout.tsx
git commit -m "[CYCLE-12] SelectionActionBar with bulk reload/delete"
```

---

## Task 18: Playwright E2E for bulk delete

**Files:**

- Create: `tests/e2e/bulk-delete.spec.ts`

**Invoke `webapp-testing` skill for test authoring.**

- [ ] **Step 18.1: Write the E2E test**

Create `tests/e2e/bulk-delete.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('bulk delete in inbox', () => {
  test('select 3 cards and delete them', async ({ page }) => {
    // Precondition: the test harness seeds at least 5 ready items for the logged-in user.
    // See playwright.config.ts `globalSetup` — if seeding is missing, the test should fail loudly here.
    await page.goto('/inbox');
    await expect(page.getByTestId('item-card').first()).toBeVisible();

    const initialCount = await page.getByTestId('item-card').count();
    expect(initialCount).toBeGreaterThanOrEqual(5);

    await page.getByRole('button', { name: 'Select' }).click();
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();

    const cards = page.getByTestId('item-card');
    for (let i = 0; i < 3; i++) await cards.nth(i).click();

    await expect(page.getByRole('toolbar', { name: 'Bulk actions' })).toContainText('3 selected');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(/Deleted 3 items/i)).toBeVisible();
    await expect(page.getByTestId('item-card')).toHaveCount(initialCount - 3);
  });
});
```

- [ ] **Step 18.2: Run the E2E test**

```bash
npm run test:e2e -- bulk-delete.spec.ts
```

Expected: green. If it fails because no items are seeded, add seeding to the project's existing `playwright.config.ts` globalSetup or note the BLOCKER in `BLOCKERS.md` per the CLAUDE.md convention. Do not skip the test.

- [ ] **Step 18.3: Commit**

```bash
git add tests/e2e/bulk-delete.spec.ts
git commit -m "[CYCLE-12] e2e: bulk delete smoke test"
```

---

## Task 19: Accessibility pass

**Files:**

- Various (audit, not create)

**Invoke `frontend-design-pro:review` skill for this pass.**

- [ ] **Step 19.1: Run the a11y audit**

Invoke the `frontend-design-pro:review` skill with this context:

> "Audit the following for accessibility:
> - `ItemActionsMenu` — keyboard reachability, ARIA menu semantics, focus return on close.
> - `SelectionActionBar` — focus trap when mode is on, ESC behavior, `aria-live` for the toast.
> - Checkbox overlays in `ItemCard`/`ItemRow`/`ItemDetailRow` — `aria-label`, `aria-checked`, reachable via Tab.
> - `ItemChip` — keyboard alternative to right-click (Shift+F10 is already wired — verify it works).
>
> Report findings as a checklist of specific fixes with file:line."

- [ ] **Step 19.2: Apply fixes**

For each finding, apply the fix inline. Common patterns:
- Missing `aria-checked`: set `aria-checked={selected}` on clickable selection rows.
- Missing `aria-live`: add `aria-live="polite"` to the toast div.
- Focus not returning after menu close: in `ItemActionsMenu`, store the trigger ref and call `.focus()` when `open` goes false.

- [ ] **Step 19.3: Re-run unit tests**

```bash
npm test
```

- [ ] **Step 19.4: Commit**

```bash
git add -u
git commit -m "[CYCLE-12] a11y pass on item CRUD UI"
```

---

## Task 20: Final verification

- [ ] **Step 20.1: Full typecheck + test suite**

```bash
npm run typecheck
npm test
npm run test:e2e
```

All three must pass. No skipped/pending tests.

- [ ] **Step 20.2: Manual acceptance checklist**

Walk through the spec's Acceptance section end-to-end:

- [ ] Grid card ⋯ → Open/Reload/Delete all work
- [ ] List row ⋯ → Open/Reload/Delete all work
- [ ] Detail row ⋯ → Open/Reload/Delete all work
- [ ] Drawer toolbar has Reload button (left of Delete)
- [ ] Chat chip: right-click → menu, primary click → open
- [ ] Chat rail card: hover → ⋯ menu appears
- [ ] Reload disabled when `status === 'pending'` or `'processing'`
- [ ] "Select" button enters mode; grid/list/detail all show checkboxes
- [ ] Selection persists across view-mode switches (grid ↔ list ↔ detail)
- [ ] Bulk Reload flips N items to pending; toast on partial failure
- [ ] Bulk Delete confirms with count; items vanish; toast on completion
- [ ] Esc exits selection mode and clears selection
- [ ] Route change (inbox → chat) clears selection

- [ ] **Step 20.3: Open PR**

```bash
git push -u origin HEAD
gh pr create --title "[CYCLE-12] unified item CRUD + bulk selection" --body "$(cat <<'EOF'
## Summary
- Every item view (grid, list, detail, drawer, chat chip, chat rail) exposes Open/Reload/Delete via shared ItemActionsMenu
- /retry gate widened to accept ready items (rejects only pending/processing)
- Two new bulk endpoints: POST /api/items/bulk/reload and .../bulk/delete
- Inbox routes gain SelectionProvider + SelectionActionBar for multi-select

Spec: docs/superpowers/specs/2026-04-24-unified-item-crud-design.md
Plan: docs/superpowers/plans/2026-04-24-unified-item-crud.md

## Test plan
- [x] Unit: vitest green (retry gate widened, bulk endpoints, useItemActions, SelectionProvider, ItemActionsMenu)
- [x] Integration: drawer events propagate to InboxGrid for bulk-* kinds
- [x] E2E: Playwright bulk-delete smoke test
- [x] a11y pass via frontend-design-pro:review
- [x] Manual acceptance checklist in plan Task 20.2
EOF
)"
```

---

## Verification after completion

Run this once everything is merged to confirm nothing regressed:

```bash
npm run typecheck && npm test && npm run test:e2e
```

If any fail, do not close the plan.
