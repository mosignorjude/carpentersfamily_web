# Security and architecture decisions

Resolved decisions are recorded below. The remaining items are unresolved; do not implement the affected authorization or business behavior until the user decides. Recommendations are proposals, not requirements.

## Resolved role decisions

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-001 | Both Admin and Backup Admin may reopen completed or cancelled events. At least one primary Admin must remain active. | Step 7 database procedures allow Admin/Backup Admin reopening. Step 2 serializes role changes and blocks removal/deactivation of the last active primary Admin. |
| D-002 | Admin and Backup Admin may grant or remove Executive status. The primary Admin is the master role and alone may appoint or replace primary/Backup Admins. | Separate role values and checked database RPCs; the active primary Admin invariant is database-enforced. |

## Resolved authentication decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-003 | Use Supabase Auth's automatic linking for matching verified email identities. Do not enable its beta manual-linking feature in this release. This accepts Supabase's native same-verified-email behavior; it is not a policy requiring a separate explicit click for every identity link. | Email/password accounts require confirmation; membership stays pending until an authorized approver activates it. PostgreSQL checks current member status for every protected operation. Google OAuth still requires credentials configured outside Git. |

## Resolved dues decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-007 | One current financial disposition per member/month: paid or written off. Approval/reactivation month is included in dues eligibility, deactivation month is excluded, and inactive gaps are not billed. Payment may cover selected full months, including future months, only when the amount equals the applicable full-month rate total. Rates are immutable after taking effect; Admin/Backup Admin may set or correct next month's scheduled rate. Already-paid future months retain their captured amount. Old unpaid months may be written off with a reason by Executive/Admin/Backup Admin. Payment corrections and rate changes require a reason and retain before/after audit history; only Admin/Backup Admin may correct payments. | Forced RLS keeps each member's individual dues private; active members may query only the fixed club aggregate. Unique month dispositions, locked atomic procedures, rate snapshots, append-only history, and role checks enforce these rules. See Step 4 tests in the roadmap. |

## Resolved financial transparency decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-005 | Active members can view payer/payee details and any available receipt attached to shared club or event financial records. Individual member dues details remain private. | Steps 5 and 8 expose member-readable finance rows through forced RLS and limited column grants. Club and event receipts use the private shared bucket and session-checked linked-record Next.js routes; direct client Storage access and public/signed URLs are denied. Dues records continue to follow D-007 privacy. |

## Resolved event-retention decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-006 | Financially active events are archived as retained tombstones. Events and their budgets, role history, finance links, ticket sales, receipts, ledger entries, and audit history are never hard-deleted or cascade-deleted. Active members may read retained event details, staffing, budgets, and shared event-finance details. Archive reasons and full audit history remain officer-only. Older past events become read-only after the latest four past events; explicit archival is still allowed. | Steps 7–8 use restrictive foreign keys, a hard-delete rejection trigger, forced RLS, append-only audit, reason-required archive, and a database-enforced past-event retention boundary. |

## Resolved event-finance role decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-010 | Committee is a distinct read-only event role and does not grant event income/expense or ticket-tier mutation. This resolves the initial brief's broader Committee write permission in favor of the user's later approved boundary. Assigned Lead/Assistant can manage finances only for their event; Executive/Admin/Backup Admin can manage event finances globally. Any active member may sell tickets and edit only their own sale with a reason. Admin/Backup Admin alone may correct/void event transactions, edit another seller's sale, refund tickets, and reopen completed/cancelled events. | `private.can_manage_event_finances` and mutation RPCs recheck active member, current global role, and event-scoped Lead/Assistant relationship. `private.can_correct_event_finances` restricts historical correction/refund paths to Admin/Backup Admin. Forced RLS and direct-write revocation deny table bypasses. Step 8 pgTAP tests verify each boundary, including Committee denial and cross-event role isolation. |
| D-013 | Event finance categories are shared across events. Active Admin/Backup Admin may create, rename, and retire budget-allocation, expense, and revenue categories with a reason. Active members can read current and retired names; retired categories remain visible for historical context. | Forced RLS and column-limited grants provide member reads. Checked database procedures recheck active Admin/Backup Admin status under the administration lock, deny direct table writes, and append an audit record for every change. |
| D-014 | Event budget allocations and manual event income/expense records reference the shared category catalog and retain the category name used at entry. An expense may also reference one of the event's budget-allocation categories. Expense statuses match SLK Rave: Paid and Deposit count as actual spending; Pending and Unpaid count as commitments. Manual revenue counts as received only when Paid. Existing transactions remain Paid and uncategorized so historical totals are preserved. | Category IDs are nullable only for legacy rows; new writes require an active category of the matching type. Event allocation links are checked against the event's current budget and retain their own name snapshot. Database checks restrict status by transaction kind, checked procedures snapshot names and audit corrections, and the event summary reports actual spend separately from commitments. |
| D-011 | Active members can read saved minutes and only their own attendance. Primary Admin/Executive may write/edit minutes, open/close attendance, issue event QR challenges, and change the club-wide late cutoff. Backup Admin can review/correct attendance globally but does not inherit those session-control or minutes-author permissions. Assigned Lead/Assistant can review/correct attendance only for their event. Committee remains self-only. Members check in as themselves by button or QR. Initial cutoff is 15 minutes after the stored event start; an Admin/Executive can override it per event at session open. | Forced RLS and column grants restrict roster/secret visibility. User-session RPCs derive the actor from `auth.uid()`, lock event/session state, enforce active membership, feature/state eligibility, cutoff and uniqueness, and append reasoned correction audit. QR tokens are 256-bit random, hash-only in PostgreSQL, URL-fragment-only in the browser flow, and 90 seconds in the UI; database cap is two minutes. This preserves the original brief's Admin/Executive session-control boundary while keeping Backup Admin distinct. Step 9 pgTAP tests cover roles, IDOR, closed/duplicate/replayed/expired challenge cases and event lifecycle closure. |

## Resolved communications/privacy decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-004 | No application role, including Admin and Executive, can link a poll voter to a choice. Exact aggregate counts remain hidden while a poll is open. After closure, counts are released only if at least five eligible members voted; polls below that threshold never reveal counts. Each active member can submit one final vote. | Eligibility and ballots use separate forced-RLS private tables; the ballot row has no member identity or vote timestamp. Only checked database functions can cast or count ballots. Both the individual-results function and batched summary suppress counts until closure and threshold. Step 10 tests verify the open/closed/threshold boundaries and forbidden direct table access. This provides application-role privacy, not cryptographic anonymity from database operators. |

## Resolved backup decision

| ID | Decision | Enforcement |
| --- | --- | --- |
| D-012 | Available receipt objects may be directly read through Supabase Storage only by an active Admin or Backup Admin for the approved backup workflow. Other members retain receipt access through the application download routes. All application-role direct Storage writes remain denied. | `private.can_read_finance_receipt_storage_object(text)` checks active membership, current Admin/Backup Admin role, and an available receipt path; restrictive anon/authenticated policies deny other direct reads. The helper is non-exposed, uses a fixed empty search path, and has narrow execute grants. Club and event pgTAP suites verify allowed Admin/Backup Admin reads, denied Executive/event Lead/member/inactive/pending/anon reads, and direct-write denials. The policy is applied to hosted Supabase; catalog checks confirm the private helper ACL and fixed search path. Hosted Storage API behavior remains unverified because no hosted Auth user or receipt object exists. |
| D-009 | Prior approved target: a restricted operator-run full Supabase backup, separate receipt-object export, encrypted local/Drive copies, and isolated restore. **Current status — 2026-10-07:** deferred by the user; full backup/restore is not a production blocker or major criterion for the current project. Preserve the existing local encrypted app-records CSV extract as a limited archival option; it is not a restorable database backup. Reopen full recovery work only by later request. | The former D-009 controls and scripts remain documented for possible future use, but are not current completion gates. The CSV extract omits Auth credentials, schema/policies, project settings/secrets, and receipt bytes; its current working-tree implementation has not been re-verified. See [backup and restore](backup-and-restore.md). |

## Open decisions

| ID | Decision needed | Why it matters | Proposed default | Blocks |
| --- | --- | --- | --- | --- |
| D-008 | Which free email service is acceptable, if any, and what rate-limit controls are acceptable within the free-only architecture? | Provider cost, abuse controls, and sensitive-notification exposure. | Keep dues reminders in-app only; defer email and email preferences until provider and current limits are verified. Supabase documents Cron as PostgreSQL `pg_cron`; public Free pricing lists PostgreSQL but no separate Cron charge. Cron is currently labeled Beta, shares database compute, and does not run while a Free project is paused. Local extension support is verified; the target hosted project is not linked, so hosted configuration/quota remains unverified. | Email delivery/preferences and future abuse controls |
