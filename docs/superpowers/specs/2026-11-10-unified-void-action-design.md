# Unified Void Action Design

## 1. Intent & The Why
Across the platform, officers and administrators currently encounter divergent terminology—"Cancel Order", "Reject / Reverse", and "Void"—when invalidating records across ticket sales, expense vouchers, and financial ledgers. While the accounting mechanisms differ (e.g. some involve money movement requiring refunds, others cancel unfulfilled orders, and others zero out posted ledger lines), users think in terms of one core intent: **"I want to void this item."**

This design introduces a **single unified action concept ("Void")** across the user interface and server action layers. The system dynamically evaluates the entity type and financial state, applies the correct underlying database operation, clearly explains the financial consequence to the officer, and preserves full database immutability and segregation-of-duties protections.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Single Action Name ("Void"):** Replace fragmented buttons ("Reject", "Reverse", "Cancel Order") with a unified red **"Void"** action across the Box Office review queue, Ticket Sales ledger, Expense Voucher drawer, and Club Financials.
- **Context-Aware Modal:** A single **`VoidRecordModal`** that dynamically adapts its explanation, warnings, and impact notice based on the target entity:
  - *Unpaid Online Orders:* Informs the officer that voiding cancels the order with no money to refund.
  - *Paid/Claimed Ticket Sales:* Informs the officer that voiding rejects the ticket and marks the amount as owed back to the buyer.
  - *Pending Expense/Income Vouchers:* Informs the officer that voiding rejects the voucher before it affects the budget or ledger.
  - *Posted Financial Transactions:* Informs the officer that voiding permanently excludes the entry from live cash balances while retaining the audit trail.
- **Unified Server Action (`voidRecordAction`):** A centralized server action that validates the mandatory $\ge 5$-character audit reason, checks actor permissions, and securely dispatches to the appropriate underlying RPC.
- **Strict Role Enforcement:** Non-admins are prevented from voiding posted financial transactions (segregation of duties), while event officers and leads can void pending tickets and vouchers.

### Non-Goals
- Altering existing database schemas, migration files, or RPC signatures (`verify_event_ticket_sale`, `verify_event_financial_transaction`, `void_event_financial_transaction`, `void_club_financial_transaction` remain completely untouched).
- Changing internal database enum values (`verification_status` still safely stores `'cancelled'` and `'rejected'`, and transactions still use `voided_at`).
- Automatic money disbursement (rejections and refunds continue to flag accounting liabilities for manual or gateway return).

### Anti-Goals
- No silent or ambiguous actions: The modal must explicitly declare whether cash moved and whether a refund is owed.
- No bypassing segregation of duties: Executives and event leads cannot void transactions they authored where existing rules forbid it.

---

## 3. Constraints
- **Zero Database Risk:** All database procedures and accounting invariants (such as `private.event_cash_totals`) remain preserved.
- **Mandatory Audit Reasons:** All void actions require an explicit audit explanation of at least 5 non-whitespace characters with no control characters.
- **Design Tokens:** Strict alignment with the Warm Editorial palette (`bg-warm-canvas`, `border-linen`, `text-espresso`, `bg-crimson` for void actions) and 44px minimum tap targets.

---

## 4. Approaches & Selection

### Approach 1: Unified UI Facade & Smart Server Dispatcher (Selected)
- **Concept:** Standardize the action button ("Void") and confirmation dialog across all views. Implement a centralized server action `voidRecordAction` that branches to the appropriate existing RPC based on entity type and state.
- **Pros:** Completely non-invasive to PostgreSQL migrations; zero risk of breaking financial arithmetic or regression test suites; immediate unification for all users.
- **Cons:** Underlying database columns still reflect specific accounting states (`cancelled`, `rejected`, `voided_at`), which is actually beneficial for audit precision.

### Approach 2: Deep Database Consolidation (`void_record` RPC)
- **Concept:** Write a new PostgreSQL migration to consolidate all voiding, cancelling, and rejecting logic into a single SQL procedure.
- **Pros:** Single database interface.
- **Cons:** High risk of breaking existing regression tests, touching security definer paths, and introducing migration overhead.

### Approach 3: Pure UI Label Harmonization
- **Concept:** Only change button text to "Void" without consolidating modals or server actions.
- **Pros:** Trivial code change.
- **Cons:** Leaves fragmented modals, scattered action handlers, and inconsistent confirmation flows.

**Decision:** Approach 1 was selected for maximum safety, clean maintainability, and a seamless user experience.

---

## 5. Implementation Details

### A. Target Entity Mapping & Dynamic Rules

The server action resolves the target's current state from the database to guarantee that client-provided metadata cannot bypass permissions or misclassify items:

| Entity / State | Condition | UI Action | Underlying RPC Called | Financial Consequence Displayed | Permitted Actors |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pending Online Order** | `ticket_sale`, `source='online'`, `verification_status='recorded'` | "Void Order" | `verify_event_ticket_sale(decision='cancelled')` | "Cancels this order. No payment was received; no refund required." | Event Lead, Officer, Admin |
| **Pending Ticket Sale** | `ticket_sale`, `source='manual'`, `verification_status='recorded'` | "Void Ticket" | `verify_event_ticket_sale(decision='rejected')` | "Rejects this sale. Frees capacity and discards unverified cash/transfer claim." | Event Lead, Officer, Admin |
| **Approved Ticket Sale** | `ticket_sale`, `verification_status='approved'` (online or manual) | "Void Ticket (Refund)" | `update event_ticket_sales set refunded_at = now()` (via refund RPC) | "Voids this approved ticket and marks ₦X,XXX as owed back to the buyer." | **Admin & Backup Admin only** |
| **Pending Voucher** | `event_transaction`, `verification_status='recorded'` | "Void Voucher" | `verify_event_financial_transaction(decision='rejected')` | "Rejects this voucher before it can affect event budgets or ledgers." | Event Lead, Officer, Admin |
| **Posted Event Transaction** | `event_transaction`, `verification_status='approved'` | "Void Transaction" | `void_event_financial_transaction(transaction_id, reason)` | "Excludes this record from all balances. Retains row in audit trail." | **Admin & Backup Admin only** |
| **Posted Club Transaction** | `club_transaction`, `/finances` | "Void Transaction" | `void_club_financial_transaction(transaction_id, reason)` | "Excludes this record from club treasury. Retains row in audit trail." | **Admin & Backup Admin only** |

### B. Unified `VoidRecordModal` Component
Located at `src/components/common/void-record-modal.tsx`:
- Accepts props:
  ```ts
  interface VoidRecordModalProps {
    isOpen: boolean;
    isPending?: boolean;
    record: VoidableRecord | null;
    userRoles: string[];
    onClose: () => void;
    onConfirmVoid: (record: VoidableRecord, reason: string) => Promise<{ success: boolean; error?: string }>;
  }
  ```
- **Context Card:** Displays the record reference/ID, title, amount in Naira (if applicable), and badge showing financial impact.
- **Permission Check:** If a non-admin attempts to void an approved ticket or posted transaction, the modal informs them that only an active Administrator may void posted ledger lines and disables submission.
- **Audit Reason Input:** Textarea enforcing `min 5` and `max 500` characters.

### C. Server Action Dispatcher (`voidRecordAction`)
Located in `src/app/actions.ts`:
```ts
export async function voidRecordAction(
  params: {
    entityType: "ticket_sale" | "event_transaction" | "club_transaction";
    recordId: string;
    eventId?: string;
    reason: string;
    returnUrl?: string;
  } | FormData
): Promise<{ success: boolean; error?: string }>
```
1. **Hybrid Return Contract:**
   - If invoked programmatically by client modals (`VoidRecordModal`, `VoucherInspectionDrawer`), it returns `{ success: boolean; error?: string }` after calling `revalidatePath()`, allowing inline error display without full-page reloads.
   - If invoked as a standard HTML form submission with `returnUrl`, it executes `redirect(returnUrlWithNotice)`.
2. **Server-Side State Resolution:**
   - Evaluates the record's true status directly in PostgreSQL (preventing client spoofing).
   - Validates reason length ($\ge 5$ chars, no control chars).
   - Enforces role requirements: `verification_status = 'approved'` lines (whether tickets or transactions) strictly require Admin or Backup Admin.
3. **Dispatches Corresponding Procedures:**
   - Calls the respective RPC (`verify_event_ticket_sale`, `verify_event_financial_transaction`, `void_event_financial_transaction`, or `void_club_financial_transaction`).
   - If an online ticket order is cancelled or rejected, triggers buyer email notification via `notifyTicketOrderReviewed`.
   - Revalidates paths (`/events/[eventId]/dashboard`, `/finances`).

---

## 6. What's Left to the Builder
- Refactor `src/components/events/dashboard/modals/void-transaction-modal.tsx` into the shared `VoidRecordModal`.
- Update button triggers in `event-domain-ledger.tsx`, `voucher-inspection-drawer.tsx`, and `tab-tickets.tsx` to launch the unified void flow.
- Add comprehensive test cases in `tests/` asserting that `voidRecordAction` routes correctly across all 5 record types and enforces the $\ge 5$-character reason rule.
