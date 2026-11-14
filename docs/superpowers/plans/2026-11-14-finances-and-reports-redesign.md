# Club Finance & AI Reports Redesign and Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/finances` and `/officers/reports` into task-oriented mobile-first tabbed/segmented workspaces per `docs/superpowers/specs/2026-11-14-finances-and-reports-redesign-design.md`, add the unified Report Library & Saved Drafts workspace with stale-fingerprint detection, and ship all approved security, timeout, PII, quota, and ledger fixes.

**Architecture:** Both routes stay server-rendered Next.js 16 App Router pages feeding modular `'use client'` workspace views styled strictly with `DESIGN.md` tokens (`#3D291F`, `#174C37`, `#0C3325`, `#D6A23A`, `#FAF6F0`, `#E5DDD3`, `#BA3C2A`, `>=44px` touch targets, no bottom tab bar). On `/finances`, `FinancesPageView` reorganizes into an action-ready Verified Balance hero + 4-up supporting metrics and 3 URL/state-synced horizontal tabs (`Club Ledger`, `Event Cash Posts`, `Treasury Setup & Audit`) while deriving post-launch vs. pre-launch dues cleanly from `club_finance_summary()` + opening balance without altering SQL math. On `/officers/reports`, `ClubOverviewClient` organizes into a 4-mode segmented studio (`Executive Brief`, `Document Studio`, `Custom Query`, `Saved Library`), surfacing AI briefing controls first and adding SSR-backed saved narrative listing (`status IN ('draft', 'approved')`).

**Tech Stack:** Next.js 16.4 (`App Router`), React 19, TypeScript, Tailwind CSS 4, Supabase (`@supabase/ssr`, Postgres RPCs/RLS), Lucide React icons, Node built-in test runner (`node --test`), Biome (`npm run lint`).

---

## Global Constraints

1. **Preserve SQL & Financial Balance Math:** Do NOT change `private.club_dues_income_total()` or `private.club_finance_summary_core()` arithmetic. Derive `postLaunchDues` and `preLaunchDues` only in view/page props for transparent subtitle display.
2. **Preserve Existing Regulatory/Security Invariants:**
   - Maintain `footer` with `"Financial Privacy & Transparency"` and exact privacy copy in `src/components/finances/finances-page-view.tsx`.
   - Never reintroduce strings banned by `tests/finances-cleanup-and-audit.test.mjs` (`"General Meeting Ledger"`, `"Officer Management Desk Active"`, `"Ledger Status"`, `"Audited & Reconciled"`, `"All Figures in Nigerian Naira (₦) · Tabular Numerals"`).
   - Keep `OfficerAuditHistory` collapsed by default unless `?audit_page=` is present, retaining `"Previous"`, `"Next"`, and `Page {auditPage + 1} of {auditPageCount}`.
   - Keep `AiSummaryPanel` inside `isOfficer && aiEnabled` and preserve `<input name="includeAi">` on `/finances` export modal (`tests/ai-reports-ui.test.mjs`).
3. **No New Dependencies:** Use only packages already declared in `package.json`.
4. **Type & Lint Gates:** Every change must pass `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` before completion.
5. **Windows PowerShell Commands:** Separate chained commands with `;` rather than `&&`.

## Review Focus

- **Security & Privacy:** Open-redirect + double-`?` prevention in `src/app/api/receipts/route.ts`; zero member PII allowed in custom query facts/narratives or cross-meeting raw notes in `DocumentDraftEditor`; daily AI quota enforced on NL custom translations via Postgres RPC.
- **Timeout & Reliability:** Shared route deadline budget (`<=25s`) across primary/fallback providers and strict retries inside `maxDuration = 30` routes; random client `idempotency_key` + dynamic WAT `today` date on `OpeningBalanceEntryCard`.
- **Mobile & Desktop Craft:** No mobile overflows (`md:hidden` card views for both `ClubTransactionLedger` and `EventLedgerSection`), scrollable modal panels (`max-h-[90vh]`), explicit `>=44px` tap targets, clear hierarchy without stacked walls of text.

---

## Interfaces & File Contracts

- **`src/lib/ai/provider-core.ts`**:
  - `runProvidersWithFallback(providers, req, totalBudgetMs = 24_000)`: enforces overall deadline budget across all fallback providers (no single provider exceeds remaining budget; caps individual attempt at `Math.min(12_000, remainingMs)` when multiple remain unless `totalBudgetMs <= 12_000`).
  - Export helper `createDeadlineSignal(totalBudgetMs)` / accept optional `deadlineMs?: number` inside `NarrativeRequest` so multi-step loops (`strictRetry`) share one clock.
- **`src/lib/reports/narrative-service.server.ts` & `src/lib/reports/drafts.server.ts`**:
  - Thread a single `deadlineAt = Date.now() + 25_000` down through retry loops so retries bail early with `AiUnavailableError` if `< 4_000ms` remain before `maxDuration = 30`.
- **`src/lib/receipt-return-url.ts` (or helper in `src/app/api/receipts/route.ts`)**:
  - `sanitizeReturnUrl(raw: FormDataEntryValue | null, fallback = "/finances"): string` -> accepts only single-leading-slash paths (`/finances`, `/events/123?tab=expenses`), rejects `//`, `\`, protocols (`http:`, `https:`, `javascript:`), control chars.
  - `buildReturnRedirectUrl(safePath: string, originUrl: string, notice: string): URL` -> parses `new URL(safePath, originUrl)` and calls `url.searchParams.set("notice", notice)`.
- **`src/lib/reports/library.server.ts` + `src/components/reports/report-library-panel.tsx`**:
  - `ReportLibraryItem`: `{ id, reportType, scopeId, scopeLabel, periodStart, periodEnd, factsFingerprint, title, headline, status: "draft" | "approved", approvedByName, approvedAt, updatedAt, isStale, openHref, pdfHref }`.
  - `loadOfficerReportLibrary(supabase, activeFingerprints)`: fetches `status in ('draft', 'approved')` ordered by `updated_at desc` (`limit(50)`), resolves event titles and approver names in two clean `.in(...)` lookups (no N+1 queries), compares against supplied active scope fingerprints to compute `isStale` (`Data Updated`).
- **`src/components/finances/club-financial-summary.tsx`**:
  - Props add optional `openingBalanceAmount?: number | string | null`, `postLaunchDues?: number | string | null`, `preLaunchDues?: number | string | null` (with arithmetic fallback when omitted so existing callers/tests stay safe).

---

## Task 1: Security & Backend Hardening — Receipt `return_url` Sanitizer & Custom Query PII Guard

**Files:**
- Create: `src/lib/receipt-redirect.ts`
- Modify: `src/app/api/receipts/route.ts`
- Modify: `src/lib/reports/spec-executor-core.ts`
- Modify: `src/lib/ai/grounding.ts`
- Modify: `src/lib/reports/narrative-service.server.ts`
- Test: `tests/receipt-routes.test.mjs`
- Test: `tests/ai-custom-report.test.mjs`

- [ ] **Step 1: Write failing tests for receipt `return_url` sanitization & custom PII guard**
  - In `tests/receipt-routes.test.mjs`: import `sanitizeReturnUrl` & `buildReturnRedirectUrl` (via TS compile or `.ts` helper) and assert:
    - `https://evil.com/phish`, `//evil.com`, `/\evil.com`, `javascript:alert(1)`, `relative/path` all normalize safely to `/finances`.
    - `/events/abc?tab=expenses` preserves `tab=expenses` and sets `notice=receipt-attached` without producing `?tab=expenses?notice=...`.
  - In `tests/ai-custom-report.test.mjs`: assert `sanitizeCustomFactsForAi` strips any accidental PII keys (`member_id`, `full_name`, `username`, `email`, `phone`) from custom facts and rejects `spec.dataset === "dues"` if any `groupBy` other than `"month"` or `"status"` is passed or if any group label resembles email/phone/handle.
- [ ] **Step 2: Run targeted tests to confirm RED failure**
  - Run: `node --test tests/receipt-routes.test.mjs tests/ai-custom-report.test.mjs`
  - Expected: FAIL (`sanitizeReturnUrl` / `sanitizeCustomFactsForAi` missing).
- [ ] **Step 3: Implement `src/lib/receipt-redirect.ts` and wire into `src/app/api/receipts/route.ts`**
  - Implement strict `sanitizeReturnUrl` & `buildReturnRedirectUrl`.
  - Update all 7 redirect responses in `src/app/api/receipts/route.ts` to use `buildReturnRedirectUrl(returnUrl, request.url, "...")`.
- [ ] **Step 4: Implement defensive PII stripping & validation for Custom Query AI generation**
  - Export `sanitizeCustomFactsForAi(facts)` in `src/lib/reports/spec-executor-core.ts` (recursive strip of member/PII keys + label safety check) and invoke it in `generateGroundedNarrative` (`src/lib/reports/narrative-service.server.ts`) when `reportType === "custom"` (and `validateNarrativeContent` already checks `checkTextSafety`).
- [ ] **Step 5: Run targeted tests to confirm GREEN**
  - Run: `node --test tests/receipt-routes.test.mjs tests/ai-custom-report.test.mjs`
  - Expected: PASS.

---

## Task 2: LLM Deadline Budget Alignment (`maxDuration = 30`) & Translation Daily Quota Migration

**Files:**
- Create: `supabase/migrations/20261114120000_ai_translation_quota.sql`
- Modify: `src/lib/ai/provider-core.ts`
- Modify: `src/lib/ai/provider.server.ts`
- Modify: `src/lib/reports/narrative-service.server.ts`
- Modify: `src/lib/reports/drafts.server.ts`
- Modify: `src/app/api/ai-reports/custom/route.ts`
- Modify: `src/components/reports/club-overview-client.tsx` (disabled banner copy)
- Test: `tests/ai-provider.test.mjs`
- Test: `tests/ai-reports-api.test.mjs`

- [ ] **Step 1: Write failing tests for deadline budget splitting & translation quota recording**
  - In `tests/ai-provider.test.mjs`: add tests verifying `runProvidersWithFallback` caps each provider wait within remaining budget (e.g. `totalBudgetMs = 24000` with two providers caps first attempt below total budget so fallback still runs within `totalBudgetMs`), and throws `AiUnavailableError` when remaining budget `< 500ms`.
  - In `tests/ai-reports-api.test.mjs` (or a new assertion in `tests/ai-custom-report.test.mjs`): assert `src/app/api/ai-reports/custom/route.ts` invokes `log_ai_custom_translation` on `translate` success and `club-overview-client.tsx` mentions `GROQ_API_KEY` alongside `GEMINI_API_KEY`.
- [ ] **Step 2: Run targeted tests to confirm RED failure**
  - Run: `node --test tests/ai-provider.test.mjs tests/ai-custom-report.test.mjs`
  - Expected: FAIL on new budget/quota assertions.
- [ ] **Step 3: Implement shared deadline budget across `provider-core.ts`, `provider.server.ts`, `narrative-service.server.ts`, `drafts.server.ts`**
  - Update `NarrativeRequest` with optional `deadlineAt?: number`.
  - Default route budget `TOTAL_AI_BUDGET_MS = 24_000`; `runProvidersWithFallback` computes `remaining = deadlineAt - Date.now()`, allocates `Math.min(12_000, Math.max(remaining, 1_000))` when multiple providers remain (or full `remaining` on last provider), passes an `AbortSignal.timeout(perAttemptMs)` to provider adapters (`timeout_ms: perAttemptMs` for Gemini SDK).
  - Thread `deadlineAt = Date.now() + 24_000` across `strictRetry` in `generateGroundedNarrative` & `generateGroundedFormalDraft`, aborting early if `deadlineAt - Date.now() < 3_500`.
- [ ] **Step 4: Add migration `20261114120000_ai_translation_quota.sql` & call RPC in `custom/route.ts`**
  - Define `public.log_ai_custom_translation()` (`SECURITY DEFINER`, `is_club_officer()` check, inserts `audit_log` row with `action = 'ai_report_custom_translated'`, `entity_type = 'ai_custom_translation'`, `entity_id = gen_random_uuid()`).
  - Replace `public.ai_generation_quota_ok(p_limit integer default 20)` to count rows created today in `ai_report_narratives` PLUS `audit_log` rows created today by `auth.uid()` with `action = 'ai_report_custom_translated'`.
  - Update `src/app/api/ai-reports/custom/route.ts` `translate` branch to call `await supabase.rpc("log_ai_custom_translation")` (log warning cleanly if RPC fails without leaking errors, or check existing audit pattern) right after `translateQuestionToSpec` succeeds.
  - Update `club-overview-client.tsx` disabled banner to cite `GEMINI_API_KEY` or `GROQ_API_KEY`.
- [ ] **Step 5: Run targeted tests to confirm GREEN**
  - Run: `node --test tests/ai-provider.test.mjs tests/ai-reports-api.test.mjs tests/ai-custom-report.test.mjs`
  - Expected: PASS.

---

## Task 3: Backend Ledger Query Fixes, Dynamic Opening Balance Date/Idempotency, & Modal Hygiene

**Files:**
- Modify: `src/app/(member)/finances/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/components/finances/opening-balance-entry-card.tsx`
- Modify: `src/components/finances/officer-audit-history.tsx`
- Modify: `src/components/finances/category-management-modal.tsx`
- Modify: `src/components/finances/receipt-modal.tsx`
- Modify: `tests/admin-financial-settings-components.test.mjs`
- Modify: `tests/finances-cleanup-and-audit.test.mjs`

- [ ] **Step 1: Write failing test assertions**
  - Update `tests/admin-financial-settings-components.test.mjs` so OpeningBalance checks expect dynamic `today` WAT default (e.g., `defaultValue={today}`) + `idempotency_key` hidden input (`name="idempotency_key"`), and clean generic opening balance copy (without stale fallback `"2026-10-01"` hardcoding in `actions.ts`).
  - Add test assertions in `tests/finances-cleanup-and-audit.test.mjs` ensuring:
    - `finances/page.tsx` selects `payment_method` on `club_financial_transactions`.
    - `finances/page.tsx` includes `"finance_receipt_attached"` and `"club_payment_settings_updated"` in `audit_log` filter.
    - `officer-audit-history.tsx` has badge mappings for `"finance_receipt_attached"` and `"club_payment_settings_updated"`.
    - `category-management-modal.tsx` uses `useModalHygiene` and backdrop button close.
- [ ] **Step 2: Run targeted tests to confirm RED failure**
  - Run: `node --test tests/admin-financial-settings-components.test.mjs tests/finances-cleanup-and-audit.test.mjs`
  - Expected: FAIL on new assertions.
- [ ] **Step 3: Apply fixes across `/finances` page, actions, audit badges, opening balance, and modals**
  - `src/app/(member)/finances/page.tsx`:
    - Add `payment_method` to `club_financial_transactions` select string (line 169).
    - Compute opening balance total, `postLaunchDues`, `preLaunchDues` cleanly on SSR using `summary` + active `is_opening_balance` rows (`balance - openingBalanceAmount - otherIncome + expenses - eventNet`).
    - Add `"finance_receipt_attached"` and `"club_payment_settings_updated"` to both `auditCountResult` and `auditResult` `.in("action", ...)`.
  - `src/app/actions.ts`:
    - In `recordOpeningBalanceAction`, replace `"2026-10-01"` fallback with `todayInWAT()` helper and use `randomUUID()` fallback when `idempotency_key` is absent/invalid.
  - `src/components/finances/opening-balance-entry-card.tsx`:
    - Accept `today?: string`; pass hidden `idempotency_key` (`useState(() => createSubmissionKey())`) rotated on success/reset; set `defaultValue={today}` on `transaction_date`; clarify copy cleanly.
  - `src/components/finances/officer-audit-history.tsx`:
    - Add cases for `"finance_receipt_attached"` (`"Receipt Attached"`) and `"club_payment_settings_updated"` (`"Bank Settings Updated"`).
  - `src/components/finances/category-management-modal.tsx` & `receipt-modal.tsx`:
    - Wire `useModalHygiene({ isOpen, onClose })`, backdrop `<button aria-label="Close modal overlay">`, and `max-h-[90vh] flex flex-col` / scrollable body.
- [ ] **Step 4: Run targeted tests to confirm GREEN**
  - Run: `node --test tests/admin-financial-settings-components.test.mjs tests/finances-cleanup-and-audit.test.mjs`
  - Expected: PASS.

---

## Task 4: `/finances` Hero Redesign, Verified Balance Reconciliation Card & Supporting KPI Grid

**Files:**
- Modify: `src/components/finances/club-financial-summary.tsx`
- Modify: `src/components/finances/finances-page-view.tsx`
- Modify: `tests/club-event-shared-balance-ui.test.mjs`

- [ ] **Step 1: Update `tests/club-event-shared-balance-ui.test.mjs` for new Hero + 4-up metric grid contract (RED)**
  - Keep `eventInflow` / `eventOutflow` / `formatNaira(eventNet)` assertions and replace rigid `lg:grid-cols-5` regex with assertions checking the Verified Current Balance hero card (`Verified Current Balance`), cash reconciliation formula strip (`Opening Reserve`, `Post-Launch Dues`, `Other Income`, `Live Event Net`, `Club Expenses`), and `lg:grid-cols-4` supporting metrics grid including `Event Cash (Live)` + live/pre-launch `Dues Income` breakdown.
- [ ] **Step 2: Run test to confirm RED**
  - Run: `node --test tests/club-event-shared-balance-ui.test.mjs`
- [ ] **Step 3: Implement redesigned `ClubFinancialSummary` (`src/components/finances/club-financial-summary.tsx`)**
  - Top full-width dark/forest emerald editorial Hero Card (`#0C3325` / `#174C37` border accent or warm white + forest accent matching `DESIGN.md` — clean high contrast) displaying:
    - Label `Verified Current Balance`, big tabular numeral `formatNaira(currentBalance)`.
    - Explicit horizontal/wrapping reconciliation formula chips: `Opening Reserve (₦...) + Post-Launch Dues (₦...) + Other Income (₦...) + Live Event Net (₦...) − Club Expenses (₦...)`.
  - Supporting 4-card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5`):
    1. `Dues Income`: shows `formatNaira(duesIncome)` with clear subtitle `Post-launch ₦X · Pre-launch ₦Y` (when `preLaunchDues > 0`) or `Total member dues collected`.
    2. `Other Income`: `formatNaira(otherIncome)` — `"Donations, grants, and sponsors"`.
    3. `Club Expenses`: `formatNaira(totalExpenses)` — `"Approved club expenses"`.
    4. `Event Cash (Live)`: `formatNaira(eventNet)` + `In formatNaira(eventInflow)` / `Out formatNaira(eventOutflow)`.
- [ ] **Step 4: Run test to confirm GREEN**
  - Run: `node --test tests/club-event-shared-balance-ui.test.mjs tests/finances-cleanup-and-audit.test.mjs`

---

## Task 5: `/finances` 3-Tab Workspace, Hero Command Actions, Mobile `EventLedgerSection` & Payment Method Ledger Badges

**Files:**
- Modify: `src/components/finances/finances-page-view.tsx`
- Modify: `src/components/finances/club-transaction-ledger.tsx`
- Modify: `src/components/finances/event-ledger-section.tsx`
- Test: `tests/mobile-transaction-cards.test.mjs`
- Test: `tests/finances-redesign-tabs.test.mjs` (create focused test suite)

- [ ] **Step 1: Write failing tests for `/finances` 3-tab structure, command actions, mobile EventLedger cards, and payment method badge**
  - Create `tests/finances-redesign-tabs.test.mjs` checking:
    - `FinancesPageView` implements 3 workspace tabs (`Club Ledger`, `Event Cash Posts`, and officer-only `Treasury Setup & Audit`) using accessible `role="tablist"` / `role="tab"` + `min-h-[44px]` buttons.
    - Officer actions (`Record Income`, `Record Expense`, `Manage Categories`) are accessible directly from hero action bar (`id="officer-record-income-btn"`, `id="officer-record-expense-btn"`, `id="officer-manage-categories-btn"`).
    - `AiSummaryPanel`, `ClubBankSettingsCard`, `OpeningBalanceEntryCard`, `OfficerAuditHistory` live inside Tab 3 (`setup`), with `"Open AI Reports Centre"` link to `/officers/reports`.
    - `ClubTransactionLedger` displays `payment_method` (`Bank Transfer` / `Cash`) in mobile cards and desktop rows, and uses `min-h-[44px]` filter pills.
    - `EventLedgerSection` implements mobile cards (`md:hidden`) and desktop table (`hidden md:block`).
- [ ] **Step 2: Run test to confirm RED**
  - Run: `node --test tests/finances-redesign-tabs.test.mjs`
- [ ] **Step 3: Refactor `FinancesPageView`, `ClubTransactionLedger`, and `EventLedgerSection`**
  - `FinancesPageView`:
    - Hero bar has `Download Report` (`min-h-[44px]`, horizontal icon+text) + officer quick buttons (`+ Record Income`, `- Record Expense`, `Manage Categories` — clean compact horizontal flex wrap, no standalone bloated `OfficerFinanceControls` card duplicated mid-page unless kept tiny, or replace `OfficerFinanceControls` section cleanly).
    - Tab bar under `ClubFinancialSummary`:
      - `ledger`: `Club Ledger` (`transactionCount`)
      - `events`: `Event Cash Posts` (`eventLedgerEntries.length`)
      - `setup`: `Treasury Setup & Audit` (`isOfficer` only) — defaults to `setup` if initial URL has `?audit_page=...` (and respects `?tab=events` / `?tab=setup` via `useSearchParams` / `initialTab` prop).
    - Keep `<footer>` with `"Financial Privacy & Transparency"` and required privacy copy intact at bottom!
  - `ClubTransactionLedger`:
    - Render `payment_method` badge (`bank_transfer` -> `Bank Transfer`, `cash` -> `Cash`) on both mobile card metadata line and desktop table Type/Channel column; upgrade filter pills to `min-h-[44px]`.
  - `EventLedgerSection`:
    - Add `md:hidden divide-y` card list showing Event Title, Posting/Reversal badge, Generation #G, Signed Amount (`tabular-nums`), Status, and Created timestamp; keep `hidden md:block` desktop table.
- [ ] **Step 4: Verify existing + new tests pass**
  - Run: `node --test tests/finances-redesign-tabs.test.mjs tests/finances-cleanup-and-audit.test.mjs tests/ai-reports-ui.test.mjs tests/mobile-transaction-cards.test.mjs tests/page-footer-policy-placement.test.mjs tests/club-event-shared-balance-ui.test.mjs`

---

## Task 6: Backend Report Library Loader & Stale Fingerprint Detection + Meeting Minutes Reset Fix

**Files:**
- Create: `src/lib/reports/library.server.ts`
- Modify: `src/app/(member)/officers/reports/page.tsx`
- Modify: `src/components/reports/document-draft-editor.tsx`
- Test: `tests/ai-report-library.test.mjs`

- [ ] **Step 1: Write failing tests for Report Library filtering, staleness, & DocumentDraftEditor meeting-change state reset**
  - Create `tests/ai-report-library.test.mjs`:
    - Test pure mapper `buildReportLibraryItems(...)` verifying `'discarded'` rows are excluded, `'draft'` & `'approved'` rows are sorted by `updatedAt DESC`, and `isStale` is `true` iff an active scope fingerprint exists and differs from the item's `factsFingerprint`.
    - Check `document-draft-editor.tsx` resets `rawNotes`, `previewMaskedText`, `previewStats`, and `showMaskedPreview` when switching `selectedMeetingId`.
- [ ] **Step 2: Run test to confirm RED**
  - Run: `node --test tests/ai-report-library.test.mjs`
- [ ] **Step 3: Implement `src/lib/reports/library.server.ts` and `buildReportLibraryItems` pure core**
  - Export `src/lib/reports/library-core.ts` (pure mapper + types safe to import in client components & Node unit tests) and `src/lib/reports/library.server.ts` (`loadOfficerReportLibrary(supabase, activeFingerprints)` querying `ai_report_narratives` with `.neq("status", "discarded").order("updated_at", { ascending: false }).limit(50)`, batching `events` titles & `member_profiles` approver names).
  - In `src/app/(member)/officers/reports/page.tsx`: load lightweight active fingerprints (`club_overview` for selected period, plus current `club_finance`, `dues`, `agm_statement` current year, `treasurer_report` current month) in parallel and pass `libraryItems` to `ClubOverviewClient` alongside optional `initialMode` (`?mode=...`).
  - In `src/components/reports/document-draft-editor.tsx`: add an effect or handler resetting `rawNotes`, `previewMaskedText`, `previewStats`, and `showMaskedPreview` whenever `selectedMeetingId` changes to a different meeting.
- [ ] **Step 4: Run test to confirm GREEN**
  - Run: `node --test tests/ai-report-library.test.mjs tests/ai-drafts.test.mjs`

---

## Task 7: `/officers/reports` 4-Mode Segmented Studio & Unified Report Library UI

**Files:**
- Create: `src/components/reports/report-library-panel.tsx`
- Modify: `src/components/reports/club-overview-client.tsx`
- Test: `tests/ai-reports-ui.test.mjs`
- Test: `tests/ai-report-library.test.mjs`

- [ ] **Step 1: Write failing UI structure assertions in `tests/ai-report-library.test.mjs`**
  - Verify `ClubOverviewClient` provides 4 mode controls (`Executive Brief`, `Document Studio`, `Custom Query`, `Saved Library`), places `AiSummaryPanel` **before** the KPI grid inside `Executive Brief`, and renders `ReportLibraryPanel` in `Saved Library`.
  - Verify `ReportLibraryPanel` supports filtering (`All`, `Approved`, `Drafts`, `Data Updated`), search input, `"Data Updated"` stale indicator, `"Open"` handler switching into the right studio mode/scope (or linking to `/finances` for `club_finance`, `/dues` for `dues`, `/events/[id]/dashboard` for `event_finance`), and direct `"PDF"` export link when applicable.
- [ ] **Step 2: Run tests to confirm RED**
  - Run: `node --test tests/ai-report-library.test.mjs tests/ai-reports-ui.test.mjs`
- [ ] **Step 3: Build `ReportLibraryPanel` & refactor `ClubOverviewClient` into the 4-Mode Segmented Studio**
  - `ReportLibraryPanel`: clean responsive list of saved reports & drafts with status badge (`Approved` / `Draft`), optional `Data Updated` amber badge, report type tag, date/scope, search + filter pills (`min-h-[44px]`), empty state, and `Open` / `Download PDF` actions.
  - `ClubOverviewClient`:
    - Top bar: Title `"AI Reports Centre"`, disabled-provider banner citing `GEMINI_API_KEY` and `GROQ_API_KEY`.
    - 4-mode segment strip (`Executive Brief`, `Document Studio`, `Custom Query`, `Saved Library` with count badge) — automatically starts in `Document Studio` if `initialDraftDoc` or `initialMeetingId` was passed via URL, or respects `?mode=`.
    - `Executive Brief` mode:
      1. `PeriodSelector` bar (`Current Month`, `Previous Month`, `Current Year`, month select, `min-h-[44px]`).
      2. Primary **AI Executive Briefing** (`AiSummaryPanel`) right near the top!
      3. Direct **Export Actions** bar (`Executive Pack PDF`, `Summary CSV`, `includeAi` checkbox).
      4. Compact 6-KPI grid (`2x3` mobile -> `3x2` / `6-col` desktop) + 2-col Expense Breakdown & Top Events cards.
    - `Document Studio` mode: wraps `DocumentDraftEditor` cleanly.
    - `Custom Query` mode: wraps `CustomReportBuilder` cleanly.
    - `Saved Library` mode: renders `ReportLibraryPanel`, where clicking `"Open"` on `club_overview` / `agm_statement` / `treasurer_report` / `minutes` navigates/switches cleanly into the matching mode + parameters.
- [ ] **Step 4: Run targeted tests to confirm GREEN**
  - Run: `node --test tests/ai-report-library.test.mjs tests/ai-reports-ui.test.mjs tests/ai-custom-report.test.mjs tests/ai-drafts.test.mjs`

---

## Task 8: Full Verification Gate (`tsc`, `lint`, `npm test`, `npm run build`) + Visual Verification

**Files:**
- Modify if any lint/type errors surface across modified files.

- [ ] **Step 1: Type check & Lint**
  - Run: `npx tsc --noEmit ; if ($?) { npm run lint }`
  - Expected: zero TypeScript errors and zero Biome lint/format errors.
- [ ] **Step 2: Run Full Test Suite**
  - Run: `npm test`
  - Expected: 100% passing across all tests with zero skipped/failing assertions.
- [ ] **Step 3: Production Next.js Build**
  - Run: `npm run build`
  - Expected: Clean production build of `/finances`, `/officers/reports`, and all API routes.
- [ ] **Step 4: Clean git check**
  - Run: `git status --short ; git diff --stat` to confirm only intended files on `feat/finances-reports-redesign` are modified and clean commit history is maintained.

---

## Self-Review Check against Spec

- **Decision 1 (`Dues Income` vs `Current Balance`):** Covered in Tasks 3 & 4 (`postLaunchDues` / `preLaunchDues` breakdown + explicit Verified Current Balance formula strip without mutating SQL).
- **Decision 2 (Club Finance AI Summary):** Preserved inside Tab 3 (`Treasury Setup & Audit`) with `"Open AI Reports Centre"` shortcut (Task 5).
- **Decision 3 (`Saved Library` scope):** Loads `status IN ('draft', 'approved')` excluding `'discarded'`, ordered by `updated_at DESC`, with `Data Updated` stale indicator (Tasks 6 & 7).
- **Decision 4 (Security/integrity fixes):** Covered in Tasks 1, 2, 3, 5, and 6 (`return_url` sanitization, custom PII stripping/guard, 30s LLM deadline alignment, NL translation quota counting, `payment_method` in ledger, `finance_receipt_attached` + `club_payment_settings_updated` audit filters, dynamic WAT `today` & `idempotency_key`, `CategoryManagementModal` + `ReceiptModal` hygiene, `DocumentDraftEditor` meeting switch reset, `GROQ_API_KEY` notice).
