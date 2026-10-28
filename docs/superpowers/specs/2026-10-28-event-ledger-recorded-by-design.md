# Event Ledger "Recorded/Auth by" Attribution Design

## 1. Intent & Context
In the Event Dashboard's **Financial Ledger & Transaction Journal**, the audit column previously titled "Authorized By" displayed hardcoded placeholders (`"Verified Officer"`) rather than identifying the real member accounts responsible for entries.

Because event transactions are currently posted upon creation without a separate approval stage, every event entry represents an action recorded directly by a verified club officer or ticketing desk member. This design updates the ledger to display the actual actor's `@username` handle, renames the column to **"Recorded/Auth by"**, and establishes a forward-compatible pattern that supports dual recorded/authorized attribution when future multi-tier approval workflows are introduced.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Rename the audit column header in `TabAuditLog` to **"Recorded/Auth by"**.
- Update `TransactionDetailModal` to label the field **"Recorded / Authorized by"** (or **"Recorded by"**).
- Replace static `"Verified Officer"` strings with the recording member's handle (e.g. `@adeola`, `@uche`).
- Extract the actor ID from `created_by` for manual transactions (`event_financial_transactions`) and `seller_id` for ticket sales (`event_ticket_sales`).
- Batch-query usernames from `public.member_profiles` in a single performant step.

### Non-Goals
- Adding database migrations for new approval columns (the user confirmed that as of today, event transactions require no separate authorization).
- Modifying dues or general club finance ledgers (strictly scoped to event dashboard transactions).

### Anti-Goals
- **Table blowout**: Long member names or untruncated identifiers must not displace table metrics. Using concise `@username` handles maintains compact cell sizing.
- **N+1 queries**: Looking up member profiles row-by-row must not occur; actor IDs will be collected and resolved in a single batch query.

---

## 3. Constraints
- **Platform & Governance**: Supabase PostgreSQL with Row Level Security. Active club members can read active member profile usernames.
- **Formatting**: Handles are prefixed with `@` (e.g., `@adeola`). If a username is unexpectedly null or empty, fall back gracefully to `@unknown` or the member's short name.
- **Design Tokens**: Standard Warm Editorial theme palette (`#3D291F`, `#7A685D`, `#174C37`).

---

## 4. Approaches Considered

### Approach 1: Batch Profile Lookup via Actor IDs (Selected)
- In `page.tsx`, select `created_by` from `event_financial_transactions` and `seller_id` from `event_ticket_sales`.
- Collect unique actor IDs and query `public.member_profiles` using `.in('id', actorIds)`.
- Build an in-memory lookup map (`usernameByActorId`).
- Map each transaction's `authorizedBy` or `recordedBy` to `@${username}`.
- **Trade-offs**: Consistent with patterns used in dues and admin views, highly performant, handles duplicate actors cleanly, and avoids foreign key join quirks.

### Approach 2: Embedded PostgREST Joins
- Embed `member_profiles!created_by(username)` and `member_profiles!seller_id(username)` directly into the primary select queries.
- **Trade-offs**: Saves a secondary query but introduces defensive runtime unboxing for PostgREST relation shapes (object vs array) and duplicates fetches when the same actor appears in both tables.

**Decision**: The user selected **Approach 1**.

---

## 5. Detailed Component Changes

### 5.1 Query & Server Mapping (`src/app/(member)/events/[eventId]/dashboard/page.tsx`)
1. Include `created_by` in `event_financial_transactions` select.
2. Include `seller_id` in `event_ticket_sales` select.
3. Collect all unique actor IDs:
   ```ts
   const actorIds = Array.from(
     new Set([
       ...rawTxns.map((t) => t.created_by).filter(Boolean),
       ...allSales.map((s) => s.seller_id).filter(Boolean),
     ])
   );
   ```
4. Query usernames:
   ```ts
   const { data: actorProfiles } = actorIds.length > 0
     ? await supabase.from("member_profiles").select("id, username").in("id", actorIds)
     : { data: [] };
   ```
5. Build `usernameByActorId` map.
6. Populate `authorizedBy`:
   - For `manualTransactions`: `username ? `@${username}` : "@secretariat"`
   - For `saleTransactions`: `username ? `@${username}` : "@secretariat"`
   - `authorizerRole`: `"Recorded"` (or omit subline when handle suffices).

### 5.2 Table Presentation (`src/components/events/dashboard/tab-audit-log.tsx`)
1. Table header:
   ```tsx
   <th className="py-3 px-3.5">Recorded/Auth by</th>
   ```
2. Table cell:
   ```tsx
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

### 5.3 Detail Modal (`src/components/events/dashboard/modals/transaction-detail-modal.tsx`)
1. Header label:
   ```tsx
   <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
     Recorded / Authorized by
   </span>
   <span className="font-mono text-[#3D291F] font-semibold mt-0.5 block">
     {transaction.authorizedBy}
   </span>
   ```

---

## 6. Verification Plan
1. Unit tests:
   - Check `page.tsx` selects `created_by` and `seller_id`.
   - Check `TabAuditLog` header text is `"Recorded/Auth by"`.
   - Check `TransactionDetailModal` label is updated.
2. Run `npm test`.
3. Run `npm run lint`.
4. Run `npm run build`.
