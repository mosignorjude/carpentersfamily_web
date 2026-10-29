# Data access matrix — Steps 2–12

This matrix describes the schema implemented by Steps 2–12, including the
president/staff identity model. Email notifications remain deferred.

The shared event finance category catalog is used by event budget allocations
and manual event income/expense entries. Historical rows keep their original
names and remain readable if they predate category assignment.

## Identity rules

- Every signed-up person has one `member_profiles` row linked to `auth.users.id`.
- `member_profiles` contains `full_name`, `username`, account status, optional
  `staff_disabled_at`, and profile-completion time. Email remains in Supabase
  Auth and is not exposed through the public Data API.
- Account status is `pending`, `active`, `deactivated`, `rejected`, or `staff`.
  A `staff` row is a system administrator, not a club member: it fails
  `private.is_active_club_member()`, `private.has_club_role()`, and every member
  or officer gate. `staff_disabled_at` disables a staff account without deleting
  its identity; a disable must leave at least one enabled staff account.
- A person without an elevated assignment is a Member. `executive` and
  `president` are separate club roles with no implicit role inheritance. The
  President is the club administrator. `backup_admin` is accepted as a
  compatibility alias for `president`; stored `backup_admin` rows were renamed
  to `president` in place. A legacy `admin` row remains valid only until the
  operator conversion turns each admin account into staff; no new `admin` or
  `president` assignment can be created through the member-facing role RPCs.
- Staff administrators can read `member_profiles`, `member_role_assignments`,
  `audit_log`, `club_payment_settings`, and `club_attendance_settings`, and
  nothing else. They act through staff-only RPCs: member approval, rejection,
  deactivation and reactivation; president appointment and revocation; staff
  enable/disable; and staff provisioning. A trigger rejects any club or event
  role assignment for a staff target.
- Event Lead, Event Assistant, and Committee Member are event-scoped roles in
  `event_role_assignments`, not global club roles. Committee status alone grants
  no edit, budget, status, or staffing authority and no event financial mutation
  authority. Committee attendance access is self-only; it cannot review or
  correct another member's attendance. Any active member may sell tickets as a
  member capability, independent of event-role assignment.
- Role and account checks read current database rows. User-editable metadata and
  stale JWT role/status claims are not authorization sources.

## Table operations

| Table | SELECT | INSERT | UPDATE | DELETE / retention | Constraints and audit |
| --- | --- | --- | --- | --- | --- |
| `public.member_profiles` | A person can read their own row in any account state. Active members can read the active member directory (name, username, active status). Active Executive/President can read all profile rows and statuses. Enabled staff can read all rows. No email column is present. | No direct client insert. A fixed `auth.users` trigger creates a pending profile and ignores role/status metadata. | No direct client update. A pending member can complete their own profile once through an RPC; Executive/President can approve or reject; President can deactivate/reactivate; staff use their own lifecycle RPCs. Approval requires a completed profile and confirmed email. The last-active-legacy-Admin trigger remains in force until conversion; the last-enabled-staff trigger is always in force. | No client delete. Auth-user FK is `ON DELETE RESTRICT`; preserve identity links for history and deactivate or disable instead. | UUID FK to `auth.users`, constrained account status, bounded/trimmed name, allowlisted case-insensitive unique username, immutable completed identity fields, profile completion and created/updated timestamps, staff-disable consistency check. |
| `public.member_role_assignments` | A person can read their own current and prior assignments. Active Executive/President can read role history. Enabled staff can read all rows. | Only through checked procedures. Member-facing grants expose Executive only and require an active President (or legacy Admin). President appointment requires an enabled staff administrator. Legacy `admin` rows cannot be created. Target must be active and must not be staff. | Only through checked procedures. Member-facing revocation handles Executive; President revocation is a staff RPC; deactivating a member also revokes a current president assignment. Last active legacy Admin is protected until conversion. | No direct delete. Revocation closes the assignment row and preserves the history. All referenced member rows use `ON DELETE RESTRICT`. | Role allowlist including compatibility values, required reason, actor, grant/revoke timestamps and actors, paired revocation fields, one active assignment per member/role, one active President, one active Admin-or-President identity per person, staff-target rejection trigger, indexed FKs. Assignment/revocation also appends an audit record in the same transaction. |
| `public.audit_log` | Active Executive/President only; enabled staff administrators. Members do not receive audit history. | No direct client insert. Checked role, finance, event, attendance, communications, and staff procedures append audit rows atomically. | Never through the application. Trigger rejects updates. | Never through the application. Trigger rejects deletes; FKs retain referenced profiles. | Actor, action, entity, target member, event, before/after JSON, reason, timestamp; bounded identifiers and object-shaped JSON; indexed chronological lookups. Poll vote choices and voter identities are never logged together. |
| `private.administration_guard` | No application-role access. Internal database procedures only. | No application-role access. Created as a singleton by migration. | No application-role access. A row lock serializes role changes with the last-primary-Admin and last-enabled-staff guards. | No application-role access. | Private schema is not exposed through the Data API; only narrowly granted helper/procedure execution is available to authenticated requests. |
| `public.club_payment_settings` | Active members can read the single club bank account row. Enabled staff can read it. | No direct client insert. A checked procedure lets Admin (legacy) or President configure the singleton. | No direct client update. Same checked procedure, with a reason, records before/after values in audit. | No direct client delete; the singleton row is retained and a deletion guard rejects removal. | Singleton primary key, 10-digit NUBAN check, bounded bank/account/instruction text, forced RLS, reason-required audit. |
| `public.dues_rates` | Active members may read the schedule; no unauthenticated or inactive access. | No direct client insert. Initial rate comes from migration; future changes use `set_dues_rate`. | No direct client update. President may set or correct only the next month's scheduled rate with a reason. Trigger rejects effective/past rate rewrites. | No direct client delete; history is retained. | Whole-Naira positive amount, first-of-month date, bounded reason and unique effective month. Before/after change is audited. |
| `public.dues_membership_periods` | Active member sees own periods; active Executive/President can review history. Inactive users lose even own access. | No direct client insert; lifecycle trigger manages periods on approval, deactivation and reactivation. | No direct client update. | No direct client delete; period history retained. | Member FK uses `ON DELETE RESTRICT`; month boundaries are first-of-month. Start month is inclusive and end-before month exclusive. Deactivation month is excluded; reactivation month is included. |
| `public.dues_payments` | Active member sees own payments; active Executive/President may review member payments. | No direct client insert. Payment procedure records for a selected member after current role, target, status, dates, rate and coverage checks. | No direct client update. President may correct a payment through an atomic procedure; prior values and reason are retained in audit. | No direct client delete; payment history is retained. | Whole-Naira amount/date constraints and restrictive FKs. Exact sum must equal selected full-month rates; each eligible month can have one current disposition. Member row ownership enforced by forced RLS. |
| `public.dues_month_dispositions` | Active member sees own monthly status/history; active Executive/President may review other member records. Inactive sessions see none. | No direct client insert. Payment and write-off procedures create current dispositions; only old unpaid months may be written off with a reason. | No direct client update. Corrections supersede prior dispositions with actor/time/reason and create replacement rows transactionally. | Direct delete denied and trigger prevents deletion; prior dispositions are retained. | Unique partial index permits one current disposition per member/month. Check constraints bind `paid` to a payment and `written_off` to a reason; amount and covered month are checked. |
| `public.dues_month_status` (security-invoker view) | Active member sees own eligible months; active Executive/President may review any member. RLS on underlying tables remains in force. | Read-only derived view. | Read-only derived view. | Not applicable. | Derives unpaid/paid/written-off status, due date and rate snapshot. No client filter can bypass underlying RLS. |
| `public.finance_categories` | Every active member can see active and retired category names so historical ledger rows remain understandable. | No direct insert. Executive/President may add a category through `create_finance_category` with a reason. | No direct update. Retire through `retire_finance_category` with a reason; category names are retained. | No direct delete; restrictive foreign keys and retained history. | Bounded trimmed name, case-insensitive uniqueness among active names, actor/timestamp, retirement actor/time/reason. Every change is audited. |
| `public.event_finance_categories` | Every active member can see active and retired category names. | No direct insert. President may add a budget-allocation, expense, or revenue category through a checked procedure with a reason. | No direct update. President may rename an active category or retire it through a checked procedure with a reason; both changes are audited. | No direct delete; category rows and audit history are retained. | Category type allowlist, bounded trimmed name, case-insensitive uniqueness per active type, actor/timestamp, retirement actor/time/reason, forced RLS and column-limited reads. |
| `public.club_financial_transactions` | Every active member can read shared income/expense details, including payer/payee, source/description, dates, category snapshots, and void reason. `created_by` and idempotency key are not selectable. | No direct insert. Executive/President may post through the checked idempotent procedure. | No direct update. Only President may correct with a reason; prior/new values are audited. | No direct delete. President may void with a reason; the row and audit history remain, and the amount is excluded from balance. | Whole-Naira amount, current-year date bounds, income/expense field shape, restrictive FKs, unique actor/idempotency key, actor/time, immutable initial/correction/void audit trail. Expense category name is snapshotted. |
| `public.club_financial_receipts` | Active members can read display metadata for available receipts linked to shared club transactions. Object paths, checksums, uploader IDs, and pending/failed rows are not selectable. The download procedure returns a path only to an active member for an available linked receipt. | No direct insert. Executive/President reserve an upload through a current-role checked procedure; the server route validates bytes and writes through a server-only Supabase key. | No direct update. Only the uploader can finalize its pending receipt after current officer checks and confirmation the Storage object exists. | No delete. Available history is retained; failed/pending metadata stays hidden. Uploaded blobs are removed on detected failure through the Storage API. | Transaction/member FKs are `ON DELETE RESTRICT`; generated path is constrained to transaction/receipt UUIDs and allowed extension; size is 1–4 MiB; MIME/type and filename are allowlisted; one pending upload per actor; one checksum per transaction; successful attachment adds minimized immutable audit history. |
| `public.events` | Active members can read event title/type/time/location/description, fixed features, status, and archive timestamp. Creator/updater/archiver IDs and archive reason are withheld. | No direct insert; Executive/President create events through a checked procedure. | No direct update. Executive/President or that event's Lead/Assistant can change details while scheduled, active, and within the mutable past-event window. | No direct delete. Explicit archive is a reason-required tombstone by Executive/President. Hard deletion is rejected and references use `ON DELETE RESTRICT`. Past events older than the latest four are read-only except explicit archive. | Type/feature/status allowlists, bounded text and date checks (1900–2200), status workflow, event-row locks, active-account rechecks, history retention, and same-transaction audit. Ticketing may be selected for any event type and requires budget, other-income, and expense features. |
| `public.event_role_assignments` | Active members can read current staffing for all events and their own assignment history. Active Executive/President can read full grant/revocation history. | No direct insert. Executive/President assign Lead, Assistant, or Committee through a checked procedure with a reason; target must be active and must not be staff. | No direct update. Revocation is a checked, reason-required procedure and preserves the assignment row. | No direct delete; event/member references use `ON DELETE RESTRICT`. | One current event role per member, at most one active Lead and Assistant per event, role allowlist, event lock/state checks, current membership/role checks, and append-only audit. |
| `public.event_budgets` | Every active member can read budget totals for events. | No direct insert; Executive/President or that event's Lead/Assistant set a budget through a checked procedure. | No direct update; the procedure atomically replaces the budget and its allocation rows while the event is mutable. | No direct delete; budget history is retained with restrictive event references. | Whole-NGN positive bounded total; at most 50 allocations; Admin-managed categories are unique per event; allocation percentages total at most 100%; each percentage is rounded to a whole-Naira amount, and rounded amounts may not exceed the budget. The remainder is unallocated. Event lock plus same-transaction audit prevents partial state. |
| `public.event_budget_allocations` | Every active member can read allocation position, category ID, snapshotted name, percentage, and amount. | No direct insert; created only inside `set_event_budget`, which accepts an active budget-allocation category. | No direct update; replaced atomically only by `set_event_budget`. | No direct delete; replacement is performed transactionally, while parent budget/event history is retained. | Category FK is restrictive; category name is snapshotted into `allocation_name`; unique position and category per event, position 1–50, percentage between 0 and 100, calculated amount and text constraints. Allocations may leave budget unallocated; legacy percentages are backfilled from saved amounts. |
| `public.event_financial_transactions` | Every active member can read event income/expense, expense and budget-allocation category snapshots, payment status, date, payer/payee, and void reason. Creator and idempotency keys are not selectable. | No direct insert. Event Lead/Assistant or Executive/President may record through a checked idempotent procedure with an active expense/revenue category; an expense may optionally link to one of this event's current allocations. | No direct update. Only President may correct with a reason; categories, snapshots, status and other prior/new values are audited. | No direct delete. President may void with a reason; the original categories and status remain retained and voided amounts are excluded from totals. | Category type must match income/expense. Expense statuses are Paid, Deposit, Pending, or Unpaid; income statuses are Paid, Pending, or Unpaid. Paid/Deposit expense is actual spend; Pending/Unpaid is committed spend. Historical uncategorized rows default to Paid to preserve prior totals. |
| `public.club_attendance_settings` | Active members can read the single club-wide late-after cutoff. Enabled staff can read it. Change actor and reason are not granted. | No client insert. | No direct update. Executive/President changes the bounded 0–240-minute default through a reason-required procedure. | No client delete; the singleton row is retained. | One constrained row, 15-minute initial default, event-time interpretation in `Africa/Lagos`, actor/time/reason audit, and direct-write guard. |
| `public.event_minutes` | Every active member can read saved content only when the event's `minutes_enabled` feature is on. | No direct insert. Executive/President creates minutes through `save_event_minutes`; event roles cannot author. | No direct update. Executive/President edits with a reason; revision number and editor update atomically. | No client delete; content stays linked to the retained event. Archived events are read-only. | Trimmed 1–20,000 characters; line breaks/tabs are allowed but other control characters are rejected. Current text is rendered as escaped React content. |
| `public.event_minutes_revisions` | Active global officers (Executive/President) can read retained history. Other active members cannot read revision snapshots. | No direct insert; the minutes procedure appends each content snapshot and reason. | Never through the application. | Never through the application; revisions are append-only and use restrictive event/member FKs. | Unique event/revision number, bounded text/reason, editor/time; audit rows store revision and character-count metadata rather than duplicating minutes content. |
| `public.event_attendance_sessions` | Active members can read event ID, open/close timestamps, and cutoff. QR challenge hash and issuing actor are not selectable. | No direct insert. Executive/President opens one session for a scheduled, attendance-enabled event. | No direct update. Executive/President closes once; terminal/cancelled/archived event lifecycle closes an open session. QR challenge rotation uses a checked procedure. | No client delete or session reopen; one retained session is allowed per event. | Event/session locks serialize check-in and close; cutoff is bounded to 0–240 minutes and anchored to `events.starts_at`. QR challenges are hashed, event-bound, and expire within 2 minutes (the UI issues 90-second tokens). |
| `public.event_attendance` | Active members can read only their own row. Assigned Lead/Assistant and global Executive/President can read the roster in permitted scope. Committee sees self only. | No direct insert. Any active member inserts only their own check-in through the session-checked button/QR RPC; close-time absences are inserted atomically. | No direct update. Assigned Lead/Assistant for that event and global Executive/President can set present/absent/rejected with a reason. | No direct delete; attendance history is retained. | Unique event/member row prevents duplicates; status/method allowlists; check-in actor must equal member; present/late derives from the stored cutoff; corrections append audit. Check-in never accepts a caller-supplied member ID. |
| `public.announcements` | Active members can read approved content and event scope; creator identity is not selectable. | No direct insert. Executive/President publish club-wide or event-wide; an assigned Event Lead publishes only within their event. | No direct update. Same scoped publishers edit through a reason-required RPC; prior snapshots are retained. | No direct delete; announcement and history are retained. | Bounded title/message, event FK uses `ON DELETE RESTRICT`, current active role is rechecked, immutable revision rows and minimized audit are written atomically. |
| `public.announcement_revisions` | Active Executive/President can read history globally; an Event Lead can read history for their assigned event. Other roles cannot read snapshots. | No direct insert; checked create/edit procedures append revisions. | Never through the application. | Never through the application; revision history is append-only and retained. | Reason, actor, timestamp, target, version and prior content are retained; event/member FKs are restrictive. |
| `public.announcement_reads` | Active members can select their own read markers only. | No direct insert; `mark_announcement_read` derives `member_id` from `auth.uid()`. | No direct update. | No direct delete; one member/announcement marker is retained. | Forced RLS and composite primary key isolate per-member state; read state does not alter the announcement. |
| `public.announcement_polls` | Active members can read question, type, timing, lock and revision state; creator/updater identities are not selectable. | No direct insert. Executive/President publish globally or per event; an assigned Event Lead can publish only within that event. | No direct update. Same scoped publishers can edit before the first vote, with a reason and immutable revision. Configuration locks when the first vote is accepted. | No direct delete; polls and results remain retained. | Duration 5 minutes–30 days, bounded question/type, restrictive event FK, row lock for voting and reasoned revision history. |
| `public.announcement_poll_options` | Active members can read option IDs, order and labels to vote. No vote totals are stored in this table. | No direct insert; checked creation/edit procedure only before voting starts. | No direct update; checked procedure replaces options only before first vote. | No direct delete; poll choices are retained and become immutable at first vote. | 2–8 bounded unique choices; composite poll/option FK binds ballots to a valid option. |
| `public.announcement_poll_revisions` | Active Executive/President can read history globally; an assigned Event Lead can read history for their assigned event. Other roles cannot read snapshots. | No direct insert; checked create/edit procedure appends a revision. | Never through the application. | Never through the application; revisions are append-only and retained. | Reason, editor, timestamp, prior options, deadline and version are retained; restrictive FKs. |
| `public.notifications` | Active members can select only their own rows. Pending/deactivated/staff accounts see no rows. Notification bodies contain fixed generic text and do not include dues values/status, audit snapshots, receipt data, or poll choices. | No direct insert; announcements, polls, attendance, event/member/finance audit events, and private scheduled functions create rows. | No direct update. The checked `mark_notification_read` function sets `read_at` only for the caller's unread row; content/recipient/source cannot be changed. | No direct delete; notification rows are currently retained indefinitely. | Forced RLS and own-recipient policy; category/source allowlists, bounded text, restrictive event FK, per-recipient idempotency key, creation/event indexes. Related audit records retain actor/time/reason. Creation failure is atomic with the audited business transaction. |
| `public.notification_preferences` | Active members can select only their own category settings. | No direct insert; the checked preference function upserts only a self-selected allowed routine category. | No direct update; changes append actor/time/before/after/category to append-only `audit_log`. | No direct delete; settings are retained and updated in place with audit history. | Forced RLS; categories limited to announcement, new poll, poll closing, attendance opening, and event activity. Dues reminders and officer alerts cannot be muted. Email settings are not implemented. |
| `private.notification_job_runs` | No application role. | Only the private PostgreSQL scheduler function inserts the WAT month key. | No application update. | No application delete; unique month key prevents duplicate monthly dispatch. | Not in an exposed schema; no client grant; one transactional key per dues month. |
| `private.poll_voter_eligibility` | No application role can read rows directly. Checked database functions use the identity ledger for own-vote status and duplicate prevention. | No direct application insert; the atomic vote procedure writes the authenticated member ID. | Never through the application. | Never through the application; uniqueness and eligibility history are retained. | Forced RLS, private schema, primary key `(poll_id, member_id)`; cast timestamp is not exposed to application roles. |
| `private.poll_ballots` | No application role, including service-role, can read rows directly. Authenticated members can receive only a bounded aggregate through checked functions after the release rule. | No direct application insert; the vote procedure writes a validated poll/option pair without member identity or timestamp. | Never through the application. | Never through the application; ballot rows are immutable and retained. | Forced RLS; no voter identifier or vote timestamp; closed polls reveal option counts only when total votes are at least five. Under-threshold polls reveal no exact counts. |

## Dues operation authorization

| Operation | Member | Executive | President |
| --- | --- | --- | --- |
| Read own individual dues/history | Allowed while active | Allowed while active | Allowed while active |
| Read another member's individual dues/history | Denied | Allowed while active | Allowed while active |
| Read fixed club-wide dues-income aggregate | Allowed while active | Allowed while active | Allowed while active |
| Submit own dues payment request | Allowed while active | Allowed while active | Allowed while active |
| Approve or reject a member payment request | Denied | Allowed | Allowed |
| Approve or reject the President's own payment request | Denied | Allowed | Denied |
| Record a payment for an eligible member | Denied | Allowed | Allowed |
| Write off old unpaid months with reason | Denied | Allowed | Allowed |
| Correct an existing payment with reason | Denied | Denied | Allowed |
| Set/correct next month's scheduled rate | Denied | Denied | Allowed |
| Backfill historical dues for an active member | Denied | Denied | Allowed |
| Directly insert/update/delete dues or rate rows | Denied | Denied | Denied |

All four dues tables have forced RLS and grant authenticated users `SELECT`
only. Mutation procedures independently verify `auth.uid()`, current active
membership, current role, target-member relationship, input shape, applicable
rate, membership state, unique month coverage and financial amount. A shared
administrative lock and member-row locks serialize changes that could conflict.
Public RPC wrappers are `SECURITY INVOKER`; narrow private implementations use
fixed search paths and write audit records in the same transaction. The club
income RPC returns one fixed aggregate and accepts no caller-controlled filter.

## Club finance authorization

| Operation | Member | Executive | President |
| --- | --- | --- | --- |
| Read club ledger details, including payer/payee | Allowed while active | Allowed while active | Allowed while active |
| Read derived dues/other-income/expense/balance totals | Allowed while active | Allowed while active | Allowed while active |
| Create current-dated non-dues income or expense | Denied | Allowed | Allowed |
| Enter a transaction dated earlier this year | Denied | Denied | Allowed |
| Add or retire a category with a reason | Denied | Allowed | Allowed |
| Correct or void a transaction with a reason | Denied | Denied | Allowed |
| Record or correct the club opening balance | Denied | Denied | Allowed |
| Read full finance change history | Denied | Allowed while active | Allowed while active |
| Directly insert/update/delete ledger or category rows | Denied | Denied | Denied |

Income requires a source note and has no payment-method field. Payer/payee is
optional on non-dues income and required on expenses. Members can see voided
rows and their reason for transparency, while totals exclude them. Corrections,
voids, and the opening balance are restricted to the President as the
higher-risk historical operations. Category retirement does not remove
historical labels or financial records.

The balance RPC accepts no caller filters and returns only fixed aggregates. It
combines the existing member-safe dues aggregate with posted non-dues income and
expenses. It rejects inactive members and cannot reveal any individual dues
status. The same metadata/download pattern applies to event finance records in
Step 8, with event-scoped upload authorization and active-member transparency.

Receipt bytes live in a private Storage bucket. Authenticated clients receive
restrictive deny policies for all direct bucket operations; Next.js routes are
the only application path. The upload route requires same-origin POST, a current
active finance officer, an unvoided shared transaction, a 4 MiB bound, and
matching file extension/MIME/signature. Database procedures reserve and
finalize the actor's receipt; finalization requires a Storage object and records
the verified SHA-256 checksum in private metadata. The download route resolves
the record through the active-member database procedure, verifies the stored
size/checksum, and serves it as a no-store attachment with `nosniff`. No signed
or public URLs are issued. A narrowly used server-only Supabase secret/service
key handles Storage bytes only; all application data mutations use the user's
session and database authorization procedures.

Finance writes take the shared administration lock and recheck the active
account and current role after serialization with deactivation and role changes.
Table triggers reject direct deletion and recheck identity/role for insert,
correction, and retirement. Public wrappers are `SECURITY INVOKER`; private
implementations use fixed search paths, restricted grants, and append audit
rows in the same transaction.

## Event authorization

| Operation | Member | Committee | Event Assistant | Event Lead | Executive | President |
| --- | --- | --- | --- | --- | --- | --- |
| Read active/retained event details, staffing, and budgets | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Create event and assign/revoke event roles | Denied | Denied | Denied | Denied | Allowed | Allowed |
| Edit a scheduled event within the mutable past window | Denied | Denied | Own event only | Own event only | Allowed | Allowed |
| Set budget within the mutable past window | Denied | Denied | Own event only | Own event only | Allowed | Allowed |
| Complete/cancel own event | Denied | Denied | Denied | Own event only | Allowed | Allowed |
| Reopen completed/cancelled event | Denied | Denied | Denied | Denied | Denied | Allowed |
| Archive event with a reason | Denied | Denied | Denied | Denied | Allowed | Allowed |
| Directly insert/update/delete event, role, budget, or allocation rows | Denied | Denied | Denied | Denied | Denied | Denied |

Every event mutation rechecks active identity, club role, event relationship,
status, and retention window in PostgreSQL. The event row is locked for
conflicting lifecycle changes; an administration guard serializes mutations
with deactivation and role changes. A completed or cancelled event is locked;
only the President can reopen it. Archived events are immutable. Past events
outside the latest four are read-only except explicit archival. Audit reasons
and full before/after history remain officer-only; members can still read
retained event and budget values for transparency.

## Event finance authorization

| Operation | Member | Committee | Event Assistant | Event Lead | Executive | President |
| --- | --- | --- | --- | --- | --- | --- |
| Read event income/expenses, payer/payee, ticket sales/buyer, tier availability, and available receipt metadata | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Download a receipt linked to a shared event-finance record | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Create/update/retire a ticket tier for a scheduled ticketing event | Denied | Denied | Assigned event only | Assigned event only | Allowed | Allowed |
| Record event income/expense for a scheduled enabled feature | Denied | Denied | Assigned event only | Assigned event only | Allowed | Allowed |
| Attach a receipt to an unvoided event record | Denied | Denied | Assigned event only | Assigned event only | Allowed | Allowed |
| Record a ticket sale while an event is open | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Edit a sale with a reason | Own sale only | Own sale only | Own sale only | Own sale only | Own sale or any sale | Own sale or any sale |
| Correct/void event transaction, refund a sale, or change another seller's sale | Denied | Denied | Denied | Denied | Denied | Allowed with reason |
| Reopen completed/cancelled event and reverse its ledger post | Denied | Denied | Denied | Denied | Denied | Allowed with reason |
| Directly insert/update/delete event finance or ledger rows | Denied | Denied | Denied | Denied | Denied | Denied |

Member transparency covers shared event-finance payer/payee and buyer details,
receipt metadata, and receipt bytes. Individual dues remain private. Event Lead
and Assistant grants are scoped to one event; Committee membership grants no
event-finance mutation. Executive may manage finances across events but has no
correction, refund, or reopening authority. Only the President holds those
higher-risk actions. Every event finance table has forced RLS, read-only member
column grants, and no client-side mutation privilege. Narrow session RPCs
recheck state/authorization, serialize with the administration guard and
event/tier rows, and append audit history in the same transaction.

Ticket prices are snapshotted on each sale. Capacity is checked in the database
under event/tier locks; idempotency keys prevent a retried seller submission
from duplicating a sale. A refund retains the sale and reopens capacity. Event
income/expense corrections and voids retain before/after values and reason.
Completion/cancellation appends a signed net result to the club ledger; a
President reopening appends an opposite reversal, and a later
completion/cancellation receives a fresh generation. Event and financial
foreign keys use restrictive deletion behavior.

## Meeting and attendance authorization

| Operation | Member | Committee | Event Assistant | Event Lead | Executive | President |
| --- | --- | --- | --- | --- | --- | --- |
| Read saved minutes for an enabled event | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Write/edit minutes | Denied | Denied | Denied | Denied | Allowed | Allowed |
| Check in as self during an open session | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Read own attendance row | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Review event attendance roster | Own row only | Own row only | Assigned event only | Assigned event only | All events | All events |
| Open/close a session or issue its QR | Denied | Denied | Denied | Denied | Allowed | Allowed |
| Change club-wide late cutoff | Denied | Denied | Denied | Denied | Allowed with reason | Allowed with reason |
| Correct present/absent/rejected state with reason | Denied | Denied | Assigned event only | Assigned event only | All events | All events |
| Directly insert/update/delete minutes, sessions, or attendance | Denied | Denied | Denied | Denied | Denied | Denied |

The database derives the check-in subject from `auth.uid()`; the event ID only
selects the requested session. Event Leads and Assistants may review and
correct attendance only for their current assignment. The President is the
club administrator and holds the same session, QR, cutoff, and minutes-writing
authority as an Executive. Committee is self-only for attendance. Active
members can read current minutes; revision snapshots are global-officer-only.
Current attendance rows are readable by the member and scoped officers; the
append-only correction audit is global-officer-only.

The cutoff starts from the event's stored instant, is displayed in
`Africa/Lagos` time, and considers a check-in late only after the cutoff. A
session close locks out further check-ins and inserts an absent record for each
currently active member without one in the same transaction. Event completion,
cancellation, or archive also closes an open session. A closed session cannot
be reopened; reasoned corrections remain available within role scope. One
unique event/member row and event/session locks prevent duplicate or close-time
race states.

The UI QR encodes a 256-bit random challenge in the URL fragment, so the token
is not sent in an HTTP request URL. PostgreSQL stores only its SHA-256 hash;
challenge expiry is capped at two minutes and the UI issues 90-second tokens.
The member must still be authenticated and active, and the challenge is tied to
the event's open session. A member can share a code during its short validity
window; the QR is a convenient check-in path, not proof of physical presence.

## Communications and poll authorization

| Operation | Member | Committee | Event Assistant | Event Lead | Executive | President |
| --- | --- | --- | --- | --- | --- | --- |
| Read announcements, poll questions and choices | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Mark own announcement as read | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Publish/edit club-wide communications | Denied | Denied | Denied | Denied | Allowed | Allowed |
| Publish/edit event communications | Denied | Denied | Denied | Assigned event only | Allowed | Allowed |
| Read revision snapshots | Denied | Denied | Denied | Assigned event only | All events | All events |
| Cast one final vote as self in an open poll | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
| Read exact poll totals while open | Denied | Denied | Denied | Denied | Denied | Denied |
| Read exact totals after close with at least five votes | Aggregate only | Aggregate only | Aggregate only | Aggregate only | Aggregate only | Aggregate only |
| Read exact totals after close with fewer than five votes | Denied | Denied | Denied | Denied | Denied | Denied |
| Read a voter-to-choice mapping | Denied | Denied | Denied | Denied | Denied | Denied |
| Directly write announcements, history, read markers, polls, options or ballots | Denied | Denied | Denied | Denied | Denied | Denied |

Active membership and current role/event assignment are rechecked by database
procedures. A poll-row lock serializes votes; the unique eligibility key
enforces one vote per member/poll. `private.poll_voter_eligibility` records who
may vote, while `private.poll_ballots` records only poll and option IDs, with
no voter ID or cast timestamp. Both are forced-RLS private tables with no
direct application-role grants. Exact counts are returned only after close
when five or more ballots exist; a closed poll below five returns no exact
counts. This is application-role privacy, not cryptographic anonymity from
privileged database operators or inference from outside information.

## Role-mutation authorization

| Actor | Grant/revoke Executive | Appoint/revoke President |
| --- | --- | --- |
| Member | Denied | Denied |
| Executive | Denied | Denied |
| President | Allowed | Denied |
| Legacy Admin (before conversion) | Allowed | Denied |
| Enabled staff administrator | Denied | Allowed |

All role procedures require a signed-in, currently active member, validate the
target and role against database state, require a 1–500 character reason, take a
shared administrative lock, and append the actor/target/role/reason change to
the immutable audit log. Member-facing grants are limited to Executive. The
President appoints and revokes the president role through staff RPCs, which
require an enabled staff administrator; the president role is single-valued.
Public RPC wrappers are `SECURITY INVOKER`; the privileged implementation stays
in the unexposed `private` schema and checks the caller through `auth.uid()`
plus current database state.

## Member lifecycle authorization

| Operation | Member | Executive | President | Enabled staff |
| --- | --- | --- | --- | --- |
| Complete own pending profile once | Allowed for self only | Allowed for self only | Allowed for self only | Not applicable; staff are provisioned |
| Approve a complete, email-confirmed pending member | Denied | Allowed | Allowed | Allowed |
| Reject a pending membership request | Denied | Allowed | Allowed | Allowed |
| Deactivate another active member | Denied | Denied | Allowed | Allowed |
| Deactivate own account | Denied | Denied | Denied | Denied |
| Reactivate a deactivated member | Denied | Denied | Allowed | Allowed |
| Enable or disable another staff administrator | Denied | Denied | Denied | Allowed |
| Disable own staff account | Denied | Denied | Denied | Denied |

Deactivation preserves role-assignment history, but every effective role check
also requires current `active` status; deactivation also revokes a current
president assignment. Reactivation therefore restores remaining prior
assignments, not a revoked presidency. Status changes take the shared
administrative lock and append an actor/target/before/after/reason audit row in
the same transaction. PostgreSQL also checks the confirmed Auth email and
completed profile before activating a pending applicant. The last-enabled-staff
trigger prevents disabling or removing the final active staff administrator.

## Explicitly denied operations

- `anon` has no schema/table access or role RPC execution.
- Authenticated client roles have only the explicit table grants listed above;
  all app-facing tables use forced RLS. Dues and membership tables are
  read-only to direct clients, and mutations go through checked procedures. No
  broad `TO authenticated USING (true)` policy exists.
- Direct profile writes, role assignment writes, audit inserts/updates/deletes,
  and role changes via altered IDs or role strings are denied.
- Staff administrators cannot read member dues, finance, event, attendance, or
  communications tables, and cannot hold a club or event role.
- Deactivated members lose directory and officer access immediately even with a
  still-valid JWT. Pending and deactivated profiles are visible only to the
  subject and active officers; staff see every profile.
- Deleting an Auth user cannot cascade into a profile, role, or audit record.
- No application role can hard-delete an event, rewrite event/budget history,
  grant a global event role, or reuse event authority across another event.
- Members cannot read another member's individual dues or mutate dues or club
  finance rows. Executives cannot correct dues payments, change dues rates, or
  correct/void club transactions. No application role can directly delete or
  rewrite financial history.

## Verification coverage

`supabase/tests/database/membership_roles_rls_test.sql` covers table/RLS/grant
configuration, directory privacy, direct-write denials, role mutation
boundaries, the single-president and single-primary-identity indexes, last-admin
protection for legacy rows, stale-session deactivation, and audit
retention/immutability. `supabase/tests/database/auth_member_lifecycle_test.sql`
covers pending-profile creation, ignored Auth metadata, self-only completion,
verified approval, lifecycle role boundaries, deactivation/reactivation,
stale-session denial, and lifecycle audit behavior.
`supabase/tests/database/president_staff_admin_test.sql` covers the staff
status and disable guard, staff read isolation, president alias behavior,
staff-only lifecycle and president-appointment RPCs, provisioning, and the
staff-target role trigger.

`supabase/tests/database/dues_privacy_test.sql` covers forced RLS and grants,
self-only dues, ID tampering, exact and partial payment totals, duplicate month
coverage, future prepayment, write-off boundaries, Executive versus President
permissions, future rate correction, payment correction, historical/audit
retention, deactivation/reactivation month boundaries, and the
active-member-only aggregate.

`supabase/tests/database/club_finances_test.sql` covers member-wide ledger
visibility (including payer/payee), inactive denial, mutation role boundaries,
column grants, current versus historical dates, idempotent retries, invalid
amounts/categories, retired-category snapshots, reasoned corrections/voids,
audit retention, and balance reconciliation. The finance page reads 50 records
and audit rows per page; categories are capped at 200 rows.

`supabase/tests/database/event_finance_ticketing_ledger_test.sql` covers forced
RLS and column grants, Member/Committee/Lead/Assistant/Executive/President
boundaries, cross-event role denial, member-visible payer/buyer/receipt metadata,
ticket sale idempotency, capacity and refund reopening, seller-only edits,
President correction boundaries, receipt reservation/path/finalization
failure, audit values/reasons, terminal-event locking, signed
post/reversal/fresh generation, and club-balance reconciliation. A true
simultaneous two-session sale stress test, hosted RLS/Storage behavior, and
authenticated browser upload/download remain unverified.

## Report exports — Step 12

- `POST /api/reports/finances` and `POST /api/reports/dues` accept only one
  bounded `format` field (`csv` or `pdf`). The report year is the current
  Africa/Lagos calendar year. Caller-supplied member IDs, amounts, and date
  ranges are not accepted.
- `public.club_finance_report_data()` is `SECURITY INVOKER`; active members can
  export the already member-visible club balance, payer/payee details, ledger
  values, and available receipt filenames. It returns the summary and current
  year transactions in one database statement snapshot. It never returns
  storage object paths or private uploader fields.
- `public.dues_report_data()` is `SECURITY INVOKER` and reads the existing
  `dues_month_status` view joined to member profile names. Forced RLS makes
  Member exports self-only; Executive/President retain their existing
  cross-member dues visibility. It computes no extra access role and exposes no
  email addresses.
- Both report-data functions have explicit authenticated-only execute grants.
  Their invoker rights preserve table/view grants and RLS. Deactivated accounts
  receive no report data. Query errors, inconsistent row counts, unknown data,
  row-limit overflow, or audit failure stop the response without returning a
  partial file.
- Successful report requests append actor/type/format to `audit_log`; content,
  member row IDs, and amounts are not copied into that log. Existing officer-
  only SELECT and append-only update/delete protections remain in force.
- Exports use no service-role secret. CSV text cells neutralize formula-like
  prefixes. PDF output is a bounded text-only document with inert hex-encoded
  text and no embedded scripts, links, or HTML. The PDF's built-in font can
  transliterate unsupported glyphs; CSV retains the original Unicode.
