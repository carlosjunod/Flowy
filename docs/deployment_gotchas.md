# Deployment gotchas

Things that will bite you when deploying Flowy (Vercel web app ↔ Railway PocketBase + Redis + worker). Read once before shipping, re-read when something silently breaks in prod.

Companion file: `apps/web/.env.vercel.example` (the copy-paste template for Vercel).

---

## 1. Railway Redis needs public networking for Vercel

Vercel's serverless runtime cannot resolve Railway's internal DNS (`*.railway.internal`). If you paste the internal URL into `REDIS_URL` on Vercel, `/api/ingest` will hang/time out trying to enqueue.

**Fix:** on the Railway Redis service, enable **Public Networking** (the TCP proxy). Use the public proxy hostname in `REDIS_URL`, e.g.:

```
redis://default:<password>@<something>.proxy.rlwy.net:<port>
```

Alternative: move the Next.js app off Vercel and onto Railway too, so both sides share the private network.

## 2. PocketBase CORS allowlist on Railway

PocketBase blocks cross-origin browser requests unless the origin is whitelisted. After deploying, go to the PB admin UI → **Settings → Application** and add your Vercel production domain(s) (and any preview domains you care about) to the allowed origins list. Symptom when missing: browser calls fail with CORS errors while server-side routes (`/api/*`) work fine.

## 3. `NEXT_PUBLIC_*` vars are baked at build time

Next.js inlines every `NEXT_PUBLIC_*` var into the client bundle at build time. Setting or changing one in the Vercel dashboard has **no effect on an already-built deployment** — you must trigger a redeploy.

This applies to: `NEXT_PUBLIC_PB_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_APPLE_WEB_CLIENT_ID`, `NEXT_PUBLIC_APPLE_REDIRECT_URI`, `NEXT_PUBLIC_R2_PUBLIC_URL`.

## 4. `NEXT_PUBLIC_APPLE_REDIRECT_URI` must match a registered Return URL

Even for the popup-mode web SIWA flow, Apple requires the redirect URI in the request to **exactly match** one of the Return URLs configured on the Apple Services ID. Leaving the local value (`http://localhost:4000/login`) in production will break SIWA with a generic Apple error.

For production, set it to your Vercel prod URL + `/login` (e.g. `https://tryflowy.app/login`) and register that exact string on developer.apple.com → Identifiers → Services IDs → Configure.

## 5. `APPLE_TEAM_ID` missing silently breaks Universal Links

The AASA route (`apps/web/app/.well-known/apple-app-site-association/route.ts:7`) falls back to the literal string `TEAMIDMISSING` when `APPLE_TEAM_ID` is unset. The response still serves with the right content-type, so nothing looks broken — but the appID is garbage and iOS silently refuses to register Universal Links.

Verify after deploy:

```bash
curl -sI https://<your-prod-domain>/.well-known/apple-app-site-association | grep -i content-type
# Expected: content-type: application/json

curl -s https://<your-prod-domain>/.well-known/apple-app-site-association
# The appID must be <real-10-char-team-id>.app.tryflowy.app — NOT TEAMIDMISSING.*
```

## 6. PB admin credentials must match on both sides

`PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` on Vercel must be identical to the PocketBase superuser on Railway. `/api/auth/google` and `/api/auth/apple` admin-authenticate with these before upserting the user record — a mismatch returns 500 on every social login.

## 7. Worker cannot run on Vercel serverless

The BullMQ worker needs a long-running process. Vercel serverless functions cannot host it. Deploy `worker/` as a separate Railway service (alongside PocketBase and Redis), pointed at the same Redis + PB. The worker needs its own copy of the R2 credentials, Reddit credentials, and `YTDLP_PATH` / `FFMPEG_PATH` — none of these go on Vercel.

## 8. HMAC secrets must be ≥32 chars

`SIWA_PASSWORD_SECRET` and `GOOGLE_PASSWORD_SECRET` are used to derive deterministic PB passwords from the provider's `sub`. The derivation works with any length, but shorter values weaken the HMAC. Always use 32+ random chars (e.g. `openssl rand -hex 32`).

## 9. Rotating `*_PASSWORD_SECRET` invalidates existing PB passwords

If you rotate `SIWA_PASSWORD_SECRET` or `GOOGLE_PASSWORD_SECRET`:

- Existing PocketBase sessions keep working (they use PB tokens, not the secret).
- Next provider login transparently re-derives and overwrites the stored PB password. No user-visible breakage.
- But: any flow that tried to auth against PB using the old derived password directly will now fail. In Flowy's current setup this isn't used, but be aware if you add one.

## 10. Post-deploy verification checklist

Run this every time after changing Vercel env vars and redeploying:

1. **PB reachable from browser**: open the Vercel prod URL, open the inbox — items load without CORS errors in the console.
2. **Login buttons render correctly**: `/login` shows Google and Apple buttons if and only if the respective `NEXT_PUBLIC_*` vars are set.
3. **AASA sanity**:
   ```bash
   curl -sI https://<prod>/.well-known/apple-app-site-association | grep -i content-type
   curl -s  https://<prod>/.well-known/apple-app-site-association | head
   ```
   content-type must be `application/json`; body must contain the real Team ID.
4. **Ingest end-to-end**: create an item from the UI. Watch PocketBase — the record should transition `pending → processing → ready`. If it stays `pending`, Vercel cannot reach Redis (revisit #1). If it flips to `error`, check the worker logs on Railway.
5. **Chat**: send a message in the chat UI. Failure here with a 500 usually means `ANTHROPIC_API_KEY` is missing or invalid on Vercel.
