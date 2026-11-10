# Event Dashboard Button Hierarchy, Event Info & Void Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate `+` CTA icons, enforce a centralized 3-tier button and filter-pill visual hierarchy (`48px` Primary / `44px` Secondary / `34px` visual pill inside `44px` tap box), restrict the `Event info` dropdown to Timeline/Features/Description plus retained lifecycle & single Edit controls, and standardize all reversal labels on `Void` only.

**Architecture:** Extend `src/components/ui/cf-button.tsx` with `min-h-12`/`min-h-11` wrapping-safe primary/secondary presets alongside a new `CfFilterPill` component, then migrate dashboard header, tab actions, filter bars, and voucher drawer controls onto those primitives while updating `Event info` and copy tests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Lucide icons, Node built-in `node:test`, Biome.

**Spec:** [`docs/superpowers/specs/2026-11-10-event-dashboard-polish-hierarchy-design.md`](../specs/2026-11-10-event-dashboard-polish-hierarchy-design.md)

## Global Constraints

- `DESIGN.md:28`: Primary controls target `48px` height (`min-h-12`); secondary and touch interactive targets must never fall below `44px` (`min-h-11` / `min-h-[44px]`).
- `tests/form-control-baseline.test.mjs`: `CfButton`'s `sizeStyles` map must keep its 4 measured size keys (`default`, `compact`, `large`, `icon`), each resolving to `>= 44px`.
- `tests/dashboard-tab-strip.test.mjs`: Preserve the main sticky 5-tab bar's `<TableScroll label="Dashboard sections">`, `min-h-[48px]`, `text-sm`, `gap-2 p-1.5 w-max`, `aria-current`, `lg:hidden` swipe hint, and zero `min-h-[(20..43)px]` tokens in `event-dashboard-view.tsx`.
- CSP & UI hygiene invariants: Zero inline `style={{...}}` attributes and zero `text-[#D6A23A]` on white/cream surfaces.

## Review Focus

1. **Multi-line button label wrapping on 320px viewports:** Changing `CfButton` from fixed `h-12`/`h-11` to `min-h-12`/`min-h-11` (and keeping `white-space` wrappable when needed) ensures buttons never clip or overflow on 320px screens while preserving `>= 48px` / `>= 44px` height floors.
2. **Event info empty/optional fields:** When `event.details` is empty or `eventRow` timestamps/features are sparse (e.g., an event with ticketing disabled and no minutes enabled), `Event History & Timeline`, `Event Features`, and `Event Description` still render clean fallback copy without crashing or showing blank boxes.
3. **Sub-tab & filter pill active-state contrast:** Active/inactive states across `CfFilterPill` tones (`forest`, `deep`, `espresso`) maintain legible `#FFFFFF`-on-dark and `#5C4638`/`#3D291F`-on-cream contrast with clear keyboard `focus-visible` rings.
4. **Edit button single-source discoverability:** Removing the duplicate `Edit` button from the top spotlight card leaves `"Edit Event Details"` inside `Event info` accessible to `canEditEvent && eventRow` users (not gated out when `!canRecord` or when event is active).
5. **Void copy completeness & SoD preservation:** Replacing `"Reverse / Void"` / `"Reversed / Voided"` / `"Reversed / Rejected"` with `"Void Record"` / `"Voided"` never unlocks voiding on `isExecutiveSelfReview` pending items or removes cancelled-row isolation in `EventDomainLedger`.

---

### Task 1: Add `CfFilterPill` & Wrapping-Safe `CfButton` Hierarchy + Enforce Void-Only Labels

**Files:**
- Modify: `src/components/ui/cf-button.tsx:44-160`
- Modify: `src/components/ui/index.ts:1-8`
- Modify: `src/components/events/dashboard/voucher-inspection-drawer.tsx:294-305,410-465`
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx:1-30,415-560`
- Modify: `src/components/events/dashboard/tab-tickets.tsx:285-305`
- Test: `tests/form-control-baseline.test.mjs`, `tests/event-voucher-inspection-drawer.test.mjs`, `tests/event-domain-ledger-ui.test.mjs`, `tests/unified-void-ui-integration.test.mjs`

**Interfaces:**
- Produces:
  - `export type CfFilterPillTone = "forest" | "deep" | "espresso";`
  - `export interface CfFilterPillProps extends ButtonHTMLAttributes<HTMLButtonElement> { active?: boolean; tone?: CfFilterPillTone; pillClassName?: string; }`
  - `export const CfFilterPill`: Outer `<button>` enforces `min-h-[44px] py-1 inline-flex items-center shrink-0 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] rounded-lg`, inner `<span>` renders `h-[34px] inline-flex items-center gap-1.5 px-3 rounded-lg text-xs transition-colors` (`font-bold text-white` active tone vs `font-semibold bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3] group-hover:text-[#3D291F]`).
  - `sizeStyles` in `CfButton`: `default` and `large` use `min-h-12 ... py-2.5 text-sm font-bold rounded-xl`; `compact` uses `min-h-11 ... py-1.5 text-xs font-semibold rounded-xl`.

- [ ] **Step 1: Update and add failing tests for `CfFilterPill` and Void-only labels**

Update [`tests/event-domain-ledger-ui.test.mjs`](../../../tests/event-domain-ledger-ui.test.mjs), [`tests/event-voucher-inspection-drawer.test.mjs`](../../../tests/event-voucher-inspection-drawer.test.mjs), and [`tests/unified-void-ui-integration.test.mjs`](../../../tests/unified-void-ui-integration.test.mjs) (plus add a `CfFilterPill` check in `tests/event-domain-ledger-ui.test.mjs` or `tests/form-control-baseline.test.mjs`) to assert:
- `cf-button.tsx` exports `CfFilterPill` with outer `min-h-[44px]` and inner `h-[34px]` visual chip, and `CfButton` `default` resolves to `48px` (`min-h-12`) while `compact` resolves to `44px` (`min-h-11`).
- `event-domain-ledger.tsx` uses `<CfFilterPill` for domain/channel/status filters and renders ``Voided (${voidedCount})`` (rejecting `/Reversed\s*\/\s*Voided/`).
- `voucher-inspection-drawer.tsx` uses `<CfButton` for footer actions and renders `"Voided"` + `"Void Record"` (rejecting `/Reverse\s*\/\s*Void|Reversed\s*\/\s*Rejected/`).
- `tab-tickets.tsx` ledger subtitle contains no `reverse/void`.

- [ ] **Step 2: Run targeted tests to confirm RED state**

Run: `node --test tests/form-control-baseline.test.mjs tests/event-domain-ledger-ui.test.mjs tests/event-voucher-inspection-drawer.test.mjs tests/unified-void-ui-integration.test.mjs`
Expected: FAIL on missing `CfFilterPill` export and existing `"Reverse / Void"` / `"Reversed / Voided"` / `"Reversed / Rejected"` copy.

- [ ] **Step 3: Implement `CfFilterPill` + `CfButton` polish + Void-only labels**

- Update [`src/components/ui/cf-button.tsx`](../../../src/components/ui/cf-button.tsx): switch `default`/`large` to `min-h-12`, `compact` to `min-h-11 ... rounded-xl`, and export `CfFilterPill` (`CfFilterPillProps`, `CfFilterPillTone`). Ensure `index.ts` re-exports everything from `./cf-button`.
- Update [`src/components/events/dashboard/voucher-inspection-drawer.tsx`](../../../src/components/events/dashboard/voucher-inspection-drawer.tsx): replace `"Reversed / Rejected"` badge with `"Voided"`, replace `"Reverse / Void"` with `"Void Record"`, use `CfButton` (`variant="primary" size="default"` for `"Approve Record"`, `variant="secondary" size="compact"` for `"Close"` and crimson-bordered `"Void Record"`).
- Update [`src/components/events/dashboard/event-domain-ledger.tsx`](../../../src/components/events/dashboard/event-domain-ledger.tsx): convert domain, channel, and status pill strips to `<CfFilterPill>` with ``Voided (${voidedCount})``, and convert `"Export CSV"`, `"Reset"`, `"Previous"`, `"Next"` buttons to `<CfButton variant="secondary" size="compact">`.
- Update [`src/components/events/dashboard/tab-tickets.tsx`](../../../src/components/events/dashboard/tab-tickets.tsx): change `EventDomainLedger` subtitle from `"or reverse/void"` to `"or void"`.

- [ ] **Step 4: Run targeted tests to verify GREEN**

Run: `node --test tests/form-control-baseline.test.mjs tests/event-domain-ledger-ui.test.mjs tests/event-voucher-inspection-drawer.test.mjs tests/unified-void-ui-integration.test.mjs tests/ticket-cancel-decision.test.mjs tests/mobile-transaction-cards.test.mjs tests/ticket-sales-ledger-channels.test.mjs tests/event-dashboard-ui-hygiene.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/cf-button.tsx src/components/ui/index.ts src/components/events/dashboard/voucher-inspection-drawer.tsx src/components/events/dashboard/event-domain-ledger.tsx src/components/events/dashboard/tab-tickets.tsx tests/form-control-baseline.test.mjs tests/event-domain-ledger-ui.test.mjs tests/event-voucher-inspection-drawer.test.mjs tests/unified-void-ui-integration.test.mjs
git commit -m "feat(ui): add CfFilterPill, enforce CfButton height tiers, and use Void-only copy"
```

---

### Task 2: Remove Duplicate `[+]` on Assign Team Member & Apply `CfButton` / `CfFilterPill` Across Content Tabs

**Files:**
- Modify: `src/components/events/dashboard/tab-reports.tsx:70-175`
- Modify: `src/components/events/dashboard/tab-tickets.tsx:65-160`
- Modify: `src/components/events/dashboard/tab-budget-allocations.tsx:95-210`
- Test: `tests/event-tab-tickets-ledger.test.mjs`, `tests/event-dashboard-mobile-responsive.test.mjs`, `tests/event-budget-ceiling-ui.test.mjs`, `tests/event-tab-budget-matrix.test.mjs`

**Interfaces:**
- Consumes: `CfButton`, `CfFilterPill` from `@/components/ui`

- [ ] **Step 1: Add failing assertions for single CTA icon & tab button hierarchy**

Add assertions in `tests/event-dashboard-mobile-responsive.test.mjs` (or `tests/event-tab-budget-matrix.test.mjs` & `tests/event-tab-tickets-ledger.test.mjs`) verifying:
- `tab-reports.tsx` renders `<CfButton` with `"Assign Team Member"` (and `doesNotMatch(/\+\s*Assign Team Member/)`).
- `tab-budget-allocations.tsx` uses `<CfButton` for budget CTAs and `<CfFilterPill` for `"Spending"`, `"Revenue Mix"`, and `"Cash Flow"`.
- `tab-tickets.tsx` uses `<CfButton` for `"Add Ticket Tier"` (`secondary`/`compact` in header, `primary`/`default` in empty state) and `"Record Ticket Sale"` (`primary`/`default`).

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `node --test tests/event-dashboard-mobile-responsive.test.mjs tests/event-tab-tickets-ledger.test.mjs tests/event-tab-budget-matrix.test.mjs`
Expected: FAIL before updating tab components.

- [ ] **Step 3: Refactor CTA & filter controls across `tab-reports.tsx`, `tab-tickets.tsx`, and `tab-budget-allocations.tsx`**

- [`src/components/events/dashboard/tab-reports.tsx`](../../../src/components/events/dashboard/tab-reports.tsx): Change `<span>+ Assign Team Member</span>` -> `CfButton` (`variant="primary"`, `size="default"`, `leftIcon={UserPlus}` with children `"Assign Team Member"`, gold `#F0C768` or crisp single icon); use `CfButton` (`variant="secondary"`, `size="compact"`) for `Remove` and export buttons.
- [`src/components/events/dashboard/tab-tickets.tsx`](../../../src/components/events/dashboard/tab-tickets.tsx): Use `<CfButton variant="secondary" size="compact">` for header `Add Ticket Tier`, `<CfButton variant="primary" size="default">` for `Record Ticket Sale` & empty-state `Add Ticket Tier`, and keep tier `Edit` / `Retire` action triggers cleanly sized.
- [`src/components/events/dashboard/tab-budget-allocations.tsx`](../../../src/components/events/dashboard/tab-budget-allocations.tsx): Use `<CfButton variant="secondary" size="compact">` for `Edit Budget`/`Set Budget` & `Manage Categories`, `<CfButton variant="primary" size="default">` for `Record Revenue`/`Record Expense`, and `<CfFilterPill>` for `Spending`, `Revenue Mix`, and `Cash Flow`.

- [ ] **Step 4: Run targeted tests to verify GREEN**

Run: `node --test tests/event-dashboard-mobile-responsive.test.mjs tests/event-tab-tickets-ledger.test.mjs tests/event-budget-ceiling-ui.test.mjs tests/event-tab-budget-matrix.test.mjs tests/mobile-transaction-cards.test.mjs tests/event-dashboard-ui-hygiene.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-reports.tsx src/components/events/dashboard/tab-tickets.tsx src/components/events/dashboard/tab-budget-allocations.tsx tests/event-dashboard-mobile-responsive.test.mjs tests/event-tab-tickets-ledger.test.mjs tests/event-tab-budget-matrix.test.mjs
git commit -m "feat(dashboard): remove duplicate team CTA plus and apply CfButton/CfFilterPill across tabs"
```

---

### Task 3: Polish Spotlight Header, Focus `Event info` Dropdown, Remove Redundant Edit & Complete Full Verification

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:660-895`
- Test: `tests/event-dashboard-mobile-view.test.mjs`, `tests/event-dashboard-unified-redesign.test.mjs`, `tests/dashboard-tab-strip.test.mjs`

**Interfaces:**
- Consumes: `CfButton` from `@/components/ui`, `eventRow?: EventRow`, `event: DashboardEventInfo`

- [ ] **Step 1: Add failing assertions for single `+`, focused `Event info`, single Edit trigger, and Option A header CTAs**

Update `tests/event-dashboard-mobile-view.test.mjs`, `tests/event-dashboard-unified-redesign.test.mjs`, and (only `targets.length` for non-primitive tags while preserving all 44px/48px & `tab-btn` checks plus adding `<CfButton` height guard verification) `tests/dashboard-tab-strip.test.mjs`:
- `event-dashboard-view.tsx` renders `"Record Entry"` without duplicate literal `+ ` (`doesNotMatch(/\+\s*Record Entry/)`) inside `<CfButton variant="primary" size="default">`.
- `event-dashboard-view.tsx` renders `<CfButton variant="secondary" size="compact"` for `"Download Report"`, and does NOT render `"Edit Event Settings"` button in the spotlight header bar.
- `#event-header-details` (`Event info` dropdown) omits `Official Accounting Ref` / `EVT-` (`doesNotMatch(/Official Accounting Ref|EVT-/)`) and displays `"Event History & Timeline"`, `"Event Features"`, and `"Event Description"`, while retaining lifecycle actions (`Mark Completed`, `Cancel Event`, `Reopen Planning`, `Archive Record`) and `"Edit Event Details"`.

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `node --test tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/dashboard-tab-strip.test.mjs`
Expected: FAIL before updating `event-dashboard-view.tsx`.

- [ ] **Step 3: Update `event-dashboard-view.tsx` header & `Event info` dropdown**

- Header action bar: use `<CfButton variant="secondary" size="compact" id="btn-export-report" ...>` (`Download Report`) and `<CfButton variant="primary" size="default" id="btn-record-transaction" ...>` with `<Plus className="w-4 h-4 text-[#F0C768] shrink-0" /><span>Record Entry</span>`. Remove the duplicate `Edit Event Settings` button (`lines 740-751`).
- Keep `Event info` toggle using `<CfButton variant="secondary" size="compact" ...>` (or compact border toggle `>= 44px`).
- Inside `#event-header-details`: remove `Official Accounting Ref` and render strictly 3 content sections:
  1. **Event History & Timeline** (created date from `eventRow?.created_at`, formatted schedule/time/duration, `status_changed_at` / `updated_at` timestamp, archive date if archived).
  2. **Event Features** (active feature pills derived from `eventRow`: Ticketing Passes, Budget System, Revenue Streams, Disbursements, Meeting Minutes, Attendance Tracking + links to `/tickets?view=public` and `/meeting-hub?event=...`).
  3. **Event Description** (`event.details || "No description recorded for this event."`).
- Footer inside `#event-header-details`: retain lifecycle actions (`Mark Completed`, `Cancel Event`, `Reopen Planning`, `Archive Record`) and single `Edit Event Details` via `<CfButton variant="secondary" size="compact">`.

- [ ] **Step 4: Run targeted & full verification suite + lint + typecheck + build**

Run sequentially:
1. `node --test tests/dashboard-tab-strip.test.mjs tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/event-dashboard-ui-hygiene.test.mjs tests/form-control-baseline.test.mjs`
2. `npm run lint` (or `npx biome check --write` on touched files then `npm run lint`)
3. `npx tsc --noEmit`
4. `npm test`
5. `npm run build`
Expected: All pass with 0 errors and 0 regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/event-dashboard-view.tsx tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/dashboard-tab-strip.test.mjs
git commit -m "feat(dashboard): focus Event info dropdown, deduplicate Edit trigger, and apply Option A header CTA sizing"
```

---

## Plan Self-Review

- **Spec Coverage:** Every item from `2026-11-10-event-dashboard-polish-hierarchy-design.md` maps directly to a task: duplicate `+` removal (Task 2 & Task 3), Option A `CfButton` + `CfFilterPill` system (Tasks 1–3), focused `Event info` + retained lifecycle + single Edit trigger (Task 3), and `Void`-only labels (Task 1).
- **Type & Symbol Consistency:** Exact names (`CfButton`, `CfFilterPill`, `CfFilterPillTone`, `CfFilterPillProps`, `min-h-12`, `min-h-11`, `h-[34px]`, `min-h-[44px]`) align across Tasks 1–3 and existing `form-control-baseline.test.mjs`.
- **Proportion:** Plan specifies exact props, component contracts, and TDD assertions without duplicating component bodies.
