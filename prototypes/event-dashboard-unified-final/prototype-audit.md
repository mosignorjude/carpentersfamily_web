# Event Dashboard redesign audit

## Scope and method

This report follows the supplied task brief. I inspected the Carpenters Family application and its design guidance first, then read the source of all three supplied prototypes. The application and the three source files were read-only throughout. The new prototype and this report are confined to the new prototypes/event-dashboard-unified-final/ directory.

The supplied prototypes could not be opened in the available browser-control surface: it rejected their file:// URLs and explicitly blocked alternate browser or local-server workarounds. Their source could still be inspected in full. As a result, the comparison below is a source audit; it does not claim that the three originals were visually or functionally tested in a browser.

## A. Existing application assessment

### Structure and connected routes

The project is a private Next.js App Router and React application backed by Supabase. The event list is /events; an event opens a per-event workspace at /events/[eventId]/dashboard. The event finance URL redirects to that dashboard. Attendance links redirect to the Meeting Hub with the event selected. The general Events list excludes meeting events.

The global app shell uses a desktop side navigation and a mobile sticky header with a menu. Its areas include Home, Events, Tickets, Meeting Hub, Dues, Finances, Announcements, Polls, and officer-only Member Admin. The dashboard is one event workspace within that shell, not a replacement for the Events list or Meeting Hub.

### Current dashboard and workflows

The event dashboard has eight primary tabs: **Overview**, **Tickets**, **Expenses**, **Budget**, **Revenue**, **Reports**, **Team**, and **Audit Log**. On mobile, the current UI exposes four tabs and a More menu for the remaining sections; on desktop, it uses a horizontally scrollable tab row.

- **Overview** shows event finance and budget measures and links into the relevant event functions.
- **Tickets** manages event ticket tiers, capacity, sales, and sale records.
- **Expenses** and **Revenue** maintain separate event ledgers. Expense payment state distinguishes Paid/Deposit from Pending/Unpaid.
- **Budget** holds the approved ceiling and allocation percentages/categories.
- **Reports** provides a financial statement and export actions.
- **Team** shows assigned event roles as a read-only event view.
- **Audit Log** supports transaction/history review, filtering, details, receipt actions, voiding, and correction paths.

The related flows include event edits and lifecycle changes, recording expense/income/ticket transactions, category management, budget-ceiling changes, ticket-tier setup, detail drawers, required-reason correction/void actions, and report export. Event lifecycle and completed/cancelled states have locking and reopening rules. The interface also has loading, error, access-denied/not-found, validation, empty and success states.

### Data, permissions, and rules to preserve

The event model supports **meeting**, **party**, and **other** types; the Event Dashboard itself serves general event finance. Statuses are scheduled, completed, and cancelled. Ticket tiers and capacity are event-specific. Finance records are event-scoped and support receipts and review/audit state. Budget categories use allocation percentages; allocations may leave an unallocated remainder.

Server-side role helpers distinguish global event managers (Executive/Admin/President), event finance managers (those managers plus event lead/assistant), Admin/President correction rights, and narrower event lifecycle or budget rights. The Team tab is a view of assignments; role assignment is managed elsewhere. Meeting attendance, minutes, officer controls, meeting creation, and self check-in belong to Meeting Hub and must stay separate.

Two implementation mismatches need resolution before translating the prototype into product code:

1. The brief describes committee members recording income/expenses, but the current finance action helper does not grant committee members that permission.
2. The server permits event assistants in some finance actions, but the dashboard’s visible canRecord controls do not expose recording to assistants. Ticket-tier and category grants also differ by action. The actual UI and server authorization should be reconciled before finalizing the role matrix.

The event form currently exposes Party and Other, while meeting creation is a Meeting Hub responsibility. The database/RPC also supports meeting event type. Ticketing is restricted to Party in the existing setup, although broader feature combinations are described in the supplied brief. This is another product-rule question, not something the prototype silently changes.

### Design authority

DESIGN.md and the shipped app styles set the visual direction: Espresso #3D291F, Forest #174C37, Deep Forest #0C3325, restrained Ochre #D6A23A, white, Warm Canvas #FAF6F0, and Linen #E5DDD3. DM Sans is the interface font; IBM Plex Sans is an available local fallback, including for Naira. The system uses a 4/8/16/24/32 spacing rhythm, 16px mobile gutters, modest card/control radii, 44px minimum touch targets, visible focus, semantic labels, and readable mobile replacements for dense tables.

## B. Three-prototype comparison

All three prototypes are design explorations, not the source of product permissions or financial rules. Their sample figures, people, approval claims, and supporting organizations are not verified application data.

| Area | Gemini prototype | Antigravity prototype | Existing unified prototype | Final decision |
|---|---|---|---|---|
| Main navigation | Five sections: Overview, Tickets, Budget & Streams, Ledger, and Statement. Simplifies the original eight tabs, but combines budget with revenue streams and puts team content beside the statement. | Five sections: Overview, Tickets, Expenses & Budget, Revenue, Reports & Audit. Separates income and expense, but combines budget with expenses and audit with reporting. | Five sections: Overview, Tickets, Budget & Streams, Ledger, and Statement & Team. Keeps the compact structure but preserves the unrelated Statement/Team grouping. | Use six direct sections: Overview, Tickets, Budget, Transactions, Team, Reports. Keep Reports’ related summary/history views together. |
| Tickets | Dedicated ticket page, tier inventory, and status-filtered ticket records. | Dedicated tier and ticket-sale area with status filters and capacity. | Dedicated Tickets tab and scenario-aware sales list. | Keep tier and capacity management together. Use one searchable event transaction list for ticket-sale details to avoid duplicating the ledger. |
| Income and expenses | Consolidates revenue, expenses, and ticket sales into a general ledger; this is a useful step toward one transaction search, but business types and views are not always distinct. | Separate revenue and expense areas, with repeated card-ledgers and several status filters. | Unified ledger with type/status filtering and detail drawer; this is the strongest base for a combined transaction list. | One Transactions list with type, status, and search filters; keep payment status distinct from transaction review status. |
| Budget | Budget subtabs for cost centres, revenue streams, and cash flow. Includes targets and a revenue model that are not supported by the app’s established event data. | Budget allocation appears inside Expenses; repeated tables and clipped amounts make the grouping hard to scan. | Combines budget and revenue streams and carries target values into the event workspace. | Give budget its own section with ceiling, allocation shares, spend, and commitments. Do not invent revenue targets or stream targets. |
| Reporting and audit | Statement combines financial reporting and team material. Its audit specification correctly identifies clipped tables, duplicate expenses/budget views, ledger fragmentation, and mismatched ticket totals in the source recording. | Reports combines financial statement and master audit journal. It includes unsupported “reconciled” and organizational sign-off language. | Statement & Team groups unrelated material; exports and transaction actions are represented by alerts/prompts rather than report files or persisted sample mutations. | Reports has Financial summary and Change history. Use plain report language without official reconciliation, location, founding-date, or sign-off claims. |
| Team | Shows committee/team in the same statement-oriented section and offers a role assignment form in the dashboard. | Includes a committee list and an assignment modal with phone details. | Retains a team view inside Statement & Team and offers dashboard assignment actions. | Show the assigned roster read-only in Team and Overview. Link to the existing Member Administration workflow; do not duplicate assignment authority. Omit phone numbers. |
| Interactions | Stateful scenario, role, and viewport controls; rich local mutations, filters and overlays. Several controls use alerts/prompts, generic roles, or unsupported models. | Ticket/expense status filters and tab switching update the screen. Many forms, approvals, allocation actions, downloads, and voucher actions only alert or prompt; event role simulation is only Officer/Lead versus Member. | Scenario switching, filters, rendering, and some local mutations are implemented. Numerous actions still alert or use prompts, receipt and export actions are placeholders, and lifecycle edits can skip the app’s reason/confirmation requirements. | Keep review controls as a clearly labelled design-preview harness. Use in-memory state, validated forms, accessible dialogs, required reasons, explicit confirmation, and generated local CSV. |
| Responsive strategy | Provides a viewport chooser and mobile/desktop preview modes, but the main nav still aims to fit five direct tabs and some mobile simulation is controlled by a wrapper. | Mobile-first narrow frame, horizontal tabs, and a desktop wrapper toggle. | Adds a viewport/scenario harness and combines multiple ledgers; its desktop viewport option is a wrapper change. | Use the product shell, a horizontally scrollable event tab row on mobile, card rows instead of a clipped financial table, and a full desktop table. Actual rendering could not be browser-checked. |
| Visual system and copy | Uses the Carpenters Family palette and fonts in code, but compresses controls, adds targets and labels not established by the app, and includes overconfident report copy. | Uses a related palette, but introduces denser layout and bureaucratic/compliance-style language and unsupported sample details. | Uses the warm green/brown palette and simplified navigation; includes a generic logo/control treatment and prototype warnings in the product view. | Use the app’s local fonts/tokens and plain copy. Keep the prototype label outside the product shell and make sample data obvious. |

### What the unified prototype improved and what it weakened

It retained Gemini’s five-section simplification, Antigravity’s ticket area and status filtering, and a more unified transaction ledger with scenario states. Those are useful ideas. It did not resolve the unrelated **Statement & Team** grouping, did not restore a clear home for the distinct Team view, and still couples Budget with Streams. Its controls create a more convincing appearance of working software than the underlying alerts/prompts support. The role switch treats officers as one role, lifecycle editing can skip the app’s reason/confirmation requirements, receipt/export controls do not deliver files, and stream targets, complimentary counts, phone details, “reconciled” labels, and organizational sign-offs are not authoritative product features.

The final prototype keeps the navigation reduction and consolidated transaction search, while correcting the grouping, avoiding unsupported finance targets and claims, and representing off-dashboard assignments as a separate app workflow.

## C. Decision matrix

| Decision | Source | Reason |
|---|---|---|
| Retain | Gemini: fewer top-level sections and scenario previews | Fewer sections make event navigation easier to understand; scenarios help reviewers inspect populated, pressured, and empty states. The role/scenario controls are explicitly prototype controls. |
| Retain | Antigravity: ticket inventory and status filters | Ticket tiers, capacity, sales, and pending/approved/cancelled states are key event workflows. |
| Retain | Existing unified: one transaction ledger with type/status filters and a detail view | A single search surface reduces the four-ledger fragmentation called out in Gemini’s audit. |
| Combine and improve | Existing separate Expenses/Revenue/Budget/Reports/Audit tabs | Transactions combines journal records while Budget remains about allocations and Reports keeps summary and change history. This preserves meanings without repeating data tables. |
| Redesign | Mobile event navigation and transaction presentation | Six purpose-named tabs can scroll horizontally. Financial rows become labeled cards on phones; desktop keeps a full table. The layout is designed for narrow screens but has not been rendered in a browser. |
| Redesign | Role preview and destructive actions | Preview named application roles instead of a generic officer/member toggle. Require a reason and confirmation for voiding; corrections and review actions are shown by role. The exact rules remain subject to the source mismatches above. |
| Remove | Stream targets, gross revenue target, complimentary pass counts, online/member sales channels, phone numbers, invented committee titles | These are unsupported or unnecessary for the existing application and can make sample information look authoritative. |
| Remove | Official reconciliation, compliance, location/founding details, officer sign-offs | Those claims are absent from the authoritative event model and should not appear on a design prototype report. |
| Remove | Meeting attendance, minutes, meeting creation, office controls | They are owned by Meeting Hub. The global navigation remains a separate-area reference only. |

## D–E. Final design and information architecture

The new static prototype follows the existing warm neutral, forest green, and espresso design system. It uses locally copied DM Sans and IBM Plex Sans assets, high-contrast text, clear focus rings, semantic sections, labelled forms, accessible tab relationships, responsive cards, and reduced-motion support. Its toolbar labels all content as sample data and separates preview controls from the product shell.

1. **Overview** — event identity and status; approved income, spent, balance, pending-review count; budget use and commitments; ticket totals; latest transactions; short team preview.
2. **Tickets** — ticket type setup, price, sales, remaining capacity, add/edit/retire actions, and ticket sale recording. Individual ticket transactions remain in the full Transactions list.
3. **Budget** — approved budget ceiling, spent/committed amounts, category allocations and unallocated share, with budget/category management controls.
4. **Transactions** — one event journal for expenses, income, and ticket sales; search, type/status filters, details, receipt metadata, review, correction, and void paths.
5. **Team** — read-only assigned roster. Assignment management points to Member Administration, outside this dashboard.
6. **Reports** — **Financial summary** and **Change history** subtabs. CSV export downloads locally; print opens the browser’s print/save-to-PDF flow.

The event header includes the event status, date/time/venue, event actions, and a record action. Main app navigation is visually represented; its other areas open an explanatory notice because they are outside this standalone prototype. Meeting Hub is not duplicated.

## F. Prototype behavior and boundaries

The prototype is built from plain HTML, CSS, and JavaScript; it has no framework build, external CDN, backend, production credentials, or network dependency. All changes exist only in page memory and reset on refresh. The CSV is generated from current sample data. Receipt names are descriptive sample metadata; selected files are not uploaded or retained. PDF output uses the browser print dialog and contains no official sign-offs or reconciliation claims.

The three preview scenarios are an upcoming event with data, a budget-pressure example, and a new empty event. The role preview offers Member, Committee, Event assistant, Event lead, Executive, and Admin/President. Preview access is a design aid, not authentication.

## G. Feature coverage checklist

- [x] Event identity, status, date, time, venue, and event-detail edit form.
- [x] Overview finance measures, ticket totals, budget use, latest activity, and team summary.
- [x] Ticket type add/edit/retire, ticket price, capacity, tickets sold, and remaining capacity.
- [x] Ticket sale recording with quantity/capacity checks; generated sale totals are derived from the selected ticket type.
- [x] Budget ceiling changes with a required reason; category shares; an unallocated remainder; spend and commitments.
- [x] Expense allocation categories and income categories can be managed; categories already used by transactions are protected from removal.
- [x] One transaction list for expenses, income, and ticket sales with search and type/review-status filters.
- [x] Expense/payment states distinguish Paid/Deposit from Pending/Unpaid; transaction review state is separate.
- [x] Transaction detail view, receipt metadata, pending approval/rejection, correction, and void with reason; void includes a confirmation step.
- [x] Financial summary and event change history, including interactions performed during the current preview session.
- [x] CSV download and print/save-as-PDF flow.
- [x] Read-only event team, with a boundary to Member Administration for assignments.
- [x] Scheduled/completed/cancelled status choices, status-change reason, and Admin/President-only reopening in the role preview.
- [x] Empty scenario, no-results search state, form validation errors, role-restricted controls, and success toasts.
- [x] No meeting attendance, minutes, meeting creation, self check-in, or office controls in the Event Dashboard.
- [ ] Backend persistence, real role authentication, receipt upload/viewing, and connected routes — intentionally not implemented.
- [ ] Browser-rendered loading and network-failure states — this prototype has no asynchronous service calls, so those app states are not represented as fake loading screens.

## H. Validation report

### Source-level checks completed

- Confirmed the final directory is new and separate from the application and supplied prototype files.
- Reviewed the final HTML, CSS, and JavaScript source after implementation.
- Ran node --check on app.js; it passed.
- Checked the generated sample data and financial formulas by source inspection. The populated scenario has 46 tickets sold, ₦450,000 approved ticket income, ₦1,370,000 total approved income, ₦834,000 approved paid/deposit expense, a ₦536,000 balance, and ₦180,000 in pending commitments.
- No production application, backend, authentication, or database operation was run.

### Browser and responsive checks not completed

The available browser-control tool rejected the local-file protocol and specifically prohibited reaching the same result through a different browser, local server, browser command, or alternate surface. I stopped after that response. Therefore no viewport below was visually rendered, and no button, form, dropdown, dialog, filtering, export, or keyboard interaction was executed in a browser. The responsive CSS includes narrow, tablet, desktop, and large-desktop rules, but appearance and runtime behavior remain unverified.

| Requested width | Browser verification |
|---:|---|
| 320px | Not run — local-file preview blocked |
| 375px | Not run — local-file preview blocked |
| 390px | Not run — local-file preview blocked |
| 430px | Not run — local-file preview blocked |
| 768px | Not run — local-file preview blocked |
| 1024px | Not run — local-file preview blocked |
| 1280px | Not run — local-file preview blocked |
| 1440px | Not run — local-file preview blocked |
| 1920px | Not run — local-file preview blocked |

The prototype’s interactions are implemented in source but are not claimed as tested. The user can review them by opening index.html; README.md gives a short walkthrough.

## I. Implementation readiness

Before adapting this direction to the real application:

1. Reconcile the product brief’s committee recording permission with the server helpers and current dashboard UI; resolve the assistant recording mismatch too.
2. Confirm which event types can enable ticketing and finance features. Current create-event UI, RPC/database support, and brief do not align exactly.
3. Confirm the authoritative rules for transaction review versus payment state, and whether pending-review paid expenses count as commitments until approved. The prototype keeps those states separate and documents its calculation.
4. Confirm who may edit/retire ticket tiers and categories, and which lifecycle changes require a reason, confirmation, or Admin/President reopening.
5. Confirm how the real financial report should label balances and whether the existing exports and receipt actions meet the same display rules. This prototype intentionally avoids unverified “reconciled” or signed-off claims.
6. When implementation begins, connect event team assignment to Member Administration and keep Meeting Hub routes and responsibilities separate.

The final prototype is suitable for design review, not direct production implementation. Its browser behavior and responsive appearance should be reviewed after opening the local index.html; backend and authorization behavior must continue to come from the actual app.
