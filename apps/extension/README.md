# Flowy Chrome Extension

Bookmark pages, links, and images directly from Chrome (or any Chromium browser: Edge, Arc, Brave) into your Flowy inbox. Hits the existing `POST /api/ingest` route on `tryflowy.app` with a PocketBase bearer token.

## Features

- **Toolbar popup** — click the Flowy icon to save the current tab. Shows detected content type (url / youtube / instagram / reddit) and a running list of recent saves.
- **Context menu** — right-click anywhere to save the page, a link, an image, or the containing page of a selection.
- **Keyboard shortcut** — `Ctrl/Cmd + Shift + S` saves the current tab from any tab.
- **Smart type routing** — URLs from YouTube, Instagram, and Reddit are tagged with the matching ingest type so the worker picks the right processor.
- **Offline-friendly login** — email/password against PocketBase, token cached in `chrome.storage.local`. Session auto-clears on `401`.

## Install (development / unpacked)

1. Generate the icons (required once; uses only Node built-ins):
   ```bash
   cd apps/extension
   node scripts/generate-icons.mjs
   ```
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and pick this `apps/extension` directory.
5. Pin the **Flowy** icon in the toolbar.
6. Click the icon → **Sign in** → the options page opens. Enter your Flowy email + password (same credentials you use at tryflowy.app). Click **Sign in**.

## Configuration

Open **Settings** via the popup gear, or right-click the toolbar icon → **Options**.

| Field | Default | Notes |
|-------|---------|-------|
| Flowy web URL | `https://tryflowy.app` | Where the `/api/ingest` endpoint lives. |
| PocketBase URL | same as above | Where `authWithPassword` is called. Set separately if you run PB on a different host. |

When you change to a non-default host (e.g. `http://localhost:3000` for dev), the extension calls `chrome.permissions.request` to get host access — approve the prompt.

### Local dev against `npm run dev`

```
Flowy web URL:   http://localhost:4000
PocketBase URL:  http://localhost:8090
```

Approve the `http://localhost/*` host permission prompt on save.

## How it saves

The popup and background both call `POST ${flowyUrl}/api/ingest` with:

```json
{
  "type": "url" | "youtube" | "instagram" | "reddit",
  "raw_url": "<tab or link URL>",
  "source_url": "<containing page URL>"
}
```

and `Authorization: Bearer <pb_token>`. On success the API returns `{ data: { id, status: "pending" } }` (201); the worker takes over from there.

## Files

```
apps/extension/
├── manifest.json              # MV3 manifest
├── background.js              # service worker: context menus, commands, badge
├── lib.js                     # shared: settings, auth, ingest, URL classifier
├── popup.html / .js / .css    # toolbar popup (save + recent list)
├── options.html / .js / .css  # settings + sign-in
├── icons/                     # icon-16/32/48/128.png (generated)
└── scripts/
    └── generate-icons.mjs     # PNG generator (zero deps)
```

## Packaging for the Chrome Web Store

Just zip the extension directory (icons included, `scripts/` and this README optional):

```bash
cd apps
zip -r flowy-extension.zip extension \
  -x 'extension/scripts/*' 'extension/README.md'
```

Upload the resulting zip at <https://chrome.google.com/webstore/devconsole>.

## Known limitations

- **Images**: right-click → *Save image to Flowy* currently saves the image URL as a `url` item (the worker re-fetches). Uploading the raw bytes would require wiring through the `raw_image` base64 path in `/api/ingest`.
- **Apple/Google SSO**: the extension only supports email/password login. Users who signed up via SIWA/Google need to set a password in Flowy first (or we can add an OAuth popup flow later).
- **Firefox**: manifest is MV3-only; Firefox support needs a compatible polyfill and a test pass.
