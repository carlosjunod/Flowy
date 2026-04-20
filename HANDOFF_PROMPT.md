# Tryflowy React Native — Autonomous Handoff Prompt

Copy everything between `BEGIN PROMPT` and `END PROMPT` into a fresh Claude Code session opened in an **empty repository**. It is self-contained and will run end-to-end without requiring further input.

---

## BEGIN PROMPT

You are Claude Code. Build a new React Native client for **Tryflowy** in the current empty repo. Work autonomously end-to-end. Do not stop to ask questions — every decision needed is below. Commit after each milestone.

**Product**: Universal AI-powered inbox. Users share URLs, screenshots, YouTube/TikTok/Instagram videos from the iOS/macOS share sheet → a backend (already running, not built here) processes with Claude → users browse via an inbox screen and natural-language chat.

**Your deliverable** (single iOS + macOS app, same codebase):

1. Expo bare-workflow RN project, iOS + macOS (Mac Catalyst) targets
2. Email/password auth against PocketBase
3. **Inbox screen** — reviews ALL saved bookmarks exactly like the existing web app (grid / list / detail view modes, filter, sort, search, paginate)
4. **Chat screen** — natural-language browsing with streaming responses and inline item citations
5. **Item detail screen** — full metadata view with edit + delete
6. **Native share extensions** (Swift) for iOS and macOS, accepting URL, image, and text payloads → POSTs to `/api/ingest` with the user's token from App Group Keychain
7. **Polling/subscription for processing status** — items show spinner while `status ∈ {pending, processing}`, refresh on `ready` / `error`

### Tech stack (use exactly this)

- Expo SDK 52+ (bare workflow; run `npx create-expo-app` then `npx expo prebuild`)
- TypeScript strict, no `any`
- `expo-router` file-based routing
- `pocketbase` JS SDK for DB + auth
- `@tanstack/react-query` for server state
- `expo-secure-store` for JWT persistence (App Group-shared Keychain on iOS so the share extension can read it)
- `react-native-markdown-display` for chat messages
- `nativewind` + Tailwind for styling (match web app visual language)
- `expo-image` for thumbnails (handles R2, YouTube, favicon URLs)
- Do NOT use `react-native-share-menu` — build a native Share Extension target directly in the prebuilt `ios/` project via an Expo config plugin (see step 6 below)

### Environment

Create `.env` with:

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000    # Next.js API host
EXPO_PUBLIC_PB_URL=http://localhost:8090          # PocketBase host
EXPO_PUBLIC_R2_PUBLIC_URL=https://files.tryflowy.app
```

Read via `process.env.EXPO_PUBLIC_*`. Support override at build time — the app must work against both local dev and production by changing only these three vars.

### Data contracts (do NOT invent new endpoints; hit the existing ones)

**Auth** — `pb.collection('users').authWithPassword(email, password)`. Persist `pb.authStore.token` to `expo-secure-store` under key `pb_auth` with `keychainAccessGroup: 'group.app.tryflowy'` so the share extension can read it.

**Inbox fetch** — direct PocketBase SDK call:

```ts
pb.collection('items').getList<Item>(page, 20, {
  filter: `user = "${pb.authStore.model!.id}"`,
  sort: `${dir === 'asc' ? '+' : '-'}${sortField},-created`,
})
```

`sortField ∈ {'created', 'category', 'type'}`. After fetch, apply client-side category-pill filter + debounced (200 ms) case-insensitive search across `[title, summary, content, category, tags.join(' ')]`.

**Item shape**:

```ts
type Item = {
  id: string; user: string;
  type: 'url' | 'screenshot' | 'youtube' | 'video' | 'receipt' | 'pdf' | 'audio';
  raw_url?: string; r2_key?: string;
  title?: string; summary?: string; content?: string;
  tags: string[]; category?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_msg?: string; source_url?: string;
  created: string; updated: string;
};
```

**Ingest** — `POST {EXPO_PUBLIC_API_BASE_URL}/api/ingest`, header `Authorization: Bearer <token>`, JSON body:

```json
{ "type": "url|screenshot|youtube|video", "raw_url": "...", "raw_image": "base64..." }
```

Response: `201 { "data": { "id": "...", "status": "pending" } }` or `4xx { "error": "CODE" }`.

**Chat** — `POST {EXPO_PUBLIC_API_BASE_URL}/api/chat`, header `Authorization: Bearer <token>`, JSON body `{ message, history: [{role, content}] }`. Response streams plain text; an `x-items` response header carries a JSON array of cited items `[{id,type,title,category,source_url,r2_key}]`. Render `[[itemId]]` citations inline as tap targets that open item detail.

**Item edit** — `PATCH /api/items/{id}` body `{ title?, summary?, category?, tags? }`.
**Item delete** — `DELETE /api/items/{id}`.

**Status polling** — after ingest, subscribe via `pb.collection('items').subscribe(id, cb)`. Fallback: poll `getOne(id)` every 3 s until status changes from `pending`/`processing`.

### Screen specs

**`/login`** — email + password fields → `authWithPassword` → navigate to inbox. Show inline error on failure.

**`/inbox`** (primary screen, matches web):

- Top bar: search input, view toggle (Grid | List | Detail), sort dropdown (Date | Category | Type), asc/desc toggle
- Horizontal category pill scroller below top bar (extracted from fetched items, plus "All")
- Grid: responsive columns (2 phone, 3 tablet, 4 macOS), card height 176 pt — thumbnail on top, title + category badge + type glyph + relative date
- List: single column, 40-pt leading icon + title + category + date
- Detail: 96-pt thumbnail + title + 2-line summary + tag strip + date
- Pagination: "Load more" button at list end; append, never replace. PAGE_SIZE = 20.
- Pending / processing items: dim, spinner overlay, non-tappable
- Error items: red border, tap shows `error_msg`
- Empty states: 📥 "Nothing saved yet" or 🔍 "No items match your search"
- Thumbnail resolution (same priority as web):
  1. `r2_key` → `${EXPO_PUBLIC_R2_PUBLIC_URL}/${r2_key}`
  2. YouTube: extract video ID → `https://img.youtube.com/vi/{id}/hqdefault.jpg`
  3. URL: Google favicon `https://www.google.com/s2/favicons?domain={host}&sz=128`
  4. Fallback: type glyph (url→🔗 screenshot→🖼️ youtube→▶ video→🎬 receipt→🧾 pdf→📄 audio→🎧)
- View mode persisted to SecureStore.

**`/chat`** — Claude-style chat UI. Header with "New chat". Messages list, input at bottom. On send:

1. Optimistic user bubble
2. Call `/api/chat` with streaming response (use `fetch` + `ReadableStream` reader, or `expo/fetch` polyfill)
3. Append tokens to assistant bubble as they arrive
4. On complete, parse `x-items` header → render tappable item cards below the assistant message; replace `[[id]]` substrings with numbered citation chips that scroll to the matching card

**`/item/[id]`** — full item detail. Shows thumbnail, title, summary, content (markdown), tags, category, source link. Edit button opens modal with title / summary / category / tags fields. Delete button with confirm.

**Navigation**: bottom tab bar (Inbox | Chat) on iPhone; sidebar on iPad + macOS.

### Share extension (iOS + macOS)

Build an Expo config plugin at `plugins/withShareExtension.ts` that:

1. Adds a Swift **Share Extension** target to the prebuilt `ios/` project
2. Enables App Groups capability `group.app.tryflowy` on both main app and extension
3. Declares `NSExtensionActivationRule` accepting URL (1), image (1), and text (1) items
4. Ships a `ShareViewController.swift` that:
   - Reads `NSExtensionItem.attachments`
   - Classifies: `public.url` + youtube/tiktok/instagram host → `type: youtube` or `type: video`; other URLs → `type: url`; images → `type: screenshot` with base64 `raw_image`
   - Reads auth token from shared Keychain (`group.app.tryflowy`, key `pb_auth`)
   - POSTs to `{EXPO_PUBLIC_API_BASE_URL}/api/ingest` with Bearer token
   - Shows SwiftUI success/failure feedback, auto-dismisses after 1.2 s
5. macOS: add Mac Catalyst deployment target and enable the share extension on macOS

Reference Swift patterns: subclass `SLComposeServiceViewController`; use `URLSession` with `URLSessionConfiguration.default`; base64-encode images via `UIImage.jpegData(compressionQuality: 0.85)?.base64EncodedString()`. Entirely Swift + SwiftUI. Target ≤ 500 LoC.

### Conventions

- TypeScript strict. No `any`. Types in `src/types/`.
- All PocketBase calls go through `src/lib/pb.ts`.
- All backend (REST) calls via `src/lib/api.ts` — always returns `{ data, error }`, never throws.
- Components functional; no class components.
- Styling via nativewind; spacing scale matches web.
- Errors: typed codes, e.g. `'ITEM_NOT_FOUND'`.

### File layout (create exactly this)

```
/
├── app/                              # expo-router screens
│   ├── _layout.tsx
│   ├── (auth)/login.tsx
│   ├── (app)/_layout.tsx
│   ├── (app)/inbox.tsx
│   ├── (app)/chat.tsx
│   └── (app)/item/[id].tsx
├── src/
│   ├── components/
│   │   ├── inbox/  ItemCard.tsx  ItemRow.tsx  ItemDetailRow.tsx  FilterBar.tsx
│   │   ├── chat/   ChatWindow.tsx  ChatMessage.tsx  ChatInput.tsx  Citation.tsx
│   │   └── ui/     Button.tsx  Spinner.tsx  Badge.tsx  Thumbnail.tsx
│   ├── lib/        pb.ts  api.ts  auth.ts  thumbnails.ts  relativeDate.ts
│   ├── hooks/      useItems.ts  useChat.ts  useItemStatus.ts
│   └── types/      index.ts
├── plugins/withShareExtension.ts
├── ios/ShareExtension/ShareViewController.swift   # created by prebuild + plugin
├── .env.example
├── app.json                          # expo config, plugin registered
├── package.json
├── tsconfig.json
└── README.md
```

### Execution plan (do in order, commit after each)

1. `npx create-expo-app@latest . --template blank-typescript`, then `npx expo install expo-router expo-secure-store expo-image @tanstack/react-query nativewind pocketbase react-native-markdown-display`
2. Configure nativewind + Tailwind; set up `app/_layout.tsx` and route groups
3. Implement `src/lib/pb.ts`, `src/lib/api.ts`, auth storage, typed error codes
4. Build `/login` screen + auth flow
5. Build `/inbox` with full feature parity (grid / list / detail, filter, sort, search, pagination, status polling, subscription)
6. Build `/item/[id]` detail + edit + delete
7. Build `/chat` with streaming + citations
8. `npx expo prebuild --platforms ios` and add macOS Catalyst target
9. Write `plugins/withShareExtension.ts` config plugin
10. Write `ios/ShareExtension/ShareViewController.swift`
11. Verify: `npx expo run:ios` — manual sanity of login → inbox → share an item → see it appear
12. Add `README.md` with env, build, run, and test steps

### Done criteria

- `npx expo run:ios` launches; login works against env-configured backend
- Inbox fetches, paginates, filters, sorts identically to the web app; all three view modes (grid / list / detail) work; pending/error states render
- Chat streams tokens and renders citations that deep-link to item detail
- Share extension appears in the iOS share sheet for URL + image, successfully POSTs to ingest, and the new item appears in the inbox within ~3 s via subscription
- `tsc --noEmit` passes
- `README.md` documents env vars, build, run, and test steps

Begin now. Work autonomously. Commit after each numbered step.

## END PROMPT
