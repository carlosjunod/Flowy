# Tryflowy — Postman collection

Two files:

- `Tryflowy.postman_collection.json` — requests + test scripts
- `Tryflowy.local.postman_environment.json` — local dev vars (ports 4000 / 8090)

## Import

Postman → Import → drag both files. Pick **Tryflowy — Local** as the active environment.

## Typical flow

1. **Auth / Login** — sets `{{token}}` and `{{userId}}` automatically.
2. **Ingest / URL (article)** — sets `{{lastItemId}}`.
3. **Items / Get by ID** — refresh until `status: "ready"`.
4. **Chat / Ask** — query across your items; the `X-Items` response header carries the cards.

Or run the whole flow via **Runner**: Auth → Ingest → Items / Poll until ready.

## Share-sheet simulation

The **Ingest** folder mirrors exactly what the iOS / macOS share extension does:

| Share-sheet input | Collection request |
|-------------------|-------------------|
| URL | `Ingest / URL (article)` |
| YouTube link | `Ingest / YouTube video` |
| Screenshot image | `Ingest / Screenshot (base64 PNG)` |
| TikTok / Instagram Reel | `Ingest / Video` |

For screenshot testing: generate a base64 string with `base64 -i ~/image.jpg | pbcopy`, then paste into the request body's `raw_image` field.

## Running against production

Duplicate the environment, swap:

- `pbUrl` → your PocketBase domain (e.g. `https://pb.tryflowy.app`)
- `appUrl` → `https://tryflowy.app`

All requests reuse the same variables — no body edits needed.

## Notes on the streaming chat endpoint

`/api/chat` returns a streaming plain-text body. Postman buffers the full stream and displays it once the request closes, which is fine for testing but doesn't show the incremental token rendering you'd see in the browser.
