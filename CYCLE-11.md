# CYCLE-11 — Native iOS/macOS App: TestFlight-First

**Dependencies**: Cycle 05 (Auth), Cycle 08 (Share Extension sources)
**Complexity**: High

---

## Goal
Finish the Xcode project that Cycle 08 left as Swift sources + README, add Sign in with Apple (eliminates token-paste), wire Universal Links (shared `/item/xyz` links open the app), and ship a TestFlight build available to external testers via email invite.

Out of scope (deferred to Cycle 12): App Intents / Siri, push notifications, home-screen widget, full App Store submission.

---

## Prerequisites (not code — verify before starting)

- Apple Developer Program account active ($99/yr) — **confirmed**
- Bundle IDs available on developer.apple.com (add them now):
  - `app.tryflowy.app` (main app)
  - `app.tryflowy.share` (iOS share extension)
  - `app.tryflowy.share.mac` (macOS share extension)
- App Group: `group.tryflowy` (create under Certificates, Identifiers & Profiles → Identifiers → App Groups)
- Associated Domains entitlement approved for all three bundle IDs

---

## Tasks

### T01 — Create the Xcode project scaffolding
**File**: `apps/ios/Tryflowy.xcodeproj/` (new)
**Action**:
1. Open Xcode → File → New → Project → **App** (iOS). Product Name `Tryflowy`, Bundle ID `app.tryflowy.app`, Interface SwiftUI, Language Swift, Include Tests off, Storage None.
2. File → New → Target → **Share Extension** (iOS). Name `ShareExtension`, Bundle ID `app.tryflowy.share`. Embed in `Tryflowy`.
3. File → New → Target → **Share Extension** (macOS). Name `ShareExtensionMac`, Bundle ID `app.tryflowy.share.mac`. Embed in `Tryflowy`.
4. Delete Xcode's auto-generated `ShareViewController.swift` stubs in both extension targets — replace with the ones already checked in at `apps/ios/ShareExtension/ShareViewController.swift` and `apps/ios/ShareExtensionMac/ShareViewControllerMac.swift`. Drag each file into its respective target, **target membership = only that extension**.
5. Drag `apps/ios/Shared/KeychainStore.swift` and `apps/ios/Shared/IngestClient.swift` into the project with **target membership = all three targets** (checkboxes in File Inspector).
6. Override each target's `Info.plist` with the repo copy (or diff and manually merge keys).
7. On every target, Signing & Capabilities:
   - Team: your developer team
   - **+ Capability → App Groups** → check `group.tryflowy`
   - **+ Capability → Keychain Sharing** → add `group.tryflowy`
   - **+ Capability → Associated Domains** → add `applinks:tryflowy.app`

⚠️ `ShareViewController.swift`, `ShareViewControllerMac.swift`, and `TryflowyApp.swift` each belong to exactly ONE target. The shared helpers (`KeychainStore`, `IngestClient`) belong to ALL THREE. Getting this wrong causes silent extension crashes with no log output.
⚠️ When adding files via drag-drop, Xcode defaults to "Create folder references" (blue folder) which doesn't compile — use "Create groups" (yellow folder).

**Acceptance**:
- `xcodebuild -project apps/ios/Tryflowy.xcodeproj -scheme Tryflowy -destination 'platform=iOS Simulator,name=iPhone 15' build` exits 0
- Same for `-scheme ShareExtension` and `-scheme ShareExtensionMac`
- Main app launches in simulator and renders the WKWebView pointing at `TryflowyAppURL` from Info.plist

**Commit**: `[CYCLE-11] T01: create Xcode project with three targets`

---

### T02 — Add Sign in with Apple to the main app
**File**: `apps/ios/Tryflowy/TryflowyApp.swift`, `apps/ios/Tryflowy/SignInView.swift` (new), `apps/ios/Tryflowy.xcodeproj/` (capability)
**Action**:
1. On main app target only: Signing & Capabilities → **+ Capability → Sign in with Apple**
2. Create `SignInView.swift`:
   ```swift
   import SwiftUI
   import AuthenticationServices

   struct SignInView: View {
     let onSuccess: () -> Void
     @State private var errorMessage: String?

     var body: some View {
       VStack(spacing: 24) {
         Image(systemName: "tray.fill").font(.system(size: 64))
         Text("Tryflowy").font(.largeTitle).bold()
         Text("Your AI-powered inbox").foregroundStyle(.secondary)
         SignInWithAppleButton(.signIn,
           onRequest: { req in req.requestedScopes = [.email] },
           onCompletion: handle)
           .frame(height: 50).padding(.horizontal, 40)
         if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.caption) }
       }
     }

     private func handle(_ result: Result<ASAuthorization, Error>) {
       switch result {
       case .success(let auth):
         guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
               let tokenData = cred.identityToken,
               let identityToken = String(data: tokenData, encoding: .utf8) else {
           errorMessage = "Missing identity token"; return
         }
         Task {
           do {
             let pbToken = try await AuthClient.exchangeApple(identityToken: identityToken, email: cred.email)
             KeychainStore.write("pb_token", value: pbToken)
             await MainActor.run { onSuccess() }
           } catch {
             await MainActor.run { errorMessage = "Sign-in failed: \(error.localizedDescription)" }
           }
         }
       case .failure(let e):
         errorMessage = e.localizedDescription
       }
     }
   }
   ```
3. Update `TryflowyApp.swift` to show `SignInView` when `KeychainStore.read("pb_token") == nil`, else the WKWebView.

⚠️ `cred.email` is **only populated on the very first sign-in** per Apple ID. On subsequent sign-ins it is nil. The server must persist the email on first callback — never rely on it being present on repeat logins.

**Acceptance**:
- Fresh simulator install shows Sign In with Apple button
- Tapping it launches the native Apple sheet
- Successful auth calls `AuthClient.exchangeApple` and transitions to the web view
- Simulator Safari share sheet shows the extension after sign-in

**Commit**: `[CYCLE-11] T02: add Sign in with Apple UI`

---

### T03 — Server-side Apple identity token validation + PB token exchange
**File**: `apps/web/app/api/auth/apple/route.ts` (new), `apps/web/lib/apple-auth.ts` (new), `apps/web/package.json`, `.env.example`, `apps/ios/Shared/AuthClient.swift` (new, all three targets)
**Action**:
1. Install: `npm --workspace apps/web install jose@^5.x`
2. `apps/web/lib/apple-auth.ts`:
   - Export `verifyAppleIdentityToken(token: string): Promise<{ sub: string; email?: string }>`
   - Fetch JWKS from `https://appleid.apple.com/auth/keys` (cache 1 hour in-memory)
   - Use `jose.jwtVerify` with audience = `app.tryflowy.app`, issuer = `https://appleid.apple.com`
   - Throw `{ code: 'INVALID_APPLE_TOKEN' }` on any failure
3. `apps/web/app/api/auth/apple/route.ts` — `POST` handler:
   - Body: `{ identity_token: string, email?: string }` (email only present first time)
   - Call `verifyAppleIdentityToken` → get `sub` (stable Apple user ID) and optional `email`
   - Connect to PocketBase as admin (`pb.admins.authWithPassword` using `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`)
   - Derive stable password: `hmac-sha256(SIWA_PASSWORD_SECRET, sub)` — deterministic per Apple user
   - `try` to find existing user by `apple_sub = sub`. If not found and email provided, create: `pb.collection('users').create({ email, password: hmac, passwordConfirm: hmac, apple_sub: sub, verified: true })`
   - If existing, rotate their password to the hmac (handles case where secret is rotated)
   - Call `pb.collection('users').authWithPassword(email, hmac)` → returns `{ token, record }`
   - Return `{ data: { token } }` with status 200
   - Errors: 401 `INVALID_APPLE_TOKEN`, 500 `USER_CREATE_FAILED`, 400 `EMAIL_REQUIRED_FIRST_LOGIN` (when new user has no email)
4. PocketBase schema migration `pb/pb_migrations/N_add_apple_sub.js` — add `apple_sub` unique text field to `users` collection
5. `.env.example`: add `SIWA_PASSWORD_SECRET=changeme_32chars_min`
6. `apps/ios/Shared/AuthClient.swift` (target membership: all three):
   ```swift
   enum AuthError: Error { case badStatus(Int, String?) }

   struct AuthClient {
     static func exchangeApple(identityToken: String, email: String?) async throws -> String {
       let url = URL(string: "\(appURL)/api/auth/apple")!
       var req = URLRequest(url: url)
       req.httpMethod = "POST"
       req.setValue("application/json", forHTTPHeaderField: "Content-Type")
       var body: [String: String] = ["identity_token": identityToken]
       if let email { body["email"] = email }
       req.httpBody = try JSONSerialization.data(withJSONObject: body)
       let (data, resp) = try await URLSession.shared.data(for: req)
       guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
         throw AuthError.badStatus((resp as? HTTPURLResponse)?.statusCode ?? -1, String(data: data, encoding: .utf8))
       }
       struct R: Decodable { struct D: Decodable { let token: String }; let data: D }
       return try JSONDecoder().decode(R.self, from: data).data.token
     }
   }
   ```
7. Unit tests `tests/unit/apple-auth.test.ts`:
   - Valid mock token → returns `{ sub, email }`
   - Tampered signature → throws `INVALID_APPLE_TOKEN`
   - Wrong audience → throws `INVALID_APPLE_TOKEN`
   - Expired token → throws `INVALID_APPLE_TOKEN`

⚠️ Apple identity tokens are short-lived (~10 min). The exchange MUST happen on the device right after SIWA completes, not stored and reused.
⚠️ The `sub` claim is a stable, opaque per-app ID — never the Apple user's real Apple ID. Store it, log it, treat it as the durable identifier.
⚠️ `SIWA_PASSWORD_SECRET` leakage = account takeover risk. Treat as production secret. Rotate if exposed (re-derivation happens automatically next login).

**Acceptance**:
- `tests/unit/apple-auth.test.ts` all pass
- First SIWA from iOS → user created in PocketBase with `apple_sub`, email populated, auth token returned
- Second SIWA from same device → same user, no duplicate row
- Token returned is a valid PB auth token — `GET /api/items` with `Authorization: Bearer <token>` returns 200

**Commit**: `[CYCLE-11] T03: server-side Apple token exchange with PocketBase`

---

### T04 — Universal Links setup
**File**: `apps/web/app/.well-known/apple-app-site-association/route.ts` (new), `apps/ios/Tryflowy/TryflowyApp.swift`
**Action**:
1. Create route that serves the AASA JSON with `Content-Type: application/json` (no `.json` extension in the path):
   ```ts
   export async function GET() {
     return Response.json({
       applinks: {
         apps: [],
         details: [{
           appID: "<TEAM_ID>.app.tryflowy.app",
           paths: ["/item/*", "/chat", "/inbox", "/settings"]
         }]
       }
     }, { headers: { "Content-Type": "application/json" } });
   }
   ```
   Replace `<TEAM_ID>` with actual Apple Team ID (from Developer portal → Membership).
2. Verify served correctly: `curl -I https://tryflowy.app/.well-known/apple-app-site-association` returns `Content-Type: application/json` and 200
3. In `TryflowyApp.swift`, add `.onOpenURL { url in ... }` that navigates the WKWebView to `url.path` + query params:
   ```swift
   WebView(url: appURL)
     .onOpenURL { url in
       guard url.host == "tryflowy.app" else { return }
       webViewModel.navigate(to: url)
     }
   ```
4. Ensure the WKWebView model exposes a `navigate(to: URL)` method that loads the new URL

⚠️ iOS aggressively caches AASA — first install fetches it, subsequent installs may use stale cache. For testing: delete the app, reboot simulator/device, reinstall. For production: AASA changes take up to 24h to propagate via Apple's CDN.
⚠️ The path `.well-known/apple-app-site-association` must have NO file extension. Next.js route handlers naturally serve this correctly; a static file in `public/` would get an extension.

**Acceptance**:
- `curl -I https://tryflowy.app/.well-known/apple-app-site-association` → 200, `Content-Type: application/json`
- Paste `https://tryflowy.app/item/abc123` into Messages app on simulator, tap it → Tryflowy opens directly (not Safari) and renders that route
- `/login` path is NOT in the handler list → pasting a login URL still opens in Safari (sanity check)

**Commit**: `[CYCLE-11] T04: universal links via AASA`

---

### T05 — Privacy manifest + App Transport Security
**File**: `apps/ios/Tryflowy/PrivacyInfo.xcprivacy` (new), `apps/ios/ShareExtension/PrivacyInfo.xcprivacy` (new), `apps/ios/ShareExtensionMac/PrivacyInfo.xcprivacy` (new)
**Action**:
iOS 17+ requires a Privacy Manifest declaring data types collected and required-reason API usage. Create for each target:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserContent</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

Add each file to its corresponding target's membership only.

Verify App Transport Security in all three Info.plist files — do NOT add `NSAllowsArbitraryLoads`. All traffic to `tryflowy.app` is HTTPS so default ATS is fine.

**Acceptance**:
- `xcodebuild archive` completes without privacy-manifest warnings
- Xcode Organizer → Archive → right-click → "Generate Privacy Report" produces a report with no `undeclared_api` entries

**Commit**: `[CYCLE-11] T05: privacy manifests for all three targets`

---

### T06 — App Store Connect record + TestFlight configuration
**File**: none (Apple-side configuration, document in `docs/testflight-setup.md`)
**Action**:
1. appstoreconnect.apple.com → My Apps → + → New App
   - Platforms: iOS, macOS
   - Name: `Tryflowy` (check availability — may need `Tryflowy - AI Inbox` if taken)
   - Primary Language: English (US)
   - Bundle ID: `app.tryflowy.app`
   - SKU: `tryflowy-ios-v1`
2. App Information:
   - Category: Productivity
   - Content Rights: Does not contain third-party content
3. App Privacy → fill in to match `PrivacyInfo.xcprivacy`:
   - Email Address — linked, for app functionality, not used for tracking
   - User Content (photos shared to app) — linked, for app functionality, not used for tracking
4. Pricing → Free
5. TestFlight tab:
   - Create internal testing group "Tryflowy Internal" — add yourself
   - Create external testing group "Tryflowy Beta" — don't add testers yet, need approved build first
   - Fill in Beta App Information (what to test, email, demo account if needed)
6. Document the whole process in `docs/testflight-setup.md` so future builds have a checklist

**Acceptance**:
- App Store Connect shows the app record
- Bundle ID matches Xcode project
- Beta App Information is complete (required before first external submission)
- `docs/testflight-setup.md` exists with step-by-step for future re-runs

**Commit**: `[CYCLE-11] T06: App Store Connect record + TestFlight configuration`

---

### T07 — First TestFlight build
**File**: `docs/testflight-setup.md` (update with build steps)
**Action**:
1. In Xcode: select `Tryflowy` scheme, destination `Any iOS Device (arm64)`
2. Product → Archive (takes 2-5 minutes)
3. Organizer opens → select the new archive → **Distribute App** → **App Store Connect** → **Upload**
4. Signing: automatic — Xcode uses the Developer account to generate provisioning profiles for all three targets
5. After upload (5-15 min processing), App Store Connect → TestFlight → Builds → select the new build
6. Add to Internal Testing group → install via TestFlight app on your own device → verify:
   - App opens and shows SIWA screen
   - Sign in with Apple works
   - Share extension appears in Safari's share sheet and successfully POSTs to production `/api/ingest`
   - Universal Link test: send yourself `https://tryflowy.app/item/xxx` via Messages → tap → opens in app
7. Submit for Beta App Review (one-time): TestFlight → External Testing → "Tryflowy Beta" group → Add Build → answer review questions → submit. Approval usually takes 24-48h.
8. Once approved, add external testers via email

⚠️ Apple's Beta App Review is stricter than internal testing — they WILL test the share extension. Seed test data in a demo account (`demo@tryflowy.app`) so reviewers can share-to-app without signing in with their own Apple ID.
⚠️ If Beta Review rejects: fix the issue, bump build number (not version), re-archive, re-upload. Don't argue edge cases — submit a fix.

**Acceptance**:
- Build appears in App Store Connect within 30 min of upload
- Internal tester (you) can install via TestFlight app
- Share extension works end-to-end against production API
- Universal Link opens app from Messages
- Beta App Review status = "Ready to Submit" or "In Review" (full approval tracks into Cycle 12)

**Commit**: `[CYCLE-11] T07: first TestFlight build + internal testing verified`

---

### T08 — Update project documentation
**File**: `DECISIONS.md`, `ROADMAP.md`, `CLAUDE.md`
**Action**:
1. `DECISIONS.md` → add new row under "Key Decisions":
   ```
   ### Sign in with Apple for native auth
   **Chosen**: Sign in with Apple + server-side identity token validation, PocketBase user created with deterministic password
   **Rejected**: PocketBase native OAuth2 Apple provider (requires web redirect flow, poor native UX)
   **Reason**: Native SIWA sheet is one-tap, no browser, no token paste. Server validates identity token directly via JWKS. PB user has a deterministic password (HMAC of sub) so we can call authWithPassword internally to mint tokens.
   **Tradeoff**: Password is derived from a secret — if secret leaks, attacker can mint any user's PB token. Mitigated by treating SIWA_PASSWORD_SECRET as production-critical.
   ```
2. `ROADMAP.md` → add Cycle 11 row and cycle detail section
3. `CLAUDE.md` → under "Local Run Commands" add the iOS dev loop:
   ```bash
   # Open Xcode
   open apps/ios/Tryflowy.xcodeproj

   # Build + run iOS app in simulator from CLI
   xcodebuild -project apps/ios/Tryflowy.xcodeproj \
     -scheme Tryflowy \
     -destination 'platform=iOS Simulator,name=iPhone 15' \
     build
   ```

**Acceptance**:
- `DECISIONS.md` has the SIWA decision documented
- `ROADMAP.md` lists Cycle 11 with link to this file
- `CLAUDE.md` documents the iOS build command

**Commit**: `[CYCLE-11] T08: update DECISIONS, ROADMAP, CLAUDE docs`

---

## Known Limitations (log in BLOCKERS.md if hit)

- **Apple rejects the first TestFlight submission** (common on first-ever app) — usually missing privacy manifest details or a broken share-extension demo. Log the rejection reason, fix, resubmit. Not a cycle blocker — beta review is async.
- **SIWA email hiding**: users can choose to hide their email from the app ("Hide My Email" option). The `email` claim will be a random `*@privaterelay.appleid.com` — fine for our use, still unique per user.
- **Mac Catalyst vs native AppKit**: main app is iOS-only initially; the ShareExtensionMac is a separate AppKit bundle. macOS users can install and use the share extension via its bundle, but there is no macOS main app. Mac Catalyst wrapper deferred to Cycle 12.
- **PocketBase admin credentials on the Next.js server**: `/api/auth/apple` needs admin auth to find/create users. Must set `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD` in Vercel env. Rotate these if the web server is ever compromised.

---

## Cycle Exit Criteria

- [ ] `xcodebuild` succeeds for all three schemes against iOS Simulator and macOS
- [ ] Sign in with Apple works: fresh install → Apple sheet → main app loads with auth
- [ ] Auth token persists across app restarts (read from shared Keychain on launch)
- [ ] Share extension POSTs to `/api/ingest` successfully after SIWA
- [ ] Universal Link `https://tryflowy.app/item/xxx` from Messages opens the app directly
- [ ] `curl -I https://tryflowy.app/.well-known/apple-app-site-association` returns 200 with `Content-Type: application/json`
- [ ] `tests/unit/apple-auth.test.ts` — all cases pass
- [ ] `npx tsc --noEmit` — no errors
- [ ] Privacy manifests present in all three targets, `xcodebuild archive` produces no undeclared-API warnings
- [ ] Build uploaded to App Store Connect, visible in TestFlight
- [ ] Internal TestFlight install works on physical device
- [ ] Beta App Review submitted (approval tracks into Cycle 12)
- [ ] `SIWA_PASSWORD_SECRET` added to `.env.example` and production env
- [ ] `apple_sub` field added to PocketBase `users` collection via migration
- [ ] `DECISIONS.md`, `ROADMAP.md`, `CLAUDE.md` updated

---

## Why this order

T01 blocks everything (no project → can't build). T02-T03 are paired (SIWA without the server side is a dead button). T04 (Universal Links) is independent but cheap, ship it in the same cycle for free coverage. T05 is a gate for TestFlight upload — without privacy manifest, Apple rejects the archive. T06-T07 are the final delivery. T08 cleans up the paper trail so Cycle 12 starts with current docs.
