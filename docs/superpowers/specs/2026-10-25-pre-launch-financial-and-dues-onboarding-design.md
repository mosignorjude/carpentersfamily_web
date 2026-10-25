# Design: Pre-Launch Financial Records, Opening Balance, and Club Bank Details Onboarding

- **Date**: 2026-10-25
- **Status**: Ready for Approval
- **Author**: Antigravity Pair Programming

---

## 1. Intent and Why

The Carpenters Family Social Club portal is going live in October 2026. Prior to launch, the club operated manually through phone records and physical meetings:
1. Active members have already paid membership dues for past months dating back to February 2026 (stored in Secretariat phone notes).
2. The club treasury holds an existing bank account balance as of launch date that already reflects all pre-launch dues collected and past operational expenses.
3. Club bank payment details (Bank Name, Account Number, Account Name, Transfer Notes) are currently hardcoded placeholders in the member payment modal, requiring a secure administrative management interface for Club Administrators and Backup Administrators.

Without this onboarding design:
- Members would falsely appear in severe dues arrears (8 months overdue).
- The treasury dashboard would show an artificial ₦0 starting balance.
- If both the bank balance and past dues were entered as cash additions, treasury funds would be double-counted.
- Officers would lack an in-app tool to update bank payment details without code redeployments.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Configurable Bank Details**: Allow Admin and Backup Admin to set and update the club bank account details (Bank Name, Account Number, Account Name, Instructions) with full audit logging, dynamically rendered in `PayDuesModal`.
- **Verified Opening Balance**: Allow Admin and Backup Admin to enter the single verified bank balance as of launch date, establishing the ground truth for total club funds.
- **Granular Dues Reconciliation Backfill**: Provide an interactive reconciliation tool in Admin Dues with individual month toggles per active member (February through September 2026) so partial payment histories and members who have not paid up to date are accurately recorded without requiring bank transfer receipts.
- **Double-Counting Prevention**: Ensure that backfilled pre-launch dues clear member obligations without inflating the cash balance above the verified opening bank balance.
- **Accurate Schedule Boundary**: Anchor the club dues obligation schedule to start in February 2026 so members are never billed for January 2026.

### Non-Goals
- Importing itemized pre-launch expense receipts (the club agreed on a single verified opening bank balance).
- Automated NLP parsing of raw phone notes (interactive checkbox roster ensures 100% human verification).
- Changing the approved statutory dues rate (₦5,000/month for 2026).

### Anti-Goals
- Artificial cash inflation (double-counting dues inside the opening bank balance).
- Unaudited database insertions.
- Permitting non-admin roles to alter bank instructions or opening balances.

---

## 3. Key Decisions & Accounting Integrity

### 3.1 Cash Balance Reconciliation & Double-Counting Guard
- **User Confirmation**: The user confirmed that the current bank account balance *already includes* all dues collected between February and September 2026.
- **Accounting Architecture**:
  - The opening bank balance is recorded in `club_financial_transactions` as the baseline cash reserve.
  - Historical dues backfills are recorded in `public.dues_payments` with `payment_method = 'pre_launch_reconciliation'`.
  - In `private.club_finance_summary()`, the net treasury cash balance is computed as:
    $$\text{balance} = \text{opening\_balance} + \text{live\_dues\_income} + \text{live\_other\_income} - \text{expenses} + \text{event\_ledger\_entries}$$
    where `live_dues_income` includes payments from October 1, 2026 onwards (`payment_method <> 'pre_launch_reconciliation'`).
  - Total cumulative dues collected (for annual reporting) includes both pre-launch reconciliation and live dues.
  - Result: Cash in bank matches the bank statement to the exact kobo, while member profiles reflect full clearance.

### 3.2 January 2026 Dues Commencement
- Club dues operations officially commenced in February 2026.
- The dues rate in `public.dues_rates` (or membership period starts) will be aligned to `2026-02-01` so that January 2026 is not generated as an unpaid obligation.

### 3.3 Database Check Constraint Compliance
- The opening balance transaction conforms strictly to `club_financial_transactions_fields_check`:
  - `kind`: `'income'`
  - `amount_ngn`: User-specified verified opening balance
  - `transaction_date`: `'2026-10-01'`
  - `payer_payee`: `'Club Treasury Opening Reserve'`
  - `source_note`: `'Verified pre-launch opening treasury balance as of October 2026'`
  - `category_id`, `category_name_snapshot`, and `description`: `null` (complying with database rules without breaking schema migrations).

---

## 4. Technical Architecture

### 4.1 Club Bank Payment Settings

#### Schema
```sql
create table if not exists public.club_payment_settings (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  instructions text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint club_payment_settings_account_number_check check (account_number ~ '^[0-9]{10}$')
);
```
- **RLS**:
  - `select`: Granted to all active authenticated club members.
  - `insert / update`: Restricted to `admin` and `backup_admin`.
- **Audit**: Writes `club_payment_settings_updated` to `audit_log`.
- **UI**:
  - Admin settings card under `/admin/members` (or Admin Finances tab) with "Edit Account Details" modal.
  - `PayDuesModal` dynamically fetches these details and enables one-click clipboard copying.

### 4.2 Opening Treasury Balance

- An administrative action in `/finances` (visible only to `admin` and `backup_admin` when no opening balance transaction exists yet).
- Form inputs: Amount (₦), Verification Date, and Audit Justification Note.
- Inserts via `record_club_financial_transaction` RPC and emits `audit_log` entry `club_opening_balance_recorded`.

### 4.3 Historical Dues Backfill Workspace

#### Granular Monthly Control
Because members have varying payment histories (some paid up to September, others only paid through March or have intermittent months), the reconciliation workspace provides **full individual month-level granularity per member**.

#### Stored Procedure
```sql
create or replace function private.backfill_member_historical_dues(
  p_member_id uuid,
  p_covered_months date[],
  p_notes text
)
returns void;
```
- **Validation**:
  - Caller must have role `admin` or `backup_admin`.
  - Target member must be an active club member (and not primary Admin).
  - All `p_covered_months` must fall between `2026-02-01` and `2026-09-01`.
  - Months cannot be already resolved in `dues_month_dispositions`.
- **Insertion**:
  - Atomic insert into `dues_payments` with `payment_method = 'pre_launch_reconciliation'`.
  - Atomic insert into `dues_month_dispositions` with `is_current = true`.
  - Emits `audit_log` entry `historical_dues_backfilled`.

#### Admin UI (`/dues` Officer Area)
- A dedicated "Pre-Launch Dues Reconciliation" workspace for Admin and Backup Admin.
- **Roster Grid Layout**:
  - Lists every active club member.
  - Across from each member is a strip of 8 individual interactive month toggles: `[Feb] [Mar] [Apr] [May] [Jun] [Jul] [Aug] [Sep]`.
  - Clicking any month toggle switches that specific month between Unpaid (neutral) and Paid (green).
  - Quick-action helper per row: `"Clear Through Month..."` dropdown or `"All 8 Months"` for fast entry on members who are fully paid.
  - Real-time indicator showing the calculated total (e.g. `4 months cleared · ₦20,000`).
  - Batch or per-member "Save Member Reconciliation" button with confirmation and instant audit log recording.

---

## 5. What's Left to the Builder

- Exact component structuring in `src/components/admin/` and `src/components/dues/`.
- Sequential SQL migration numbering and idempotent execution.
- Integration test suite covering:
  - Bank details update RLS and member visibility.
  - Double-counting prevention in `club_finance_summary`.
  - Backfill validation rejecting post-launch months or duplicate submissions.
