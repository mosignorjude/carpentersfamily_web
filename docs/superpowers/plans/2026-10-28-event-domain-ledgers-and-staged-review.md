# Event Domain Ledgers & Staged Officer Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 20-row paginated domain ledgers for Tickets, Revenue, and Expenses with a split-view receipt voucher inspection drawer, segregated officer reversal controls, and consolidated master portfolio matrix cards.

**Architecture:** Domain transactions post immediately (`recorded`) to active totals while allowing authorized officers to inspect receipts side-by-side in a split-screen drawer and reverse fraudulent/mismatched records (`rejected`), which automatically rolls back balances and restores ticket inventory. Standalone category/tier cards across domain tabs are consolidated into scannable single-card portfolio matrices with single-button entry creation in the header.

**Tech Stack:** Next.js 15 (App Router, Server Actions), Supabase (PostgreSQL 15, PL/pgSQL RPCs, RLS), Tailwind CSS (Warm Editorial design tokens), Node.js test runner (`node:test`, `node:assert/strict`).

**Spec:** [docs/superpowers/specs/2026-10-28-event-domain-ledgers-and-staged-review-design.md](file:///c:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/specs/2026-10-28-event-domain-ledgers-and-staged-review-design.md)

## Global Constraints

- **Currency & Formats:** Whole Nigerian Naira (₦ NGN). All timestamps formatted in Africa/Lagos (WAT).
- **Table Blowout Prevention:** Long 36-character UUIDs must never be rendered untruncated; use `#REF` badge pattern (`paymentRef || id.slice(0, 8)` with full UUID in tooltip).
- **Pagination Floor & Ceiling:** Exactly 20 transactions per page with client-side slicing and previous/next navigation.
- **Segregation of Duties:** Admins and Backup Admins can verify and reverse their own transactions and others; Executives cannot self-verify or self-reverse (`actor_id <> created_by` enforced at UI and RPC layers).
- **Terminal State Invariant:** `rejected` is terminal. Re-approving a rejected transaction is forbidden.
- **Design Tokens:** Warm Editorial palette (`#174C37` Forest Green, `#BA3C2A` Terracotta, `#FAF6F0` Parchment, `#E5DDD3` Warm Border, `#3D291F` Deep Espresso, `#D6A23A` Amber).

## Review Focus

1. **Executive self-verification attempt:** When an executive attempts to approve or reverse a transaction they entered, the RPC raises `42501` and the UI replaces decision buttons with *"Awaiting Independent Officer Review"*. (Pinned to Task 1 & Task 4).
2. **Terminal rejection invariant:** Attempting to verify or re-approve an already `rejected` entry raises an invalid transition exception. (Pinned to Task 1).
3. **Pagination slicing bounds:** Datasets with $>20$ rows display exactly 20 items per page with accurate boundary math ("Showing 1 – 20 of X"). (Pinned to Task 3).
4. **Income category validation bugfix:** Recording income transactions with resolved category must not raise constraint violation `23514`. (Pinned to Task 1).
5. **Ticket inventory restoration on reversal:** Reversing a ticket sale automatically decrements the tier's sold count, restoring ticket inventory. (Pinned to Task 1 & Task 5).

---

### Task 1: Database Migration for Verification Status, Segregation of Duties RPCs, and Revenue Category Bugfix

**Files:**
- Create: `supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql`
- Test: `tests/event-domain-ledger-migration.test.mjs`

**Interfaces:**
- Produces:
  - Columns on `event_financial_transactions`: `verification_status`, `verified_by`, `verified_at`, `rejection_reason`.
  - Columns on `event_ticket_sales`: `verification_status`, `verified_by`, `verified_at`, `rejection_reason`.
  - RPC: `public.verify_event_financial_transaction(p_transaction_id uuid, p_decision text, p_reason text)`
  - RPC: `public.verify_event_ticket_sale(p_sale_id uuid, p_decision text, p_reason text)`
  - Updated RPC: `public.record_event_financial_transaction(...)` removing income category check and setting `verification_status = 'recorded'`.
  - Updated RPC: `public.record_event_ticket_sale(...)` setting `verification_status = 'recorded'`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-domain-ledger-migration.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync(
  new URL("../supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql", import.meta.url),
  "utf8"
);

describe("Event Domain Ledgers & Verification Migration", () => {
  it("adds verification_status column with check constraint to transactions and ticket sales", () => {
    assert.match(migrationSource, /verification_status\s+text\s+not\s+null\s+default\s+'approved'/i);
    assert.match(migrationSource, /check\s*\(\s*verification_status\s+in\s*\('recorded',\s*'approved',\s*'rejected'\)\s*\)/i);
  });

  it("enforces segregation of duties in verify_event_financial_transaction", () => {
    assert.match(migrationSource, /create\s+or\s+replace\s+function\s+public\.verify_event_financial_transaction/i);
    assert.match(migrationSource, /42501/);
    assert.match(migrationSource, /v_actor_role\s*=\s*'executive'\s+and\s+v_txn\.created_by\s*=\s*v_actor_id/i);
  });

  it("prevents re-approving rejected entries (terminal state)", () => {
    assert.match(migrationSource, /v_txn\.verification_status\s*=\s*'rejected'/i);
  });

  it("fixes the income category check in record_event_financial_transaction", () => {
    assert.match(migrationSource, /create\s+or\s+replace\s+function\s+public\.record_event_financial_transaction/i);
    assert.doesNotMatch(migrationSource, /p_kind\s*=\s*'income'\s+and\s*\(p_budget_allocation_id\s+is\s+not\s+null\s+or\s+p_category_id\s+is\s+not\s+null\)/i);
  });

  it("populates voided_at on financial transaction rejection and refunded_at on ticket sale rejection", () => {
    assert.match(migrationSource, /voided_at\s*=\s*clock_timestamp\(\)/i);
    assert.match(migrationSource, /refunded_at\s*=\s*clock_timestamp\(\)/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-domain-ledger-migration.test.mjs`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `20261028000000_event_domain_ledgers_and_verification.sql`**

Write the migration in `supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql`:
1. `alter table public.event_financial_transactions add column if not exists verification_status text not null default 'approved' check (verification_status in ('recorded', 'approved', 'rejected')), add column if not exists verified_by uuid references public.member_profiles(id), add column if not exists verified_at timestamptz, add column if not exists rejection_reason text;`
2. `alter table public.event_ticket_sales add column if not exists verification_status text not null default 'approved' check (verification_status in ('recorded', 'approved', 'rejected')), add column if not exists verified_by uuid references public.member_profiles(id), add column if not exists verified_at timestamptz, add column if not exists rejection_reason text;`
3. Update existing voided entries to `verification_status = 'rejected'` and unvoided to `'approved'`.
4. Replace `public.record_event_financial_transaction` removing `or p_category_id is not null` check on income and defaulting new rows to `verification_status = 'recorded'`.
5. Replace `public.record_event_ticket_sale` defaulting new rows to `verification_status = 'recorded'`.
6. Implement `public.verify_event_financial_transaction` and `public.verify_event_ticket_sale` with:
   - Role check: `admin`, `backup_admin`, `executive`.
   - Segregation of duties: `IF v_actor_role = 'executive' AND v_record.created_by = v_actor_id THEN RAISE EXCEPTION 'Segregation of duties: Executives cannot verify their own transactions' USING ERRCODE = '42501'; END IF;`
   - Terminal state check: `IF v_record.verification_status = 'rejected' THEN RAISE EXCEPTION 'Cannot modify rejected entry: rejection is terminal' USING ERRCODE = '22000'; END IF;`
   - Setting `voided_at`/`refunded_at`, inserting audit trail record into `public.audit_log`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-domain-ledger-migration.test.mjs`
Expected: PASS.

- [ ] **Step 5: Apply migration to local Supabase Docker DB**

Run: `npx supabase migration up --local` (or `npx supabase db push`) to verify SQL runs cleanly without syntax errors on PostgreSQL 15.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql tests/event-domain-ledger-migration.test.mjs
git commit -m "feat(events): add verification status, segregation of duties RPCs, and income category bugfix"
```

---

### Task 2: Dashboard Types, Server Actions & Financial Invariants

**Files:**
- Modify: `src/components/events/dashboard/dashboard-types.ts:75-105`
- Modify: `src/app/(member)/events/[eventId]/dashboard/actions.ts:280-350`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:645-715`
- Test: `tests/event-verification-actions.test.mjs`

**Interfaces:**
- Consumes: Task 1 RPCs (`verify_event_financial_transaction`, `verify_event_ticket_sale`).
- Produces:
  - `verificationStatus: "recorded" | "approved" | "rejected"` on `DashboardTransaction`.
  - `verifiedBy?: string`, `verifiedAt?: string`, `rejectionReason?: string`, `createdBy?: string` on `DashboardTransaction`.
  - Server actions: `verifyEventFinancialTransactionAction` and `verifyEventTicketSaleAction`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-verification-actions.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/(member)/events/[eventId]/dashboard/actions.ts", import.meta.url),
  "utf8"
);
const typesSource = readFileSync(
  new URL("../src/components/events/dashboard/dashboard-types.ts", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../src/app/(member)/events/[eventId]/dashboard/page.tsx", import.meta.url),
  "utf8"
);

describe("Event Verification Server Actions & Types", () => {
  it("defines verificationStatus in DashboardTransaction", () => {
    assert.match(typesSource, /verificationStatus\??:\s*"recorded"\s*\|\s*"approved"\s*\|\s*"rejected"/);
    assert.match(typesSource, /createdBy\??:\s*string/);
  });

  it("exports verifyEventFinancialTransactionAction", () => {
    assert.match(actionsSource, /export\s+async\s+function\s+verifyEventFinancialTransactionAction/);
    assert.match(actionsSource, /rpc\("verify_event_financial_transaction"/);
    assert.match(actionsSource, /revalidatePath/);
  });

  it("exports verifyEventTicketSaleAction", () => {
    assert.match(actionsSource, /export\s+async\s+function\s+verifyEventTicketSaleAction/);
    assert.match(actionsSource, /rpc\("verify_event_ticket_sale"/);
    assert.match(actionsSource, /revalidatePath/);
  });

  it("maps verificationStatus and createdBy in page.tsx transactions", () => {
    assert.match(pageSource, /verificationStatus:\s*t\.verification_status/);
    assert.match(pageSource, /verificationStatus:\s*s\.verification_status/);
    assert.match(pageSource, /createdBy:\s*t\.created_by/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-verification-actions.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Update `dashboard-types.ts`, `actions.ts`, and `page.tsx`**

1. In `src/components/events/dashboard/dashboard-types.ts`:
   - Add `verificationStatus?: "recorded" | "approved" | "rejected";`
   - Add `verifiedBy?: string; verifiedAt?: string; rejectionReason?: string; createdBy?: string;`
2. In `src/app/(member)/events/[eventId]/dashboard/actions.ts`:
   - Implement `verifyEventFinancialTransactionAction({ eventId, transactionId, decision, reason })` calling `verify_event_financial_transaction`.
   - Implement `verifyEventTicketSaleAction({ eventId, saleId, decision, reason })` calling `verify_event_ticket_sale`.
   - Validate that if `decision === 'rejected'`, `reason` is non-empty string.
   - On success call `revalidatePath(`/events/${eventId}/dashboard`)`.
3. In `src/app/(member)/events/[eventId]/dashboard/page.tsx`:
   - Query `verification_status, verified_by, verified_at, rejection_reason, created_by` on transactions and sales.
   - Map them to `manualTransactions` and `saleTransactions`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-verification-actions.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/dashboard-types.ts src/app/\(member\)/events/\[eventId\]/dashboard/actions.ts src/app/\(member\)/events/\[eventId\]/dashboard/page.tsx tests/event-verification-actions.test.mjs
git commit -m "feat(events): add verification server actions and transaction type mappings"
```

---

### Task 3: Reusable `<EventDomainLedger />` Component

**Files:**
- Create: `src/components/events/dashboard/event-domain-ledger.tsx`
- Test: `tests/event-domain-ledger-ui.test.mjs`

**Interfaces:**
- Consumes: `DashboardTransaction` from Task 2.
- Produces: `<EventDomainLedger />` supporting 20-row client-side pagination, search filtering, status filtering pills, `#REF` badges, and segregated inspection triggers.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-domain-ledger-ui.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/event-domain-ledger.tsx", import.meta.url),
  "utf8"
);

describe("EventDomainLedger UI Component", () => {
  it("enforces 20 items per page pagination constant", () => {
    assert.match(source, /PAGE_SIZE\s*=\s*20/);
    assert.match(source, /slice\(\s*startIndex,\s*endIndex\s*\)/);
  });

  it("renders status filter pills including Pending Review, Approved, and Rejected", () => {
    assert.match(source, /Pending Review/);
    assert.match(source, /Approved/);
    assert.match(source, /Rejected/);
  });

  it("formats reference cell using #REF badge pattern with tooltip", () => {
    assert.match(source, /paymentRef\s*\|\|\s*.*id\.slice\(0,\s*8\)/);
    assert.match(source, /title=\{.*id.*\}/);
  });

  it("restricts self-verification for executives by checking createdBy against currentUserId", () => {
    assert.match(source, /isExecutive\s*&&\s*.*createdBy\s*===/);
    assert.match(source, /Awaiting Independent Officer Review/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-domain-ledger-ui.test.mjs`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `src/components/events/dashboard/event-domain-ledger.tsx`**

Build `<EventDomainLedger />`:
- Props:
  - `title: string`
  - `domain: "tickets" | "revenue" | "expenses"`
  - `transactions: DashboardTransaction[]`
  - `currentUserId?: string`
  - `userRole?: string`
  - `onInspect: (txn: DashboardTransaction) => void`
  - `onApprove?: (txn: DashboardTransaction) => void`
  - `onReject?: (txn: DashboardTransaction) => void`
- State:
  - `currentPage = 1`
  - `statusFilter = "all" | "recorded" | "approved" | "rejected"`
  - `searchQuery = ""`
- Logic:
  - `PAGE_SIZE = 20`
  - Filters transactions by status pill and search query (matches `paymentRef`, `id`, `description`, `payerPayee`).
  - Slices `filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)`.
  - Pagination bar: "Showing X – Y of Z transactions", Previous, Next, page buttons.
  - Rows:
    - `#REF` badge (uppercase 8-char slice or paymentRef with tooltip).
    - Description & Counterparty.
    - Category pill.
    - Amount formatted in Naira (monospace, green for revenue/tickets, red for expenses, strikethrough for `rejected`).
    - Receipt status (`ReceiptCell`).
    - Status pill (`Recorded (Pending)`, `Approved`, `Rejected`).
    - Action buttons: "Inspect" button for all members. For officers, quick "Approve" and "Reject" buttons on `recorded` rows, replaced with *"Awaiting Independent Officer Review"* badge if `userRole === 'executive' && txn.createdBy === currentUserId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-domain-ledger-ui.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/event-domain-ledger.tsx tests/event-domain-ledger-ui.test.mjs
git commit -m "feat(events): create reusable EventDomainLedger with 20-row pagination and review pills"
```

---

### Task 4: Split-View Voucher Inspection Drawer

**Files:**
- Create: `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- Test: `tests/event-voucher-inspection-drawer.test.mjs`

**Interfaces:**
- Consumes: `DashboardTransaction` from Task 2, `verifyEventFinancialTransactionAction` and `verifyEventTicketSaleAction`.
- Produces: `<VoucherInspectionDrawer />` for side-by-side receipt audit and officer approval/rejection.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-voucher-inspection-drawer.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/voucher-inspection-drawer.tsx", import.meta.url),
  "utf8"
);

describe("VoucherInspectionDrawer Component", () => {
  it("renders split-view layout with transaction metadata and voucher document preview", () => {
    assert.match(source, /grid\s+grid-cols-1\s+lg:grid-cols-2/);
    assert.match(source, /Claimed Transaction Details/i);
    assert.match(source, /Receipt Voucher Evidence/i);
  });

  it("requires mandatory rejection reason before submitting rejection", () => {
    assert.match(source, /rejectionReason/i);
    assert.match(source, /p_reason|reason\.trim\(\)/);
    assert.match(source, /Reject\s*\/\s*Reverse/i);
  });

  it("enforces segregation of duties for executive users", () => {
    assert.match(source, /isExecutiveSelfReview/i);
    assert.match(source, /Awaiting Independent Officer Review/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-voucher-inspection-drawer.test.mjs`
Expected: FAIL (file not found).

- [ ] **Step 3: Implement `src/components/events/dashboard/voucher-inspection-drawer.tsx`**

Build `<VoucherInspectionDrawer />`:
- Props:
  - `isOpen: boolean`
  - `onClose: () => void`
  - `transaction: DashboardTransaction | null`
  - `eventId: string`
  - `currentUserId?: string`
  - `userRole?: string`
  - `canVerify?: boolean`
- Layout:
  - Slide-over or modal with split-screen view on `lg:` screens:
    - Left column: Claimed Amount (large Naira display), Submitter / Counterparty, Date/Time (WAT), Category, Description, and Submission Status.
    - Right column: Cloudflare R2 preview. If receipt image $\rightarrow$ `<img />` with zoom; if PDF $\rightarrow$ `<iframe />` or PDF document viewer link; if no receipt $\rightarrow$ warning box: *"No receipt document attached to this claim"*.
- Actions:
  - If `canVerify` and transaction is not `rejected`:
    - If `userRole === 'executive' && transaction.createdBy === currentUserId`: Render notice *"Segregation of Duties: You submitted this record. An independent officer must audit and verify it."*
    - Otherwise: "Approve Record" button and "Reject / Reverse" button.
    - Clicking "Reject / Reverse" opens a required reason textarea (min 5 chars).
    - Submitting calls `verifyEventFinancialTransactionAction` or `verifyEventTicketSaleAction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-voucher-inspection-drawer.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/voucher-inspection-drawer.tsx tests/event-voucher-inspection-drawer.test.mjs
git commit -m "feat(events): implement split-view VoucherInspectionDrawer with segregation of duties"
```

---

### Task 5: Consolidated Master Cards & Ledger Integration in Tickets Tab

**Files:**
- Modify: `src/components/events/dashboard/tab-tickets.tsx`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:710-760`
- Test: `tests/event-tab-tickets-ledger.test.mjs`

**Interfaces:**
- Consumes: `<EventDomainLedger />` (Task 3), `<VoucherInspectionDrawer />` (Task 4), `saleTransactions` (Task 2).
- Produces: Refactored `TabTickets` with consolidated "Admission Tiers & Inventory Matrix" card and embedded Ticket Sales Ledger.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-tab-tickets-ledger.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-tickets.tsx", import.meta.url),
  "utf8"
);

describe("TabTickets Single-Card Matrix & Ledger Integration", () => {
  it("consolidates tiers into a single table matrix card instead of multi-card grid", () => {
    assert.doesNotMatch(source, /grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-\[repeat\(auto-fit,minmax\(280px,1fr\)\)\]/);
    assert.match(source, /Admission Tiers & Inventory Matrix/i);
    assert.match(source, /<table/);
  });

  it("features single primary Record Ticket Sale button in header and no row-level record sale buttons", () => {
    assert.match(source, /Record Ticket Sale/);
    assert.doesNotMatch(source, /<button[^>]*>Record Sale<\/button>/i);
  });

  it("limits tier row actions to Edit and Retire", () => {
    assert.match(source, /onOpenEditTierModal/);
    assert.match(source, /onOpenRetireTierModal/);
  });

  it("embeds EventDomainLedger for ticket sales", () => {
    assert.match(source, /<EventDomainLedger/);
    assert.match(source, /domain="tickets"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-tab-tickets-ledger.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Refactor `tab-tickets.tsx`**

1. Replace the separate tier cards grid with the consolidated "Admission Tiers & Inventory Matrix" card:
   - Header: Gross Ticketing Inflow stat pill, Total Passes Issued stat pill, `+ Add Ticket Tier` button, and the single primary `Record Ticket Sale` button.
   - Proportional capacity mix bar.
   - Table rows: Tier Name & Description, Unit Price, Passes Issued & Quota progress bar, Gross Inflow, and `Edit` & `Retire` buttons.
2. Embed `<EventDomainLedger />` beneath the master matrix card:
   - Pass `transactions={ticketSalesTransactions}`.
   - Pass `domain="tickets"`, `title="Ticket Sales Ledger"`.
   - Wire inspection drawer state.
3. Update `page.tsx` to pass `ticketSalesTransactions={saleTransactions}` into `<TabTickets />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-tab-tickets-ledger.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-tickets.tsx src/app/\(member\)/events/\[eventId\]/dashboard/page.tsx tests/event-tab-tickets-ledger.test.mjs
git commit -m "feat(events): consolidate tier cards into master matrix and embed ticket sales ledger"
```

---

### Task 6: Consolidated Master Cards & Ledger Integration in Revenue & Expense Tabs

**Files:**
- Modify: `src/components/events/dashboard/tab-revenue.tsx`
- Modify: `src/components/events/dashboard/tab-expenses.tsx`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:710-760`
- Test: `tests/event-tab-revenue-expenses-ledgers.test.mjs`

**Interfaces:**
- Consumes: `<EventDomainLedger />` (Task 3), `<VoucherInspectionDrawer />` (Task 4), `manualTransactions` (Task 2).
- Produces: Consolidated single-card matrices and domain ledgers in `TabRevenue` and `TabExpenses`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-tab-revenue-expenses-ledgers.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const revSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-revenue.tsx", import.meta.url),
  "utf8"
);
const expSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);

describe("TabRevenue & TabExpenses Single-Card Matrices & Ledgers", () => {
  it("consolidates revenue streams into a single matrix card with single header record button", () => {
    assert.doesNotMatch(revSource, /grid\s+grid-cols-1\s+lg:grid-cols-2\s+gap-5/);
    assert.match(revSource, /Revenue Streams & Inflow Matrix/i);
    assert.match(revSource, /Record Revenue/);
    assert.match(revSource, /<EventDomainLedger/);
    assert.match(revSource, /domain="revenue"/);
  });

  it("consolidates cost centers into a single matrix card with single header disburse button", () => {
    assert.doesNotMatch(expSource, /grid\s+grid-cols-1\s+lg:grid-cols-2\s+gap-5/);
    assert.match(expSource, /Operational Cost Centers & Budget Matrix/i);
    assert.match(expSource, /Record Disbursement/);
    assert.match(expSource, /<EventDomainLedger/);
    assert.match(expSource, /domain="expenses"/);
  });

  it("does not render per-row recording buttons in revenue or expense matrices", () => {
    assert.doesNotMatch(revSource, /<button[^>]*>Record<\/button>/i);
    assert.doesNotMatch(expSource, /<button[^>]*>Disburse<\/button>/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-tab-revenue-expenses-ledgers.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Refactor `tab-revenue.tsx` and `tab-expenses.tsx`**

1. In `tab-revenue.tsx`:
   - Replace 5-card grid with consolidated "Revenue Streams & Inflow Matrix" card.
   - Single `Record Revenue` button in the header strip.
   - Rows: Channel Icon & Name, Target, Reconciled Inflow, Pending Receivables, Fulfillment %, Target Status.
   - Embed `<EventDomainLedger />` with `domain="revenue"`, passing non-dues income transactions.
2. In `tab-expenses.tsx`:
   - Replace 4-card grid with consolidated "Operational Cost Centers & Budget Matrix" card.
   - Single `Record Disbursement` button in the header strip.
   - Rows: Cost Center Icon & Name, Budget Ceiling, Disbursed Spend, Committed POs, Utilization Bar, Buffer badge.
   - Embed `<EventDomainLedger />` with `domain="expenses"`, passing disbursement transactions.
3. In `page.tsx`:
   - Split `manualTransactions` into `incomeTransactions = manualTransactions.filter(t => t.type === 'revenue')` and `disbursementTransactions = manualTransactions.filter(t => t.type === 'expense')`.
   - Pass them to `TabRevenue` and `TabExpenses`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-tab-revenue-expenses-ledgers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-revenue.tsx src/components/events/dashboard/tab-expenses.tsx src/app/\(member\)/events/\[eventId\]/dashboard/page.tsx tests/event-tab-revenue-expenses-ledgers.test.mjs
git commit -m "feat(events): consolidate revenue and expense cards into master matrices and embed ledgers"
```

---

### Task 7: Consolidated Capital Allocation Matrix in Budget & Allocations Tab

**Files:**
- Modify: `src/components/events/dashboard/tab-budget-allocations.tsx:165-310`
- Test: `tests/event-tab-budget-matrix.test.mjs`

**Interfaces:**
- Produces: Consolidated "Capital Allocation & Burn Rate Matrix" in `TabBudgetAllocations`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/event-tab-budget-matrix.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-budget-allocations.tsx", import.meta.url),
  "utf8"
);

describe("TabBudgetAllocations Single Matrix Consolidation", () => {
  it("consolidates allocation tiles and comparative bars into a single matrix card", () => {
    assert.doesNotMatch(source, /grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-4\s+gap-4/);
    assert.match(source, /Capital Allocation & Burn Rate Matrix/i);
    assert.match(source, /<table/);
  });

  it("displays allocation ceiling, disbursed spend, committed POs, and burn rate bar in one view", () => {
    assert.match(source, /Allocated/i);
    assert.match(source, /Disbursed/i);
    assert.match(source, /Committed/i);
    assert.match(source, /Burn Rate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-tab-budget-matrix.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Refactor `tab-budget-allocations.tsx`**

1. Replace the separate 4-box grid and bottom bar matrix with a single cohesive "Capital Allocation & Burn Rate Matrix" card:
   - Header: Total Budget Ceiling, Total Burn Rate %, and Edit Budget button.
   - Table Rows: Category Name, Ceiling Allocation & %, Disbursed Outflow, Committed POs, Utilization Bar, Buffer Status badge (`Healthy`, `Near Cap`, `Over Budget`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-tab-budget-matrix.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-budget-allocations.tsx tests/event-tab-budget-matrix.test.mjs
git commit -m "feat(events): consolidate budget allocation view into single capital allocation matrix"
```

---

### Task 8: Full Test Suite, Regression Verification & Production Build

**Files:**
- Test: all existing and new test suites

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass (0 failures).

- [ ] **Step 2: Run lint check**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Run Next.js production build**

Run: `npm run build`
Expected: Succeeded with exit code 0 across all static and dynamic app routes.

- [ ] **Step 4: Commit any final cleanup or doc updates**

```bash
git commit -m "chore(events): verify full test suite and production build for domain ledgers"
```
