# CYCLE-11 — Handoff & Todo List

**Goal**: Native iOS/macOS app → TestFlight build → non-tech users install via email invite.

**Status as of this handoff**: server + Swift source files are committed and tested. All remaining work is inside Xcode + Apple Developer Portal + App Store Connect.

---

## What's already done (merged on `main`)

| Commit | Task | Scope |
|--------|------|-------|
| `5782453` | Plan | `CYCLE-11.md` + `ROADMAP.md` entry |
| `1be4a47` | T03 | Server `/api/auth/apple` + `lib/apple-auth.ts` + PB migration (`apple_sub`) + iOS `AuthClient.swift` + 9 unit tests |
| `02a2c51` | T04 server | `/.well-known/apple-app-site-association` route + 4 unit tests |
| `7b29c98` | T08 | `DECISIONS.md` SIWA rationale + `CLAUDE.md` iOS dev-loop commands |
| `3837a2d` | T02 + T04 client | `SignInView.swift` + rewritten `TryflowyApp.swift` with auth routing + Universal Link handler |

**Test status**: 13 new unit tests, all passing. `@tryflowy/web` typecheck clean.

**What you still need to do**: open Xcode, create the project, ship to TestFlight. Checklist below.

---

## Todo List — in order

Tick boxes as you go. Stop at any ⚠️ to read the gotcha before proceeding.

### Phase 1 — Apple Developer Portal setup (15 min, browser)

- [ ] Visit [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles
- [ ] **Identifiers → + → App IDs → App** — create three:
  - [ ] `app.tryflowy.app` (main app) — enable: Associated Domains, App Groups, Sign in with Apple, Keychain Sharing
  - [ ] `app.tryflowy.share` (iOS share extension) — enable: App Groups, Keychain Sharing
  - [ ] `app.tryflowy.share.mac` (macOS share extension) — enable: App Groups, Keychain Sharing
- [ ] **Identifiers → App Groups → +** — create `group.tryflowy`
- [ ] Go back to each of the three App IDs → **Edit** → under App Groups, add `group.tryflowy`
- [ ] **Membership tab** — copy your **Team ID** (10-char alphanumeric, e.g. `ABC1234XYZ`). You'll need this in Phase 4.

### Phase 2 — Xcode project scaffolding (T01 — 30-45 min)

- [ ] Run `open -a Xcode` (or launch Xcode manually)
- [ ] **File → New → Project → iOS → App**
  - Product Name: `Tryflowy`
  - Team: your developer team
  - Organization Identifier: `app.tryflowy` (so bundle ID becomes `app.tryflowy.app` automatically — fix if it doesn't)
  - Interface: **SwiftUI**, Language: **Swift**
  - Include Tests: **off**, Storage: **None**
  - Save location: `apps/ios/` (so the project lands at `apps/ios/Tryflowy.xcodeproj`)

- [ ] ⚠️ **Delete Xcode's auto-generated `ContentView.swift` and `TryflowyApp.swift`** — the real ones are already in `apps/ios/Tryflowy/`. Move to Trash when prompted, then drag the real files from Finder into the Tryflowy group. When prompted, choose **Create groups** (yellow folder), not folder references.

- [ ] **File → New → Target → iOS → Share Extension**
  - Name: `ShareExtension`
  - Bundle ID: verify = `app.tryflowy.share`
  - Embed in: `Tryflowy`
  - Delete its auto-generated `ShareViewController.swift` stub
  - Drag in `apps/ios/ShareExtension/ShareViewController.swift` → target membership: **ShareExtension only**

- [ ] **File → New → Target → macOS → Share Extension**
  - Name: `ShareExtensionMac`
  - Bundle ID: verify = `app.tryflowy.share.mac`
  - Delete its auto-generated `ShareViewController.swift` stub
  - Drag in `apps/ios/ShareExtensionMac/ShareViewControllerMac.swift` → target membership: **ShareExtensionMac only**

- [ ] Drag `apps/ios/Shared/KeychainStore.swift`, `IngestClient.swift`, `AuthClient.swift` into the project → target membership: **ALL THREE** (check all three boxes in File Inspector)

- [ ] Drag `apps/ios/Tryflowy/SignInView.swift` → target membership: **Tryflowy only**

- [ ] Replace each target's `Info.plist` with the repo version in the respective folder (or merge keys manually — the critical one is `TryflowyAppURL`)

- [ ] For **every** target → Signing & Capabilities:
  - [ ] Team = your developer team
  - [ ] **+ Capability → App Groups** → check `group.tryflowy`
  - [ ] **+ Capability → Keychain Sharing** → add `group.tryflowy`

- [ ] For the **Tryflowy** target only (not the extensions):
  - [ ] **+ Capability → Sign in with Apple**
  - [ ] **+ Capability → Associated Domains** → add `applinks:tryflowy.app`

- [ ] ⚠️ Verify each Swift file's target membership in the File Inspector (right sidebar). Wrong memberships cause silent extension crashes with no log output.

- [ ] Build each scheme from the scheme selector (⌘B):
  - [ ] `Tryflowy` → iPhone 15 simulator → builds clean
  - [ ] `ShareExtension` → iPhone 15 simulator → builds clean
  - [ ] `ShareExtensionMac` → My Mac → builds clean

- [ ] Run the main app in simulator → confirm SIWA button appears (we're not testing the full flow yet — the web backend isn't pointed at your local dev server from the simulator)

- [ ] Commit: `git add apps/ios && git commit -m "[CYCLE-11] T01: Xcode project with three targets"`

### Phase 3 — Privacy manifests (T05 — 10 min)

- [ ] Create `apps/ios/Tryflowy/PrivacyInfo.xcprivacy` with the content from `CYCLE-11.md` § T05
- [ ] Create `apps/ios/ShareExtension/PrivacyInfo.xcprivacy` (same content)
- [ ] Create `apps/ios/ShareExtensionMac/PrivacyInfo.xcprivacy` (same content)
- [ ] In Xcode, drag each into its target → target membership: **that target only**
- [ ] Product → Archive → verify no privacy-manifest warnings
- [ ] Commit: `git add apps/ios && git commit -m "[CYCLE-11] T05: privacy manifests for all three targets"`

### Phase 4 — Environment wiring (5 min)

- [ ] Copy Team ID from Phase 1 → set `APPLE_TEAM_ID` in Vercel env (Production + Preview + Development)
- [ ] Generate a 32+ char random string → set `SIWA_PASSWORD_SECRET` in Vercel env (all three scopes)
- [ ] Verify `APPLE_CLIENT_ID=app.tryflowy.app` in Vercel env
- [ ] Verify `PB_ADMIN_EMAIL` + `PB_ADMIN_PASSWORD` are set in Vercel env (Railway admin creds)
- [ ] Deploy web app (Vercel auto-deploys on push)
- [ ] ⚠️ Verify AASA is served: `curl -sI https://tryflowy.app/.well-known/apple-app-site-association | grep -i content-type` → must return `application/json`. If it returns `text/html` or 404, the route didn't deploy — check Vercel build logs.

### Phase 5 — App Store Connect + TestFlight (T06-T07 — 1-2 hrs active, 24-48h waiting on review)

- [ ] Visit [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → + → New App
  - [ ] Platforms: iOS, macOS
  - [ ] Name: `Tryflowy` (check availability — fall back to `Tryflowy - AI Inbox` if taken)
  - [ ] Primary Language: English (US)
  - [ ] Bundle ID: select `app.tryflowy.app` from the dropdown
  - [ ] SKU: `tryflowy-ios-v1`

- [ ] App Information:
  - [ ] Category: Productivity
  - [ ] Content Rights: Does not contain third-party content

- [ ] App Privacy → fill in to match the PrivacyInfo.xcprivacy from Phase 3:
  - [ ] Email Address — linked, for app functionality, not used for tracking
  - [ ] User Content (photos shared to app) — linked, for app functionality, not used for tracking

- [ ] Pricing → Free

- [ ] TestFlight tab:
  - [ ] Create **Internal Testing** group "Tryflowy Internal" → add yourself via email
  - [ ] Create **External Testing** group "Tryflowy Beta" → don't add testers yet (needs approved build first)
  - [ ] Fill in **Beta App Information**: what to test, feedback email, demo account

- [ ] Archive + upload first build:
  - [ ] Xcode → select `Tryflowy` scheme, destination `Any iOS Device (arm64)`
  - [ ] Product → Archive (2-5 min)
  - [ ] Organizer opens → **Distribute App → App Store Connect → Upload**
  - [ ] Signing: **Automatic** — Xcode will generate provisioning profiles

- [ ] Wait 5-15 min for App Store Connect to process the build

- [ ] App Store Connect → TestFlight → Builds → select the new build → add to "Tryflowy Internal"

- [ ] Install on your own iPhone via the TestFlight app → verify:
  - [ ] App opens → SIWA screen appears
  - [ ] Tap SIWA → native Apple sheet → sign in → main app loads
  - [ ] In Safari, tap share icon → "Send to Tryflowy" appears → tap → success toast
  - [ ] From another device, send yourself `https://tryflowy.app/inbox` via Messages → tap → Tryflowy opens, not Safari

- [ ] Once internal testing passes → **Submit for Beta App Review** (required once before external testers can install)
  - [ ] TestFlight → External Testing → "Tryflowy Beta" → Add Build → answer review questions → submit
  - [ ] Review takes 24-48h
  - [ ] ⚠️ Reviewers WILL test the share extension. If you require sign-in, seed a demo account (`demo@tryflowy.app`) and include credentials in the review notes

- [ ] Commit: `git commit --allow-empty -m "[CYCLE-11] T07: first TestFlight build uploaded"` (just marks the milestone)

### Phase 6 — Wait + invite

- [ ] Beta App Review approves (24-48h, email notification)
- [ ] Add external testers' emails to "Tryflowy Beta" group → they get an install link via email
- [ ] Cycle 11 complete 🎉

---

## Gotchas worth re-reading before they bite

1. **Target membership** is the #1 cause of silent failures. `Shared/*.swift` files belong to all three targets. `Tryflowy/*.swift` belongs to the main app only. `ShareExtension/*.swift` and `ShareExtensionMac/*.swift` each belong to their own extension only. Always verify in the File Inspector after dragging in any file.

2. **AASA caching**: iOS aggressively caches the `apple-app-site-association` file. If you change it, delete the app, reboot the simulator/device, and reinstall to force a re-fetch.

3. **SIWA email field**: only populated on the **very first** sign-in per Apple ID per app. If the server returns `EMAIL_REQUIRED_FIRST_LOGIN` during testing, it means you previously signed in, were deleted, and signed in again. Fix: Settings → Password & Security → Sign in with Apple → Tryflowy → Stop Using, then retry. The `SignInView.swift` error message already tells users this.

4. **SIWA_PASSWORD_SECRET is load-bearing**: if it leaks, rotate it — the next SIWA login transparently re-derives. But never commit it to `.env` (only `.env.example` with a placeholder).

5. **Beta App Review rejection is normal on first submission**. Common causes: missing demo account, privacy-manifest fields don't match what App Privacy says on ASC, share extension reviewer couldn't find the app to share into. Fix the specific issue, bump build number (not version), re-archive, re-upload.

6. **Universal Links only work in release/TestFlight builds against the live domain**. They don't work in the simulator against `localhost:4000` because the AASA fetch is against the public URL. Test Universal Links via TestFlight, not sim.

---

## If something breaks

| Symptom | Likely cause |
|---------|--------------|
| `xcodebuild` fails on `ShareExtension` with "cannot find KeychainStore in scope" | Forgot to check the ShareExtension box in KeychainStore.swift's target membership |
| SIWA button appears but "Sign-in failed (401)" | Backend `SIWA_PASSWORD_SECRET` < 32 chars, or `APPLE_CLIENT_ID` doesn't match the app's bundle ID |
| SIWA returns 400 `EMAIL_REQUIRED_FIRST_LOGIN` | Apple withheld email because you signed in before. See Gotcha #3 |
| Share extension crashes immediately after tap | Almost always a target membership issue — `IngestClient.swift` or `KeychainStore.swift` not included in the extension target |
| Universal Link opens in Safari instead of app | AASA stale cache (delete+reinstall), or `applinks:tryflowy.app` not in Associated Domains capability, or Team ID mismatch in the served AASA |
| Beta App Review rejected "couldn't test share functionality" | Add a demo account + include credentials in review notes |

---

## Links

- Full task spec: `CYCLE-11.md`
- Architecture decision: `DECISIONS.md` § "Sign in with Apple + server-side identity token validation"
- Dev-loop commands: `CLAUDE.md` § "iOS / macOS dev loop"
- iOS source target structure: `apps/ios/README.md`
