# Flowy — ROADMAP.md

## Product Vision
Universal AI inbox. Share anything → AI processes it → chat to find it.

---

## Cycles Overview

| # | Name | Goal | Status |
|---|------|------|--------|
| 01 | Backend Foundation | PocketBase schema + ingest API + worker skeleton | TODO |
| 02 | AI Pipeline — URLs | Process URLs: scrape, summarize, embed, classify | TODO |
| 03 | AI Pipeline — Images | Process screenshots: OCR + Vision, extract context | TODO |
| 04 | AI Pipeline — YouTube | Process YouTube URLs: transcript + summary + embed | TODO |
| 05 | Auth + Web Shell | Next.js app, PocketBase auth, route protection | TODO |
| 06 | Chat Interface | Natural language search via embeddings + Claude | TODO |
| 07 | Inbox Grid | Item grid, AI-generated filters, item status | TODO |
| 08 | iOS Share Extension | Swift thin client, posts to ingest API | TODO |
| 09 | Polish + Smoke Test | PWA, error states, full E2E smoke test | TODO |
| 10 | Video Pipeline | TikTok + Instagram Reels: download audio, transcribe, discard video | TODO |
| 11 | Native iOS/macOS App: TestFlight-First | Xcode project, Sign in with Apple, Universal Links, privacy manifest, TestFlight build | TODO |

---

## Cycle Details

---

### Cycle 01 — Backend Foundation

**Goal**: Working PocketBase instance with schema, a `/api/ingest` endpoint that accepts all content types, and a BullMQ worker that receives jobs and logs them.

**Delivers**:
- PocketBase schema: `items`, `users` collections
- `POST /api/ingest` endpoint — validates payload, creates pending item, enqueues job
- BullMQ worker boots, receives job, logs payload, marks item `processing`
- `.env.example` with all required keys

**Definition of Done**:
- `POST /api/ingest` with `{ type: 'url', raw_url: 'https://example.com' }` returns `{ data: { id: string, status: 'pending' } }`
- Worker logs received job within 2 seconds of POST
- All unit tests in `tests/unit/ingest.test.ts` pass
- PocketBase admin UI shows created item with status `pending`

---

### Cycle 02 — AI Pipeline: URLs

**Goal**: Worker fully processes URL items — scrapes content, generates summary + tags + category via Claude, stores embeddings.

**Delivers**:
- `url.processor.ts` — scrape with article-extractor, summarize with Claude
- Embedding generation and storage in sqlite-vec
- Item updated to `status: 'ready'` with all AI fields populated
- Unit tests for processor logic

**Definition of Done**:
- POST a URL → within 30s item has `title`, `summary`, `tags[]`, `category`, `embedding`, `status: 'ready'`
- `tests/unit/url.processor.test.ts` — all cases pass
- Scrape failure sets `status: 'error'` with `error_message`

---

### Cycle 03 — AI Pipeline: Images

**Goal**: Worker processes screenshot/image items using Claude Vision — extracts text, context, theme, and classifies.

**Delivers**:
- `image.processor.ts` — upload to R2, send to Claude Vision, extract structured data
- Embedding from extracted text
- R2 integration for file storage

**Definition of Done**:
- POST `{ type: 'screenshot', raw_image: base64 }` → item has `title`, `summary`, `tags[]`, `category`, `r2_key`, `status: 'ready'`
- `tests/unit/image.processor.test.ts` — all cases pass
- R2 bucket contains the uploaded file

---

### Cycle 04 — AI Pipeline: YouTube

**Goal**: Worker processes YouTube URLs — fetches transcript, generates structured summary with key points.

**Delivers**:
- `youtube.processor.ts` — extract video ID, fetch transcript, summarize with Claude
- Embedding from transcript summary
- Graceful fallback if transcript unavailable (use title + description)

**Definition of Done**:
- POST YouTube URL → item has `title`, `summary`, `tags[]`, `category`, `embedding`, `status: 'ready'`
- `tests/unit/youtube.processor.test.ts` — all cases pass
- Items with no transcript get `status: 'ready'` with fallback summary, not `error`

---

### Cycle 05 — Auth + Web Shell

**Goal**: Next.js 15 app with PocketBase auth, protected routes, and empty page shells.

**Delivers**:
- Login page with email/password via PocketBase auth
- Route protection — unauthenticated users redirect to `/login`
- Empty shells: `/chat`, `/inbox`
- PocketBase client singleton in `lib/pocketbase.ts`

**Definition of Done**:
- User can log in with valid credentials and land on `/chat`
- Unauthenticated access to `/chat` or `/inbox` redirects to `/login`
- `tests/e2e/auth.spec.ts` — login flow passes in Playwright

---

### Cycle 06 — Chat Interface

**Goal**: Functional chat window — user types natural language query, receives answer with item references and links to originals.

**Delivers**:
- `ChatWindow.tsx`, `ChatMessage.tsx`, `ChatInput.tsx`
- `POST /api/chat` — embeds query, searches sqlite-vec, passes results to Claude, streams response
- Each Claude response includes item references with thumbnail + title + source URL
- Click reference → opens original URL in new tab

**Definition of Done**:
- User types "show me the design posts I saved" → receives response with ≥1 relevant item card
- Item card shows: title, thumbnail (or type icon), source domain, link to original
- `tests/e2e/chat.spec.ts` — query → response → click original passes in Playwright
- Streaming works — response appears word by word

---

### Cycle 07 — Inbox Grid

**Goal**: Visual grid of all saved items with AI-generated filter categories and sort options.

**Delivers**:
- `InboxGrid.tsx` — masonry/grid layout, paginated
- `ItemCard.tsx` — thumbnail, title, category badge, status indicator, date
- `FilterBar.tsx` — dynamic category filters derived from item data
- Sort by: date (newest), category, type
- Item status: pending/processing shown with spinner, error shown with icon

**Definition of Done**:
- `/inbox` shows all `status: 'ready'` items in grid
- Clicking a category filter shows only items with that category
- Pending items show spinner; clicking them does nothing
- `tests/e2e/inbox.spec.ts` — filter interaction passes in Playwright

---

### Cycle 08 — iOS Share Extension

**Goal**: Thin Swift share extension that captures URL/image/text from iOS share sheet and POSTs to `/api/ingest`.

**Delivers**:
- `ShareViewController.swift` — handles URL, image, and plain text share types
- Auth token stored in iOS Keychain
- Success/failure feedback UI ("Saved to Flowy ✓" / "Failed — tap to retry")
- macOS share extension target (same codebase)

**Definition of Done**:
- Share a URL from Safari → item appears in PocketBase within 5s with `status: 'pending'`
- Share a screenshot from Photos → image item appears with `status: 'pending'`
- Invalid/expired token shows "Please log in" message in extension UI
- Tested manually on iOS simulator

---

### Cycle 09 — Polish + Smoke Test

**Goal**: PWA manifest, empty states, error boundaries, and full end-to-end smoke test covering the complete user journey.

**Delivers**:
- PWA manifest + service worker (offline shell)
- Empty states for inbox and chat (first-time user experience)
- Error boundaries on all async components
- Full smoke test: share URL → worker processes → appears in inbox → found via chat

**Definition of Done**:
- `tests/e2e/smoke.spec.ts` passes: POST to ingest → poll until ready → query chat → item returned
- Lighthouse PWA score ≥ 80
- No unhandled promise rejections in browser console during smoke test
- App installs as PWA on iOS Safari

---

### Cycle 11 — Native iOS/macOS App: TestFlight-First

**Goal**: Finish the Xcode project from Cycle 08, add Sign in with Apple so users never paste tokens, wire Universal Links so shared `/item/xyz` links open the app, and ship a TestFlight build available to external testers via email.

**Delivers**:
- `apps/ios/Tryflowy.xcodeproj/` with three targets (main app, iOS share extension, macOS share extension) fully configured with App Groups, Keychain Sharing, Associated Domains
- Sign in with Apple flow in `SignInView.swift` + server-side identity token validation at `/api/auth/apple` + `apple_sub` on PocketBase users
- Universal Links via `/.well-known/apple-app-site-association` Next.js route handler
- Privacy manifests (`PrivacyInfo.xcprivacy`) for all three targets
- First TestFlight build uploaded, internally testable via TestFlight app
- Beta App Review submitted for external tester distribution
- `DECISIONS.md` updated with SIWA approach rationale

**Definition of Done**:
- `xcodebuild` succeeds for all three schemes with automatic signing
- SIWA button on fresh install → app authenticated without manual token paste
- Share extension POSTs to `/api/ingest` using the SIWA-acquired token from shared Keychain
- `https://tryflowy.app/item/xxx` from Messages opens the native app, not Safari
- `tests/unit/apple-auth.test.ts` all pass (JWKS validation, tampered/expired/wrong-audience rejection)
- TestFlight build visible in App Store Connect, installable via TestFlight app on a physical device
- Out of scope: App Intents, push notifications, widgets, full App Store submission — tracked for Cycle 12

See `CYCLE-11.md` for task breakdown.
