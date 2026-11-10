# Unified Event Dashboard Full Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Unified Event Dashboard prototype across `/events/[eventId]/dashboard` using DM Sans typography, 2-line ledger cards on both mobile and desktop, verified realized accounting totals, inline PDF receipt viewing, and full modal/action reuse without losing any existing workflow or security guard.

**Architecture:** Extract three shared primitives first (`ReceiptPreview`, `LedgerTransactionCard`, `EventAuditTrailList`), then wire server data/permissions and safe `return_to` redirects in `actions.ts` and `dashboard/page.tsx`, then align all five tab views (`Overview`, `Tickets`, `Budget & Streams`, `Ledger`, `Statement & Team`), the header/5-tab shell (`EventDashboardView`), and polished existing modals (`VoucherInspectionDrawer`, `RecordTransactionModal`, `EventCategoryManagementModal`, tier/ceiling/report/void/edit/lifecycle/team-role modals). Update pre-prototype table/layout test assertions while keeping every baseline, security, SoD, and CSP hygiene test green.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase RPCs & SSR, Cloudflare R2 receipt route, `pdfjs-dist`, Lucide icons, Node built-in `node:test`.

**Design Spec:** `docs/superpowers/specs/2026-11-10-event-dashboard-full-prototype-design.md` (commit `235b540` on `feat/event-dashboard-full-prototype`).

---

## Review Focus

These 5 high-risk failure modes receive dedicated assertions and checks in their owning tasks:
1. **CSP-Safe PDF & Image Loading (`Task 2`):** `src/proxy.ts` enforces `worker-src 'self' blob:`, `frame-src 'none'`, `object-src 'none'`, and `/api/receipts/[receiptId]` returns `Content-Disposition: attachment`. `ReceiptPreview` must `fetch` bytes (`Uint8Array` for `pdfjs-dist` with local bundled worker — no `https://unpkg.com` fallback — and `URL.createObjectURL` + `revokeObjectURL` cleanup for images).
2. **Segregation-of-Duties Self-Review Card & Drawer Guard (`Task 2` & `Task 3`):** When `userRole === "executive" && Boolean(currentUserId) && transaction.createdBy === currentUserId` on pending items, `LedgerTransactionCard` must wrap `"Needs Another Officer's Review"` cleanly without horizontal overflow and without a redundant Inspect label, and `VoucherInspectionDrawer` must block self-approval.
3. **Verified-Only Realized Totals vs. Pending Isolation (`Task 4` & `Task 5`):** Realized totals on Overview KPIs, Budget Cash Flow, and Statement P&L must strictly count verified/paid entries (`status === "posted"` AND verified/approved/paid) matching Cost Centers and Revenue Streams, displaying pending inflows/commitments separately in subtitles rather than inflating realized net surplus.
4. **Validated Dashboard `return_to` & `EVENT_FINANCE_TABS` (`Task 1`):** `EVENT_FINANCE_TABS` must include `"ledger"` and `"statement"`; `actions.ts` must accept `return_to` >= 100 chars ONLY when strictly matching `/^\/events\/[0-9a-f-]{36}\/dashboard$/i` (rejecting open redirects/path traversal) and default cleanly to `/events` or `/officers/members` when omitted.
5. **UI Hygiene & Tab-Strip Invariants (`Task 4` & `Task 5`):** Zero inline `style={{...}}` in `src/components/events/dashboard/*` (use `percentWidthClass`), zero `text-[#D6A23A]` in `tab-budget-allocations.tsx` / `tab-reports.tsx`, single `<TableScroll label="Dashboard sections">` tab strip preserving `min-h-[48px]`, `text-sm`, `gap-2 p-1.5 w-max`, `lg:hidden` swipe hint matching `/for more sections/i` and `/Swipe for more/`, and `aria-current`, plus complete `form-control-baseline.test.mjs` modal close-button registration.

---

## File Structure

### New Files
- `src/components/finances/receipt-preview.tsx` — Shared CSP-safe image blob + multi-page `pdfjs-dist` canvas preview with zoom & page controls
- `src/components/events/dashboard/ledger-transaction-card.tsx` — Unified 2-line ledger card used across Overview, Tickets, and Ledger on all viewports
- `src/components/events/dashboard/event-audit-trail-list.tsx` — Shared `audit_log` timeline list reused by Statement & Team and `TabAuditLog`
- `src/components/events/dashboard/modals/event-team-role-modal.tsx` — Assign / Revoke committee & lead role modal wired to `assignEventRoleAction` / `revokeEventRoleAction`
- `tests/event-dashboard-actions-return-to.test.mjs` — Tests for `ledger`/`statement` tab allowlist, `actions.ts` safe dashboard `return_to`, `sha256`, and `page.tsx` role/member wiring

### Modified App / Component Files
- `src/lib/event-finance-tab.mjs`
- `src/app/actions.ts`
- `src/components/events/event-edit-modal.tsx`
- `src/components/events/event-lifecycle-modal.tsx`
- `src/components/events/dashboard/dashboard-types.ts`
- `src/app/(member)/events/[eventId]/dashboard/page.tsx`
- `src/components/finances/receipt-viewer.tsx`
- `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- `src/components/events/dashboard/event-domain-ledger.tsx`
- `src/components/events/dashboard/tab-audit-log.tsx` (extracts `EventAuditTrailList` while preserving legacy Section 1 export contract)
- `src/components/events/dashboard/tab-overview.tsx`
- `src/components/events/dashboard/tab-tickets.tsx`
- `src/components/events/dashboard/tab-budget-allocations.tsx`
- `src/components/events/dashboard/tab-reports.tsx`
- `src/components/events/dashboard/event-dashboard-view.tsx`
- `src/components/events/dashboard/modals/record-transaction-modal.tsx`
- `src/components/events/dashboard/modals/event-category-management-modal.tsx`
- `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`
- `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`
- `src/components/events/dashboard/modals/download-report-modal.tsx`
- `src/components/common/void-record-modal.tsx`

### Updated Test Files
- `tests/event-finance-tab.test.mjs`
- `tests/event-dashboard-receipts.test.mjs`
- `tests/event-voucher-inspection-drawer.test.mjs`
- `tests/event-domain-ledger-ui.test.mjs`
- `tests/ticket-sales-ledger-channels.test.mjs`
- `tests/mobile-transaction-cards.test.mjs`
- `tests/event-tab-tickets-ledger.test.mjs`
- `tests/event-dashboard-mobile-responsive.test.mjs`
- `tests/event-budget-ceiling-ui.test.mjs`
- `tests/event-tab-budget-matrix.test.mjs`
- `tests/mobile-form-safety.test.mjs`
- `tests/form-control-baseline.test.mjs`
- `tests/event-dashboard-mobile-view.test.mjs`
- `tests/event-dashboard-mobile-panel.test.mjs`
- `tests/event-dashboard-unified-redesign.test.mjs`
- `tests/event-finance-workspace.test.mjs`

---

### Task 1: Server Redirects, `EVENT_FINANCE_TABS`, `dashboard-types.ts` & `dashboard/page.tsx` Data Wiring

**Files:**
- Modify: `src/lib/event-finance-tab.mjs`
- Modify: `src/app/actions.ts`
- Modify: `src/components/events/event-edit-modal.tsx`
- Modify: `src/components/events/event-lifecycle-modal.tsx`
- Modify: `src/components/events/dashboard/dashboard-types.ts`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx`
- Test: `tests/event-finance-tab.test.mjs`
- Create: `tests/event-dashboard-actions-return-to.test.mjs`

**Interfaces:**
- Consumes: `getEventCardAccess` from `@/lib/event-card-access.mjs`, `EventRow` from `@/components/events/event-types`
- Produces:
  - `EVENT_FINANCE_TABS` containing `"ledger"` and `"statement"`
  - `DashboardTeamMember` extended with `{ memberId: string; username: string | null; roleKey: string }`
  - `DashboardTicketTier` extended with `{ retiredAt?: string | null }`
  - `DashboardTransaction` extended with `{ tierName?: string }` and `receipt.sha256?: string | null`
  - `DashboardClubMember { id: string; fullName: string; username: string | null }`
  - `EventDashboardView` new optional props: `eventRow?: EventRow`, `canEditEvent?: boolean`, `canManageLifecycle?: boolean`, `canManageTeamRoles?: boolean`, `clubMembers?: DashboardClubMember[]`
  - `EventEditModal` & `EventLifecycleModal` optional `returnTo?: string` prop emitting `<input name="return_to" type="hidden" value={returnTo} />`

- [ ] **Step 1: Write failing tests for `"ledger"`/`"statement"` tabs, safe dashboard `return_to`, `sha256`, and `assistant`/team-role/event props**

Add `"ledger"` and `"statement"` cases to `tests/event-finance-tab.test.mjs`, and create `tests/event-dashboard-actions-return-to.test.mjs` asserting:
1. `actions.ts` allows validated `/events/${eventId}/dashboard` `return_to` paths (>= 100 char limit, exact eventId match, rejects `//evil.com` or `/events/other/dashboard`) and revalidates `` `/events/${eventId}/dashboard` `` across `updateEventDetailsAction`, `assignEventRoleAction`, `revokeEventRoleAction`, `setEventStatusAction`, `reopenEventAction`, and `archiveEventAction`.
2. `page.tsx` selects `sha256` on `finance_receipts`, checks `eventRoles.includes("assistant")`, computes `getEventCardAccess` & `canManageTeamRoles`, queries active `member_profiles` when `canManageTeamRoles` is true, sets `tierName` on `saleTransactions`, and registers `updated`, `completed`, `cancelled`, `reopened`, `archived`, `event-role-assigned`, and `event-role-revoked` in `dashboardNoticeMap`.
3. `event-edit-modal.tsx` and `event-lifecycle-modal.tsx` accept optional `returnTo?: string` and render `<input name="return_to" type="hidden" value={returnTo} />`.

- [ ] **Step 2: Run failing tests to verify RED state**

Run: `node --test tests/event-finance-tab.test.mjs tests/event-dashboard-actions-return-to.test.mjs`
Expected: FAIL on missing `"ledger"`/`"statement"` normalization, missing `return_to` dashboard handling, and missing `page.tsx` fields.

- [ ] **Step 3: Implement tab allowlist, action `return_to` + `revalidatePath`, modal `returnTo`, types, and `dashboard/page.tsx` queries**

- In `src/lib/event-finance-tab.mjs`: add `"ledger"` and `"statement"` to `EVENT_FINANCE_TABS`.
- In `src/app/actions.ts`: add a helper `optionalDashboardReturnUrl(formData, eventId, notice, fallbackUrl)` that reads `optionalEventText(formData, "return_to", 120)` and returns `/events/${eventId}/dashboard?${new URLSearchParams({ notice }).toString()}` ONLY when `returnTo === \`/events/${eventId}/dashboard\``. Allow `"return_to"` in `eventFieldsOnly` and call `revalidatePath(\`/events/${eventId}/dashboard\`)` inside `updateEventDetailsAction`, `setEventStatusAction`, `reopenEventAction`, `archiveEventAction`, `assignEventRoleAction`, and `revokeEventRoleAction` (raising `optionalEventText` limit from `40` to `120` in `assignEventRoleAction` / `revokeEventRoleAction`, while preserving `"officer-members"` and `/events` defaults when omitted).
- In `src/components/events/event-edit-modal.tsx` and `src/components/events/event-lifecycle-modal.tsx`: add optional `returnTo?: string` prop and conditionally render `<input name="return_to" type="hidden" value={returnTo} />`.
- In `src/components/events/dashboard/dashboard-types.ts`: update `DashboardReceiptInfo` (`sha256?: string | null`), `DashboardTransaction` (`tierName?: string`), `DashboardTicketTier` (`retiredAt?: string | null`), `DashboardTeamMember` (`memberId?: string`, `username?: string | null`, `roleKey?: string`), `DashboardEventInfo` (`ticketingEnabled?: boolean`, `durationDays?: number`), and export `DashboardClubMember`.
- In `src/app/(member)/events/[eventId]/dashboard/page.tsx`:
  - Expand `events` `.select(...)` to also fetch `duration_days, timezone, created_at` if missing for `EventRow`.
  - Include `sha256` in both `finance_receipts` queries and receipt maps.
  - Check `eventRoles.includes("assistant")` alongside `lead`/`event_lead` in `isEventLead`; compute `{ canEdit, canSetStatus, canReopen }` via `getEventCardAccess`; compute `canManageTeamRoles = isAdmin || isExecutive` while `isMutableEvent` is true.
  - When `canManageTeamRoles`, query active `member_profiles` (`status = 'active'`) ordered by `full_name` and map `DashboardClubMember[]`.
  - Populate `memberId`, `username`, `roleKey` on `teamMembers`, populate `tierName` on `saleTransactions`, add the 7 lifecycle/role/edit notices into `dashboardNoticeMap`, and pass the new props to `<EventDashboardView />`.

- [ ] **Step 4: Run tests and verify GREEN state**

Run: `node --test tests/event-finance-tab.test.mjs tests/event-dashboard-actions-return-to.test.mjs`
Expected: PASS (0 failures). Also run `node --test tests/event-card-access.test.mjs tests/ticket-sales-ledger-channels.test.mjs` to ensure zero regression on existing access/channel contracts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/event-finance-tab.mjs src/app/actions.ts src/components/events/event-edit-modal.tsx src/components/events/event-lifecycle-modal.tsx src/components/events/dashboard/dashboard-types.ts "src/app/(member)/events/[eventId]/dashboard/page.tsx" tests/event-finance-tab.test.mjs tests/event-dashboard-actions-return-to.test.mjs
git commit -m "feat(dashboard): wire verified return_to redirects, sha256 receipts, and team role/event metadata"
```

---

### Task 2: CSP-Safe `ReceiptPreview` (Images & Multi-Page PDF Canvas) + `ReceiptViewerModal` & `VoucherInspectionDrawer`

**Files:**
- Create: `src/components/finances/receipt-preview.tsx`
- Modify: `src/components/finances/receipt-viewer.tsx`
- Modify: `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- Test: `tests/event-dashboard-receipts.test.mjs`
- Test: `tests/event-voucher-inspection-drawer.test.mjs`

**Interfaces:**
- Produces:
  - `ReceiptPreviewProps { receiptId: string; fileName: string; contentType: string; sha256?: string | null; compact?: boolean; className?: string }`
  - `ReceiptPreview(props: ReceiptPreviewProps)`

- [ ] **Step 1: Write failing tests in `tests/event-dashboard-receipts.test.mjs` and `tests/event-voucher-inspection-drawer.test.mjs`**

Assert:
1. `src/components/finances/receipt-preview.tsx` fetches `/api/receipts/...` with `fetch`, uses `URL.createObjectURL` + `revokeObjectURL` cleanup for `image/*`, uses `arrayBuffer()` -> `Uint8Array` passed to `pdfjs.getDocument({ data })`, configures local `pdfjs.GlobalWorkerOptions.workerSrc` with `import.meta.url` (MUST NOT reference `unpkg.com` or `<iframe`), and provides `Zoom`, `Page`, and Download controls (`min-h-[44px]`).
2. `src/components/events/dashboard/voucher-inspection-drawer.tsx` imports and renders `<ReceiptPreview` inline (removing static `"Open PDF in New Tab"`-only placeholder and raw `<img src={receiptUrl}>`), preserves `isExecutiveSelfReview`, Approve actions, `VoidRecordModal` -> `onVoidRecord`, `"Pending"` status wording (when displaying pending pill/badge), and has zero inline `style={{...}}`.

- [ ] **Step 2: Run failing tests to verify RED state**

Run: `node --test tests/event-dashboard-receipts.test.mjs tests/event-voucher-inspection-drawer.test.mjs`
Expected: FAIL because `receipt-preview.tsx` does not exist and `voucher-inspection-drawer.tsx` uses static PDF placeholder / raw `<img>`.

- [ ] **Step 3: Implement `ReceiptPreview`, refactor `ReceiptViewerModal`, and upgrade `VoucherInspectionDrawer`**

- Create `src/components/finances/receipt-preview.tsx`: implement image blob fetch (`URL.createObjectURL` with effect cleanup), `pdfjs-dist` dynamic import (`arrayBuffer()` -> `new Uint8Array(buffer)` -> `pdfjs.getDocument({ data })`, local worker `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()` — zero external CDN URLs), `<canvas>` rendering, `Page X of Y` Prev/Next buttons, `Zoom - / +` (0.5 to 2.0), Download `<a download>`, optional `sha256` short badge, loading spinner, and error retry state. Zero `style={{...}}` (use Tailwind utilities).
- Refactor `src/components/finances/receipt-viewer.tsx`: render `<ReceiptPreview>` inside modal body while keeping `aria-label="Close receipt viewer"`, `role="dialog"`, `aria-modal="true"`, Escape dismissal, and bottom-sheet responsive styling intact.
- Update `src/components/events/dashboard/voucher-inspection-drawer.tsx`:
  - Replace raw `<img>` / static PDF box with an expandable/default-open inline `<ReceiptPreview compact sha256={transaction.receipt.sha256} ... />` section inside the warm canvas Receipt panel.
  - Polish header (`#ref`, status pill using `"Pending"` / `"Approved"` / `"Voided"`, title), prominent Naira summary card, reversal reason box, metadata card (`Counterparty`, `Method`, `Channel`, `Recorded By`, R2 SHA-256 metadata), SoD `isExecutiveSelfReview` guard (`"Needs Another Officer's Review"`), Approve button (`verifyEventTicketSaleAction` / `verifyEventFinancialTransactionAction`), and `"Reverse / Void Entry"` invoking `handleInitiateVoid`. Keep DM Sans typography and zero `style={{}}`.

- [ ] **Step 4: Run tests to verify PASS**

Run: `node --test tests/event-dashboard-receipts.test.mjs tests/event-voucher-inspection-drawer.test.mjs tests/unified-void-ui-integration.test.mjs tests/event-dashboard-ui-hygiene.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/receipt-preview.tsx src/components/finances/receipt-viewer.tsx src/components/events/dashboard/voucher-inspection-drawer.tsx tests/event-dashboard-receipts.test.mjs tests/event-voucher-inspection-drawer.test.mjs
git commit -m "feat(receipts): extract CSP-safe ReceiptPreview with inline PDF canvas and upgrade VoucherInspectionDrawer"
```

---

### Task 3: Extract `LedgerTransactionCard` & `EventAuditTrailList` + Rewrite `EventDomainLedger` (2-Line Cards Everywhere)

**Files:**
- Create: `src/components/events/dashboard/ledger-transaction-card.tsx`
- Create: `src/components/events/dashboard/event-audit-trail-list.tsx`
- Modify: `src/components/events/dashboard/tab-audit-log.tsx`
- Modify: `src/components/events/dashboard/event-domain-ledger.tsx`
- Test: `tests/event-domain-ledger-ui.test.mjs`
- Test: `tests/ticket-sales-ledger-channels.test.mjs`
- Test: `tests/mobile-transaction-cards.test.mjs`
- Test: `tests/event-audit-log-ui.test.mjs`

**Interfaces:**
- Produces:
  - `LedgerTransactionCardProps { transaction: DashboardTransaction; onSelect: (tx: DashboardTransaction) => void; currentUserId?: string; userRole?: string }`
  - `LedgerTransactionCard(props: LedgerTransactionCardProps)`
  - `EventAuditTrailListProps { activityLogs: ActivityLogItem[] }`
  - `EventAuditTrailList(props: EventAuditTrailListProps)`
  - `EventDomainLedgerProps` updated to accept optional `costCenters?: DashboardCostCenter[]`, `revenueStreams?: DashboardRevenueStream[]`, `ticketTiers?: DashboardTicketTier[]`, `onResetFilters?: () => void`, `onExportCsv?: () => void`, plus existing filter props (`initialTypeFilter`, `initialCategoryFilter`, `initialStatusFilter`)

- [ ] **Step 1: Update `tests/event-domain-ledger-ui.test.mjs`, `tests/ticket-sales-ledger-channels.test.mjs`, and `event-domain-ledger` assertions in `tests/mobile-transaction-cards.test.mjs` to test the 2-line card specification & grouped filters**

Update assertions to expect:
1. `LedgerTransactionCard`: full-card `<button type="button">` (`min-h-[44px]`), 2-line anatomy (`Line 1` status dot + bold description + `sm:inline` counterparty + tabular mono amount; `Line 2` category/tier/channel + mobile counterparty + date + paperclip receipt + `"Pending"` concise status text + wrapped `"Needs Another Officer's Review"` with `whitespace-normal` when `isExecutive && isSelfReview` and no `"Inspect"` text shown), zero inline `style={{...}}`.
2. `EventDomainLedger`: uses `<LedgerTransactionCard>` across both mobile and desktop viewports (no desktop `<table>`), keeps `PAGE_SIZE = 20` + `slice(startIndex, endIndex)`, `channelFilter` (`All Channels`, `Member Sales`, `Online Sales`), grouped category `<select>` (`Ticket Tiers`, `Revenue Streams`, `Expense Cost Centers`) + `Reset` button (`min-h-[44px]`), `"Pending"` / `"Approved"` / `"Reversed / Voided"` status pills, and Net Verified summary bar.
3. Preserve all non-ledger checks (`tabAuditLog`, `tabRevenue`, `tabExpenses`, `clubLedger`, `attendanceRoster`) in `tests/mobile-transaction-cards.test.mjs`.

- [ ] **Step 2: Run failing tests to verify RED state**

Run: `node --test tests/event-domain-ledger-ui.test.mjs tests/ticket-sales-ledger-channels.test.mjs tests/mobile-transaction-cards.test.mjs`
Expected: FAIL because `ledger-transaction-card.tsx` does not exist yet and `event-domain-ledger.tsx` still renders a desktop `<table>`.

- [ ] **Step 3: Implement `LedgerTransactionCard`, `EventAuditTrailList`, `TabAuditLog` reuse, and updated `EventDomainLedger`**

- Create `src/components/events/dashboard/ledger-transaction-card.tsx` matching exact 2-line anatomy, SoD wrapped indicator (`"Needs Another Officer's Review"`, hiding any Inspect label), `"Pending"` label on pending items, accessible contrast (`#8D5B0E` pending, `#174C37` approved, `#BA3C2A` voided/expense), and full-card click opening `onSelect(transaction)`.
- Create `src/components/events/dashboard/event-audit-trail-list.tsx` extracting Section 2 (`activityLogs` timeline cards) cleanly from `tab-audit-log.tsx`, and import it inside `tab-audit-log.tsx` without altering `tab-audit-log.tsx`'s Section 1 table (`Recorded By`, `txn.paymentRef || txn.id.slice(0, 8)`).
- Update `src/components/events/dashboard/event-domain-ledger.tsx`:
  - Render Filter Header Card (`Search` + grouped `<select aria-label="Filter by category">` with dynamic `Ticket Tiers` / `Revenue Streams` / `Expense Cost Centers` `<optgroup>`s + `Reset` button).
  - Keep Domain filter chips, Status filter chips (`All Status`, `Approved`, `Pending`, `Reversed / Voided`), and Ticket Channel chips (`All Channels`, `Member Sales`, `Online Sales`) when `domain === "tickets"`.
  - Render `Showing X of Y transactions` + `Net Verified: +/-₦...` bar above `<LedgerTransactionCard>` stack on ALL viewports (zero `<table>` inside `EventDomainLedger`), retaining `PAGE_SIZE = 20` pagination controls (`min-h-[44px]`) and CSV Export. Note: for Ticket Tiers filtering, match `t.tierName === cat` OR `t.categoryLabel === cat` OR `t.category === cat` cleanly!

- [ ] **Step 4: Run tests to verify PASS**

Run: `node --test tests/event-domain-ledger-ui.test.mjs tests/ticket-sales-ledger-channels.test.mjs tests/mobile-transaction-cards.test.mjs tests/event-audit-log-ui.test.mjs tests/event-dashboard-ui-hygiene.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/ledger-transaction-card.tsx src/components/events/dashboard/event-audit-trail-list.tsx src/components/events/dashboard/tab-audit-log.tsx src/components/events/dashboard/event-domain-ledger.tsx tests/event-domain-ledger-ui.test.mjs tests/ticket-sales-ledger-channels.test.mjs tests/mobile-transaction-cards.test.mjs
git commit -m "feat(ledger): extract 2-line LedgerTransactionCard and EventAuditTrailList across mobile and desktop"
```

---

### Task 4: Align `TabOverview`, `TabTickets`, `TabBudgetAllocations`, `TabReports` (+ `EventTeamRoleModal`) & Update Tab Tests

**Files:**
- Create: `src/components/events/dashboard/modals/event-team-role-modal.tsx`
- Modify: `src/components/events/dashboard/tab-overview.tsx`
- Modify: `src/components/events/dashboard/tab-tickets.tsx`
- Modify: `src/components/events/dashboard/tab-budget-allocations.tsx`
- Modify: `src/components/events/dashboard/tab-reports.tsx`
- Test Updates:
  - `tests/event-tab-tickets-ledger.test.mjs`
  - `tests/mobile-transaction-cards.test.mjs` (update `tabTickets` block only)
  - `tests/event-dashboard-mobile-responsive.test.mjs`
  - `tests/event-budget-ceiling-ui.test.mjs`
  - `tests/event-tab-budget-matrix.test.mjs`
  - `tests/mobile-form-safety.test.mjs`
  - `tests/form-control-baseline.test.mjs` (register `event-team-role-modal.tsx` in modal close-button list)

**Interfaces:**
- Produces:
  - `EventTeamRoleModal({ isOpen, onClose, eventId, eventTitle, clubMembers, existingMemberIds, mode, targetMember, returnTo }: EventTeamRoleModalProps)`
  - `TabOverview` props accepting verified metrics (`verifiedTicketRevenue`, `verifiedRevenue`, `verifiedExpenses`, `pendingRevenue`, `pendingExpenses`, `pendingTicketsCount`, `committedExpenses`) + `onSelectTab`, `onNavigateBudgetSubTab`, `onJumpToLedger`, `onManageAllocations`, `onOpenBudgetCeilingModal`, `onInspectTransaction`
  - `TabTickets` rendering tier cards grid (`md:grid-cols-2 lg:grid-cols-3`, NO per-tier `"Sales (N)"` button, keeping `id="btn-add-ticket-tier"`, `id="btn-create-tier-empty"`, `id="btn-edit-tier-*"`, `id="btn-retire-tier-*"`) + `<EventDomainLedger domain="tickets" ... />`
  - `TabBudgetAllocations` keeping sub-tab labels (`"Spending"`, `"Revenue Mix"`, `"Cash Flow"`), using `"Edit Budget"` + `id="btn-manage-budget-categories"`, mobile cost-center cards + `<TableScroll>` desktop cost-center matrix, revenue streams card grid, and real live cash-flow summary
  - `TabReports` rendering Section A (`Event Committee & Leads` + `+ Assign Team Member` / `Revoke` buttons), Section B (`Official Reconciled Income Statement` with PDF/CSV actions, Carpenters Family letterhead, 4-metric KPI strip using verified totals, `divide-y` line-item revenue/expense breakdown rows, live verification sign-off status), and Section C (collapsible `System Audit Trail` rendering `<EventAuditTrailList>`)

- [ ] **Step 1: Write/update failing test expectations across all 4 tab tests and register `event-team-role-modal.tsx` in `form-control-baseline.test.mjs`**

Update assertions in:
- `tests/event-tab-tickets-ledger.test.mjs` & `tests/mobile-transaction-cards.test.mjs` (`tabTickets` block): verify `md:grid-cols-2 lg:grid-cols-3` tier cards grid across all viewports, absence of `"Sales ("` button on tier cards, preserved `btn-add-ticket-tier` / `btn-create-tier-empty` / `btn-edit-tier-` / `btn-retire-tier-`, and `<EventDomainLedger domain="tickets" ... />`.
- `tests/event-budget-ceiling-ui.test.mjs` & `tests/event-dashboard-mobile-responsive.test.mjs`: assert `"Edit Budget"`, preserved `"Spending"` / `"Revenue Mix"` / `"Cash Flow"` sub-tabs, `"Manage Categories"` (`id="btn-manage-budget-categories"`), `md:hidden` mobile cards + `hidden md:block` desktop `<TableScroll>` matrix on Budget & Streams, and responsive DM Sans breakdown rows on `TabReports`.
- `tests/event-tab-budget-matrix.test.mjs`: align with Cost Center Allocation Matrix & responsive table/card presentation.
- `tests/mobile-form-safety.test.mjs`: update line 59 assertion to match the prototype `lg:col-span-7` 2×2 KPI grid (`grid grid-cols-2 gap-2.5`) inside the `lg:grid-cols-12` Overview top section.
- `tests/form-control-baseline.test.mjs`: add `"src/components/events/dashboard/modals/event-team-role-modal.tsx"` to `PHASE1_CLOSE_BUTTON_FILES` so `"Close dialog"` hygiene is strictly enforced on the new modal too.

- [ ] **Step 2: Run failing tests to verify RED state**

Run: `node --test tests/event-tab-tickets-ledger.test.mjs tests/event-dashboard-mobile-responsive.test.mjs tests/event-budget-ceiling-ui.test.mjs tests/event-tab-budget-matrix.test.mjs tests/mobile-form-safety.test.mjs`
Expected: FAIL before implementation changes.

- [ ] **Step 3: Implement `EventTeamRoleModal` and align `TabOverview`, `TabTickets`, `TabBudgetAllocations`, and `TabReports`**

- Create `src/components/events/dashboard/modals/event-team-role-modal.tsx`:
  - Warm bottom-sheet layout (`items-end justify-center p-0 sm:p-4 sm:items-center` + `rounded-t-2xl sm:rounded-2xl`), `useModalHygiene`, `role="dialog"`, `aria-modal="true"`, `aria-label="Close dialog"` (`min-h-[44px] min-w-[44px]`), DM Sans typography.
  - Supports `mode === "assign"` (`assignEventRoleAction` with member `<select>` filtered cleanly, `event_role` `<select>` `lead | assistant | committee`, mandatory `reason`, hidden `event_id` + `return_to`) and `mode === "revoke"` (`revokeEventRoleAction` with `member_id`, member summary, mandatory `reason`, hidden `return_to`).
- Update `src/components/events/dashboard/tab-overview.tsx`:
  - Over-budget banner (`remainingBudget < 0`), `lg:grid-cols-12` top split (`lg:col-span-7` 2×2 interactive KPI buttons + `lg:col-span-5` Approved Budget Ceiling card with `percentWidthClass`), `lg:grid-cols-2` middle split (`Active Cost Centers` top 4 + `Ticket Inventory Pulse` + Committee footer), and `Recent Ledger Activity` rendered via `<LedgerTransactionCard>`. Real data only (no mock synced copy!).
- Update `src/components/events/dashboard/tab-tickets.tsx`:
  - Top Box Office Summary Card (`Verified Ticket Revenue`, `Total Passes Sold`, `Capacity Mix` bar using `percentWidthClass`), officers `btn-add-ticket-tier` & `+ Record Ticket Sale`.
  - Tier Cards Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`) with price, capacity progress, `Tier Revenue`, and officer `btn-edit-tier-*` / `btn-retire-tier-*` (NO per-tier `"Sales (N)"` button per user decision). Keep empty-state CTA `id="btn-create-tier-empty"`.
  - Embed `<EventDomainLedger domain="tickets" ... />` using 2-line `<LedgerTransactionCard>` stack on both mobile & desktop.
- Update `src/components/events/dashboard/tab-budget-allocations.tsx`:
  - Header with `"Edit Budget"`, `id="btn-manage-budget-categories"` (`Manage Categories`), contextual `+ Record Expense` / `+ Record Revenue`, sub-tabs `"Spending"`, `"Revenue Mix"`, `"Cash Flow"`, and allocation headroom line.
  - `Spending`: mobile cost-center cards (`md:hidden`) + desktop `<TableScroll>` matrix (`hidden md:block`); click row jumps to Ledger filtered to `expenses` + category.
  - `Revenue Mix`: reconciled verified inflows banner + responsive stream card grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`); click jumps to Ledger.
  - `Cash Flow`: 3-card live verified inflows / verified outflows / net position (`#0C3325` using `#FAF6F0` / `#F0C768`, ZERO `text-[#D6A23A]`) + live verified vs pending/committed breakdown. Zero inline `style={{}}`.
- Update `src/components/events/dashboard/tab-reports.tsx`:
  - Section A: Committee & Leads monogram cards (`grid-cols-1 md:grid-cols-2`) + `+ Assign Team Member` / `Revoke` buttons gated by `canManageTeamRoles`.
  - Section B: Reconciled Income Statement (Print/PDF + Export CSV actions, letterhead, real reconciliation state derived from `pendingTransactionsCount === 0`, 4-metric KPI strip using verified totals, `divide-y` Revenue & Expenses breakdown rows, real verification/sign-off status card — zero `text-[#D6A23A]`, zero `style={{}}`).
  - Section C: Collapsible `System Audit Trail` displaying `<EventAuditTrailList activityLogs={activityLogs} />`.

- [ ] **Step 4: Run tests to verify PASS**

Run: `node --test tests/event-tab-tickets-ledger.test.mjs tests/mobile-transaction-cards.test.mjs tests/event-dashboard-mobile-responsive.test.mjs tests/event-budget-ceiling-ui.test.mjs tests/event-tab-budget-matrix.test.mjs tests/mobile-form-safety.test.mjs tests/form-control-baseline.test.mjs tests/event-dashboard-ui-hygiene.test.mjs tests/event-ticket-tier-ui.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/modals/event-team-role-modal.tsx src/components/events/dashboard/tab-overview.tsx src/components/events/dashboard/tab-tickets.tsx src/components/events/dashboard/tab-budget-allocations.tsx src/components/events/dashboard/tab-reports.tsx tests/event-tab-tickets-ledger.test.mjs tests/mobile-transaction-cards.test.mjs tests/event-dashboard-mobile-responsive.test.mjs tests/event-budget-ceiling-ui.test.mjs tests/event-tab-budget-matrix.test.mjs tests/mobile-form-safety.test.mjs tests/form-control-baseline.test.mjs
git commit -m "feat(dashboard): align Overview, Tickets, Budget, and Statement/Team tabs with prototype and 2-line cards"
```

---

### Task 5: Polish & Wire `EventDashboardView` Spotlight Header, Sticky 5-Tab Strip, Verified Metrics & Existing Modals

**Files:**
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx`
- Modify: `src/components/events/dashboard/modals/record-transaction-modal.tsx`
- Modify: `src/components/events/dashboard/modals/event-category-management-modal.tsx`
- Modify: `src/components/events/dashboard/modals/event-ticket-tier-modal.tsx`
- Modify: `src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx`
- Modify: `src/components/events/dashboard/modals/download-report-modal.tsx`
- Modify: `src/components/common/void-record-modal.tsx`
- Test Updates:
  - `tests/event-dashboard-mobile-view.test.mjs`
  - `tests/event-dashboard-mobile-panel.test.mjs`
  - `tests/event-dashboard-unified-redesign.test.mjs`
  - `tests/event-finance-workspace.test.mjs`

**Interfaces:**
- Consumes: `LedgerTransactionCard`, `VoucherInspectionDrawer`, `EventEditModal`, `EventLifecycleModal`, `EventTeamRoleModal`, `RecordTransactionModal`, `EventCategoryManagementModal`, `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, `VoidRecordModal`, `TableScroll`
- Produces:
  - `EventDashboardView` with unified spotlight header (`<- Events`, Status pill, `"Event info"` disclosure, `Download Report`, `+ Record Entry`, `Edit Event`), single sticky `<TableScroll label="Dashboard sections">` 5-tab bar preserving all `tests/dashboard-tab-strip.test.mjs` invariants, and verified realized metric calculation passed down cleanly to tabs.
  - `EventCategoryManagementModal` extended with optional `onSwitchCategoryType?: (type: "expense" | "budget_allocation" | "revenue") => void` prop so officers can switch category catalogs cleanly inside the single polished modal.

- [ ] **Step 1: Update `tests/event-dashboard-mobile-view.test.mjs`, `tests/event-dashboard-mobile-panel.test.mjs`, `tests/event-dashboard-unified-redesign.test.mjs`, and `tests/event-finance-workspace.test.mjs`**

Read lines 1-100 of `tests/event-dashboard-mobile-panel.test.mjs` & `tests/event-finance-workspace.test.mjs` if not already known in context, and update legacy assertions where the duplicated mobile `"Quick Actions"` heading / duplicate nav strip were intentionally removed in favor of the prototype's single responsive spotlight header + `<TableScroll label="Dashboard sections">` 5-tab bar. Keep ALL `tests/dashboard-tab-strip.test.mjs` assertions (especially `"Swipe for more sections"` at `lg:hidden`, `min-h-[48px] text-sm`, `gap-2 p-1.5 w-max`, single static `min-h-*` `>= 44px` on every interactive element in `event-dashboard-view.tsx`, `aria-current`) untouched!

- [ ] **Step 2: Run failing tests to verify RED state**

Run: `node --test tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-mobile-panel.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/event-finance-workspace.test.mjs tests/dashboard-tab-strip.test.mjs`
Expected: FAIL on updated unified header / verified accounting assertions before updating `event-dashboard-view.tsx`.

- [ ] **Step 3: Implement `EventDashboardView` shell + verified calculations + existing modal polish**

- In `src/components/events/dashboard/event-dashboard-view.tsx`:
  - Replace the multi-row legacy header & separate `"Quick Actions"` mobile block with the prototype's compact DM Sans spotlight header card (`h-1 bg-[#174C37]` accent line, top breadcrumb + status pill + `"Event info"` disclosure, main row with title/schedule/venue + responsive `Download Report` / `+ Record Entry` / `Edit Event` buttons each carrying static `min-h-[44px]`). Inside expanded `Event info`, show real Accounting Ref, duration/WAT, conditional `/tickets?view=public`, conditional `/meeting-hub?event=${event.id}`, real `description`, plus officer/lead Edit & Lifecycle controls (`Complete`, `Cancel`, `Reopen Planning`, `Archive`) opening reused `EventEditModal` & `EventLifecycleModal` with `returnTo={`/events/${event.id}/dashboard`}`.
  - Remove duplicated tab strip and render the single sticky 5-tab bar (`#FAF6F0`, `border-b border-[#E5DDD3]`) wrapping `tabs.map(...)` inside `<TableScroll label="Dashboard sections">`, with `lg:hidden` swipe hint `"Workspace Sections · Swipe for more sections →"`, `gap-2 p-1.5 w-max` container, and `min-h-[48px] text-sm` `tab-btn-*` buttons (`aria-current`, `#174C37` active / `#5C4638` inactive, ticket sold badge, over-budget dot, ledger count badge). Ensure EVERY `<button|Link|input|select|textarea|a>` inside `event-dashboard-view.tsx` has ONE explicit static `min-h-[44px]`/`48px` className token (critical for `tests/dashboard-tab-strip.test.mjs`!).
  - Compute **verified-only** realized metrics (`verifiedTicketRevenue` from unrefunded approved ticket sales / posted verified ticket transactions, `verifiedRevenue` from approved/paid income + verified ticket revenue, `verifiedExpenses` from paid + non-rejected/non-voided expenses) and pending counts (`pendingRevenue`, `pendingExpenses`, `pendingTicketsCount`), driving `isOverBudget = event.budgetCeiling > 0 && verifiedExpenses > event.budgetCeiling`, and pass cleanly to `TabOverview`, `TabTickets`, `TabBudgetAllocations`, `TabReports`, and `EventDomainLedger`.
  - Wire `EventTeamRoleModal` for `+ Assign Team Member` and member `Revoke` on `Statement & Team`.
  - Pass `onSwitchCategoryType={setCategoryModalType}` to `<EventCategoryManagementModal>` so switching between Budget Allocations, Revenue Categories, and Expense Categories works seamlessly inside the modal.
- Polish existing modals (`record-transaction-modal.tsx`, `event-category-management-modal.tsx`, `event-ticket-tier-modal.tsx`, `event-budget-ceiling-modal.tsx`, `download-report-modal.tsx`, `void-record-modal.tsx`) in-place on DM Sans + warm canvas `#FAF6F0`/white/`#E5DDD3`/`#174C37` surfaces, keeping all existing form fields, server actions, bottom-sheet classes (`items-end justify-center p-0 sm:p-4 sm:items-center`, `rounded-t-2xl sm:rounded-2xl`), and `aria-label="Close dialog"` tap targets intact.

- [ ] **Step 4: Run tests to verify PASS**

Run: `node --test tests/dashboard-tab-strip.test.mjs tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-mobile-panel.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/event-finance-workspace.test.mjs tests/form-control-baseline.test.mjs tests/event-dashboard-ui-hygiene.test.mjs tests/mobile-modal-bottom-sheets.test.mjs tests/unified-void-ui-integration.test.mjs`
Expected: PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add src/components/events/dashboard/event-dashboard-view.tsx src/components/events/dashboard/modals/ src/components/common/void-record-modal.tsx tests/event-dashboard-mobile-view.test.mjs tests/event-dashboard-mobile-panel.test.mjs tests/event-dashboard-unified-redesign.test.mjs tests/event-finance-workspace.test.mjs
git commit -m "feat(dashboard): unify spotlight header, sticky 5-tab bar, verified accounting totals, and polished modal reuse"
```

---

### Task 6: Full Automated Verification, Typecheck, Production Build & Multi-Viewport Browser Visual Audit

**Files:**
- Verification across all files touched in Tasks 1–5 (no skipped tests, no relaxed assertions).

- [ ] **Step 1: Run complete repository test suite, linter, TypeScript check, and production build**

Run sequentially:
1. `npm test` (must pass ALL repository tests with 0 failures & 0 skipped tests)
2. `npm run lint` (or `npx biome check` / repo linter script)
3. `npx tsc --noEmit`
4. `npm run build`

Fix any issues using root-cause fixes + RED -> GREEN verification cleanly.

- [ ] **Step 2: Responsive Layout & Interactive Verification across all 9 required viewports**

Inspect rendered dashboard layout, overflow (`document.documentElement.scrollWidth <= window.innerWidth`), 2-line ledger card wrap behavior (including SoD `"Needs Another Officer's Review"`), modal ergonomics, and inline PDF rendering across:
`320px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1280px`, `1440px`, and `1920px` (via local Next.js server + Playwright / headless Chromium harness if available; document exact verified coverage honestly).

- [ ] **Step 3: Fresh Whole-Branch Code Review**

Dispatch a fresh review subagent to audit the full diff against `docs/superpowers/specs/2026-11-10-event-dashboard-full-prototype-design.md`, `DESIGN.md`, and security/CSP/SoD rules, resolving any Critical or Important issues before presenting the finished branch to the user for push/merge approval.

---

## Plan Self-Review

- **Spec Coverage:** Every requirement in `2026-11-10-event-dashboard-full-prototype-design.md` maps directly to a task: Task 1 (tabs allowlist, `actions.ts` `return_to`, `page.tsx` queries & permissions), Task 2 (`ReceiptPreview` PDF/image canvas & `VoucherInspectionDrawer`), Task 3 (`LedgerTransactionCard` 2-line card everywhere, `EventAuditTrailList`, `EventDomainLedger`), Task 4 (all 4 content tabs + `EventTeamRoleModal` + legacy structural test alignment), Task 5 (`EventDashboardView` header/tab-bar + verified KPI totals + modal reuse/polish), Task 6 (full build, full test suite, viewport audit, final branch review).
- **Type & Symbol Consistency:** Verified exact naming across neighboring tasks (`ReceiptPreview`, `LedgerTransactionCard`, `EventAuditTrailList`, `EventTeamRoleModal`, `DashboardClubMember`, `verifiedTicketRevenue`, `verifiedRevenue`, `verifiedExpenses`, `returnTo`).
- **Proportion:** Plan specifies interfaces, exact constraints, and test gates without writing implementation code blocks verbatim.
