# Unified Event Dashboard Full Prototype Implementation Design

**Date:** 2026-11-10
**Status:** Draft for Review
**Branch Target:** New feature branch created before implementation (not pushed until user approval)
**Reference Prototype:** Approved `carpenters_family_unified_event_dashboard_html.html` + Desktop/Mobile walkthrough video (`media_1794284993147_2783c72b.mp4`)

---

## 1. Intent & Goals

Translate the approved Carpenters Family Unified Event Dashboard HTML prototype and mobile/desktop video walkthrough into the production Next.js event dashboard (`/events/[eventId]/dashboard`) without losing any backend workflow, permission check, accounting rule, or design-system invariant.

Specifically:
1. **Visual & Interactive Fidelity:** Match the prototype's hierarchy, warm-canvas aesthetic (`#FAF6F0`, `#FFFFFF`, `#E5DDD3` borders, `#3D291F` espresso text, `#174C37` / `#0C3325` forest emerald, `#BA3C2A` terracotta), typography (`Fraunces` serif headings/balances, `DM Sans` UI text, tabular monospace numerals via `IBM Plex Sans`/`font-mono`), compact spotlight header, sticky 5-tab bar, and modal ergonomics across 320px through 1920px viewports.
2. **2-Line Ledger Cards Everywhere:** Replace legacy multi-column desktop transaction tables in Overview, Tickets Sales Records, and the Unified Ledger with the prototype's 2-line interactive ledger card on **both mobile and desktop** viewports.
3. **Reuse & Polish Existing Modals (Never Recreate):** Keep and visually polish `VoucherInspectionDrawer` ("Transaction & Receipt Review"), `RecordTransactionModal`, `EventCategoryManagementModal`, `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, `VoidRecordModal`, `EventEditModal`, and `EventLifecycleModal`.
4. **Inline PDF Receipt Rendering:** Upgrade `VoucherInspectionDrawer` so PDF receipts uploaded to R2 render inline via `pdfjs-dist` canvas with page navigation and zoom controls—reusing the rendering engine already proven in `ReceiptViewerModal`—instead of only showing a static external link.
5. **Preserve 100% of Real Backend Functionality:** Maintain Supabase live queries, Segregation-of-Duties (`Needs Another Officer's Review`), Unified Void (`voidRecordAction` with mandatory audit reason), R2 SHA-256 receipt integrity, per-type category management (`budget_allocation`, `expense`, `revenue`), event details/lifecycle management, team role assignments, system `audit_log` trail, and officer/role gates.

---

## 2. Non-Goals & Anti-Goals

- **No Mock or Synthetic UI Content:** Never copy static placeholder labels, fake balances, hardcoded checkmarks, fake Phase 1–4 timelines, or prototype-only toggles (`viewportSwitcher`, `scenarioSwitcher`, `"Shared Club & Event Balance Synced"` static copy when not verified from real data) into production components (`DESIGN.md` rule).
- **No Duplicate Parallel Modals:** Do not replace or duplicate `RecordTransactionModal`, `VoidRecordModal`, `EventCategoryManagementModal`, `EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, or `VoucherInspectionDrawer` with new parallel modal implementations.
- **No Inline `style={{...}}` Props:** Never introduce inline `style` objects anywhere under `src/components/events/dashboard` (enforced by Content-Security-Policy hygiene via `percentWidthClass(...)` from `@/lib/percent-width-class`).
- **No Low-Contrast Gold Text on White/Cream:** Never use `text-[#D6A23A]` on white or `#FAF6F0` backgrounds; use `#8D5B0E` (deep ochre/amber) for text/labels on light surfaces, reserving `#D6A23A` only on dark forest (`#0C3325` / `#174C37`) backgrounds or non-text accents.
- **No Unapproved Pushing or Mainline Merges:** Stay on a feature branch until the implementation is complete, verified, and approved.

---

## 3. Existing Constraints & Test Contracts

### 3.1 Invariant Test Contracts (Must Continue to Pass)
- `tests/dashboard-tab-strip.test.mjs`:
  - Primary 5-tab bar in `event-dashboard-view.tsx` MUST sit inside `<TableScroll label="Dashboard sections">`.
  - Flex container MUST use `gap-2` (`>=8px`), `p-1.5` (`>=6px`), `w-max` and NO `max-w-*`.
  - Every interactive `<button|Link|input|select|textarea|a>` inside `event-dashboard-view.tsx` MUST carry a static literal `className` with ONE explicit `min-h-*` token `>= 44px` (`min-h-[48px]` and `text-sm` on tab buttons, `aria-current={isActive ? "page" : undefined}`).
  - Swipe hint containing `/for more sections/i` (e.g., `"Workspace Sections · Swipe right for more sections"`) MUST use `lg:hidden` (NOT `sm:hidden`/`md:hidden`, NO base `hidden`, NO `sr-only`, NO `aria-hidden`, NO `max-*:`).
- `tests/form-control-baseline.test.mjs`:
  - Preserves exact close-button inventory (`aria-label="Close dialog"`) across existing modals and `>=44px` tap targets. Reusing existing modals instead of adding new un-inventoried dialogs keeps this clean; any newly added team assignment dialog MUST either avoid an un-inventoried close pattern or update the documented modal inventory intentionally.
- `tests/event-dashboard-ui-hygiene.test.mjs`: Zero `style={{...}}` attributes in `src/components/events/dashboard`, WCAG-compliant text colors on light surfaces.
- `tests/unified-void-ui-integration.test.mjs` & `tests/ticket-cancel-decision.test.mjs`: `VoucherInspectionDrawer` and voidable ledger records MUST route reversals/cancellations through `VoidRecordModal` (`voidRecordAction` with mandatory `>=5` char audit reason).
- `tests/mobile-modal-bottom-sheets.test.mjs`: Tested modals preserve mobile bottom-sheet positioning (`items-end justify-center p-0 sm:p-4 sm:items-center` + `rounded-t-2xl sm:rounded-2xl`).
- `tests/event-finance-tab.test.mjs`: Server action redirects preserve `return_tab` allowlist (`src/lib/event-finance-tab.mjs`: `overview`, `tickets`, `budget`, `ledger`, `statement`, plus legacy aliases `expenses`, `revenue`, `reports`, `team_roles`, `audit_log`).
- `tests/event-ledger-recorded-by.test.mjs`, `tests/event-audit-log-ui.test.mjs`, `tests/event-dashboard-expenses-ui.test.mjs`, `tests/event-tab-revenue-expenses-ledgers.test.mjs`: Preserve backward-compatible `TabAuditLog`, `TabExpenses`, `TabRevenue`, and `TransactionDetailModal` contracts (or extract shared components cleanly without breaking those modules).

### 3.2 Legacy Structural Tests Requiring Intentional Updates
Because the approved prototype explicitly changes desktop Tickets, Ledger, and Income Statement presentation:
- `tests/event-tab-tickets-ledger.test.mjs`: Currently expects old desktop `<table` markup in `tab-tickets.tsx`. Update assertions to verify 3-column desktop tier cards (`md:grid-cols-2 lg:grid-cols-3`) and 2-line `<LedgerTransactionCard>` ticket sales records on all viewports.
- `tests/mobile-transaction-cards.test.mjs`: Lines 35–47 assert an old `hidden md:block` `<TableScroll label="Ledger transactions">` in `event-domain-ledger.tsx` and desktop tier table in `tab-tickets.tsx`. Update those two specs to verify unified 2-line card rendering across mobile and desktop while retaining tap-floor checks and non-dashboard assertions (`club-transaction-ledger.tsx`, `attendance-roster-table.tsx`, `tab-revenue.tsx`, `tab-expenses.tsx`, `tab-audit-log.tsx`).
- `tests/event-dashboard-mobile-responsive.test.mjs` (and any tab-bar expectation tests checked during planning): Update pre-prototype table/layout selectors in `tab-overview`, `tab-tickets`, `tab-budget-allocations`, `tab-reports` to verify prototype responsive grids and mobile card layouts.

---

## 4. Chosen Approach & Architecture

**Selected Approach (User-Approved Approach A): Shared Primitive Extraction + Full Visual Alignment + Existing Modal Reuse/Polish**

### 4.1 New Shared Primitives

#### A. `LedgerTransactionCard` (`src/components/events/dashboard/ledger-transaction-card.tsx`)
Single interactive 2-line ledger card used identically across **Overview (Recent Ledger Activity)**, **Tickets (Ticket Sales Records)**, and **Ledger (Unified Event Ledger)** on both mobile and desktop viewports:
- **Outer Container:** Full-card `<button type="button">` with `w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer shadow-xs space-y-1 min-h-[44px]` so the entire row opens `VoucherInspectionDrawer` cleanly with a single tap and zero nested `<button>` violations.
- **Border & Surface States:**
  - Approved / Pending: `bg-white border-[#E5DDD3] hover:border-[#174C37]/50`
  - Voided (`status === "voided" | "reversed" | "cancelled"`): `bg-[#FFF8F7] border-[#BA3C2A]/30 hover:border-[#BA3C2A]/60`
- **Line 1 (Primary Action + Amount):**
  - Left (`flex items-center gap-1.5 min-w-0 flex-1`): Status dot (`w-2 h-2 rounded-full shrink-0`: `#BA3C2A` voided, `#8D5B0E` pending, `#174C37` approved), bold title/description (`text-xs font-bold truncate`, `line-through text-[#7A685D]` if voided else `text-[#3D291F]`), desktop counterparty inline (`hidden sm:inline text-[11px] text-[#7A685D] truncate`).
  - Right (`shrink-0 text-right`): Tabular mono amount (`font-mono font-bold text-xs tabular-nums`: `line-through text-[#7A685D]` if voided, `text-[#BA3C2A]` with `-{formatNaira(...)}` for expense, `text-[#174C37]` with `+{formatNaira(...)}` for ticket/revenue).
- **Line 2 (Category, Mobile Party, Date, Receipt & Verification Status):**
  - Top border hairline `border-t border-[#E5DDD3]/40 pt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-[#7A685D]`.
  - Left metadata: `category` (`font-medium text-[#5C4638] truncate`), mobile-only counterparty (`sm:hidden`), short formatted WAT date + optional ticket pass count/channel (`2 passes · Online`), short `#ref` when present.
  - Right indicators:
    - If `transaction.receipt` exists: paperclip icon + `Receipt` label (`hidden sm:inline`), `#174C37` font-medium.
    - Status text: `"Pending"` (exact concise wording, `#8D5B0E`, bold), `"Reversed"` / `"Cancelled"` (`#BA3C2A`, bold), `"Approved"` (`#174C37`, bold).
    - **Executive Segregation-of-Duties Guard:** When a pending entry triggers self-review (`isExecutiveSelfReview(transaction, currentUserId, userRole)`), display a clean wrapped `"Needs Another Officer's Review"` text indicator (`whitespace-normal text-right leading-tight text-[#8D5B0E] font-semibold`) without overflowing horizontally, and hide any redundant "Inspect" action label cleanly. Clicking the card still lets the user view receipt & metadata in `VoucherInspectionDrawer` while the drawer enforces server/client SoD rules and keeps the Approve action disabled/blocked for the recorder.

#### B. `ReceiptPreview` (`src/components/finances/receipt-preview.tsx`)
Shared inline receipt viewer extracted from `ReceiptViewerModal` (`src/components/finances/receipt-viewer.tsx`):
- **Props:** `{ receiptId: string; fileName: string; contentType: string; sha256?: string | null; compact?: boolean }`
- **Behavior:**
  - Fetches authenticated bytes from `/api/receipts/${encodeURIComponent(receiptId)}` (respecting `Content-Disposition: attachment` and `Content-Security-Policy: sandbox`—no `<iframe>`).
  - For `image/*`: fetches blob into `URL.createObjectURL` with cleanup on unmount and renders responsive image (`max-h-[420px] object-contain`).
  - For `application/pdf`: dynamically imports `pdfjs-dist`, configures worker source fallback identically to `ReceiptViewerModal`, renders active page onto `<canvas>`, provides `Page X of Y` Prev/Next buttons (`min-h-[44px]`), `Zoom - / +` (50%–200%), plus direct Download button (`?download=1` or `<a download>`).
  - Surfaces clear loading spinner and friendly retry/unavailable state if fetch/render fails.
  - Shows verified file metadata (`fileName` + short `SHA-256` verification badge when `sha256` exists).
- **`ReceiptViewerModal`** refactors its body to use `<ReceiptPreview>` so there is zero duplicated `pdfjs-dist` setup logic.
- **`VoucherInspectionDrawer`** embeds `<ReceiptPreview compact />` directly inside its Receipt section (toggled open/always inspectable inline), resolving the broken PDF link placeholder cleanly.

---

### 4.2 Dashboard Shell & Navigation (`src/components/events/dashboard/event-dashboard-view.tsx`)

1. **Spotlight Header Card:**
   - Top forest accent bar (`h-1 bg-[#174C37]`), white surface, `border-b border-[#E5DDD3]`.
   - Top row: `<- Events` `<Link href="/events">` (`min-h-[44px]`) on left; Lifecycle Status badge (`Scheduled` / `Completed` / `Cancelled` / `Archived` with indicator dot) + `"Event info"` / `"Hide info"` toggle button (`min-h-[44px]`) on right.
   - Main row (`flex flex-col md:flex-row md:items-center md:justify-between gap-2.5`):
     - Left: `font-serif text-xl sm:text-2xl font-bold text-[#3D291F]`, inline date/time (`formatEventDateSpan` · `formatEventTime` WAT) + venue (`location`).
     - Right action group (`flex flex-wrap items-center gap-2`):
       - `Download Report` button (`min-h-[44px]`) opening `DownloadReportModal`.
       - `+ Record Entry` primary forest button (`min-h-[44px]`, visible when `canRecordFinancials && !isLocked`) opening `RecordTransactionModal`.
       - Officers/Leads `Edit Event` button (`min-h-[44px]`, visible when `canEditEvent`) opening reused `EventEditModal` with safe `return_to` redirect back to this dashboard, plus quick Lifecycle trigger (Complete/Cancel/Reopen/Archive opening reused `EventLifecycleModal`) inside the expanded `Event info` drawer when authorized.
   - **Collapsible `Event info` Drawer:** Displays real accounting reference (`CFSC-${event.id.slice(0, 6).toUpperCase()}-FIN`), schedule/WAT timezone, conditional Public Box Office link (`/tickets/${event.id}` or `/events`), conditional Meeting Hub link (`/meeting-hub?event=${event.id}` when `minutes_enabled` or `attendance_enabled` and `event_type !== "party"`), real `event.description` and `event.dress_code`, plus officer/lead Edit Details & Lifecycle triggers.
   - Removes legacy separate mobile `"Quick Actions"` sub-section heading.
2. **Sticky 5-Tab Navigation Strip (`TableScroll` + Prototype Pill Styling):**
   - Sticky bar under member nav (`bg-[#FAF6F0] border-b border-[#E5DDD3]`).
   - Preserves all `tests/dashboard-tab-strip.test.mjs` structural pins (`<TableScroll label="Dashboard sections">`, `lg:hidden` swipe hint containing `for more sections`, `gap-2 p-1.5 w-max`, static `min-h-[48px] text-sm` per tab, `aria-current`).
   - Exact 5 Tabs styled as prototype green pills (`bg-[#174C37] text-white shadow-xs` active; `text-[#5C4638] hover:bg-[#E5DDD3]/50` inactive):
     1. `Overview`
     2. `Tickets` (count pill = `totalTicketsSold`)
     3. `Budget & Streams` (pulsing/solid `#BA3C2A` alert indicator dot if `isOverBudget`)
     4. `Ledger` (count pill = `transactions.length`)
     5. `Statement & Team`
   - Legacy URL query support preserved: `?tab=expenses` maps cleanly into `budget` (`cost-centers`), `?tab=revenue` maps into `budget` (`revenue-streams`), `?tab=reports` or `?tab=team_roles` or `?tab=audit_log` maps into `statement` (auto-scrolling/expanding the corresponding section), while `activeTab` normalization keeps deep-link redirects safe.

---

### 4.3 Five-Tab Workspace Designs

#### Tab 1: Overview (`tab-overview.tsx`)
- **Over-Budget Banner:** Appears dynamically when `budgetCeiling > 0 && remainingBudget < 0`, displaying exact overshoot amount and `"Review Budget"` button (`min-h-[44px]`) jumping to Tab 3.
- **Top Section (`grid-cols-1 lg:grid-cols-12 gap-3.5`):**
  - **Left (`lg:col-span-7`): Interactive 2x2 KPI Grid (`grid-cols-2 gap-2.5`):**
    1. `Ticket Sales` (`formatNaira(ticketRevenue)`, `{sold} of {cap} sold`, `Tiers ->`) -> switches to `tickets`.
    2. `Total Revenue` (`formatNaira(totalRevenue)`, `% of ceiling` or recorded count, `{N} streams ->`) -> switches to `budget` (`revenue-streams`).
    3. `Total Expenses` (`formatNaira(totalExpenses)`, `% of ceiling`, `{N} centers ->`) -> switches to `budget` (`cost-centers`).
    4. `Net Surplus` / `Net Deficit` (`bg-[#0C3325] text-[#FAF6F0]` when `>= 0`, `bg-[#BA3C2A] text-white` when `< 0`, tabular serif balance, `Margin: X%`, `Statement ->`) -> switches to `statement`.
  - **Right (`lg:col-span-5`): Approved Budget Ceiling Card:** Shows real ceiling (`formatNaira(budgetCeiling)` or `"Not set"` CTA), officer `"Edit Ceiling"` / `"Set Ceiling"` button, utilization bar via `percentWidthClass(...)` (no inline `style`), real spent vs left/over summary, real pending commitments note if `totalCommitted > 0`, and `"Manage Allocations ->"` officer button opening `EventCategoryManagementModal` (`budget_allocation`).
- **Middle Section (`grid-cols-1 lg:grid-cols-2 gap-3.5`):**
  - `Active Cost Centers`: Top 4 cost centers with allocation vs spent progress bars (clickable -> jumps to Ledger filtered to `expenses` + that category) and `"View All (N) ->"` link.
  - `Ticket Inventory Pulse`: Active ticket tiers with price, `sold / capacity`, and tier revenue (clickable -> jumps to Ledger filtered to `tickets` + tier name), `"Manage Tiers ->"`, plus footer showing `{teamMembers.length} leads assigned` and `"Manage Team ->"`.
- **Bottom Section (`Recent Ledger Activity`):** Latest 5 transactions rendered with shared `<LedgerTransactionCard>` and `"Full Ledger (N) ->"` button.

#### Tab 2: Tickets (`tab-tickets.tsx`)
- **Top Box Office Summary Card:** Title (`Ticket Tiers & Capacity Mix`), officers `+ Add Ticket Tier` (`EventTicketTierModal` create) and `+ Record Ticket Sale` (`RecordTransactionModal` ticket mode), and 3-column summary (`Verified Ticket Revenue`, `Total Passes Sold`, `Capacity Mix` bar using `percentWidthClass`).
- **Ticket Tiers Card Grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3` on ALL viewports):**
  - Replaces legacy desktop `<table>`.
  - Each tier card displays name, status badge (`Active`, `Retired`, `Sold Out`), description, serif unit price, capacity bar (`sold / capacity` + `%`), `Tier Revenue`, `"Sales (N)"` filter button (`jumpToLedger("tickets", tier.name)`), and officer action buttons (`Edit` -> `EventTicketTierModal` edit, `Retire` -> `EventTicketTierModal` retire when mutable/active).
- **Ticket Sales Records Card:** Header with record count + scrollable Status filter pills (`All`, `Pending`, `Approved`, `Voided` — concise `"Pending"` label, never `"Pending Review"`) + Sales Channel pills (`All Channels`, `Member Sales`, `Online Sales`) + 2-line `<LedgerTransactionCard>` stack on both mobile and desktop.

#### Tab 3: Budget & Streams (`tab-budget-allocations.tsx`)
- **Governance Header Card:**
  - Title + action buttons (officers `Edit Ceiling` -> `EventBudgetCeilingModal`, `Manage Categories` -> `EventCategoryManagementModal` initialized to `"budget_allocation"` on Cost Centers or `"revenue"` on Revenue Streams, contextual `+ Record Expense` / `+ Record Revenue` primary CTA).
  - 3-Pill Sub-View Switcher (`Expense Cost Centers (N)`, `Revenue Streams (N)`, `Cash Flow Summary`) + live allocation headroom readout (`Allocated: X of Y ceiling`).
- **Sub-View A — Expense Cost Centers:**
  - `md:hidden`: Clean stacked mobile cards with status pill (`Over Cap`, `Near Cap`, `Healthy`), `Allocated / Spent / Used %` grid, and progress bar (`percentWidthClass`).
  - `hidden md:block`: Responsive matrix table inside `<TableScroll>` (`Cost Center`, `Allocated`, `Share`, `Spent`, `Committed`, `Remaining Buffer`, `Utilization` bar, `Ledger ->`), clicking any row jumps to Ledger filtered to `expenses` + that category.
- **Sub-View B — Revenue Streams:**
  - Reconciled Inflows banner (`Ticket Sales + Direct Revenue Streams = Total`) with `"View Revenue Ledger ->"`.
  - Responsive stream card grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3`) showing Target/Expected vs Received + Pending inflows, progress bar (`percentWidthClass`), and click-to-filter Ledger.
- **Sub-View C — Cash Flow Summary:**
  - Real 3-card live telemetry grid: `Gross Inflows (Verified)` (breakdown: ticket sales + direct revenue + pending inflows note), `Gross Outflows (Verified)` (breakdown: verified expenses + pending commitments), and `Net Event Cash Position` (`#0C3325` emerald dark card). Plus live category inflow vs outflow net summary derived exclusively from real event data.

#### Tab 4: Ledger (`event-domain-ledger.tsx`)
- **Unified Filter Header Card:**
  - Header with `"Export CSV"` action button + `"Unified Event Ledger & Audit Journal"` subtitle.
  - Search row (`grid-cols-1 sm:grid-cols-12 gap-2`): Search input (`title`, `party`, `#ref`, `category`) + grouped Category/Tier `<select>` (`All Categories & Tiers`, `<optgroup>`s dynamically built from real `Ticket Tiers`, `Revenue Streams`, and `Expense Cost Centers`) + `"Reset"` button (`min-h-[44px]`).
  - Scrollable Domain filter chips: `All Domains (N)`, `Tickets (N)`, `Other Revenue (N)`, `Expenses (N)`.
  - Scrollable Status filter chips: `All Status (N)`, `Approved (N)`, `Pending (N)`, `Reversed / Cancelled (N)`.
- **Transactions List:**
  - Count & live `Net Verified: +/-₦...` bar above cards.
  - **2-Line `<LedgerTransactionCard>` stack on BOTH mobile and desktop viewports** (no desktop `<table>`), with clear empty state + quick filter reset when filters return zero rows.

#### Tab 5: Statement & Team (`tab-reports.tsx` + Audit Trail Section)
- **Section A — Event Committee & Leads:**
  - Header + officers `"+ Assign Team Member"` button (`min-h-[44px]`, opening a reused/lightweight Team Assignment modal backed by `assignEventRoleAction`, plus Remove/Revoke capability backed by `revokeEventRoleAction` for eligible officers).
  - Committee grid (`grid-cols-1 md:grid-cols-2 gap-2.5`) with circular `#174C37` monogram badge, full name, `@username`, role title, and status pill.
- **Section B — Official Reconciled Income Statement:**
  - Header + `"Print / PDF"` (direct PDF download or `DownloadReportModal`) and `"Export CSV"` buttons.
  - Club Letterhead (`CARPENTERS FAMILY SOCIAL CLUB`, real accounting reference, real reconciliation state derived from `pendingCount === 0`).
  - 4-Metric KPI Strip (`Revenue`, `Expenses`, `Net Balance`, `Net Margin`).
  - Line-Item Breakdown Sections (clean `divide-y` responsive flex rows matching the prototype instead of horizontal-scroll tables):
    1. `1. Revenue` (every stream with Target vs Received & Variance).
    2. `2. Expenses` (every category with Allocated & Committed vs Spent & Left).
  - Sign-Off / Governance Verification Summary derived strictly from real committee leads and verified/pending counts (shows actual `Pending Items` warning if unverified items remain rather than faking a green sign-off).
- **Section C — System Audit Trail:**
  - Preserves live `audit_log` visibility inside an expandable/clean card below the Statement (rendered by shared `EventAuditTrailList` extracted from `tab-audit-log.tsx`) so all historical admin/budget/lifecycle changes remain accessible in the 5-tab UI without adding a 6th primary tab.

---

## 5. Modal & Overlay Reuse and Server Action Continuity

1. **Reuse All Existing Modals In-Place (`src/components/events/dashboard/modals/*` & `src/components/common/void-record-modal.tsx`):**
   - **`VoucherInspectionDrawer`**: Embed `<ReceiptPreview compact />` for inline PDF & image viewing; align header (`#ref`, status pill, serif title), prominent amount card, reversal reason box, metadata card (`Recorded By`, `Counterparty`, `Method`, `Channel`), R2 receipt toggle + preview, SoD guard (`Needs Another Officer's Review` notice), Approve/Verify button for eligible second officers, and `"Reverse / Void Entry"` button invoking `VoidRecordModal`.
   - **`RecordTransactionModal`**: Visual polish (warm canvas surfaces, crisp `Fraunces` heading, `#E5DDD3` borders, consistent `#174C37` segmented switcher for Expense / Ticket Sale / Revenue Inflow) while retaining 100% of existing form fields, server actions (`createEventFinancialTransactionAction`, `createEventTicketSaleAction`), validation, and R2 receipt upload flow.
   - **`EventCategoryManagementModal`**: Retain all three modes (`budget_allocation`, `expense`, `revenue`) and add in-modal category-type switcher pills when opened from Budget & Streams so officers can manage Cost Center limits, Revenue Streams, and Expense Categories seamlessly in one polished modal.
   - **`EventTicketTierModal`, `EventBudgetCeilingModal`, `DownloadReportModal`, `VoidRecordModal`**: Polish card/header contrast (`#FAF6F0` / `#FFFFFF` / `#E5DDD3` / `Fraunces` titles) without modifying `aria-modal`, `role="dialog"`, `aria-label="Close dialog"` inventory, `min-h-[44px]`/`48px` tap floors, or mobile bottom-sheet responsiveness.
2. **Dashboard Header & Team Management Continuity (`src/app/actions.ts` + `dashboard/page.tsx`):**
   - Pass active club members list (`id`, `full_name`, `username` when `canManageTeamRoles`) and raw `eventRow` metadata from `dashboard/page.tsx` to `EventDashboardView`.
   - Support an optional validated internal `return_to` field (strictly matching `/^\/events\/[^/]+\/dashboard$/`) on `updateEventDetailsAction`, `setEventStatusAction`, `reopenEventAction`, `archiveEventAction`, `assignEventRoleAction`, and `revokeEventRoleAction`—defaulting to existing `/events` and `/officers/members` destinations when omitted so existing routes and tests do not change.
   - Reuse existing `EventEditModal` and `EventLifecycleModal` directly from `EventDashboardView` rather than duplicating form logic.

---

## 6. Left to the Builder / Verification Scope

After Design Doc approval and `writing-plans`:
- Extract `LedgerTransactionCard`, `ReceiptPreview`, and `EventAuditTrailList`.
- Update `EventDashboardView` header/tab-bar + all 5 tab components + `VoucherInspectionDrawer` PDF viewer + modal visual polish + dashboard `return_to` wiring.
- Update the explicitly listed legacy structural tests (`event-tab-tickets-ledger.test.mjs`, ledger/ticket/statement assertions in `mobile-transaction-cards.test.mjs` & `event-dashboard-mobile-responsive.test.mjs` / related view tests) while keeping every baseline, security, SoD, void, receipt, and UI-hygiene test 100% green.
- Verify with `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and live browser/Playwright checks across `320px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1280px`, `1440px`, and `1920px`.
