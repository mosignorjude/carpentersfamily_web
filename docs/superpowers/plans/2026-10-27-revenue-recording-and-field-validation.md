# Event Revenue Recording & Required Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the PostgreSQL exception preventing event revenue transactions from being recorded, and implement red info icon field-level validation feedback ("Please enter [field name]") across auth and application forms.

**Architecture:**
1. **Event Revenue Recording Database Fix:** Deploy a Supabase database migration that replaces `public.record_event_financial_transaction` to permit `p_category_id` when `p_kind = 'income'`, eliminating the copy-paste constraint that raised exception `23514` on revenue entries.
2. **Authentication Forms Validation Upgrade:** Enhance `getErrorMessage(field)` and `AuthValidatedForm` in `src/components/auth-validated-form.tsx` to dynamically inspect field labels/names/placeholders and generate field-specific error messages ("Please enter email address", "Please enter password", etc.) paired with the red warning icon.
3. **In-App & Modal Forms Field-Level Validation:** Wire `<FormFieldError>` (with `AlertCircle` red icon and `#BA3C2A` text) directly under each required input in `RecordTransactionModal`, `ClubIncomeForm`, `ClubExpenseForm`, `EventBudgetCeilingModal`, `EventTicketTierModal`, and `EventCategoryManagementModal`, blocking submission and highlighting empty fields with "Please enter [field name]".

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, PostgreSQL (Supabase RPCs, PL/pgSQL), Tailwind CSS v4, Lucide React icons, Node.js test runner (`node:test`).

**Spec:** User prompt received on 2026-10-27:
- "Recording revenue transaction fails."
- "Also submiting without filling the rquired fields or forms should show red info icon and text telling you to enter the [field name] For example signing in without email address should say 'please enter email address' or recording a transaction without amount would say 'Please enter amount'"

---

## Global Constraints

- Never break existing database RPC signatures or table foreign key constraints.
- Maintain whole Naira formatting (`formatNaira`) and zero Biome lint diagnostics.
- Ensure 100% test pass rate across all test suites (`npm test`).
- Ensure Next.js production build (`npm run build`) passes cleanly across all 21 routes.
- Every inline field error must feature the red icon (`AlertCircle` in `#BA3C2A`), high-contrast accessible text (`role="alert"`), and highlight the offending input border.

---

## Review Focus

1. **Event Revenue Submission with Category:** Must successfully insert into `event_financial_transactions` with `category_id` and snapshot without triggering PostgreSQL code `23514`.
2. **Sign In Form with Empty Email / Password:** Must display red warning icon and `"Please enter email address"` or `"Please enter password"` directly beneath the field without reloading or triggering browser default popup.
3. **Transaction Recording Modal with Empty Amount / Description / Payer:** Must display red info icon and `"Please enter amount"`, `"Please enter description"`, etc., directly below each respective field instead of relying solely on top banner.
4. **Club Finance Income / Expense Forms with Empty Required Inputs:** Must highlight empty fields with inline red info icon and `"Please enter [field name]"` before submission.
5. **Form Error Cleanup on Input:** Typing into an invalid field must immediately dismiss that field's inline red error.

---

## File Structure

### Files to Create
- `supabase/migrations/20261027233000_allow_event_revenue_category.sql`: Migration updating `record_event_financial_transaction` to allow revenue categories.
- `tests/event-revenue-recording.test.mjs`: Test verifying `record_event_financial_transaction` and server action accept revenue categories.
- `tests/required-field-validation.test.mjs`: Test verifying field-specific error messages and red icon markup across auth and modal forms.

### Files to Modify
- `src/app/actions.ts`: Ensure `recordEventFinancialTransactionAction` passes valid category parameters and aligns with the RPC.
- `src/components/auth-validated-form.tsx`: Enhance `getErrorMessage(field)` to detect field names/labels and produce "Please enter [field name]".
- `src/components/events/dashboard/modals/record-transaction-modal.tsx`: Add field-level validation state and render `<FormFieldError>` below amount, description, payer/payee, etc.
- `src/app/(member)/finances/finance-forms.tsx`: Add client-side validation and `<FormFieldError>` for club income and expense forms.
- `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`: Add client-side validation and `<FormFieldError>` for budget amount and revision reason.
- `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`: Add client-side validation and `<FormFieldError>` for tier name, price, capacity, and revision reason.
- `src/components/events/dashboard/modals/event-category-management-modal.tsx`: Add client-side validation and `<FormFieldError>` for category name and revision reason.

---

### Task 1: Fix `record_event_financial_transaction` to Permit Revenue Categories in Database

**Files:**
- Create: `supabase/migrations/20261027233000_allow_event_revenue_category.sql`
- Create: `tests/event-revenue-recording.test.mjs`

**Interfaces:**
- Consumes: `p_kind = 'income'`, `p_category_id` (UUID of a category where `category_type = 'revenue'`)
- Produces: Successful insert into `event_financial_transactions` linking `category_id` and snapshotting `category_name`.

- [x] **Step 1: Write test asserting `record_event_financial_transaction` allows revenue categories**

Create `tests/event-revenue-recording.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20261027233000_allow_event_revenue_category.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("record_event_financial_transaction revenue category support", () => {
  it("does not forbid p_category_id when p_kind is income", () => {
    assert.doesNotMatch(
      migrationSource,
      /p_kind\s*=\s*'income'[^;]*p_category_id\s+is\s+not\s+null|or\s+p_category_id\s+is\s+not\s+null[^;]*p_kind\s*=\s*'income'/,
      "Migration must not forbid p_category_id on income/revenue",
    );
  });

  it("verifies p_category_id belongs to a revenue category when provided for income", () => {
    assert.match(
      migrationSource,
      /category_type\s*=\s*'revenue'/,
      "Migration must validate category_type is revenue for income transactions",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-revenue-recording.test.mjs`
Expected: FAIL (migration file does not exist yet).

- [x] **Step 3: Create the migration file and apply it**

Create `supabase/migrations/20261027233000_allow_event_revenue_category.sql` updating `record_event_financial_transaction`:
```sql
-- Recreate record_event_financial_transaction to permit revenue categories on income transactions
create or replace function public.record_event_financial_transaction(
  p_event_id uuid,
  p_kind text,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_payer_payee text,
  p_source_note text,
  p_payment_method text,
  p_idempotency_key uuid,
  p_category_id uuid default null,
  p_budget_allocation_category_id uuid default null,
  p_payment_status text default 'paid',
  p_transaction_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns table (
  transaction_id uuid,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_tx_id uuid := coalesce(p_transaction_id, gen_random_uuid());
  v_existing public.event_financial_transactions%rowtype;
  v_expected_key text;
  v_category_name text;
  v_alloc_name text;
  v_status text := coalesce(p_payment_status, 'paid');
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_event_id is null or p_kind is null or p_kind not in ('income', 'expense')
     or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000
     or p_transaction_date is null or p_transaction_date < '1900-01-01'::date
     or p_transaction_date > v_today or p_idempotency_key is null
     or (p_payment_method is not null and p_payment_method not in ('bank_transfer', 'cash'))
     or v_status not in ('paid', 'pending', 'deposit', 'unpaid')
     or (p_kind = 'expense' and v_status not in ('paid', 'pending', 'deposit', 'unpaid'))
     or (p_kind = 'income' and v_status not in ('paid', 'pending', 'unpaid')) then
    raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may record financial transactions.';
  end if;

  -- Replay check
  select t.* into v_existing
  from public.event_financial_transactions as t
  where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.event_id = p_event_id
       and v_existing.kind = p_kind
       and v_existing.amount_ngn = p_amount_ngn
       and v_existing.transaction_date = p_transaction_date
       and v_existing.description is not distinct from p_description
       and v_existing.payer_payee is not distinct from p_payer_payee
       and v_existing.source_note is not distinct from p_source_note
       and v_existing.payment_method is not distinct from p_payment_method
       and v_existing.category_id is not distinct from p_category_id
       and v_existing.budget_allocation_category_id is not distinct from p_budget_allocation_category_id
       and v_existing.payment_status = v_status then
      return query select v_existing.id, true;
      return;
    else
      raise exception using errcode = '23505', message = 'This submission key was already used for different event financial data.';
    end if;
  end if;

  if p_kind = 'expense' then
    if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
        or p_description <> pg_catalog.btrim(p_description) or p_description ~ '[[:cntrl:]]'
        or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
        or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_payer_payee ~ '[[:cntrl:]]'
        or p_source_note is not null then
      raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
    end if;
  else
    -- Income (Revenue): p_description is forbidden, p_budget_allocation_category_id is forbidden, source_note is required
    if p_description is not null
        or p_budget_allocation_category_id is not null
        or (p_payer_payee is not null and (
          pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
          or p_payer_payee <> pg_catalog.btrim(p_payer_payee)
          or p_payer_payee ~ '[[:cntrl:]]'))
        or p_source_note is null
        or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
        or p_source_note <> pg_catalog.btrim(p_source_note)
        or p_source_note ~ '[[:cntrl:]]' then
      raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
    end if;
  end if;

  -- Receipt requirements: required iff bank_transfer AND paid
  if p_payment_method = 'bank_transfer' and v_status = 'paid' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata is required for paid bank transfers.';
    end if;

    v_expected_key := 'receipts/event/' || v_tx_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata forbidden for cash or non-paid bank transfers.';
    end if;
  end if;

  if p_category_id is not null then
    select name into v_category_name from public.event_finance_categories
    where id = p_category_id and (
      (p_kind = 'income' and category_type = 'revenue')
      or (p_kind = 'expense' and category_type in ('expense', 'budget_allocation'))
    );
    if v_category_name is null then
      raise exception using errcode = '23503', message = 'Selected event finance category is invalid or of incompatible type.';
    end if;
  end if;

  if p_budget_allocation_category_id is not null then
    select name into v_alloc_name from public.event_finance_categories
    where id = p_budget_allocation_category_id and category_type = 'budget_allocation';
    if v_alloc_name is null then
      raise exception using errcode = '23503', message = 'Selected budget allocation category is invalid.';
    end if;
  end if;

  insert into public.event_financial_transactions (
    id, event_id, kind, amount_ngn, transaction_date, description,
    payer_payee, source_note, payment_method, category_id,
    category_name_snapshot, budget_allocation_category_id,
    budget_allocation_name_snapshot, payment_status, created_by,
    updated_by, idempotency_key
  ) values (
    v_tx_id, p_event_id, p_kind, p_amount_ngn, p_transaction_date, p_description,
    p_payer_payee, p_source_note, p_payment_method, p_category_id,
    v_category_name, p_budget_allocation_category_id,
    v_alloc_name, v_status, v_actor_id,
    v_actor_id, p_idempotency_key
  );

  if p_payment_method = 'bank_transfer' and v_status = 'paid' then
    insert into public.finance_receipts (
      id, scope, event_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event', v_tx_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_recorded', 'event_financial_transaction', v_tx_id, null,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'kind', p_kind, 'amount_ngn', p_amount_ngn,
      'transaction_date', p_transaction_date, 'payment_method', p_payment_method,
      'payment_status', v_status
    ), 'Event transaction recorded'
  );

  return query select v_tx_id, false;
end;
$$;

revoke all on function public.record_event_financial_transaction from public, anon, service_role;
grant execute on function public.record_event_financial_transaction to authenticated;
```

Apply migration to remote Supabase via `call_mcp_tool` (`execute_sql`).

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-revenue-recording.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20261027233000_allow_event_revenue_category.sql tests/event-revenue-recording.test.mjs
git commit -m "fix(db): permit revenue categories on income transactions in record_event_financial_transaction"
```

---

### Task 2: Field-Level Validation with Field Names in Authentication Forms (`auth-validated-form.tsx`)

**Files:**
- Modify: `src/components/auth-validated-form.tsx:28-60`
- Modify: `src/app/page.tsx:123-152`
- Modify: `src/app/signup/page.tsx:106-185`
- Create: `tests/required-field-validation.test.mjs`

**Interfaces:**
- Consumes: User submitting auth form with empty required field
- Produces: Dynamic message `"Please enter [field name]"` (e.g. `"Please enter email address"`, `"Please enter password"`) accompanied by the red error icon and high-contrast alert styling.

- [x] **Step 1: Write failing tests for field-specific error messages in `auth-validated-form.tsx`**

Create `tests/required-field-validation.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const authFormSource = readFileSync(
  new URL("../src/components/auth-validated-form.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../src/app/page.tsx", import.meta.url),
  "utf8",
);

describe("Field-specific required validation", () => {
  it("formats required field error message with the specific field label or name", () => {
    assert.match(
      authFormSource,
      /Please enter|getRequiredErrorMessage/,
      "auth-validated-form must generate 'Please enter [field name]'",
    );
    assert.doesNotMatch(
      authFormSource,
      /return "Please fill in this field\."/,
      "Must not use generic 'Please fill in this field.'",
    );
  });

  it("specifies field names or labels for sign in email and password", () => {
    assert.match(
      pageSource,
      /data-field-name="email address"|data-field-label="Email Address"/,
      "Email field must configure field name for validation feedback",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement field-specific naming in `auth-validated-form.tsx` and auth pages**

1. In `src/components/auth-validated-form.tsx`:
   Add helper function `getFieldLabel(field: NativeFormField): string`:
   ```typescript
   function getFieldLabel(field: NativeFormField): string {
     if (field.dataset.fieldName) return field.dataset.fieldName;
     const label = field.closest("label");
     const spanText = label?.querySelector("span")?.textContent?.trim();
     if (spanText && !spanText.toLowerCase().includes("required")) {
       return spanText.toLowerCase();
     }
     if (field.name === "email") return "email address";
     if (field.name === "password") return "password";
     if (field.name === "confirm_password") return "password confirmation";
     if (field.name === "full_name") return "full name";
     if (field.name === "username") return "username";
     if (field.name === "amount" || field.name === "amount_ngn") return "amount";
     return field.name || "this field";
   }
   ```
   Update `getErrorMessage(field: NativeFormField)`:
   ```typescript
   if (field.required && (!field.value || (!isPassword && !field.value.trim()))) {
     return `Please enter ${getFieldLabel(field)}.`;
   }
   ```
2. In `src/app/page.tsx`:
   Add `data-field-name="email address"` on `#sign-in-email`.
   Add `data-field-name="password"` on `#sign-in-password`.
3. In `src/app/signup/page.tsx`:
   Add `data-field-name="full name"` on `#signup-full-name`.
   Add `data-field-name="username"` on `#signup-username`.
   Add `data-field-name="email address"` on `#signup-email`.
   Add `data-field-name="password"` on `#signup-password`.
   Add `data-field-name="password confirmation"` on `#signup-confirm-password`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/auth-validated-form.tsx src/app/page.tsx src/app/signup/page.tsx tests/required-field-validation.test.mjs
git commit -m "fix(auth): display field-specific validation error messages on required inputs"
```

---

### Task 3: Inline Field-Level Validation with Red Info Icon in `RecordTransactionModal`

**Files:**
- Modify: `src/components/events/dashboard/modals/record-transaction-modal.tsx:210-365, 710-855`
- Modify: `tests/required-field-validation.test.mjs`

**Interfaces:**
- Consumes: Submission attempt in `RecordTransactionModal`
- Produces: Inline `<FormFieldError>` underneath each empty required input (Amount, Description, Payer/Payee, Receipt File) with red `AlertCircle` icon and `"Please enter [field name]"`.

- [x] **Step 1: Write test assertions for inline `<FormFieldError>` in `RecordTransactionModal`**

Add to `tests/required-field-validation.test.mjs`:
```javascript
const recordModalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/record-transaction-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("RecordTransactionModal field-level validation", () => {
  it("renders FormFieldError with AlertCircle under amount, description, and counterparty fields", () => {
    assert.match(
      recordModalSource,
      /FormFieldError/,
      "Must import and render FormFieldError in RecordTransactionModal",
    );
    assert.match(
      recordModalSource,
      /Please enter amount/,
      "Must provide 'Please enter amount' error message",
    );
    assert.match(
      recordModalSource,
      /Please enter transaction description/,
      "Must provide 'Please enter transaction description' error message",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement field-level validation state and `<FormFieldError>` in `RecordTransactionModal`**

1. Import `FormFieldError` from `@/components/ui/form-feedback`.
2. Add field errors state:
   ```typescript
   const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
   ```
   Add helper:
   ```typescript
   const clearFieldError = (field: string) => {
     if (fieldErrors[field]) {
       setFieldErrors((prev) => {
         const next = { ...prev };
         delete next[field];
         return next;
       });
     }
   };
   ```
3. In `handleSubmit`:
   ```typescript
   const errors: Record<string, string> = {};
   if (mode === "ticket") {
     if (!payerPayee.trim()) errors.payerPayee = "Please enter attendee name.";
     if (paymentMethod === "bank_transfer" && !receiptFile) {
       errors.receipt = "Please attach transfer receipt.";
     }
   } else {
     const rawDigits = amount.replace(/\D/g, "");
     const numAmount = Number(rawDigits);
     if (!numAmount || numAmount <= 0) {
       errors.amount = "Please enter amount.";
     }
     if (!description.trim()) {
       errors.description = "Please enter transaction description.";
     }
     if (!payerPayee.trim()) {
       errors.payerPayee =
         mode === "revenue"
           ? "Please enter payer name."
           : "Please enter payee name.";
     }
     if (
       paymentStatus === "paid" &&
       paymentMethod === "bank_transfer" &&
       !receiptFile
     ) {
       errors.receipt = "Please attach payment receipt.";
     }
     if (mode === "revenue" && !category) {
       errors.category = "Please select a revenue category.";
     }
     if (mode === "expense" && !category) {
       errors.category = "Please select a budget allocation.";
     }
     if (mode === "expense" && !expenseCategory) {
       errors.expenseCategory = "Please select an expense category.";
     }
   }

   if (Object.keys(errors).length > 0) {
     setFieldErrors(errors);
     return;
   }
   setFieldErrors({});
   ```
4. Render `<FormFieldError id="error-amount" message={fieldErrors.amount} />` directly under the Amount field.
5. Render `<FormFieldError id="error-description" message={fieldErrors.description} />` directly under the Description field.
6. Render `<FormFieldError id="error-payer-payee" message={fieldErrors.payerPayee} />` directly under the Payer / Payee field.
7. Render `<FormFieldError id="error-receipt" message={fieldErrors.receipt} />` directly under the Receipt file input.
8. Add `noValidate` on `<form>` so custom `<FormFieldError>` displays reliably instead of browser native bubble.
9. On input changes, invoke `clearFieldError("amount")`, `clearFieldError("description")`, etc.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/record-transaction-modal.tsx tests/required-field-validation.test.mjs
git commit -m "feat(events): add inline FormFieldError with red alert icon to record transaction modal"
```

---

### Task 4: Inline Field-Level Validation in Club Finance Forms (`finance-forms.tsx`)

**Files:**
- Modify: `src/app/(member)/finances/finance-forms.tsx:45-250`
- Modify: `tests/required-field-validation.test.mjs`

**Interfaces:**
- Consumes: Club income or expense form submission
- Produces: Inline `<FormFieldError>` for missing amount, date, source note, or expense category with red `AlertCircle` icon and `"Please enter [field name]"`.

- [x] **Step 1: Write test assertions for `ClubIncomeForm` and `ClubExpenseForm` field validation**

Add to `tests/required-field-validation.test.mjs`:
```javascript
const financeFormsSource = readFileSync(
  new URL("../src/app/(member)/finances/finance-forms.tsx", import.meta.url),
  "utf8",
);

describe("Club finance forms field validation", () => {
  it("renders FormFieldError for amount and source note in ClubIncomeForm", () => {
    assert.match(
      financeFormsSource,
      /FormFieldError/,
      "Must import and render FormFieldError in finance-forms.tsx",
    );
    assert.match(
      financeFormsSource,
      /Please enter amount/,
      "Must validate amount with 'Please enter amount'",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement client validation with `<FormFieldError>` in `finance-forms.tsx`**

1. In `ClubIncomeForm`:
   - Add `errors` state (`const [errors, setErrors] = useState<Record<string, string>>({})`).
   - Add `handleSubmit` handler with `event.preventDefault()` when required fields (`amount_ngn`, `source_note`, or `receipt_file` if bank transfer) are empty.
   - Render `<FormFieldError id="income-amount-error" message={errors.amount} />`.
   - Render `<FormFieldError id="income-source-note-error" message={errors.sourceNote} />`.
   - Render `<FormFieldError id="income-receipt-error" message={errors.receipt} />`.
   - Add `noValidate` on `<form>`.
2. In `ClubExpenseForm`:
   - Add `errors` state.
   - Add `handleSubmit` handler checking amount, description, payee, category, and receipt.
   - Render `<FormFieldError>` under each field.
   - Add `noValidate` on `<form>`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/app/(member)/finances/finance-forms.tsx tests/required-field-validation.test.mjs
git commit -m "feat(finances): add inline FormFieldError with red alert icon to club income and expense forms"
```

---

### Task 5: Inline Field-Level Validation in Event Budget and Ticket Tier Modals

**Files:**
- Modify: `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx:110-180`
- Modify: `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx:160-280`
- Modify: `tests/required-field-validation.test.mjs`

**Interfaces:**
- Consumes: Budget ceiling or ticket tier modal submissions
- Produces: Inline `<FormFieldError>` for empty amount, tier name, price, capacity, or revision reason with `"Please enter [field name]"`.

- [x] **Step 1: Write test assertions for budget ceiling and tier modal validation**

Add to `tests/required-field-validation.test.mjs`:
```javascript
const budgetModalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);
const tierModalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/event-ticket-tier-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Event budget and tier modal field validation", () => {
  it("renders FormFieldError in EventBudgetCeilingModal and EventTicketTierModal", () => {
    assert.match(
      budgetModalSource,
      /FormFieldError/,
      "EventBudgetCeilingModal must use FormFieldError",
    );
    assert.match(
      tierModalSource,
      /FormFieldError/,
      "EventTicketTierModal must use FormFieldError",
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement client validation with `<FormFieldError>` in both modals**

1. In `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`:
   - Import `FormFieldError`.
   - Add `errors` state and `handleSubmit` validating that total is > 0 and (if `isEditing`) audit reason is non-empty.
   - Render `<FormFieldError id="error-budget-total" message={errors.total} />` under amount.
   - Render `<FormFieldError id="error-budget-reason" message={errors.reason} />` under reason textarea when editing.
   - Add `noValidate` on `<form>`.
2. In `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`:
   - Import `FormFieldError`.
   - Add `errors` state and `handleSubmit` validating name, price, capacity, and (if `isEdit || isRetire`) audit reason.
   - Render `<FormFieldError id="error-tier-name" message={errors.name} />` under name input.
   - Render `<FormFieldError id="error-tier-price" message={errors.price} />` under price input.
   - Render `<FormFieldError id="error-tier-capacity" message={errors.capacity} />` under capacity input.
   - Render `<FormFieldError id="error-tier-reason" message={errors.reason} />` under reason textarea when editing/retiring.
   - Add `noValidate` on `<form>`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/required-field-validation.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx src/components/events/dashboard/modals/event-ticket-tier-modal.tsx tests/required-field-validation.test.mjs
git commit -m "feat(events): add inline FormFieldError with red alert icon to budget and ticket tier modals"
```

---

### Task 6: Full Verification, Biome Linting, and Production Build

**Files:**
- All suites across the codebase

- [x] **Step 1: Run full test suite**

Run: `npm test`
Expected: 390+ passing tests, 0 failures.

- [x] **Step 2: Run Biome lint check**

Run: `npm run lint`
Expected: 0 errors / 0 diagnostics.

- [x] **Step 3: Run Next.js production build**

Run: `npm run build`
Expected: Successful build across all 21 routes with 0 errors.

- [x] **Step 4: Commit and finalize plan**

Mark all plan items complete and commit.
