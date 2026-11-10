# Unified Event Dashboard Full Prototype Implementation Design

**Date:** 2026-11-10
**Status:** Ready for Approval (Builder Check Completed)
**Branch:** `feat/event-dashboard-full-prototype` (not pushed until implementation complete & approved)
**Reference Prototype:** Approved `carpenters_family_unified_event_dashboard_html.html` + Desktop/Mobile walkthrough video (`media_1794284993147_2783c72b.mp4`)

---

## 1. Intent & Goals

Translate the approved Carpenters Family Unified Event Dashboard HTML prototype and mobile/desktop video walkthrough into the production Next.js event dashboard (`/events/[eventId]/dashboard`) without losing any backend workflow, permission check, accounting rule, or design-system invariant.

Specifically:
1. **Visual & Interactive Fidelity:** Match the prototype's layout hierarchy, warm-canvas palette (`#FAF6F0`, `#FFFFFF`, `#E5DDD3` borders, `#3D291F` espresso text, `#174C37` / `#0C3325` forest emerald, `#BA3C2A` terracotta), compact spotlight header, sticky 5-tab bar, and modal ergonomics across 320px through 1920px viewports—while strictly honoring `DESIGN.md`'s **DM Sans** typography rule across Operate surfaces (`DM Sans` + `IBM Plex Sans` for tabular `₦` numerals).
2. **2-Line Ledger Cards Everywhere:** Replace legacy multi-column desktop transaction tables in Overview, Tickets Sales Records, and the Unified Ledger with the prototype's 2-line interactive ledger card on **both mobile and desktop** viewports.
3. **Verified Realized Accounting Totals:** Standardize Overview KPIs, Budget/Cash Flow Summary, and Statement P&L on **verified / paid** inflows & outflows as the realized headline figures, with pending inflows and pending expense commitments shown clearly in secondary labels rather than inflating realized totals.
4. **Reuse & Polish Existing Modals (Never Recreate):** Keep and visually polish `VoucherInspectionDrawer` ("Transaction & Receipt Review"), `RecordTransactionModal`, `EventCategoryManagementModal`, `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, `VoidRecordModal`, `EventEditModal`, and `EventLifecycleModal`.
5. **Inline PDF Receipt Rendering:** Upgrade `VoucherInspectionDrawer` so PDF receipts uploaded to R2 render inline via `pdfjs-dist` `<canvas>` with page navigation and zoom controls—reusing a shared `ReceiptPreview` engine extracted from `ReceiptViewerModal`—instead of showing a static external link.
6. **Preserve 100% of Real Backend Functionality:** Maintain Supabase live queries, Executive Segregation-of-Duties (`Needs Another Officer's Review`), Unified Void (`voidRecordAction` with mandatory audit reason), R2 SHA-256 receipt integrity, per-type category management (`budget_allocation`, `expense`, `revenue`), event details/lifecycle management, team role assignments (`assignEventRoleAction` / `revokeEventRoleAction`), system `audit_log` trail, and officer/role gates.

---

## 2. Non-Goals & Anti-Goals

- **No Serif Drift on Operate UI:** Per `DESIGN.md` and explicit user decision, keep **DM Sans** (`font-sans`) + tabular `IBM Plex Sans` across all Operate dashboard headings, KPI numbers, and modals (do **not** apply `Fraunces` / `font-serif` on dashboard Operate surfaces).
- **No Mock or Synthetic UI Content:** Never copy static placeholder labels, fake balances, hardcoded checkmarks, fake Phase 1–4 timelines, or prototype-only toggles (`viewportSwitcher`, `scenarioSwitcher`, `"Shared Club & Event Balance Synced"` static copy) into production components.
- **No Duplicate Parallel Modals:** Do not replace or duplicate `RecordTransactionModal`, `VoidRecordModal`, `EventCategoryManagementModal`, `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, or `VoucherInspectionDrawer`.
- **No Inline `style={{...}}` Props:** Zero `style={{...}}` attributes anywhere under `src/components/events/dashboard` (always use `percentWidthClass(...)` from `@/lib/percent-width-class`).
- **No `text-[#D6A23A]` Contrast/Hygiene Violations:** Never use `text-[#D6A23A]` on white/cream surfaces—and to satisfy `tests/event-dashboard-ui-hygiene.test.mjs`, also avoid `text-[#D6A23A]` anywhere in `tab-budget-allocations.tsx` and `tab-reports.tsx` (use `#F0C768` or `#FAF6F0`/white accents on `#0C3325` dark cards, and `#8D5B0E` on light surfaces).
- **No Unapproved Pushing or Mainline Merges:** Stay on `feat/event-dashboard-full-prototype` until implementation is verified and approved.

---

## 3. Existing Constraints & Test Contracts

### 3.1 Invariant Test Contracts (Must Continue to Pass)
- `tests/dashboard-tab-strip.test.mjs`:
  - Primary 5-tab bar in `event-dashboard-view.tsx` MUST sit inside `<TableScroll label="Dashboard sections">`.
  - Flex container MUST use `gap-2` (`>=8px`), `p-1.5` (`>=6px`), `w-max` and NO `max-w-*`.
  - Every interactive `<button|Link|input|select|textarea|a>` inside `event-dashboard-view.tsx` MUST carry a static literal `className` with ONE explicit `min-h-*` token `>= 44px` (`min-h-[48px]` and `text-sm` on tab buttons, `aria-current={isActive ? "page" : undefined}`).
  - Swipe hint containing `/for more sections/i` MUST use `lg:hidden` (`>= 56rem`, NO `sm:hidden`/`md:hidden`, NO base `hidden`, NO `sr-only`, NO `aria-hidden`, NO `max-*:`).
- `tests/form-control-baseline.test.mjs`:
  - Preserves close-button inventory (`aria-label="Close dialog"`) and `>=44px` tap targets. Keeps `aria-label="Close receipt viewer"` on `ReceiptViewerModal`; registers any newly added team-role dialog file cleanly in the baseline test inventory.
- `tests/event-dashboard-ui-hygiene.test.mjs`: Zero `style={{...}}` in `src/components/events/dashboard`, WCAG-compliant text colors, no `text-[#D6A23A]` in `tab-budget-allocations.tsx` or `tab-reports.tsx`.
- `tests/unified-void-ui-integration.test.mjs` & `tests/ticket-cancel-decision.test.mjs`: Reversals/cancellations route strictly through `VoidRecordModal` -> `voidRecordAction` with mandatory `>=5` char audit reason.
- `tests/mobile-modal-bottom-sheets.test.mjs`: Modals preserve `items-end justify-center p-0 sm:p-4 sm:items-center` + `rounded-t-2xl sm:rounded-2xl`.
- `tests/event-finance-tab.test.mjs`: Server action redirects preserve `fd.set("return_tab", activeTab)` and normalized `return_tab` allowlist in `src/lib/event-finance-tab.mjs`.
- `tests/event-ticket-tier-ui.test.mjs`: `TabTickets` preserves `id="btn-add-ticket-tier"`, `"Add Ticket Tier"`, `id="btn-create-tier-empty"`, `btn-edit-tier-*`, and `btn-retire-tier-*`.
- `tests/event-ledger-recorded-by.test.mjs`, `tests/event-audit-log-ui.test.mjs`, `tests/event-dashboard-expenses-ui.test.mjs`, `tests/event-tab-revenue-expenses-ledgers.test.mjs`, `tests/mobile-tab-bottom-sheet.test.mjs`: Keep `TabAuditLog`, `TabExpenses`, `TabRevenue`, `TransactionDetailModal`, and `MobileTabBottomSheet` exported and intact.

### 3.2 Legacy Structural Tests Requiring Intentional Updates
These pre-prototype tests assert old table layouts, duplicated mobile nav bars, or superseded button/grid selectors and will be updated intentionally alongside the prototype implementation:
- `tests/event-tab-tickets-ledger.test.mjs`: Update desktop tier `<table>` / `"Sales (N)"` expectations to 3-column responsive tier cards (`md:grid-cols-2 lg:grid-cols-3`) + 2-line `<LedgerTransactionCard>` ticket sales list.
- `tests/mobile-transaction-cards.test.mjs`: Update only the `event-domain-ledger.tsx` and `tab-tickets.tsx` assertions (from desktop `<table` to 2-line cards across all viewports) while preserving `tab-revenue.tsx`, `tab-expenses.tsx`, `tab-audit-log.tsx`, `club-transaction-ledger.tsx`, and `attendance-roster-table.tsx` checks.
- `tests/event-domain-ledger-ui.test.mjs` & `tests/ticket-sales-ledger-channels.test.mjs`: Update `<th>` / `<td>` table selectors to 2-line `<LedgerTransactionCard>` selectors and wrapped SoD `"Needs Another Officer's Review"` indicator checks.
- `tests/event-budget-ceiling-ui.test.mjs` & `tests/event-dashboard-mobile-responsive.test.mjs`: Update `"Edit Budget Total"` -> `"Edit Budget"` (matching user-confirmed copy while retaining `Spending`, `Revenue Mix`, `Cash Flow` sub-tab labels), and align responsive layout checks for `TabOverview`, `TabTickets`, `TabBudgetAllocations`, and `TabReports`.
- `tests/event-tab-budget-matrix.test.mjs`: Align with `TabBudgetAllocations` updated cost-center matrix heading/table while preserving accessibility & mobile card checks.
- `tests/mobile-form-safety.test.mjs`: Update the Overview KPI grid class check to the prototype 2×2 `lg:col-span-7` layout (`grid grid-cols-2 gap-2.5`).
- `tests/event-dashboard-mobile-view.test.mjs`, `tests/event-dashboard-unified-redesign.test.mjs`, `tests/event-dashboard-mobile-panel.test.mjs`, `tests/event-finance-workspace.test.mjs`: Align mobile action header cleanup (no duplicate mobile-only nav strip / no `"Quick Actions"` heading) with the unified `<TableScroll label="Dashboard sections">` 5-tab bar (`tab-btn-*`, `aria-current`, `lg:hidden` swipe hint).

---

## 4. Chosen Approach & Architecture

**Selected Approach (User-Approved Approach A): Shared Primitive Extraction + Full Visual Alignment + Existing Modal Reuse/Polish**

### 4.1 New Shared Primitives

#### A. `LedgerTransactionCard` (`src/components/events/dashboard/ledger-transaction-card.tsx`)
Single interactive 2-line ledger card used identically across **Overview (Recent Ledger Activity)**, **Tickets (Ticket Sales Records)**, and **Ledger (Unified Event Ledger)** on both mobile and desktop viewports:
- **Outer Container:** Full-card `<button type="button">` (`w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer shadow-xs space-y-1 min-h-[44px]`) opening `VoucherInspectionDrawer` on click/tap, with zero nested `<button>` controls inside.
- **Surface States:**
  - Approved / Pending: `bg-white border-[#E5DDD3] hover:border-[#174C37]/50`
  - Voided (`status === "voided"`): `bg-[#FFF8F7] border-[#BA3C2A]/30 hover:border-[#BA3C2A]/60`
- **Line 1 (Primary Action + Amount):**
  - Left (`flex items-center gap-1.5 min-w-0 flex-1`): Status dot (`w-2 h-2 rounded-full shrink-0`: `#BA3C2A` voided, `#8D5B0E` pending, `#174C37` approved), bold title/description (`text-xs font-bold truncate`, `line-through text-[#7A685D]` if voided else `text-[#3D291F]`), desktop counterparty inline (`hidden sm:inline text-[11px] text-[#7A685D] truncate`).
  - Right (`shrink-0 text-right`): Tabular mono amount (`font-mono font-bold text-xs tabular-nums`: `line-through text-[#7A685D]` if voided, `text-[#BA3C2A]` with `-{formatNaira(...)}` for expense, `text-[#174C37]` with `+{formatNaira(...)}` for ticket/revenue).
- **Line 2 (Category, Mobile Party, Date, Receipt & Verification Status):**
  - Top border hairline (`border-t border-[#E5DDD3]/40 pt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-[#7A685D]`).
  - Left metadata: `category` (`font-medium text-[#5C4638] truncate`), mobile-only counterparty (`sm:hidden`), short formatted WAT date + optional ticket pass count/channel (`2 passes · Online`), short `#ref` when present.
  - Right indicators:
    - When `transaction.receipt` exists: paperclip icon + `Receipt` label (`hidden sm:inline`), `#174C37` font-medium.
    - Status text: `"Pending"` (exact concise wording per user rule—never `"Pending Review"`, `#8D5B0E`, bold), `"Voided"` / `"Reversed"` (`#BA3C2A`, bold), `"Approved"` (`#174C37`, bold).
    - **Executive Segregation-of-Duties Guard:** Exact rule preserved (`userRole === "executive" && Boolean(currentUserId) && transaction.createdBy === currentUserId` on pending entries): display a wrap-safe `"Needs Another Officer's Review"` indicator (`whitespace-normal text-right leading-tight text-[#8D5B0E] font-semibold`) without overflowing or pushing cards offscreen, and hide any redundant "Inspect" text affordance. Tapping the card still opens `VoucherInspectionDrawer` read-only with the SoD guard blocking self-approval.

#### B. `ReceiptPreview` (`src/components/finances/receipt-preview.tsx`)
Shared inline receipt viewer extracted from `ReceiptViewerModal` (`src/components/finances/receipt-viewer.tsx`):
- **Props:** `{ receiptId: string; fileName: string; contentType: string; sha256?: string | null; compact?: boolean }`
- **CSP-Compliant Fetching & Rendering (`src/proxy.ts` Safe):**
  - Fetches `/api/receipts/${encodeURIComponent(receiptId)}` directly with `fetch` (respecting `Content-Disposition: attachment` and CSP `frame-src 'none'`, `object-src 'none'`, `worker-src 'self' blob:`).
  - For `image/*`: converts response `Blob` into `URL.createObjectURL(blob)` (cleanly calling `URL.revokeObjectURL` on cleanup/unmount) and renders responsive `<img>` (`max-h-[420px] object-contain`). **Replaces raw `<img src={receiptUrl}>` in `VoucherInspectionDrawer` so attachment headers never block rendering.**
  - For `application/pdf`: reads `await response.arrayBuffer()` into `new Uint8Array(buf)` and passes `{ data }` to `pdfjs.getDocument({ data })` using **only** the locally bundled `pdfjs-dist` worker (`GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()`, removing any `https://unpkg.com` fallback blocked by CSP!). Renders onto `<canvas>` with `Page X of Y` Prev/Next buttons (`min-h-[44px]`), `Zoom - / +` (50%–200%), plus direct download link (`?download=1`).
  - Shows verified file header (`fileName` + short `SHA-256` hash badge when `sha256` is loaded) and clean loading/retry states.
- **`ReceiptViewerModal`** refactors its body to use `<ReceiptPreview>` while retaining `aria-label="Close receipt viewer"`.
- **`VoucherInspectionDrawer`** embeds `<ReceiptPreview compact />` directly inside its Receipt preview region, enabling inline multi-page PDF inspection right inside Transaction & Receipt Review.

#### C. `EventAuditTrailList` (`src/components/events/dashboard/event-audit-trail-list.tsx`)
Extracted from `TabAuditLog` Section 2 (`activityLogs` timeline cards) so both `Statement & Team` (collapsible `"System Audit Trail"` card) and legacy `TabAuditLog` share one clean component without duplication.

---

### 4.2 Dashboard Shell & Navigation (`src/components/events/dashboard/event-dashboard-view.tsx`)

1. **Spotlight Header Card:**
   - Top forest accent bar (`h-1 bg-[#174C37]`), white surface, `border-b border-[#E5DDD3]`.
   - Top row: `<- Events` `<Link href="/events">` (`min-h-[44px]`) on left; Lifecycle Status pill (`Scheduled` / `Completed` / `Cancelled` / `Archived` with indicator dot) + `"Event info"` / `"Hide info"` toggle button (`min-h-[44px]`) on right.
   - Main row (`flex flex-col md:flex-row md:items-center md:justify-between gap-2.5`):
     - Left: DM Sans `text-xl sm:text-2xl font-bold text-[#3D291F] tracking-tight`, inline schedule (`formatEventDateSpan` · `formatEventTime` WAT) + venue (`location`).
     - Right action group (`flex flex-wrap items-center gap-2`):
       - `Download Report` button (`min-h-[44px]`) opening `DownloadReportModal`.
       - `+ Record Entry` primary forest button (`min-h-[44px]`, visible when `canRecordFinancials && !isLocked`) opening `RecordTransactionModal`.
       - `Edit Event` button (`min-h-[44px]`, visible when `canEditEvent`) opening reused `EventEditModal` with safe `return_to` redirect back to this dashboard.
   - **Collapsible `Event info` Drawer:** Displays real accounting reference (`CFSC-${event.id.slice(0, 6).toUpperCase()}-FIN`), schedule/WAT timezone, conditional Public Box Office link (`/tickets?view=public` when `event.ticketingEnabled`, else omitted), conditional Meeting Hub link (`/meeting-hub?event=${event.id}` when `(event.minutesEnabled || event.attendanceEnabled) && event.eventType !== "party"`), real `event.description`, plus officer/lead Edit Details & Lifecycle controls (`Complete`, `Cancel`, `Reopen Planning`, `Archive` via reused `EventLifecycleModal` gated by `getEventCardAccess`).
   - Removes redundant standalone mobile `"Quick Actions"` heading.
2. **Sticky Unified 5-Tab Navigation Strip (`TableScroll` + Prototype Pill Styling):**
   - Single responsive sticky bar (`bg-[#FAF6F0] border-b border-[#E5DDD3]`—removes the old duplicated `sm:hidden` vs `hidden sm:block` tab strip).
   - Preserves ALL `tests/dashboard-tab-strip.test.mjs` invariants: `<TableScroll label="Dashboard sections">`, `lg:hidden` swipe hint containing `"Swipe right for more sections"`, flex container `gap-2 p-1.5 w-max` (no `max-w-*`), tab buttons `min-h-[48px] text-sm font-semibold` + `aria-current={isActive ? "page" : undefined}` + static IDs `id="tab-btn-overview"`, `id="tab-btn-tickets"`, `id="tab-btn-budget"`, `id="tab-btn-ledger"`, `id="tab-btn-statement"`.
   - Active tab uses `bg-[#174C37] text-white shadow-xs`; inactive uses `text-[#5C4638] hover:bg-[#E5DDD3]/50`:
     1. `Overview`
     2. `Tickets` (count pill = `totalTicketsSold`)
     3. `Budget & Streams` (`#BA3C2A` alert dot if `isOverBudget`)
     4. `Ledger` (count pill = `transactions.length`)
     5. `Statement & Team`
   - Legacy URL support: `normalizeEventFinanceTab` & URL mapping resolve `?tab=expenses` -> `budget` (`spending`), `?tab=revenue` -> `budget` (`revenue`), `?tab=reports | team_roles | audit_log` -> `statement` (with smooth focus/open on Team / Statement / Audit Trail).

---

### 4.3 Five-Tab Workspace Designs & Realized Accounting Totals

> **Verified-Only Realized Totals Rule:** Compute realized event metrics across Overview, Budget Cash Flow, and Statement P&L strictly from verified/paid transactions (`status === "posted" && paymentStatus === "verified"`, where paid expenses & approved ticket sales / paid revenue inflows qualify). Keep pending inflows (`pendingRevenue`, `pendingTickets`) and pending expense commitments (`totalCommitted`) isolated and displayed in crisp secondary subtitles (`"+ ₦X pending"` / `"Incl. ₦Y committed"`) rather than mixing pending into realized surplus/deficit.

#### Tab 1: Overview (`tab-overview.tsx`)
- **Over-Budget Banner:** Shown when `budgetCeiling > 0 && remainingBudget < 0` with exact overshoot amount and `"Review Budget"` button (`min-h-[44px]`).
- **Top Section (`grid-cols-1 lg:grid-cols-12 gap-3.5`):**
  - **Left (`lg:col-span-7`): Interactive 2×2 KPI Grid (`grid-cols-2 gap-2.5`):**
    1. `Ticket Sales` (`formatNaira(verifiedTicketRevenue)`, `{sold} of {cap} sold`, optional pending count, `Tiers ->`) -> switches to `tickets`.
    2. `Total Revenue` (`formatNaira(verifiedRevenue)`, pending inflow subtitle if `> 0`, `{N} streams ->`) -> switches to `budget` (`revenue`).
    3. `Total Expenses` (`formatNaira(verifiedExpenses)`, `% of ceiling` + committed note if `> 0`, `{N} centers ->`) -> switches to `budget` (`spending`).
    4. `Net Surplus` / `Net Deficit` (`bg-[#0C3325] text-[#FAF6F0]` when `>= 0`, `bg-[#BA3C2A] text-white` when `< 0`, tabular balance, `Margin: X%`, `Statement ->`) -> switches to `statement`.
  - **Right (`lg:col-span-5`): Approved Budget Ceiling Card:** Real ceiling (`formatNaira(budgetCeiling)` or `"Not set"`), officer `"Edit Budget"` / `"Set Budget Total"` button, utilization bar via `percentWidthClass(...)` (zero inline `style`), spent vs committed vs remaining headroom summary, real last-revision/allocation summary, and `"Manage Allocations ->"` officer button opening `EventCategoryManagementModal` (`budget_allocation`).
- **Middle Section (`grid-cols-1 lg:grid-cols-2 gap-3.5`):**
  - `Active Cost Centers`: Top 4 active cost centers with allocation vs spent bars (clickable -> jumps to Ledger filtered to `expenses` + that category) and `"View All (N) ->"`.
  - `Ticket Inventory Pulse`: Tier rows with price, `sold / capacity`, and tier revenue (clickable -> jumps to Ledger filtered to `tickets` + tier name), `"Manage Tiers ->"`, plus footer showing `{teamMembers.length} leads assigned` and `"Manage Team ->"`.
- **Bottom Section (`Recent Ledger Activity`):** Latest 5 transactions rendered with shared `<LedgerTransactionCard>` + `"Full Ledger (N) ->"` button.

#### Tab 2: Tickets (`tab-tickets.tsx`)
- **Top Box Office Summary Card:** Header (`Ticket Tiers & Capacity Mix`), officers `id="btn-add-ticket-tier"` (`"+ Add Ticket Tier"`) and `"+ Record Ticket Sale"`, and 3-column metrics (`Verified Ticket Revenue`, `Total Passes Sold`, `Capacity Mix` bar using `percentWidthClass`). Also preserves `id="btn-create-tier-empty"` when zero tiers exist.
- **Ticket Tiers Card Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` on ALL viewports):**
  - Replaces legacy desktop `<table>`.
  - Each tier card displays name, status pill (`Active`, `Retired`, `Sold Out`), description, unit price (`formatNaira`), capacity bar (`sold / capacity` + `%`), `Tier Revenue`, and officer actions `id="btn-edit-tier-${tier.id}"` (`Edit`) and `id="btn-retire-tier-${tier.id}"` (`Retire` when active/mutable).
  - **Per user instruction (`A3`), the per-tier `"Sales (N)"` button is removed.**
- **Ticket Sales Records Card:** Header with count + Status filter pills (`All`, `Pending`, `Approved`, `Voided` — concise `"Pending"` label) + Sales Channel pills (`All Channels`, `Member Sales`, `Online Sales`) + 2-line `<LedgerTransactionCard>` stack on both mobile and desktop.

#### Tab 3: Budget & Streams (`tab-budget-allocations.tsx`)
- **Governance Header Card:**
  - Title + officers `"Edit Budget"` (`EventBudgetCeilingModal`), `id="btn-manage-budget-categories"` `"Manage Categories"` (`EventCategoryManagementModal`), and contextual `"+ Record Expense"` / `"+ Record Revenue"` button.
  - Preserves user-confirmed sub-tab labels (`Spending`, `Revenue Mix`, `Cash Flow`) inside prototype-styled segmented switcher + live allocation headroom (`Allocated: X of Y ceiling`).
- **Sub-View A — `Spending` (Cost Centers):**
  - `md:hidden`: Mobile cost-center cards with status pill (`Over Cap`, `Near Cap`, `Healthy`), `Allocated / Spent / Committed / Left`, and `percentWidthClass` progress bar.
  - `hidden md:block`: Responsive matrix table inside `<TableScroll label="Budget allocation matrix">` (`Cost Center`, `Allocated`, `Share`, `Spent`, `Committed`, `Remaining Buffer`, `Utilization` bar, `Ledger ->`); clicking any row filters Ledger to `expenses` + category.
- **Sub-View B — `Revenue Mix` (Revenue Streams):**
  - Verified Inflows banner (`Ticket Sales + Direct Revenue Streams = Total`) with `"View Revenue Ledger ->"`.
  - Responsive card grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`) showing Target vs Received (+ Pending note) and `percentWidthClass` bar; clicking filters Ledger.
- **Sub-View C — `Cash Flow`:**
  - 3-card real telemetry grid (`Gross Inflows (Verified)`, `Gross Outflows (Verified)`, `Net Event Cash Position` in `#0C3325` using `#FAF6F0` / `#F0C768` text — NO `text-[#D6A23A]`) + live Breakdown of Verified vs Pending/Committed cash position (zero fake Phase 1–4 milestones).

#### Tab 4: Ledger (`event-domain-ledger.tsx`)
- **Filter Header Card:**
  - Header with `"Export CSV"` button (`min-h-[44px]`).
  - Search & Category row (`grid-cols-1 sm:grid-cols-12 gap-2`): Search input (`title`, `party`, `#ref`, `category`) + grouped Category/Tier `<select>` (`All Categories & Tiers`, dynamic `<optgroup>`s for `Ticket Tiers`, `Revenue Streams`, `Expense Cost Centers`) + `"Reset"` button (`min-h-[44px]`).
  - Scrollable Domain pills: `All Domains (N)`, `Tickets (N)`, `Other Revenue (N)`, `Expenses (N)`.
  - Scrollable Status pills: `All Status (N)`, `Approved (N)`, `Pending (N)`, `Reversed / Voided (N)`.
- **Transactions List:**
  - Summary bar (`Showing X of Y transactions` + `Net Verified: +/-₦...`).
  - **2-Line `<LedgerTransactionCard>` stack on BOTH mobile and desktop viewports** (replaces desktop `<table>`).

#### Tab 5: Statement & Team (`tab-reports.tsx`)
- **Section A — Event Committee & Leads:**
  - Header + officers `"+ Assign Team Member"` button (`min-h-[44px]`, visible when `canManageTeamRoles`, opening a clean team assignment modal backed by `assignEventRoleAction`), plus `Revoke` action per member backed by `revokeEventRoleAction` (with mandatory `reason`).
  - Committee grid (`grid-cols-1 md:grid-cols-2 gap-2.5`) with circular `#174C37` monogram badge, full name, `@username`, role title, and active status.
- **Section B — Official Reconciled Income Statement:**
  - Header + `"Print / PDF"` (`DownloadReportModal` / PDF endpoint) and `"Export CSV"` buttons.
  - Club Letterhead (`CARPENTERS FAMILY SOCIAL CLUB`, real accounting ref, real reconciliation badge: `"Reconciled"` when pending count is `0`, else `"{N} Pending Verification"`).
  - 4-Metric KPI Strip (`Revenue` verified, `Expenses` verified, `Net Balance` verified, `Net Margin`).
  - Line-Item Breakdown (`divide-y` responsive rows instead of horizontal tables):
    1. `1. Revenue` (every stream with Target vs Received & Variance).
    2. `2. Expenses` (every category with Allocated vs Spent + Committed & Left).
  - Real Governance Sign-Off Summary derived from real committee leads and live verified vs pending telemetry (NO hardcoded fake `"Sign-off: Verified"` badges if items remain pending).
- **Section C — System Audit Trail:**
  - Clean collapsible card at the bottom of `Statement & Team` rendering shared `<EventAuditTrailList>` (`activityLogs` from `audit_log`), preserving full historical audit visibility inside the 5-tab layout.

---

## 5. Modal & Backend Integration Requirements

1. **`dashboard/page.tsx` Data & Permissions Additions:**
   - Select `sha256` on `finance_receipts` (`ReceiptInfo.sha256`).
   - Derive `assistant` event lead check alongside `lead`/`event_lead`; compute `getEventCardAccess` (`canEditEvent`, `canManageLifecycle`) and `canManageTeamRoles` (`executive || admin || president` while `scheduled && !archived_at`).
   - Pass serialized `eventRow` fields required by `EventEditModal` / `EventLifecycleModal`, plus `memberId`, `username`, `roleKey` on `DashboardTeamMember`, and active `member_profiles` (`id, full_name, username`) when `canManageTeamRoles` is true.
2. **Server Action `return_to` & Cache Revalidation (`src/app/actions.ts` & `src/lib/event-finance-tab.mjs`):**
   - Add `"ledger"` and `"statement"` to `EVENT_FINANCE_TABS` in `src/lib/event-finance-tab.mjs`.
   - In `assignEventRoleAction`, `revokeEventRoleAction`, `updateEventDetailsAction`, `setEventStatusAction`, `reopenEventAction`, and `archiveEventAction`: accept optional `return_to` (`optionalEventText(formData, "return_to", 120)`), allow validated `/events/${eventId}/dashboard` targets (preserving default `/events` and `/officers/members` redirects when omitted), and invoke `revalidatePath(\`/events/${eventId}/dashboard\`)`.
3. **Reuse & Polish Existing Modals In-Place:**
   - `VoucherInspectionDrawer`: Inline `<ReceiptPreview compact />` (with PDF canvas + zoom/pagination), polished summary/metadata cards, live SoD guard (`Needs Another Officer's Review`), Approve button, and `"Reverse / Void Entry"` -> `VoidRecordModal`.
   - `RecordTransactionModal`, `EventCategoryManagementModal` (with optional in-modal switcher across Budget Allocations / Revenue Categories / Expense Categories when opened from Budget & Streams), `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, `VoidRecordModal`, `EventEditModal`, `EventLifecycleModal`, and new compact `EventTeamRoleModal` (registered cleanly in `tests/form-control-baseline.test.mjs`, styled on `#FAF6F0`/white DM Sans system, `min-h-[44px]`/`48px` controls).
   - Keep zero inline `style={{}}` and zero `Fraunces` serif overrides across all dashboard components/modals.
