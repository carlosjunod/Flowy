# Tryflowy iOS / macOS App + Share Extension

## Overview

Three Xcode targets, all sharing the source files under `apps/ios/Shared`:

| Target | Type | Deployment | Role |
|--------|------|-----------|------|
| `Tryflowy` | iOS app | iOS 16+ | WKWebView shell pointing at `TryflowyAppURL` |
| `ShareExtension` | iOS share extension | iOS 16+ | Accepts URL / image / plain-text from share sheet |
| `ShareExtensionMac` | macOS share extension | macOS 13+ | Same behaviour on Mac |

All three must share:

- **App Group**: `group.tryflowy`
- **Keychain Access Group**: `group.tryflowy`
- **Bundle prefix**: `app.tryflowy.*` (example: `app.tryflowy.app`, `app.tryflowy.share`, `app.tryflowy.share.mac`)

## Creating the Xcode project

Open Xcode → **File → New → Project** → "App" → set:

- Product Name: `Tryflowy`
- Team: your Apple Developer account
- Bundle ID: `app.tryflowy.app`
- Interface: SwiftUI
- Language: Swift
- Include Tests: no

After creation:

1. File → New → Target → **Share Extension** — name `ShareExtension`, bundle ID `app.tryflowy.share`
2. File → New → Target → **Share Extension** (pick macOS) — name `ShareExtensionMac`, bundle ID `app.tryflowy.share.mac`
3. For each target, enable **App Groups** capability → check `group.tryflowy`
4. For each target, enable **Keychain Sharing** capability → add `group.tryflowy`
5. Replace the default controller files with the ones checked into this repo (`ShareExtension/ShareViewController.swift`, `ShareExtensionMac/ShareViewControllerMac.swift`, `Tryflowy/TryflowyApp.swift`)
6. Add the shared helpers (`Shared/KeychainStore.swift`, `Shared/IngestClient.swift`) to **all three** target memberships
7. Override each target's `Info.plist` with the copies in this repo (or mirror the keys manually)

## Configuring the app URL

Both Info.plists set `TryflowyAppURL = https://tryflowy.app`. For local development change it to your `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:4000` on an iPhone simulator).

## Token seeding for manual testing

Until a proper in-app login flow exists (out of scope for CYCLE-08), seed the keychain with a test PocketBase token by running this snippet on the main app's first launch (temporary, comment out before shipping):

```swift
#if DEBUG
KeychainStore.write("pb_token", value: "<paste_a_valid_PB_user_token>")
#endif
```

## Acceptance

See `tests/manual/ios-share.md` for the manual test checklist.
