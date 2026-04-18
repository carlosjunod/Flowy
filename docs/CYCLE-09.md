# CYCLE-09 — Polish + Smoke Test

**Dependencies**: All previous cycles  
**Complexity**: Medium

---

## Goal
PWA manifest, empty states, error boundaries, and full end-to-end smoke test.

---

## Tasks

### T01 — Add PWA manifest
**File**: `apps/web/app/manifest.ts`, `apps/web/public/icons/`  
**Action**: Next.js 15 `manifest.ts` export with: `name: "Tryflowy"`, `short_name: "Tryflowy"`, `start_url: "/chat"`, `display: "standalone"`, `background_color: "#0a0a0a"`, `theme_color: "#0a0a0a"`, icons at 192x192 and 512x512.  
**Acceptance**: `GET /manifest.webmanifest` returns valid JSON. Lighthouse PWA score ≥ 80.

### T02 — Add empty states
**Files**: `apps/web/components/chat/ChatWindow.tsx`, `apps/web/components/inbox/InboxGrid.tsx`  
**Action**: 
- Chat: if `messages.length === 0` → show centered illustration + "Ask anything about your saved content" + 3 example queries as clickable chips
- Inbox: if `items.length === 0` → show centered illustration + "Nothing saved yet" + "Share something from any app to get started"

**Acceptance**: Fresh user sees empty states on both pages.

### T03 — Add error boundaries
**Files**: `apps/web/app/(app)/chat/page.tsx`, `apps/web/app/(app)/inbox/page.tsx`  
**Action**: Wrap both pages in React error boundary components that show "Something went wrong — refresh to try again" on uncaught render errors.  
**Acceptance**: Throwing error in ChatWindow renders error boundary UI, not blank page.

### T04 — Full smoke test
**File**: `tests/e2e/smoke.spec.ts`  
**Action**: Playwright test covering complete user journey:
1. POST to `/api/ingest` with test URL (authenticated)
2. Poll PocketBase every 2s until item `status === 'ready'` (timeout 60s)
3. Navigate to `/inbox` → verify item appears in grid
4. Navigate to `/chat` → type query about item content
5. Verify response includes item card
6. Click item card → verify correct URL opens

**Acceptance**: `npx playwright test tests/e2e/smoke.spec.ts` — all steps pass end to end.

### T05 — Final TypeScript + lint pass
**Files**: All  
**Action**: Run `npx tsc --noEmit` across all packages. Fix all type errors. Run `npx eslint .` and fix all errors (warnings allowed).  
**Acceptance**: Zero TypeScript errors. Zero ESLint errors.

---

## Cycle Exit Criteria

- [ ] `GET /manifest.webmanifest` returns valid PWA manifest
- [ ] Lighthouse PWA score ≥ 80 (run via `npx lighthouse http://localhost:3000 --only-categories=pwa`)
- [ ] Empty state visible on `/chat` for new user
- [ ] Empty state visible on `/inbox` for new user
- [ ] Error boundary catches render errors and shows fallback UI
- [ ] `npx playwright test tests/e2e/smoke.spec.ts` — full journey passes
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run tests/unit/` — all pass
- [ ] `npx playwright test tests/e2e/` — all pass
- [ ] No unhandled promise rejections in browser console during smoke test
