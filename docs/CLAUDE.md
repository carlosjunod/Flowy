# Tryflowy — CLAUDE.md

## Project
**Name**: Tryflowy  
**Domain**: tryflowy.app  
**Description**: Universal AI-powered inbox. Share anything from iOS/macOS share sheet → AI processes, classifies, and extracts content → chat interface to find everything with natural language.

---

## Tech Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Backend / DB | PocketBase | 0.22.x |
| Hosting (backend) | Railway | latest |
| Web App | Next.js | 15.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| AI | Claude API (claude-sonnet-4-5) | @anthropic-ai/sdk ^0.30 |
| Embeddings | sqlite-vec (PocketBase plugin) | 0.1.x |
| Job Queue | BullMQ | ^5.x |
| Queue Backend | Redis (Railway) | 7.x |
| File Storage | Cloudflare R2 | S3-compatible |
| Share Extension | Swift (iOS/macOS) | Swift 5.9 |
| App Wrapper | Capacitor | ^6.x |
| Scraping | @extractus/article-extractor | ^7.x |
| YouTube | youtube-transcript | ^1.x |
| OCR / Vision | Claude Vision API | (same SDK) |

---

## Folder Structure

```
tryflowy/
├── apps/
│   ├── web/                        # Next.js 15 web app
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── (app)/
│   │   │   │   ├── chat/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── inbox/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── layout.tsx
│   │   │   ├── api/
│   │   │   │   ├── ingest/
│   │   │   │   │   └── route.ts
│   │   │   │   └── chat/
│   │   │   │       └── route.ts
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatWindow.tsx
│   │   │   │   ├── ChatMessage.tsx
│   │   │   │   └── ChatInput.tsx
│   │   │   ├── inbox/
│   │   │   │   ├── InboxGrid.tsx
│   │   │   │   ├── ItemCard.tsx
│   │   │   │   └── FilterBar.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       └── Spinner.tsx
│   │   ├── lib/
│   │   │   ├── pocketbase.ts
│   │   │   ├── claude.ts
│   │   │   └── embeddings.ts
│   │   ├── public/
│   │   └── package.json
│   └── ios/                        # Swift share extension
│       ├── ShareExtension/
│       │   ├── ShareViewController.swift
│       │   └── Info.plist
│       └── Tryflowy.xcodeproj/
├── worker/                         # BullMQ worker process
│   ├── src/
│   │   ├── index.ts
│   │   ├── queues.ts
│   │   ├── processors/
│   │   │   ├── url.processor.ts
│   │   │   ├── image.processor.ts
│   │   │   ├── youtube.processor.ts
│   │   │   └── receipt.processor.ts
│   │   └── lib/
│   │       ├── claude.ts
│   │       ├── storage.ts
│   │       └── pocketbase.ts
│   └── package.json
├── pb/                             # PocketBase config
│   ├── pb_schema.json
│   └── pb_migrations/
├── tests/
│   ├── unit/
│   └── e2e/
├── .env.example
└── package.json                    # Root workspace
```

---

## Environment Variables

```env
# PocketBase
PB_URL=http://localhost:8090
PB_ADMIN_EMAIL=admin@tryflowy.app
PB_ADMIN_PASSWORD=changeme_local

# Claude API
ANTHROPIC_API_KEY=sk-ant-...

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=tryflowy-files
R2_PUBLIC_URL=https://files.tryflowy.app

# Auth
JWT_SECRET=changeme_local_32chars_minimum

# App
NEXT_PUBLIC_PB_URL=http://localhost:8090
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Local Run Commands

```bash
# Install all deps
npm install

# Start PocketBase
./pb/pocketbase serve --dir ./pb/pb_data

# Start Redis
docker run -p 6379:6379 redis:7

# Start worker
cd worker && npm run dev

# Start web app
cd apps/web && npm run dev

# All at once (requires concurrently)
npm run dev
```

---

## Test Commands

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:coverage

# E2E tests (requires app running)
npm run test:e2e

# Single file
npx vitest run tests/unit/url.processor.test.ts
```

---

## Coding Conventions

- **Naming**: camelCase for variables/functions, PascalCase for components/classes, kebab-case for files
- **Imports**: absolute imports from `@/` in web app, relative in worker
- **Components**: functional only, no class components
- **API routes**: always return `{ data, error }` shape — never throw unhandled
- **DB calls**: always go through `/lib/pocketbase.ts` — no direct PocketBase SDK calls in components
- **AI calls**: always go through `/lib/claude.ts` — never instantiate Anthropic SDK directly in routes
- **Types**: define types in `types/` — never use `any`
- **Errors**: use typed error codes — `{ error: 'ITEM_NOT_FOUND' }` not `{ error: 'not found' }`

---

## Agent Behavior Rules

- **No confirm prompts**: never ask for confirmation — make the decision and proceed
- **Blocker handling**: if blocked, write `BLOCKER: [description]` to `BLOCKERS.md` and move to next task
- **Commit pattern**: commit after every completed task with message `[CYCLE-XX] task description`
- **Test before moving on**: run unit tests after every logic task — do not proceed if tests fail
- **No placeholders**: never write `// TODO` or `// implement later` — implement fully or flag as BLOCKER
- **Env vars**: never hardcode secrets — always use `process.env.KEY` and ensure key is in `.env.example`
- **PocketBase schema**: never modify `pb_schema.json` directly — use migrations in `pb_migrations/`
