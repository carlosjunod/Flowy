# Manual Test Checklist — iOS / macOS Share Extension

Exit criteria for CYCLE-08. Run each test against the extension installed on a simulator (preferred)
or a real device, with a valid `pb_token` already seeded into the `group.tryflowy` keychain.

## Prerequisites

- [ ] Xcode project is built and app is installed on iOS Simulator (iPhone 15, iOS 17+)
- [ ] `pb_token` exists in shared keychain (`KeychainStore.write("pb_token", value: "<real_token>")`)
- [ ] Web app is running locally at `NEXT_PUBLIC_APP_URL` (or pointed at production)
- [ ] PocketBase admin UI is open so you can verify item creation

## Test 1 — Share URL from Safari (iOS)

- [ ] Open Safari, navigate to `https://vercel.com/blog`
- [ ] Tap the Share button → select "Tryflowy"
- [ ] Extension UI appears showing "Saving to Tryflowy…"
- [ ] Within 5 seconds, UI updates to "Saved to Tryflowy ✓"
- [ ] Extension closes automatically after 1.5s
- [ ] PocketBase admin shows a new `items` row with `type = url`, `status = pending`
- [ ] Worker picks up the job and item transitions to `status = ready` within 30s

## Test 2 — Share screenshot from Photos (iOS)

- [ ] Take a screenshot on the simulator (Cmd+S)
- [ ] Open Photos → tap the screenshot → Share → "Tryflowy"
- [ ] Extension UI shows success banner
- [ ] PocketBase shows new `items` row with `type = screenshot`, `status = pending`
- [ ] Item has `r2_key` populated after worker processes it

## Test 3 — No token in keychain

- [ ] Delete the `pb_token` entry from the keychain
- [ ] Attempt to share any URL
- [ ] Extension shows "Please log in to Tryflowy first" message with Close button
- [ ] Tapping Close dismisses the extension
- [ ] No network call to `/api/ingest` was made (verify with Charles/Proxyman if desired)

## Test 4 — Share URL from Safari (macOS)

- [ ] Open Safari on Mac, navigate to any article
- [ ] File → Share → select "Tryflowy (macOS)"
- [ ] Extension popover shows "Saving…" → "Saved ✓"
- [ ] Item appears in PocketBase

## Status

- [ ] All 4 tests passed on device/simulator on __________ (date)
- [ ] Tester: __________
