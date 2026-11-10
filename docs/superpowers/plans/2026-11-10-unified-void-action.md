# Unified Void Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a single unified "Void" action across the portal that dynamically adapts its financial consequence, checks permissions, and routes to the correct underlying database operation depending on whether the target is an online order, manual ticket sale, expense voucher, or posted ledger transaction.

**Architecture:** A centralized server action `voidRecordAction` resolves the target record's true state from PostgreSQL and dispatches to the corresponding secure RPC. A single context-aware UI component `VoidRecordModal` replaces scattered reject/cancel/void dialogs, dynamically alerting the officer whether money moved and whether a refund is owed while strictly enforcing admin-only gates for posted transactions.

**Tech Stack:** Next.js (App Router, Server Actions), TypeScript, React, Supabase (PostgreSQL RPCs), Tailwind CSS, Node.js Test Runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-11-10-unified-void-action-design.md`

## Global Constraints
- Database procedures and migration schemas remain completely untouched (`verify_event_ticket_sale`, `verify_event_financial_transaction`, `void_event_financial_transaction`, `void_club_financial_transaction`).
- All void operations require an explicit audit explanation of at least 5 non-whitespace characters with zero control characters.
- Segregation of duties: Only Admin or Backup Admin may void posted financial transactions or approved ticket sales.
- Touch targets must satisfy the minimum 44px tap target floor.
- Styling strictly adheres to the Warm Editorial palette (`bg-warm-canvas`, `border-linen`, `text-espresso`, `bg-[#BA3C2A]` for destructive void actions).

## Review Focus
1. **Unpaid online ticket orders (`source='online'`, `recorded`):** Must route to `decision='cancelled'` without marking `refunded_at` and clearly inform the officer that no refund is owed.
2. **Paid / Approved ticket sales (`verification_status='approved'`):** Must enforce Admin/Backup Admin gating and explicitly display the refund liability owed back to the buyer.
3. **Pending expense vouchers (`verification_status='recorded'`):** Must allow Event Leads and Officers to void (reject) vouchers before they impact ledger balances.
4. **Posted financial transactions (`verification_status='approved'`):** Must prevent non-admins from submitting and route to `void_event_financial_transaction` or `void_club_financial_transaction`.
5. **Interactive UI modal hygiene:** Must prevent full-page reload jumps in drawers/ledgers by returning `{ success, error }` during client-driven actions while revalidating data.

---

### Task 1: Shared Void Interfaces & Types

**Files:**
- Modify: `src/components/events/dashboard/dashboard-types.ts`
- Test: `tests/unified-void-types.test.mjs`

**Interfaces:**
- Produces: `VoidEntityType`, `VoidableRecord`

- [ ] **Step 1: Write the failing test**

Create `tests/unified-void-types.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard types export VoidEntityType and VoidableRecord contracts", () => {
  const content = readFileSync(
    "src/components/events/dashboard/dashboard-types.ts",
    "utf8"
  );
  assert.match(content, /export type VoidEntityType =/);
  assert.match(content, /"ticket_sale"/);
  assert.match(content, /"event_transaction"/);
  assert.match(content, /"club_transaction"/);
  assert.match(content, /export interface VoidableRecord/);
  assert.match(content, /entityType:\s*VoidEntityType/);
  assert.match(content, /verificationStatus\?:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unified-void-types.test.mjs`
Expected: FAIL (types not defined)

- [ ] **Step 3: Define `VoidEntityType` and `VoidableRecord` in `src/components/events/dashboard/dashboard-types.ts`**

Export the types:
```typescript
export type VoidEntityType =
  | "ticket_sale"
  | "event_transaction"
  | "club_transaction";

export interface VoidableRecord {
  id: string;
  entityType: VoidEntityType;
  title: string;
  description?: string;
  amountNgn?: number;
  reference?: string;
  party?: string;
  source?: "manual" | "online";
  verificationStatus?: "recorded" | "approved" | "rejected" | "cancelled";
  paymentStatus?: "paid" | "pending" | "unpaid" | "deposit";
  paymentMethod?: "bank_transfer" | "cash";
  eventId?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unified-void-types.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/dashboard-types.ts tests/unified-void-types.test.mjs
git commit -m "feat(types): export VoidEntityType and VoidableRecord definitions"
```

---

### Task 2: Server Action Dispatcher (`voidRecordAction`)

**Files:**
- Modify: `src/app/actions.ts`
- Test: `tests/unified-void-action.test.mjs`

**Interfaces:**
- Consumes: `VoidEntityType` from Task 1, Supabase RPCs (`verify_event_ticket_sale`, `verify_event_financial_transaction`, `void_event_financial_transaction`, `void_club_financial_transaction`), `notifyTicketOrderReviewed`
- Produces: `voidRecordAction(params: VoidRecordParams | FormData): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Write the failing test**

Create `tests/unified-void-action.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("voidRecordAction exists and enforces validation and branching contracts", () => {
  const content = readFileSync("src/app/actions.ts", "utf8");
  assert.match(content, /export async function voidRecordAction\(/);
  assert.match(content, /verify_event_ticket_sale/);
  assert.match(content, /verify_event_financial_transaction/);
  assert.match(content, /void_event_financial_transaction/);
  assert.match(content, /void_club_financial_transaction/);
  assert.match(content, /decision:\s*"cancelled"/);
  assert.match(content, /decision:\s*"rejected"/);
  assert.match(content, /notifyTicketOrderReviewed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unified-void-action.test.mjs`
Expected: FAIL (`voidRecordAction` not defined)

- [ ] **Step 3: Implement `voidRecordAction` in `src/app/actions.ts`**

Implement the action supporting both programmatic JSON calls and FormData:
1. Validate `reason.trim().length >= 5` and reject control characters.
2. Query the current database state of the entity:
   - For `ticket_sale`:
     - If `source === 'online'` and `verification_status === 'recorded'`: call `verify_event_ticket_sale(decision='cancelled')` and email buyer via `notifyTicketOrderReviewed`.
     - If `verification_status === 'recorded'`: call `verify_event_ticket_sale(decision='rejected')`.
     - If `verification_status === 'approved'`: verify Admin/Backup Admin role, update `refunded_at = now()`, `refund_reason = reason`.
   - For `event_transaction`:
     - If `verification_status === 'recorded'`: call `verify_event_financial_transaction(decision='rejected')`.
     - If `verification_status === 'approved'` or posted: verify Admin/Backup Admin role, call `void_event_financial_transaction`.
   - For `club_transaction`:
     - Verify Admin/Backup Admin role, call `void_club_financial_transaction`.
3. Call `revalidatePath` on `/events/[eventId]/dashboard` and `/finances`.
4. Return `{ success: true }` or redirect if `returnUrl` provided in FormData.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unified-void-action.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/actions.ts tests/unified-void-action.test.mjs
git commit -m "feat(actions): implement unified voidRecordAction dispatcher"
```

---

### Task 3: Reusable Context-Aware `VoidRecordModal` Component

**Files:**
- Create: `src/components/common/void-record-modal.tsx`
- Test: `tests/unified-void-modal.test.mjs`

**Interfaces:**
- Consumes: `VoidableRecord` from Task 1, `useModalHygiene`, `formatNaira`
- Produces: `VoidRecordModal` component

- [ ] **Step 1: Write the failing test**

Create `tests/unified-void-modal.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("VoidRecordModal exists and implements dynamic consequence copy", () => {
  assert.ok(existsSync("src/components/common/void-record-modal.tsx"));
  const content = readFileSync(
    "src/components/common/void-record-modal.tsx",
    "utf8"
  );
  assert.match(content, /export function VoidRecordModal\(/);
  assert.match(content, /Cancels this order\. No payment was received/);
  assert.match(content, /owed back to the buyer/);
  assert.match(content, /Excludes this record from all balances/);
  assert.match(content, /min-h-\[44px\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unified-void-modal.test.mjs`
Expected: FAIL (file does not exist)

- [ ] **Step 3: Implement `VoidRecordModal` in `src/components/common/void-record-modal.tsx`**

Build the modal with:
1. `useModalHygiene` integration.
2. Context summary card (ID/reference, amount in Naira, title, party).
3. Dynamic consequence helper banner matching the target entity type and status.
4. Admin check: If record is posted/approved and user lacks Admin role, display security restriction and disable submit button.
5. Textarea for audit reason with character count and $\ge 5$-character enforcement.
6. Accessible header with close button, cancel button, and red destructive "Void" submit button with loading spinner.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unified-void-modal.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/common/void-record-modal.tsx tests/unified-void-modal.test.mjs
git commit -m "feat(ui): create context-aware VoidRecordModal component"
```

---

### Task 4: UI Integration Across Ledgers and Drawers

**Files:**
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx`
- Modify: `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`
- Modify: `src/components/finances/finances-page-view.tsx`
- Test: `tests/unified-void-ui-integration.test.mjs`

**Interfaces:**
- Consumes: `VoidRecordModal` from Task 3, `voidRecordAction` from Task 2

- [ ] **Step 1: Write the failing test**

Create `tests/unified-void-ui-integration.test.mjs`:
```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ledger and inspection drawer wire to unified VoidRecordModal", () => {
  const ledger = readFileSync(
    "src/components/events/dashboard/event-domain-ledger.tsx",
    "utf8"
  );
  const drawer = readFileSync(
    "src/components/events/dashboard/voucher-inspection-drawer.tsx",
    "utf8"
  );

  assert.match(ledger, /VoidRecordModal/);
  assert.match(drawer, /handleVoid|Void/);
  assert.doesNotMatch(drawer, /Reject \/ Reverse/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/unified-void-ui-integration.test.mjs`
Expected: FAIL

- [ ] **Step 3: Replace old triggers with `VoidRecordModal`**

1. In `voucher-inspection-drawer.tsx`:
   - Rename button label from "Reject / Reverse" to **"Void"** with a ShieldAlert/Ban icon.
   - When clicked, launch `VoidRecordModal` with current voucher data.
2. In `event-domain-ledger.tsx`:
   - Replace separate "Reject / Reverse" and "Void Transaction" buttons with the standardized **"Void"** action button.
3. In `event-dashboard-view.tsx`:
   - Wire `VoidRecordModal` to invoke `voidRecordAction` with toast notifications and modal state cleanup.
4. In `finances-page-view.tsx`:
   - Connect club finance records to `VoidRecordModal`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/unified-void-ui-integration.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/event-domain-ledger.tsx src/components/events/dashboard/voucher-inspection-drawer.tsx src/components/events/dashboard/event-dashboard-view.tsx src/components/finances/finances-page-view.tsx tests/unified-void-ui-integration.test.mjs
git commit -m "feat(ui): wire domain ledgers and review drawer to unified VoidRecordModal"
```

---

### Task 5: Full System Verification & Regression Guard

**Files:**
- Test: All test files in `tests/`

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: Exited with code 0.

- [ ] **Step 2: Run full automated test suite**

Run: `npm test`
Expected: All 1,030+ tests pass with 0 failures.

- [ ] **Step 3: Verify clean working directory**

Run: `git status`
Expected: Working tree clean.

- [ ] **Step 4: Final commit and summary**

```bash
git status
```
