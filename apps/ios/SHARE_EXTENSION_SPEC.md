# Share Extension Spec — iOS + macOS

Covers the behavior of `ShareExtension` (iOS) and `ShareExtensionMac` (macOS)
for URL, multi-image, and screen-recording shares. This is the source of truth
for both targets; anything not listed here is out of scope.

---

## Goals

1. A single share action can hold **one URL**, **one screen recording**, or
   **1–10 images** — never a mix. The server treats the batch as a single
   inbox entry.
2. Multi-image shares are analyzed together so the extraction step can stitch
   pieces into one narrative, or explicitly note when the images don't seem
   related.
3. Screen recordings (local `.mov` / `.mp4`) are ingested, transcribed, and
   displayed inline — no trip through a remote video URL.
4. The UX is a thin banner: "Saving…" → "Saved ✓" or "Failed — tap Retry".
   No custom picker, no captions, no metadata input.

---

## Targets

| Target | Platform | Bundle ID | UTType support |
|--------|----------|-----------|----------------|
| `ShareExtension` | iOS 16+ | `app.tryflowy.share` | `public.url`, `public.image`, `public.movie`, `public.plain-text` |
| `ShareExtensionMac` | macOS 13+ | `app.tryflowy.share.mac` | same as iOS |

Both link the files in `apps/ios/Shared` (`IngestClient.swift`,
`KeychainStore.swift`) into their target membership.

---

## Activation rules (`Info.plist`)

```xml
<key>NSExtensionActivationRule</key>
<dict>
  <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
  <integer>1</integer>
  <key>NSExtensionActivationSupportsImageWithMaxCount</key>
  <integer>10</integer>
  <key>NSExtensionActivationSupportsMovieWithMaxCount</key>
  <integer>1</integer>
  <key>NSExtensionActivationSupportsText</key>
  <true/>
</dict>
```

- **Images**: max 10. Anything beyond is silently dropped by the OS at
  activation time; this is expected.
- **Movies**: max 1. Users who select multiple videos will see the extension
  become unavailable — acceptable for v1.
- **URL + text**: max 1 each. Text is accepted only if it parses as a URL.

---

## Resolution order

When the extension activates, `handleShare()` walks every `NSItemProvider`
across all `inputItems` in a strict order:

1. **URL** — if any provider conforms to `UTType.url`, load it and submit as
   `type: url`. Stop.
2. **Movie** — if any provider conforms to `UTType.movie`, `UTType.video`, or
   `UTType.quickTimeMovie`, load its `URL` (fallback: raw `Data`), detect MIME
   from the file extension, and submit as `type: screen_recording`. Stop.
3. **Images** — collect **every** image across all providers into a `[Data]`,
   re-encoded as JPEG at quality `0.85` (see "Image encoding"). Submit as
   `type: screenshot` with `raw_images: [base64]`. Stop.
4. **Plain text** — if the text parses as a URL (`looksLikeURL()`), submit as
   `type: url`. Stop.
5. Otherwise show "Unsupported content type" with a Retry button.

The order is intentional: if someone shares "a link and a screenshot" from
Safari, the link wins. Batching is image-only.

---

## Image encoding

All images are re-encoded to JPEG before base64:

- `URL` attachments → `Data(contentsOf:)` → `UIImage(data:)` → `jpegData(0.85)`.
- `UIImage` attachments → `jpegData(0.85)` directly.
- `Data` attachments → `UIImage(data:)` → `jpegData(0.85)`; if decoding fails,
  the raw bytes are sent as-is (the server sniffs PNG/WEBP/GIF/JPEG from magic
  bytes).

Ordering within a share session is preserved (the server assigns `index` from
the array position). No deduplication on the client.

---

## Video encoding

Screen recordings are **not** re-encoded. The extension reads the raw file and
base64-encodes the bytes. MIME is inferred from the file extension:

| Extension | MIME sent as `video_mime` |
|-----------|---------------------------|
| `mov`     | `video/quicktime`         |
| `webm`    | `video/webm`              |
| anything else | `video/mp4`           |

If the provider only returns `Data` (no file URL), the extension defaults to
`video/mp4`.

---

## Transport

`POST {TryflowyAppURL}/api/ingest` with `Authorization: Bearer <pb_token>`
read from the shared keychain (`group.tryflowy`, key `pb_token`).

### Request bodies

**URL:**
```json
{ "type": "url", "raw_url": "https://..." }
```

**Single image (legacy, still supported):**
```json
{ "type": "screenshot", "raw_image": "<base64 jpeg>" }
```

**Multi-image:**
```json
{
  "type": "screenshot",
  "raw_images": ["<base64 jpeg>", "<base64 jpeg>"],
  "raw_image": "<base64 jpeg of [0], for legacy compatibility>"
}
```

**Screen recording:**
```json
{
  "type": "screen_recording",
  "raw_video": "<base64 mp4/mov>",
  "video_mime": "video/mp4"
}
```

### Response

```json
{ "data": { "id": "<itemId>", "status": "pending" } }
```

Non-2xx → extension shows "Failed — tap Retry". Status `401` → keychain
token is stale; extension shows "Please log in to Tryflowy first".

### Timeouts

Tuned per payload size:

| Kind | Timeout |
|------|---------|
| URL | 10s |
| Multi-image | 60s |
| Screen recording | 120s |

---

## Limits (client-enforced)

- Max images per share: **10** (OS-enforced via `NSExtensionActivationRule`).
- Max video size: none (server will reject if base64 payload exceeds the
  proxy body limit). Users sharing >5-minute recordings may see a timeout.
- Server trims to `MAX_SCREENSHOTS = 10` and `MAX_IMAGES = 10` regardless.

---

## UI states

Single-line banner centered on screen, no keyboard, no custom view:

| State | Label | Retry button |
|-------|-------|--------------|
| Initial | "Saving to Tryflowy…" (images: "Saving N images to Tryflowy…") | hidden |
| Success | "Saved to Tryflowy ✓" | hidden, auto-closes in 1.5s |
| Auth error | "Please log in to Tryflowy first" | Close |
| Network/HTTP failure | "Failed — tap Retry" | Retry |
| Unknown content | "Unsupported content type" | Retry (no-op) |

---

## macOS parity

The Mac extension mirrors iOS behavior, with these target-specific notes:

- Hosting view is `NSViewController` with a single `NSTextField` label.
  Activation rule keys are identical.
- On Mac, `UTType.quickTimeMovie` is the common screen-recording UTI
  (QuickTime Player exports as `.mov`). The shared `IngestClient.ingestScreenRecording`
  handles both platforms identically.
- `ShareExtensionMac` currently only wires the URL path (pre-existing); v1
  of this spec requires it to adopt the full iOS resolution order. Tracked
  as a follow-up — do **not** ship multi-image without Mac parity if the
  product decision is platform parity.

---

## Acceptance tests

Each row must pass on both simulator and a real device. Mirror additions in
`tests/manual/ios-share.md`.

1. **Safari URL (iOS)** — share a webpage → `type: url` item appears, status
   reaches `ready`.
2. **Single screenshot (iOS)** — share one photo → `type: screenshot` item,
   `r2_key` set, `media` empty.
3. **3 screenshots (iOS)** — multi-select 3 photos in Photos → one
   `type: screenshot` item, `media` has 3 entries ordered by share order,
   `r2_key` = `media[0].r2_key`, card shows `▦ 3` badge.
4. **Unrelated images (iOS)** — share 3 photos of different subjects →
   summary ends with `⚠️ <coherence note>`.
5. **Screen recording (iOS)** — record screen (Control Center) → share from
   Photos → `type: screen_recording` item, inline `<video>` plays in the
   drawer, transcript populated (if audio present).
6. **Mixed URL + image (iOS)** — share a Safari page with an image attached
   → URL wins, image is ignored. One `type: url` item.
7. **No token (iOS + macOS)** — wipe keychain → "Please log in…" banner,
   no network call.
8. **Network failure (iOS)** — airplane mode → "Failed — tap Retry" →
   disable airplane mode → Retry succeeds.
9. **Safari URL (macOS)** — File → Share → `type: url` item.
10. **3 screenshots (macOS)** — Finder multi-select → same outcome as iOS
    #3. *(Blocked until Mac parity ships.)*

---

## Out of scope for v1

- Mixing images + video in one share.
- Captions / notes at share time.
- Background upload after extension dismissal.
- Retry across app relaunches (the current Retry button only works while the
  extension UI is still on screen).
- HEIC preservation (server-side re-encode handles storage size; keeping JPEG
  on the wire keeps the payload smaller).
