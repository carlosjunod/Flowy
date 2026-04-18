# CYCLE-01 — Backend Foundation

**Dependencies**: None  
**Complexity**: Medium  
**Estimated time**: 1–2 days

---

## Goal
Working PocketBase instance with full schema, a validated `/api/ingest` endpoint, and a BullMQ worker that receives and acknowledges jobs.

---

## Tasks

### T01 — Initialize monorepo workspace
**File**: `package.json`, `apps/web/package.json`, `worker/package.json`  
**Action**: Create root `package.json` with workspaces `["apps/web", "worker"]`. Install shared devDeps: TypeScript 5.x, vitest, concurrently.  
**Acceptance**: `npm install` at root installs all deps. `npm run dev` starts both web and worker in parallel.

---

### T02 — Create PocketBase schema migration
**File**: `pb/pb_migrations/1_initial_schema.js`  
**Action**: Create migration that defines two collections:

`users` (PocketBase built-in auth — no changes needed)

`items`:
```
id          string (auto)
user        relation → users (required)
type        select: url | screenshot | youtube | receipt | pdf | audio (required)
raw_url     text (optional)
r2_key      text (optional)
title       text (optional)
summary     text (optional)
content     text (optional)
tags        json (array)
category    text (optional)
status      select: pending | processing | ready | error (required, default: pending)
error_msg   text (optional)
source_url  text (optional)
created     autodate
updated     autodate
```

**Acceptance**: Running `./pocketbase migrate up` applies migration. PocketBase admin at `:8090/_/` shows `items` collection with all fields.

---

### T03 — Create embedding store migration
**File**: `pb/pb_migrations/2_embeddings.js`  
**Action**: Create `embeddings` collection:
```
id          string (auto)
item        relation → items (required, unique)
vector      json (float array, 1536 dims for text-embedding-3-small)
created     autodate
```
**Acceptance**: `embeddings` collection visible in PocketBase admin. `item` field has unique constraint.

---

### T04 — Create PocketBase client lib (worker)
**File**: `worker/src/lib/pocketbase.ts`  
**Action**: Export singleton PocketBase client authenticated as admin using `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` env vars. Export typed `ItemRecord` interface matching the schema from T02.  
**Acceptance**: `import { pb, ItemRecord } from './lib/pocketbase'` resolves without error. Auth is called once on module load.

---

### T05 — Create BullMQ queue definitions
**File**: `worker/src/queues.ts`  
**Action**: Export `ingestQueue` (BullMQ Queue) and `ingestWorker` (BullMQ Worker) connected to `REDIS_URL`. Queue name: `"ingest"`. Worker processor: stub that logs `job.data` and returns `{ received: true }`.  
**Acceptance**: Worker boots without error. Adding a job to `ingestQueue` causes the stub processor to log within 2s.

---

### T06 — Create POST /api/ingest route
**File**: `apps/web/app/api/ingest/route.ts`  
**Action**: Implement POST handler:
1. Validate `Authorization: Bearer <token>` header — return `{ error: 'UNAUTHORIZED' }` HTTP 401 if missing or invalid
2. Parse body — must contain `type` (one of: `url | screenshot | youtube | receipt | pdf | audio`) — return `{ error: 'INVALID_TYPE' }` HTTP 400 if missing/invalid
3. For `type: 'url'` or `type: 'youtube'` — require `raw_url` field — return `{ error: 'MISSING_URL' }` HTTP 400 if absent
4. For `type: 'screenshot'` — require `raw_image` (base64 string) field — return `{ error: 'MISSING_IMAGE' }` HTTP 400 if absent
5. Create item in PocketBase with `status: 'pending'`
6. Enqueue job to `ingestQueue` with `{ itemId, type, raw_url?, raw_image? }`
7. Return `{ data: { id: string, status: 'pending' } }` HTTP 201

⚠️ Auth validation must check PocketBase token — use `pb.authStore.isValid` after loading token  
**Acceptance**: See unit tests in T07.

---

### T07 — Unit tests for /api/ingest
**File**: `tests/unit/ingest.test.ts`  
**Action**: Write vitest tests covering:
- Missing auth header → 401 `UNAUTHORIZED`
- Invalid type → 400 `INVALID_TYPE`
- Type `url` missing `raw_url` → 400 `MISSING_URL`
- Type `screenshot` missing `raw_image` → 400 `MISSING_IMAGE`
- Valid URL payload → 201 with `{ data: { id, status: 'pending' } }`
- Valid screenshot payload → 201 with `{ data: { id, status: 'pending' } }`

Mock PocketBase and BullMQ — do not hit real services in unit tests.  
**Acceptance**: `npx vitest run tests/unit/ingest.test.ts` — all 6 cases pass, 0 failures.

---

### T08 — Wire worker to update item status
**File**: `worker/src/index.ts`  
**Action**: Replace stub processor with real handler:
1. Load item from PocketBase by `job.data.itemId`
2. Update item `status` to `'processing'`
3. Log `[worker] processing item ${itemId} type=${type}`
4. Return `{ received: true }` (actual processing happens in Cycle 02–04)
5. On any error: update item `status` to `'error'`, set `error_msg` to `error.message`

⚠️ Wrap entire processor in try/catch — unhandled worker errors cause BullMQ to retry indefinitely  
**Acceptance**: POST valid item → PocketBase shows `status: 'processing'` within 3s. POST invalid item that causes worker error → PocketBase shows `status: 'error'`.

---

### T09 — Create .env.example
**File**: `.env.example`  
**Action**: Copy all env vars from CLAUDE.md env section into `.env.example` with empty values and inline comments describing each key.  
**Acceptance**: File exists, contains all 12 keys, no real secrets present.

---

### T10 — Unit tests for worker status updates
**File**: `tests/unit/worker.test.ts`  
**Action**: Write vitest tests covering:
- Valid job → item status updated to `'processing'`
- Worker error → item status updated to `'error'` with `error_msg`

Mock PocketBase client.  
**Acceptance**: `npx vitest run tests/unit/worker.test.ts` — all cases pass.

---

## Cycle Exit Criteria

- [ ] `POST /api/ingest` with valid URL payload returns `201 { data: { id, status: 'pending' } }`
- [ ] Worker receives job and updates item to `status: 'processing'` within 3s
- [ ] Worker error path sets `status: 'error'` with `error_msg`
- [ ] `npx vitest run tests/unit/` — all tests pass, 0 failures
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] `.env.example` contains all required keys
- [ ] PocketBase admin shows `items` and `embeddings` collections with correct schema
- [ ] `git log` shows one commit per completed task
