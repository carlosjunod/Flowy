# Adding a New Source or Media Type

This doc is the checklist for wiring a new content source (TikTok, Twitter/X, LinkedIn, Substack, Vimeo, …) or a new media shape (audio files, PDFs from share sheet, etc.) into Flowy's ingestion pipeline. Follow it end-to-end — missing any step leaves the feature silently broken.

---

## 1. Decide the source shape

Pick exactly one before you write code:

| Shape | Ingress | Examples |
|---|---|---|
| **URL** | User pastes a URL (bulk-add) or shares a URL (iOS/macOS share sheet) | TikTok, Twitter/X, YouTube, Substack, Instagram, Reddit |
| **File / blob** | User uploads/shares a file (image, video, audio, PDF) | Screenshots, screen recordings, receipts, PDFs |

Most new integrations are URL-based. If yours is a file, skim section 8 first — the entry points differ.

---

## 2. URL-based source — step by step

### 2a. Define the `ItemType`

Add the new type to the enum in `worker/src/lib/pocketbase.ts`:

```ts
export type ItemType =
  | 'url'
  | 'screenshot'
  | 'youtube'
  | 'receipt'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'instagram'
  | 'reddit'
  | 'screen_recording'
  | 'tiktok';   // ← your new type
```

### 2b. Add URL detection + coercion in the ingest route

Edit `apps/web/app/api/ingest/route.ts`.

1. Add a pattern array and detector function alongside the existing ones (near lines 22–48):

```ts
const TIKTOK_PATTERNS = [
  /^https?:\/\/(?:www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
  /^https?:\/\/vm\.tiktok\.com\//,
];

function isTikTokUrl(url: string): boolean {
  return TIKTOK_PATTERNS.some((r) => r.test(url));
}
```

2. Extend the coercion predicate (~line 155). Decide for EACH combination of `incomingType` × path whether you want to route to your new type — the matrix below is the contract:

**Coercion matrix today** (keep this table in sync as you change routing):

| incomingType | URL path shape | Routed to | Why |
|---|---|---|---|
| `url` | `/p/`, `/tv/` (Instagram) | `instagram` | article-extractor can't parse IG |
| `url` | `/reel/`, `/reels/` (Instagram) | `instagram` | bulk-add fix |
| `url` | `/stories/` (Instagram) | `instagram` | multi-slide playlist |
| `url` | reddit.com / redd.it / `/r/…/s/` | `reddit` | OAuth-authenticated API |
| `video` | `/p/`, `/tv/`, `/stories/` (IG) | `instagram` | carousel-aware |
| `video` | `/reel/`, `/reels/` (IG) | **stays `video`** | mobile share-sheet fast path |
| `url` or `video` | anything else | unchanged | fall through to generic URL processor |

The two incoming types (`url` vs `video`) reflect **who's sending**:

- **Bulk-add (web)** sends `type: 'url'` for every pasted link — it can't classify. Your detector must catch these.
- **Mobile share sheet (iOS/macOS)** sends `type: 'video'` for video-like shares — it already knows. For most new sources you'll coerce on BOTH paths; only diverge when a faster dedicated processor exists for one client.

3. Add your detector to the coercion block:

```ts
const tiktokCoerce =
  raw_url !== undefined &&
  raw_url.length > 0 &&
  (incomingType === 'url' || incomingType === 'video') &&
  isTikTokUrl(raw_url);

const type = instagramCoerce
  ? 'instagram'
  : redditCoerce
  ? 'reddit'
  : tiktokCoerce
  ? 'tiktok'
  : incomingType;
```

### 2c. Add pure-regex tests

DO NOT use `tests/unit/ingest.test.ts` — that file has a pre-existing broken `vi.mock('pocketbase')` setup that swallows 15+ tests with a 401. Instead, mirror the pattern of `tests/unit/ingest-instagram-routing.test.ts`:

- Copy the pattern arrays and detector functions into the test file (yes, duplicated — they're the contract).
- Add test cases for EVERY row in the coercion matrix that involves your source.
- Include the real URL from the bug report / user request that motivated the integration (locks in the observed behavior).

```ts
it('type=url + tiktok video URL → tiktok', () => {
  expect(coerceType('url', 'https://www.tiktok.com/@user/video/123')).toBe('tiktok');
});
it('type=video + tiktok vm.tiktok.com URL → tiktok', () => {
  expect(coerceType('video', 'https://vm.tiktok.com/abc/')).toBe('tiktok');
});
```

Run just your new tests fast with `npx vitest run tests/unit/ingest-<source>-routing.test.ts`.

### 2d. Create the processor

One file in `worker/src/processors/`, e.g. `tiktok.processor.ts`. Required signature:

```ts
import type { ItemRecord } from '../lib/pocketbase.js';
export async function processTikTok(item: ItemRecord): Promise<void> {
  // 1. Pull content (scrape, API call, yt-dlp, etc.)
  // 2. Upload media to R2 (via uploadFile)
  // 3. Run Claude extraction (extractStructuredData / analyzeImage)
  // 4. Generate embedding (generateEmbedding)
  // 5. Call finalizeItem(itemId, patch)
  // 6. Call createEmbedding(itemId, vector)
}
```

**Always reuse these shared primitives** — do not re-implement any of them in your processor:

| Need | Use | Location |
|---|---|---|
| Download video + extract audio + Whisper transcript | `transcribeMediaUrl({ url, tmpPrefix, playlistIndex? })` | `worker/src/lib/transcription.ts` |
| Run Claude Vision on an image (returns `{summary, extracted_text, title, tags, category}`) | `analyzeImage({ mediaType, data })` | `worker/src/lib/claude.ts` |
| Structured extraction from text → `{title, summary, tags[], category}` | `extractStructuredData(text)` | `worker/src/lib/claude.ts` |
| Generate a 1536-dim embedding from a string | `generateEmbedding(text)` | `worker/src/lib/claude.ts` |
| Upload a buffer to Cloudflare R2 | `uploadFile(key, buffer, contentType)` | `worker/src/lib/storage.ts` |
| Mark item `status: 'ready'` + write title/summary/tags/etc. | `finalizeItem(itemId, patch)` | `worker/src/lib/finalize.js` |
| Write embedding row | `createEmbedding(itemId, vector)` | `worker/src/lib/pocketbase.ts` |
| yt-dlp cookie args (respects `YTDLP_COOKIES_FILE` / `YTDLP_COOKIES_B64` / `YTDLP_COOKIES_FROM_BROWSER`) | `ytdlpCookieArgs()` | `worker/src/lib/ytdlp.ts` |
| Typed processor errors (auto-maps to `error_msg`) | `throw new ProcessorError(CODE, detail)` | `worker/src/processors/url.processor.ts` |

**Multi-slide carousels / playlists** (stories, image carousels) — populate `item.media: MediaSlide[]`:

```ts
interface MediaSlide {
  index: number;
  kind: 'image' | 'video';
  r2_key: string;             // R2 path of the slide's thumbnail or image
  source_url?: string;
  summary?: string;           // from analyzeImage
  extracted_text?: string;    // OCR'd on-screen text
  transcript?: string;        // Whisper transcript for video slides
  taken_at?: string;          // ISO timestamp when upstream provides it
}
```

`media` is a JSON column — no PocketBase migration is required to add new fields, only a TypeScript type update.

### 2e. Wire the processor into the dispatcher

Edit `worker/src/index.ts`. In the big `switch (type)` in `handleJob`, add:

```ts
case 'tiktok':
  await processTikTok(item);
  break;
```

Don't forget the import at the top of the file.

### 2f. Document env vars

If your processor needs any secrets (API keys, OAuth tokens, cookie files), add them with a descriptive comment to `.env.example`. Group them thematically — see the existing YTDLP and Reddit sections for style.

For production (Railway), update whatever runbook you use to deploy — there's no `terraform.tfvars` or similar in this repo today; secrets are set via the Railway dashboard.

---

## 3. Verification checklist

Run each step, in order, before declaring the integration done:

- [ ] `npm --workspace worker run typecheck` — clean
- [ ] `npm --workspace apps/web run typecheck` — clean
- [ ] `npx vitest run tests/unit/ingest-<source>-routing.test.ts` — all green
- [ ] `npm test 2>&1 | tail -5` — no **new** failures vs baseline (see BLOCKERS.md for the 34 pre-existing 401 failures)
- [ ] Start worker + web with `npm run dev`
- [ ] Submit the real target URL via bulk-add → confirm worker log shows `processing item <id> type=<your_type>` (NOT `type=url`)
- [ ] Inspect PocketBase item at `status: 'ready'` with `title`, `summary`, `tags`, `content` populated from actual source data — not just OCR of a thumbnail or error fallback text
- [ ] If the source has rich audio (video, podcast): confirm the content reflects what was **said**, not just what was visible on screen
- [ ] If multi-slide (carousel/story): confirm `media[]` has N entries with per-slide `r2_key`, `summary`, and `transcript` (for video slides)
- [ ] Mobile share sheet regression test: on iOS simulator, share a URL of your new type from Safari → confirm it lands with the correct `type` (not `url`) and routes to your processor

---

## 4. Common pitfalls (learned the hard way)

- **URL coercion missed a path.** A URL shape (e.g. `/stories/`) with no detector in `route.ts` silently falls through to the generic URL processor, which fails with `no content extracted`. Grep the coercion predicate against the full coercion matrix every time you touch it.
- **`YtDlpEntry.url` is `null` for Instagram stories** even though the entry is a video. Don't rely on `entry.url` across sources — verify with a live `yt-dlp -j <url>` inspection before writing code that depends on entry shape. For playlist-shaped sources, use `--playlist-items N` against the parent URL instead of hand-constructing per-slide URLs.
- **`tests/unit/ingest.test.ts` is broken** (pre-existing `vi.mock('pocketbase')` factory doesn't intercept the import under vitest's current ESM loader). Use the pure-regex pattern from `ingest-instagram-routing.test.ts` until that's fixed. See BLOCKERS.md.
- **Mobile vs web asymmetry.** The iOS/macOS share extension is in `apps/ios/` Swift code — it classifies URLs client-side and sends `type: 'video'` for reels/videos. New sources usually want to be coerced on BOTH `type='url'` AND `type='video'` unless there's a deliberate fast-path split (like Instagram reels).
- **yt-dlp auth.** Instagram stories require cookies; many reels do too. Set ONE of `YTDLP_COOKIES_FILE`, `YTDLP_COOKIES_B64`, or `YTDLP_COOKIES_FROM_BROWSER`. Symptom of missing cookies: `login_required` / `empty media response` errors in yt-dlp stderr. See `worker/src/lib/ytdlp.ts` for the precedence order.
- **PocketBase auto-cancellation.** Parallel worker jobs share a single `pb` client; the SDK cancels earlier in-flight calls of the same endpoint unless you pass `{ requestKey: null }`. The shared helpers in `worker/src/lib/pocketbase.ts` already do this — if you write a NEW PB call, include `NO_CANCEL`.

---

## 5. File / blob sources (image, video, audio, PDF)

File uploads don't hit the URL coercion logic — they travel as base64 or direct binary in the POST body. Look at the existing flows:

- **Single image** (`type='screenshot'` with `raw_image`) → `processImage`
- **Multi-image** (`type='screenshot'` with `raw_images[]`) → `processScreenshots`
- **Video file** (`type='screen_recording'` with `raw_video`) → `processScreenRecording`

To add a new file shape (e.g. `type='voicememo'` for an uploaded audio file):

1. Add the type to `ItemType` in `worker/src/lib/pocketbase.ts`.
2. Add handling in `apps/web/app/api/ingest/route.ts` for the incoming payload shape (`raw_audio`? new field? multipart form?).
3. Add a `case '<type>'` branch in `worker/src/index.ts` that extracts the blob from the job data and calls your processor.
4. Processor flow typically: decode base64 → upload raw to R2 → run the appropriate extraction (Whisper for audio, analyzeImage for images, Claude PDF tool for PDFs) → `finalizeItem` + `createEmbedding`.

The reusable primitives from section 2d still apply.

---

## 6. When NOT to add a new source

- The source is ONE-off content the user pastes as text. Paste it into chat; nothing to ingest.
- The source is already handled by another processor's pattern (e.g. a LinkedIn post URL that article-extractor already parses well — the generic `url` processor handles it). Add a new source only when the generic path produces materially worse output than a dedicated one.
- You'd need a new auth flow (OAuth2, session cookies, API key rotation). Factor out the auth layer first — copy the Reddit processor's pattern in `worker/src/processors/reddit.processor.ts` for a clean OAuth template.

---

## 7. Reference integrations

Use these as templates when adding sources of similar shape:

- **Authenticated API (OAuth)** → `worker/src/processors/reddit.processor.ts`
- **Video with audio transcription (single)** → `worker/src/processors/video.ts`
- **Multi-slide carousel with mixed media** → `worker/src/processors/instagram.processor.ts`
- **HTML page with article extraction** → `worker/src/processors/url.processor.ts`
- **Transcript-based video without audio download** → `worker/src/processors/youtube.processor.ts`
- **OCR'd image(s)** → `worker/src/processors/image.processor.ts` / `screenshots.processor.ts`
