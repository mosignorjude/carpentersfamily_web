# Event Domain Ledgers & Staged Officer Verification Design

## 1. Intent & Context
Currently, all financial transactions and ticket sales for an event are lumped together into a single global table within the **Audit Log** tab. The domain-specific tabs (**Tickets**, **Revenue**, and **Expenses**) only present high-level summary cards without transaction-level visibility. Furthermore, when entries are submitted, officers lack a contextual review tool to inspect attached receipt vouchers side-by-side with claimed amounts to detect discrepancies (such as a ₦100,000 disbursement backed by only a ₦10,000 invoice).

This project introduces:
1. **Three dedicated domain ledgers** embedded directly into the **Tickets**, **Revenue**, and **Expenses** tabs, each paginated at **20 transactions per page**.
2. **Full member transparency**: All active club members can view these ledgers and inspect transaction statuses.
3. **Immediate posting with post-entry officer audit**: Transactions immediately count toward active event totals upon submission ("approved once"), but authorized officers (**Admin**, **Backup Admin**, and **Executive**) can inspect attached receipt vouchers from Cloudflare R2 and **reverse/reject** fraudulent or mismatched entries.
4. **Immutable reversal audit trail**: Rejection immediately deducts the claimed amount from event balances, marks the row as `rejected`, restores ticket inventory (for ticket sales), and permanently records the rejecting officer's identity, timestamp, and explanation in the club audit trail.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Provide dedicated, paginated transaction ledgers (maximum 20 items per page) within `TabTickets`, `TabRevenue`, and `TabExpenses`.
- Allow all verified club members to see these ledgers for governance transparency.
- Provide a split-view **Voucher Inspection Drawer** for officers to compare claimed amounts directly against uploaded Cloudflare R2 receipt documents.
- Give operational officers (`admin`, `backup_admin`, `executive`) one-click **Approve** and **Reject / Reverse** controls.
- Ensure rejections immediately roll back event totals and restore ticket capacity while immutably preserving the record and rejection reason.

### Non-Goals
- Blocking event operations behind a pre-approval gate. Transactions are active upon submission; verification is an ongoing audit oversight control.
- Modifying club-level dues or general club finance ledgers (this design is strictly scoped to event dashboards).
- Enabling permanent hard-deletion of rows from PostgreSQL (violates club audit policy).

### Anti-Goals
- **Table blowout**: Long UUIDs must never be rendered as raw 36-character strings. All ledgers must use the `#REF` badge pattern (`paymentRef` or `id.slice(0, 8)`).
- **Silent reversals**: Officers cannot reverse a record without documenting a mandatory explanation.
- **Data fragmentation**: Summary cards and ledger rows must remain 100% mathematically synchronized.

---

## 3. Constraints
- **Currency & Timezone**: All amounts are in whole Nigerian Naira (₦ NGN). All timestamps must display in Africa/Lagos (WAT).
- **Club Governance Rules**: Under database security rules (`private.is_active_club_member`), only `admin`, `backup_admin`, and `executive` can modify financial records. Ordinary members have read-only access.
- **Design Tokens**: UI must adhere to the Warm Editorial palette (`#174C37` Forest Green, `#BA3C2A` Terracotta/Red, `#FAF6F0` Parchment, `#E5DDD3` Warm Border, `#3D291F` Deep Espresso).

---

## 4. Approaches Considered

### Approach 1: Client-Side Paginated Slices with Server Action Revalidation (Selected)
- Pre-sort event transactions into domain arrays on the server within `page.tsx`.
- Pass transactions to a reusable `<EventDomainLedger />` component that handles 20-item pagination, search, and status filtering client-side.
- Actions (`approve`, `reject`) call Next.js server actions that update the database atomically and trigger `revalidatePath()`.
- **Trade-offs**: Instant pagination turns with zero query latency; perfect synchronization between summary stats and ledger rows. Ideal for social club events (50–500 transactions).

### Approach 2: Server-Side URL-Driven SQL Range Pagination (`.range()`)
- Query Supabase with `.range((page-1)*20, page*20-1)` and coordinate tab-specific query parameters (`?tab=expenses&page_expenses=2`).
- **Trade-offs**: Minimal initial payload for massive datasets, but causes jarring server refreshes on every page turn and complex multi-tab URL state.

**Decision**: The human partner selected **Approach 1**.

---

## 5. Detailed Architecture & Design Decisions

### 5.1 Transaction Status Lifecycle & State Machine
Transactions on both `public.event_financial_transactions` and `public.event_ticket_sales` will track:
- `verification_status`:
  - `recorded`: Active upon submission. Contributes to event totals. Pending officer audit.
  - `approved`: Verified and cleared by an officer. Contributes to event totals.
  - `rejected`: Reversed by an officer due to discrepancy or error. **Zero contribution** to event totals. Ticket capacity restored.
- `verified_by`: UUID of the reviewing officer (FK to `member_profiles`).
- `verified_at`: Timestamp with time zone of the officer decision.
- `rejection_reason`: Mandatory text (1–500 chars) explaining why the record was reversed.

#### State Transitions (Builder Decision)
- `recorded -> approved`: Permitted (officer confirms receipt evidence matches claimed amount).
- `recorded -> rejected`: Permitted (officer detects discrepancy or invalid voucher and reverses).
- `approved -> rejected`: Permitted (officer detects post-approval discrepancy or audit issue and reverses).
- `rejected -> *`: **Terminal**. Once rejected, a record cannot be resurrected (preventing race conditions on restored ticket tier capacity). If the counterparty submits a corrected receipt, a new transaction is entered.

#### Segregation of Duties & Self-Verification Governance
To protect the club against internal financial fraud while maintaining operational flexibility:
- **Admin & Backup Admin**: Possess supreme administrative authority. They can verify, approve, and reverse their own transactions as well as those submitted by others (`actor_id = created_by` is permitted).
- **Executives & Non-Admin Officers**: Subject to strict segregation of duties. An Executive **cannot** self-verify or self-reverse transactions they entered (`actor_id <> created_by` required). An independent officer (another Executive, an Admin, or a Backup Admin) must review and verify the voucher.
- **Enforcement Layers**:
  1. **UI Layer**: For `executive` users viewing an item where `created_by === currentUserId`, the quick "Approve" and "Reject" buttons in the ledger and inspection drawer are replaced by a subtle badge: *"Awaiting Independent Officer Review"*.
  2. **Database Layer (RPC Defense-in-Depth)**: The RPC validates the actor's role against `v_record.created_by`. If the actor has role `executive` and `created_by = auth.uid()`, the transaction is aborted with error code `42501` (`Segregation of duties violation: Executives cannot verify or reverse their own transactions`).

### 5.2 Unification with Void and Refund Architecture (Builder Decision)
To ensure 100% mathematical integrity across all existing views, triggers, and reports without dual-state drift:
- When an `event_financial_transaction` is marked `rejected`, the RPC sets:
  - `verification_status = 'rejected'`
  - `voided_at = clock_timestamp()`
  - `voided_by = auth.uid()`
  - `void_reason = p_reason`
- When an `event_ticket_sale` is marked `rejected`, the RPC sets:
  - `verification_status = 'rejected'`
  - `refunded_at = clock_timestamp()`
  - `refund_reason = p_reason`
  - Restores the sold ticket count against the tier capacity automatically.
- Existing voided/refunded entries from previous migrations default to `verification_status = 'rejected'`. Active historical entries default to `approved`.

### 5.3 Audit Lifecycle for Completed Events (Builder Decision)
- Officers can inspect, approve, and reverse transactions on events in both `scheduled` and `completed` status.
- Post-event receipt reconciliation and secretariat auditing routinely occur after an event has concluded.
- Archived events (`archived_at IS NOT NULL`) remain strictly immutable.

### 5.4 Domain Ledger Scoping (Builder Decision)
Each domain tab maps 1-to-1 to its respective underlying entity:
- **`TabTickets`**: Displays `event_ticket_sales` exclusively.
- **`TabRevenue`**: Displays non-dues income `event_financial_transactions` (`kind = 'income'`) exclusively.
- **`TabExpenses`**: Displays disbursements `event_financial_transactions` (`kind = 'expense'`) exclusively.

### 5.5 UI & Ledger Components

#### Reusable `<EventDomainLedger />`
Props:
- `title`: e.g. "Ticket Sales Ledger", "Revenue Inflows Ledger", "Disbursement Ledger"
- `domain`: `"tickets" | "revenue" | "expenses"`
- `transactions`: Array of transactions for that domain
- `userRole`: Current member's computed role
- `onInspect`: Opens the Voucher Inspection Drawer
- `onApprove`: Officer approval callback
- `onReject`: Officer rejection callback

Features:
- Pagination bar: "Showing 1 – 20 of X transactions", Previous / Next buttons, page number buttons.
- Filter pills: `All`, `Pending Review`, `Approved`, `Rejected`.
- Search bar: Matches Reference, Description, and Counterparty.
- Columns:
  1. `Ref & Date`: `#REF` badge (hover shows full UUID) + WAT Date.
  2. `Description & Counterparty`: Primary description + Counterparty.
  3. `Category`: Category badge.
  4. `Amount (NGN)`: Formatted in Naira (+ for revenue/tickets, - for expenses, strikethrough if rejected).
  5. `Receipt Voucher`: Clickable voucher badge (`PDF`, `JPG`, or `None`).
  6. `Status`: Badge (`Recorded (Pending)`, `Approved`, `Rejected`).
  7. `Actions`:
     - All members: "Inspect" button.
     - Officers only: Quick "Approve" and "Reject" buttons for `recorded` items.

#### Officer Voucher Inspection Drawer
- Triggered by clicking "Inspect" or the receipt badge.
- Split-screen presentation:
  - Left: Transaction metadata, claimed amount, submitter info, and submission timestamp.
  - Right: Receipt voucher document preview from Cloudflare R2 (PDF or image) with SHA-256 hash and file size.
- Decision footer: "Approve Record" vs "Reject / Reverse". Clicking "Reject" displays the required reason textarea before submission.

### 5.6 Consolidated Master Breakdown Matrix Cards (UI Modernization)
To prevent vertical screen bloat and ensure the newly introduced 20-row paginated transaction ledgers remain visible above the fold, all standalone category/tier cards across domain tabs are consolidated into **one cohesive card per tab**:

1. **`TabTickets` (Admission Tiers & Inventory Matrix)**:
   - **Header Strip**: Displays Gross Ticketing Inflow, Total Passes Issued (`sold / capacity`), `+ Add Ticket Tier` button (authorized managers), and the **single primary `Record Ticket Sale` button for all tiers** (opens the modal with tier dropdown).
   - **Proportional Capacity Mix Bar**: Multi-segment visual bar representing total seats distributed across tiers.
   - **Tier Rows (Table Matrix)**: Columns for Tier Name & Description, Unit Price, Passes Issued & Quota (`sold / capacity` with mini progress bar and status badge), and Gross Inflow.
   - **Per-Tier Actions**: Strictly administrative **`Edit`** and **`Retire`** buttons (no redundant per-tier Record Sale buttons).
2. **`TabExpenses` (Operational Cost Centers & Budget Matrix)**:
   - **Header Strip**: Disbursed Outflows, Committed POs, Unallocated Buffer, and the **single primary `+ Record Disbursement` button for all cost centers** (opens modal with cost center dropdown).
   - **Cost Center Rows**: Cost Center Name & Icon, Authorized Budget Ceiling, Disbursed Spend, Committed POs, Stacked Utilization Bar, and Available Buffer badge (no redundant per-row record buttons).
3. **`TabRevenue` (Revenue Streams & Inflow Matrix)**:
   - **Header Strip**: Gross Reconciled, Pending Receivables, Categories button (if authorized), and the **single primary `+ Record Revenue` button for all revenue channels** (opens modal with revenue stream dropdown).
   - **Stream Rows**: Channel Name & Icon, Target Projection, Reconciled Inflow, Pending Receivables, Fulfillment %, and Target Status Badge (no redundant per-row record buttons).
4. **`TabBudgetAllocations` (Capital Allocation & Burn Rate Matrix)**:
   - Combines previous top summary tiles and comparative horizontal bars into a single unified matrix showing Allocation Ceiling, Disbursed Spend, Committed POs, Burn Rate %, and Budget Health badges.

---

## 6. Database Migration & Security

### Schema Changes
1. Alter `public.event_financial_transactions`:
   - Add `verification_status text not null default 'approved'`.
   - Add constraint `check (verification_status in ('recorded', 'approved', 'rejected'))`.
   - Add `verified_by uuid references public.member_profiles (id)`.
   - Add `verified_at timestamptz`.
   - Add `rejection_reason text`.
   - Update `record_event_financial_transaction` RPC to set new entries to `verification_status = 'recorded'`.
   - Fix historical check: Remove `or p_category_id is not null` check for income so revenue stream categories work seamlessly.
2. Alter `public.event_ticket_sales`:
   - Add `verification_status text not null default 'approved'`.
   - Add constraint `check (verification_status in ('recorded', 'approved', 'rejected'))`.
   - Add `verified_by uuid references public.member_profiles (id)`.
   - Add `verified_at timestamptz`.
   - Add `rejection_reason text`.
   - Update `record_event_ticket_sale` RPC to set new sales to `verification_status = 'recorded'`.
3. New RPCs:
   - `public.verify_event_financial_transaction(p_transaction_id uuid, p_decision text, p_reason text)`
     - Verifies actor has `executive`, `admin`, or `backup_admin` role.
     - Enforces segregation of duties: If actor is `executive` and `created_by = auth.uid()`, raises exception `42501`. Admins and backup admins are exempt.
     - Verifies event is not archived (`archived_at IS NULL`).
     - Validates `p_decision in ('approved', 'rejected')`. If `rejected`, `p_reason` is required.
     - If `rejected`, populates `voided_at`, `voided_by`, and `void_reason`.
     - Appends immutable entry to `public.audit_log`.
   - `public.verify_event_ticket_sale(p_sale_id uuid, p_decision text, p_reason text)`
     - Same checks and segregation of duties for ticket sales. If `rejected`, populates `refunded_at` and `refund_reason` (automatically restoring tier capacity).

---

## 7. What's Left to the Builder
- Implementing `<EventDomainLedger />` and embedding it into `tab-tickets.tsx`, `tab-revenue.tsx`, and `tab-expenses.tsx`.
- Connecting the server actions `verifyEventFinancialTransactionAction` and `verifyEventTicketSaleAction`.
- Wiring the split-view voucher drawer with responsive mobile fallback.
- Unit and regression test suite covering pagination slicing, balance exclusions for rejected items, and officer authorization checks.
