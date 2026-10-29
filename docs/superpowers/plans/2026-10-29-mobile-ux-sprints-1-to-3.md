# Mobile UX Remediation: Sprints 1 to 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining half-implemented and un-implemented mobile UX audit findings from `docs/ux-audit-2026-10-28-mobile-responsive.md`, covering vertical space reclamation, iOS auto-zoom elimination, 44px form controls, modal bottom-sheet adaptations, mobile search, and design-system breakpoint alignment.

**Architecture:**
1. **CSS Enhancements:** Global responsive rules in `src/app/globals.css` for 16px mobile input font (killing iOS auto-zoom), 44px input floors, top safe-area padding for `.app-sticky-header`, and `@theme` canonical breakpoint definitions.
2. **Component Disclosures & Compaction:** Collapsible `<details>` wrapper for the 1,900px Dues Pre-Launch Reconciliation workspace, compact mobile hero banner on `/dues`, and 2-column mobile KPI grid on Event Overview.
3. **Modal Bottom Sheets:** Mobile bottom-sheet drawer styling for heavy dialogs (`RecordTransactionModal`, `PayDuesModal`, `EventCategoryManagementModal`, `EventEditModal`) with sticky footers.
4. **Mobile Global Search:** Header search icon button and slide-down search bar below 768px (`md:hidden`).

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS v4, Biome, Node.js test runner (`node:test`).

**Spec:** [`docs/ux-audit-2026-10-28-mobile-responsive.md`](file:///c:/Users/HomePC/Documents/codex/Carpentersfamily/docs/ux-audit-2026-10-28-mobile-responsive.md)

---

## Global Constraints
- Preserve documentation integrity and existing comments.
- Zero breaking changes to existing test assertions (508 passing tests must remain green).
- Maintain WCAG 2.2 AA compliance: $\ge 4.5:1$ text contrast, $\ge 44\times 44\text{px}$ primary touch targets.
- Biome linting (`npm run lint`) and TypeScript (`npx tsc --noEmit`) must pass with 0 errors.

---

## Sprint 1: High-Impact Vertical Space Reclamation & Mobile Form Safety

### Task 1.1: Guard Sticky Header with Top Safe-Area Inset
- [x] Add `padding-top: max(0.65rem, env(safe-area-inset-top, 0.65rem));` to `.app-sticky-header` in `src/app/globals.css`.
- [x] Add test in `tests/mobile-form-safety.test.mjs` verifying safe-area top inset on `.app-sticky-header`.

### Task 1.2: Eliminate iOS Auto-Zoom & Enforce 44px Mobile Inputs
- [x] In `src/app/globals.css`, add media query `@media (max-width: 48rem)` ensuring `font-size: 16px !important` on `input:not([type="checkbox"]):not([type="radio"])`, `select`, and `textarea`.
- [x] In `src/app/globals.css`, add `min-height: 44px` on mobile for inputs, `.input-control`, and selects.
- [x] Assert in `tests/mobile-form-safety.test.mjs` that 16px mobile font rule and 44px min-height are declared.

### Task 1.3: Dues Pre-Launch Reconciliation Workspace Disclosure
- [x] In `src/components/dues/pre-launch-dues-reconciliation-card.tsx`, initialize `isCollapsed = useState(true)` to keep it closed by default on load, eliminating ~1,900px of scrolling for officers while offering clear expand/collapse controls.
- [x] Write unit test in `tests/mobile-form-safety.test.mjs`.

### Task 1.4: Dues Hero Mobile Compact Mode
- [x] In `src/components/dues/dues-page-view.tsx`, update hero card padding to `p-4 sm:p-8` and hide the 3-line static explanation on mobile (`hidden sm:block`).
- [x] Verify that the 2×2 metric summary matrix appears directly above the fold.

### Task 1.5: Event Overview KPI Tile Deduplication
- [x] In `src/components/events/dashboard/tab-overview.tsx`, convert the top metric tile stack into a responsive 2-column mobile grid (`grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4`) with compact typography (`text-base sm:text-xl font-extrabold`).

---

## Sprint 2: Modal Responsive Bottom Sheets & Mobile Global Search

### Task 2.1: Transform Core Modals into Mobile Bottom Sheets
- [x] Update `src/components/events/dashboard/modals/record-transaction-modal.tsx`:
  - Outer alignment: `fixed inset-0 z-50 flex sm:items-center items-end justify-center p-0 sm:p-4`.
  - Panel styling: `bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col`.
- [x] Apply same bottom-sheet pattern to:
  - `src/components/dues/pay-dues-modal.tsx`
  - `src/components/events/dashboard/modals/event-category-management-modal.tsx`
  - `src/components/events/event-edit-modal.tsx`
- [x] Write unit test `tests/mobile-modal-bottom-sheets.test.mjs` asserting bottom sheet classes.

### Task 2.2: Add Mobile Global Search Trigger & Drawer/Bar
- [x] In `src/components/app-header.tsx`, add a mobile search button (`md:hidden min-h-[44px] min-w-[44px] p-2`) beside the notification bell.
- [x] Add mobile state to toggle an accessible search bar directly beneath the header or activate search focus.
- [x] Write unit test `tests/mobile-header-search.test.mjs` verifying mobile search button rendering and accessibility.

---

## Sprint 3: Design System Tokens & Breakpoint Normalization

### Task 3.1: Canonical Breakpoint Declarations
- [x] In `src/app/globals.css` `@theme`, add standard breakpoint tokens:
  ```css
  --breakpoint-sm: 40rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 56rem;
  --breakpoint-xl: 64rem;
  --breakpoint-2xl: 80rem;
  ```
- [x] Add test in `tests/design-system-breakpoints.test.mjs`.

### Task 3.2: Verification & Regression Gate
- [x] Run `npm run lint` (`biome check next.config.ts src`).
- [x] Run `npx tsc --noEmit`.
- [x] Run full test suite `npm test` (all 523 tests pass).
