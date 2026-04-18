# CYCLE-10 — AI Pipeline: Video (TikTok + Instagram Reels)

**Dependencies**: Cycle 02 (Claude lib), Cycle 03 (R2 storage)
**Complexity**: High

---

## Goal
Worker processes TikTok and Instagram Reel URLs — downloads audio only, transcribes, extracts thumbnail, classifies with Claude, discards video. Stores link to original.

---

## System deps (must be installed on Railway worker instance)

```bash
pip install yt-dlp          # video/audio download
apt-get install ffmpeg      # audio extraction
```

Add to `worker/Dockerfile`:
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg python3-pip && pip install yt-dlp
```

---

## Tasks

### T01 — Add video type to PocketBase schema
**File**: `pb/migrations/3_add_video_type.js`
**Action**: Migration that adds `'video'` to the `type` select field options on the `items` collection.
**Acceptance**: PocketBase admin shows `video` as valid option in `type` field.

---

### T02 — Install transcription dep
**File**: `worker/package.json`
**Action**: Add `openai@^4.x` (used only for Whisper transcription via `openai.audio.transcriptions.create`). Add `tmp@^0.2.x` for temp file management.
**Acceptance**: Both packages importable.

---

### T03 — Create video processor
**File**: `worker/src/processors/video.ts`
**Action**: Export `processVideo(item: ItemRecord): Promise<void>`:

1. Detect platform from `item.raw_url`:
   - TikTok: matches `tiktok.com/@*/video/*` or `vm.tiktok.com/*`
   - Instagram: matches `instagram.com/reel/*` or `instagram.com/p/*`
   - If no match → throw `{ code: 'UNSUPPORTED_VIDEO_URL' }`

2. Download audio-only + thumbnail using `yt-dlp` via `child_process.execFile`:
   ```bash
   yt-dlp --no-playlist \
     --write-thumbnail \
     --convert-thumbnails jpg \
     -x --audio-format mp3 \
     --audio-quality 0 \
     -o /tmp/tryflowy-{itemId}.%(ext)s \
     {url}
   ```
   Timeout: 60s. If exits non-zero → throw `{ code: 'DOWNLOAD_FAILED', detail: stderr }`

3. Read `/tmp/tryflowy-{itemId}.mp3` and `/tmp/tryflowy-{itemId}.jpg`
   - If mp3 missing → throw `{ code: 'AUDIO_NOT_FOUND' }`
   - If jpg missing → log warning, continue without thumbnail

4. ⚠️ Transcribe audio via Whisper:
   ```ts
   const transcription = await openai.audio.transcriptions.create({
     file: fs.createReadStream(audioPath),
     model: 'whisper-1',
     response_format: 'text',
   })
   ```
   If transcription fails → throw `{ code: 'TRANSCRIPTION_FAILED' }`

5. Upload thumbnail to R2 if exists:
   - Key: `thumbnails/${item.id}.jpg`
   - Call `uploadFile()` from `lib/r2.ts`

6. Call `extractStructured(transcription)` → `{ title, summary, tags, category }`

7. Call `generateEmbedding(summary + ' ' + tags.join(' '))`

8. Update PocketBase item:
   ```ts
   {
     title,
     summary,
     content: transcription,
     tags,
     category,
     r2_key: thumbnailUploaded ? `thumbnails/${item.id}.jpg` : undefined,
     source_url: item.raw_url,   // link to original
     status: 'ready'
   }
   ```

9. Insert embedding record

10. ⚠️ Cleanup temp files regardless of success/failure:
    ```ts
    finally {
      fs.rmSync(`/tmp/tryflowy-${item.id}.mp3`, { force: true })
      fs.rmSync(`/tmp/tryflowy-${item.id}.jpg`, { force: true })
    }
    ```

**Acceptance**: Unit tests in T04 pass.

---

### T04 — Unit tests for video processor
**File**: `tests/unit/video.processor.test.ts`
**Action**: Test cases:
- Valid TikTok URL → `execFile` called, transcription called, item updated `ready`
- Valid Instagram Reel URL → same flow
- Unsupported URL → throws `UNSUPPORTED_VIDEO_URL`
- `yt-dlp` exits non-zero → throws `DOWNLOAD_FAILED`
- Transcription fails → throws `TRANSCRIPTION_FAILED`
- No thumbnail → item updated `ready` without `r2_key`
- Temp files deleted in all cases (happy + error paths)

Mock `child_process.execFile`, OpenAI client, R2 storage, PocketBase.
**Acceptance**: `npx vitest run tests/unit/video.processor.test.ts` — all cases pass.

---

### T05 — Wire video processor into worker
**File**: `worker/src/index.ts`
**Action**: Add branch: `if (job.data.type === 'video') await processVideo(item)`.
**Acceptance**: POST TikTok URL → item `ready` within 90s with transcript summary.

---

### T06 — Add OPENAI_API_KEY to env
**File**: `.env.example`, `CLAUDE.md`
**Action**: Add `OPENAI_API_KEY=` to `.env.example` with comment `# Whisper transcription for video items`.
**Acceptance**: Key present in `.env.example`. Worker boots without error when key is set.

---

### T07 — Update ingest route to accept video type
**File**: `apps/web/app/api/ingest/route.ts`
**Action**: Add `'video'` to the valid type enum in the validation step. Video requires `raw_url` — same validation as `url` type.
**Acceptance**: `POST { type: 'video', raw_url: 'https://tiktok.com/...' }` → 201 response.

---

### T08 — Update unit tests for ingest route
**File**: `tests/unit/ingest.test.ts`
**Action**: Add test case: valid `video` payload → 201 with `{ data: { id, status: 'pending' } }`.
**Acceptance**: All existing + new tests pass.

---

## Known Limitations (log in BLOCKERS.md if hit)

- **Instagram private profiles** → `yt-dlp` will fail with auth error. Not supported. Set `status: 'error'` with `error_msg: 'PRIVATE_PROFILE'`.
- **Instagram login wall** → If IG starts requiring cookies, log `INSTAGRAM_AUTH_REQUIRED` to BLOCKERS.md and skip. TikTok public videos remain unaffected.
- **TikTok rate limiting** → If multiple downloads fail in succession, add 5s delay between jobs via BullMQ `delay` option.
- **Video > 25MB audio** → Whisper has 25MB file size limit. If audio exceeds limit, trim to first 10 minutes using ffmpeg before transcription.

---

## Cycle Exit Criteria

- [ ] `POST { type: 'video', raw_url: '<tiktok_url>' }` → item `ready` within 90s
- [ ] Item has `title`, `summary`, `tags`, `category`, `content` (transcript), `source_url`
- [ ] Public TikTok video → thumbnail in R2 at `thumbnails/{id}.jpg`
- [ ] Temp files `/tmp/tryflowy-*` cleaned up after processing
- [ ] Private/unavailable video → item `error` with descriptive `error_msg`
- [ ] `npx vitest run tests/unit/video.processor.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no errors
- [ ] `OPENAI_API_KEY` added to `.env.example`
