# Event Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Event Dashboard unified redesign in the Carpenters Family application, consolidating the dashboard into 5 streamlined tabs (`Overview`, `Tickets`, `Budget & Revenue`, `Ledger`, `Statement & Team`), introducing a collapsible spotlight header, high-density 2-line ledger cards without horizontal scroll clipping, and rich officer verification workflows while preserving existing server actions, Supabase data structures, and role permissions.

**Architecture:** Refactor `EventDashboardView` and its sub-components to adopt the 5-tab unified information architecture. Modernize the header with a top brand accent and on-demand metadata drawer. Consolidate department allocations, revenue streams, and cash flow into a sub-segmented `Budget & Revenue` view. Provide a unified `Ledger` across all entry domains with instant 2-tier filtering (Type and Verification Status). Unify the official P&L financial statement with committee officer management in `Statement & Team`. Connect all officer actions (category limit management, ceiling revisions, voucher inspection with approve/reject/void, and receipt attachments) to existing server actions and Supabase data.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React, Node test runner (`node:test`).

**Spec:** [`C:\Users\HomePC\.gemini\antigravity\brain\3243c3fa-e68c-4604-86f1-46da9fad05b9\event-dashboard-prototype-comparison-and-unified-redesign.md`](file:///C:/Users/HomePC/.gemini/antigravity/brain/3243c3fa-e68c-4604-86f1-46da9fad05b9/event-dashboard-prototype-comparison-and-unified-redesign.md)

---

## Global Constraints

- **Strict Codebase Integration:** Preserve existing routes (`/events/[eventId]/dashboard`), server actions (`recordEventFinancialTransactionAction`, `recordEventTicketSaleAction`, `voidEventFinancialTransactionAction`, `refundEventTicketSaleAction`, `setEventBudgetAction`), database schemas, and permissions.
- **Design Tokens:** Strictly adhere to `DESIGN.md` Warm Editorial tokens (Espresso `#3D291F`, Forest Green `#174C37`, Deep Forest `#0C3325`, Warm Canvas `#FAF6F0`, Linen `#E5DDD3`, Terracotta `#BA3C2A`, and Ochre `#D6A23A`).
- **CSP Invariant:** Zero inline `style={{...}}` attributes in any TSX file (enforced by `tests/event-dashboard-ui-hygiene.test.mjs`).
- **Contrast Invariant:** Gold `#D6A23A` must NEVER be used as text on white/cream surfaces (enforced by `tests/event-dashboard-ui-hygiene.test.mjs`).
- **Accessibility & Touch Targets:** All interactive controls must meet the 44px minimum touch target (`min-h-[44px]` or `min-h-[38px]` with adequate touch spacing). All modals must declare `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and a `max-h-` viewport constraint.
- **Copywriting Discipline:** Simple everyday English, zero bureaucratic or legalistic jargon, zero em-dashes (`—`), zero badge clutter, and plain monetary formats (`formatNaira`).
- **Test Integrity:** Maintain a 100% pass rate across the full test suite (`npm test`).

---

## Review Focus

1. **Mobile Layout (320px–390px):** The spotlight header collapses cleanly, 5 tabs fit comfortably with the swipe helper, and ledger transaction cards never clip or cause horizontal overflow.
2. **Tab Backward Compatibility:** Query params `?tab=expenses`, `?tab=budget`, `?tab=revenue` map into `Budget & Revenue` with the correct sub-segment active; `?tab=reports` and `?tab=team_roles` map into `Statement & Team`.
3. **Pending Officer Verification:** Pending transactions display clear warning counts on Overview, highlight with ochre status indicators, and open the voucher drawer with one-click Approve or Reject/Cancel actions.
4. **Budget Headroom & Overrun:** Over-budget events trigger an alert banner on Overview and highlight overspent cost centers in terracotta without breaking calculations.
5. **Role-Based Controls:** Non-officer members see clean read-only financial data and cannot see or trigger officer management controls (Record Entry, Edit Ceiling, Manage Allocations, Approve/Void).

---

## Tasks

### Task 1: Update Test Suites for 5-Tab Unified Information Architecture

**Files:**
- Modify: `tests/event-dashboard-mobile-view.test.mjs`
- Create: `tests/event-dashboard-unified-redesign.test.mjs`

**Interfaces:**
- Validates the 5 primary tabs: `overview`, `tickets`, `budget`, `ledger`, `statement`.
- Validates the collapsible header, 2-line compact ledger cards, and mobile swipe hint.

- [ ] **Step 1: Write test cases in `tests/event-dashboard-unified-redesign.test.mjs`**
  Cover 5 unified tabs, header info disclosure, and sub-view segment switching.
- [ ] **Step 2: Update `tests/event-dashboard-mobile-view.test.mjs`**
  Modernize legacy tab checks to accept the approved 5-tab navigation.
- [ ] **Step 3: Run tests to verify failure on current un-refactored code**
  Run: `node --test tests/event-dashboard-unified-redesign.test.mjs`
  Expected: FAIL until components are updated.
- [ ] **Step 4: Commit**
  ```bash
  git add tests/event-dashboard-unified-redesign.test.mjs tests/event-dashboard-mobile-view.test.mjs
  git commit -m "test(events): define tests for unified 5-tab event dashboard redesign"
  ```

---

### Task 2: Refactor Event Header & Spotlight Card

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:520-715`

**Interfaces:**
- Consumes: `DashboardEventInfo`, `userRole`, `canRecord`, `isLocked`.
- Produces: Top forest green accent strip, breadcrumb, status badge, collapsible `Event info` accordion toggle, duration/reference/link drawer, and responsive 2-button action bar (`Download` + `Record Entry`).

- [ ] **Step 1: Add header state & collapsible toggle in `event-dashboard-view.tsx`**
  Add `headerExpanded` boolean state and toggle handler.
- [ ] **Step 2: Implement compact spotlight header with forest accent strip**
  Render top `h-1 bg-[#174C37]` accent, breadcrumb back link, status pill, title, date/time, venue, and `Details ▾` disclosure button.
- [ ] **Step 3: Render expandable metadata panel**
  Show statement reference code, duration, public ticket link, and meeting hub separation note on demand.
- [ ] **Step 4: Run unit tests**
  Run: `node --test tests/event-dashboard-unified-redesign.test.mjs`
  Verify header tests pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/events/dashboard/event-dashboard-view.tsx
  git commit -m "feat(events): implement compact collapsible spotlight header with brand accent"
  ```

---

### Task 3: Implement 5-Tab Navigation & Backward-Compatible Tab Mapping

**Files:**
- Modify: `src/components/events/dashboard/dashboard-types.ts:1-50`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:220-290, 715-960`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:775-795`

**Interfaces:**
- Consumes: Query string `tab` and hash `#event-finance-*`.
- Produces: 5 primary tabs (`overview`, `tickets`, `budget`, `ledger`, `statement`) with mobile swipe helper text (`Swipe for more →`). Maps legacy tabs (`expenses`, `revenue`, `reports`, `team_roles`, `audit_log`) to the corresponding unified tab and sub-segment.

- [ ] **Step 1: Update `DashboardTab` type in `dashboard-types.ts`**
  Support `'overview' | 'tickets' | 'budget' | 'ledger' | 'statement' | 'expenses' | 'revenue' | 'reports' | 'team_roles' | 'audit_log'`.
- [ ] **Step 2: Implement tab mapping logic in `page.tsx` and `event-dashboard-view.tsx`**
  Map `expenses` → `budget` (subview: cost-centers), `revenue` → `budget` (subview: revenue-streams), `reports` / `team_roles` / `audit_log` → `statement`.
- [ ] **Step 3: Render unified 5-tab bar with mobile swipe hint**
  Render horizontal swipeable bar on mobile with subtle text cue and clean desktop tabs.
- [ ] **Step 4: Run unit tests**
  Run: `node --test tests/event-dashboard-unified-redesign.test.mjs`
  Verify tab bar and navigation tests pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/events/dashboard/dashboard-types.ts src/components/events/dashboard/event-dashboard-view.tsx src/app/\(member\)/events/\[eventId\]/dashboard/page.tsx
  git commit -m "feat(events): implement 5-tab unified primary navigation with legacy query mapping"
  ```

---

### Task 4: Modernize Tab 1 (Overview) with 2x2 Interactive KPIs & Budget Ceiling Card

**Files:**
- Modify: `src/components/events/dashboard/tab-overview.tsx`

**Interfaces:**
- Consumes: Financial metrics, cost centers, ticket tiers, transactions, `onNavigateTab`, `onOpenRecordModal`, `onOpenBudgetCeilingModal`.
- Produces: Over-budget warning banner, pending verification alert, 2x2 tappable KPI cards (`Ticket Sales`, `Total Money In`, `Total Spent`, `Net Surplus`), approved budget ceiling card with headroom bar, top spending categories, box office summary, and recent transactions.

- [ ] **Step 1: Add over-budget and pending-review alert callouts**
  Display clear notifications when expenses exceed ceiling or when pending transactions await review.
- [ ] **Step 2: Refactor 4 KPI cards to 2x2 grid with deep-linking**
  Tapping `Ticket Sales` jumps to Tickets; tapping `Total Money In` jumps to Budget/Revenue; tapping `Total Spent` jumps to Budget/Expenses; tapping `Net Surplus` jumps to Statement.
- [ ] **Step 3: Refactor Approved Budget card with utilization bar**
  Show total approved ceiling, allocated amount, unallocated buffer, and quick "Edit Ceiling" / "Manage Allocations" links.
- [ ] **Step 4: Update recent transactions to compact 2-line cards**
  Show status dot, title, amount, category, date, and receipt indicator.
- [ ] **Step 5: Run unit tests**
  Run: `node --test tests/event-dashboard-unified-redesign.test.mjs`
  Verify overview tests pass.
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/events/dashboard/tab-overview.tsx
  git commit -m "feat(events): modernize overview tab with 2x2 interactive KPIs and budget ceiling health"
  ```

---

### Task 5: Enhance Tab 2 (Tickets) with Inventory Tiers & Dual-Filter Ledger

**Files:**
- Modify: `src/components/events/dashboard/tab-tickets.tsx`

**Interfaces:**
- Consumes: `ticketTiers`, `transactions`, `onOpenRecordModal`, `onOpenEditTierModal`, `onOpenRetireTierModal`.
- Produces: Ticket sales KPI strip, tier cards with capacity progress bars and edit/retire actions, and ticket sales records with status (`All`, `Pending`, `Approved`, `Cancelled`) and channel (`All`, `Member Sales`, `Online Sales`) filter pills.

- [ ] **Step 1: Implement ticket performance summary strip**
  Render approved ticket sales, total sold vs capacity, and multi-segment capacity progress.
- [ ] **Step 2: Update tier cards with status badges and quick actions**
  Render price, sold ratio, progress bar, edit and retire/activate triggers for authorized officers.
- [ ] **Step 3: Integrate dual-filter bar for ticket transactions**
  Provide status pills and channel pills alongside `EventDomainLedger`.
- [ ] **Step 4: Run unit tests**
  Run: `node --test tests/event-tab-tickets-ledger.test.mjs tests/ticket-sales-ledger-channels.test.mjs`
  Verify tickets tests pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/events/dashboard/tab-tickets.tsx
  git commit -m "feat(events): enhance tickets tab with inventory cards and dual-filter sales ledger"
  ```

---

### Task 6: Consolidate Tab 3 (Budget & Revenue) with Segmented Sub-Views

**Files:**
- Create/Modify: `src/components/events/dashboard/tab-budget-revenue.tsx` (or refactor `tab-budget-allocations.tsx`)
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`

**Interfaces:**
- Consumes: `costCenters`, `revenueStreams`, `budgetCeiling`, `transactions`, `canManageCategories`, `onOpenRecordModal`, `onOpenCategoryModal`, `onOpenBudgetCeilingModal`.
- Produces: Sub-view pills (`Expense Categories`, `Revenue Streams`, `Cash Summary`), allocation summary card with headroom bar, mobile-first progress cards (zero clipping), full-width desktop table, and quick disburse/record triggers.

- [ ] **Step 1: Implement segmented sub-view switcher**
  Support `'cost-centers' | 'revenue-streams' | 'cash-flow'` with active pill styling.
- [ ] **Step 2: Build Expense Categories sub-view**
  Render 3-card summary strip, mobile zero-clip progress cards with percentage usage and buffer, and desktop full-width matrix table.
- [ ] **Step 3: Build Revenue Streams sub-view**
  Render revenue collection target, collected total, collection gap, and stream cards with progress bars.
- [ ] **Step 4: Build Cash Summary sub-view**
  Render money in, money spent, and net balance summary synced with club treasury.
- [ ] **Step 5: Run unit tests**
  Run: `node --test tests/event-tab-budget-matrix.test.mjs tests/event-tab-revenue-expenses-ledgers.test.mjs`
  Verify budget tests pass.
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/events/dashboard/tab-budget-allocations.tsx src/components/events/dashboard/event-dashboard-view.tsx
  git commit -m "feat(events): consolidate budget and revenue streams into sub-segmented workspace"
  ```

---

### Task 7: Implement Tab 4 (Master Ledger) with 2-Line High-Density Cards

**Files:**
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`

**Interfaces:**
- Consumes: All `transactions`, `currentUserId`, `userRole`, `onInspect`, `onApprove`, `onReject`.
- Produces: Master financial register with Type filters (`All`, `Tickets`, `Revenue`, `Expenses`), Status filters (`All`, `Pending`, `Approved`, `Cancelled / Reversed`), live search, category dropdown, transaction count & net sum, and 2-line compact cards with receipt paperclip icons.

- [ ] **Step 1: Add domain type filter pills in `EventDomainLedger`**
  Support filtering across all transaction types (`All`, `Tickets`, `Revenue`, `Expenses`).
- [ ] **Step 2: Add live net balance calculation for filtered rows**
  Display `Net: ±₦...` next to total transaction count.
- [ ] **Step 3: Implement 2-line compact card layout for mobile view**
  Line 1: Status dot, title/description, counterparty, amount (+/-).
  Line 2: Category, date, receipt icon, status label.
- [ ] **Step 4: Wire click handler to open Voucher Inspection Drawer**
  Clicking any card opens the voucher drawer with verification actions.
- [ ] **Step 5: Run unit tests**
  Run: `node --test tests/event-domain-ledger-ui.test.mjs`
  Verify ledger tests pass.
- [ ] **Step 6: Commit**
  ```bash
  git add src/components/events/dashboard/event-domain-ledger.tsx src/components/events/dashboard/event-dashboard-view.tsx
  git commit -m "feat(events): implement master ledger with 2-line high-density cards and type filters"
  ```

---

### Task 8: Consolidate Tab 5 (Statement & Team)

**Files:**
- Modify: `src/components/events/dashboard/tab-reports.tsx`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`

**Interfaces:**
- Consumes: `event`, `teamMembers`, `revenueStreams`, `costCenters`, `transactions`, `userRole`, `onOpenDownloadReportModal`.
- Produces: Section A: Event Committee & Officers (cards with member avatars, roles, handles, scopes, and assign trigger); Section B: Official Financial Statement (club letterhead, accounting reference, reconciled check, 4-metric strip, income/expense breakdown tables, and executive sign-off cards).

- [ ] **Step 1: Integrate Committee Members roster into statement view**
  Render assigned officers at top with roles and contact handles.
- [ ] **Step 2: Refactor Official Financial Statement layout**
  Include club letterhead block, reference code, status check, P&L breakdown, and officer sign-offs.
- [ ] **Step 3: Wire PDF/CSV download and print actions**
  Connect buttons to `DownloadReportModal` and native print dialog.
- [ ] **Step 4: Run unit tests**
  Run: `node --test tests/event-finance-pdf-export.test.mjs`
  Verify statement and export tests pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/events/dashboard/tab-reports.tsx src/components/events/dashboard/event-dashboard-view.tsx
  git commit -m "feat(events): consolidate financial statement and committee roster into tab 5"
  ```

---

### Task 9: Polish Officer Modals & Voucher Verification Drawer

**Files:**
- Modify: `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- Modify: `src/components/events/dashboard/modals/record-transaction-modal.tsx`
- Modify: `src/components/events/dashboard/modals/event-category-management-modal.tsx`
- Modify: `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`

**Interfaces:**
- Consumes: Modal states, server action callbacks.
- Produces:
  - `VoucherInspectionDrawer`: Bottom sheet on mobile with receipt preview link, `Approve Entry`, `Flag / Pending`, and `Reverse / Cancel` with mandatory reason prompt.
  - `RecordTransactionModal`: Segmented mode selector (`Expense`, `Ticket Sale`, `Revenue Inflow`), amount input, payment method, status picker, and receipt upload dropzone with preview chip.
  - `EventCategoryManagementModal`: Dynamic headroom bar with unallocated reserve calculation and per-category limit editing.
  - `EventBudgetCeilingModal`: Ceiling amount input and revision reason textarea.

- [ ] **Step 1: Enhance `VoucherInspectionDrawer` with officer verification actions**
  Add Approve, Flag, and Cancel/Void buttons wired to server actions.
- [ ] **Step 2: Polish `RecordTransactionModal` file upload preview chip**
  Show uploaded file chip with remove button and clear helper text.
- [ ] **Step 3: Verify dialog accessibility and CSP attributes**
  Ensure zero inline `style={{...}}`, valid ARIA dialog attributes, and 44px touch targets.
- [ ] **Step 4: Run unit tests**
  Run: `node --test tests/event-voucher-inspection-drawer.test.mjs tests/event-dashboard-ui-hygiene.test.mjs`
  Verify drawer and modal hygiene tests pass.
- [ ] **Step 5: Commit**
  ```bash
  git add src/components/events/dashboard/voucher-inspection-drawer.tsx src/components/events/dashboard/modals/record-transaction-modal.tsx src/components/events/dashboard/modals/event-category-management-modal.tsx
  git commit -m "feat(events): polish voucher inspection drawer and officer modal workflows"
  ```

---

### Task 10: Full Regression Testing & Quality Assurance

**Files:**
- All modified files

- [ ] **Step 1: Run complete test suite**
  Run: `npm test`
  Verify all 1,030+ tests pass with 0 failures.
- [ ] **Step 2: Run linter and type check**
  Run: `npm run lint` and `npx tsc --noEmit`
  Verify clean lint and type checks.
- [ ] **Step 3: Responsive verification across viewports**
  Verify layout at 320px, 390px, 768px, and 1280px.
- [ ] **Step 4: Commit any final polish**
  ```bash
  git commit -m "chore(events): final quality assurance and verification for event dashboard redesign"
  ```
