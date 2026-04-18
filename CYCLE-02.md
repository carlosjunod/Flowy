# CYCLE-02 — AI Pipeline: URLs

**Dependencies**: Cycle 01  
**Complexity**: Medium-High

---

## Goal
Worker fully processes URL items — scrapes content, generates summary + tags + category via Claude, generates and stores embeddings.

---

## Tasks

### T01 — Install URL processing deps
**File**: `worker/package.json`  
**Action**: Add `@extractus/article-extractor@^7.x` and `@anthropic-ai/sdk@^0.30`.  
**Acceptance**: `npm install` succeeds. Both packages importable.

### T02 — Create Claude client lib
**File**: `worker/src/lib/claude.ts`  
**Action**: Export singleton Anthropic client using `ANTHROPIC_API_KEY`. Export two functions:
- `extractStructuredData(content: string): Promise<{ title, summary, tags, category }>` — uses `claude-sonnet-4-5`, system prompt instructs JSON-only response with schema `{ title: string, summary: string (max 200 chars), tags: string[] (max 5), category: string (single word) }`
- `generateEmbedding(text: string): Promise<number[]>` — uses `text-embedding-3-small` via OpenAI-compatible endpoint or Claude's embedding (use `claude-sonnet-4-5` with embedding prompt as fallback)

⚠️ Both functions must handle API errors — throw typed `ClaudeError` with `{ code, message }`  
**Acceptance**: Unit tests in T05 pass.

### T03 — Create R2 storage lib
**File**: `worker/src/lib/storage.ts`  
**Action**: Export `uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string>` using S3-compatible R2 API with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Returns public URL `${R2_PUBLIC_URL}/${key}`.  
**Acceptance**: Unit test with mocked S3 client passes.

### T04 — Create URL processor
**File**: `worker/src/processors/url.processor.ts`  
**Action**: Export `processUrl(item: ItemRecord): Promise<void>`:
1. Fetch and parse article with `article-extractor` — extract `title`, `content`, `url`
2. If scrape fails (throws or returns null content) → throw `{ code: 'SCRAPE_FAILED' }`
3. Call `extractStructuredData(content)` → get `{ title, summary, tags, category }`
4. Call `generateEmbedding(summary + ' ' + tags.join(' '))` → get vector
5. Update PocketBase item: set all AI fields + `status: 'ready'`
6. Insert embedding record in `embeddings` collection

⚠️ Wrap steps 1–6 in try/catch — on any error throw with original message preserved  
**Acceptance**: Unit tests in T05 pass.

### T05 — Unit tests for URL processor
**File**: `tests/unit/url.processor.test.ts`  
**Action**: Test cases:
- Happy path: valid URL → item updated with all AI fields, `status: 'ready'`
- Scrape failure → throws `SCRAPE_FAILED`, item not updated
- Claude API error → error propagates, caller handles
- Embedding stored in `embeddings` collection

Mock `article-extractor`, Claude client, PocketBase.  
**Acceptance**: `npx vitest run tests/unit/url.processor.test.ts` — all cases pass.

### T06 — Wire URL processor into worker
**File**: `worker/src/index.ts`  
**Action**: In the main worker processor, add branch: `if (job.data.type === 'url') await processUrl(item)`. On processor success: item already updated to `ready` by processor. On processor error: catch and set `status: 'error'`, `error_msg`.  
**Acceptance**: POST YouTube URL → item reaches `status: 'ready'` within 30s with all fields populated.

---

## Cycle Exit Criteria

- [ ] POST `{ type: 'url', raw_url: 'https://vercel.com/blog' }` → item `status: 'ready'` within 30s
- [ ] Item has non-empty: `title`, `summary`, `tags`, `category`, `content`
- [ ] `embeddings` collection has record linked to item
- [ ] POST URL to unreachable domain → item `status: 'error'` with `error_msg: 'SCRAPE_FAILED'`
- [ ] `npx vitest run tests/unit/` — all tests pass
- [ ] No TypeScript errors

---

