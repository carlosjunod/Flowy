# Reddit Integration — Your Action Items

Everything in-code is shipped on branch `claude/reddit-integration-planning-aHnEO`
(168 tests passing). These are the manual steps only you can do.

Delete this file once every box is checked.

---

## 1. Register the Reddit OAuth2 app

- [ ] Log in to Reddit → go to https://www.reddit.com/prefs/apps
- [ ] Scroll to bottom → click **"are you a developer? create an app..."**
- [ ] Fill in:
  - **name**: `tryflowy`
  - **app type**: select **`web app`** (NOT "script" — we need a confidential
    client for the app-only `client_credentials` flow)
  - **description**: `Universal AI inbox`
  - **about url**: `https://tryflowy.app`
  - **redirect uri**: `https://tryflowy.app/oauth/reddit/callback`
    (required field, but unused by `client_credentials` — any valid URL is fine)
- [ ] Solve the captcha → **create app**
- [ ] Copy the **client ID** (short string under "web app" under the app name)
- [ ] Copy the **secret** field

> **Commercial Data API registration** (the "register to use the API" link at
> the top of the form) is **not required for MVP/development**. Only needed if
> you hit Reddit's commercial-use thresholds later.

## 2. Set environment variables

- [ ] Add to your local `.env` (and Railway for production):

  ```
  REDDIT_CLIENT_ID=<paste from step 1>
  REDDIT_CLIENT_SECRET=<paste from step 1>
  REDDIT_USER_AGENT=node:app.tryflowy.app:v1.0.0 (by /u/<your_reddit_username>)
  ```

  ⚠️ The `(by /u/<username>)` suffix is **mandatory**. Reddit rate-limits
  generic UAs aggressively and will ban opaque ones.

- [ ] Sanity check the credentials work:

  ```bash
  curl -u "$REDDIT_CLIENT_ID:$REDDIT_CLIENT_SECRET" \
    -H "user-agent: $REDDIT_USER_AGENT" \
    -d "grant_type=client_credentials" \
    https://www.reddit.com/api/v1/access_token
  ```

  Expect `{"access_token":"...","token_type":"bearer","expires_in":86400,...}`.

## 3. Run the PocketBase migration

- [ ] With PocketBase running locally:

  ```bash
  ./pb/pocketbase migrate up --dir ./pb/pb_data
  ```

  This adds `reddit` to the `items.type` enum (migration `9_add_reddit_type.js`).

- [ ] Production / Railway: the same migration needs to run against the
  production PocketBase instance before the new worker is deployed.

## 4. Deploy

- [ ] Merge the branch → `main` (or open a PR — I didn't create one since you
  didn't ask, but the push URL is:
  https://github.com/carlosjunod/Flowy/pull/new/claude/reddit-integration-planning-aHnEO )
- [ ] Set the three `REDDIT_*` env vars on Railway (worker + web services)
- [ ] Trigger the deploy so the worker restarts with the new processor

## 5. Smoke-test end-to-end

With `npm run dev` running locally, try each post kind:

- [ ] **Self-text post** — e.g. `https://www.reddit.com/r/AskReddit/comments/<id>/<slug>/`
- [ ] **Link post** — any news subreddit thread pointing to an external article
- [ ] **Image post** — `https://www.reddit.com/r/pics/comments/<id>/<slug>/`
- [ ] **Gallery post** — `https://www.reddit.com/r/Art/comments/<id>/<slug>/`
  (one where the gallery icon shows multiple images)
- [ ] **Reddit-hosted video** — any `v.redd.it` post (v1 stores preview image only)
- [ ] **Short share link** — `https://www.reddit.com/r/<sub>/s/<token>` from
  the Reddit mobile app's Share button
- [ ] **redd.it link** — `https://redd.it/<id>`

Command template:
```bash
curl -X POST http://localhost:4000/api/ingest \
  -H "Authorization: Bearer $PB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"url","raw_url":"<REDDIT_URL>"}'
```

Each should return `{"data":{"id":"...","status":"pending"}}`, then the
worker processes it asynchronously. Check the item with:
```bash
curl $PB_URL/api/collections/items/records/<id>
```
— expect `status: "ready"`, `type: "reddit"`, populated `title` / `summary` /
`tags` / `source_url`, and (for galleries) a populated `media[]` array.

## 6. Watch the rate-limit headers in production

- [ ] After ~50 real Reddit ingests on Railway, grep worker logs for `429` or
  for `RATE_LIMITED` errors. If you see any, the UA or auth is likely wrong.
  OAuth gives you **100 QPM** which is plenty for interactive use.

---

## Future work (not required, not blocking)

- **Full v.redd.it transcription** — wire `processReddit` to hand video-kind
  posts to the existing `worker/src/processors/video.ts` (which already
  supports `v.redd.it` via yt-dlp + Whisper). Currently v1 stores the preview
  image only.
- **User-delegated OAuth** — for reading private subs the user is a member of.
  Different product surface; would need per-user token storage.
