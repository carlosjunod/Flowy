# Tryflowy Landing Page — Autonomous Build Report

**Date:** 2026-04-20 (overnight build)
**Branch:** `worktree-stateful-tinkering-wolf`
**Mode:** autonomous, no checkpoints

---

## Phase status

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Copy (`content-marketing:content-marketer`) | ✅ | Saved to `apps/web/components/landing/_copy.md` |
| 2 — Design spec (`ui-ux-pro-max`) | ✅ | Saved to `apps/web/components/landing/_design-spec.md` |
| 3 — Implementation | ✅ | 9 new components + page.tsx rewrite + additive tailwind/css |
| 4 — Verify + report | ✅ | Build passed, 6 screenshots captured, report written |

Build result: `npm --workspace apps/web run build` → ✓ succeeded first try, 4.6s compile, 10/10 static pages generated. Root `/` is listed as `782 B / 105 kB First Load JS`.

Dev server: started on port 4000, `ready in 1.4s`, zero app-level console errors. The only browser console entry was a `favicon.ico 404` — site-wide, not introduced by this work.

---

## Decisions made (rationale + alternatives considered)

### Copy (Phase 1)

**Voice pick:** warm, "Linear + Raycast + Arc" blend. No jargon. Short sentences. The agent offered 3 headline options; winner was `Save everything. Find anything.` — two concrete verbs, a mirrored rhythm, zero buzzword residue. The alternatives ("Your second brain, no setup", "Stop losing things you saved") were both plausible but either leaned on a tired metaphor or a negative frame. Headline pick follows the "lowest jargon density" rule from the brief.

**Honesty over hedging:** FAQ answers include `[CONFIRM]` markers on the two items with business decisions still pending (pricing tiers, Android roadmap). I surfaced them to the user rather than inventing. The copy as-shipped reads honest defaults ("Free during beta", "iOS + macOS today, Android later in 2026") that the user can sign off on or adjust.

### Design (Phase 2)

**Palette: Warm Amber over Indigo Dusk.**
- Warm Amber: deep zinc base (reuses existing `#0a0a0a` app bg) + amber-400 accent (`#fbbf24`-ish). Reads premium + human. Amber is the only expressive color.
- Indigo Dusk: considered but rejected — felt more "moody podcast app" than "bright Silicon Valley".
- Tiebreaker rule from brief: "err toward warmth if tied." Amber won on both warmth and approachability; indigo never had a shot.

**Typography: Instrument Serif (display, italic) + Inter (body), both `next/font/google`.**
- Tech Startup default (Space Grotesk + DM Sans) would have read "another AI tool."
- Instrument Serif gives the hero its distinct voice — a thin, high-contrast, italicizable serif for "everything" / "anything" creates the warm/elegant tension the brief asked for.
- Inter is a workhorse for body and CTAs — Linear-level clarity, zero risk.

**Hero direction: Big-type minimal (chosen of 3).**
- Evaluated: (A) big-type centered, (B) split hero with device preview, (C) bento grid.
- Tiebreaker: "reads clearest above-the-fold at 375px without hiding the subhead." Split fails at 375 (preview competes or wraps). Bento fails — too busy. Big-type wins cleanly.

### Implementation (Phase 3)

- **Fonts in `page.tsx` not `layout.tsx`.** Scope lock forbids `layout.tsx` edits. Instead I load `next/font/google` inside `page.tsx` and attach the CSS variables to the top-level `.landing-scope` div. Variables cascade, so every child component reads `var(--font-serif)` without prop drilling. This is the right level of isolation anyway — the landing page's typography is landing-only and won't leak into `/chat` or `/inbox`.
- **Native `<details>` for FAQ instead of an accordion library.** Zero new deps, keyboard-accessible by default, respects `prefers-reduced-motion` automatically. Custom styling via `group-open` Tailwind variants.
- **Inline hand-rolled SVG icons (`components/landing/Icons.tsx`).** Consistent 24×24 viewBox, stroke 1.5. No lucide/heroicons npm install, staying within scope lock.
- **Reveal-on-scroll via a small client component (`Reveal.tsx`).** IntersectionObserver, one-shot (unobserves after firing), respects `prefers-reduced-motion`. No parallax, no transform tricks beyond a 12px translate-Y.
- **Data-placeholder hooks** on all three activation CTAs (`data-placeholder="ios-app" | "web-signup" | "shortcut"`) so a future engineer can grep and wire them.
- **Amber halo behind the hero word** uses two absolute-positioned blurred rounds. `pointer-events-none`, `-z-10`, `aria-hidden`. Degrades on mobile into a gentler glow because the `w-[520px]` clips at the viewport edge.

### Verification (Phase 4)

- Used Playwright to set a dummy `pb_auth=dev-bypass` cookie before navigating to `/`, because the existing `middleware.ts` redirects anonymous visitors to `/login`. This is a screenshot-only workaround — see "Known gaps" below.
- IntersectionObserver `.reveal` class requires scroll intersection to fire. Full-page screenshots were initially blank below the hero because elements hadn't entered the viewport. Fix: before each full-page capture I JS-toggled `.is-visible` on all `.reveal` nodes so the page shows its final composed state in screenshots.
- Breakpoints captured: 375, 768, 1440. Hero-only + full-page at each. Six PNGs total.

---

## Files created or modified

### Created
| File | Purpose |
|------|---------|
| `apps/web/components/landing/_copy.md` | Source-of-truth copy doc (Phase 1) |
| `apps/web/components/landing/_design-spec.md` | Design contract (Phase 2) |
| `apps/web/components/landing/Reveal.tsx` | Scroll-reveal client wrapper with reduced-motion support |
| `apps/web/components/landing/Icons.tsx` | 12 inline SVG icons (classify, extract, remember, retrieve, share, sparkles, chat, apple, globe, bolt, arrow) |
| `apps/web/components/landing/Nav.tsx` | Sticky top nav with logo + section links + sign-in |
| `apps/web/components/landing/Hero.tsx` | Hero with amber halo + oversized serif-italic headline |
| `apps/web/components/landing/Features.tsx` | 3-pillar grid ("What it does") |
| `apps/web/components/landing/AICapabilities.tsx` | 2×2 capabilities grid ("What the AI does") |
| `apps/web/components/landing/HowItWorks.tsx` | 3-step numbered ol ("How it works") |
| `apps/web/components/landing/GetStarted.tsx` | 3-card activation paths with featured iOS card |
| `apps/web/components/landing/FAQ.tsx` | Native `<details>` accordion with 5 entries |
| `apps/web/components/landing/Footer.tsx` | 4-column nav + copyright |
| `apps/web/.landing-screenshots/mobile-375-hero.png` | 375px hero viewport |
| `apps/web/.landing-screenshots/mobile-375-fullpage.png` | 375px full page |
| `apps/web/.landing-screenshots/tablet-768-hero.png` | 768px hero viewport |
| `apps/web/.landing-screenshots/tablet-768-fullpage.png` | 768px full page |
| `apps/web/.landing-screenshots/desktop-1440-hero.png` | 1440px hero viewport |
| `apps/web/.landing-screenshots/desktop-1440-fullpage.png` | 1440px full page |
| `LANDING_PAGE_REPORT.md` | This report |

### Modified (within scope lock)
| File | Change |
|------|--------|
| `apps/web/app/page.tsx` | Replaced `redirect('/chat')` with the full landing composition + next/font loaders + metadata/OpenGraph |
| `apps/web/app/globals.css` | **Additive only** — added `.landing-scope` font scoping, `.reveal` / `.reveal.is-visible` animation classes, and `prefers-reduced-motion` overrides |
| `apps/web/tailwind.config.ts` | **Additive only** — added `fontFamily.sans` / `fontFamily.serif` (wired to `var(--font-*)` set by `next/font`), plus a `fade-up` keyframe + `animate-fade-up` utility (currently unused by runtime code but available for future motion) |

No dependencies installed. No other files touched. Scope lock respected.

---

## Screenshots

| Breakpoint | Hero (viewport) | Full page |
|-----------|-----------------|-----------|
| 375 × 812 (mobile) | `apps/web/.landing-screenshots/mobile-375-hero.png` | `apps/web/.landing-screenshots/mobile-375-fullpage.png` |
| 768 × 1024 (tablet) | `apps/web/.landing-screenshots/tablet-768-hero.png` | `apps/web/.landing-screenshots/tablet-768-fullpage.png` |
| 1440 × 900 (desktop) | `apps/web/.landing-screenshots/desktop-1440-hero.png` | `apps/web/.landing-screenshots/desktop-1440-fullpage.png` |

All six render without console errors and respect the responsive contract.

---

## Known gaps / things to double-check in the morning

1. **Middleware blocks anonymous `/` access — HIGH PRIORITY.** The existing `apps/web/middleware.ts` currently redirects every unauthenticated visitor on `/` (and any non-public path) to `/login`. The landing page renders correctly *once you're past the middleware*, but in production no anonymous visitor will ever see it. The fix is a single-line addition: add `'/'` to `PUBLIC_PATHS` in `apps/web/middleware.ts:3`. I did **not** make this change because `middleware.ts` is outside the scope lock. The screenshots above were produced by bypassing middleware via a Playwright cookie injection, so this gap is invisible in the artifacts but fatal in prod.

2. **FAQ answers with `[CONFIRM]` markers.** Two FAQ answers (pricing, platforms) contain reasonable defaults but need founder sign-off. They're not marked in the final UI — the markers only live in `_copy.md` for traceability. The shipped answers say: "Free during beta... Early users get grandfathered pricing." and "iOS and macOS share sheet. Android is coming later in 2026."

3. **Activation path CTAs are placeholders.** Three CTAs link to `#` with `data-placeholder="ios-app" | "web-signup" | "shortcut"`. The web-account card actually points to `/login` (useful since the auth flow is live), but the iOS App Store link and iOS Shortcut install URL are stubs. Greppable with `grep -r 'data-placeholder' apps/web/components/landing/`.

4. **Favicon 404 in browser console.** Unrelated to this work — site-wide — `favicon.ico` is missing from `apps/web/public`. Flag for a separate tiny PR.

5. **`animate-fade-up` keyframe is registered but unused.** I added it to `tailwind.config.ts` (additive) while planning and ended up using the scroll-reveal approach via `.reveal` CSS classes instead. Left the keyframe in because it's zero-cost at runtime (Tailwind purges unused) and might be useful for future micro-animations. Feel free to drop it.

6. **Hero halo gradient is a bit loud on 1440 desktop.** It looks great, but if it feels too "brand-heavy" for the minimal SV aesthetic you can drop the `-z-10 h-[520px] w-[520px]` second halo in `Hero.tsx` to just one subtle glow.

7. **Tailwind keyframes block added.** In `tailwind.config.ts`, I added `keyframes.fade-up` + `animation.fade-up`. Unused by runtime code but purely additive — safe to keep or remove.

---

## Scope requests I would have made but didn't

- I would have liked to add **a very small `<link rel="icon">` with an inline SVG** to make the browser tab icon show the amber "t" logo. That requires editing `layout.tsx`, which is outside scope. Noted for a follow-up PR.
- I would have liked to add a **tiny amber focus-visible ring in globals.css as a default** (e.g., `*:focus-visible { outline-color: #fbbf24; }`), but I kept focus styling per-component instead to stay purely additive and non-invasive.
- The **`/login` page** still uses the pre-landing dark styling. It's consistent enough with the landing aesthetic that I didn't feel any urgency, but a future pass could align the type scale. Out of scope.

---

## Final verification checklist

- [x] `npm --workspace apps/web run build` passes
- [x] Page renders at `localhost:4000/` (verified via cookie-bypass due to middleware)
- [x] Zero app-level console errors (only unrelated favicon 404)
- [x] All 7 sections populated with real agent-written copy
- [x] Screenshots saved for 375 / 768 / 1440
- [x] `LANDING_PAGE_REPORT.md` at repo root
- [x] No new npm packages installed
- [x] No files modified outside scope lock
- [x] No `// TODO` or lorem ipsum in shipped code
- [x] One `<h1>` per page (hero)
- [x] Focus-visible states on all interactive elements
- [x] `prefers-reduced-motion` respected
- [x] Responsive at 3 breakpoints without horizontal scroll
