# Event Dashboard Button Hierarchy, Event Info & Void Terminology Refinement

**Status:** Pending user approval  
**Branch:** `feat/event-dashboard-full-prototype`  
**Scope:** Short design addendum to [`2026-11-10-event-dashboard-full-prototype-design.md`](./2026-11-10-event-dashboard-full-prototype-design.md).

## Intent & Problem

Refine four usability and visual-hierarchy details surfaced on `/events/[eventId]/dashboard`:
1. **Duplicate `+` icons:** Remove the redundant literal white `+ ` prefix from primary CTAs that already render an icon (`Record Entry` and `Assign Team Member`).
2. **Undifferentiated button sizes:** Separate **Primary CTA buttons** (`48px`, `text-sm` bold), **Secondary action buttons** (`44px`, `text-xs` semibold), and **Filter pills** (`34px` visual chip inside a `44px` accessible touch hit box) through reusable shared primitives so future controls inherit consistent sizing automatically.
3. **Cluttered `Event info` dropdown & duplicate Edit trigger:** Remove `Official Accounting Ref` from `Event info` so its body displays only **Event History & Timeline**, **Event Features**, and **Event Description**, retain the officer lifecycle buttons inside the dropdown footer, and remove the redundant `Edit` button from the top spotlight header card.
4. **Inconsistent `Reverse / Void` copy:** Standardize all dashboard inspection actions, status pills/badges, and helper copy on **Void / Voided** only.

## Selected Approach (Option A — Approved)

**Centralized `CfButton` tiers + `CfFilterPill` (`48px` / `44px` / `34px` visual inside `44px` tap box):**
- **Alternatives rejected:**
  - *Option B (`32px` native `<button>` chip):* Relaxes `DESIGN.md:28`'s `44px` interactive touch floor and breaks existing mobile tap-target assertions.
  - *Option C (`50px` / `44px` / `44px` segmented strip):* Preserves the `44px` floor visually too, but keeps wrapped filter strips taller on small screens.
- **How Option A works:**
  - Extend [`src/components/ui/cf-button.tsx`](../../../src/components/ui/cf-button.tsx) and re-export from [`src/components/ui/index.ts`](../../../src/components/ui/index.ts):
    - Keep `CfButton` size keys (`default`, `compact`, `large`, `icon`) intact so [`tests/form-control-baseline.test.mjs`](../../../tests/form-control-baseline.test.mjs) continues measuring all 4 sizes above `44px`: `default`/`large` stay at `48px` (`min-h-[48px] text-sm font-bold`) for **Primary CTAs** (`Record Entry`, `Assign Team Member`, `Record Ticket Sale`, `Record Revenue`/`Record Expense`, modal submit/approve CTAs); `compact` stays at `44px` (`min-h-[44px] text-xs font-semibold rounded-xl`) for **Secondary actions** (`Download Report`, `Edit Budget`, `Manage Categories`, `Add Ticket Tier`, `Export CSV`, `Event info`, `Reset`, lifecycle actions, `Void Record`, `Close`). Also add semantic alias helpers or optional `emphasis`/`pill` props cleanly without changing `sizeStyles`'s 4 measured keys.
    - Add a dedicated **`CfFilterPill`** primitive (`src/components/ui/cf-button.tsx`) whose outer `<button>` enforces `min-h-[44px] inline-flex items-center shrink-0` for touch accessibility while its inner visual pill `<span>` renders at `h-[34px] px-3 rounded-lg text-xs font-semibold` (with `active` + `tone` states: `"forest"`, `"deep"`, `"espresso"`).
  - Replace ad-hoc `<button>` sizing across `event-dashboard-view.tsx`, `event-domain-ledger.tsx`, `tab-overview.tsx`, `tab-tickets.tsx`, `tab-budget-allocations.tsx`, `tab-reports.tsx`, and `voucher-inspection-drawer.tsx` with `CfButton` and `CfFilterPill` (preserving all existing IDs, ARIA attributes, and the main sticky 5-tab bar's `48px` pill contract in `dashboard-tab-strip.test.mjs`).

## Non-Goals & Constraints

- Do not alter backend Server Actions, database queries, SoD rules, or `VoidRecordModal` semantics.
- Do not change [`DESIGN.md`](../../../DESIGN.md) `44px`/`48px` touch floors or alter the sticky 5-tab strip (`min-h-[48px] text-sm`) pinned by `tests/dashboard-tab-strip.test.mjs`.
- Keep all CSP invariants (`zero inline style attributes`, static `className` tokens where scanned by baseline tests).

## Component & Copy Specification

1. **Duplicate `+` Removal:**
   - `event-dashboard-view.tsx`: `Record Entry` renders `<Plus>` gold icon + `"Record Entry"` (no literal `+ `).
   - `tab-reports.tsx`: `Assign Team Member` renders `<UserPlus>` icon + `"Assign Team Member"` (no literal `+ `).
2. **`Event info` Dropdown & Spotlight Header (`event-dashboard-view.tsx`):**
   - Remove the top-row `Edit` button (`Edit Event Settings`) from the spotlight card actions so only **Download Report** (`secondary` `compact` `44px`) and **Record Entry** (`primary` `default` `48px`) appear on the card header.
   - Inside `#event-header-details`, remove `Official Accounting Ref` and render strictly three information blocks:
     1. **Event History & Timeline:** Created date (`eventRow?.created_at`), schedule & WAT duration (`event.dateFormatted`, `event.timeWAT`, `event.durationLabel`), latest status/update timestamp (`eventRow?.status_changed_at` / `eventRow?.updated_at`), and archive timestamp if archived.
     2. **Event Features:** Active feature tags (`Ticketing Passes`, `Budget System`, `Revenue Streams`, `Disbursements`, `Meeting Minutes`, `Attendance Tracking` from `eventRow`) and contextual links (`Open Ticket Storefront`, `Minutes & Attendance`).
     3. **Event Description:** `event.details` (or clear muted fallback when empty).
   - Retain the officer footer strip at the bottom of `Event info` containing lifecycle buttons (`Mark Completed`, `Cancel Event`, `Reopen Planning`, `Archive Record`) and the single `Edit Event Details` button.
3. **Void-Only Terminology:**
   - `voucher-inspection-drawer.tsx`: replace `"Reversed / Rejected"` status badge with `"Voided"` and `"Reverse / Void"` button label with `"Void Record"`.
   - `event-domain-ledger.tsx`: replace `"Reversed / Voided"` status pill with `"Voided"`.
   - `tab-tickets.tsx`: replace `"reverse/void"` subtitle wording with `"void"`.
   - Align any affected UI test assertions in `tests/` while keeping all functional void & SoD tests intact.
