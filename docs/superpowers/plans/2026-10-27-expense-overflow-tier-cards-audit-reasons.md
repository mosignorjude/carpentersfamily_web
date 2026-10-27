# Expense Overflow, Flexible Tier Cards, and Automatic Initial Audit Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Resolve horizontal overflow in the Expense Management section, make ticket tier cards auto-responsive, and enforce the project-wide governance convention where initial entries automatically assign a meaningful audit reason in the background while edits and revisions explicitly require a user-provided audit reason.

**Architecture:**
1. **Expenses Tab Layout:** Fix CSS Flexbox `min-w-0` boundary constraint on the cost center filter buttons so internal scrolling triggers cleanly rather than widening the container, adjust header flex wrapping (`flex-col lg:flex-row`), and safeguard currency metric subgrids.
2. **Ticket Tiers Auto-Responsive Grid:** Replace rigid `grid-cols-4` with an auto-fit CSS grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]`) that expands cards when there are 1–3 tiers and shrinks/wraps them gracefully on smaller viewports.
3. **Audit Reason Standardization:** Across category creation, ticket tier creation, budget ceiling setup, and club-wide cost center creation, suppress the visible audit reason input box in the UI and transmit a background default (`Initial category entry`, `Initial admission tier entry`, `Initial budget ceiling entry`, `Initial cost center entry`), while strictly requiring explicit user justification for all updates, renames, and retirements.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS v4, TypeScript, Node.js test runner (`node:test`).

**Spec:** User feedback from local production verification on 2026-10-27:
- "Expense Management & Cost Centers section is overflowing"
- "tier cards are not flexible (They dont expand to occupy space or shrink to accomodate)"
- "Then for initial entries audit reason should have a meaningful reason assigned to in the background automatically, the audit reason box should only appear during edit or revision this applies through out the project. For example creating a category should have audit reason = Initial category entry; then edit the same categories will then show me required audit reason."

---

## Global Constraints

- Never break existing database RPC signatures or PostgreSQL security constraints.
- Maintain whole Naira formatting (`formatNaira`) and Biome compliance with zero lint diagnostics.
- Ensure all automated unit and integration tests pass (`npm test`).
- Preserve the existing `#btn-manage-budget-categories` ("Categories") button and modal behavior.
- Every initial entry must record a non-empty audit reason in PostgreSQL audit history; no silent NULL audit logs.

---

## Review Focus

1. **Flex child with `overflow-x-auto` without `min-w-0`:** Causes parent to expand beyond viewport width, producing horizontal page scroll. Must be clamped with `min-w-0 max-w-full flex-1`.
2. **Single or dual ticket tiers in wide viewport:** Must expand to fill grid track rather than staying locked at 25% column width.
3. **Form submission with omitted reason on initial creation:** Must successfully submit and persist the automatic meaningful audit reason without failing server action validation.
4. **Form submission with empty reason on edit/revision:** Must be rejected with `invalid-request` notice and retain strict validation.
5. **Existing UI tests:** Assertions checking for `name="reason"` must remain satisfied across both hidden and visible reason input implementations.

---

## File Structure

### Files to Modify
- `src/components/events/dashboard/tab-expenses.tsx`: Flexbox overflow fix on segmented buttons, responsive header wrapping, and metric column protection.
- `src/components/events/dashboard/tab-tickets.tsx`: Flexible auto-fit responsive grid for ticket tier cards.
- `src/components/events/dashboard/modals/event-category-management-modal.tsx`: Hide reason field during category creation; send `Initial category entry`.
- `src/app/(member)/admin/event-finance-categories/actions.ts`: Default `reason` to `"Initial category entry"` in `createEventFinanceCategoryAction`.
- `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`: Hide reason textarea in `mode === "create"`; send `Initial admission tier entry`.
- `src/app/actions.ts`: Default `reason` to `"Initial admission tier entry"` in `createEventTicketTierAction`, default initial budget ceiling reason in `setEventBudgetAction`, and default `createFinanceCategoryAction`.
- `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`: Hide reason textarea when `!isEditing`; send `Initial budget ceiling entry`.
- `src/app/(member)/finances/finance-forms.tsx`: Hide visible reason field during expense category creation; send `Initial cost center entry`.

### Test Files to Create or Update
- `tests/event-dashboard-expenses-ui.test.mjs` (create): Verify `tab-expenses.tsx` layout constraints and overflow-prevention classes.
- `tests/event-ticket-tier-ui.test.mjs` (modify): Verify responsive grid classes in `tab-tickets.tsx` and hidden vs visible reason logic in `event-ticket-tier-modal.tsx`.
- `tests/event-budget-ceiling-ui.test.mjs` (modify): Verify hidden reason on initial setup vs visible required reason on edit.
- `tests/budget-and-tier-actions.test.mjs` (modify): Verify server action fallback defaults on creation and enforcement on revision.
- `tests/category-audit-reason.test.mjs` (create): Verify category creation background reason and rename/retire visible reason requirements.

---

### Task 1: Fix Horizontal Overflow in Expense Management Section (`TabExpenses`)

**Files:**
- Modify: `src/components/events/dashboard/tab-expenses.tsx:69-170`
- Create: `tests/event-dashboard-expenses-ui.test.mjs`

**Interfaces:**
- Consumes: `TabExpensesProps` (`costCenters`, `canRecord`, `onRecordExpense`, `budgetCeiling`)
- Produces: Overflow-free container with internal horizontal scrolling on cost center filter buttons and responsive header wrapping.

- [x] **Step 1: Write the failing test for `tab-expenses.tsx` overflow safeguards**

Create `tests/event-dashboard-expenses-ui.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);

describe("TabExpenses layout and overflow protection", () => {
  it("constrains the segmented button scroll container with min-w-0 and flex-1", () => {
    assert.match(
      source,
      /overflow-x-auto[^"]*min-w-0|min-w-0[^"]*overflow-x-auto/,
      "Segmented filter buttons container must include min-w-0 to prevent flex blowout"
    );
  });

  it("applies responsive wrapping to header action and stat cards", () => {
    assert.match(
      source,
      /flex-col lg:flex-row/,
      "Header must wrap gracefully on tablet viewports using lg:flex-row instead of md:flex-row"
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-dashboard-expenses-ui.test.mjs`
Expected: FAIL (missing `min-w-0` on overflow container and `flex-col lg:flex-row` on header).

- [x] **Step 3: Implement overflow fixes in `src/components/events/dashboard/tab-expenses.tsx`**

1. In line 69, add `overflow-hidden max-w-full` to `<section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6 overflow-hidden max-w-full">`.
2. In line 71, update header to `<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">`.
3. In line 127–129, update filter bar wrapper:
   ```tsx
   <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 min-w-0 max-w-full">
     <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto min-w-0 max-w-full flex-1">
   ```
4. In line 253, ensure subgrid numbers do not overflow columns:
   Add `min-w-0 truncate` to the metric spans inside `grid grid-cols-3`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-dashboard-expenses-ui.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-expenses.tsx tests/event-dashboard-expenses-ui.test.mjs
git commit -m "fix(events): prevent horizontal overflow in expense management section"
```

---

### Task 2: Make Ticket Tier Cards Auto-Responsive and Flexible (`TabTickets`)

**Files:**
- Modify: `src/components/events/dashboard/tab-tickets.tsx:120-125`
- Modify: `tests/event-ticket-tier-ui.test.mjs:100-115`

**Interfaces:**
- Consumes: `DashboardTicketTier[]`
- Produces: CSS auto-fit grid that expands 1–3 cards to fill available space and accommodates dense tiers on smaller screens.

- [x] **Step 1: Write test assertion for auto-fit responsive grid in `TabTickets`**

In `tests/event-ticket-tier-ui.test.mjs`, add:
```javascript
it("renders flexible auto-fit grid for tier cards instead of rigid 4-column grid", () => {
  const source = readFileSync(tabTicketsPath, "utf8");
  assert.match(
    source,
    /auto-fit|grid-cols-\[repeat\(auto-fit/,
    "Tiers grid must use auto-fit to allow cards to expand and shrink flexibly"
  );
  assert.doesNotMatch(
    source,
    /lg:grid-cols-4/,
    "Tiers grid must not use rigid lg:grid-cols-4"
  );
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-ticket-tier-ui.test.mjs`
Expected: FAIL on the auto-fit grid assertion.

- [x] **Step 3: Update `TabTickets` tier cards grid layout**

In `src/components/events/dashboard/tab-tickets.tsx` line 121:
Replace:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
```
With:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-ticket-tier-ui.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/tab-tickets.tsx tests/event-ticket-tier-ui.test.mjs
git commit -m "fix(events): use flexible auto-fit grid for admission tier cards"
```

---

### Task 3: Automatic Background Audit Reason on Category Creation & Required on Edit

**Files:**
- Modify: `src/components/events/dashboard/modals/event-category-management-modal.tsx:965-988`
- Modify: `src/app/(member)/admin/event-finance-categories/actions.ts:127-143`
- Create: `tests/category-audit-reason.test.mjs`

**Interfaces:**
- Consumes: Category creation form submission
- Produces: Category creation without visible reason box; background transmission and action defaulting of `"Initial category entry"`.

- [x] **Step 1: Write failing tests for category creation vs edit audit reason behavior**

Create `tests/category-audit-reason.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const modalSource = readFileSync(
  new URL("../src/components/events/dashboard/modals/event-category-management-modal.tsx", import.meta.url),
  "utf8"
);
const actionSource = readFileSync(
  new URL("../src/app/(member)/admin/event-finance-categories/actions.ts", import.meta.url),
  "utf8"
);

describe("Event category audit reason convention", () => {
  it("omits visible audit reason input from category creation form and provides hidden default", () => {
    assert.doesNotMatch(
      modalSource,
      /id="create-category-reason"/,
      "Category creation form must not display visible audit reason input"
    );
    assert.match(
      modalSource,
      /type="hidden"\s+name="reason"\s+value="Initial category entry"/,
      "Category creation form must submit hidden reason 'Initial category entry'"
    );
  });

  it("retains visible required audit reason for category rename and retirement", () => {
    assert.match(
      modalSource,
      /id=\{`rename-reason-\$\{cat\.id\}`\}/,
      "Category rename form must retain visible required audit reason"
    );
    assert.match(
      modalSource,
      /id=\{`delete-reason-\$\{cat\.id\}`\}/,
      "Category retirement form must retain visible required audit reason"
    );
  });

  it("server action defaults reason to 'Initial category entry' when omitted or empty", () => {
    assert.match(
      actionSource,
      /field\(formData,\s*"reason",\s*500\)\s*\|\|\s*"Initial category entry"/,
      "createEventFinanceCategoryAction must fallback to 'Initial category entry'"
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/category-audit-reason.test.mjs`
Expected: FAIL.

- [x] **Step 3: Update `EventCategoryManagementModal` and `actions.ts`**

1. In `src/components/events/dashboard/modals/event-category-management-modal.tsx` (around lines 970–987):
   Replace the visible `<label htmlFor="create-category-reason">` and `<input id="create-category-reason" ...>` with:
   ```tsx
   <input name="reason" type="hidden" value="Initial category entry" />
   ```
2. In `src/app/(member)/admin/event-finance-categories/actions.ts` line 127–134:
   ```typescript
   export async function createEventFinanceCategoryAction(formData: FormData) {
     const type = categoryType(field(formData, "category_type", 30));
     const name = field(formData, "name", 80);
     const reason =
       field(formData, "reason", 500) || "Initial category entry";
     if (!type || !name || name.length < 2) {
       redirect(redirectTarget(formData, "invalid-request"));
     }
   ```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/category-audit-reason.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/event-category-management-modal.tsx src/app/(member)/admin/event-finance-categories/actions.ts tests/category-audit-reason.test.mjs
git commit -m "fix(events): auto-assign initial category audit reason and hide reason box on create"
```

---

### Task 4: Automatic Background Audit Reason on Ticket Tier Creation & Required on Edit/Retire

**Files:**
- Modify: `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx:233-263`
- Modify: `src/app/actions.ts:2080-2115`
- Modify: `tests/event-ticket-tier-ui.test.mjs:52-66`

**Interfaces:**
- Consumes: `mode: "create" | "edit" | "retire"`
- Produces: Hidden reason input for `create` mode; visible required reason textarea for `edit` and `retire` modes.

- [x] **Step 1: Write test assertion for ticket tier creation vs edit reason behavior**

In `tests/event-ticket-tier-ui.test.mjs`, update and add:
```javascript
it("shows reason textarea only during edit or retire, and submits hidden reason during create", () => {
  const source = readFileSync(modalPath, "utf8");
  assert.match(
    source,
    /isCreate\s*\?\s*\(\s*<input[^>]*type="hidden"[^>]*name="reason"[^>]*value="Initial admission tier entry"/,
    "Must pass hidden 'Initial admission tier entry' when isCreate is true"
  );
  assert.match(
    source,
    /id="ticket-tier-reason"/,
    "Must render ticket-tier-reason textarea when isEdit or isRetire"
  );
});
```
In `tests/budget-and-tier-actions.test.mjs`, add assertion that `createEventTicketTierAction` defaults `reason` to `"Initial admission tier entry"` if omitted.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-ticket-tier-ui.test.mjs`
Expected: FAIL.

- [x] **Step 3: Update `EventTicketTierModal` and `createEventTicketTierAction`**

1. In `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx` (around lines 233–263):
   Replace unconditional textarea with:
   ```tsx
   {isCreate ? (
     <input
       name="reason"
       type="hidden"
       value="Initial admission tier entry"
     />
   ) : (
     /* Audit Reason Field (Required for edit and retire) */
     <div className="space-y-1.5">
       <label
         className="block font-semibold text-[#3D291F]"
         htmlFor="ticket-tier-reason"
       >
         Audit Reason <span className="text-[#BA3C2A]">*</span>
       </label>
       <textarea
         className="w-full p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] resize-none"
         id="ticket-tier-reason"
         maxLength={500}
         name="reason"
         onChange={(e) => setReason(e.target.value)}
         placeholder={
           isRetire
             ? "Explain why this tier is being retired (e.g. Sales quota reached, superseded by VIP II)..."
             : "Explain why this tier's parameters are changing..."
         }
         required
         rows={3}
         value={reason}
       />
       <div className="flex justify-between items-center text-[10px] text-[#7A685D]">
         <span>Required for club governance compliance.</span>
         <span>{reason.length}/500</span>
       </div>
     </div>
   )}
   ```
2. In `src/app/actions.ts` (`createEventTicketTierAction`):
   ```typescript
   const name = eventText(formData, "name", 80);
   const price = eventAmount(formData.get("price_ngn"));
   const capacity = eventCapacity(formData, "capacity", 100_000);
   const reason =
     eventText(formData, "reason", 500) || "Initial admission tier entry";
   if (!name || price === null || capacity === null) {
     redirect(eventFinanceNoticeUrl(eventId, "invalid-request", returnTab));
   }
   ```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-ticket-tier-ui.test.mjs tests/budget-and-tier-actions.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/event-ticket-tier-modal.tsx src/app/actions.ts tests/event-ticket-tier-ui.test.mjs tests/budget-and-tier-actions.test.mjs
git commit -m "fix(events): auto-assign initial ticket tier audit reason and show textarea only on edit/retire"
```

---

### Task 5: Automatic Background Audit Reason on Initial Budget Total Setup & Required on Revision

**Files:**
- Modify: `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx:135-171`
- Modify: `src/app/actions.ts:1980-2015`
- Modify: `tests/event-budget-ceiling-ui.test.mjs`
- Modify: `tests/budget-and-tier-actions.test.mjs`

**Interfaces:**
- Consumes: `currentCeiling: number`
- Produces: Hidden reason input when setting initial budget (`!isEditing`); visible required textarea when revising existing ceiling (`isEditing`).

- [x] **Step 1: Write test assertion for budget ceiling setup vs revision reason behavior**

In `tests/event-budget-ceiling-ui.test.mjs`, add:
```javascript
it("renders hidden reason input for initial ceiling setup and visible required textarea on revision", () => {
  const source = readFileSync(modalPath, "utf8");
  assert.match(
    source,
    /!isEditing\s*\?\s*\(\s*<input[^>]*type="hidden"[^>]*name="reason"[^>]*value="Initial budget ceiling entry"/,
    "Must submit hidden 'Initial budget ceiling entry' when !isEditing"
  );
  assert.match(
    source,
    /id="event-budget-reason"/,
    "Must render event-budget-reason textarea when isEditing"
  );
});
```
In `tests/budget-and-tier-actions.test.mjs`, verify `setEventBudgetAction` defaults `reason` to `"Initial budget ceiling entry"` when no existing budget exists, and strictly requires user reason when an existing budget is found.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-budget-ceiling-ui.test.mjs`
Expected: FAIL.

- [x] **Step 3: Update `EventBudgetCeilingModal` and `setEventBudgetAction`**

1. In `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`:
   Replace lines 135–171 with:
   ```tsx
   {!isEditing ? (
     <input
       name="reason"
       type="hidden"
       value="Initial budget ceiling entry"
     />
   ) : (
     /* Audit Reason Field (Required only during revision) */
     <div className="space-y-1.5">
       <label
         className="block font-semibold text-[#3D291F]"
         htmlFor="event-budget-reason"
       >
         Audit Reason <span className="text-[#BA3C2A]">*</span>
       </label>
       <textarea
         className="w-full p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] resize-none"
         id="event-budget-reason"
         maxLength={500}
         name="reason"
         onChange={(e) => setReason(e.target.value)}
         placeholder="Explain why the total budget ceiling is being revised (e.g. Executive approval for expanded catering scope)..."
         required
         rows={3}
         value={reason}
       />
       <div className="flex justify-between items-center text-[10px] text-[#7A685D]">
         <span>Required for immutable audit logging.</span>
         <span>{reason.length}/500</span>
       </div>
     </div>
   )}
   ```
2. In `src/app/actions.ts` (`setEventBudgetAction`):
   ```typescript
   const reasonInput = formData.get("reason");
   let reason: string | null = null;
   if (typeof reasonInput === "string" && reasonInput.trim().length > 0) {
     reason = eventText(formData, "reason", 500);
   }

   // 1. Fetch current budget to see if this is an update requiring a reason
   const { data: existingBudget, error: budgetError } = await actor.supabase
     .from("event_budgets")
     .select("total_ngn")
     .eq("event_id", eventId)
     .maybeSingle();

   if (budgetError) {
     redirect(
       eventFinanceNoticeUrl(eventId, rpcErrorNotice(budgetError), returnTab),
     );
   }

   const budgetExists = Boolean(existingBudget);
   if (budgetExists && !reason) {
     redirect(eventFinanceNoticeUrl(eventId, "invalid-request", returnTab));
   }
   if (!budgetExists && !reason) {
     reason = "Initial budget ceiling entry";
   }
   ```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/event-budget-ceiling-ui.test.mjs tests/budget-and-tier-actions.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx src/app/actions.ts tests/event-budget-ceiling-ui.test.mjs tests/budget-and-tier-actions.test.mjs
git commit -m "fix(events): auto-assign initial budget ceiling audit reason and show textarea only on revision"
```

---

### Task 6: Standardize Club Finance Category Creation (`finance-forms.tsx`)

**Files:**
- Modify: `src/app/(member)/finances/finance-forms.tsx:466-484`
- Modify: `src/app/actions.ts:1273-1298`

**Interfaces:**
- Consumes: Club-wide finance category creation form
- Produces: Form without visible reason box; background transmission and action defaulting of `"Initial cost center entry"`.

- [x] **Step 1: Check existing finance actions tests and verify test coverage**

Run: `node --test tests/admin-financial-settings-components.test.mjs tests/pre-launch-financial-actions.test.mjs`
Expected: PASS.

- [x] **Step 2: Update `finance-forms.tsx` and `createFinanceCategoryAction`**

1. In `src/app/(member)/finances/finance-forms.tsx` (lines 466–484):
   Replace the visible `cat-reason` label and input with:
   ```tsx
   <input name="reason" type="hidden" value="Initial cost center entry" />
   ```
2. In `src/app/actions.ts` (`createFinanceCategoryAction`):
   ```typescript
   export async function createFinanceCategoryAction(formData: FormData) {
     const name = formString(formData, "name", 80);
     const reason =
       formString(formData, "reason", 500) || "Initial cost center entry";
     if (!name || name.length < 2 || containsControlCharacters(name)) {
       redirect(financeNoticeUrl("invalid-request"));
     }
   ```

- [x] **Step 3: Run tests to verify all pass**

Run: `node --test tests/admin-financial-settings-components.test.mjs tests/pre-launch-financial-actions.test.mjs`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add src/app/(member)/finances/finance-forms.tsx src/app/actions.ts
git commit -m "fix(finances): auto-assign initial cost center audit reason and hide reason box on create"
```

---

### Task 7: Full Automated Regression, Biome Linting, and Production Build

**Files:**
- Test: All suites across the codebase

- [x] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: 378+ passing tests, 0 failures.

- [x] **Step 2: Run Biome linter check**

Run: `npm run lint`
Expected: 0 errors / 0 diagnostics across all checked files.

- [x] **Step 3: Run production Next.js build**

Run: `npm run build`
Expected: Succeeded across all 21 routes with 0 TypeScript or layout build errors.

- [x] **Step 4: Commit and finalize**

```bash
git status
```
Ensure working tree is clean.
