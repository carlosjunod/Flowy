# CYCLE-05 — Auth + Web Shell

**Dependencies**: Cycle 01  
**Complexity**: Medium

---

## Goal
Next.js 15 app with PocketBase auth, protected routes, and empty page shells for chat and inbox.

---

## Tasks

### T01 — Initialize Next.js app
**File**: `apps/web/package.json`, `apps/web/app/layout.tsx`  
**Action**: Create Next.js 15 app with TypeScript, Tailwind CSS, App Router. Configure `@/` alias in `tsconfig.json`.  
**Acceptance**: `npm run dev` starts on port 4000. `/` renders without error.

### T02 — Create PocketBase client (web)
**File**: `apps/web/lib/pocketbase.ts`  
**Action**: Export singleton PocketBase client using `NEXT_PUBLIC_PB_URL`. Export `getCurrentUser()` helper that returns typed user or `null`. Export `logout()` helper.  
**Acceptance**: Client importable. `getCurrentUser()` returns `null` when not authenticated.

### T03 — Create login page
**File**: `apps/web/app/(auth)/login/page.tsx`  
**Action**: Render form with email + password fields and submit button. On submit: call `pb.collection('users').authWithPassword(email, password)`. On success: redirect to `/chat`. On failure: show error message `"Invalid email or password"`.  
**Acceptance**: E2E test in T06 passes.

### T04 — Create route protection middleware
**File**: `apps/web/middleware.ts`  
**Action**: Next.js middleware that checks PocketBase auth cookie on all routes except `/(auth)/*` and `/api/*`. If not authenticated: redirect to `/login`.  
**Acceptance**: Unauthenticated GET `/chat` → 307 redirect to `/login`.

### T05 — Create empty page shells
**Files**: `apps/web/app/(app)/chat/page.tsx`, `apps/web/app/(app)/inbox/page.tsx`  
**Action**: Both pages render a `<h1>` with page name and a `<p>Coming soon</p>`. Both wrapped in `(app)/layout.tsx` that shows a nav with "Chat" and "Inbox" links + logout button.  
**Acceptance**: Authenticated user can navigate between `/chat` and `/inbox`. Logout redirects to `/login`.

### T06 — E2E auth tests
**File**: `tests/e2e/auth.spec.ts`  
**Action**: Playwright tests:
- Valid credentials → lands on `/chat`
- Invalid credentials → stays on `/login`, shows error message
- Unauthenticated access to `/chat` → redirected to `/login`
- Logout from `/chat` → redirected to `/login`

**Acceptance**: `npx playwright test tests/e2e/auth.spec.ts` — all cases pass.

---

## Cycle Exit Criteria

- [ ] Login with valid credentials → `/chat` loads
- [ ] Login with invalid credentials → error shown, stays on `/login`
- [ ] Direct access to `/chat` without auth → redirect to `/login`
- [ ] Logout → redirect to `/login`
- [ ] `npx playwright test tests/e2e/auth.spec.ts` — all pass
- [ ] No TypeScript errors

---

