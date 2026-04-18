# CYCLE-04 — AI Pipeline: YouTube

**Dependencies**: Cycle 02  
**Complexity**: Medium

---

## Goal
Worker processes YouTube URLs — fetches transcript, generates structured summary, stores embeddings.

---

## Tasks

### T01 — Install YouTube dep
**File**: `worker/package.json`  
**Action**: Add `youtube-transcript@^1.x`.  
**Acceptance**: Package importable.

### T02 — Create YouTube processor
**File**: `worker/src/processors/youtube.processor.ts`  
**Action**: Export `processYoutube(item: ItemRecord): Promise<void>`:
1. Extract video ID from `item.raw_url` — support formats: `youtube.com/watch?v=ID`, `youtu.be/ID`
2. If extraction fails → throw `{ code: 'INVALID_YOUTUBE_URL' }`
3. Fetch transcript with `YoutubeTranscript.fetchTranscript(videoId)` — join all text
4. If transcript unavailable (throws) → use fallback: fetch `https://www.youtube.com/oembed?url=${raw_url}&format=json` to get title + author — use as content with note `[transcript unavailable]`
5. Call `extractStructuredData(transcript_or_fallback)`
6. Call `generateEmbedding(summary + ' ' + tags.join(' '))`
7. Update item + insert embedding

**Acceptance**: Unit tests in T03 pass.

### T03 — Unit tests for YouTube processor
**File**: `tests/unit/youtube.processor.test.ts`  
**Action**:
- Valid YouTube URL + transcript → item `ready` with all fields
- Valid YouTube URL + no transcript → item `ready` with fallback summary
- Invalid URL → throws `INVALID_YOUTUBE_URL`

**Acceptance**: All cases pass.

### T04 — Wire YouTube processor into worker
**File**: `worker/src/index.ts`  
**Action**: Add branch: `if (job.data.type === 'youtube') await processYoutube(item)`.  
**Acceptance**: POST YouTube URL → item `ready` within 45s.

---

## Cycle Exit Criteria

- [ ] POST valid YouTube URL → item `ready` within 45s with `title`, `summary`, `tags`, `category`
- [ ] POST YouTube URL with no transcript → item `ready` with fallback, not `error`
- [ ] POST invalid YouTube URL → item `error` with `error_msg: 'INVALID_YOUTUBE_URL'`
- [ ] `npx vitest run tests/unit/` — all pass
- [ ] No TypeScript errors

---

