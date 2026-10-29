# UI/UX Audit — Carpenters Family Portal (mobile & responsiveness)

**Report only.** This Markdown file is the report artifact. No application source, configuration, or database records were changed.

**Environment note (2026-10-29):** This report now includes the earlier local production-build audit, the authenticated hosted feature-preview check, and the authenticated localhost recheck. The hosted check used a Vercel feature deployment, **not the canonical public production domain**. See the dated addendum at the end for the later browser observations and environment distinctions.

## Method & limits

Production build (`BUILD_ID SRdBaem`, 02:45, matching HEAD `b5f073f`) served at `http://127.0.0.1:3001`, driven through the in-app browser as the signed-in Club Administrator. The controlled viewport is locked at **510×425 CSS px**, which sits in the mobile band (below `sm:` 640px and below the 896px sidebar breakpoint), so all mobile media queries were live. I could not emulate 360/390px directly — the app correctly sends `X-Frame-Options: DENY`, so iframe emulation was blocked — so narrow-width claims use viewport-independent intrinsic widths (`scrollWidth`) instead. The old `next start -p 3001` (started Oct 27, serving a stale in-memory build) was replaced with a fresh one; **it was stopped after the report** (that PID is long gone; do not kill it by number).

Screenshots: [01-home](assets/ux-audit-2026-10-28/01-home-510.png) · [02-dues](assets/ux-audit-2026-10-28/02-dues-510.png) · [03-finances](assets/ux-audit-2026-10-28/03-finances-510.png) · [04-event-dashboard](assets/ux-audit-2026-10-28/04-eventdash-510.png) · [05-revenue-clipping](assets/ux-audit-2026-10-28/05-revenue-510.png). Capture stopped after the browser surface went hidden; findings 6+ are DOM-measurement evidence.

**Caveat:** local Supabase is behind hosted (no `verification_*` columns on `event_ticket_sales`), so `/finances` "Ledger Data Unavailable" is partly data drift — but the *copy* of that state is a real finding.

| Severity | Count |
| --- | --- |
| 🔴 Blocker | 2 |
| 🟠 Major | 21 |
| 🟡 Minor | 11 |

---

## 🔴 Blockers

### B1 — Financial tables are clipped and unreachable on phones, not scrollable

On Revenue, Expenses, Tickets and Audit Log tabs, 2 of 7 columns are cut off **and cannot be reached by swiping**. Measured at 495px viewport:

- `.event-finance-panel` (the tab content div at [event-dashboard-view.tsx:585](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/event-dashboard-view.tsx#L585)) has `overflow-x: clip` at [globals.css:8736-8740](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L8736-L8740). `clip` — unlike `hidden`/`auto` — **cannot be scrolled programmatically or by touch**.
- The panel measured `clientWidth 461 / scrollWidth 678`; setting `scrollLeft = 500` left it at `0`.
- The inner `overflow-x-auto` wrapper at [tab-revenue.tsx:135](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/tab-revenue.tsx#L135) never constrains — it measured 623px wide, identical to the table, so it has nothing to scroll. `whitespace-nowrap` + `min-w-[140px]` cells ([:180-195](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/tab-revenue.tsx#L180-L195)) push intrinsic width past the viewport.
- Clipped headers: `Fulfillment %` (right edge 591px), `Status` (674px). `Review Status` and `Actions` — which contain the approve/reject buttons — are entirely off-screen on all three money tabs.

Visible in [screenshot 05](assets/ux-audit-2026-10-28/05-revenue-510.png): card subtitles are also severed mid-word ("…across authorized club revenue chann"), the green `+` add-button is half cut, and the empty-state message drifts right because it centres inside the 663px overflowing box. [tab-expenses.tsx:138](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/tab-expenses.tsx#L138) already carries a `min-w-0` attempt, which did not fix it — the constraint has to hold at every ancestor level, and the `clip` has to go.

This directly contradicts the project's own contract at [DESIGN.md:32](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/DESIGN.md#L32): *"At phone widths, replace dense financial tables with readable, labeled rows/cards."* All 14 tables in the app use `overflow-x-auto` only; **no card fallback exists anywhere**.

### B2 — Three items in the mobile navigation are below the fold and cannot be reached

The menu panel is `position: fixed; top: 4.5rem` with **no `max-height` and no `overflow-y`** ([globals.css:4005-4017](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L4005-L4017), [mobile-app-menu.tsx:51](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/mobile-app-menu.tsx#L51)). Measured live on the home page: panel height **483px from top 72px = bottom 555px**, viewport **425px**.

Off-screen items: **Polls**, **Member administration**, **Sign out**. Because the panel is `fixed`, scrolling the page does not reveal them — I verified `panelTop` stayed at `72` after scrolling the document to 2057px. This affects landscape phones, small Androids, any phone with a software keyboard open, and the WCAG 1.4.10 minimum 320×256 reflow target. Keyboard users get focus landing on invisible controls.

---

## 🟠 Major findings

### Dimension 11 — responsive adaptation

1. **Every form field is 12px, which triggers iOS auto-zoom.** All 8 inputs in the Record Transaction modal computed `font-size: 12px`; 23 inputs share the literal class `w-full h-10 px-3 text-xs` (e.g. [event-category-management-modal.tsx:338](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/modals/event-category-management-modal.tsx#L338)) and 173 lines pair `text-xs` with input styling out of 212 `<input>` elements. Safari zooms to 16px-equivalent on focus, then leaves the user panning a zoomed page. `h-10` is also 40px — under the 44px floor in [DESIGN.md:25](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/DESIGN.md#L25).
2. **Half the event workspace is behind an invisible horizontal scroll.** The tab strip ([event-dashboard-view.tsx:552](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/event-dashboard-view.tsx#L552)) is 413px wide holding 877px of tabs — **464px (53%) hidden**, no fade, no mask, no scrollbar (overlay scrollbars are invisible on mobile). Revenue, Reports, Team & Roles and Audit Log are effectively undiscoverable.
3. **Touch targets far below 44px, everywhere.** 99 inline `min-h-[NNpx]` values under 44px. Measured per page: dues **27**, event dashboard **19**, attendance **18**, events **14**, admin **13**, home **6**. Worst: the primary "View Details & Committee Report" action on every event card is **16px tall**; filter pills are 24–28px; all 8 workspace tabs are 38px.
4. **Target spacing fails WCAG 2.5.8.** Tab pills sit **4px apart** at 38px tall — below both the 24px spacing and 44px size requirements.
5. **Two navigation systems render at once between 897–1023px.** The sidebar hides at `max-width: 56rem` = 896px ([globals.css:4052-4059](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L4052-L4059)) but the hamburger only hides at `lg:` = 1024px ([app-header.tsx:232](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/app-header.tsx#L232)). The `.app-mobile-header` rule that would resolve this is dead CSS — defined at [globals.css:3984-3986](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L3984-L3986), used in zero components.
6. **No safe-area handling.** `env(safe-area-inset-*)` appears **0 times** in the codebase. The sticky header and the fixed menu panel will sit under the notch and home indicator on notched iPhones.
7. **59 of 138 component files contain no breakpoint prefix at all** (452 breakpoint classes across 4,340 `className` strings ≈ 10%). Every heavy modal is desktop-only: `member-admin-modals.tsx` (156 classes, 0 breakpoints), `pay-dues-modal.tsx` (90/0), `record-transaction-modal.tsx` (70/0), `receipt-modal.tsx` (48/0).
8. **Two breakpoint systems that don't agree.** `@theme` in [globals.css:53-68](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L53-L68) defines no `--breakpoint-*`, so Tailwind `sm:/md:/lg:` run at 640/768/1024 while `globals.css` media queries use 42/48/52/56/70/78/82rem *plus* raw px (380/420/600/820/900). [DESIGN.md](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/DESIGN.md) defines no breakpoints at all.
9. **Modal at short viewports leaves 247px of visible form.** The Record Transaction dialog is `flex items-center` with an `overflow-hidden` panel; the inner form does scroll (verified: `FORM.p-6 overflow-y-auto`, 247px visible of 778px) so this is not a blocker, but 6 of its buttons are 38px tall at 12px text.
10. **Global search disappears below 768px** (`hidden md:block` at [app-header.tsx:262](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/app-header.tsx#L262)) with no icon-only substitute.

### Dimension 8 — aesthetics & density (the "cards to consolidate" question)

11. **Chrome comes before data.** Distance to the first real figure: dues **816px (1.9 screens)**, event dashboard **672px (1.6 screens)**, home **450px (1.1 screens)** — against a 425px viewport. The dues hero card alone is **342px tall and contains no data**; on both dues and finances the entire first viewport is eyebrow + H1 + long subtitle + identity row + status capsule + export buttons (see [screenshots 02, 03](assets/ux-audit-2026-10-28/03-finances-510.png)).
12. **Page length.** Dues **15.6 screens** (6,635px), home **8.2**, event dashboard overview **6.4**, events **5.5**, admin 3,064px, attendance 2,483px. On dues, the "Pre-Launch Dues Reconciliation Workspace" section is **1,903px** — one card taller than four screens.
13. **Event card height ≈ one screen each.** On `/events`, articles measure 414–492px for a single event.
14. **Home deduplication.** "Quick Access & Club Services" ([quick-links-section.tsx:96](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/home/quick-links-section.tsx#L96)) is **1,035px (2.4 screens)** of 9 links that already exist in the mobile menu; "Recent Member Activity & Notices" is **854px** duplicating the bell drawer. Together 4.4 of the home page's 8.2 screens are redundant.
15. **Event Overview = 12 tiles for 4 numbers.** Measured tile stack: Budget Ceiling, Core Driver, Total Realized Revenue, Total Incurred Expenses, Net Surplus — each repeating its own value in a sub-line (`₦0` then `₦0 0.0% of ₦8,000,000 target`) — then the "P&L Snapshot" card restates the same three figures as `Total Inflow / Total Outflow / Net Cash Margin`, and the burn-bar legend restates them again. Every tab re-renders the same totals (`tab-revenue.tsx:89/96`, `tab-expenses.tsx:90/98/106`, `tab-budget-allocations.tsx:208/216`, `tab-tickets.tsx:81/90`, `tab-reports.tsx:109/123/137`).
16. **Dues = 8 cards for members, 11 for officers.** The schedule table restates all four summary tiles; "My Dues Payment Submissions" and "Officer Dues Approvals Queue" render the same request rows; **three different buttons open the same pay-dues modal** ([dues-page-view.tsx:219](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/dues/dues-page-view.tsx#L219), [dues-schedule-card.tsx:192](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/dues/dues-schedule-card.tsx#L192) and `:276`). Three empty-state cards stack before any content.
17. **The event title is a heading four times** (event card, dashboard H1, `tab-overview.tsx:93`, `tab-reports.tsx:43`), and the dashboard renders it twice consecutively: `H1: Notification Fix Verification Assembly` then `H2: Notification Fix Verification Assembly — Event Financial Workspace`.
18. **Finances summary card is a pure restatement of the ledger below it** ([club-financial-summary.tsx](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/finances/club-financial-summary.tsx) 4 tiles vs [club-transaction-ledger.tsx:116](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/finances/club-transaction-ledger.tsx#L116), which is their source), and the "Event Ledger Posts & Reversals" section is a filtered view of the same rows.

### Dimension 2 — matching real-world language

19. **Institutional vocabulary throughout.** Live heading strings: "Capital Allocation & Burn Rate Matrix", "Operational Cost Centers & Budget Matrix", "Statutory Dues Schedule", "Current Month Obligation", "Pre-Launch Dues Reconciliation Workspace (Feb–Sep 2026)", "Retained Archive · Permanent Reporting Repository", "Secretariat & Assembly Roll Call". Word census in `src/components`: *ledger* 112, *reconcil\** 71, *disbursement\** 40, *secretariat* 33, *statutory* 19, *obligation* 18.
20. **Copy length.** The 15 longest member-visible strings run 158–334 characters, led by [communications-privacy-banner.tsx:25](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/communications/communications-privacy-banner.tsx#L25) (334 chars) and [tab-team-roles.tsx:96](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/events/dashboard/tab-team-roles.tsx#L96) (297). Developer-facing typography notes are shown to members: "All Figures in Nigerian Naira (₦) · Tabular Numerals".

### Accessibility & alignment

21. **Verified contrast failure: 1.92:1 on "Sign out".** On the home shell, `.app-shell-dashboard .app-mobile-menu-panel` sets a dark forest background ([globals.css:4749-4752](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L4749-L4752)) and nav links get a light override at `:4754`, but the sign-out button keeps `color: var(--color-danger)` = `#963b32` on `#073523` ([globals.css:4029-4041](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L4029-L4041)). Measured live: `rgb(150,59,50)` on `rgb(7,53,35)` = **1.92:1** against a 4.5:1 requirement. Violates [DESIGN.md:26](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/DESIGN.md#L26).
22. Supporting a11y/density items (major): heading order skips `h2` on home (`H1 → H3×5`) and on polls (`H1 → H3 → H2`); status is colour-only in `tab-budget-allocations.tsx:280-297`, `tab-expenses.tsx:184-194`, `tab-revenue.tsx:180-185` (red/amber/green, no icon or text) and the unread indicator is a bare dot at [app-header.tsx:288-291](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/app-header.tsx#L288-L291); ~39 `<label>` elements lack `htmlFor` (176 labels vs 137 `htmlFor`); **452 text declarations sit below the documented 13–14px floor** (336 at 11px, 116 at 10px); 795 raw hex colour classes bypass the token set.

### 🟡 Minor (11, two since retracted)

~~`min-height: 100vh` at [globals.css:8965](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/globals.css#L8965) while 13 other places correctly use `dvh` (iOS toolbar clipping)~~ **[retracted — not a live bug: that is the stylesheet's only `100vh`, and it sits inside the dead `.slk-*` block, so it reaches no rendered element. See "Added after the audit" below.]** · `role="menu"/"menuitem"` on a `<nav>` in the mobile menu · 8 distinct export buttons across pages · footer "Private Members Portal · Nnebisi Road Secretariat · Est. 1988" duplicated on dues and finances · 4 separate sign-out entry points · `UserProfileBadge` prints name+role+@handle three times · "Welcome Back," heading with trailing comma on the login page · "Private Member Ledger · Confidential" chip (1 use, pure decoration) · `/finances` "Ledger Status / Audited & Reconciled" capsule right-aligns inside a full-width card leaving a large void (visible in screenshot 03) · ~~[notifications/page.tsx:4](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/app/(member)/notifications/page.tsx#L4) is a dead `redirect("/")` route~~ **[retracted — the redirect is intentional and guarded by a test; it is not dead code to delete. See "Added after the audit" below.]** · a parallel duplicate attendance implementation in `events/attendance/attendance-page-view.tsx`.

---

## Consolidation recommendations

| Page | Now | Action |
| --- | --- | --- |
| Home | 6 sections, 8.2 screens | Keep greeting + dues tile. Merge Next-Up + Announcements + Activity into one "What's on" list. **Delete** Quick Access (1,035px of duplicate nav), the "Club Headquarters" capsule, and the duplicate "n of m paid" line. |
| Dues | 8 member / 11 officer cards, 15.6 screens | Hero → 3 numbers → one schedule table with inline receipts. **Delete** the summary-tile duplication in the schedule, merge My-Requests with the Approvals queue, cut 3 pay-modal triggers to 1, drop the eyebrow + 121-char subtitle + footer. Collapse the 1,903px reconciliation workspace behind a disclosure. |
| Finances | 6/8 sections | 3 tiles + one ledger with a "Source" chip. **Delete** the Ledger Status capsule, the 163-char mandate banner, and the footer. |
| Events | 3 sections, ~470px per card | Two sections (Upcoming / Past) with Archive as a filter pill. Card = date · title · venue · one action. **Delete** the zero-data capsule and the "Governance Note" that reprints the description already shown as a badge. |
| Event dashboard | 8 tabs, 12 tiles on Overview | **4 tabs**: Overview (3 tiles + burn bar + recent) · Money (revenue + expenses + budget) · Tickets · Reports. Move Audit Log and Team & Roles into an overflow sheet. **Delete** the three "Quick …" nav cards, the hardcoded "100% Reconciled" and "Fully Funded & Authorized by Trustees" strings, and the duplicated H2 title. |
| Attendance | 4 KPIs + 4 tabs | 2 KPIs (My Standing, Live Check-In). **Delete** the Roll Call Tally (duplicates the roster filters), the Active Context banner, and the duplicate page view. |
| Chrome | — | **Delete** "Private Portal" chip and 3 of 4 sign-out paths; collapse the mobile menu identity block, which repeats what the button already shows. |

**Copy:** replace matrix/burn-rate/statutory vocabulary with member language ("Where the money came in", "What we've spent", "Monthly dues", "Amount still owed", "Past events"); cap member-facing explanatory text at ~80 characters and move the four 200–334 char policy banners into a collapsible "Privacy & rules" disclosure; delete decorative reassurance lines ("Audited & verified in member ledger", "Settlement required before monthly cycle close") that carry no data.

---

## Prioritised fix order

1. **Remove `overflow-x: clip` from `.event-finance-panel` and give every financial table a phone card view** (B1) — nothing else matters while officers cannot reach approve/reject.
2. **Give `.app-mobile-menu-panel` `max-height: calc(100dvh - 5rem); overflow-y: auto`** and fix the dashboard-shell sign-out colour (B2, finding 21) — two small, low-risk CSS changes.
3. **Introduce one shared form control** (≥48px tall, ≥16px text, `inputMode` preserved) and replace the 23 `h-10 px-3 text-xs` instances plus the 99 sub-44px `min-h-[...]` — kills findings 1, 3, 9.
4. **Collapse page headers to one line and merge duplicate cards** per the table above — findings 11–18.
5. **Rebuild the tab strip as a 4-tab bar with ≥44px targets, ≥8px gaps, an edge fade, and `aria-selected`** — findings 2, 4.
6. **Unify breakpoints** to the Tailwind scale (or define `--breakpoint-*`), delete the dead `.app-mobile-header`, and resolve the 897–1023px double nav — findings 5, 8.
9. **Add `env(safe-area-inset-*)`** to the sticky header and fixed panel — finding 6.
7. **Plain-language pass + 80-char cap** — findings 19, 20.
8. **Token enforcement** (no raw hex, no `text-[10px]/[11px]`, one radius) — finding 22.

**One decision is yours:** [DESIGN.md:31](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/DESIGN.md#L31) forbids a bottom tab bar, which is why every page switch costs a menu open. A persistent bottom bar for Home / Events / Dues / Finances would remove the B2 panel entirely and cut navigation depth substantially — but it is a contract change, not a bug fix.

## What's already good

Focus indicators are real and visible (25/25 sampled focusables changed outline or ring on focus); skip-link + `#main-content` present; 288 semantic `<button>`s and **zero** `div onClick` handlers; all 9 images have `alt`; 78 `aria-label` + 70 `aria-labelledby` + 137 `htmlFor`; the mobile menu handles Escape and `aria-expanded`; `prefers-reduced-motion` is honoured in 6 places; pinch-zoom is not disabled; the main amount input correctly sets `inputMode="numeric"` ([formatted-amount-input.tsx:123](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/src/components/formatted-amount-input.tsx#L123)); and status text is paired with icons in `event-card.tsx` and `dues-summary-cards.tsx`.

**Two gaps worth flagging:** error states are descriptive but not actionable — "Ledger Data Unavailable. The ledger or balance could not be verified. No transaction records or entry forms are available." has no retry, no contact path, and blocks the officer's entry form outright. And I could not verify 360/390px or real touch behaviour; a device-lab pass on an iPhone SE (667px tall) and a small Android (568px) is the right confirmation for B1 and B2 before you schedule the rework.

---

## Added after the audit — two findings in this report were wrong

The findings below are the 2026-10-28 report as delivered, word for word. Four mechanical edits were made when it was saved to this file, none of which changed a measurement or a claim: the screenshot links were repointed from `%TEMP%` to `docs/assets/ux-audit-2026-10-28/`; the stale `Stop-Process -Id 29596` instruction was replaced, since that PID is a day old and would kill an unrelated process; the two conclusions below are struck through where they appear; and the Minor heading records that two of its eleven items were retracted.

Two conclusions did not survive verification, and a reader should not act on them:

1. **The `/notifications` route is not dead code.** Its `redirect("/")` is intentional and guarded by a test. It was listed as a cleanup candidate.
2. **The `min-height: 100vh` is not a live bug.** The only occurrence in the stylesheet sits inside the dead `.slk-*` block, so it affects no rendered element.

Also corrected during implementation: the 2026-10-27 `min-w-0` remedy for the expense-table overflow did **not** fix the clipping. The real cause was `overflow-x: clip` on the panel, which cannot scroll — that became blocker B1 of Phase 1.

The Phase 1 plan, its scope rulings, and the remaining backlog are in `docs/superpowers/plans/2026-10-28-mobile-responsive-phase-1.md`.

---

## Browser recheck addendum — 2026-10-29

This addendum records the hosted feature-preview check from 2026-10-28 and the signed-in localhost recheck from 2026-10-29. It supplements the earlier detailed audit above; its measurements are from different builds and viewport sizes and should not be compared as if they were one test run.

### Hosted feature-preview check — 2026-10-28

**Environment:** Authenticated Vercel feature deployment at `carpentersfamily-web-git-feat-mobile-responsive-e1bd3e-mosignor.vercel.app`, viewed in a roughly **503×666 px** browser window. This was a hosted feature preview, not the canonical `carpentersfamily.com.ng` production domain. The local start attempt failed while Next.js/SWC canonicalized the workspace path, so this pass used the available preview. No forms were submitted and no records were changed.

**Findings:**

- Home stacked correctly at the narrow window but was long and repeated destinations in Quick Access. The dues summary repeated the no-schedule state.
- Dues repeated the Administrator exemption explanation. Its pre-launch reconciliation area expanded into many member cards, each with eight monthly controls, creating a substantial scroll burden.
- Finances repeated shared-ledger/privacy explanations. The page included wide multi-column ledgers and a long audit feed; this pass did not verify table behavior at an exact phone viewport.
- Events used a long introductory paragraph and crowded the event-creation authorization copy. Event cards included many details and several officer actions.
- The event dashboard route for the scheduled party loaded successfully; it did not show a 404. Its overview placed many financial summaries, ticket and cost-center snapshots, and recent transactions on one long page. Its section strip relied on horizontal swiping with a text hint.
- Announcements and Polls used lengthy privacy explanations. The preview had no polls, so a vote flow could not be reviewed.
- The attendance page stacked several status cards before member check-in and officer controls. The session was inactive, so no check-in or session-opening action was attempted.
- The navigation drawer was legible and its rows were easy to identify at the preview width.

### Authenticated localhost recheck — 2026-10-29

**Environment:** `http://127.0.0.1:3000`, signed in by the user as a local Club Administrator. Responsive viewport set to **390×844 px**. Local Supabase data was available. The browser was returned to its default viewport and Home after review. Page-route navigation and non-mutating inspection only; payment, attendance activation, reconciliation, event edits, announcements, votes, and exports were not submitted.

**Measured layout and content findings:**

| Page | Local observation at 390 px | Finding |
| --- | --- | --- |
| Home | 3,834 px document height; no page-level horizontal overflow | Repeats “no dues scheduled” in several places; Quick Access duplicates destinations already in navigation and other cards. |
| Events | 2,592 px height; no page-level overflow | Long introduction; filters are in a horizontally scrollable strip, with some labels partly out of view initially. Event-creation role text wraps across several lines. |
| Event dashboard overview | 2,924 px height; no page-level overflow | Route loads. Header context links and status wrap tightly; prominent financial summaries and repeated action buttons increase density. |
| Event dashboard Tickets section | Document width about **664 px** at 390 px viewport; ticket panel about **633 px** wide | Seven-column ticket ledger and admission-tier panel extend beyond the viewport, clipping content at the right edge. This is the clearest confirmed local mobile layout defect. |
| Event dashboard Budget section | 1,211 px document height; no page-level overflow | Deep link renders the budget section and its empty state correctly. |
| Attendance | 2,702 px height; no page-level overflow | Summary says “100%” while also saying “0 of 0 assemblies attended,” which is hard to interpret. Several summary cards precede the roster and officer controls. |
| Dues | 7,263 px height; no page-level overflow | Reconciliation workspace is expanded by default and lists six members with eight monthly controls each. Exemption copy is repeated; “Pay Dues” is shown for an exempt account with no scheduled months. |
| Finances | 2,284 px height; no page-level overflow | Local balances and ledger entries could not be verified, so populated table behavior was unavailable. Introductory and privacy copy repeat some context. |
| Announcements | 1,170 px height; no page-level overflow | Privacy policy occupies substantial space; revision history is reported unavailable. One local notice was visible. |
| Polls | 891 px height; no page-level overflow | Long policy copy precedes an empty state; no voting flow was available to inspect. |
| Member administration | 3,378 px height; no page-level overflow | Governance guidance uses several cards before requests and roster. Six roster entries, event staffing, and audit history make this a long page. |

**Interaction verification caveat:** In the local browser-control session, clicks on event filters, dashboard section pills, and the membership-requests disclosure produced no visible state change. Filling the member search field displayed the entered text while the roster still showed all six entries. Deep links to Tickets and Budget rendered their sections, and no browser console errors were reported. Treat this as an unresolved interaction/runtime concern until the same controls are manually tapped in a normal browser session; the automation surface may also have contributed. These observations were not used to claim that every flow passed.

### Updated remediation order

1. Manually verify local button, filter, disclosure, search, and dashboard-section interactions. Fix any confirmed handler or hydration failures and retest with keyboard input.
2. Fix the Ticket section’s page-level overflow. Convert the ledger to labeled mobile cards or constrain a clearly signposted table scroller within the panel.
3. Collapse the dues reconciliation workspace by default; add member search or per-member detail. Combine exemption copy and clarify or hide the payment action when dues are exempt or unscheduled.
4. Deduplicate Home’s dues and Quick Access content. Replace the attendance `100% / 0 of 0` state with a clear no-history message.
5. Condense Member administration’s governance intro and keep roster/audit browsing compact on phones.
6. Shorten Events copy and make every filter label discoverable without relying on a hidden horizontal strip.
7. Recheck Finance tables when verified local data is available, then complete keyboard, screen-reader, zoom/reflow, contrast, and touch-target checks at 390 px and narrower.

**Scope note:** The production-domain UI was not rechecked in this pass. The hosted findings above are from the feature preview; the latest measurements are from localhost. No code, configuration, or database state was changed by this audit.
