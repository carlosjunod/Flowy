# CYCLE-08 — iOS Share Extension

**Dependencies**: Cycle 01  
**Complexity**: High

---

## Goal
Thin Swift share extension that posts URL/image/text to `/api/ingest` from iOS and macOS share sheet.

---

## Tasks

### T01 — Create Xcode project with share extension target
**File**: `apps/ios/Tryflowy.xcodeproj/`, `apps/ios/ShareExtension/`  
**Action**: Create Xcode project with:
- Main app target (empty, just launches web via WKWebView at `NEXT_PUBLIC_APP_URL`)
- Share Extension target (NSExtension, NSExtensionActivationRule)

Activation rule: accepts `public.url`, `public.image`, `public.plain-text`.  
**Acceptance**: Extension appears in iOS share sheet. Tap launches extension UI.

### T02 — Implement ShareViewController
**File**: `apps/ios/ShareExtension/ShareViewController.swift`  
**Action**: On `viewDidLoad`:
1. Read auth token from shared Keychain group `group.tryflowy`
2. If no token → show "Please log in to Tryflowy first" label + close button
3. Detect input type from `extensionContext.inputItems`
4. For URL: extract URL string → POST `{ type: 'url', raw_url }`
5. For image: convert to JPEG base64 → POST `{ type: 'screenshot', raw_image }`
6. For text: POST `{ type: 'url', raw_url }` if text is URL, else skip
7. On success (201): show "Saved to Tryflowy ✓" for 1.5s → close
8. On failure: show "Failed — tap to retry" with retry button

⚠️ Network call must use URLSession with timeout 10s — not blocking main thread  
⚠️ Token must be read from Keychain, never from UserDefaults  
**Acceptance**: Share URL from Safari → item in PocketBase within 5s.

### T03 — Add macOS share extension target
**File**: `apps/ios/Tryflowy.xcodeproj/` (new target)  
**Action**: Duplicate share extension target for macOS. Same logic. Activation rule: same types.  
**Acceptance**: Extension appears in macOS share sheet in Safari.

### T04 — Manual test checklist
**File**: `tests/manual/ios-share.md`  
**Action**: Document step-by-step manual test:
1. Install on iOS simulator
2. Open Safari → share URL → verify item in PocketBase
3. Open Photos → share screenshot → verify image item in PocketBase
4. Remove token from Keychain → share anything → verify "Please log in" message

**Acceptance**: File exists with all 4 steps documented and marked as tested.

---

## Cycle Exit Criteria

- [ ] Share URL from Safari iOS → item `pending` in PocketBase within 5s
- [ ] Share screenshot from Photos → image item `pending` within 5s
- [ ] No token → "Please log in" message shown
- [ ] Extension closes after success UI
- [ ] Manual test checklist completed and documented
- [ ] No Swift compiler errors

---

