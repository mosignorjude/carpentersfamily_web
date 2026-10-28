# Mobile Responsive Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two audited mobile blockers (financial table content unreachable at phone widths; the mobile navigation panel extends past the viewport so lower items and Sign out are untappable) and land the shared form-control / touch-target baseline the rest of the responsive work depends on.

**Architecture:** Two surfaces change. (1) `src/app/globals.css` — the live rules that cause the blockers get `max-height` / `overflow-y` / safe-area and lose the silent `overflow-x: clip`; a new `.table-scroll-region` class becomes the single horizontal-scroll primitive. (2) `src/components/ui/` — a `CfTextField` / `CfSelect` pair joins the existing `CfButton`, sized to the DESIGN.md floor (>=48px, >=16px text), and the money-entry call sites adopt it.

**Tech Stack:** Next.js 16 App Router, React 19.3.1, Tailwind CSS v4 (`@tailwindcss/postcss`), Biome 2.5.5, `node --test`.

**Spec:** the heuristic audit run on 2026-10-28 (report-only, so it was never written to disk — this plan is the only durable artefact of those findings).

## Test harness (read before writing your first test)

This repo does **not** use jsdom or Playwright. Tests are `node:test` files that `readFileSync` a source file and `assert.match` its text. See `tests/event-dashboard-expenses-ui.test.mjs` as the template. Every task therefore has (a) a source-assertion test that runs in CI, and (b) a browser step run once against the production build.

Four harness rules, each bought with a round of this plan's own review loop, and each binding on Tasks 5-7:

- **A substring over a whole file is not an assertion about the element.** `assert.match(source, /min-h-\[44px\]/)` in an 824-line file passes on any other control's floor, and `/gap-2 p-1\.5/` passes on a decoy while the real row is flattened. Slice to the element (its own enclosing region, its own `className` literal) and assert *there*. Prove it by breaking the element and, separately, by adding a decoy elsewhere: a pin that survives either is not a pin.
- **Parses beat literals for numbers and order.** Read the value out and compare (`>= 44`, exactly one floor owner per element), converting every spelling to pixels — `px`, `rem`, and Tailwind's bare scale form at 4px per step. Literal conjunctions like `gap-2 p-1.5` go red on an improvement (`gap-3`) and green on a regression that reorders classes.
- **`doesNotMatch` on a token range cannot see a control with no token.** A 30px link with only `px-3 py-1.5` matches nothing in a `min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]` filter. Sweep the elements, not the tokens.
- **The build, not the suite, is the only evidence about CSS — and it is weaker than it looks.** `npx next build` and grep the *selector token* in the chunk the route's `page_client-reference-manifest.js` lists, because a source-text test cannot see the cascade. Two traps this plan measured: Tailwind emits the `sm` breakpoint as a **min**-width query, so a `max-width:40rem` grep is a false positive on unrelated rules; and with no `@source` directive the scanner reads tracked markdown, so a class literal written in a plan or review note ships a real rule, which means "present in the bundle" can never prove *this* task's markup produced it.

## Global Constraints

- `DESIGN.md:25` — "Inputs and buttons are at least 48px high; interactive targets must never fall below 44px."
- `DESIGN.md:26` — "Do not communicate status through color alone."
- `DESIGN.md:31` — mobile uses a sticky header with an accessible menu; **do not add a bottom tab bar.**
- `DESIGN.md:32` — at phone widths, dense financial tables become labeled rows/cards (Phase 2; Phase 1 only makes them *reachable*).
- Text in any form control >= 16px (iOS Safari zooms on focus below that).
- Gates per task: `node --test tests/<file>.test.mjs`, then `npm test`, then `npm run lint` with zero diagnostics.
- Do not weaken `X-Frame-Options: DENY` (`next.config.ts:17`) to make a test easier.

## Two corrections to the audit

1. **`/notifications` is not dead.** The `redirect("/")` at `src/app/(member)/notifications/page.tsx:4` is deliberate and guarded by `tests/notification-page-presentation.test.mjs:264`. Deleting it would break old deep links for no gain. **It stays.**
2. **The `min-height: 100vh` finding is in dead CSS.** The only occurrence, `globals.css:8965`, sits inside `.slk-event-dashboard`. No `.tsx` file contains `slk-` at all, so the whole `slk-*` block (roughly `globals.css:8940`-`10520`, ~1,580 lines) is dead. Deleting it is a Phase 2 task with its own verification; it resolves the `100vh` finding for free.

## File structure

| File | Responsibility after Phase 1 |
| --- | --- |
| `src/app/globals.css` | Drop `overflow-x: clip` from `.event-finance-panel`; add `.table-scroll-region`; add `max-height`/`overflow-y`/safe-area to `.app-mobile-menu-panel`; add the dashboard-variant sign-out colour; add `--breakpoint-nav` |
| `src/components/ui/table-scroll.tsx` | *new* — the one horizontal-scroll region primitive (focusable, labelled) |
| `src/components/ui/cf-field.tsx` | *new* — `CfTextField`, `CfSelect`, shared compliant classes |
| `src/components/ui/index.ts` | Barrel exports for both new files |
| `src/components/ui/cf-button.tsx` | Size floor raised to 44px |
| 8 dashboard table wrappers | Use `TableScroll` |
| `src/components/app-header.tsx`, `mobile-app-menu.tsx` | `flex … lg:hidden` -> `hidden max-nav:flex …` (base `flex` deleted) so one nav per width |
| `src/app/(member)/finances/finance-forms.tsx`, `src/components/dues/pay-dues-modal.tsx` | Adopt `CfTextField` / `CfSelect` |

Verification build: `npm run build && npx next start -p 3001`, then `http://127.0.0.1:3001` (per project convention, `.env.local` points at local Supabase).

---

### Task 1: Stop financial tables silently losing columns (blocker B1)

**Files:**
- Modify: `src/app/globals.css:8736-8740`
- Create: `src/components/ui/table-scroll.tsx`
- Modify: `src/components/ui/index.ts`
- Modify the 8 scroll wrappers: `tab-revenue.tsx:135`, `tab-expenses.tsx:138`, `tab-audit-log.tsx:207`, `tab-tickets.tsx:179`, `tab-reports.tsx:173` and `:239`, `tab-budget-allocations.tsx:248`, `event-domain-ledger.tsx:206`
- Test: `tests/finance-table-scroll-region.test.mjs`

**Why this is the fix:** `globals.css:8739` puts `overflow-x: clip` on the live `.event-finance-panel` (the element at `event-dashboard-view.tsx:585`). Unlike `hidden`, `clip` is **not scrollable**, so anything the wide 7-column tables push past the panel edge is destroyed, not deferred. `tab-expenses.tsx:138` already carries the `min-w-0` that the previous plan shipped — and it still failed the audit, which is the proof that `min-w-0` was the wrong lever. Page-level width is already guarded by `.app-page-content { min-width: 0 }` at `globals.css:3932`, so removing the clip does not reintroduce body-level horizontal scroll.

**Interfaces:**
- Produces: `TableScroll({ label, children, className? })` — a `div` with `role="region"`, `tabIndex={0}`, `aria-label={label}`, `className="table-scroll-region min-w-0 ..."`.

- [ ] **Step 1: write the failing test**

```js
// tests/finance-table-scroll-region.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const revenue = readFileSync(
  new URL("../src/components/events/dashboard/tab-revenue.tsx", import.meta.url),
  "utf8",
);
const ledger = readFileSync(
  new URL("../src/components/ui/table-scroll.tsx", import.meta.url),
  "utf8",
);

function offendingSelectors(source) {
  const found = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/overflow-x:\s*clip/.test(match[2])) {
      found.push(match[1].trim().replace(/\s+/g, " "));
    }
  }
  return found;
}

describe("event finance horizontal overflow", () => {
  it("never clips overflow on an event-finance selector", () => {
    const offenders = offendingSelectors(css).filter((selector) =>
      selector.includes("event-finance"),
    );
    assert.deepEqual(offenders, [], `overflow-x: clip hides table columns: ${offenders.join(" | ")}`);
  });

  it("declares a focusable table scroll region class", () => {
    assert.match(css, /\.table-scroll-region\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /\.table-scroll-region\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.table-scroll-region:focus-visible/);
  });

  it("gives the region a role and a keyboard stop", () => {
    assert.match(ledger, /role="region"/);
    assert.match(ledger, /tabIndex=\{0\}/);
    assert.match(ledger, /aria-label=\{label\}/);
  });

  it("routes the revenue table through TableScroll", () => {
    assert.match(revenue, /<TableScroll[^>]*label="Revenue streams by source"/);
  });
});
```

- [ ] **Step 2: run it, confirm it fails** — `node --test tests/finance-table-scroll-region.test.mjs` → 4 failures (`ENOENT` on `table-scroll.tsx`, clip offenders present).
- [ ] **Step 3: delete the clip.** Replace `globals.css:8736-8740` with:

```css
.event-finance-panel {
  min-width: 0;
}
```

(`.event-finance-page` matches no element in any `.tsx`, so it leaves with it. The remaining `.app-shell-dashboard .event-finance-page ...` rules are also dead; leave them for the Phase 2 dead-CSS task so this diff stays reviewable.)

- [ ] **Step 4: add the region class**, after `.event-finance-panel .table-scroll` at `globals.css:8753`, copying the focus treatment already proven at `globals.css:8759-8762`:

```css
.table-scroll-region {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  -webkit-overflow-scrolling: touch;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 0%) 30%, rgb(255 255 255 / 0)) 100% 50% / 2.5rem 100%,
    linear-gradient(270deg, rgb(122 104 93 / 0.22) 0%, rgb(122 104 93 / 0)) 100% 50% / 2.5rem 100%,
    linear-gradient(90deg, rgb(122 104 93 / 0.22) 0%, rgb(122 104 93 / 0)) 0% 50% / 2.5rem 100%;
  background-attachment: local, scroll, scroll;
  scrollbar-gutter: stable;
}

.table-scroll-region:focus-visible {
  outline: 3px solid var(--brand-forest);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .table-scroll-region {
    scroll-behavior: auto;
  }
}
```

The two `scroll`-attached gradients are the edge shadows: they only appear while there is more content that way, so "there is more to see" is communicated without colour-only signalling.

- [ ] **Step 5: create `src/components/ui/table-scroll.tsx`**

```tsx
import type { ReactNode } from "react";

export function TableScroll({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={`table-scroll-region min-w-0 ${className}`}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
```

Add `export * from "./table-scroll";` to `src/components/ui/index.ts`, keeping the alphabetical order Biome enforces.

- [ ] **Step 6: migrate all 8 wrappers.** For each, wrap the existing `<table>` and drop the ad-hoc classes into `className`. Revenue example — at `tab-revenue.tsx:135`:

```tsx
<TableScroll className="rounded-xl border border-[#E5DDD3]" label="Revenue streams by source">
  <table className="w-full text-left text-xs border-collapse">
```

Labels: `"Expenses by cost center"`, `"Revenue streams by source"`, `"Ticket sales"`, `"Audit log entries"`, `"Financial report"`, `"Report summary"`, `"Budget allocations"`, `"Ledger transactions"`. Where the old wrapper carried `rounded-xl border ...`, move those into `className` so nothing visual regresses.

- [ ] **Step 7: run the test, then the suite** — `node --test tests/finance-table-scroll-region.test.mjs` (4 pass), `npm test`, `npm run lint`.
- [ ] **Step 8: browser check.** `npm run build && npx next start -p 3001`, open an event dashboard → Revenue tab at 360px wide. Assert: the wrapper is swipeable to its last column, the right-edge shadow is visible before swiping and gone after, Tab focuses the region, and the page itself has no horizontal scrollbar (`document.documentElement.scrollWidth === window.innerWidth`).
- [ ] **Step 9: commit** — `git add src/app/globals.css src/components/ui/table-scroll.tsx src/components/ui/index.ts src/components/events/dashboard && git commit -m "fix(events): make finance table overflow scrollable instead of clipped"`

---

### Task 2: Make the mobile menu panel fully reachable (blocker B2)

**Files:**
- Modify: `src/app/globals.css:4005-4017`
- Test: `tests/mobile-menu-panel.test.mjs`

**Why:** `.app-mobile-menu-panel` is `position: fixed` with `top: 4.5rem` and no height cap. Eight nav rows at `min-height: var(--control-height)` = 48px (`globals.css:3899-3908`) plus gaps, the separator and the 48px Sign out (`globals.css:4029-4041`) total ~500px. The audit measured the panel outrunning the viewport and `panelTop` pinned at 72px even after scrolling the document to 2057px — the content is fixed, so scrolling the page cannot rescue it. Sign out was untappable.

- [ ] **Step 1: failing test**

```js
// tests/mobile-menu-panel.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);

function ruleBody(source, anchor) {
  const start = source.indexOf(anchor);
  assert.notEqual(start, -1, `missing rule near "${anchor}"`);
  const open = source.indexOf("{", start);
  return source.slice(open + 1, source.indexOf("}", open));
}

describe("mobile menu panel fits the viewport", () => {
  // The "\n." anchor is load-bearing: an unanchored search matches the
  // .app-mobile-menu-panel override inside @media (max-width: 48rem) first,
  // which legitimately does not carry overflow-y.
  const panel = ruleBody(css, "\n.app-mobile-menu-panel {");

  it("caps height with dvh plus the bottom safe area", () => {
    assert.match(panel, /max-height:[^;]*100dvh/);
    assert.match(panel, /max-height:[^;]*env\(safe-area-inset-bottom/);
  });

  it("scrolls its own overflow instead of spilling off-screen", () => {
    assert.match(panel, /overflow-y:\s*auto/);
    assert.match(panel, /overscroll-behavior:\s*contain/);
  });

  it("insets for notch and landscape safe areas", () => {
    assert.match(panel, /left:\s*max\([^;]*env\(safe-area-inset-left/);
    assert.match(panel, /padding-bottom:[^;]*env\(safe-area-inset-bottom/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-menu-panel.test.mjs` → 3 failures.
- [ ] **Step 3: replace the rule** at `globals.css:4005-4017`:

```css
.app-mobile-menu-panel {
  position: fixed;
  z-index: 80;
  top: 4.5rem;
  left: max(1rem, env(safe-area-inset-left, 0px));
  right: auto;
  width: min(20rem, calc(100vw - 2rem));
  max-height: calc(100dvh - 5.5rem - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0.65rem;
  padding-bottom: calc(0.65rem + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}
```

`top: 4.5rem` + `5.5rem` reserved leaves the header clear and the panel bottom inside the visual viewport.

**Corrected during execution (Task 2 review).** The `@media (max-width: 48rem)` rule at `globals.css:3978-3981` does **not** override the base rule — it appears *earlier in source order* than `.app-mobile-menu-panel` at `:4006`, both selectors are specificity `0-1-0`, and a media query adds no specificity, so the base rule wins on `top`/`left`/`max-height` at every width. That override has never applied; the audit's own measurement proves it (`panelTop` = 72px = `4.5rem`, never the `3.75rem` this step assumed). Contrast `.app-sticky-header`, whose base at `:3952` *does* precede its media override at `:3973`, so the 56px short header is real — which is why the panel keeps a 16px gap under it rather than 4px. Do not add a shorter reservation to that block. Instead **delete the inert panel block** so panel geometry has one live source of truth, and pin it: assert the full `max-height: calc(100dvh - 5.5rem - env(safe-area-inset-bottom, 0px))` declaration (a loose `/max-height:[^;]*100dvh/` passes against a cap that overflows the viewport) and assert that no `.app-mobile-menu-panel` rule sets geometry before the base rule. If design later wants the tighter phone tuck, that is a Phase 2 decision requiring the override moved *below* `:4006` and browser-verified — it changes the panel's position on every phone.

Because `left` now carries a safe area while `width` does not, subtract both horizontal insets in the base rule so a notched landscape device cannot push the panel off the right edge: `width: min(20rem, calc(100vw - 2rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))`. Keep `right: auto` — `tests/notice-methods-verification.test.mjs:464-470` asserts it, and asserts `!right: 1rem`.

- [ ] **Step 4:** `node --test tests/mobile-menu-panel.test.mjs` → pass; `npm test`; `npm run lint`.

**Superseded test to update in the same commit:** `tests/notice-methods-verification.test.mjs:461` asserts `basePanel[1].includes("left: 1rem")`, which the safe-area `left: max(1rem, env(safe-area-inset-left, 0px))` legitimately replaces. Change that assertion to `basePanel[1].includes("left: max(1rem, env(safe-area-inset-left"))` and correct the now-stale comment at `:450` and failure message at `:462` to describe the safe-area anchor; the sibling assertions (`right: auto`, `!right: 1rem`, `panelMatches.length >= 2`) still hold and must not be touched.
- [ ] **Step 5: browser check** at 360x640 and 390x400 (deliberately short). Assert `getBoundingClientRect().bottom <= innerHeight` for the panel, and that **Sign out is inside the panel and taps** — first tap on the element, second by keyboard Tab order from the last nav link. *Deferred by controller ruling to the consolidated gate after Task 7 (locked 510x425 audit viewport; `X-Frame-Options: DENY` blocks iframe emulation). Add a landscape notch pass there for the `width` inset.*
- [ ] **Step 6: commit** — `git commit -m "fix(nav): cap and scroll the mobile menu panel inside the viewport"`

---

### Task 3: Sign out is invisible on the dashboard shell (blocker B2 contrast)

**Files:**
- Modify: `src/app/globals.css` near `4749-4763`
- Test: `tests/mobile-menu-panel.test.mjs` (extend)

**Why:** `.app-shell-dashboard .app-mobile-menu-panel` repaints the panel to `var(--dashboard-forest)` = `#073523` (`globals.css:4558`) and re-colours nav links to `#f3f4ef` (`globals.css:4754`) — but nothing re-colours the sign-out button, which keeps `var(--color-danger)` = `#963b32`. Measured 1.92:1 against a 4.5:1 requirement.

- [ ] **Step 1: append failing cases** to `tests/mobile-menu-panel.test.mjs`:

```js
describe("dashboard menu panel contrast", () => {
  it("recolours sign out for the dark dashboard panel", () => {
    assert.match(
      css,
      /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button\s*\{[^}]*color:\s*#f0a89e/,
    );
  });

  it("keeps the hover state readable", () => {
    assert.match(css, /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button:hover\s*\{[^}]*color:\s*#ffd0c7/);
  });

  it("makes the focus ring visible on the dark panel", () => {
    assert.match(css, /\.app-shell-dashboard\s+\.app-mobile-menu-panel\s+\.app-mobile-menu-signout\s+button:focus-visible\s*\{[^}]*outline-color:\s*var\(--brand-ochre\)/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-menu-panel.test.mjs` → the new cases fail.

**Corrected during execution (Task 3 review).** Two amendments, both from the task review:

1. The hover assertion above originally matched only the *selector* (`…button:hover`) with no declarations consumed — it stayed green even if the rule regressed to `color: #073523` (1.13:1, the exact failure this task exists to prevent) or dropped `color` entirely. Pin the declarations, including the alpha, because 7.28:1 depends on the blend and not only on the text colour.
2. The `:focus-visible` state was missing from the brief. `globals.css:4055` sets `outline: 3px solid var(--color-focus-ring)`, and that token resolves through `--color-focus-ring` → `--brand-forest-hover` (`:96`, `:82`) to `#103d2b` = **1.118:1 against the forest panel** (12.18:1 on the light panel it was designed for) — a keyboard-only user on the dashboard shell sees no focus indicator on Sign out at all. Same defect class, and inside Task 3's charter ("sign-out contrast on the dark menu panel"), so it is fixed here rather than deferred.
- [ ] **Step 3: insert after `globals.css:4756`:**

```css
.app-shell-dashboard .app-mobile-menu-panel .app-mobile-menu-signout {
  border-top-color: rgb(243 244 239 / 0.22);
}

.app-shell-dashboard .app-mobile-menu-panel .app-mobile-menu-signout button {
  color: #f0a89e;
}

.app-shell-dashboard .app-mobile-menu-panel .app-mobile-menu-signout button:hover {
  background: rgb(240 168 158 / 0.16);
  color: #ffd0c7;
}

.app-shell-dashboard
  .app-mobile-menu-panel
  .app-mobile-menu-signout
  button:focus-visible {
  outline-color: var(--brand-ochre);
}
```

`#f0a89e` on `#073523` computes to **7.0:1** (fg relative luminance 0.4899, bg 0.0271). The button stays a destructive action by label and position, so colour is reinforcement rather than the only signal — DESIGN.md:26 holds. `var(--brand-ochre)` = `#d6a23a` measures **5.89:1** on `#073523` — clear of the 3:1 WCAG 2.2 AA bar for non-text focus appearance — and is an existing brand token, so no new literal enters the file. The override wins on specificity (`0-4-1` vs the base rule's `0-2-1` — corrected during Task 3's review, which measured the base as three class/token segments, not four), so the longhand `outline-color` replaces the shorthand's colour regardless of order — the same mechanism `border-top-color` uses against `border-top` at `:4034`.

Deliberately **not** changed: the separator `rgb(243 244 239 / 0.22)` measures 1.905:1 against the panel, which reads like a failure only until it is compared with the baseline it mirrors — the light panel's separator is `var(--line)` = `#e5ddd3` on `#fff` = **1.345:1**, so the dark divider is already *more* visible than the app's design norm. Raising it to 3:1 would make this one divider louder than every other one. It is decoration, not the row's identifier (the `Sign out` label is).

- [ ] **Step 4:** re-run the file, `npm test`, `npm run lint`.
- [ ] **Step 5: browser check** — on an event dashboard, open the hamburger, read the computed pair from the DOM rather than trusting the stylesheet:

```js
(() => {
  const b = document.querySelector(".app-mobile-menu-signout button");
  const fg = getComputedStyle(b).color;
  const bg = getComputedStyle(document.querySelector(".app-mobile-menu-panel")).backgroundColor;
  return { fg, bg, size: b.getBoundingClientRect().height };
})();
```

Paste both `rgb()` values into any contrast check; expect >=4.5:1 and `size >= 44`. *Deferred by controller ruling to the consolidated gate after Task 7 (locked 510x425 audit viewport; `X-Frame-Options: DENY` blocks iframe emulation). The gate must additionally read `getComputedStyle(button).outlineColor` while focused — expect `rgb(214, 162, 58)` — and confirm the panel's own `backgroundColor` is `rgb(7, 53, 35)`, which is what proves the `.app-shell-dashboard` branch is the live one.*
- [ ] **Step 6: commit** — `git commit -m "fix(nav): restore sign-out contrast on the dark mobile menu panel"`

---

### Task 4: Shared form controls that meet the floor

**Files:**
- Create: `src/components/ui/cf-field.tsx`
- Modify: `src/components/ui/index.ts`, `src/components/ui/cf-button.tsx:44-49`
- Modify (adopters): `src/app/(member)/finances/finance-forms.tsx` (22 non-compliant inputs, e.g. `:159`, `:181`), `src/components/dues/pay-dues-modal.tsx`, `src/components/formatted-amount-input.tsx:119-129`
- Test: `tests/form-control-baseline.test.mjs`

**Why:** 74 `h-10 ... text-{xs,sm}` inputs across 17 files are 40px tall with 12-14px text — under DESIGN.md's 48px floor, and under the 16px threshold at which iOS Safari auto-zooms on focus. `CfButton` sizes `default: h-10`, `compact: h-8`, `icon: h-9` are all below 44px. Fixing the primitives once is cheaper than 74 local patches, and every later phase inherits the floor.

**Interfaces:**
- Produces: `CfTextField` and `CfSelect`, both `forwardRef`, both accepting `label`, `hint`, `error`, `className`; both render `min-h-[3rem] text-base`.

- [ ] **Step 1: failing test**

```js
// tests/form-control-baseline.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const field = readFileSync(new URL("../src/components/ui/cf-field.tsx", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/ui/cf-button.tsx", import.meta.url), "utf8");
const forms = readFileSync(new URL("../src/app/(member)/finances/finance-forms.tsx", import.meta.url), "utf8");
const barrel = readFileSync(new URL("../src/components/ui/index.ts", import.meta.url), "utf8");

describe("form control baseline", () => {
  it("exports the field primitives", () => {
    assert.match(barrel, /export \* from "\.\/cf-field"/);
  });

  it("uses 48px controls with 16px text", () => {
    assert.match(field, /min-h-\[3rem\]/);
    assert.match(field, /text-base/);
    assert.doesNotMatch(field, /h-10|text-xs|text-\[1[1234]px\]/);
  });

  it("labels are real label elements, never placeholder-only", () => {
    // Bounded [\s\S] gaps, not `\s+`: Biome wraps multi-attribute JSX at 80
    // columns, so a regex demanding same-line adjacency cannot pass here.
    assert.match(field, /<label[\s\S]{0,160}?htmlFor=\{htmlFor\}/);
    assert.match(field, /id=\{htmlId\}/);
    assert.match(field, /aria-describedby=\{describedBy\}/);
    // The referenced ids must be the ids that are actually rendered, or
    // aria-describedby points at nothing and the hint is never announced.
    assert.match(field, /const hintId = hint \? `\$\{htmlId\}-hint` : undefined/);
    assert.match(field, /const errorId = error \? `\$\{htmlId\}-error` : undefined/);
    assert.match(field, /const describedBy = \[hintId, errorId\]\.filter\(Boolean\)\.join\(" "\) \|\| undefined/);
    // Tightened from the literal /-desc/, which cannot pass: the same test
    // requires `aria-describedby={describedBy}`, and that JSX attribute name is
    // itself spelled "-describedBy" (JSX camelCases it; HTML does not). What must
    // not come back is the `-desc` *id suffix* — `${htmlId}-desc` — and this still
    // catches exactly that.
    assert.doesNotMatch(field, /-desc(?!ribed)/);
  });

  it("keeps no CfButton size below 44px", () => {
    const sizes = button.match(/"(default|compact|large|icon)":\s*"([^"]+)"/g) ?? [];
    for (const size of sizes) {
      assert.match(size, /h-11|h-12/, `below the 44px floor: ${size}`);
    }
    assert.match(button, /icon:\s*"[^"]*h-11[^"]*w-11/);
  });

  it("money-entry forms use the primitives", () => {
    assert.match(forms, /<CfTextField/);
    assert.match(forms, /<CfSelect/);
    assert.doesNotMatch(forms, /h-10/);
  });
});
```

- [ ] **Step 2:** `node --test tests/form-control-baseline.test.mjs` → fails with `ENOENT ... cf-field.tsx`.
- [ ] **Step 3: create `src/components/ui/cf-field.tsx`.** The class strings are the existing `#E5DDD3` / `#3D291F` / `#174C37` tokens already used at `finance-forms.tsx:159`, so the migration is visual-neutral apart from size:

```tsx
"use client";

import type React from "react";
import { forwardRef, useId } from "react";

export const CONTROL =
  "w-full min-h-[3rem] px-3 rounded-xl border border-[#E5DDD3] bg-white text-base font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] placeholder:font-normal focus:outline-hidden focus:ring-2 focus:ring-[#174C37] disabled:opacity-60";

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  hintId?: string;
  errorId?: string;
};

function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  hintId,
  errorId,
  children,
}: FieldShellProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-[#3D291F]" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-sm text-[#5C4638]" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-semibold text-[#BA3C2A]" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const CfTextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldShellProps
>(({ label, hint, error, className = "", id, ...props }, ref) => {
  const generatedId = useId();
  const htmlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${htmlId}-hint` : undefined;
  const errorId = error ? `${htmlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell error={error} errorId={errorId} hint={hint} hintId={hintId} htmlFor={htmlId} label={label}>
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]" : ""} ${className}`}
        id={htmlId}
        ref={ref}
        {...props}
      />
    </FieldShell>
  );
});
CfTextField.displayName = "CfTextField";

export const CfSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & FieldShellProps
>(({ label, hint, error, className = "", id, children, ...props }, ref) => {
  const generatedId = useId();
  const htmlId = id ?? `field-${generatedId}`;
  const hintId = hint ? `${htmlId}-hint` : undefined;
  const errorId = error ? `${htmlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell error={error} errorId={errorId} hint={hint} hintId={hintId} htmlFor={htmlId} label={label}>
      <select
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]" : ""} ${className}`}
        id={htmlId}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});
CfSelect.displayName = "CfSelect";
```

**Corrected before dispatch (controller pre-flight, Task 4).** Three defects in the code above as originally written, now fixed in it (a fourth, in the Step 1 test rather than the component, was found during implementation — see item 4):

1. **`aria-describedby` pointed at an id that was never rendered.** The original wired `describedBy = \`${htmlId}-desc\`` to the input while rendering the paragraphs as `${describedBy}-hint` / `${describedBy}-error` — i.e. `field-x-desc-hint`. The referenced element did not exist, so no hint or error would ever be announced: a primitive shipped as "the accessible baseline" that is silently worse than the hand-wired markup it replaces (`finance-forms.tsx:129-131` sets `aria-describedby="income-error-amount"` against a real id today). The `hintId`/`errorId`/joined-`describedBy` shape above is the fix, and the test now pins it.
2. **`CfSelect` rendered no `aria-describedby` at all**, so every migrated select would lose its error announcement. It now mirrors `CfTextField` exactly, including the error border treatment.
3. **The error colour was `#963B32`, which these forms never render.** `finance-forms.tsx` uses `#BA3C2A` 39 times and `#963B32` zero times (it is `--color-danger` in `globals.css:93`, CSS-side only), and `cf-button`'s danger variant is `bg-[#BA3C2A]` (`cf-button.tsx:38`). Using the Tailwind-side red keeps the error state visual-neutral, which is this step's own stated goal.

4. **The Step 1 guard `assert.doesNotMatch(field, /-desc/)` was unsatisfiable, and the implementer caught it.** Two lines earlier the same test requires `/aria-describedby=\{describedBy\}/`, so the primitive must render that attribute — and in JSX the attribute is spelled `aria-describedby`, which contains `-desc`. The assertion could only be satisfied by shipping the very defect it was written to prevent. Corrected in Step 1 to `/-desc(?!ribed)/`, which still rejects the `${htmlId}-desc` id suffix of defect 1 while allowing the attribute name. This is the *only* deviation from the brief's verbatim test text, and it is a fix to the test, not to the component.

Two things this task changes that are **not** defects, to be called out in review rather than discovered:
- **Labels change typography**, despite Step 3's "visual-neutral apart from size" claim. The forms currently render `<label className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5">`; `FieldShell` renders `text-sm font-semibold text-[#3D291F]` sentence-case. That is deliberate — an 11px uppercase label is the worst case for mobile legibility and reads worse to screen readers — but it is a visible change on every migrated form, so the consolidated gate must look at `/finances` for it. The `*` required-marker spans (`<span className="text-[#BA3C2A]">*</span>`) have no home in `FieldShell`: keep them in the `label` string (e.g. `label="Payment Method *"`) rather than inventing a required-indicator prop for Phase 1.
- **`compact` buttons grow 32px → 44px**, already flagged below; `default` `text-xs` also becomes `text-sm`.

- [ ] **Step 4: raise the `CfButton` floor** at `cf-button.tsx:44-49`:

```ts
const sizeStyles: Record<CfButtonSize, string> = {
  default: "h-12 px-4 py-2 text-sm font-bold rounded-xl gap-2",
  compact: "h-11 px-3 py-1.5 text-xs font-semibold rounded-lg gap-1.5",
  large: "h-12 px-6 py-3 text-sm font-bold rounded-xl gap-2.5",
  icon: "h-11 w-11 p-0 rounded-xl justify-center text-sm",
};
```

**Known trade-off, call it out in review:** `compact` moves 32px -> 44px, so dense modal footers grow by ~12px per row and a few may wrap. That is compliance, not a regression; check every modal in Step 7 and let the row wrap with `flex-wrap` rather than reverting the size.

- [ ] **Step 5: migrate the money-entry forms.** `finance-forms.tsx` has **22** `h-10` controls at lines 133, 159, 181, 212, 248, 274, 399, 425, 447, 478, 514, 550, 582, 819, 836, 858, 876, 906, 926, 943, 963, 1031 — every one of them an `<input>` or `<select>` (the two at 212 and 478 are `type="file"`). Replace each `<label>...</label>` + control pair with one `<CfTextField label="..." name="..." />` or `<CfSelect label="..." name="...">...</CfSelect>` (import from `@/components/ui`), carrying the existing `name`, `value`, `onChange`, `placeholder`, `required` and `disabled` props across unchanged. Where an input carries a leading icon (the `pl-8` variants at 133 and 399), keep the icon wrapper and pass `className="pl-8"`. For the two file inputs, pass their `file:*` classes through `className`. **Corrected before dispatch — the three red-ring sites take CONTROL's green ring; do not pass `focus:ring-[#BA3C2A]`.** The original instruction was to preserve the red focus ring at `:425`, `:447`, `:1031` by passing it through `className`. That does not work reliably: `CONTROL` already emits `focus:ring-[#174C37]`, and two arbitrary-value utilities setting the same property on one element are resolved by *generated-CSS order*, not by the order they appear in the `className` string — so which ring wins is an implementation detail of the Tailwind build, not a decision in the code. Rather than ship a coin-flip, drop the red ring on those three inputs and let them use the shared green ring. Justification: the red ring is a decorative accent on "money out" fields, not a status signal (nothing is communicated by colour alone — `DESIGN.md:26` is about status), and one consistent compliant focus ring across every field is the point of a shared primitive. Cost: three inputs change focus colour, which the consolidated gate should look at. If the accent turns out to matter, the right fix is a `ringClass` prop on the primitive that *replaces* rather than competes with `CONTROL`'s — a Phase 2 decision, not a Phase 1 patch.

**Corrected before dispatch — the amount inputs need a layout export, because `CfTextField` renders its own `<input>`.** The original wording ("become `<CfTextField>`-wrapped `FormattedAmountInput` replacements only if… otherwise migrate to `<CfTextField type="text">`… or render it with `className={CONTROL}`") is self-contradictory: `CfTextField` always renders the `<input>` itself, so there is no way to put `FormattedAmountInput` inside it, and there is nowhere to attach `label`/`hint`/`error` to a bare `className={CONTROL}`. The three call sites at `finance-forms.tsx:128`, `:394`, `:818` are exactly the money fields whose thousands-formatting the app depends on, so silently replacing them with plain `<CfTextField type="text">` would regress money entry — and leaving them as-is would miss this task's own goal for them.

Ruling: **export the shell as `CfFieldLayout`** — the same `FieldShell` component the primitives already use internally, given `id`/`describedBy` props so the caller can wire the control it renders:

```tsx
export function CfFieldLayout({
  children,
  error,
  errorId,
  hint,
  hintId,
  htmlFor,
  label,
}: FieldShellProps & { children: React.ReactNode }) { /* same markup as FieldShell */ }
```

`CfTextField` and `CfSelect` then render *through* `CfFieldLayout` rather than duplicating it, so there is exactly one label/hint/error implementation in the file — which is the point of the task. The three amount inputs become:

```tsx
<CfFieldLayout error={msg} errorId={`${htmlId}-error`} htmlFor={htmlId} label="Amount (NGN)">
  <FormattedAmountInput
    aria-describedby={msg ? `${htmlId}-error` : undefined}
    aria-invalid={msg ? true : undefined}
    className={`${CONTROL} ${msg ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]" : ""}`}
    id={htmlId}
    ...
  />
</CfFieldLayout>
```

This adds one export beyond the plan's whitelist — justified because the alternative is a functional regression on money entry. `FormattedAmountInput` keeps its own `inputMode="numeric"` (`formatted-amount-input.tsx:123`) and its formatting; `CONTROL` supplies the 48px/16px floor it never had.

**Preserve every existing `id` verbatim.** `finance-forms.tsx` carries 32 explicit ids, and the error paragraphs are among them (`income-error-amount`, `expense-error-category`, `cat-error-name` …) referenced by hand-written `aria-describedby` on the controls. The primitive generates ids via `useId`, which would rename them. Pass the existing `id` into each `CfTextField`/`CfSelect`/`CfFieldLayout` control and derive `hintId`/`errorId` from that same id, so the DOM node names do not change — no test references them by name today, but the consolidated browser gate and any future deep-link anchor both key off them.

**Carve-out added during Task 4 fix round 2 (M-1) — this rule cannot cover error paragraphs the primitive derives.** `CfTextField`/`CfSelect` build the error paragraph's id as `` `${control id}-error` ``, so converting a hand-wired site renames that paragraph by construction; asking for both "migrate to the primitive" and "keep the paragraph's hand-written name" asks for two ids on one node. What the rule still binds — and what the fix round preserved — is the **control** id (the input's own DOM name, which `htmlFor`, `aria-describedby` and a deep link key off) and the two error ids the caller passes explicitly to `CfFieldLayout` (`income-error-amount`, `expense-error-amount`), which survived because the caller owns them. Seven paragraph ids were renamed by the migration: `income-error-receipt` → `income-receipt-file-error`, `income-error-source-note` → `income-source-note-error`, `expense-error-receipt` → `expense-receipt-file-error`, `expense-error-category` → `expense-category-error`, `expense-error-payee` → `expense-payee-error`, `expense-error-description` → `expense-description-error`, `cat-error-name` → `cat-name-error`. Nothing in `src` or `tests` referenced any of the seven (measured at `a42537c`), but `hash-scroll-handler.tsx:28` resolves *any* URL hash through `getElementById`, so the mechanism is live and the renames are a named browser-gate check rather than a silent change.

**Also corrected: do not add a default class to `FormattedAmountInput`.** All 12 of its call sites (`finance-forms.tsx:128,394,818`, `dues-forms.tsx:116,331,409`, `event-budget-allocation-fields.tsx:92`, `correct-transaction-modal.tsx:122`, `record-transaction-modal.tsx:836`, `event-category-management-modal.tsx:393,708`, `event-budget-ceiling-modal.tsx:158`, `event-ticket-tier-modal.tsx:260`) pass an explicit `className`, so a `className ?? CONTROL` fallback inside the component would never fire. The compliant sizing belongs at the call sites — which is what the `CfFieldLayout` ruling above does for the three inside `finance-forms.tsx`. The other nine call sites are Phase 2, not this task: record them in the commit body alongside the Step 6 grep count rather than migrating them here. `inputMode="numeric"` at `formatted-amount-input.tsx:123` must survive, and formatting is verified at the browser gate.
**Ruling during implementation (Files list vs Step 5, `pay-dues-modal.tsx`) — CORRECTED by the Task 4 review.** The original text of this ruling claimed neither sub-floor control was migratable. That was wrong on the first half and the plan now says so: `pay-dues-modal.tsx:496-510` is a `type="file"` `<input>`, which `CfTextField` *does* express (`React.InputHTMLAttributes<HTMLInputElement>` carries `type`, `accept`, `required`, `name`, and `onChange`), and its measured box is ~32px tall (`p-2 text-xs`) in the most-used phone money path — which is this task's own charter, not Phase 2 work. It is migrated in the fix round, with the existing `file:*` pseudo-classes moved into `className` so the styled picker button survives and `label` becoming the primitive's sentence-case `text-sm` string (keeping the `*`, which `CfFieldLayout` renders as label text). Only the `<textarea>` at `:523` stays deferred, and for the honest reason: this task's contract produces no `CfTextarea`. Recorded as Phase 2 with line numbers.

- [ ] **Step 6: run everything** — `node --test tests/form-control-baseline.test.mjs`, `npm test`, `npm run lint`. Then grep for what is left, to size the remaining migration honestly: `grep -rn 'h-10 .*text-xs' src --include=*.tsx | wc -l`. Record the count in the commit body; the rest is Phase 2, not a silent omission here.
### Task 4 review round — rulings on the seven Importants (controller, after `f602758`)

Each finding below was re-measured against the tree before being ruled on. All seven were factually correct.

1. **Inert button-floor assertion — FIX.** `tests/form-control-baseline.test.mjs:63` matches `/"(default|compact|large|icon)":\s*"([^"]+)"/g`, but `cf-button.tsx:45-48` keys are unquoted, so `sizes` is always `[]` and the loop body never runs; only the separate `icon:` assertion at `:67` has teeth. Use `/\b(default|compact|large|icon):\s*"([^"]+)"/g` **and** add `assert.equal(sizes.length, 4)`. The length guard is the point: without it, the next key rename or indent change re-inerts this test silently, which is the same failure mode this task already fixed once for `-desc`.
2. **Control radius contradicts the design contract — FIX.** DESIGN.md:23 is "Cards use a restrained 12px radius; controls use 10px", and `CONTROL` (`cf-field.tsx:12`) uses `rounded-xl` = 12px = the *card* token. The repo already declares `--radius-control: 0.625rem` at `globals.css:142`, but it lives in `:root` (block opens `:74`), **not** in `@theme` (`:53`-`:68`), so no `rounded-control` utility exists (zero uses in `src`, and none in the emitted CSS). Ruling: use `rounded-[var(--radius-control)]` in `CONTROL` — one line, hits the contract value exactly, consumes the existing token, and does not require the `@theme` promotion that would put all 390 `rounded-xl` uses in scope. Step 4's build must prove the emitted rule resolves to `0.625rem`; the suite reads source, never the cascade. Promoting `--radius-control` into `@theme` is Phase 2.
3. **`{...props}` last can clobber the derived a11y wiring — FIX (small).** In both primitives the spread sits after `aria-describedby`/`aria-invalid` (`cf-field.tsx:93-98`, `:124-129`), so a caller passing either silently wins over the derived value. No consumer does today, so this is latent, not active. Fix by moving `{...props}` **before** the derived attributes; `className` is destructured out and merged explicitly, so the caller override channel is unaffected. The reviewer's second half — `hint` has zero consumers — is declined: the prop is brief-mandated, and `CfFieldLayout`'s `hintId` is what makes the money-field `aria-describedby` wiring provable at `:41-52`.
4. **Two error presentations, and a live-region flip on the two amount fields — PARTIAL.** Verified: `error={` appears exactly twice (`finance-forms.tsx:120`, `:352`, both `fieldErrors.amount_ngn`) while `FormFieldError` still renders 8 times in the same file, and both paths appear on one screen, so a phone user sees an 11px icon'd error and a 14px plain one side by side. Also verified: `form-feedback.tsx:30` sets an explicit `aria-live="polite"` (which overrides `role="alert"`'s implicit assertive) whereas `CfFieldLayout`'s paragraph has only `role="alert"`, so those two fields' announcements did flip polite → assertive. Ruling: **keep both implementations and the assertive behaviour, change no code.** Assertive is the correct live politeness for an error that appears in direct response to the user's own submit, and unifying the components would mean either (a) demoting the primitive's text back to `text-[11px]`, which this task's own legibility rule rejects, or (b) appending `text-sm` over `text-[11px]` on one element — the emission-order coin flip this plan has twice refused. Cross-file component unification is a design-system decision for Phase 2. Do: assert `role="alert"` in the primitive so the choice is pinned and cannot drift back silently, and name the duplication + the flip in the commit body as reasoned deviations.
4b. **Item 4 re-ruled during the fix round — the pin was the wrong remedy.** Reading those six sites in order to write the pin showed *why* they were hand-wired: `finance-forms.tsx:181`, `:214`, `:413`, `:447`, `:477`, `:503` had been migrated to the primitives for sizing while still carrying their own `aria-describedby` + `aria-invalid` + error `className` + a sibling `FormFieldError`. That is the duplication, and it is removable inside this task, so it was: all six now pass `error=` (and `hint=` where an 11px constraint line sat under the control) to the primitive, and the file renders **zero** `FormFieldError` (8 → 0). Consequences accepted deliberately — error text 11px → 14px and announcements polite → assertive at six more fields, consistent with the two amount fields item 4 already approved. `FormFieldError` itself is untouched (the events modals still use it); unifying the two components remains Phase 2. The superseded assertion at `tests/required-field-validation.test.mjs:88` was updated to follow the new owner of that wiring with its message assertions intact, and gained a `doesNotMatch` so a second implementation cannot creep back. Also in-charter, from the same reading: `cat-name` (`h-9`, stacked, error-bearing) became a `CfTextField`, and `retire-reason` — an inline row control with a `visually-hidden` label, which the primitive therefore does not fit — was resized to `min-h-[44px] text-base`, matching the 44px `compact` Retire button already beside it. The file now has no sub-44px form control.
5. **Four modal hosts now clip their own forms — FIX, in charter.** This task added ~8px to every migrated control, and four hosts render those forms with no scroll container while their panels carry `overflow-hidden`: `record-income-modal.tsx:70`, `record-expense-modal.tsx:78`, `void-transaction-modal.tsx:60`, `correct-transaction-modal.tsx:74` (all four `<div className="p-6">`, panels at `:39`/`:47`/`:29`/`:43`). On a short phone viewport the submit row becomes unreachable with no scrollbar and no page scroll, which is the reachability class Phase 1 exists for. Fix each content div the way the siblings already do — `max-h-[75vh] overflow-y-auto`, per `category-management-modal.tsx:60` and `pay-dues-modal.tsx:174` — and pin it in the new test (each of the four hosts must contain a `overflow-y-auto` region). `pay-dues-modal.tsx` already scrolls and needs nothing. **CORRECTED during Task 4 fix round 2 (B-1):** the exemplar this item pointed at is itself defective, and the cap it prescribed does not hold under a mobile browser's chrome — see the B-1 entry in the fix-round report. `max-h-[75vh]` resolves against the *large* viewport on iOS Safari and Chrome Android while the `fixed inset-0` backdrop tracks the *visible* one, so the four hosts were re-capped at `max-h-[calc(100dvh-7.5rem)]` (the 7.5rem is the modal's own chrome: 2rem of backdrop padding + the 81px header + 7px of slack). **CORRECTED AGAIN during Task 4 fix round 3 (N-1): that cap moved the arithmetic without leaving any room for it to be wrong.** `panel = header + body-cap`, so the identity holds only while the header stays ≤88px — and 81px is the *wide-viewport* header. At a 360px viewport the panel is 328px, the header's `p-5` + 40px icon + `gap-3` + ~44px close button leave the text column ≈190px, and titles like "Record Institutional Disbursement" (33ch) at `text-base font-extrabold` wrap to two 24px lines over a 12px subtitle that wraps to two or three: a 121-137px header, i.e. the panel 33-49px past the backdrop box and the submit row clipped again — on exactly the width this item exists for. The shipped shape caps the **panel** instead and lets the body absorb the remainder: `flex flex-col max-h-[calc(100dvh-2rem)]` on the panel (`2rem` = the backdrop's own `p-4`, so nothing is guessed), `shrink-0` on the header, `flex-1 min-h-0 overflow-y-auto` on the body. No viewport arithmetic survives in the markup, which is the point: any constant this file picks is a bet about wrapped text. `pay-dues-modal.tsx` is the only structurally safe host in the set — backdrop `overflow-y-auto` at `:129`, panel `my-8` at `:138`, and a pinned footer outside the capped body at `:543` — and needs none of this. **Round 3's claim that `:171` was "the precedent followed" was overstated and is corrected here:** `flex flex-col flex-1 overflow-hidden` at `:171` sits on a `<form>` inside a panel that carries **no** viewport cap, and that file's own scroll body at `:175` is still `max-h-[75vh]`. So the shape round 3 adopted (cap the container, let a `flex-1` child absorb the remainder) has a partial cousin in this repo, not a precedent, and pay-dues' safety comes from the three properties named above rather than from its flex plumbing. **`category-management-modal.tsx:60` is a fifth host with the same latent clip and is deliberately left unfixed**: identical block panel with `overflow-hidden`, no backdrop scroll, no `my-8`, and its own Close/Cancel rendered inside the capped body. Named here as a Phase 2 item because the finding that produced the fix did not name it; silently patching a fifth file under a four-file finding is how scope contracts stop meaning anything.
6. **Five raw sub-44px buttons left in the migrated file — FIX.** Four Cancel-type `<button>`s at `:252`, `:530`, `:859`, `:920` are `min-h-[40px]` (computed 40px: `py-2.5` + `text-xs` + border), and the "Close" at `:698` has **no** height floor at all (~32px from `py-2`). None were in the commit body's Phase 2 inventory, and they sit in money-entry paths, so they are this task's charter, not Phase 2's. Raise all five to `min-h-[44px]`, delete the now-redundant `min-h-[40px]` passed to the four `FormSubmitButton` call sites (`:259`, `:538`, `:866`, `:928` — harmless against `h-12` but it is a second owner of the same height, the trap Task 3 already logged), and extend the forms assertion with `assert.doesNotMatch(forms, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/)` so the file has no sub-44 floor left.
7. **Pay-dues file input — FIX, per the corrected ruling above.** Migrate `pay-dues-modal.tsx:496-510` to `CfTextField`; leave `:523`'s `<textarea>` with a reason that is actually true.

Mutation-proven gaps the reviewer found in the suite (a migrated control losing `name` or `required`, a dangling `htmlFor`, a dropped `FormFieldError` and its `aria-describedby`, `CONTROL` shrunk to `min-h-[2rem] text-sm` while the docstring keeps the literals, all three non-icon button sizes below the floor) are covered by items 1, 2, 5 and 6 above. **CORRECTED during Task 4 fix round 2 — the tail of that sentence was false as written, and Tasks 5-7 must not reuse it.** It claimed the remaining gaps "are properties of a 22-control migration that no source-text test can assert, so they go on the browser gate rather than into more regex". A primitive block is one contiguous attribute list, so those properties *are* assertable from source text: `tests/form-control-baseline.test.mjs` ("keeps every migrated control block's field wiring intact") now splits `finance-forms.tsx` on `<CfTextField|CfSelect|CfFieldLayout`, measures all 23 blocks, and pins (a) that a block rendering `error={fieldErrors.X}` clears the same key `X`, (b) that every block names the field it submits, (c) that no two literal `id=` values collide, and (d) the `required` inventory. Each rule was mutation-proven by the regression it exists to catch. Task 5's 9-control and Task 6's 12-control migrations write the same pin; they do not get to skip it on the strength of the discarded clause. When they copy it, copy the **block extraction**, not just the rules: a block must be captured through its own terminator (`/>` for a self-closing control, `</Tag>` for a container), because the lazy `(?:\/>|<\/(?:…)>)/` alternation stops a `CfFieldLayout` at its wrapped control's `/>` and silently narrows what rules (a)-(d) inspect — inert on the file that shipped it, and a trap for every file that copies it. What genuinely remains gate-only is whatever the cascade or the viewport decides, not whatever the regex is too lazy to parse: a control's **computed** height, which of two same-property utilities wins in generated CSS, whether iOS focus-zoom fires, and whether a capped modal body is actually reachable under a real browser toolbar.

- [ ] **Step 7: browser check** on `/finances` and the Pay Dues modal: every control >=48px tall, text >=16px, focus ring visible, and on a real device (or DevTools "mobile" with a throttled device) **focus does not zoom the page**. *Deferred by controller ruling to the consolidated gate after Task 7. The gate must also look at the label typography change (11px uppercase -> `text-sm` sentence case) and at dense modal footers, where `compact` buttons growing 32px -> 44px may wrap a row.*
- [ ] **Step 8: commit** — `git commit -m "feat(ui): add compliant text/select primitives and raise the button floor to 44px"`

---

### Task 5: Dashboard tab strip becomes tappable and obviously scrollable

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:551-580` (tab strip: outer scroller `:551`, pill row `:552`, pill `className` `:560`) and `:421` (the "back to events" link, `min-h-[36px]`)
- Test: `tests/dashboard-tab-strip.test.mjs`

**Why:** the audit measured the strip at 413px client / 877px scroll — 8 pills of `min-h-[38px]` with `gap-1` (4px). Two problems: 38px targets below the 44px floor, 4px gaps, and no affordance at all that the strip scrolls, so 4 of 8 tabs are effectively undiscoverable on a phone. The `justify-between` on an `overflow-x-auto` container also collapses to nothing useful once content overflows.

**Corrected by the Task 5 review round (read before executing):** the 877px baseline was taken at `text-xs`/`gap-1`, and the shape this task ships widens it to ≈1,006px (487px of label text × 14/12, plus the wider `gap-2`/`w-4`/`p-1.5` overhead), which through the `16rem` sidebar stops clipping only at ≈1,376px. So the overflow is a **content**-based condition that reaches into the tablet band, while this task's original hint cutoff was **viewport**-based at 640px — see the review-round block after Step 6 for the ruled value, the 48px pill floor, and the element-scoped pins.

- [ ] **Step 1: failing test**

```js
// tests/dashboard-tab-strip.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/event-dashboard-view.tsx", import.meta.url),
  "utf8",
);

describe("dashboard tab strip", () => {
  it("meets the 44px target floor and 8px separation", () => {
    assert.match(source, /min-h-\[44px\]/);
    assert.doesNotMatch(source, /min-h-\[(2[0-9]|3[0-9]|4[0-3])px\]/);
    assert.match(source, /gap-2 p-1\.5/);
  });

  it("scrolls as a labelled focusable region", () => {
    assert.match(source, /<TableScroll[^>]*label="Dashboard sections"/);
  });

  it("tells phone users the strip scrolls", () => {
    assert.match(source, /Swipe right for more sections/);
  });
});
```

- [ ] **Step 2:** `node --test tests/dashboard-tab-strip.test.mjs` → 3 failures.

**Corrected by the Task 5 review round — this Step 1 test does not test what its headings claim.** Reproduced against the shipped file: deleting *only* the pill's floor token leaves it 4/4 green, as do the `rem` spelling of a sub-floor height, the bare numeric scale form, a floor small enough to sit below the token filter's own lower bound of 20, and a decoy element elsewhere in the file carrying the row's exact class substring while the real row is flattened. The two `assert.match` calls are substring tests over an 824-line file, not assertions about the strip. The replacement is slice-then-parse: cut the source from `tabs.map(` to the `</TableScroll>` that closes it, read the pill's own `className` literal, convert every floor form to px (`px`, `rem`, and the bare scale form at 4px per step — `--spacing` is Tailwind's default `.25rem` here, with no override in `globals.css`), then assert one floor exists and that it is ≥ the ruled value. Same treatment for the row's gap and padding (numeric bounds, so a wider gap passes and a narrower one fails) and for `aria-current` (on the button's own tag, accepting any current-value spelling). Order-dependent conjunctions are the wrong tool: they go red on improvements and green on decoys.

**And a rule this task's own build proved, which binds every later step in this plan:** with no `@source` directive, Tailwind scans tracked markdown, so **a class literal written in prose here emits a real rule in the production bundle.** The `max-sm` block variant appears nowhere in `src`, yet its display rule ships, because this file names it in markup syntax. When describing a class you do not intend to ship, name it in words, not in bracket or variant syntax — otherwise the review notes themselves grow the stylesheet, and an emitted-CSS grep stops being evidence about markup.

- [ ] **Step 3: rewrite the strip** at `event-dashboard-view.tsx:552-579`:

```tsx
<div className="pt-2 border-t border-[#E5DDD3]">
  <TableScroll className="rounded-xl" label="Dashboard sections">
    <div className="flex w-max items-center gap-2 p-1.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 min-h-[44px] cursor-pointer border-0 ${
              isActive
                ? "bg-[#174C37] text-white shadow-xs font-semibold"
                : "bg-transparent text-[#5C4638] hover:text-[#174C37] hover:bg-white/80"
            }`}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            type="button"
          >
            <Icon className={`w-4 h-4 ${isActive ? "text-[#D6A23A]" : "text-[#7A685D]"}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  </TableScroll>
  <p className="mt-1.5 text-xs text-[#7A685D] sm:hidden">
    Swipe right for more sections
  </p>
</div>
```

`aria-current="page"` is the active signal, so the green fill is reinforcement rather than the only cue (DESIGN.md:26). `text-xs` -> `text-sm` here is *non*-control text at 14px, which is fine — the 16px rule applies to inputs. Import `TableScroll` by path, `@/components/ui/table-scroll` — all seven existing consumers do (`tab-expenses.tsx:14`, `tab-revenue.tsx:15`, `tab-tickets.tsx:6`, `tab-audit-log.tsx:7`, `tab-budget-allocations.tsx:5`, `tab-reports.tsx:4`, `event-domain-ledger.tsx:15`), and Biome's import sort puts it between `flash-card` and `use-success-notice`. The barrel does re-export it (`index.ts:8`), so both work; matching the codebase is the point. (Corrected by the controller pre-flight: this step originally said `@/components/ui`.)

**Corrected before dispatch (controller pre-flight, Task 5).** The hint line above originally read `className="… hidden max-sm:block"`. Two reasons that is the wrong spelling here:

1. **`max-*` variants are used nowhere in this codebase** (`grep -rhoE '\bmax-(sm|md|lg|xl)…' src --include=*.tsx` returns zero hits), while the min-width forms appear on every other page (`sm:p-` ×70, `sm:flex-row` ×65). The reasoning that mattered here is the second half, and it survives intact: with a base `hidden` plus a `max-*` override, any failure of the override leaves the hint **display:none on the phones this task exists to serve, while a source-text test that only asserts the copy exists stays green**. `hidden` on a `<p>` in normal flow is unconditional; `.hidden{display:none}` is emitted in the very chunk this route loads.
2. **The first half of that reason was wrong, and Task 5's own build proved it.** The `max-sm` block variant *does* compile in this repo — the rule is in `static/chunks/26jovufx2oiwp.css` — but not because `src` uses it: this plan writes the literal in prose, and Tailwind v4 auto-detection (no `@source` directive at `globals.css:1`) scans tracked markdown. The gitignored SDD workspace is **not** scanned (canary: the 60px floor named only in `task-5-report.md` is absent from the bundle, and the `max-md`/`max-lg` variants, named in neither `src` nor `docs`, are absent too — so there is no safelist and the emitter is genuinely literal-driven). Consequence for every remaining step: **an emitted-CSS grep proves a utility compiles and ships, never that the markup in front of you produced it.** Say "the selector token I shipped has a rule in the chunk this route loads" and nothing stronger.
3. **The cutoff itself is the defect, not the mechanism** (Task 5 review, I-2). A `sm`-width hint switch turns the cue off at 640px while the row this task ships needs ≈1,006px and stops clipping only near 1,376px, so 641-1023px touch users — Task 6's band included — get a clipped strip and no cue, and the region's own edge fades do not rescue it (the pill row is the only one of nine `TableScroll` consumers whose direct child paints opaque across the whole box). Ruled to the `lg` cutoff in fix round 1, with the pin relaxed to accept any min-width `hidden` so a later band ruling is one file, and the two guards that earn their keep (no base `hidden`, no `max-*`) kept.

- [ ] **Step 3b: raise the back link** at `event-dashboard-view.tsx:421` from `min-h-[36px]` to `min-h-[44px]` — it lives in the same header card and the file-level test cannot pass while it stays under the floor.
- [ ] **Step 3c (added by the Task 5 review, I-3): raise the conditional sibling in the same row.** The "Minutes & Attendance" `<Link>` at `:431-437` carries `px-3 py-1.5` with `text-xs` and **no floor token at all** — 6+6 padding + a 16px line + a 2px border ≈ **30px** — beside the back link this step raises to 44px. It is hidden unless the event has attendance or minutes enabled, which is why the token sweep missed it: a control with no `min-h-` in its class list is invisible to a `doesNotMatch` filter, exactly like a deleted floor. Add the floor; a link is an "interactive target" under DESIGN.md:25 even though it is not a button.
- [ ] **Step 4:** re-run, `npm test`, `npm run lint`, then `npx next build` and confirm the shipped utilities reach the emitted CSS (see the pre-flight note above — the source-text test cannot prove a breakpoint compiles, and presence in the bundle is not per-file provenance). Do **not** grep for `max-width:40rem`: that is a false positive here, because this Tailwind emits the `sm` breakpoint as a **min**-width query and the two matches in the bundle are `.container` and a hand-written sign-in panel rule. Grep the selector token instead, inside the chunk the route's `page_client-reference-manifest.js` lists, and report which chunk carried it.
- [ ] **Step 5: browser check** at 360px: the **last** tab reachable by swipe and by Tab — the strip's order is Overview, Tickets, Expenses, Budget & Allocations, Revenue, Reports, Team & Roles, Audit Log, so "Reports" is the **sixth** of eight, not the eighth (corrected by the review); the hint line visible only below its ruled cutoff; active tab announced by screen reader as current; computed pill height equal to the ruled floor, not to what `py-2` alone produces; `scrollWidth` against `clientWidth` at 360 / 640 / 768 / 897 / 1023 / 1280px, which is the measurement that decides whether the cutoff chosen here is the right one; and whether the scroll region's edge fades are visible behind an opaque pill row (expected: not). *Deferred by controller ruling to the consolidated gate after Task 7 — the gate owns every browser step in this plan.*
- [ ] **Step 6: commit** — `git commit -m "fix(events): enlarge dashboard tab targets and expose the strip scroll"`

**Task 5 review round — rulings the markup block above does not yet carry** (round 0 shipped at `42b5170` with the markup exactly as written here; fix round 1 applies these). Deliberately described in words, not in bracket syntax, for the reason two notes above:

1. **The pill floor becomes 48px**, per DESIGN.md:25's first clause ("inputs and buttons are at least 48px high"), and the pin asserts a parsed `>= 48` on the pill's own class list. The 44px in the block above is this plan's *hand-rolled-button* precedent (raised five raw buttons to 44px in Task 4, and `src` carries 49 uses of that floor against zero of a 48px one), so 48px is a new precedent for a raw button and is ruled for the strip alone: the three quick-action buttons in this same card, at 44px, are logged Phase 2 rather than widened here.
2. **The hint's cutoff moves from the `sm` width to the `lg` width** (I-2), the pin accepts any min-width `hidden` spelling, and it additionally forbids the screen-reader-only and `aria-hidden` shapes that make the cue invisible while the string still exists.
3. **Every pin becomes element-scoped and parsed** (I-1, ruling 3), including a file-wide floor sweep that resolves the `px`, `rem` and bare-scale forms to pixels and reports the offending token — which is also what closes the same hole in Task 4's two px-only token filters at `tests/form-control-baseline.test.mjs:307` and `:318`, retrofitted there as a Phase 2 item rather than in this round.
4. **`aria-current` keeps the value `"page"`** — the controller's premise that nothing in the strip navigates was disproved by the reviewer and re-measured: `selectTab` (`:218-225`) rewrites `?tab=` plus a `#event-finance-` hash that `page.tsx:796` reads back, with a `hashchange` listener at `:195-216`. What changes is the pin: it must name the pill's own opening tag, because the shipped one hard-codes the value (so the other legal spelling fails a test that was guarding nothing) while `aria-current` on the pill's inner `<span>` — the actual bug — passes it.
5. **The import-path assertion is dropped.** Pinning the module specifier makes a purely internal barrel move a two-file change; the JSX usage plus the build is the contract, and a specifier belongs in the component's own module test if anywhere.
6. **Declined, with reasons:** the full tablist conversion (invalid unless `tablist`/`tab`/`tabpanel`/`aria-selected` all ship at once, none appears in `src`, and roving tabindex contradicts Step 5's own reachability-by-Tab requirement); any `globals.css` change for the occluded edge fades (nine consumers, eight of them tables that need the current paint); a shared floor-parser helper across test files (real, Phase 2); and re-wording the hint, which is approved copy — though the pin now matches a substring so a wording fix costs one file.
7. **Two counts in this task's steps were wrong and are corrected here so Tasks 6-7 do not copy them:** Step 1's block list is four `it` blocks (the round-0 brief said five), and Step 2's expected failure count was 4, not 3.

---

### Task 6: One navigation between 897 and 1023px

**Files:**
- Modify: `src/app/globals.css` `@theme` block (`53-68`)
- Modify: `src/components/app-header.tsx:232`, `:242`, `src/components/mobile-app-menu.tsx:45`
- Delete: the 12 dead selectors listed in Step 5, found by name in `src/app/globals.css`
- Test: `tests/mobile-nav-breakpoint.test.mjs`

**Why:** the sidebar disappears at `max-width: 56rem` = 896px (`globals.css:4060`, whose live rules are `.app-shell` at `:4061` and `.app-sidebar` at `:4065`) but the hamburger is `lg:hidden` = visible until 1024px. Between 897 and 1023 the user gets **both** navs. The rule that was supposed to resolve this — `.app-mobile-header` — exists only in CSS; no component ever used it, so it has been dead since it was written.

**Corrected before dispatch (controller pre-flight, Task 6).** Two defects that would have shipped damage:

1. **The delete list's line ranges straddle live CSS, and Task 2 shifted them.** `.app-mobile-header` is not in four tidy groups at `3984-3986` / `4061-4098` / `4626` / `4730-4742`: it is **12 selectors** at `:3979`, `:4069`, `:4083`, `:4087`, `:4091`, `:4634`, `:4738`, `:4743`, `:4747`, `:4751`, plus `.app-mobile-actions` at `:4096` and `:4103`. And the `4061-4098` range, taken literally, deletes `.app-shell { display: block }` (`:4061-4063`) and `.app-sidebar` (`:4065-4067`) — **the live mobile layout switch**. Deleting those changes the app shell at every phone width, and no test in the suite would notice, because every test here is a source-text regex on class strings. Step 5 therefore names the selectors and forbids the ranges; delete by selector text, and confirm `:4061` and `:4065` still exist afterwards.
2. **`.app-brand`, `.app-brand-logo`, `.app-brand-slogan` and `.app-signout-form` are live classes** (`app-shell.tsx:47,53,60` renders the brand; the sign-out form is real). Only their *descendant* forms under `.app-mobile-header` / `.app-mobile-actions` are inert. Step 5 must not touch a standalone `.app-brand*` rule.
3. **`hidden max-nav:flex` written after a base `flex` works only by emission-order luck.** Step 4 as written produced `className="flex items-center hidden max-nav:flex"`, i.e. two base-level `display` utilities on one element. Measured in this build's own output (`.next/static/chunks/22jx0s314z00c.css`): `.block` at byte 15262, `.flex` at 15310, `.grid` at 15329, `.hidden` at 15348 — so `hidden` currently wins the tie and the hamburger does hide. But that is the identical coin-flip this plan rejected in Task 4 for competing `focus:ring-[…]` utilities, and it is free to change with a Tailwind bump. Step 4 now removes the base `flex` instead, leaving exactly one base `display` utility and one media variant.

- [ ] **Step 1: failing test**

```js
// tests/mobile-nav-breakpoint.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app-header.tsx", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/components/mobile-app-menu.tsx", import.meta.url), "utf8");

describe("single navigation per viewport", () => {
  it("declares the nav breakpoint token", () => {
    assert.match(css, /--breakpoint-nav:\s*56rem/);
  });

  it("hides the hamburger at the sidebar breakpoint, not at lg", () => {
    assert.doesNotMatch(header, /className="flex items-center lg:hidden"/);
    assert.match(header, /hidden max-nav:flex items-center/);
    assert.doesNotMatch(menu, /lg:hidden/);
    // One base display utility per element: `flex` + `hidden` together would be
    // resolved by generated-CSS order, not by the class string.
    const doubleDisplay = [
      ...header.matchAll(/className="([^"]*)"/g),
      ...menu.matchAll(/className="([^"]*)"/g),
    ].filter((m) => {
      const base = m[1].split(/\s+/).filter((c) => !c.includes(":"));
      return base.filter((c) => c === "flex" || c === "hidden" || c === "block" || c === "grid").length > 1;
    });
    assert.deepEqual(doubleDisplay, [], `two base display utilities on one element: ${doubleDisplay.map((m) => m[1])}`);
  });

  it("keeps the live mobile layout switch that sits beside the dead rules", () => {
    // Step 5 deletes 12 dead selectors from the same @media block that carries
    // the live rules; without this guard a range-delete passes every other test.
    // There are eight `@media (max-width: 56rem)` blocks in this file, so the
    // extractor must find the one holding the layout switch, not the first.
    // `\n\}` relies on Biome indenting inner closers (the target block runs
    // 4060-4107 with no column-0 brace until its own). If that changes, fix the
    // extractor — do NOT weaken the three asserts.
    const blocks = [
      ...css.matchAll(/@media \(max-width: 56rem\) \{([\s\S]*?)\n\}/g),
    ].map((m) => m[1]);
    assert.ok(blocks.length >= 2, `expected several 56rem blocks, saw ${blocks.length}`);
    const layout = blocks.find(
      (b) => /\.app-shell\s*\{/.test(b) || /\.app-sidebar\s*\{/.test(b),
    );
    assert.ok(
      layout,
      "the 56rem mobile layout switch (.app-shell / .app-sidebar) has been deleted",
    );
    assert.match(layout, /\.app-shell\s*\{[^}]*display:\s*block/);
    assert.match(layout, /\.app-sidebar\s*\{[^}]*display:\s*none/);
    assert.doesNotMatch(layout, /\.app-mobile-(header|actions)/);
  });

  it("drops the never-used mobile header rules", () => {
    assert.doesNotMatch(css, /\.app-mobile-header/);
    assert.doesNotMatch(css, /\.app-mobile-actions/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-nav-breakpoint.test.mjs` → 3 failures.
- [ ] **Step 3:** add `--breakpoint-nav: 56rem;` inside the `@theme` block at `globals.css:53-68`. Tailwind v4 derives both `nav:` and `max-nav:` variants from any `--breakpoint-*` key.
- [ ] **Step 4:** delete the base `flex` and lead with `hidden` — one base `display` utility per element, so nothing depends on emission order:
  - `app-header.tsx:232`: `className="flex items-center lg:hidden"` → `className="hidden max-nav:flex items-center"`
  - `app-header.tsx:242` (the mobile brand Link): `className="flex items-center gap-2 lg:hidden text-inherit …"` → `className="hidden max-nav:flex items-center gap-2 text-inherit …"`, leaving `no-underline`, both `focus-visible:*` classes and `rounded-lg` untouched
  - `mobile-app-menu.tsx:45`: drop only `lg:hidden` from the scrim; `fixed inset-0 z-70 bg-black/20 backdrop-blur-[1px]` stays verbatim (`notice-methods-verification.test.mjs:483` asserts `fixed inset-0 z-70`). The scrim needs no display utility of its own — it is rendered inside the `:232` container, which already gates it.
  - Do **not** touch the outer left group at `:229` (`flex items-center gap-2.5 sm:gap-3 shrink-0`): it has no `lg:hidden` and is meant to be visible at every width. The Step 1 guard finds zero double-display strings in these two files today, so it is a regression guard, not a RED assertion — it must stay green.
- [ ] **Step 5: delete the dead selectors — by name, never by line range.** All 12 occurrences, in three regions:
  - `:3979` top-level `.app-mobile-header { … }`
  - inside the live `@media (max-width: 56rem)` block at `:4060-4107`: `.app-mobile-header` (`:4069`), `.app-mobile-header .app-brand` (`:4083`), `.app-mobile-header .app-brand-slogan` (`:4087`), `.app-mobile-header .app-brand-logo` (`:4091`), `.app-mobile-actions` (`:4096`), `.app-mobile-actions .app-signout-form button` (`:4103`). **Keep `.app-shell { display: block }` (`:4061`) and `.app-sidebar { display: none }` (`:4065`)** — they are the mobile layout switch and they sit in the same block. Step 1's fourth test exists precisely because deleting the block by range would otherwise pass every assertion.
  - the dashboard-shell variants `.app-shell-dashboard .app-mobile-header …` at `:4634`, `:4738`, `:4743`, `:4747`, `:4751`
  - Do not touch the live `.app-brand` / `.app-brand-logo` / `.app-brand-copy` / `.app-brand-name` / `.app-brand-slogan` rules (rendered at `app-shell.tsx:47,53,58-60` inside the sidebar), nor `.app-signout-form` itself, nor `.app-menu-toggle` (`:3987`) and `.app-menu-icon` (`:3995`) — those are live, used at `mobile-app-menu.tsx:33,38`.
- [ ] **Step 5b: update the superseded test.** `tests/notice-methods-verification.test.mjs:443` asserts `headerContent.includes("lg:hidden")`; after this task the header uses `hidden max-nav:flex`, so change that assertion to `headerContent.includes("hidden max-nav:flex")` and retitle the test to "...with the nav breakpoint". Do **not** touch `:483` (`menuContent.includes("fixed inset-0 z-70")`) — the scrim keeps those classes; only its `lg:hidden` leaves.
- [ ] **Step 6:** `node --test tests/mobile-nav-breakpoint.test.mjs`, `npm test`, `npm run lint`. Then `npx next build` and prove the variant actually compiles: the emitted CSS must contain a `max-nav` rule at `(width < 56rem)` (grep the chunks for `max-nav`). A `--breakpoint-nav` key that Tailwind did not pick up leaves **both** navs rendered between 897 and 1023 — the exact blocker this task exists to remove — while all four source-text tests stay green, because they read the class string, not the cascade. Record the chunk file that carried it.
- [ ] **Step 7: browser check** at 900px, 1000px, 1024px: exactly one primary nav visible at each; at 880px the hamburger works and the sidebar is gone. `document.querySelectorAll('nav[aria-label="Mobile primary navigation"]')` must be 1 and the sidebar `<nav>` hidden.
- [ ] **Step 8: commit** — `git commit -m "fix(nav): align hamburger with the sidebar breakpoint and drop dead mobile-header CSS"`

---

### Task 7: viewport meta + Phase 1 regression gate

**Files:**
- Modify: `src/app/layout.tsx:33-48`
- Test: `tests/mobile-viewport.test.mjs`

**Why:** `layout.tsx` exports `metadata` but no `viewport`, so the header colour matches nothing on a phone and the safe-area work in Task 2 has no declared intent. Also `userScalable` must stay enabled — disabling zoom is a WCAG 1.4.4 failure and worth an explicit guard now that we are touching responsive fundamentals.

- [ ] **Step 1: failing test**

```js
// tests/mobile-viewport.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");

describe("viewport export", () => {
  it("exports a viewport with a theme colour", () => {
    assert.match(layout, /export const viewport: Viewport =/);
    assert.match(layout, /themeColor:\s*"#f7f6f2"/);
  });

  it("never blocks pinch zoom", () => {
    assert.doesNotMatch(layout, /maximum-scale|user-scalable=no/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-viewport.test.mjs` → 1 failure.
- [ ] **Step 3:** in `layout.tsx` add `import type { Metadata, Viewport } from "next";` (extend the existing `Metadata` import at `:1`) and, above the `metadata` export at `:33`:

```ts
export const viewport: Viewport = {
  themeColor: "#f7f6f2",
  width: "device-width",
  initialScale: 1,
};
```

**Corrected before dispatch (controller pre-flight, Task 7).** The value above was `#073523`. That is wrong for this app, and the measured record is:

- `themeColor` appears **nowhere in `src/`** today (`grep -rn 'themeColor' src` → no matches), so nothing is being corrected — the tag is simply absent, and Step 2's single RED is that absence.
- What the phone actually shows under the status bar is `.app-sticky-header`, `background: rgb(247 246 242 / 97%)` (`globals.css:3962`) — a **light** surface. There is no dark variant: `grep 'app-shell-dashboard .app-sticky-header'` returns nothing, so the dashboard shell keeps the same light header and only its *menu panel* is forest (`#073523`).
- `#073523` must be opaque in `themeColor` anyway (a translucent chrome colour cannot be declared), and a dark status bar above a light header is a visible mismatch on every member page, which is worse than today's absence. So: `#f7f6f2`, the header's own colour, not the brand's.
- `width: "device-width"` and `initialScale: 1` re-declare what Next already emits — the built HTML carries exactly `<meta name="viewport" content="width=device-width, initial-scale=1">`. They are kept so the intent is declared in source rather than inherited from a framework default, which is what the safe-area work in Task 2 assumes. This changes no rendered byte; review should not read it as a behaviour change.
- Two claims from the audit trail are **disproved and must not be acted on here**: there is no `src/components/auth/login-view.tsx` (no `login*` file exists under `src/`), no `Club Members` string anywhere in `src/`, and the sidebar brand at `app-shell.tsx:44-62` lives *inside* `<aside className="app-sidebar">`, which `.app-sidebar { display: none }` hides below 897px — so it is not duplicated on phones. Fonts are also fine: `layout.tsx:9` and `:21` load DM Sans *and* IBM Plex Sans through `next/font/local` from `src/fonts/*.woff2`, so `--font-ibm-plex-sans` is backed by a real file and `localFont` already ships `font-display: swap`.
- The real Phase 2 typographic item is unrelated to this task: `globals.css:55` and `:130` list `var(--font-dm-sans), "DM Sans", var(--font-ibm-plex-sans), "IBM Plex Sans", ui-sans-serif…` — the generic family names sit *after* the loaded variables, so they only matter if the variable itself fails to resolve.

- [ ] **Step 4:** `node --test tests/mobile-viewport.test.mjs`, `npm test`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Phase 1 gate.** Against the production build on `:3001`, run the audit's own probes and require them all clean:

```js
(() => {
  const small = [];
  const clipped = [];
  for (const el of document.querySelectorAll("input,select,button,a,[role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.height < 44) small.push(`${el.tagName}.${el.className}`.slice(0, 90));
    if (r.width > 0 && r.right > window.innerWidth + 1) clipped.push(`${el.tagName}.${el.className}`.slice(0, 90));
  }
  const deadClip = [...document.querySelectorAll("*")].filter(
    (el) => getComputedStyle(el).overflowX === "clip" && el.scrollWidth > el.clientWidth + 1,
  ).length;
  return { deadClip, pageWide: document.documentElement.scrollWidth > window.innerWidth, small, clipped };
})();
```

Expect `deadClip === 0`, `clipped === []`, `pageWide === false`. `small` will still list the ~106 unmigrated controls from the rest of the app — that is the Phase 2 backlog; **record it, do not chase it here.**
- [ ] **Step 6: commit** — `git commit -m "feat(seo): declare an explicit viewport with the portal theme colour"`

---

### Out of scope for Phase 1 (each needs its own plan)

- **DESIGN.md:32 card fallbacks** replacing the 7-column revenue/expenses/audit tables on phones. Task 1 makes the data *reachable*; making it *readable* is the density phase.
- **Home/dues/finances duplication** — the 1,035px Quick Access section, the restated summary tiles, the decorative reassurance lines, the 3 pay-dues triggers. The chosen direction is "delete duplicates outright"; that is a content decision per card and deserves its own review, not a blocker PR.
- **The remaining ~74 sub-44px controls and ~106 small targets** outside the money-entry paths.
- **Dead CSS deletion of the `slk-*` block** (~1,580 lines, includes the only `min-height: 100vh`).
- **`/finances` "Ledger Data Unavailable"** — partly local DB drift (`event_ticket_sales` missing `verification_*` columns), partly the non-actionable copy. Neither is a responsive fix.

### Verification limitations to disclose in review

The audit's browser surface was locked at a 510x425 viewport and `X-Frame-Options: DENY` blocks iframe emulation, so no task here can prove 360px behaviour from the harness alone. Every browser step must be re-run once on a real device or a resized desktop window before the phase is called done.
