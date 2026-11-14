# Club Finance & AI Reports Redesign + Hardening Design Spec

**Date:** 2026-11-14  
**Branch:** `feat/finances-reports-redesign`  
**Status:** Approved for planning & implementation (`"1. As shown in the prototype"`, `"2. Recommend"`, `"3. Recommend"`, `"4. Yes"`, `"yes proceed"`)

---

## 1. Purpose & Separation of Concerns

The two pages serve distinct workflows and must not mirror each other:

1. **Club Finance (`/finances`) — Operational Treasury Ledger & Governance:**
   - Used by all active members (read-only transparency + export) and club officers/admins (`executive`, `admin`, `president`) for recording, correcting, voiding, receipt verification, category governance, bank settings, opening balance setup, and audit inspection.
2. **AI Reports (`/officers/reports`) — Officer Intelligence & Formal Reporting Studio:**
   - Officer-only (`executive`, `admin`, `president`) analytical reporting, branded PDF/CSV exports, AI executive briefings, formal AGM/Treasurer/Minutes document drafting, natural-language custom report queries, and saved report history.

All design tokens, typography (`DM Sans` UI + `IBM Plex Sans` tabular numerals/`₦`), `48px` primary inputs/buttons (`min-h-[44px]` touch targets), `12px`/`16px` card radii, `10px` control radii, and horizontal-pill navigation follow `DESIGN.md`. No bottom tab bar is introduced.

---

## 2. Club Finance (`/finances`) Information Architecture & Layout

### 2.1 Above-the-Fold Hero & Reconciliation Strip

- **Compact Page Header:** Kicker `"Club Treasury"`, `h1` `"Club Finances"`, concise description `"Club balances, recorded income, and verified expenses."`.
- **Action Row:**
  - All active members: `Download Report` button (`min-h-[44px]`, horizontal icon + label) opening the existing Export modal (`PDF`, `CSV`, optional `includeAi` checkbox).
  - Officers (`isOfficer && !financeUnavailable`): `Record Income` (`+`), `Record Expense` (`-`), and `Manage Categories` trigger directly in the hero/command strip (always reachable above the fold instead of buried beneath KPIs and setup forms).
  - Officers also receive a contextual quick link `"Open AI Reports Centre →"` (`/officers/reports`) where appropriate (in Treasury Setup & Audit).
- **Verified Balance Hero & Metric Strip (`ClubFinancialSummary`):**
  - Prominent **Verified Current Balance** hero card (`summary.balance`, tabular `IBM Plex Sans` / monospace figures) displaying an explicit, single-glance **Cash Reconciliation Formula**:
    `Opening Reserve + Post-Launch Dues + Other Income + Live Event Net − Club Expenses = Verified Balance`
  - **Reconciliation Math Clarity (Decision 1 — Prototype Approved):**
    - Do **not** mutate SQL `club_dues_income_total()` or `club_finance_summary_core()`.
    - Derive `openingBalanceTotal` (from non-voided `is_opening_balance = true` income rows), `eventNet = event_inflow - event_outflow`, `postLaunchDues = balance - openingBalanceTotal - other_income + expenses - eventNet`, and `preLaunchDues = Math.max(0, dues_income - postLaunchDues)` in `src/app/(member)/finances/page.tsx` using already-accessible data (respecting RLS for non-officer members).
    - **Dues Income** metric card continues to show total cumulative `dues_income` (`ClubFinancialSummary`) with a clear live vs. pre-launch reconciled subtitle (`Post-launch live` vs `Pre-launch historical` when pre-launch dues > 0) so the gap between cumulative `Dues Income` and cash `Current Balance` is immediately self-explanatory.
  - Responsive 2-col (`sm:grid-cols-2`) / 4-col (`lg:grid-cols-4`) supporting metric cards for `Dues Income`, `Other Income`, `Club Expenses`, and `Event Cash (Live)` (`In` / `Out` pair). Compact mobile vertical footprint (`~1` viewport vs `2.3+` viewports previously).

### 2.2 Three URL/State-Synchronized Horizontal Underline Tabs

Replace the single monolithic 5,000px stack with 3 crisp workspace tabs under the summary strip:

1. **Tab 1 — `Club Ledger` (Default, `?tab=ledger`):**
   - Contains `ClubTransactionLedger` (type filter pills `All`, `Income`, `Expenses`, `Voided` using `CfFilterPill`-consistent touch height + payment-method badge `Bank Transfer` / `Cash` + `Search` + `Attach`/`N Receipts` trigger + `Correct`/`Void` actions + Pagination bar `Newer records` / `Older records`).
2. **Tab 2 — `Event Cash Posts` (`?tab=events`):**
   - Displays `EventLedgerSection` (`event_ledger_entries` postings & reversals).
   - Add a native **mobile card view (`md:hidden`)** alongside the existing `md:block` table inside `TableScroll` / `overflow-x-auto` so mobile users never have to sideways-scroll a dense table.
3. **Tab 3 — `Treasury Setup & Audit` (`?tab=setup`, Officer-only):**
   - Renders `AiSummaryPanel` (`reportType="club_finance"`, `isOfficer && aiEnabled`) with `"Open AI Reports Centre →"` shortcut (`Decision 2`). Note: preserve exact `isOfficer && aiEnabled` and `AiSummaryPanel` wiring required by `tests/ai-reports-ui.test.mjs`.
   - 2-column grid for `ClubBankSettingsCard` (`isAdmin` edit vs read-only) and `OpeningBalanceEntryCard` (`canRecord={isAdmin}`). Note: remove stale hardcoded `Feb–Sep 2026` copy if generic/dynamic or clarify pre-launch reserve without misleading new clubs; pass dynamic `today` WAT date & per-mount random `idempotency_key` to `OpeningBalanceEntryCard`.
   - Collapsible `OfficerAuditHistory` (preserving default collapsed behavior when `audit_page` is absent, exact `"Previous"` / `"Next"` / `"Page {auditPage + 1} of {auditPageCount}"` strings tested by `tests/finances-cleanup-and-audit.test.mjs`).

### 2.3 Preserved Invariants on `/finances`

- Preserve exact footer element + `"Financial Privacy & Transparency"` heading + exact privacy sentence tested by `tests/finances-cleanup-and-audit.test.mjs`.
- Never reintroduce removed strings (`"General Meeting Ledger"`, `"Officer Management Desk Active"`, `"Ledger Status"`, `"Audited & Reconciled"`, `"All Figures in Nigerian Naira (₦) · Tabular Numerals"`).
- Switching ledger pagination (`?page=`) or audit pagination (`?audit_page=`) lands on the corresponding tab (`audit_page` automatically opens Tab 3 `setup` when `isOfficer`).

---

## 3. AI Reports (`/officers/reports`) Information Architecture & Layout

### 3.1 Top Studio Header & Global Controls

- **Unified Header Bar:**
  - Title `"AI Reports Centre"`, subtitle `"Executive briefings, document drafting, and natural-language queries"`, and subtle status indicator when AI providers are disabled (mentioning both `GEMINI_API_KEY` and `GROQ_API_KEY`).
  - Horizontal `PeriodSelector` pill bar (`Current Month`, `Previous Month`, `Current Year`, and month `<select>`) kept scoped to overview/briefing data.
  - Top-level **4-Mode Segment Control** (`min-h-[44px]` scrollable `CfFilterPill` strip or underline tabs, URL-syncable with `?mode=...` / `draftDoc` compatibility):
    1. `Executive Brief` (Default — `ClubOverviewClient` overview + `AiSummaryPanel`)
    2. `Document Studio` (`DocumentDraftEditor` — auto-selected if `?draftDoc=...` or `?event=...` is present)
    3. `Custom Query` (`CustomReportBuilder`)
    4. `Saved Library` (Unified `ReportLibraryPanel`)

### 3.2 Workspace 1 — `Executive Brief`

- **Action-First Hierarchy (Reordered from old page):**
  1. Primary **Executive AI Briefing** (`AiSummaryPanel` for `club_overview` — `Generate`, `Edit`, `Approve`, `Regenerate` — placed **above** the KPI breakdown, not buried ~3,000px down).
  2. **Compact Period KPI Summary Strip** (6 KPIs in 2x3 mobile / 3x2 / 6-col desktop cards + collapsible or tabbed `Expense Breakdown` & `Top Events` detail).
  3. **Direct Export Strip** (`Executive Pack (PDF)`, `Club Summary (CSV)` with `includeAi` toggle — always accessible without scrolling past unrelated modes).

### 3.3 Workspace 2 — `Document Studio`

- Clean mode selector for `AGM Statement`, `Treasurer's Report`, and `Meeting Minutes` (`DocumentDraftEditor`).
- Retains full interactive privacy preview (`maskText` / `[Member N]` tokens), edit, approve, regenerate, printable HTML view, and `"Publish to Meeting Hub"` action.
- **State Isolation Fix:** Switching `selectedMeetingId` cleanly resets `rawNotes`, `previewMaskedText`, `previewStats`, and `showMaskedPreview` (unless loading the same meeting) so notes from Meeting A can never leak into Meeting B.

### 3.4 Workspace 3 — `Custom Query`

- Plain-English translator input + 4 quick prompt pills + `Understand` button.
- Visual `Understood` parameter summary chips + Manual Builder controls (`Dataset`, `Date Range`, `Group By`, `Metric`, `Chart Type`, optional `Event`/`Kind`/`Category`/`Status` filters) + `Run Report` CTA.
- Results section (Chart + Responsive Table/Cards + `Download PDF` / `Export CSV` + `AiSummaryPanel` for `reportType="custom"`).

### 3.5 Workspace 4 — `Saved Library` (Decision 3 Approved)

- Unified **Report Library & Saved Drafts** view listing all non-discarded records (`status IN ('draft', 'approved')`) from `ai_report_narratives`, ordered by `updated_at DESC` (bounded e.g. `.limit(50)`).
- Each row/card shows:
  - **Report Type Badge** (`Club Overview`, `AGM Statement`, `Treasurer's Report`, `Meeting Minutes`, `Club Finance`, `Dues Summary`, `Event Finance`, `Custom Query`)
  - **Headline / Title** (from `content.headline` or `content.title`) & **Scope/Period** (`period_start .. period_end`, plus event/meeting name if `scope_id` maps to an event)
  - **Status Pill** (`Approved` vs `Draft`) & Approver/Updated date
  - **`Data Updated` Stale Badge:** Computed on SSR by comparing `item.factsFingerprint` against known current live fingerprints for matching active scopes (`club_overview` for current period, `club_finance` current year, `dues` current year, `agm_statement` current fiscal year, `treasurer_report` current month); shown whenever a fresher live fingerprint differs from the saved item's fingerprint (`isStale === true`), so older drafts remain discoverable instead of vanishing.
  - **Actions:** `"Open"` (navigates/switches directly into the right mode + scope/period, e.g. `Document Studio` or `Executive Brief` or `/finances`) and `"Download PDF"` where directly exportable (`club_overview`, `club_finance`, `dues`, `event_finance`, `agm_statement`, `treasurer_report`).
- Client filter pills (`All`, `Approved`, `Drafts`, `Stale / Updated`) + text search.

---

## 4. Approved Security, Reliability & Data-Integrity Fixes (Decision 4)

1. **Member PII Protection on Custom Queries:**
   - Keep `"member"` disallowed in `dues` `ReportGroupBy` (`DATASET_CONFIG.dues.allowedGroupBys = ["month", "status"]`).
   - Add an explicit server-side & client-side PII sanitizer/guard in custom report facts preparation (`buildCustomFacts` / `loadFactsContextForScope`) and `grounding.ts` so `member_id`, `full_name`, `username`, `email`, `phone`, or `member`-grouped specs can never reach an AI provider or pass validation.
2. **LLM Timeout Alignment with `maxDuration = 30`:**
   - Replace per-provider `20_000ms` timeout in `src/lib/ai/provider-core.ts` & `provider.server.ts` with a shared `totalBudgetMs` deadline (`24_000ms` default) distributed across candidate providers (e.g., `11_500ms` per attempt capped by remaining budget) and threaded through `generateGroundedNarrative` / `generateGroundedFormalDraft` strict-retry loops so fallback + retry never exceed the 30s Next.js route limit.
3. **Count NL-to-Spec Translations Toward Daily Officer AI Quota:**
   - Add a Supabase migration (`supabase/migrations/20261114120000_ai_translation_quota.sql`) defining `public.log_ai_custom_translation()` (`SECURITY DEFINER`, officer-gated, inserts `'ai_report_custom_translated'` into `audit_log`) and updating `public.ai_generation_quota_ok(integer)` to count `ai_report_narratives` created today PLUS today's `'ai_report_custom_translated'` audit events for `auth.uid()`.
   - Invoke `supabase.rpc("log_ai_custom_translation")` on successful `translateQuestionToSpec` in `POST /api/ai-reports/custom`.
4. **Sanitize `return_url` in `src/app/api/receipts/route.ts`:**
   - Introduce `sanitizeReturnUrl(raw: string | null): string` rejecting non-relative paths, protocol-relative `"//"`, schemes (`http:`, `https:`, `javascript:`), backslashes, and control characters, defaulting to `"/finances"`.
   - Use `const target = new URL(safeReturnUrl, request.url); target.searchParams.set("notice", code);` across all redirect exits (eliminating open-redirect & double-`?` query corruption).
5. **Payment Method in `/finances` Query & Ledger UI:**
   - Select `payment_method` in `src/app/(member)/finances/page.tsx` ledger queries and render a clean payment-method indicator (`Bank Transfer` / `Cash` / etc.) in `ClubTransactionLedger` (both mobile cards and desktop table).
6. **Audit History Action Filters:**
   - Update `src/app/(member)/finances/page.tsx` `.in("action", ...)` to include `"finance_receipt_attached"` alongside `"club_finance_receipt_attached"`, and add `"club_payment_settings_updated"`.
   - Add clean badge mappings in `OfficerAuditHistory` (`getActionBadge`) for `"finance_receipt_attached"` and `"club_payment_settings_updated"` (plus event category actions if present).
7. **Opening Balance Dynamic Date & Client Idempotency Key:**
   - Pass dynamic WAT `today` into `OpeningBalanceEntryCard` as default `transaction_date` (replacing hardcoded `"2026-10-01"`) and in `src/app/actions.ts` `recordOpeningBalanceAction` replace `"2026-10-01"` fallback with `todayInWAT()` and date-based MD5 fallback with dynamic `randomUUID()`.
   - Add dynamic client-side `idempotency_key` (`useState(() => createSubmissionKey())`) hidden input in `OpeningBalanceEntryCard`.
8. **Modal Hygiene & Mobile Scroll Safety:**
   - Add `useModalHygiene({ isOpen, onClose })`, backdrop `<button>` overlay dismiss, and responsive `max-h-[90vh] flex flex-col` / scrollable body to `CategoryManagementModal`.
   - Ensure `ReceiptModal` uses `max-h-[90vh] overflow-y-auto` on its dialog panel so mobile viewports never clip long receipt lists or upload controls.
9. **AI Disabled Banner Accuracy:**
   - Update `ClubOverviewClient` disabled banner to mention both `GEMINI_API_KEY` and `GROQ_API_KEY` (matching `isAiReportsEnabled()`).
