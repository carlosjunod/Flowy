# Flowy — Codebase Map

> **Purpose**: This is the **single navigation index** for the Flowy codebase. Use it to locate any feature, route, processor, or workflow without scanning the repo. It is the source of truth for *where things live*.
>
> **Update rule**: Every time a file is added, removed, renamed, or a workflow changes, update this map in the same commit. See [Maintenance](#maintenance) at the bottom.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [End-to-End Workflows](#2-end-to-end-workflows)
3. [Web App — `apps/web/`](#3-web-app--appsweb)
4. [Worker — `worker/`](#4-worker--worker)
5. [PocketBase — `pb/`](#5-pocketbase--pb)
6. [iOS / macOS — `apps/ios/`](#6-ios--macos--appsios)
7. [Tests — `tests/`](#7-tests--tests)
8. [Configuration & Tooling](#8-configuration--tooling)
9. [Documentation](#9-documentation)
10. [Auxiliary Directories](#10-auxiliary-directories)
11. [Maintenance](#maintenance)

---

## 1. High-Level Architecture

```
┌────────────────┐   share       ┌──────────────┐  enqueue  ┌────────────┐
│ iOS / macOS    │──────────────▶│ Next.js API  │──────────▶│ Redis      │
│ Share Extension│  HTTPS POST   │ /api/ingest  │  BullMQ   │ ingest q   │
└────────────────┘               └──────┬───────┘           └─────┬──────┘
                                        │                         │
┌────────────────┐   paste URL          │                         ▼
│ Web inbox UI   │──────────────────────┘                ┌─────────────────┐
└────────────────┘                                       │ Worker process  │
                                                         │ routes by type  │
                                                         │  → processor    │
                                                         │  → Claude       │
                                                         │  → embedding    │
                                                         │  → finalize     │
                                                         └────────┬────────┘
                                                                  │
                                                          ┌───────▼───────┐
                                                          │ PocketBase    │
                                                          │ items, embed, │
                                                          │ digests, etc. │
                                                          └───────┬───────┘
                                                                  │
                                            chat / search         │
                                       ┌──────────────────────────┘
                                       ▼
                              ┌────────────────┐
                              │ Next.js        │
                              │ /api/chat      │
                              │ vector search  │
                              │ + Claude RAG   │
                              └────────────────┘
```

**Top-level layout** (paths are relative to repo root):

| Area | Path | Tech |
|---|---|---|
| Web frontend + API | `apps/web/` | Next.js 15 (App Router), TS, Tailwind |
| iOS / macOS | `apps/ios/` | SwiftUI + Share Extensions |
| Background worker | `worker/` | Node + BullMQ |
| Database | `pb/` | PocketBase 0.22 + sqlite-vec |
| Unit + E2E tests | `tests/` | Vitest + Playwright |
| Docs | `docs/`, root `*.md` | Markdown |
| API collection | `postman/` | Postman JSON |

---

## 2. End-to-End Workflows

### 2.1 Ingestion (share → ready)

| Step | Where it happens | File |
|---|---|---|
| 1. User shares URL/image from iOS/macOS | iOS share extension | `apps/ios/ShareExtension/ShareViewController.swift`, `apps/ios/ShareExtensionMac/ShareViewControllerMac.swift` |
| 1b. User pastes URL in web inbox | Web UI | `apps/web/components/inbox/BulkAddBookmarksButton.tsx`, `apps/web/components/inbox/SubmitBookmarkButton.tsx` |
| 2. HTTP client sends `POST /api/ingest` | Swift / fetch | `apps/ios/Shared/IngestClient.swift` |
| 3. API authenticates, auto-routes social URLs, creates `items` row (`status=pending`), enqueues BullMQ `ingest` job | Next.js route | `apps/web/app/api/ingest/route.ts` |
| 4. BullMQ queue (Redis) | Queue client | `apps/web/lib/queue.ts` (producer), `worker/src/queues.ts` (definitions) |
| 5. Worker picks up job, dispatches by `type` | Worker entry | `worker/src/index.ts` |
| 6. Processor extracts content (scrape / OCR / transcript / yt-dlp) | `worker/src/processors/*.ts` | one file per type |
| 7. Claude Sonnet 4.5 returns `{title, summary, tags, category}` | AI lib | `worker/src/lib/claude.ts` → `extractStructuredData()` |
| 8. Embedding generated (1536-dim) and stored | AI lib | `worker/src/lib/claude.ts` → `generateEmbedding()`; `worker/src/lib/pocketbase.ts` → `createEmbedding()` |
| 9. Item finalized (`status=ready`), `save_event` recorded, profiler/elements updated | Finalize lib | `worker/src/lib/finalize.ts`, `worker/src/lib/profiler.ts`, `worker/src/lib/elements.ts` |

### 2.2 Chat / Semantic Search

| Step | File |
|---|---|
| User sends message from chat UI | `apps/web/components/chat/ChatWindow.tsx`, `ChatInput.tsx`, `ChatMessage.tsx` |
| `POST /api/chat` embeds the query, performs cosine search over user's `embeddings`, picks top-5, builds context, streams Claude response | `apps/web/app/api/chat/route.ts` |
| Embedding + RAG helpers | `apps/web/lib/claude.ts` |
| Inline item references in response | `apps/web/components/chat/ItemChip.tsx` |

### 2.3 Daily Digest

| Step | File |
|---|---|
| BullMQ cron schedule (every minute, matches users by `digest_time` UTC) | `worker/src/jobs/dailyDigest.ts` (`scheduleProcessor`) |
| Per-user digest generation | `worker/src/jobs/dailyDigest.ts` (`generateProcessor`) → `worker/src/lib/digest/generator.ts` |
| Group items by category | `worker/src/lib/digest/grouper.ts` |
| Prompt templates | `worker/src/lib/digest/prompt.ts` |
| Push notification | `worker/src/lib/digest/push.ts` |
| Digest types | `worker/src/lib/digest/types.ts`, `apps/web/lib/digest/types.ts` |
| Read digest list / detail | `apps/web/app/api/digest/route.ts`, `apps/web/app/api/digest/[id]/route.ts` |
| Settings (enabled / time) | `apps/web/app/api/digest/settings/route.ts`, `apps/web/app/(app)/settings/digest/page.tsx` |
| Detail page UI | `apps/web/app/(app)/digest/[id]/page.tsx` |

### 2.4 Advanced Exploration (selected items → canonical link)

User selects items in the inbox, hits **Explore** in `SelectionActionBar`, and Flowy re-evaluates each item with Claude + the `web_search` server tool to identify the specific product/repo/paper being discussed. For YouTube/video items, frames are sampled with yt-dlp+ffmpeg and passed to Claude Vision so the model can read on-screen URLs the audio transcript misses.

| Step | Where it happens | File |
|---|---|---|
| 1. User toggles selection mode + checks items | Inbox UI | `apps/web/components/inbox/FilterBar.tsx`, `ItemCard.tsx`, `SelectionProvider.tsx` |
| 2. User clicks **Explore** in the action bar | Inbox UI | `apps/web/components/inbox/SelectionActionBar.tsx` |
| 3. Hook calls `POST /api/items/bulk/explore` with selected ids | Web client | `apps/web/lib/items-actions.ts` (`exploreItems`), `apps/web/lib/hooks/useItemActions.ts` (`exploreMany`) |
| 4. API verifies ownership, marks `exploration.status='exploring'`, enqueues per-item job | Next.js route | `apps/web/app/api/items/bulk/explore/route.ts` |
| 5. BullMQ `advanced-exploration` queue (Redis) | Producer / definitions | `apps/web/lib/queue.ts` (`getExploreQueue`), `worker/src/queues.ts` (`exploreQueue`, `createExploreWorker`) |
| 6. Worker samples 4 video frames (yt-dlp → ffmpeg) for video-type items | Frame sampler | `worker/src/lib/videoFrames.ts` (`sampleVideoFrames`) |
| 7. Builds context + frames, calls Claude with `web_search` server tool, parses JSON result | AI lib | `worker/src/lib/claude.ts` (`identifyContent`) |
| 8. Persists primary link / candidates / video_insights to `items.exploration` | Processor | `worker/src/processors/explore.processor.ts`; `worker/src/lib/pocketbase.ts` (`updateItem`) |
| 9. UI picks up via PocketBase realtime — chip on card, full panel in drawer | Inbox UI | `apps/web/components/inbox/ItemCard.tsx` (`ExplorationChip`), `apps/web/components/inbox/ItemDrawer.tsx` (`ExplorationSection`) |

### 2.5 Authentication

| Flow | Files |
|---|---|
| Email + password registration | `apps/web/app/api/auth/register/route.ts`; UI `apps/web/app/(auth)/signup/page.tsx`, `apps/web/app/(auth)/login/page.tsx` |
| Apple Sign-In (web callback + helpers) | `apps/web/app/api/auth/apple/route.ts`, `apps/web/lib/apple-auth.ts` |
| Google Sign-In | `apps/web/app/api/auth/google/route.ts`, `apps/web/lib/google-auth.ts` |
| Auth verification on every API route | `apps/web/lib/auth.ts` (`authenticate()`) |
| iOS native sign-in UI | `apps/ios/Tryflowy/SignInView.swift` |
| iOS auth HTTP client | `apps/ios/Shared/AuthClient.swift` |
| Shared keychain (token sharing app ↔ extensions) | `apps/ios/Shared/KeychainStore.swift` (access group `group.tryflowy`) |
| Universal Links / AASA | `apps/web/app/.well-known/apple-app-site-association/route.ts` |

---

## 3. Web App — `apps/web/`

### 3.1 Next.js routes (App Router)

**Auth group** — `apps/web/app/(auth)/`
- `layout.tsx` — auth wrapper
- `login/page.tsx`
- `signup/page.tsx`

**App group** — `apps/web/app/(app)/`
- `layout.tsx` — header nav, mounts `ItemDrawerProvider`
- `chat/page.tsx` — chat interface
- `inbox/page.tsx` + `inbox/layout.tsx` + `inbox/error.tsx` — grid / list view
- `digest/[id]/page.tsx` — single digest detail
- `settings/digest/page.tsx` — digest preferences

**Root**
- `app/page.tsx` — landing / redirect
- `app/layout.tsx` — root layout, theme provider
- `app/global-error.tsx` — global error boundary
- `app/globals.css` — Tailwind base
- `app/manifest.ts` — PWA manifest
- `app/.well-known/apple-app-site-association/route.ts` — AASA JSON

### 3.2 API endpoints

| Method | Path | File |
|---|---|---|
| POST | `/api/ingest` | `apps/web/app/api/ingest/route.ts` |
| POST | `/api/chat` | `apps/web/app/api/chat/route.ts` |
| POST | `/api/auth/apple` | `apps/web/app/api/auth/apple/route.ts` |
| POST | `/api/auth/google` | `apps/web/app/api/auth/google/route.ts` |
| POST | `/api/auth/register` | `apps/web/app/api/auth/register/route.ts` |
| GET / PATCH / DELETE | `/api/items/[id]` | `apps/web/app/api/items/[id]/route.ts` |
| POST | `/api/items/[id]/retry` | `apps/web/app/api/items/[id]/retry/route.ts` |
| POST | `/api/items/bulk/delete` | `apps/web/app/api/items/bulk/delete/route.ts` |
| POST | `/api/items/bulk/reload` | `apps/web/app/api/items/bulk/reload/route.ts` |
| POST | `/api/items/bulk/explore` | `apps/web/app/api/items/bulk/explore/route.ts` |
| GET | `/api/digest` | `apps/web/app/api/digest/route.ts` |
| GET | `/api/digest/[id]` | `apps/web/app/api/digest/[id]/route.ts` |
| GET / PATCH | `/api/digest/settings` | `apps/web/app/api/digest/settings/route.ts` |
| GET / POST | `/api/profile/interests` | `apps/web/app/api/profile/interests/route.ts` |

### 3.3 React components — `apps/web/components/`

**Chat** (`components/chat/`)
- `ChatWindow.tsx` — chat container
- `ChatInput.tsx` — message input + send
- `ChatMessage.tsx` — single user/assistant message
- `ItemChip.tsx` — inline item reference

**Inbox** (`components/inbox/`)
- `InboxGrid.tsx` — grid layout
- `ItemCard.tsx` — grid card
- `ItemRow.tsx` — list row
- `ItemDrawer.tsx` + `ItemDrawerProvider.tsx` — detail drawer + context
- `ItemDetailRow.tsx` — metadata row inside drawer
- `ItemActionsMenu.tsx` — dropdown (delete, retry, share, …)
- `FilterBar.tsx` — type / status / category filter
- `SelectionProvider.tsx` + `SelectionActionBar.tsx` — multi-select state + bulk action bar
- `BulkAddBookmarksButton.tsx` — paste URLs to ingest in bulk
- `SubmitBookmarkButton.tsx` — single-URL ingest

**UI primitives** (`components/ui/`)
- `Brand.tsx`, `Button.tsx`, `Spinner.tsx`, `NavLink.tsx`, `LogoutButton.tsx`
- `ThemeProvider.tsx`, `ThemeToggle.tsx` — dark mode
- `icons.tsx` — SVG icon exports

### 3.4 Library — `apps/web/lib/`

| File | Exports / purpose |
|---|---|
| `auth.ts` | `authenticate(req)` — verifies `pb_auth` cookie/Bearer token |
| `apple-auth.ts` | Apple Sign-In identity-token verification |
| `google-auth.ts` | Google OAuth JWT verification |
| `pocketbase.ts` | `getPb()`, `getCurrentUser()`, `logout()`, `updateItem()`, `deleteItem()` — **all DB access funnels through here** |
| `claude.ts` | Claude API client + embedding/cosine helpers — **all AI calls funnel through here** |
| `queue.ts` | BullMQ producer; `getQueue()` enqueues `ingest`, `getExploreQueue()` enqueues `advanced-exploration` |
| `items-actions.ts` | Item action helpers (`reloadItems`, `deleteItems`, `exploreItems`, …) |
| `items-delete.ts` | Delete helpers shared by single + bulk |
| `share.ts` | Web Share API with clipboard fallback |
| `hooks/useItemActions.ts` | React hook for item CRUD (`reloadMany`, `deleteMany`, `exploreMany`) |
| `digest/types.ts` | Digest TypeScript types (frontend) |

### 3.5 Types

- `apps/web/types/index.ts` — `Item`, `ItemType`, `ItemStatus`, `Embedding`, `ChatMessageType`, `MediaSlide`, `ApiResponse`, `ItemExploration` (+ `ExplorationStatus`, `ExplorationLink`, `ExplorationCandidate`, `ExplorationVideoInsights`)

### 3.6 Web app config

- `apps/web/package.json`
- `apps/web/.env.example` (additional to root `.env.example`)

---

## 4. Worker — `worker/`

### 4.1 Entry & queues

- `worker/src/index.ts` — main process; probes `yt-dlp`, starts BullMQ worker on `ingest` queue (concurrency 3), starts `advanced-exploration` worker (concurrency 2), wires digest schedule + generate workers, dispatches by `type`
- `worker/src/queues.ts` — queue names (`INGEST_QUEUE`, `EXPLORE_QUEUE`), `IngestJobData`/`ExploreJobData` types, Redis connection
- `worker/src/env.ts` — env loader
- `worker/src/types/modules.d.ts` — module augmentations

### 4.2 Processors — `worker/src/processors/`

One file per item type. Each: extract → classify (Claude) → embed → finalize.

| File | Item type | Notes |
|---|---|---|
| `url.processor.ts` | `url` | `@extractus/article-extractor` |
| `youtube.processor.ts` | `youtube` | Transcript via `youtube-transcript`, oembed fallback |
| `image.processor.ts` | `image` | Claude Vision OCR/description |
| `screenshots.processor.ts` | `screenshot` | Multi-image OCR concat |
| `video.ts` | `video` | Frames / metadata |
| `screen_recording.processor.ts` | `screen_recording` | Optional transcription |
| `instagram.processor.ts` | `instagram` | yt-dlp metadata + carousel media |
| `reddit.processor.ts` | `reddit` | Reddit API |
| `pinterest.processor.ts` | `pinterest` | Pin scraping |
| `dribbble.processor.ts` | `dribbble` | Shot metadata |
| `linkedin.processor.ts` | `linkedin` | Post scraping |
| `twitter.processor.ts` | `twitter` | Tweet scraping |
| `explore.processor.ts` | _re-evaluation, any type_ | Reads existing item → optionally samples video frames → calls `identifyContent()` (Claude + `web_search`) → writes result to `items.exploration` |

### 4.3 Worker library — `worker/src/lib/`

| File | Purpose |
|---|---|
| `claude.ts` | Claude Sonnet 4.5 client; `extractStructuredData()`, `analyzeImage()`, `analyzeImages()`, `identifyContent()` (advanced exploration with `web_search` server tool), `generateEmbedding()`, `ClaudeError` |
| `pocketbase.ts` | Admin client; `getItem`, `updateItem`, `createEmbedding`, `createSaveEvent`; exports `ItemExploration` types |
| `videoFrames.ts` | `sampleVideoFrames()` — yt-dlp downloads low-quality video, ffprobe gets duration, ffmpeg extracts N evenly-spaced JPEG frames; used by advanced exploration on YouTube/video items |
| `finalize.ts` | `finalizeItem(itemId, patch)` — sets `status=ready`, records save event, triggers profiler + elements |
| `profiler.ts` | `recordUserInterests(item)` — updates `user_interests` |
| `elements.ts` | Visual element fingerprint dedup (`global_elements`) |
| `storage.ts` | Cloudflare R2 upload/download |
| `social.ts` | Social URL detection + metadata extraction |
| `socialUrls.ts` | URL pattern matchers |
| `reddit.ts` | Reddit API helpers |
| `youtubeId.ts` | Parse YouTube ID from various URL forms |
| `youtubeTranscriptLoader.ts` | `youtube-transcript` wrapper |
| `ytdlp.ts` | yt-dlp cookie-arg helpers |
| `binaries.ts` | Resolves absolute paths for `yt-dlp` / `ffmpeg` / `ffprobe` (env override → vendored binary → PATH fallback) |
| `transcription.ts` | Speech-to-text helpers |

### 4.4 Digest — `worker/src/lib/digest/`

- `generator.ts` — `generateDigestForUser(userId)`
- `grouper.ts` — group items by category
- `prompt.ts` — Claude prompt templates
- `push.ts` — push notification dispatch
- `types.ts` — digest types

### 4.5 Jobs — `worker/src/jobs/`

- `dailyDigest.ts` — `scheduleProcessor` (per-minute cron, matches `digest_time` UTC) + `generateProcessor`

### 4.6 Worker config

- `worker/package.json`, `worker/tsconfig.json`, `worker/railway.json`

---

## 5. PocketBase — `pb/`

### 5.1 Migrations — `pb/pb_migrations/`

| File | Adds |
|---|---|
| `1900000001_initial_schema.js` | `items` collection (core fields, status, type) |
| `1900000002_embeddings.js` | `embeddings` collection (vector, item FK) |
| `1900000003_add_video_type.js` | `video` to item type enum |
| `1900000004_add_apple_sub.js` | `apple_sub` on users |
| `1900000005_add_og_fields.js` | `og_image`, `og_description`, `site_name` on items |
| `1900000006_user_interests.js` | `user_interests` collection |
| `1900000007_global_elements.js` | `global_elements` (dedup) |
| `1900000008_items_element_fk.js` | items → element FK |
| `1900000009_save_events.js` | `save_events` collection (analytics) |
| `1900000010_instagram_carousel.js` | `media` JSON field for carousel |
| `1900000011_add_google_sub.js` | `google_sub` on users |
| `1900000012_screen_recording.js` | `screen_recording` type |
| `1900000013_add_reddit_type.js` | `reddit` type |
| `1900000014_daily_digest.js` | `digests` collection + `digest_enabled` / `digest_time` on users |
| `1900000015_add_social_types.js` | `pinterest`, `dribbble`, `linkedin`, `twitter` types |
| `1900000016_add_exploration_field.js` | `exploration` JSON field on items (advanced exploration result) |

### 5.2 Collections (current state)

- **users** — built-in auth + `apple_sub`, `google_sub`, `digest_enabled`, `digest_time`
- **items** — `user`, `type`, `raw_url`, `source_url`, `r2_key`, `title`, `summary`, `content`, `tags`, `category`, `status`, `error_msg`, `og_image`, `og_description`, `site_name`, `media`, `element`, `exploration`
- **embeddings** — `item` (unique), `vector` (1536-dim JSON, indexed by sqlite-vec)
- **user_interests** — per-user category/tag aggregation
- **global_elements** — `element_hash`, `kind`
- **save_events** — `item` (unique), `user`, `counted_at`
- **digests** — `user`, `generated_at`, category groupings

### 5.3 Other PB files

- `pb/Dockerfile` — server image
- `pb/pb_data/` — runtime data (gitignored)
- ⚠️ Never edit `pb_schema.json` directly. Always create a migration.

---

## 6. iOS / macOS — `apps/ios/`

| Target | Files |
|---|---|
| Main iOS app | `apps/ios/Tryflowy/TryflowyApp.swift`, `apps/ios/Tryflowy/SignInView.swift`, `apps/ios/Tryflowy/Info.plist` |
| iOS share extension | `apps/ios/ShareExtension/ShareViewController.swift`, `apps/ios/ShareExtension/Info.plist` |
| macOS share extension | `apps/ios/ShareExtensionMac/ShareViewControllerMac.swift`, `apps/ios/ShareExtensionMac/Info.plist` |
| Shared framework | `apps/ios/Shared/AuthClient.swift`, `apps/ios/Shared/IngestClient.swift`, `apps/ios/Shared/KeychainStore.swift` |
| Project root | `apps/ios/README.md` |

Bundle id: `app.tryflowy.app`. Keychain access group: `group.tryflowy`.

---

## 7. Tests — `tests/`

### 7.1 Unit tests — `tests/unit/`

**Routes**: `ingest.test.ts`, `ingest-instagram-routing.test.ts`, `ingest-social-routing.test.ts`, `chat.test.ts`, `items.route.test.ts`, `bulk-delete-route.test.ts`, `bulk-reload-route.test.ts`, `bulk-explore-route.test.ts`, `retry-route.test.ts`, `apple-app-site-association.test.ts`

**Auth**: `apple-auth.test.ts`, `google-auth.test.ts`

**Worker / lib**: `worker.test.ts`, `finalize.test.ts`, `elements.test.ts`, `profiler.test.ts`, `social.test.ts`, `socialUrls.test.ts`, `share.test.ts`, `items-delete-helper.test.ts`

**Processors**: `url.processor.test.ts`, `youtube.processor.test.ts`, `image.processor.test.ts`, `video.processor.test.ts`, `instagram.processor.test.ts`, `reddit.processor.test.ts`, `pinterest.processor.test.ts`, `explore.processor.test.ts`

**Components**: `item-actions-menu.test.tsx`, `selection-provider.test.tsx`, `use-item-actions.test.tsx`

### 7.2 E2E — `tests/e2e/`

`auth.spec.ts`, `smoke.spec.ts`, `inbox.spec.ts`, `chat.spec.ts`, `bulk-delete.spec.ts`

### 7.3 Manual + setup

- `tests/manual/ios-share.md` — manual iOS share extension test plan
- `tests/setup.ts` — Vitest setup

---

## 8. Configuration & Tooling

| File | Purpose |
|---|---|
| `package.json` | Workspaces (`apps/web`, `worker`); scripts: `dev`, `dev:web`, `dev:worker`, `build`, `test`, `test:e2e`, `lint` |
| `tsconfig.json`, `tsconfig.base.json` | TypeScript config |
| `vitest.config.ts` | Unit test runner |
| `playwright.config.ts` | E2E runner |
| `.env.example` | Env var template |
| `.playwright-baseline/` | Visual regression baselines |
| `.playwright-mock/` | Mock screenshots |
| `.playwright-mcp/` | MCP-driven Playwright artifacts |
| `.playwright-scripts/` | Playwright utility scripts |
| `.vscode/` | Editor config |
| `.claude/` | Claude Code project config |

---

## 9. Documentation

### 9.1 Root markdown

| File | Purpose |
|---|---|
| `CLAUDE.md` | Project overview, tech stack, conventions, agent rules; **points to this map** |
| `CODEBASE_MAP.md` | This file — navigation index |
| `ROADMAP.md` | Feature roadmap |
| `DECISIONS.md` | Architecture decisions log |
| `TESTING.md` | Testing guide |
| `BLOCKERS.md` | Active blockers |
| `ADDING_SOURCES.md` | How to add a new processor / item type |
| `REDDIT_SETUP.md` | Reddit API setup |
| `CYCLE-01.md` … `CYCLE-11.md` | Per-cycle work logs |

### 9.2 `docs/`

- `docs/cycle-11-handoff.md` — handoff from cycle 11
- `docs/deployment_gotchas.md` — deployment workarounds
- `docs/superpowers/specs/` — feature specs (e.g. `2026-04-20-inbox-hover-actions-og.md`, `2026-04-24-unified-item-crud-design.md`)
- `docs/superpowers/plans/` — implementation plans (e.g. `2026-04-24-unified-item-crud.md`)

---

## 10. Auxiliary Directories

| Path | Contents |
|---|---|
| `postman/` | API collection (`Tryflowy.postman_collection.json`) + local environment + `README.md` |
| `brand/` | Brand assets (logos, colors) |
| `darkmode-review/` | Dark-mode design review materials |

---

## Maintenance

This map is the **navigation index** for Claude (and humans). Outdated entries cause wasted scanning, so it must stay in sync with the code.

### When to update this file

Update `CODEBASE_MAP.md` **in the same commit** whenever you:

- Add, remove, or rename a **route** (page, layout, API endpoint).
- Add, remove, or rename a **React component** that ships in `apps/web/components/`.
- Add, remove, or rename a **lib file** in `apps/web/lib/` or `worker/src/lib/`.
- Add a new **processor** (touches §2.1, §4.2, and §7.1).
- Add a **PocketBase migration** (touches §5.1 and §5.2).
- Add or rename an **iOS / macOS** target or shared file.
- Change any **end-to-end workflow** (ingestion, chat/RAG, digest, auth) — update §2 plus the relevant section.
- Add, remove, or rename a **doc** at the repo root or under `docs/`.

### How to update it

1. Edit the relevant section(s); keep entries to one line and use the exact relative path.
2. Cross-check the workflow tables in §2 — most changes touch at least one.
3. If the change introduces a brand-new concept (queue, service, integration), add a new section rather than burying it in an existing one.
4. Commit with a message that mentions the map, e.g. `[CYCLE-XX] add foo processor; update CODEBASE_MAP`.

### Obsidian Vault sync

This map should also be mirrored in the project's Obsidian vault (`Flowy/CODEBASE_MAP.md` inside the vault) so it shows up in the personal knowledge graph. After updating the in-repo file, copy it across or use the vault's sync workflow. The in-repo copy is the source of truth — never edit the vault copy alone.

### Quick lookup recipes

- **"Where does the digest run?"** → §2.3.
- **"Where is the ingest endpoint?"** → §3.2 → `apps/web/app/api/ingest/route.ts`.
- **"Where does AI classification happen?"** → §2.1 step 7 → `worker/src/lib/claude.ts`.
- **"Where is the chat UI?"** → §3.3 Chat group.
- **"Where does advanced exploration run?"** → §2.4 → `worker/src/processors/explore.processor.ts` + `worker/src/lib/claude.ts` (`identifyContent`).
- **"How do video frames get extracted for Vision?"** → §2.4 step 6 → `worker/src/lib/videoFrames.ts`.
- **"Add a new social source"** → §4.2 (new processor), §3.2 (`/api/ingest` routing), §5.1 (migration to add type), §7.1 (test), then update this map.
