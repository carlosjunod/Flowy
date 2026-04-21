# Flowy — DECISIONS.md

## Stack Decisions

### PocketBase over Supabase
**Chosen**: PocketBase 0.22  
**Rejected**: Supabase, Firebase  
**Reason**: Carlos already runs PocketBase on Railway for other projects — zero new infra to learn. SQLite-based, single binary, easy migrations. sqlite-vec plugin handles embeddings without needing pgvector. Supabase would add billing complexity and vendor lock-in.  
**Tradeoff**: PocketBase doesn't scale horizontally — acceptable for personal tool, revisit if opening to public.

### BullMQ over in-process async
**Chosen**: BullMQ + Redis  
**Rejected**: `setTimeout`, in-process async, Inngest  
**Reason**: AI processing (scrape + Claude + embedding) takes 5–30s. In-process would block the API response and fail on Railway's 30s request timeout. BullMQ persists jobs across restarts — no lost items if worker crashes.  
**Tradeoff**: Adds Redis dependency and a separate worker process on Railway.

### Claude Vision over Tesseract OCR
**Chosen**: Claude Vision API  
**Rejected**: Tesseract, Google Vision API  
**Reason**: Claude Vision understands context, not just text — it can describe a UI screenshot, understand a meme, or interpret a receipt. Tesseract is text-only. Keeps the stack to one AI provider.  
**Tradeoff**: More expensive per image. Acceptable for personal use volume.

### Swift Share Extension over React Native
**Chosen**: Native Swift share extension  
**Rejected**: React Native, Capacitor share plugin  
**Reason**: iOS/macOS share extensions must be native — there is no cross-platform option. The extension is intentionally thin (POST + show result) so Swift complexity is minimal.  
**Tradeoff**: Requires Xcode and an Apple Developer account ($99/yr).

### Next.js 15 App Router
**Chosen**: Next.js 15 with App Router  
**Rejected**: Remix, SvelteKit, plain React  
**Reason**: Carlos's primary stack. App Router enables streaming API responses natively for the chat interface. PWA support built-in.  
**Tradeoff**: App Router has more footguns than Pages Router — mitigated by Carlos's experience.

### Cloudflare R2 for file storage
**Chosen**: Cloudflare R2  
**Rejected**: AWS S3, Supabase Storage  
**Reason**: Zero egress fees. S3-compatible API means standard SDK works. Carlos already uses Cloudflare for DNS.  
**Tradeoff**: Slightly less mature than S3. No issue at personal scale.

### Sign in with Apple + server-side identity token validation (CYCLE-11)
**Chosen**: Native SIWA sheet → POST identity token to `/api/auth/apple` → verify via JWKS → find-or-create PocketBase user keyed on `apple_sub` → return PB auth token. Per-user PocketBase password is deterministically derived via `HMAC-SHA256(SIWA_PASSWORD_SECRET, apple_sub)`.  
**Rejected**: PocketBase native OAuth2 Apple provider, Clerk, Auth.js / NextAuth  
**Reason**: The app's primary client is a native iOS/macOS app sharing auth with a share extension via the `group.tryflowy` Keychain. Native SIWA is one-tap (no browser flicker), the identity token is verified server-side against Apple's JWKS, and the HMAC password lets the server mint PB tokens without storing per-user secrets. Clerk would split identity (Clerk) from data (PocketBase) and add a vendor dependency for a single-auth-method single-user product. NextAuth's session model doesn't cross the Keychain/extension boundary. PB native OAuth2 works but requires `ASWebAuthenticationSession` — brief in-app browser instead of the native Apple sheet.  
**Tradeoff**: If `SIWA_PASSWORD_SECRET` leaks, an attacker who knows a user's `apple_sub` can mint PB tokens for that user. Mitigated by treating the secret as production-critical. Rotation is transparent — next SIWA login transparently re-derives the password.

---

## Architecture Assumptions

1. Single-user initially — no multi-tenancy needed in Cycle 01-08. Auth added in Cycle 05 to protect the API, not for multi-user support.
2. Embeddings via `text-embedding-3-small` (1536 dims) — cheap, fast, sufficient for personal knowledge base scale (< 10k items).
3. No real-time sync between extension and web app needed — polling on inbox page is sufficient.
4. iOS only for share extension initially — Android is a future cycle.
5. Items are immutable after processing — no re-processing unless manually triggered.

---

## Known Tradeoffs

| Decision | Tradeoff | Acceptable? |
|----------|----------|-------------|
| SQLite (PocketBase) | No horizontal scaling | Yes — personal tool |
| Claude for all AI | Cost vs speed | Yes — quality > cost for personal use |
| Capacitor wrapper | Not fully native | Yes — web app is the primary surface |
| No real-time | Polling delay | Yes — 5s delay acceptable |
| Railway hosting | Cold starts | Yes — personal tool, not latency-critical |
