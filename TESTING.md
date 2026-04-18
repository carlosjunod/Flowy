# Tryflowy — TESTING.md

## Unit Testing

**Framework**: Vitest 1.x  
**Config**: `vitest.config.ts` at root — `include: ['tests/unit/**/*.test.ts']`  
**Mocking**: `vi.mock()` for PocketBase, Claude SDK, BullMQ, S3 client  
**Coverage target**: ≥ 80% on all processor files and API routes

```bash
# Run all unit tests
npm run test

# Run with coverage
npm run test:coverage

# Run single file
npx vitest run tests/unit/url.processor.test.ts

# Watch mode
npx vitest
```

---

## E2E Testing

**Framework**: Playwright 1.x  
**Config**: `playwright.config.ts` at root  
**Browser**: Chromium only (for speed)  
**Base URL**: `http://localhost:3000`  
**Requires**: App running locally (`npm run dev`)

```bash
# Run all E2E tests
npm run test:e2e

# Run single spec
npx playwright test tests/e2e/auth.spec.ts

# With UI
npx playwright test --ui

# Debug mode
npx playwright test --debug
```

---

## Test Folder Structure

```
tests/
├── unit/
│   ├── ingest.test.ts       # Cycle 01
│   ├── worker.test.ts       # Cycle 01
│   ├── url.processor.test.ts    # Cycle 02
│   ├── image.processor.test.ts  # Cycle 03
│   ├── youtube.processor.test.ts # Cycle 04
│   └── chat.test.ts         # Cycle 06
├── e2e/
│   ├── auth.spec.ts         # Cycle 05
│   ├── chat.spec.ts         # Cycle 06
│   ├── inbox.spec.ts        # Cycle 07
│   └── smoke.spec.ts        # Cycle 09
└── manual/
    └── ios-share.md         # Cycle 08
```

---

## Coverage Targets Per Cycle

| Cycle | Files | Min Coverage |
|-------|-------|-------------|
| 01 | `api/ingest/route.ts`, `worker/src/index.ts` | 90% |
| 02 | `processors/url.processor.ts`, `lib/claude.ts` | 85% |
| 03 | `processors/image.processor.ts`, `lib/storage.ts` | 85% |
| 04 | `processors/youtube.processor.ts` | 85% |
| 05–07 | UI components | 0% (E2E covers these) |
| 06 | `api/chat/route.ts` | 90% |

---

## CI Pipeline

GitHub Actions — `.github/workflows/ci.yml`:

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: npx tsc --noEmit
      - run: npm run test:coverage
      - run: npx playwright install chromium
      - run: npm run test:e2e
        env:
          PB_URL: ${{ secrets.PB_URL }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```
