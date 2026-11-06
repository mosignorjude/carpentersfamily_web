# Public Flow: Header, Hero, Ribbon & Mobile Menu Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the public landing page header, navigation items, ribbon countdown, hero call-to-actions, and mobile slide-over drawer, and ensure site-wide consistency for the circular white logo emblem and social icon buttons.

**Architecture:**
1. **Site-wide White Circle Emblem:** Update `ClubLogo` to render the emblem in a circular white badge (`rounded-full bg-white border border-linen shadow-2xs`), ensuring consistent presentation across Landing Header, Mobile Drawer, Landing Footer, Box Office storefront (`/tickets`), Member Dashboard (`/portal`), App Shell sidebar, and Staff Nav.
2. **Site-wide Social Icon Buttons:** Refactor `LandingSocialLinks` so social buttons render purely as their logos (crisp, accessible TikTok and Instagram SVGs in circular badges) anywhere they appear on the site (desktop header, mobile drawer, footer).
3. **Landing Header Streamlining:** Remove "Asaba, Delta" from under "Carpenters Family" in the landing header. Move "Box Office / Tickets" into the primary navigation list (`<ul>`) as the terminal item. Remove the standalone Box Office button from the header right.
4. **Ribbon Live Countdown:** Replace static "{season} Season" in `LandingRibbon` with a live countdown timer targeting the next confirmed ticketed event (`startsAt`), safely hydrated with client ticks.
5. **Hero CTA Evolution:** Replace "Join the Family" with an "Explore the Family" smooth-scroll anchor to `#vision` (Vision, Mission, Values), and remove the "Explore Events" button.
6. **Mobile Drawer Streamlining:** Retain only the "Partner With Us" action button in the mobile drawer, placing the club's socials directly beneath it, and add the white circle emblem beside the drawer's brand title.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Node.js test runner (`node:test`, `node:assert/strict`), Biome.

**Spec:** [`docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md`](file:///c:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md)

## Global Constraints

- **STRICT CSP COMPLIANCE:** Zero inline `style="..."` attributes on rendered HTML. Never use `next/image` in landing components; always use standard `<img>` with Tailwind classes and `{/* biome-ignore lint/performance/noImgElement: ... */}`.
- **ZERO TOLERANCE FOR 60% / "60/40" PROFIT SHARING:** No public copy or comments may reference 60% or 60/40 profit sharing.
- **OFF-LIMITS FILES:** Never stage, edit, or revert `.env.example`, `src/lib/email/config.ts`, or `tests/email-template.test.mjs`.
- **44PX MINIMUM TOUCH TARGETS:** All interactive buttons and links must maintain a 44x44px accessible touch floor on mobile screens.
- **WINDOWS POWERSHELL QUOTING:** Always quote paths containing parentheses (e.g. `'(member)'`, `'(staff)'`).
- **ACCESSIBILITY:** All icon-only buttons must have descriptive `aria-label` attributes and SVG icons must have `aria-hidden="true"`.

## Review Focus

1. **Site-wide Logo Presentation:** `ClubLogo` must render cleanly in a circular white emblem without distorting image aspect ratios across all sizes (`sm`, `md`, `lg`, `xl`).
2. **Hydration Mismatch on Countdown:** A countdown timer calculated with `Date.now()` during SSR can differ from client render time. The countdown component must mount gracefully without SSR mismatch.
3. **Missing Next Event Graceful Fallback:** When `ticketedEvents` is empty or no upcoming events exist, the ribbon must gracefully omit the countdown badge without runtime exceptions.
4. **Touch Targets for Icon-Only Buttons:** Circular TikTok and Instagram logo buttons must maintain an accessible 44px tap target area despite compact icon presentation.
5. **Keyboard Accessibility on Mobile Drawer:** The mobile drawer must remain dismissible via Escape key, scrim click, and internal link clicks.

---

### Task 1: Site-Wide Circular White Emblem & SVG Social Icon Buttons

**Files:**
- Modify: `src/components/club-logo.tsx`
- Modify: `src/components/landing/landing-social-links.tsx`
- Modify: `src/components/landing/landing-nav.tsx`
- Modify: `src/components/tickets/tickets-storefront-view.tsx:95-100`
- Modify: `src/app/globals.css:3992-3998, 12444-12450`
- Test: `tests/landing-nav-header-refinements.test.mjs`

**Interfaces:**
- `ClubLogo`: Renders mark inside `rounded-full bg-white border border-[#E5DDD3] shadow-2xs` container.
- `LandingSocialLinks`: Renders TikTok and Instagram circular icon buttons using accessible SVGs across header, mobile drawer, and footer.
- `LandingNav`: Displays `ClubLogo` and "Carpenters Family" without "Asaba, Delta State" subtext.

- [ ] **Step 1: Write failing unit test for site-wide logo emblem and social icon SVGs**

Create `tests/landing-nav-header-refinements.test.mjs`:
```javascript
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("club-logo component wraps the brand mark in a circular white emblem", () => {
  const content = fs.readFileSync("src/components/club-logo.tsx", "utf8");
  assert.match(content, /rounded-full\s+bg-white/);
  assert.match(content, /border/);
});

test("landing-social-links renders TikTok and Instagram SVG logos without text pills", () => {
  const content = fs.readFileSync("src/components/landing/landing-social-links.tsx", "utf8");
  assert.match(content, /<svg[^>]*>[\s\S]*?<\/svg>/i);
  assert.match(content, /TikTok/i);
  assert.match(content, /Instagram/i);
  assert.match(content, /aria-label=/);
  // Pure icon buttons without text pill labels
  assert.doesNotMatch(content, /<span>\{social\.network\}<\/span>/);
});

test("landing-nav header displays Carpenters Family without Asaba Delta subtext", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /Carpenters Family/);
  assert.doesNotMatch(nav, /Asaba,\s*Delta\s*State/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landing-nav-header-refinements.test.mjs`
Expected: FAIL (emblem in club-logo missing, social-links still has `<span>{social.network}</span>`, Asaba Delta still present).

- [ ] **Step 3: Update `club-logo.tsx`, `landing-social-links.tsx`, `landing-nav.tsx`, and `globals.css`**

1. In `src/components/club-logo.tsx`:
   - Wrap the `<img>` in a `rounded-full bg-white border border-[#E5DDD3] flex items-center justify-center shrink-0 shadow-2xs` container sized to fit the logo gracefully (`p-1` / `h-10 w-10 sm:h-11 sm:w-11` for `sm`, `p-2` for `md`, etc.).
2. In `src/components/landing/landing-social-links.tsx`:
   - Define crisp inline SVGs for TikTok and Instagram.
   - Render circular buttons (`h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center`) with `min-h-[44px] min-w-[44px]` touch target floors.
   - Do not render text labels inside the button—buttons are purely their SVG logos.
3. In `src/components/landing/landing-nav.tsx`:
   - Remove `<span className="block text-[11px] text-umber">Asaba, Delta State</span>`.
4. In `src/components/tickets/tickets-storefront-view.tsx`:
   - Change `rounded-xl` wrapper to `rounded-full` to align with the circular white emblem.
5. In `src/app/globals.css`:
   - Update `.app-brand-logo` and `.staff-brand-mark` to use circular white emblem styling (`border-radius: 50%; background-color: #fff; padding: 0.35rem;`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landing-nav-header-refinements.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add tests/landing-nav-header-refinements.test.mjs src/components/club-logo.tsx src/components/landing/landing-social-links.tsx src/components/landing/landing-nav.tsx src/components/tickets/tickets-storefront-view.tsx src/app/globals.css
git commit -m "feat(branding): establish site-wide circular white logo emblem and SVG social icon buttons"
```

---

### Task 2: Navigation Restructuring & Mobile Drawer Overhaul

**Files:**
- Modify: `src/components/landing/landing-nav.tsx`
- Test: `tests/landing-nav-header-refinements.test.mjs`

**Interfaces:**
- Desktop Navigation: `<ul>` contains About, What We Do, Events & Lifestyle, Stewardship, Membership, and **Box Office / Tickets** (`/tickets`) as the last item.
- Header Right: Member Portal button + TikTok & Instagram social buttons (Box Office button removed).
- Mobile Drawer:
  - Top bar has white circle logo + "Carpenters Family" + close button.
  - Links list ends with "Box Office / Tickets".
  - Action buttons: Only "Partner With Us" button remains.
  - Directly beneath "Partner With Us": "Follow Us" social icons (`LandingSocialLinks`).

- [ ] **Step 1: Write failing unit tests for navigation and mobile drawer structure**

Append to `tests/landing-nav-header-refinements.test.mjs`:
```javascript
test("landing navigation list has Box Office / Tickets as the last item", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /<ul[^>]*hidden lg:flex[\s\S]*?href="#membership"[\s\S]*?href="\/tickets"[\s\S]*?<\/ul>/);
});

test("header right removes standalone Box Office button", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  const rightSectionMatch = nav.match(/\{/\* Right:.*?\*\/\}[\s\S]*?<LandingSocialLinks/);
  if (rightSectionMatch) {
    assert.doesNotMatch(rightSectionMatch[0], /Box Office/);
  }
});

test("mobile drawer has logo, ends nav list with Box Office / Tickets, and keeps only Partner button with socials", () => {
  const nav = fs.readFileSync("src/components/landing/landing-nav.tsx", "utf8");
  assert.match(nav, /<aside[\s\S]*?<ClubLogo[\s\S]*?Carpenters Family/);
  assert.match(nav, /<aside[\s\S]*?href="#membership"[\s\S]*?href="\/tickets"[\s\S]*?<\/ul>/);
  assert.match(nav, /<aside[\s\S]*?modal=partnership[\s\S]*?Partner With Us/);
  assert.doesNotMatch(nav, /<aside[\s\S]*?Member Portal Sign In/);
  assert.doesNotMatch(nav, /<aside[\s\S]*?Request Membership/);
  assert.match(nav, /Partner With Us[\s\S]*?<LandingSocialLinks/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landing-nav-header-refinements.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Refactor `LandingNav` in `src/components/landing/landing-nav.tsx`**

1. In desktop `<ul>`:
   Add:
   ```tsx
   <li>
     <Link
       className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
       href="/tickets"
     >
       Box Office / Tickets
     </Link>
   </li>
   ```
2. In header right `hidden md:flex items-center gap-3`:
   Remove `<Link href="/tickets">Box Office</Link>`.
3. In mobile drawer `<aside id="drawer">`:
   - Top bar: Add `<ClubLogo size="sm" className="shrink-0" />` beside "Carpenters Family".
   - Navigation `<ul>`: Add `<Link className="block py-3 border-b border-linen" href="/tickets">Box Office / Tickets</Link>` as the last item.
   - Action buttons container: Remove Box Office / Tickets, Member Portal Sign In, and Request Membership.
   - Keep only `<Link href="/?modal=partnership" className="btn-pill bg-ochre text-deep text-center font-bold" onClick={() => setMobileMenuOpen(false)}>Partner With Us</Link>`.
   - Under "Partner With Us", render `<div className="pt-2 flex flex-col items-center gap-2 border-t border-linen"><span className="text-xs font-semibold text-umber uppercase tracking-wider">Follow Us</span><LandingSocialLinks tone="onLight" /></div>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landing-nav-header-refinements.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add tests/landing-nav-header-refinements.test.mjs src/components/landing/landing-nav.tsx
git commit -m "feat(landing): move Box Office to nav items and streamline mobile menu drawer"
```

---

### Task 3: Event Countdown Badge in Ribbon

**Files:**
- Modify: `src/lib/landing-events.mjs`
- Create: `src/components/landing/landing-countdown-badge.tsx`
- Modify: `src/components/landing/landing-ribbon.tsx`
- Test: `tests/landing-ribbon-countdown.test.mjs`

**Interfaces:**
- `selectLandingEvents(events)`: Each card now includes `startsAt: instant ? instant.toISOString() : null`.
- `LandingCountdownBadge`: Props `{ startsAt: string }`. Calculates live countdown (`Xxd Xxh Xxm Xxs`) and renders a sleek badge (`rounded-full bg-ochre/20 text-ochre px-3 py-0.5 font-bold text-xs font-mono tabular-nums`).
- `LandingRibbon`: Replaces `{season} Season` with `<LandingCountdownBadge startsAt={next.startsAt} />`.

- [ ] **Step 1: Write failing unit test for event derivation and countdown badge**

Create `tests/landing-ribbon-countdown.test.mjs`:
```javascript
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { selectLandingEvents, selectNextEvent } from "../src/lib/landing-events.mjs";

test("selectLandingEvents provides startsAt ISO timestamp", () => {
  const events = [
    {
      id: "e-1",
      title: "Gala Night",
      starts_at: "2026-12-25T18:00:00+00:00",
      location: "Asaba",
      tiers: []
    }
  ];
  const [card] = selectLandingEvents(events);
  assert.equal(card.startsAt, "2026-12-25T18:00:00.000Z");
  const next = selectNextEvent(events);
  assert.equal(next.startsAt, "2026-12-25T18:00:00.000Z");
});

test("landing-ribbon renders LandingCountdownBadge instead of 2026 Season", () => {
  const ribbon = fs.readFileSync("src/components/landing/landing-ribbon.tsx", "utf8");
  assert.match(ribbon, /LandingCountdownBadge/);
  assert.doesNotMatch(ribbon, /Season/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landing-ribbon-countdown.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement `startsAt` in `src/lib/landing-events.mjs` and create `LandingCountdownBadge`**

1. In `src/lib/landing-events.mjs`:
   Add `startsAt: instant ? instant.toISOString() : null` to returned event objects.
2. Create `src/components/landing/landing-countdown-badge.tsx`:
   Live interval updates every 1 second; handles event today / expired / upcoming states gracefully without SSR hydration mismatch.
3. In `src/components/landing/landing-ribbon.tsx`:
   Replace `{season && <span ...>{season} Season</span>}` with `<LandingCountdownBadge startsAt={next?.startsAt} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landing-ribbon-countdown.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run existing event derivation tests to verify no regressions**

Run: `node --test tests/landing-event-derivation.test.mjs`
Expected: PASS (8 tests passed, 0 errors).

- [ ] **Step 6: Commit changes**

```bash
git add tests/landing-ribbon-countdown.test.mjs src/lib/landing-events.mjs src/components/landing/landing-countdown-badge.tsx src/components/landing/landing-ribbon.tsx
git commit -m "feat(landing): replace Season badge with live event countdown in ribbon"
```

---

### Task 4: Hero "Explore the Family" & Button Clean-up

**Files:**
- Modify: `src/components/landing/landing-hero.tsx`
- Test: `tests/landing-hero-refinements.test.mjs`

**Interfaces:**
- `LandingHero`: CTA container features a single button: `<a href="#vision" className="btn bg-ochre text-deep ...">Explore the Family</a>`. The "Explore Events" button is removed.

- [ ] **Step 1: Write failing unit test for Hero CTA updates**

Create `tests/landing-hero-refinements.test.mjs`:
```javascript
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("landing hero has Explore the Family scrolling to #vision and omits Explore Events", () => {
  const hero = fs.readFileSync("src/components/landing/landing-hero.tsx", "utf8");
  assert.match(hero, /href="#vision"/);
  assert.match(hero, /Explore the Family/);
  assert.doesNotMatch(hero, /Join the Family/);
  assert.doesNotMatch(hero, /Explore Events/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/landing-hero-refinements.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/landing/landing-hero.tsx`**

Replace:
```tsx
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/?modal=membership"
              className="btn bg-ochre text-deep hover:bg-cream text-xs sm:text-sm uppercase tracking-wider px-8 shadow-md font-bold transition-colors"
            >
              Join the Family
            </Link>
            <a
              href="#events"
              className="btn border border-cream/40 bg-deep/30 text-cream hover:bg-cream/10 text-xs sm:text-sm uppercase tracking-wider px-8 font-bold transition-colors"
            >
              Explore Events
            </a>
          </div>
```
With:
```tsx
          <div className="mt-7 flex items-center justify-center">
            <a
              href="#vision"
              className="btn bg-ochre text-deep hover:bg-cream text-xs sm:text-sm uppercase tracking-wider px-8 shadow-md font-bold transition-colors"
            >
              Explore the Family
            </a>
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/landing-hero-refinements.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add tests/landing-hero-refinements.test.mjs src/components/landing/landing-hero.tsx
git commit -m "feat(landing): replace Join the Family with Explore the Family anchor and remove Explore Events"
```

---

### Task 5: Full Regression, Production Build & Deployment Security Headers Pass

**Files:**
- Test all components across the pipeline.

- [ ] **Step 1: Run Biome lint**

Run: `npm run lint`
Expected: Checked 275+ files, 0 errors, clean output.

- [ ] **Step 2: Run all security regression tests**

Run: `npm run test:security-regression`
Expected: All 840+ tests pass with 0 failures.

- [ ] **Step 3: Run production Turbopack build**

Run: `npm run build`
Expected: Turbopack compiles all 33 routes without error.

- [ ] **Step 4: Start production server and test deployment security headers**

Start server: `npm run start -- --hostname 127.0.0.1 --port 3000`
Run test:
```powershell
$env:DEPLOYMENT_BASE_URL = "http://127.0.0.1:3000"
node --test tests/deployment-security-headers.test.mjs
```
Expected: PASS with 0 errors. Stop server.

- [ ] **Step 5: Verify git status and commit hygiene**

Confirm only the intended files are staged, and `.env.example`, `src/lib/email/config.ts`, and `tests/email-template.test.mjs` remain untouched.
