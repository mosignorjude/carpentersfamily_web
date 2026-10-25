# Pre-Launch Financial Records, Opening Balance, and Club Bank Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Admin and Backup Admin to configure official club bank account details, record a verified opening treasury cash balance as of October 1, 2026 without double-counting past dues, and reconcile historical member dues (February–September 2026) with individual month toggles per active member.

**Architecture:** Database-backed singleton configuration (`club_payment_settings`) for bank payment details with member read access and admin-only mutation; standard-conforming income transaction for opening balance with double-counting guard in `private.club_finance_summary()`; and a specialized stored procedure + admin reconciliation table supporting granular month selection per active member.

**Tech Stack:** Next.js 16 (App Router, Server Actions), PostgreSQL / Supabase RLS, TypeScript, Tailwind CSS v4, Node.js Test Runner (`node --test`).

**Spec:** [`docs/superpowers/specs/2026-10-25-pre-launch-financial-and-dues-onboarding-design.md`](file:///c:/Users/HomePC/Documents/codex/Carpentersfamily/docs/superpowers/specs/2026-10-25-pre-launch-financial-and-dues-onboarding-design.md)

## Global Constraints

- **Timezone**: All covered month dates and transaction timestamps are anchored in West Africa Time (WAT / UTC+1).
- **Rate Floor**: Historical dues reconcile strictly at the approved statutory rate of ₦5,000 per month.
- **Account Number Check**: NUBAN account numbers must be exactly 10 digits (`^[0-9]{10}$`).
- **Authorization**: Only members holding `admin` or `backup_admin` roles may update payment settings, record the opening balance, or backfill dues.
- **Audit Logging**: Every administrative action must insert an immutable record into `public.audit_log`.

## Review Focus

1. **Double-counting prevention**: Backfilled dues (`payment_method = 'pre_launch_reconciliation'`) must not inflate the cash balance above the verified opening bank balance in `club_finance_summary()`.
2. **Month boundary validation**: Dues backfill must reject January 2026 or post-launch months (`>= 2026-10-01`), allowing only valid months between `2026-02-01` and `2026-09-01`.
3. **Idempotent backfill**: Submitting a month that already has a finalized disposition record for that member must fail gracefully without partial state corruption.
4. **NUBAN validation**: Bank account numbers with fewer or more than 10 digits, or containing non-numeric characters, must be rejected before database insertion.
5. **Dynamic payment modal fallback**: If club payment settings have not yet been configured in the database, `PayDuesModal` must display a clean verification-in-progress message rather than crashing or showing stale dummy values.

---

### Task 1: Core Reconciliation Validation Helpers

**Files:**
- Create: `src/lib/pre-launch-reconciliation.mjs`
- Test: `tests/pre-launch-reconciliation.test.mjs`

**Interfaces:**
- Produces:
  - `validateNubanAccountNumber(accountNumber: string): { valid: boolean; error?: string }`
  - `validateClubPaymentSettingsInput(input: { bankName: string; accountNumber: string; accountName: string; instructions?: string }): { valid: boolean; error?: string }`
  - `validateBackfillMonths(months: string[]): { valid: boolean; normalizedMonths: string[]; error?: string }`
  - `calculateBackfillAmount(monthCount: number): number`
  - `VALID_PRE_LAUNCH_MONTHS: readonly string[]` (`['2026-02-01', ..., '2026-09-01']`)

- [ ] **Step 1: Write the failing unit tests for reconciliation helpers**

Create `tests/pre-launch-reconciliation.test.mjs`:
- Test NUBAN validation accepts 10-digit strings (`"0123456789"`) and rejects non-10-digit or non-numeric (`"123"`, `"012345678a"`, `""`).
- Test payment settings input validation checks non-empty bank name, valid NUBAN, and non-empty account name.
- Test `validateBackfillMonths` accepts subsets of Feb–Sep 2026, rejects January 2026 (`"2026-01-01"`), rejects October 2026 (`"2026-10-01"`), and rejects duplicates.
- Test `calculateBackfillAmount` returns `monthCount * 5000`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pre-launch-reconciliation.test.mjs`
Expected: FAIL (Cannot find module `src/lib/pre-launch-reconciliation.mjs`)

- [ ] **Step 3: Implement `src/lib/pre-launch-reconciliation.mjs`**

Implement the pure validation functions adhering to the global constraints.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pre-launch-reconciliation.test.mjs`
Expected: PASS (All test assertions pass)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pre-launch-reconciliation.mjs tests/pre-launch-reconciliation.test.mjs
git commit -m "feat(dues): add pre-launch reconciliation and bank validation helpers"
```

---

### Task 2: Database Migration for Payment Settings, Opening Balance Accounting, and Backfill RPC

**Files:**
- Create: `supabase/migrations/20261025140000_pre_launch_financial_onboarding.sql`
- Test: `supabase/tests/database/pre_launch_financial_onboarding_test.sql`

**Interfaces:**
- Consumes: `public.audit_log`, `public.dues_payments`, `public.dues_month_dispositions`, `public.club_financial_transactions`
- Produces:
  - Table: `public.club_payment_settings`
  - Stored Procedure: `private.backfill_member_historical_dues(p_member_id uuid, p_covered_months date[], p_notes text)`
  - Public Wrapper: `public.backfill_member_historical_dues`
  - Updated Function: `private.club_finance_summary()`

- [ ] **Step 1: Write the SQL test verifying RLS, double-counting guard, and backfill constraints**

Create `supabase/tests/database/pre_launch_financial_onboarding_test.sql`:
- Verify `club_payment_settings` accepts valid 10-digit account numbers and rejects invalid numbers via check constraint.
- Verify active members can SELECT `club_payment_settings` but cannot UPDATE/INSERT unless holding `admin` or `backup_admin`.
- Verify `backfill_member_historical_dues` succeeds for valid pre-launch months (`2026-02-01` to `2026-09-01`) and rejects January (`2026-01-01`).
- Verify `private.club_finance_summary()` does NOT double-count dues payments flagged with `payment_method = 'pre_launch_reconciliation'` in the treasury `balance` calculation.

- [ ] **Step 2: Run test against local Supabase instance to verify failure**

Run: `npx supabase test db --test-file supabase/tests/database/pre_launch_financial_onboarding_test.sql`
Expected: FAIL (relation `club_payment_settings` does not exist)

- [ ] **Step 3: Implement migration `20261025140000_pre_launch_financial_onboarding.sql`**

Write the migration:
1. Create `public.club_payment_settings` table with RLS, check constraint `account_number ~ '^[0-9]{10}$'`, and trigger writing to `public.audit_log`.
2. Seed initial singleton row if empty (or leave empty for first admin configuration).
3. Anchor initial dues schedule to `2026-02-01` in `public.dues_rates` where `effective_month = '2026-01-01'` to prevent January arrears.
4. Implement `private.backfill_member_historical_dues` with caller permission checks (`admin` or `backup_admin`), boundary checks (`2026-02-01` to `2026-09-01`), atomic inserts into `dues_payments` (`payment_method = 'pre_launch_reconciliation'`) and `dues_month_dispositions`, and audit log emission.
5. Update `private.club_finance_summary()` to compute `balance = dues_income (excluding pre_launch_reconciliation) + other_income - expenses + event_ledger_entries`.

- [ ] **Step 4: Run database tests to verify passes**

Run: `npx supabase test db --test-file supabase/tests/database/pre_launch_financial_onboarding_test.sql`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261025140000_pre_launch_financial_onboarding.sql supabase/tests/database/pre_launch_financial_onboarding_test.sql
git commit -m "feat(db): add club payment settings, backfill rpc, and balance double-counting guard"
```

---

### Task 3: Server Actions for Bank Details, Opening Balance, and Dues Backfill

**Files:**
- Modify: `src/app/actions.ts`
- Test: `tests/pre-launch-financial-actions.test.mjs`

**Interfaces:**
- Consumes: `src/lib/pre-launch-reconciliation.mjs`
- Produces:
  - `updateClubPaymentSettingsAction(formData: FormData): Promise<void>`
  - `recordOpeningBalanceAction(formData: FormData): Promise<void>`
  - `backfillMemberHistoricalDuesAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Write the failing unit tests for server actions input parsing and authorization checks**

Create `tests/pre-launch-financial-actions.test.mjs`:
- Test `updateClubPaymentSettingsAction` rejects non-10 digit accounts and unauthorized callers.
- Test `recordOpeningBalanceAction` validates positive Naira amount and valid date.
- Test `backfillMemberHistoricalDuesAction` validates member ID and covered months array.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/pre-launch-financial-actions.test.mjs`
Expected: FAIL (Actions not exported from `src/app/actions.ts`)

- [ ] **Step 3: Implement server actions in `src/app/actions.ts`**

Add:
- `updateClubPaymentSettingsAction`: extracts `bank_name`, `account_number`, `account_name`, `instructions`, validates via `src/lib/pre-launch-reconciliation.mjs`, executes update in `club_payment_settings`, and revalidates paths (`/dues`, `/finances`, `/admin/members`).
- `recordOpeningBalanceAction`: extracts `amount_ngn`, `transaction_date`, `source_note`, validates officer role, calls `record_club_financial_transaction`, and revalidates `/finances`.
- `backfillMemberHistoricalDuesAction`: extracts `member_id`, `covered_months` (via `formData.getAll('covered_months')`), validates via `validateBackfillMonths`, calls `backfill_member_historical_dues`, and revalidates `/dues`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pre-launch-financial-actions.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts tests/pre-launch-financial-actions.test.mjs
git commit -m "feat(actions): add server actions for payment settings, opening balance, and dues backfill"
```

---

### Task 4: Dynamic Bank Details in Member Dues Payment Modal

**Files:**
- Modify: `src/app/(member)/dues/page.tsx:50-120`
- Modify: `src/components/dues/pay-dues-modal.tsx:55-80, 335-385`
- Test: `tests/pay-dues-modal-dynamic-bank.test.mjs`

**Interfaces:**
- Consumes: `club_payment_settings` row from database query
- Produces: `PayDuesModal` accepting optional `paymentSettings?: { bankName: string; accountNumber: string; accountName: string; instructions?: string } | null`

- [ ] **Step 1: Write test verifying modal bank detail rendering and fallback behavior**

Create `tests/pay-dues-modal-dynamic-bank.test.mjs`:
- Test that `PayDuesModal` displays the passed `bankName`, `accountNumber`, and `accountName`.
- Test that when `paymentSettings` is null/undefined, it renders a friendly placeholder "Club bank details verification pending" and disables copy button.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/pay-dues-modal-dynamic-bank.test.mjs`
Expected: FAIL

- [ ] **Step 3: Update `src/app/(member)/dues/page.tsx` and `src/components/dues/pay-dues-modal.tsx`**

- In `src/app/(member)/dues/page.tsx`, query `public.club_payment_settings` and pass `paymentSettings` to view components.
- In `src/components/dues/pay-dues-modal.tsx`:
  - Remove hardcoded `"1234567890"` and `"Nigerian Bank"` constants.
  - Read `bankName`, `accountNumber`, and `accountName` from props.
  - Bind `handleCopy` to the dynamic `accountNumber`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pay-dues-modal-dynamic-bank.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/(member)/dues/page.tsx src/components/dues/pay-dues-modal.tsx tests/pay-dues-modal-dynamic-bank.test.mjs
git commit -m "feat(dues): dynamically render configured club bank details in PayDuesModal"
```

---

### Task 5: Admin Bank Details Card and Opening Balance Entry Component

**Files:**
- Create: `src/components/admin/club-bank-settings-card.tsx`
- Create: `src/components/finances/opening-balance-entry-card.tsx`
- Modify: `src/app/(member)/finances/page.tsx`
- Modify: `src/components/finances/finances-page-view.tsx`
- Test: `tests/admin-financial-settings-components.test.mjs`

**Interfaces:**
- Consumes: `updateClubPaymentSettingsAction`, `recordOpeningBalanceAction`
- Produces:
  - `<ClubBankSettingsCard paymentSettings={settings} isOfficer={isOfficer} />`
  - `<OpeningBalanceEntryCard existingOpeningBalance={hasOpeningBalance} canRecord={canRecord} />`

- [ ] **Step 1: Write test verifying component states and permission guards**

Create `tests/admin-financial-settings-components.test.mjs`:
- Test `ClubBankSettingsCard` displays editable inputs only for Admin / Backup Admin.
- Test `OpeningBalanceEntryCard` shows entry form when no opening balance is recorded, and status badge when already recorded.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/admin-financial-settings-components.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `ClubBankSettingsCard` and `OpeningBalanceEntryCard`**

- `ClubBankSettingsCard`: Form with inputs for Bank Name, 10-digit Account Number, Account Name, and Instructions, connecting to `updateClubPaymentSettingsAction`.
- `OpeningBalanceEntryCard`: Form with inputs for Verified Amount (₦), Date, and Source Note, connecting to `recordOpeningBalanceAction`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/admin-financial-settings-components.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/club-bank-settings-card.tsx src/components/finances/opening-balance-entry-card.tsx src/app/(member)/finances/page.tsx src/components/finances/finances-page-view.tsx tests/admin-financial-settings-components.test.mjs
git commit -m "feat(finances): add admin bank settings card and opening balance entry card"
```

---

### Task 6: Pre-Launch Dues Reconciliation Workspace UI with Individual Month Toggles

**Files:**
- Create: `src/components/dues/pre-launch-dues-reconciliation-card.tsx`
- Modify: `src/app/(member)/dues/page.tsx`
- Modify: `src/components/dues/dues-page-view.tsx`
- Test: `tests/pre-launch-dues-reconciliation-ui.test.mjs`

**Interfaces:**
- Consumes: `backfillMemberHistoricalDuesAction`, list of active members with their current month dispositions
- Produces: `<PreLaunchDuesReconciliationCard members={activeMembers} isOfficer={isOfficer} />`

- [ ] **Step 1: Write test verifying interactive month toggle state and payload construction**

Create `tests/pre-launch-dues-reconciliation-ui.test.mjs`:
- Test that each member row renders 8 distinct month toggle badges (`Feb, Mar, Apr, May, Jun, Jul, Aug, Sep`).
- Test that toggling individual months accurately updates the selected months list and the calculated amount.
- Test helper shortcuts ("All 8 Months", "Clear Selection").

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/pre-launch-dues-reconciliation-ui.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `PreLaunchDuesReconciliationCard`**

Build the client component:
- Render active members table with member name and avatar.
- Display a flex strip of 8 interactive month toggle badges for Feb–Sep 2026.
- Each toggle displays green with checkmark when selected, neutral warm canvas when unselected.
- Provide helper buttons per row: `"All 8 Months"`, `"Reset"`.
- Displays real-time tally: `X months · ₦(X * 5,000)`.
- Connects to `backfillMemberHistoricalDuesAction` via Form submission with hidden fields `member_id` and multiple `covered_months` values.

- [ ] **Step 4: Integrate into `/dues` for Admin and Backup Admin**

Add the card to `src/components/dues/dues-page-view.tsx` in a collapsible officer governance section.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/pre-launch-dues-reconciliation-ui.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dues/pre-launch-dues-reconciliation-card.tsx src/app/(member)/dues/page.tsx src/components/dues/dues-page-view.tsx tests/pre-launch-dues-reconciliation-ui.test.mjs
git commit -m "feat(dues): add pre-launch dues reconciliation workspace with individual month toggles"
```

---

### Task 7: Full System Verification, Biome Linting, and Production Build

**Files:**
- Test: All test suites in `tests/`
- Check: Biome linter across `src` and `next.config.ts`
- Build: Next.js production build (`next build`)

- [ ] **Step 1: Run all test suites**

Run: `npm run test:dashboard; npm run test:events-ui; npm run test:attendance-ui; npm run test:navigation; node --test tests/pre-launch-reconciliation.test.mjs tests/pre-launch-financial-actions.test.mjs tests/pay-dues-modal-dynamic-bank.test.mjs tests/admin-financial-settings-components.test.mjs tests/pre-launch-dues-reconciliation-ui.test.mjs`
Expected: All tests PASS with 0 failures.

- [ ] **Step 2: Run Biome check and format**

Run: `npm run lint`
Expected: Checked all files with 0 errors.

- [ ] **Step 3: Run production Next.js build**

Run: `npm run build`
Expected: Compiled successfully with 0 TypeScript or bundling errors.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: verify full pre-launch onboarding suite, linting, and production build"
```
