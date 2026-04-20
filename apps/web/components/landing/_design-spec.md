# Tryflowy Landing — Design Spec

**Purpose:** This is the contract the implementation phase compiles against. Every visual decision below has a reason; deviations should be documented in the report.

## Aesthetic brief

Silicon Valley startup, elegant, warm. "Close to people" — premium but not cold. References we're triangulating between:

- **Linear** — confidence, sharp typography, restrained motion
- **Raycast** — craft, warm accent color, proud of small details
- **Arc** — playful humanity, not afraid of personality
- **Notion (early)** — approachable without dumbing down

Anti-references: stock-y enterprise SaaS, gradient-soup, AI-chatbot "cyber blue", fintech-slate coldness.

---

## Color palette — decision

### Two options considered

**Option A — Warm Amber (CHOSEN)**
- Base: deep zinc / near-black (`#0a0a0a` existing app bg)
- Surface: elevated zinc (`#121212`, `#1a1a1a`)
- Border: zinc 800/900 (`#27272a`, `#18181b`)
- Text primary: zinc 50 (`#fafafa`) — existing
- Text secondary: zinc 400 (`#a1a1aa`)
- Text muted: zinc 500 (`#71717a`)
- **Accent (CTA + highlights): warm amber `#f5a524`** — reads human, premium, not techy. The only expressive color.
- Accent soft (hover/ring): amber/10, amber/20 (rgba overlays)

**Option B — Indigo Dusk (rejected)**
- Deep indigo base (`#1e1b4b`) + orange CTA. Felt too "podcast app", pulled the brand toward moody-evening rather than Silicon-Valley-bright. Rejected.

### Why A won
Amber reads closer to *people*, not *products*. Linear uses a blue-indigo accent; Raycast uses red; Arc uses a rainbow. Picking amber gives Tryflowy its own identity in that lineage — distinctive without being gimmicky. It also pairs naturally with the existing `#0a0a0a` app background, meaning the landing doesn't fight the product.

### Tailwind class vocabulary
- Background: `bg-neutral-950` (overrideable via existing `body`)
- Surface: `bg-neutral-900/40`, `bg-white/[0.02]`
- Border: `border-white/5`, `border-white/10`
- Text: `text-neutral-50`, `text-neutral-400`, `text-neutral-500`
- Accent: `text-amber-400`, `bg-amber-400`, `hover:bg-amber-300`, `ring-amber-400/40`
- Gradient accent (hero halo only): `from-amber-500/20 via-amber-500/5 to-transparent`

---

## Typography — decision

**Pairing: Instrument Serif (display) + Inter (body)**, both via `next/font/google`.

### Why this pair and not Space Grotesk + Inter?
The skill's "Tech Startup" default is Space Grotesk + DM Sans. Evaluated two directions:

1. **Space Grotesk + Inter** (safe): modern, geometric, familiar. Would read as "another AI tool."
2. **Instrument Serif + Inter** (chosen): a thin high-contrast serif for display paired with a workhorse sans for body creates the "warm + elegant" tension the brief asks for. Linear-level clarity for body, Arc-level personality for headlines. Instrument Serif specifically has open, readable letterforms at very large sizes — ideal for an oversized hero word.

### Type scale (fluid, mobile-first)

| Role | Class | Size (mobile → desktop) |
|------|-------|--------------------------|
| Hero display | `text-5xl sm:text-6xl md:text-7xl lg:text-8xl` | 48 → 96 px |
| Section H2 | `text-3xl sm:text-4xl md:text-5xl` | 30 → 48 px |
| Card title | `text-lg sm:text-xl` | 18 → 20 px |
| Body | `text-base` | 16 px |
| Small / eyebrow | `text-xs tracking-wider uppercase` | 12 px |

Line height: `leading-tight` for display, `leading-relaxed` for body paragraphs.

### Assignment
- Use **Instrument Serif** on: hero headline, section H2s, one italicized word in the hero for emphasis (e.g. *anything*).
- Use **Inter** everywhere else, including buttons.

### next/font setup (binding)
```ts
import { Inter, Instrument_Serif } from 'next/font/google';
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
export const serif = Instrument_Serif({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-serif', display: 'swap' });
```
Applied at root via `className={`${inter.variable} ${serif.variable}`}` on `<html>` and exposed in Tailwind as `font-sans` / `font-serif`.

---

## Spacing rhythm

8-point base grid. Tailwind defaults already match this.

- Section vertical padding: `py-20 sm:py-28 md:py-32`
- Max content width: `max-w-6xl mx-auto` for most; `max-w-4xl` for hero & FAQ
- Horizontal inset: `px-6 sm:px-8`
- Vertical rhythm inside a section: headline → 2rem gap → content; card → 1rem internal padding mobile, 1.5rem desktop.

---

## Hero direction — decision

### Three directions considered

**1. Big-type minimal (CHOSEN)**
Centered oversized headline with one italicized serif word ("everything"/"anything"), short subhead beneath, two CTAs side-by-side (primary amber, secondary ghost). Soft amber radial halo behind the word. Below the fold: a single horizontal "share-to-chat" rail demonstrating the flow.

**2. Split hero (rejected)**
Headline left, faux app preview right. Problem: at 375px the preview either wraps below (defeating the split) or shrinks into an unreadable postage stamp. Subhead competes with the visual for attention.

**3. Bento hero (rejected)**
Headline + three small "what it ingests" cards above the fold. Too busy. Risks making the page feel like a feature matrix before the visitor even reads the promise.

### Why #1 wins per the decision rule
Reads clearest above-the-fold at 375px without hiding the subhead. Every element has one job. Matches the Linear/Raycast references. Degrades beautifully on mobile: the halo collapses to a subtle amber glow behind the word, no layout breakage.

### Hero composition spec
```
┌─────────────────────────────────────┐
│  [Tryflowy logo]        [Sign in]   │  nav, fixed, ~72px
│                                     │
│                                     │  py-20+ breathing room
│    Save  everything.                │  display, serif italic
│    Find  anything.                  │  "everything" has serif-italic accent
│                                     │
│    Share anything from your phone   │  subhead, Inter, 2-3 lines
│    or Mac. Tryflowy's AI organizes  │  max-w-prose
│    it instantly…                    │
│                                     │
│   [Get started free]  [See a demo]  │  amber + ghost
│                                     │
│   ───  share → organize → ask  ───  │  eyebrow rail, subtle
│                                     │
└─────────────────────────────────────┘
```
Radial amber halo sits behind the serif word at `blur-3xl`, `opacity-40`, absolutely positioned, `pointer-events-none`.

---

## Motion rules

**Principle: subtle, intentional, respect reduced-motion.** No parallax, no autoplay video, no confetti.

- Micro-interactions: `transition-colors duration-200` on interactive elements
- Scroll reveal: one fade-up (`opacity-0 translate-y-4` → `opacity-100 translate-y-0`) per section header, triggered by IntersectionObserver. Duration 500ms, easing `ease-out`. Fires once.
- Button hover: bg lightens one step (amber-400 → amber-300), no scale
- Link hover: `hover:text-neutral-50` from `text-neutral-400`
- Card hover: `hover:border-white/10` from `border-white/5`, no transform
- `prefers-reduced-motion: reduce` → all transitions become `duration-0`, scroll reveals set to visible immediately

---

## Iconography

- **SVG only** (inline or Lucide-like hand-written). No emojis, no icon font library.
- Consistent 20–24px viewBox, `stroke-width=1.5` for outlines, `text-amber-400` for accented, `text-neutral-400` for neutral.
- Home-rolled inline SVGs to avoid any npm dep. 4 icons needed: classify (layers), extract (text-lines), remember (link), retrieve (sparkle-chat).

---

## Component anatomy (visual rhythm across sections)

| Section | Layout | Key visual |
|---------|--------|-----------|
| Hero | Centered, max-w-4xl | Oversized serif word + amber halo |
| Features (pillars) | 3-col grid (1-col mobile) | Simple cards, border + gentle hover |
| AI capabilities | 2x2 grid (1-col mobile) | Icon top-left, title, description |
| How it works | 3-col with arrows on desktop, vertical stack mobile | Numbered dots in amber |
| Get started | 3-col cards (1-col mobile) | Each card has distinct CTA |
| FAQ | Accordion, single column, max-w-3xl | Native `<details>` styled |
| Footer | 4-col nav mobile-stack | Muted, small type |

---

## Accessibility invariants

- Contrast: amber-400 on neutral-950 is 9.8:1 (AAA). Neutral-400 on neutral-950 is 7.5:1 (AAA).
- One `<h1>` — the hero headline.
- `<nav>` has `aria-label`, `<footer>` has `aria-labelledby`.
- CTAs use `<a>` for navigations, `<button>` for actions. All get visible focus rings `focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950`.
- FAQ accordion uses native `<details><summary>` — keyboard accessible by default.
- Images (none on v1) would carry alt text; decorative shapes use `aria-hidden`.

---

## Scope constraints surfaced during spec

- **Middleware gate:** the app's `apps/web/middleware.ts` currently redirects unauthenticated visitors on `/` to `/login`. Out of landing-page scope-lock. Report must flag this: to make `/` publicly reachable in production, add `'/'` (and likely `'/_next'` asset allowance is already there) to `PUBLIC_PATHS`.
- **No new dependencies.** Everything must work with what `package.json` already ships (Next 15, React 18, Tailwind 3). Icons hand-rolled. Fonts via `next/font/google` (already bundled with Next 15).

---

## Pre-flight checklist (enforced in implementation)

- [x] No emoji icons
- [x] `cursor-pointer` on all interactive elements
- [x] Hover transitions 150–300ms
- [x] Focus-visible rings on all focusable
- [x] Responsive at 375 / 768 / 1440
- [x] `prefers-reduced-motion` respected
- [x] Alt/aria on every non-decorative visual
- [x] One `<h1>`
