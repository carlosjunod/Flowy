# CYCLE-03 — AI Pipeline: Images

**Dependencies**: Cycle 02  
**Complexity**: Medium-High

---

## Goal
Worker processes screenshot/image items using Claude Vision — extracts text and context, classifies, stores in R2 and PocketBase.

---

## Tasks

### T01 — Create image processor
**File**: `worker/src/processors/image.processor.ts`  
**Action**: Export `processImage(item: ItemRecord, rawImageBase64: string): Promise<void>`:
1. Decode base64 → Buffer
2. Generate R2 key: `images/${item.id}.jpg`
3. Upload to R2 via `storage.uploadFile()`
4. Send to Claude Vision with prompt: "Extract all visible text and describe the main topic, theme, and any relevant metadata. Return JSON: `{ title, summary, tags, category, extracted_text }`"
5. Parse JSON response — if parse fails throw `{ code: 'VISION_PARSE_FAILED' }`
6. Call `generateEmbedding(extracted_text + ' ' + summary)`
7. Update PocketBase item with all fields + `r2_key` + `status: 'ready'`
8. Insert embedding record

⚠️ R2 upload must complete before Claude Vision call — image must be accessible  
**Acceptance**: Unit tests in T02 pass.

### T02 — Unit tests for image processor
**File**: `tests/unit/image.processor.test.ts`  
**Action**: Test cases:
- Happy path: base64 image → R2 upload called, Vision called, item updated `ready`
- R2 upload failure → throws, item set to `error`
- Vision parse failure → throws `VISION_PARSE_FAILED`
- Embedding stored correctly

**Acceptance**: All cases pass.

### T03 — Wire image processor into worker
**File**: `worker/src/index.ts`  
**Action**: Add branch: `if (job.data.type === 'screenshot') await processImage(item, job.data.raw_image)`.  
**Acceptance**: POST screenshot → item `ready` within 30s, R2 bucket contains file.

---

## Cycle Exit Criteria

- [ ] POST `{ type: 'screenshot', raw_image: '<base64>' }` → item `status: 'ready'` within 30s
- [ ] Item has `title`, `summary`, `tags`, `category`, `r2_key`
- [ ] R2 bucket contains file at `images/${itemId}.jpg`
- [ ] `npx vitest run tests/unit/` — all pass
- [ ] No TypeScript errors

---

