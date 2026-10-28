# Event Ledger "Recorded/Auth by" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "Authorized By" column to "Recorded/Auth by" across the event ledger and voucher inspection modal, and replace static placeholders with the actual recording member's `@username` handle resolved via batch profile lookup.

**Architecture:** In `page.tsx`, select `created_by` on transactions and `seller_id` on ticket sales, batch-query `member_profiles` for unique actor handles, and populate `authorizedBy` with `@username`. Update `TabAuditLog` table headers and `TransactionDetailModal` metadata cards to use "Recorded/Auth by".

**Tech Stack:** Next.js 16 (Turbopack, App Router), TypeScript, Supabase PostgreSQL, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-10-28-event-ledger-recorded-by-design.md`

## Global Constraints
- Currency & Timezone: ₦ NGN whole integer arithmetic, Africa/Lagos (WAT).
- Visual Design Tokens: Warm Editorial palette (`#3D291F`, `#7A685D`, `#FAF6F0`, `#E5DDD3`, `#174C37`).
- Handles: Formatted as `@username` in font-mono tabular layout. Fallback to `@secretariat` if actor profile is missing.
- No N+1 queries: Actor IDs must be batched and resolved in a single lookup.

## Review Focus
- Actor with null or empty username: displays fallback `@secretariat`.
- Actor handle formatting: prefixed with `@` and styled in `font-mono`.
- Legacy or mock transactions without `created_by` or `seller_id`: handles missing IDs gracefully without crashing.
- Inspect Voucher modal: updates label from "Authorized Officer" to "Recorded / Authorized by" matching the table column.
- Table column blowout: compact `@username` styling maintains 7-column ledger alignment on desktop and mobile.

---

### Task 1: Add Unit Tests for Actor ID Querying & Header Renaming

**Files:**
- Create: `tests/event-ledger-recorded-by.test.mjs`

**Interfaces:**
- Consumes: `src/app/(member)/events/[eventId]/dashboard/page.tsx`, `src/components/events/dashboard/tab-audit-log.tsx`, `src/components/events/dashboard/modals/transaction-detail-modal.tsx`
- Produces: Test suite validating actor ID extraction and UI label updates

- [ ] **Step 1: Write the failing tests**

```javascript
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  new URL(
    "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const auditLogSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-audit-log.tsx",
    import.meta.url,
  ),
  "utf8",
);

const modalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/transaction-detail-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Event Ledger Recorded/Auth by Attribution", () => {
  it("selects created_by in event_financial_transactions query", () => {
    assert.match(
      pageSource,
      /\.from\("event_financial_transactions"\)[\s\S]*created_by/,
      "page.tsx must select created_by on financial transactions",
    );
  });

  it("selects seller_id in event_ticket_sales query", () => {
    assert.match(
      pageSource,
      /\.from\("event_ticket_sales"\)[\s\S]*seller_id/,
      "page.tsx must select seller_id on ticket sales",
    );
  });

  it("batch queries member_profiles for unique actor usernames", () => {
    assert.match(
      pageSource,
      /\.from\("member_profiles"\)[\s\S]*\.select\("id,\s*username"\)/,
      "page.tsx must batch query member_profiles for actor usernames",
    );
  });

  it("renames Authorized By column header to Recorded/Auth by in TabAuditLog", () => {
    assert.match(
      auditLogSource,
      /<th[^>]*>Recorded\/Auth by<\/th>/,
      "TabAuditLog must label column Recorded/Auth by",
    );
    assert.doesNotMatch(
      auditLogSource,
      /<th[^>]*>Authorized By<\/th>/,
      "TabAuditLog must not retain old Authorized By column header",
    );
  });

  it("renames Authorized Officer to Recorded / Authorized by in TransactionDetailModal", () => {
    assert.match(
      modalSource,
      /Recorded\s*\/\s*Authorized by/,
      "TransactionDetailModal must label metadata card Recorded / Authorized by",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/event-ledger-recorded-by.test.mjs`
Expected: FAIL with assertions failing on `created_by`, `seller_id`, or column header.

- [ ] **Step 3: Commit test file**

```bash
git add tests/event-ledger-recorded-by.test.mjs
git commit -m "test(events): add tests for event ledger recorded-by actor attribution"
```

---

### Task 2: Update Server Queries & Username Resolution in `page.tsx`

**Files:**
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:220-250`, `660-715`

**Interfaces:**
- Consumes: `event_ticket_sales.seller_id`, `event_financial_transactions.created_by`, `member_profiles.username`
- Produces: `DashboardTransaction.authorizedBy` populated with `@username` handle

- [ ] **Step 1: Include `seller_id` and `created_by` in select statements**

In `page.tsx`:
- Line 222: In `event_ticket_sales` select: add `seller_id`.
- Line 242: In `event_financial_transactions` select: add `created_by`.

- [ ] **Step 2: Add batch username query and resolution map**

Collect unique IDs and fetch usernames from `member_profiles`:
```ts
const actorIds = Array.from(
  new Set([
    ...rawTxns.map((t) => (t as { created_by?: string }).created_by).filter(Boolean),
    ...allSales.map((s) => (s as { seller_id?: string }).seller_id).filter(Boolean),
  ]),
) as string[];

const { data: actorProfiles } =
  actorIds.length > 0
    ? await supabase
        .from("member_profiles")
        .select("id, username")
        .in("id", actorIds)
    : { data: [] };

const usernameByActorId = new Map<string, string>(
  (actorProfiles ?? [])
    .filter((p) => p.username)
    .map((p) => [p.id, p.username as string]),
);
```

- [ ] **Step 3: Map handle into `manualTransactions` and `saleTransactions`**

In `manualTransactions`:
```ts
const creatorId = (t as { created_by?: string }).created_by;
const creatorHandle = creatorId ? usernameByActorId.get(creatorId) : null;
const actorDisplay = creatorHandle ? `@${creatorHandle}` : "@secretariat";
...
authorizedBy: actorDisplay,
authorizerRole: "Recorded",
```

In `saleTransactions`:
```ts
const sellerId = (s as { seller_id?: string }).seller_id;
const sellerHandle = sellerId ? usernameByActorId.get(sellerId) : null;
const actorDisplay = sellerHandle ? `@${sellerHandle}` : "@secretariat";
...
authorizedBy: actorDisplay,
authorizerRole: "Recorded",
```

- [ ] **Step 4: Run unit test to verify query assertions pass**

Run: `node --test tests/event-ledger-recorded-by.test.mjs`
Expected: First 3 assertions PASS; UI assertions still FAIL.

- [ ] **Step 5: Commit server changes**

```bash
git add src/app/(member)/events/[eventId]/dashboard/page.tsx
git commit -m "feat(events): query and resolve recording member handles for event ledger"
```

---

### Task 3: Update Table Header and Detail Modal Labels

**Files:**
- Modify: `src/components/events/dashboard/tab-audit-log.tsx:218`, `321-329`
- Modify: `src/components/events/dashboard/modals/transaction-detail-modal.tsx:166-174`

**Interfaces:**
- Consumes: `DashboardTransaction.authorizedBy` (`@username`)
- Produces: Updated ledger table header and voucher modal presentation

- [ ] **Step 1: Rename table column header in `tab-audit-log.tsx`**

Line 218:
Change `<th className="py-3 px-3.5">Authorized By</th>` to:
`<th className="py-3 px-3.5">Recorded/Auth by</th>`

- [ ] **Step 2: Update table cell styling in `tab-audit-log.tsx`**

Lines 321-329:
```tsx
{/* Recorded / Authorized by */}
<td className="py-3.5 px-3.5 whitespace-nowrap text-xs">
  <span className="font-mono text-[#3D291F] font-semibold block">
    {txn.authorizedBy}
  </span>
  {txn.authorizerRole && (
    <span className="text-[10px] text-[#7A685D] block">
      {txn.authorizerRole}
    </span>
  )}
</td>
```

- [ ] **Step 3: Update metadata card in `transaction-detail-modal.tsx`**

Lines 166-174:
```tsx
<div>
  <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
    Recorded / Authorized by
  </span>
  <span className="font-mono text-[#3D291F] font-semibold mt-0.5 block">
    {transaction.authorizedBy}
  </span>
</div>
```

- [ ] **Step 4: Run all unit tests to verify they pass**

Run: `node --test tests/event-ledger-recorded-by.test.mjs`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit UI changes**

```bash
git add src/components/events/dashboard/tab-audit-log.tsx src/components/events/dashboard/modals/transaction-detail-modal.tsx
git commit -m "feat(events): update ledger header and modal labels to Recorded/Auth by"
```

---

### Task 4: Full Suite Verification & Build Confirmation

**Files:**
- Verify: Full codebase

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All 412+ tests PASS with 0 failures.

- [ ] **Step 2: Run Biome linter**

Run: `npm run lint`
Expected: 0 errors across all files.

- [ ] **Step 3: Run production Next.js build**

Run: `npm run build`
Expected: Production build compiles successfully in Turbopack.
