# Mobile Responsive Phase 3 Implementation Plan: Table-to-Card Responsive Transformation & Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform multi-column desktop financial and attendance tables into touch-friendly mobile transaction cards (`md:hidden` / `sm:hidden`), increase filter chip tap targets to $\ge 38\text{px}$ (WCAG 2.5.8), and darken secondary text to `#6B5D53` (WCAG 1.4.3 $\ge 4.5:1$ contrast) while keeping 100% of existing desktop markup and test assertions passing.

**Architecture:** 
1. Maintain existing desktop tables inside responsive wrapper blocks (`hidden md:block` / `hidden sm:block`) with their exact headers, class names, and test-asserted strings (`Admission Tiers & Inventory Matrix`, `Operational Cost Centers & Budget Matrix`, `Recorded/Auth by`, `TableScroll`).
2. Render mobile-optimized card lists (`md:hidden` / `sm:hidden`) that display transaction references, color-coded amounts, status badges, voucher evidence (`ReceiptCell`), and touch-friendly action buttons ($\ge 44\text{px}$).
3. Elevate filter buttons to `min-h-[38px]` across all ledger and roster controls.
4. Add comprehensive unit test `tests/mobile-transaction-cards.test.mjs` and execute end-to-end mobile browser verification at 390×844.

**Tech Stack:** Next.js 16 App Router, React 19.3.1, Tailwind CSS v4, Biome, Node.js `--test`.

**Spec:** `docs/ux-audit-2026-10-28-mobile-responsive.md` & `C:\Users\HomePC\.gemini\antigravity\brain\e08de48a-024f-496e-8905-753549c6af42\mobile-responsive-ui-ux-audit.md`.

---

## Global Constraints

- Preserve Warm Editorial design aesthetic (`#174C37` Forest Green, `#D6A23A` Gold, `#FAF6F0` Warm Ivory, `#E5DDD3` Borders).
- Interactive touch targets on mobile cards must be $\ge 44\times 44\text{px}$ (or $\ge 38\text{px}$ for compact filter pills).
- Preserve all existing desktop table structures and exact string assertions (`tests/event-tab-tickets-ledger.test.mjs`, `tests/event-tab-revenue-expenses-ledgers.test.mjs`, `tests/event-domain-ledger-ui.test.mjs`, `tests/event-audit-log-ui.test.mjs`, `tests/event-ledger-recorded-by.test.mjs`, `tests/finance-table-scroll-region.test.mjs`).
- Clean gates: `npx tsc --noEmit` exits 0, `npm test` passes 100% of tests.

---

## File Structure

| File | Responsibility |
| :--- | :--- |
| `src/components/events/dashboard/event-domain-ledger.tsx` | Add mobile transaction cards (`md:hidden`) with ref, party, amount, status pill, voucher, and action buttons. Enlarge filter pills to `min-h-[38px]`. |
| `src/components/events/dashboard/tab-tickets.tsx` | Add mobile card view for Admission Tiers (`sm:hidden`) with progress bar and Edit/Retire controls. Keep desktop table in `hidden sm:block`. |
| `src/components/events/dashboard/tab-revenue.tsx` | Add mobile card view for Revenue Streams matrix (`sm:hidden`). Keep desktop table in `hidden sm:block`. |
| `src/components/events/dashboard/tab-expenses.tsx` | Add mobile card view for Operational Cost Centers matrix (`sm:hidden`). Keep desktop table in `hidden sm:block`. |
| `src/components/events/dashboard/tab-audit-log.tsx` | Add mobile card view for Transaction Journal (`md:hidden`) with ref, category, amount, Recorded/Auth by, and action buttons. Enlarge filter pills. |
| `src/components/finances/club-transaction-ledger.tsx` | Add mobile transaction cards (`md:hidden`) for institutional ledger rows. Enlarge filter buttons to `min-h-[38px]`. |
| `src/components/events/attendance/attendance-roster-table.tsx` | Add mobile attendance cards (`sm:hidden`) with name, status pill, check-in method, WAT time, and Correct action. |
| `tests/mobile-transaction-cards.test.mjs` | New unit test verifying responsive card feeds and touch floors across all 7 modified files. |

---

### Task 1: Event Domain Ledger Mobile Cards & Filter Enlarge (`event-domain-ledger.tsx`)

**Files:**
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx`
- Test: `tests/event-domain-ledger-ui.test.mjs`, `tests/mobile-transaction-cards.test.mjs`

- [x] **Step 1: Enlarge status filter buttons**
  Update filter pills container to `flex-wrap gap-2` and each button to `min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-xl`.
- [x] **Step 2: Add mobile Transaction Feed Card block (`md:hidden`)**
  Render `<div className="md:hidden divide-y divide-[#EBE5DC]">` mapping `pageTransactions`.
  Each card contains:
  - Header: Reference badge (`#{txn.paymentRef || txn.id.slice(0, 8).toUpperCase()}`) and Date font-mono.
  - Body: Description (font-bold), Counterparty label, Category pill, and color-coded Amount (`text-base font-mono font-bold`).
  - Footer: Status badge, Voucher evidence (`ReceiptCell`), and touch-friendly actions (`Inspect` $\ge 44\text{px}$, and officer `Approve` / `Reject` $\ge 44\text{px}$).
- [x] **Step 3: Wrap existing `TableScroll` table in `hidden md:block`**
  Ensure desktop table remains untouched inside `hidden md:block`.
- [x] **Step 4: Verify existing tests pass**
  Run `node --test tests/event-domain-ledger-ui.test.mjs`.

---

### Task 2: Admission Tiers & Dashboard Matrices Mobile Cards (`tab-tickets.tsx`, `tab-revenue.tsx`, `tab-expenses.tsx`)

**Files:**
- Modify: `src/components/events/dashboard/tab-tickets.tsx`
- Modify: `src/components/events/dashboard/tab-revenue.tsx`
- Modify: `src/components/events/dashboard/tab-expenses.tsx`
- Test: `tests/event-tab-tickets-ledger.test.mjs`, `tests/event-tab-revenue-expenses-ledgers.test.mjs`

- [x] **Step 1: Add mobile cards for Admission Tiers in `tab-tickets.tsx`**
  In `tab-tickets.tsx`, add `<div className="sm:hidden space-y-3 p-3">` rendering tier cards:
  - Tier name + Price badge
  - Capacity progress bar with percentage and `sold / capacity`
  - Gross Inflow
  - Action buttons (`Edit`, `Retire`) with $\ge 44\text{px}$ touch targets.
  Wrap `<TableScroll label="Ticket sales">` in `<div className="hidden sm:block">`.
- [x] **Step 2: Add mobile cards for Revenue Streams in `tab-revenue.tsx`**
  In `tab-revenue.tsx`, add `<div className="sm:hidden space-y-3 p-3">` rendering stream cards:
  - Stream name + Status badge
  - Reconciled Inflow vs Target
  - Fulfillment percentage bar
  Wrap `<TableScroll label="Revenue streams by source">` in `<div className="hidden sm:block">`.
- [x] **Step 3: Add mobile cards for Cost Centers in `tab-expenses.tsx`**
  In `tab-expenses.tsx`, add `<div className="sm:hidden space-y-3 p-3">` rendering cost center cards:
  - Cost center name + Status badge
  - Disbursed vs Ceiling
  - Burn percentage bar
  Wrap `<TableScroll label="Cost centers and disbursements">` in `<div className="hidden sm:block">`.
- [x] **Step 4: Verify existing tests pass**
  Run `node --test tests/event-tab-tickets-ledger.test.mjs tests/event-tab-revenue-expenses-ledgers.test.mjs`.

---

### Task 3: Event Audit Log Transaction Journal Mobile Cards (`tab-audit-log.tsx`)

**Files:**
- Modify: `src/components/events/dashboard/tab-audit-log.tsx`
- Test: `tests/event-audit-log-ui.test.mjs`, `tests/event-ledger-recorded-by.test.mjs`, `tests/event-dashboard-receipts.test.mjs`

- [x] **Step 1: Enlarge filter buttons in `tab-audit-log.tsx`**
  Update filter pills to `min-h-[38px] px-3.5 py-1.5`.
- [x] **Step 2: Add mobile Transaction Feed Card block (`md:hidden`)**
  Render `<div className="md:hidden divide-y divide-[#EBE5DC]">` for `filteredTransactions`:
  - Ref badge (`#{txn.paymentRef || txn.id.slice(0, 8).toUpperCase()}`) with tooltip `title={`Full Transaction ID: ${txn.id}`}`.
  - Date, Description, Payer/Payee, and Category.
  - Formatted amount, Recorded/Auth by attribution (`txn.recordedByUsername || txn.authorizedBy || "System"`).
  - Receipt button (`Paperclip` or `ReceiptCell`).
  - `Inspect` button ($\ge 44\text{px}$) and Admin `Void` button ($\ge 44\text{px}$).
- [x] **Step 3: Wrap desktop `TableScroll` in `hidden md:block`**
  Ensure `<TableScroll label="Audit log entries"><table ...>...</table></TableScroll>` is preserved inside `hidden md:block`.
- [x] **Step 4: Verify existing tests pass**
  Run `node --test tests/event-audit-log-ui.test.mjs tests/event-ledger-recorded-by.test.mjs tests/event-dashboard-receipts.test.mjs`.

---

### Task 4: Club Finances Institutional Ledger Mobile Cards (`club-transaction-ledger.tsx`)

**Files:**
- Modify: `src/components/finances/club-transaction-ledger.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Enlarge filter buttons**
  Set filter buttons to `min-h-[38px] px-3.5 py-1.5`.
- [x] **Step 2: Add mobile Transaction Feed Card block (`md:hidden`)**
  Render `<div className="md:hidden divide-y divide-[#E5DDD3]">` for `filteredTransactions`:
  - Date and timestamp.
  - Kind badge (`Voided`, `Opening Balance`, `Non-Dues Income`, `Disbursement`).
  - Title/description and cost center tag.
  - Payer/Payee and Amount (color-coded font-mono).
  - Receipt attachment trigger button with count badge.
  - If `canCorrect`: Correction action button ($\ge 44\text{px}$).
- [x] **Step 3: Wrap desktop `TableScroll` in `hidden md:block`**
  Keep desktop `<TableScroll label="Club financial transactions">` inside `hidden md:block`.

---

### Task 5: Attendance Roster Table Mobile Cards (`attendance-roster-table.tsx`)

**Files:**
- Modify: `src/components/events/attendance/attendance-roster-table.tsx`
- Test: Unit check & mobile verification

- [x] **Step 1: Add mobile Member Attendance Card block (`sm:hidden`)**
  Render `<div className="sm:hidden divide-y divide-[#E5DDD3]">` for `filteredAttendance`:
  - Member Avatar/Initials, Full Name, and @username.
  - Status Badge (`Present`, `Late Arrival`, `Absent`, `Rejected`) with status styles.
  - Method (`QR Scan` / `Self Check-In` / `Session Default`) and WAT time.
  - Audit note if `correction_reason` exists.
  - If `canCorrect`: Full-width `Correct` button with $\ge 44\text{px}$ touch target.
- [x] **Step 2: Wrap desktop `overflow-x-auto` table in `hidden sm:block`**
  Keep desktop `<table>` inside `hidden sm:block`.

---

### Task 6: Contrast Polish (`#6B5D53`) & Touch Target Baseline

**Files:**
- Modify: `src/components/events/events-page-view.tsx`
- Modify: Target secondary text classes across modified files
- Test: `tests/mobile-transaction-cards.test.mjs`

- [x] **Step 1: Enlarge event filter chips in `events-page-view.tsx`**
  Ensure event filter buttons have `min-h-[38px] px-3.5 py-1.5`.
- [x] **Step 2: Elevate secondary helper text contrast**
  Replace low-contrast helper text (`#7A685D`, `#8C7D73`) on light backgrounds with `#6B5D53` across modified components to achieve $\ge 4.5:1$ contrast ratio.

---

### Task 7: Comprehensive Test Suite & Mobile Browser Verification

**Files:**
- Create: `tests/mobile-transaction-cards.test.mjs`
- Test: Full test suite & automated mobile browser capture

- [x] **Step 1: Write `tests/mobile-transaction-cards.test.mjs`**
  Assert responsive card feeds (`md:hidden` / `sm:hidden`) and desktop table preservation (`hidden md:block` / `hidden sm:block`) across all 7 files.
- [x] **Step 2: Run TypeScript check (`npx tsc --noEmit`)**
- [x] **Step 3: Run full test suite (`npm test`)**
- [x] **Step 4: Capture mobile browser screenshots across Tickets, Revenue, Expenses, Audit Log, Finances, and Attendance at 390×844**
