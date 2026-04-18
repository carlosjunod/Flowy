# tryflowy

Universal AI inbox. Share anything → AI processes → chat to find it.  
Stack: Next.js 15 · PocketBase 0.22 · BullMQ · Claude API · Cloudflare R2 · Swift share extension.

---

## Stack

```
apps/web        Next.js 15 App Router, TypeScript 5, Tailwind 3
worker/         Node 20, BullMQ 5, Redis 7
pb/             PocketBase 0.22 (SQLite, sqlite-vec for embeddings)
apps/ios/       Swift 5.9 share extension (iOS + macOS targets)
```

Key packages: `@anthropic-ai/sdk ^0.30` · `@extractus/article-extractor ^7` · `youtube-transcript ^1` · `@aws-sdk/client-s3 ^3` (R2)

---

## Folder Structure

```
tryflowy/
├── apps/web/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx          # nav + auth guard
│   │   │   ├── chat/page.tsx
│   │   │   └── inbox/page.tsx
│   │   └── api/
│   │       ├── ingest/route.ts
│   │       └── chat/route.ts
│   ├── components/
│   │   ├── chat/                   # ChatWindow, ChatMessage, ChatInput
│   │   ├── inbox/                  # InboxGrid, ItemCard, FilterBar
│   │   └── ui/                     # Button, Spinner, EmptyState
│   ├── lib/
│   │   ├── pb.ts                   # singleton PocketBase client
│   │   ├── claude.ts               # singleton Anthropic client + helpers
│   │   └── r2.ts                   # R2 upload helper
│   └── types/index.ts
├── worker/src/
│   ├── index.ts                    # BullMQ worker entry
│   ├── queue.ts                    # queue + job types
│   └── processors/
│       ├── url.ts
│       ├── image.ts
│       └── youtube.ts
├── pb/
│   └── migrations/
├── tests/
│   ├── unit/
│   └── e2e/
└── .env.example
```

---

## Env

```env
PB_URL=http://localhost:8090
PB_ADMIN_EMAIL=admin@tryflowy.app
PB_ADMIN_PASSWORD=changeme_local
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://localhost:6379
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=tryflowy-files
R2_PUBLIC_URL=https://files.tryflowy.app
NEXT_PUBLIC_PB_URL=http://localhost:8090
```

---

## Commands

```bash
npm install                          # install all workspaces
npm run dev                          # web + worker + pb concurrently
npm test                             # vitest unit tests
npm run test:e2e                     # playwright (app must be running)
npx tsc --noEmit                     # type check all
```

---

## Data Model

```ts
// items collection (PocketBase)
type Item = {
  id: string
  user: string                       // relation → users
  type: 'url' | 'screenshot' | 'youtube' | 'receipt'
  raw_url?: string
  r2_key?: string                    // images only
  title?: string
  summary?: string                   // max 200 chars
  content?: string                   // full extracted text
  tags: string[]                     // max 5, AI-generated
  category?: string                  // single word, AI-generated
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_msg?: string
  source_url?: string
  created: string
}

// embeddings collection
type Embedding = {
  id: string
  item: string                       // relation → items (unique)
  vector: number[]                   // 1536 dims (text-embedding-3-small)
}
```

---

## Conventions

**Code**
- Functional components only. No classes.
- No `any`. Define all types in `types/index.ts`.
- All DB access through `lib/pb.ts`. All AI calls through `lib/claude.ts`.
- API routes return `{ data } | { error: string }`. Never throw unhandled.
- Error strings are SCREAMING_SNAKE_CASE: `'ITEM_NOT_FOUND'`, `'SCRAPE_FAILED'`.
- Absolute imports (`@/`) in web. Relative in worker.

**DRY rules**
- One Claude client instance. One PocketBase client instance. One R2 client instance.
- `extractStructured()` and `generateEmbedding()` are the only functions that call Claude API.
- Never duplicate item update logic — use a single `updateItem(id, patch)` wrapper.

**Tests**
- Unit: mock PocketBase, Claude SDK, S3. No real I/O.
- Each processor has one test file covering: happy path + each failure mode.
- E2E: Playwright, Chromium only, seed data via PocketBase admin API.

---

## Agents

Use specialist agents instead of solving everything in main context. Invoke with `claude agent:name` or via `/agent`.

**Daily drivers for this project:**

| Agent | When to use |
|-------|-------------|
| `Explore` | Search across codebase without burning main context |
| `Plan` | Design implementation approach before coding |
| `feature-dev:code-architect` | New feature design against existing conventions |
| `feature-dev:code-reviewer` | PR review with confidence filtering |
| `code-simplifier:code-simplifier` | Refactor processors/routes without behavior changes |
| `backend-development:backend-architect` | API route design, service boundaries |
| `backend-development:tdd-orchestrator` | TDD enforcement on processors |
| `llm-application-dev:ai-engineer` | RAG, embeddings, sqlite-vec queries |
| `llm-application-dev:prompt-engineer` | Classification/extraction prompts |
| `agents-design-experience:ui-ux-designer` | Chat + inbox UX, item cards |
| `gsd-code-reviewer` + `gsd-code-fixer` | Review → auto-fix loop after each cycle |
| `gsd-debugger` | Scientific-method debugging when a processor misbehaves |
| `gsd-nyquist-auditor` | Fill test gaps before cycle exit |
| `general-purpose` | Swift share extension, Capacitor, anything off the specialist map |

**Skip** (not applicable): podcast pipeline, OCR chain, GraphQL, game dev, Temporal, Docusaurus, legacy modernizer.

---

## Skills

Read the relevant skill before starting each cycle. Skills live in `~/.claude/skills/`.

| Skill | Cycles | Purpose |
|-------|--------|---------|
| `antfu/skills@vitest` | all | Vitest mocking, runner, coverage |
| `wshobson/agents@nextjs-app-router-patterns` | 05–09 | Next.js 15 App Router, middleware, layouts |
| `wsimmonds/claude-nextjs-skills@nextjs-app-router-fundamentals` | 05 | Route groups `(auth)/(app)`, auth patterns |
| `bobmatnyc/claude-mpm-skills@playwright-e2e-testing` | 05–09 | Playwright E2E, seed data |
| `sickn33/antigravity-awesome-skills@bullmq-specialist` | 01–04 | BullMQ queue/worker, retries, DLQ |
| `greendesertsnow/pocketbase-skills@pocketbase-best-practices` | 01–07 | PocketBase migrations, auth, SDK |
| `jezweb/claude-skills@claude-api` | 02–04, 06 | Anthropic SDK, structured outputs, errors |
| `erichowens/some_claude_skills@llm-streaming-response-handler` | 06 | SSE streaming to client |
| `alinaqi/claude-bootstrap@pwa-development` | 09 | PWA manifest, icons, display modes |

## Agent Rules

- No confirmation prompts. Decide and proceed.
- Commit after each task: `[CY-01] create ingest route`
- Run `npm test` after every logic change. Do not proceed on failure.
- No `TODO` comments. Implement fully or log to `BLOCKERS.md` and skip.
- Never hardcode secrets. All keys in `.env.example`.
- Schema changes via migrations only — never edit `pb_schema.json` directly.
- If a task is ambiguous, implement the simplest version that satisfies the acceptance criteria.
- Always implement the final solution. Never use a workaround unless it is explicitly marked as temporary in the task — and even then, log it to `BLOCKERS.md` immediately.
