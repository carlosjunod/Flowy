# Flowy — BLOCKERS.md

Template for logging blockers during autonomous execution. One entry per blocker.

---

| Field | Description |
|-------|-------------|
| **Date** | ISO date when blocker was encountered |
| **Cycle** | Cycle number (e.g., CYCLE-01) |
| **Task** | Task ID (e.g., T04) |
| **Blocker** | Clear description of what is blocked and why |
| **Attempted** | What was tried before logging the blocker |
| **Workaround** | Suggested workaround if one exists |
| **Status** | OPEN / RESOLVED / SKIPPED |

---

<!-- Add blocker entries below this line -->

| Field | Value |
|-------|-------|
| **Date** | 2026-04-24 |
| **Cycle** | (infra) |
| **Task** | tests/unit/ingest.test.ts, chat.test.ts, items.route.test.ts, retry-route.test.ts |
| **Blocker** | 32 unit tests fail with 401 UNAUTHORIZED on baseline. `vi.mock('pocketbase', factory)` factory is never evaluated when the route under test imports `pocketbase`, so the real SDK tries to auth against localhost:8090 and throws in the `catch` block of `authenticate()`. Has been broken since `ecb50b6` (commit that introduced the tests). |
| **Attempted** | Added console.logs inside the mock factory and constructor — none fire. Confirmed the route module loads fine (`POST` is a function) and `mockResolvedValue` records results as expected in an isolated mock test. Likely a mock-resolution mismatch between bare spec `'pocketbase'` and how Vitest 1.6 resolves it from the route file at `apps/web/node_modules/pocketbase`. |
| **Workaround** | For the /reel/ routing fix, added `tests/unit/ingest-instagram-routing.test.ts` with pure regex + coercion tests (13 passing) that cover the behavior without going through the route's auth path. The 2 tests I added to `ingest.test.ts` document the route-level behavior and will light up once the mock infra is fixed. |
| **Status** | OPEN |
