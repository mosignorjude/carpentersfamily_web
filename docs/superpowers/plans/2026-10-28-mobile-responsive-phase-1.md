# Mobile Responsive Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two audited mobile blockers (financial table content unreachable at phone widths; the mobile navigation panel extends past the viewport so lower items and Sign out are untappable) and land the shared form-control / touch-target baseline the rest of the responsive work depends on.

**Architecture:** Two surfaces change. (1) `src/app/globals.css` — the live rules that cause the blockers get `max-height` / `overflow-y` / safe-area and lose the silent `overflow-x: clip`; a new `.table-scroll-region` class becomes the single horizontal-scroll primitive. (2) `src/components/ui/` — a `CfTextField` / `CfSelect` pair joins the existing `CfButton`, sized to the DESIGN.md floor (>=48px, >=16px text), and the money-entry call sites adopt it.

**Tech Stack:** Next.js 16 App Router, React 19.3.1, Tailwind CSS v4 (`@tailwindcss/postcss`), Biome 2.5.5, `node --test`.

**Spec:** the heuristic audit run on 2026-10-28 (report-only, so it was never written to disk — this plan is the only durable artefact of those findings).

## Test harness (read before writing your first test)

This repo does **not** use jsdom or Playwright. Tests are `node:test` files that `readFileSync` a source file and `assert.match` its text. See `tests/event-dashboard-expenses-ui.test.mjs` as the template. Every task therefore has (a) a source-assertion test that runs in CI, and (b) a browser step run once against the production build.

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
| `src/components/app-header.tsx`, `mobile-app-menu.tsx` | `lg:hidden` -> `max-nav:hidden` so one nav per width |
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

`#f0a89e` on `#073523` computes to **7.0:1** (fg relative luminance 0.4899, bg 0.0271). The button stays a destructive action by label and position, so colour is reinforcement rather than the only signal — DESIGN.md:26 holds. `var(--brand-ochre)` = `#d6a23a` measures **5.89:1** on `#073523` — clear of the 3:1 WCAG 2.2 AA bar for non-text focus appearance — and is an existing brand token, so no new literal enters the file. The override wins on specificity (`0-4-1` vs the base `0-3-1`), so the longhand `outline-color` replaces the shorthand's colour regardless of order — the same mechanism `border-top-color` uses against `border-top` at `:4034`.

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
    assert.match(field, /<label\s+htmlFor=\{htmlId\}/);
    assert.match(field, /id=\{htmlId\}/);
    assert.match(field, /aria-describedby=\{describedBy\}/);
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
  describedBy?: string;
};

function FieldShell({
  label,
  hint,
  error,
  htmlFor,
  describedBy,
  children,
}: FieldShellProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-[#3D291F]" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-sm text-[#5C4638]" id={`${describedBy}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-semibold text-[#963B32]" id={`${describedBy}-error`} role="alert">
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
  const describedBy = hint || error ? `${htmlId}-desc` : undefined;
  return (
    <FieldShell describedBy={describedBy} error={error} hint={hint} htmlFor={htmlId} label={label}>
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${error ? "border-[#963B32] ring-1 ring-[#963B32]" : ""} ${className}`}
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
  return (
    <FieldShell error={error} hint={hint} htmlFor={htmlId} label={label}>
      <select
        aria-invalid={error ? true : undefined}
        className={`${CONTROL} ${className}`}
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

- [ ] **Step 5: migrate the money-entry forms.** `finance-forms.tsx` has **22** `h-10` controls at lines 133, 159, 181, 212, 248, 274, 399, 425, 447, 478, 514, 550, 582, 819, 836, 858, 876, 906, 926, 943, 963, 1031 — every one of them an `<input>` or `<select>` (the two at 212 and 478 are `type="file"`). Replace each `<label>...</label>` + control pair with one `<CfTextField label="..." name="..." />` or `<CfSelect label="..." name="...">...</CfSelect>` (import from `@/components/ui`), carrying the existing `name`, `value`, `onChange`, `placeholder`, `required` and `disabled` props across unchanged. Where an input carries a leading icon (the `pl-8` variants at 133 and 399), keep the icon wrapper and pass `className="pl-8"`. For the two file inputs, pass their `file:*` classes through `className`. Where a control used a red focus ring (`:425`, `:447`, `:1031`), pass `className="focus:ring-[#BA3C2A]"`.

**Corrected: do not add a default class to `FormattedAmountInput`.** All 12 of its call sites (`finance-forms.tsx:128,394,818`, `dues-forms.tsx:116,331,409`, `event-budget-allocation-fields.tsx:92`, `correct-transaction-modal.tsx:122`, `record-transaction-modal.tsx:836`, `event-category-management-modal.tsx:393,708`, `event-budget-ceiling-modal.tsx:158`, `event-ticket-tier-modal.tsx:260`) pass an explicit `className`, so a `className ?? CONTROL` fallback would never fire. The compliant sizing belongs at the call sites; the amount inputs inside `finance-forms.tsx` become `<CfTextField ... >`-wrapped `FormattedAmountInput` replacements only if `FormattedAmountInput` can accept the `CONTROL` class — otherwise migrate the three `finance-forms.tsx` amount inputs to `<CfTextField type="text">` and keep `FormattedAmountInput`'s thousands-formatting by rendering it with `className={CONTROL}`. Verify formatting still works in the browser step; `inputMode="numeric"` at `formatted-amount-input.tsx:123` must survive.
- [ ] **Step 6: run everything** — `node --test tests/form-control-baseline.test.mjs`, `npm test`, `npm run lint`. Then grep for what is left, to size the remaining migration honestly: `grep -rn 'h-10 .*text-xs' src --include=*.tsx | wc -l`. Record the count in the commit body; the rest is Phase 2, not a silent omission here.
- [ ] **Step 7: browser check** on `/finances` and the Pay Dues modal: every control >=48px tall, text >=16px, focus ring visible, and on a real device (or DevTools "mobile" with a throttled device) **focus does not zoom the page**.
- [ ] **Step 8: commit** — `git commit -m "feat(ui): add compliant text/select primitives and raise the button floor to 44px"`

---

### Task 5: Dashboard tab strip becomes tappable and obviously scrollable

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:552-579` (tab strip) and `:421` (the "back to events" link, `min-h-[36px]`)
- Test: `tests/dashboard-tab-strip.test.mjs`

**Why:** the audit measured the strip at 413px client / 877px scroll — 8 pills of `min-h-[38px]` with `gap-1` (4px). Two problems: 38px targets below the 44px floor, 4px gaps, and no affordance at all that the strip scrolls, so 4 of 8 tabs are effectively undiscoverable on a phone. The `justify-between` on an `overflow-x-auto` container also collapses to nothing useful once content overflows.

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
  <p className="mt-1.5 text-xs text-[#7A685D] hidden max-sm:block">
    Swipe right for more sections
  </p>
</div>
```

`aria-current="page"` is the active signal, so the green fill is reinforcement rather than the only cue (DESIGN.md:26). `text-xs` -> `text-sm` here is *non*-control text at 14px, which is fine — the 16px rule applies to inputs. Import `TableScroll` from `@/components/ui` (Task 1 must land first).

- [ ] **Step 3b: raise the back link** at `event-dashboard-view.tsx:421` from `min-h-[36px]` to `min-h-[44px]` — it lives in the same header card and the file-level test cannot pass while it stays under the floor.
- [ ] **Step 4:** re-run, `npm test`, `npm run lint`.
- [ ] **Step 5: browser check** at 360px: 8th tab ("Reports") reachable by swipe and by Tab; the hint line is visible only below `sm`; active tab announced by screen reader as current.
- [ ] **Step 6: commit** — `git commit -m "fix(events): enlarge dashboard tab targets and expose the strip scroll"`

---

### Task 6: One navigation between 897 and 1023px

**Files:**
- Modify: `src/app/globals.css` `@theme` block (`53-68`)
- Modify: `src/components/app-header.tsx:232`, `:242`, `src/components/mobile-app-menu.tsx:45`
- Delete: dead `.app-mobile-header` / `.app-mobile-actions` rules at `globals.css:3984-3986`, `4061-4098`, `4626`, `4730-4742`
- Test: `tests/mobile-nav-breakpoint.test.mjs`

**Why:** the sidebar disappears at `max-width: 56rem` = 896px (`globals.css:4052-4059`) but the hamburger is `lg:hidden` = visible until 1024px. Between 897 and 1023 the user gets **both** navs. The rule that was supposed to resolve this — `.app-mobile-header` — exists only in CSS; no component ever used it, so it has been dead since it was written.

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
    assert.match(header, /hidden max-nav:flex/);
    assert.doesNotMatch(menu, /lg:hidden/);
  });

  it("drops the never-used mobile header rules", () => {
    assert.doesNotMatch(css, /\.app-mobile-header/);
    assert.doesNotMatch(css, /\.app-mobile-actions/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-nav-breakpoint.test.mjs` → 3 failures.
- [ ] **Step 3:** add `--breakpoint-nav: 56rem;` inside the `@theme` block at `globals.css:53-68`. Tailwind v4 derives both `nav:` and `max-nav:` variants from any `--breakpoint-*` key.
- [ ] **Step 4:** in `app-header.tsx:232` and `:242` change `lg:hidden` -> `hidden max-nav:flex` (both elements are already `flex`, so this preserves layout). In `mobile-app-menu.tsx:45` drop the now-impossible `lg:hidden` from the scrim.
- [ ] **Step 5:** delete the four dead rule groups listed above. Leave `.app-menu-toggle` and `.app-menu-icon` (`globals.css:3992-4003`) — those are live, used at `mobile-app-menu.tsx:33,38`.
- [ ] **Step 5b: update the superseded test.** `tests/notice-methods-verification.test.mjs:443` asserts `headerContent.includes("lg:hidden")`; after this task the header uses `hidden max-nav:flex`, so change that assertion to `headerContent.includes("hidden max-nav:flex")` and retitle the test to "...with the nav breakpoint". Do **not** touch `:483` (`menuContent.includes("fixed inset-0 z-70")`) — the scrim keeps those classes; only its `lg:hidden` leaves.
- [ ] **Step 6:** `node --test tests/mobile-nav-breakpoint.test.mjs`, `npm test`, `npm run lint`.
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
    assert.match(layout, /themeColor:\s*"#073523"/);
  });

  it("never blocks pinch zoom", () => {
    assert.doesNotMatch(layout, /maximum-scale|user-scalable=no/);
  });
});
```

- [ ] **Step 2:** `node --test tests/mobile-viewport.test.mjs` → 1 failure.
- [ ] **Step 3:** in `layout.tsx` add `import type { Metadata, Viewport } from "next";` (extend the existing `Metadata` import) and, above the `metadata` export:

```ts
export const viewport: Viewport = {
  themeColor: "#073523",
  width: "device-width",
  initialScale: 1,
};
```

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
