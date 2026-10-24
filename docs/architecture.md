# Architecture and security baseline

**Status:** Steps 2–11 (membership/RLS, authentication/lifecycle, dues, club finances and receipts, event planning/lifecycle, event finances/ticketing, minutes/attendance, announcements/polls, and in-app notifications) are locally verified. Google OAuth remains disabled until provider credentials are configured and end-to-end tested. Email delivery remains deferred under D-008. Remaining decisions are tracked in [security-decisions.md](security-decisions.md).

## Approved technical direction

- One club in the first release; no multi-club tenant model.
- Next.js App Router with strict TypeScript and server rendering where it fits.
- Supabase PostgreSQL, Auth, and Storage.
- Vercel Hobby hosting, GitHub Actions for CI, and PostgreSQL `pg_cron` for database-local scheduling, subject to current free-tier and hosted-project verification before deployment.
- Club time zone is `Africa/Lagos`; money is stored as whole Nigerian Naira integers.

## Recommended security boundaries

1. **Browser → Next.js:** Treat every form field, URL parameter, cookie, header, and request body as attacker-controlled. Client checks are for usability only.
2. **Next.js → Supabase Auth/PostgreSQL:** Use server-side session verification for protected reads and mutations. Each mutation must check authenticated identity, current account status, role, resource relationship, operation, business rules, and validated input.
3. **PostgreSQL:** For every Data API-exposed table, table grants and RLS are separate controls: grant only needed operations and enable RLS with explicit policies. Use constraints and transactions for invariants that must hold under concurrency. Prefer `SECURITY INVOKER`; any justified `SECURITY DEFINER` function needs a narrow purpose, a fixed safe `search_path`, explicit authorization checks, and restricted execution grants.
4. **Next.js → Storage:** Receipts belong in a private bucket. Authenticated browser roles are denied direct receipt-bucket reads and writes by restrictive Storage policies. The upload/download routes first verify the current session and linked shared-finance record; database procedures repeat the role/status checks. A server-only Supabase secret/service-role key handles Storage bytes only. The download route streams a bounded attachment with `no-store` and `nosniff`; no public or signed URLs are issued.
5. **CI/Vercel → production:** Keep deployment and job credentials in platform secret stores. Do not put service-role credentials in browser bundles or committed files.
6. **External identity/email providers:** Treat callbacks and provider responses as untrusted input; constrain callbacks to the configured site origin. Supabase automatically links identities only for matching verified emails; membership approval remains a separate database status. Google credentials stay outside Git and must be configured before that provider is enabled.

## Data access pattern

- Keep database access and environment reads in a server-only data-access layer (mark modules `server-only`) and return minimal, permission-filtered DTOs to UI components.
- Verify authentication and authorization inside every Server Action and Route Handler. Layout, page, or navigation checks alone do not authorize a mutation.
- Use Supabase's public/publishable browser credential only where needed; it is not a substitute for RLS. Step 6 uses `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) only in the `server-only` receipt Storage module. The elevated client performs Storage upload/download/remove operations; it does not read or write application tables. The session client and database RPCs authorize every receipt operation. Keep the secret only in ignored local configuration or the hosting secret manager.
- Never use user-editable Auth user metadata as an authorization source. Do not depend on stale JWT role/status claims when the application requires immediate deactivation; consult current database-backed membership state in protected access paths.
- For any public schema object reachable through the Data API, set grants and RLS deliberately. New Supabase projects stopped exposing new `public` tables by default on 2026-05-30; enforcement across existing projects is scheduled for 2026-10-30. Migrations must state intended exposure instead of relying on a project default. Views need their own review; use `security_invoker` where they should honor caller permissions and underlying RLS.
- Supabase SSR uses cookie-backed sessions and PKCE. Step 3 pins `@supabase/ssr` and `@supabase/supabase-js` in the lockfile. The proxy refreshes sessions only; server data access and PostgreSQL independently enforce current membership state.
- Auth cookies are HttpOnly, SameSite=Lax, and Secure in production. Access tokens expire after one hour and refresh-token rotation is enabled. The current Supabase Free plan does not include configurable Auth session timeouts; absolute/inactivity expiry is a documented residual risk, while database membership checks still block deactivated accounts immediately.
- Google OAuth code is wired but disabled by default. To enable it, configure the Google client ID/secret in Supabase Auth's provider settings (or ignored local Supabase environment), allow only the exact `/auth/callback` redirect, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`. Never commit the provider secret.
- Keep schema and policy changes as reviewed migrations. Do not enable a feature until its table access matrix and positive/negative RLS tests exist.
- Use atomic database operations for dues payments, ticket capacity, event ledger posting/reversal, attendance check-in/close/corrections, poll voting, and other concurrency-sensitive actions.
- Keep financial and audit history when correcting, cancelling, or removing business records; destructive cascades require explicit review.

## Step 10 announcements and anonymous polls

- Announcements and polls are readable only by active members. Admin/Executive publish club-wide; assigned Event Leads publish to their event; Backup Admin, Assistant, Committee, and ordinary members cannot publish. Server Actions use the session client, and database procedures recheck current status, role, event relationship, and input. Members can create only their own read marker.
- Revisions are append-only and reasoned. Announcement and poll content is bounded and validated in PostgreSQL; Next.js renders it as ordinary escaped React text. Poll options become locked on the first accepted vote. Votes are final and unique per poll/member; a poll-row lock serializes competing submissions.
- Eligibility (`poll_voter_eligibility`) and choice (`poll_ballots`) are stored separately in the unexposed `private` schema. Ballot rows contain neither voter ID nor vote timestamp. Application roles, including officers, receive no direct table access. Only controlled functions return aggregate counts.
- Exact poll counts are hidden in both individual and batched result functions until the poll has closed and at least five members have voted. A closed poll below five votes returns no exact counts. The page refreshes open-poll status every 30 seconds only while visible; this uses existing Supabase requests and adds no Realtime or paid service.
- All nine local database suites pass **472 assertions**; lint, production build, and six receipt tests pass. Hosted behavior, authenticated browser workflows, true simultaneous voting contention, and cryptographic/operator-proof anonymity remain unverified. Outside knowledge can still permit inference from small released aggregates.

## Step 11 private notifications and schedules

- `public.notifications` and `public.notification_preferences` use forced RLS. Active members can select their own rows; pending and deactivated accounts cannot see notifications. Direct insert/update/delete is denied. Read markers and preference changes go through user-session RPCs that recheck `auth.uid()` and current active status. Preference changes are written to append-only `audit_log`.
- Routine preferences cover announcements, new polls, polls closing soon, attendance opening, and event activity. Dues reminders and officer alerts cannot be muted. Email delivery and email preferences are not implemented. Notification titles/bodies are fixed generic strings, and the page renders them as escaped React text; it does not copy private dues state/amounts, receipts, payer/payee details, poll-choice data, or audit JSON.
- Audit-triggered notices cover announcement/poll creation, event creation/details/status, attendance opening, membership status/club-role changes, dues, club finance, event budget/ticket/finance/ledger/receipt actions. General finance/member/event alerts go to active global Executive/Admin/Backup Admin; event finance notices additionally go only to that event's active Lead/Assistant. Committee and ordinary members never receive privileged alerts. The action initiator is omitted from generated notices.
- A private `pg_cron` job runs each minute for poll-closing thresholds and WAT month-start dues reminders. Monthly reminder eligibility checks active status, the current dues-membership period, an applicable historical rate, and absence of a current paid/write-off disposition. Dues text omits amounts/status. Unique recipient keys and a transactionally claimed month key prevent duplicates. Business audit notification failure aborts that same business transaction; cron failures are available in `cron.job_run_details` for operator review.
- Ten local database suites pass **510 pgTAP assertions**; six receipt-byte tests, lint, and production build pass. Local PostgreSQL has `pg_cron` and the migration schedules one job. The target hosted project is not linked, so hosted extension/Free-project configuration, job-run visibility, paused-project behavior, and signed-in browser session/error UX remain unverified. Supabase currently labels its Cron feature Beta; the public Free plan lists PostgreSQL but no separate Cron charge, while Cron consumes shared database compute and paused projects cannot run jobs. Notification retention is indefinite and should be reviewed as the database grows.

## Step 2 membership and role foundation

- The current data-access matrix is in [data-access-matrix.md](data-access-matrix.md). Step 2 creates `member_profiles`, `member_role_assignments`, and `audit_log` only; later approved steps add finance and other feature tables.
- Profile emails are not copied into the public profile table. Auth email remains in Supabase Auth. Members see their own profile, active members see only the active name/username directory, and active officers may see all profile status rows.
- Role values are explicit: `executive`, `admin` (primary Admin), and `backup_admin`. Member is the baseline identity; event roles will be scoped to event assignments. No client can write role/profile/audit tables directly.
- Public role RPC wrappers are `SECURITY INVOKER`; their narrow mutation functions live in the unexposed `private` schema, require `auth.uid()`, consult current profile/role rows, and write audit history in the same transaction.
- One private lock serializes role changes with the last-primary-Admin check. The database rejects revoking or deactivating the last active primary Admin. Future account-status procedures must preserve this lock ordering.
- The generated local config exposes only `public` and opts out of automatic grants for future public objects. Step 3 enables email signup with confirmation; all new accounts remain pending until database approval.
- Initial Admin provisioning is an operator-only setup task after Auth/profile creation in Step 3; no client-callable bootstrap bypass exists.
- Follow the [initial primary Admin provisioning runbook](initial-admin-provisioning.md) once for the first Admin. It uses a trusted database transaction, requires a confirmed and completed profile, and creates no application-callable bootstrap path.

The membership and role migration is applied to local PostgreSQL and all 54 Step 2 pgTAP assertions passed. Step 3 adds an Auth-user profile trigger, self-only profile completion, confirmation-gated approval, Admin/Backup Admin deactivation/reactivation, reason-required audit records, and current-status authorization checks. See the roadmap for its current verification status.

## Step 4 dues architecture

- `dues_rates`, membership periods, payments and month dispositions have forced RLS. Authenticated clients have `SELECT` only; all financial writes go through narrowly scoped database procedures.
- Members can read their own individual dues. Active Executive/Admin/Backup Admin accounts can review individual dues, while every active member can read one fixed club-wide aggregate. Deactivated accounts lose all dues access even when an old JWT remains valid.
- Full-month amounts and historical rates are resolved in PostgreSQL. Payment recording, write-offs and corrections take the administration guard and member-row locks, enforce one current disposition per member/month, and append audit records within the same transaction.
- Rate changes take effect the following month. Effective rate history is immutable; only Admin/Backup Admin can change the next scheduled rate, and prepaid month snapshots retain their original amounts.
- Dues Server Actions recheck user, active profile, role and form values before RPC calls. Database procedures independently recheck authorization and the financial rules.
- See [data-access-matrix.md](data-access-matrix.md), [security-decisions.md](security-decisions.md), and the Step 4 section in [roadmap.md](roadmap.md) for per-operation access and tests.

## Step 5 club finance architecture

- The club ledger stores non-dues income and expenses as whole-Naira integer
  rows. No opening balance is accepted; the fixed balance procedure combines
  the dues aggregate with posted non-dues income and expenses.
- Active members can read shared financial details, including payer/payee and
  source/description. Individual dues remain private. Members cannot write to
  either finance table directly.
- Executive/Admin/Backup Admin can post and manage categories. Only Admin and
  Backup Admin can correct or void existing transactions; a reason and
  before/after audit row are required. Voids retain history and leave totals.
- A shared database row lock serializes financial writes and category
  retirement; an actor-scoped idempotency key prevents retried submissions from
  duplicating a posting.
- See [data-access-matrix.md](data-access-matrix.md) and the Step 5 roadmap
  record for exact access boundaries and test evidence.

## Step 6 club-finance receipt architecture

- Step 6 receipts attach to shared club-finance transactions; Step 8 adds
  event-finance receipt links using the same private bucket and validator.
  Individual dues records and dues receipts remain private.
- The bucket is private and limited to 4 MiB, PDF/JPEG/PNG MIME values. A
  restrictive Storage policy denies direct client list/read/write/delete access
  for the bucket. The server generates the object path from transaction and
  receipt UUIDs; client-supplied paths are never accepted.
- The POST route requires an exact configured Origin, current Auth user, active
  profile, Executive/Admin/Backup Admin role, readable unvoided transaction,
  exact multipart field set, allowed extension/MIME and verified file signature.
  It rejects request bodies above 4,500,000 bytes before parsing. PostgreSQL
  reserves the row, rechecks the role under the shared administration lock,
  verifies the relationship, and only allows finalization after the object is
  uploaded. Successful finalization stores SHA-256 and appends a minimized
  immutable audit record.
- Active members read available receipt metadata. GET validates active status
  and the receipt/transaction relationship through PostgreSQL, downloads via the
  server-only Storage client, verifies byte count and SHA-256, then sends an
  attachment with `no-store`, CSP sandbox, and `nosniff` headers. It returns no
  signed URL and discloses no Storage path in the response.
- The 4 MiB cap fits below Vercel Functions' 4.5 MB request and response
  payload ceiling. Supabase Free still governs stored bytes and transfer quota;
  uploads fail closed when Storage or its secret configuration is unavailable.

## Step 7 event planning and lifecycle architecture

- `events`, event-scoped role assignments, budgets, and allocations use forced
  RLS. Every active member may read event details, current staffing, and budget
  values for transparency; archive reasons, identity/audit metadata, and full
  assignment history stay limited to active officers.
- Event roles are Lead, Assistant, and Committee. Executive/Admin/Backup Admin
  manage event creation and staffing. A Lead or Assistant can edit event
  details and budget only for their assigned event while it remains mutable;
  only a Lead can complete/cancel. Committee membership grants no Step 7
  mutation rights. Executive is not equivalent to Admin for reopening:
  completed/cancelled events can be reopened only by Admin or Backup Admin.
- Mutations use user-session RPCs with `SECURITY INVOKER` public wrappers and
  narrow private implementations. PostgreSQL independently validates active
  membership, current role, event scope, state, reasons, JSON shape, date and
  money bounds. Event rows serialize lifecycle changes; the shared
  administration guard serializes them against role/deactivation changes.
- Budget allocations replace atomically, are bounded to 50 rows, store a
  percentage and a whole-Naira amount, and may leave part of the parent budget
  unallocated. Percentages and calculated amounts cannot exceed the budget.
  Sensitive state changes append audit rows in the same transaction. Direct
  writes are denied; hard deletes fail; foreign keys preserve event, role,
  budget, and future financial history.
- Archived events are retained tombstones. After the latest four past events,
  a database trigger makes older past-event records read-only; explicit
  reason-required archival remains available. The check is enforced for direct
  privileged mutation paths as well as the UI.
- Dates are bounded to 1900-01-01 through before 2200-01-01 UTC at the database
  boundary. Event descriptions and user text render as escaped React text.
  Feature flags are fixed at event creation to avoid silently changing a
  record's security/operational model later.
- The UI hides actions outside the user's current capabilities, but RLS and
  procedures enforce the same boundary. All active members see retained event
  and budget data; only current active profiles may open the events page.

## Step 8 event finance, ticketing and event ledger

- Event ticket tiers, financial transactions, sales, receipt metadata and
  ledger entries use forced RLS. Active members receive only the approved
  readable columns; they can see event payer/payee and ticket buyer details and
  available receipts. Dues rows and individual dues receipts remain private.
- Event Lead/Assistant access is checked against the exact event. Executive,
  Admin and Backup Admin have global event-finance management access. Committee
  membership alone grants no financial mutation. Any active member can record
  ticket sales; only the seller can edit their sale without an elevated Admin/
  Backup Admin grant. Admin/Backup Admin alone can correct or void event
  transactions, change another seller's sale, refund sales, and reopen events.
- Direct table writes are revoked. Server Actions validate exact FormData
  fields, active session/profile, role relationship, UUID, money, date and text;
  narrow `SECURITY INVOKER` RPCs call fixed-search-path private implementations
  that repeat authorization and business checks. Tier price is snapshotted on a
  sale. Event/tier and shared administration locks serialize capacity, financial
  and lifecycle mutations; actor idempotency keys make identical retries safe.
- Event financial corrections, voids, sale edits/refunds, tier changes, and
  receipt attachment append actor/time/target/before/after/reason audit data.
  Sales, voided rows, ticket tiers, receipts and event tombstones are retained.
  Paid income, paid/deposit expenses, and non-refunded ticket sales determine
  the realized net result. Pending/unpaid income and expense commitments remain
  visible in event tracking but do not post as cash to the club ledger. A
  terminal event status appends one signed net result to the club ledger;
  Admin/Backup Admin reopening appends an equal opposite entry, and a later
  completion/cancellation appends a new generation.
- Event receipt POST requires same-origin request, current active account,
  event-finance relationship, exact multipart fields, bounded PDF/JPEG/PNG
  bytes and database-generated storage path. The database rechecks the event
  role and verifies the Storage object before finalization. GET checks active
  membership and receipt identity, downloads only through a server-only Storage
  client, verifies size/checksum/signature, and returns a private no-store
  attachment with `nosniff`; the path and checksum are not queryable columns.
- The event page uses React-escaped text and shows read-only transparency to
  members. UI role gates mirror permissions but do not enforce them. It reports
  unavailable capacity/receipt state and hides the affected actions when
  verification fails.
- Ticketing may be enabled for meetings, parties, and other event types; doing
  so also enables budget, expense, and other-income tracking. The finance page
  provides overview, budget, expense, ticket, other-income,
  report, and activity sections. Date-filtered reports and private CSV
  downloads stay scoped to the selected event and include ticket refunds.
- The local migration and seven pgTAP suites pass 332 assertions; six Node
  receipt validation tests pass; lint and production build pass. Hosted Storage,
  authenticated browser upload/download, and a true simultaneous multi-session
  ticket stress test remain unverified. No per-user/IP request limiter is
  included; repeated distinct valid submissions are the main Low residual
  abuse risk under the current free-only setup.

## Step 9 meeting minutes and attendance architecture

- `event_minutes` is readable by active members only when that event has minutes
  enabled. Primary Admin and Executive can author; edits require a reason.
  `event_minutes_revisions` is append-only and officer-only. Current minutes are
  ordinary React text, never interpreted as HTML. Archived event minutes are
  read-only.
- Attendance rows use forced RLS and read-only member grants. A member can read
  their own row; assigned Lead/Assistant and global Executive/Admin/Backup
  Admin can review the roster in scope. Committee remains self-only. Members
  check in as `auth.uid()` through a button or QR; the caller cannot submit a
  member identity. A unique `(event_id, member_id)` row prevents duplicates.
- Only primary Admin/Executive open or close attendance, issue QR challenges,
  and change the club-wide late default. Backup Admin can review/correct but
  does not inherit those session-control or minutes-author permissions. Event
  Lead/Assistant can review and correct only their own event; every correction
  requires a reason. RLS and RPC checks repeat active-profile, current-role,
  event-feature, event-state and session-state authorization.
- The initial club-wide late default is 15 minutes. Officers can set a
  0–240-minute event override when opening the session. PostgreSQL anchors the
  cutoff to the event's stored `starts_at` instant; the UI displays it in
  `Africa/Lagos`. A check-in is late only after the cutoff. Close snapshots
  absent active members atomically; event completion, cancellation or archive
  also closes the session. A closed session is retained and cannot be reopened.
- The app generates a 256-bit QR challenge locally using `qrcode`; no external
  QR service is called. The random token is carried in a URL fragment (not an
  HTTP request URL), PostgreSQL stores only its SHA-256 hash, and the UI
  challenge expires after 90 seconds. The database caps any challenge at two
  minutes and binds it to an open event session. The user still authenticates
  before check-in. A member can share an unexpired QR code; physical presence
  cannot be proven by this app-only mechanism.
- Event, session and administration locks serialize check-ins against close,
  account deactivation and state changes. Correction and lifecycle changes
  append actor/time/target/before/after/reason audit rows. Minutes body text is
  retained in officer-only revisions; audit rows keep bounded metadata instead
  of duplicating it.
- Eight local pgTAP suites pass **398 assertions**; lint, build and the six
  receipt byte-validation tests pass. Two-session concurrency under live
  contention, hosted RLS behavior, and an authenticated physical-device QR scan
  remain unverified. The `qrcode` dependency installation audit reported zero
  known vulnerabilities at that time.

## Current documentation checks

Provider behavior checked on 2026-10-02. The Supabase changelog reports a default change for Data API exposure of new public-schema tables on 2026-10-30; the app should set intended grants explicitly. Supabase documents that RLS does not replace grants, views may bypass RLS unless configured as security invoker, service keys bypass RLS, private Storage downloads require authorization, and signed URLs remain usable until expiration. Re-check these details against current provider docs in the relevant approved implementation step.

Supabase Cron runs through PostgreSQL `pg_cron` and is labeled Beta in the
current feature catalog. The public Free plan lists a PostgreSQL instance and
does not show a separately priced Cron item, but this task's CLI has no linked
hosted project, so target-project availability, quota, and Dashboard run
history remain unverified. A Free project that pauses for inactivity cannot
run scheduled jobs. This architecture uses the database scheduler only and
does not depend on Vercel Cron. See [Supabase Cron](https://supabase.com/docs/guides/cron),
[Supabase pricing](https://supabase.com/pricing), and
[Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

References: [Next.js data security](https://nextjs.org/docs/app/guides/data-security), [Supabase changelog](https://supabase.com/changelog?types=breaking-change), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [Supabase Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Baseline implementation limits

The current UI implements authentication, member lifecycle, dues, club
income/expenses and receipts, event planning/lifecycle, event finances,
ticketing and event receipts, meeting minutes, attendance, announcements,
polls, and in-app notifications. D-009 approves a weekly, operator-run CLI
backup policy with two encrypted independent copies and isolated restores; it
does not add an in-app export endpoint. A full local database backup/restore
drill passed, but the local Storage volume contained no objects. Actual backup
destinations, host access/offboarding, and hosted receipt-object recovery still
need configuration and verification. The standard Supabase CLI dump also
excludes managed `auth` and `storage` schemas by default, so complete backup
coverage of Auth and Storage metadata must be explicitly tested; see [backup and
restore](backup-and-restore.md).
Reports and deployment hardening remain future roadmap work. The application is
not production-ready until Google credentials, hosted redirects, production
backup controls, and production security configuration are verified.

The scaffold uses Biome 2.5.5 for lint/format checks. The Next.js generator's ESLint 9 choice was marked unsupported by npm; forcing ESLint 10 produced peer incompatibilities in Next's bundled React/a11y plugins. Biome is an official Next.js scaffold option and avoids that invalid dependency tree. Reassess lint rules as the application gains Next.js server actions, React forms, and security-sensitive code.

`.env.local` is for local secrets and must remain ignored. `.env.example` contains only blank credential placeholders and public local configuration. The Supabase publishable key is intentionally browser-safe. `SUPABASE_SECRET_KEY` (or the legacy service-role key name) is server-only and used by the receipt routes for private Storage operations; it is never included in client code. Google OAuth secrets remain in provider/server configuration. The initial response headers reduce MIME sniffing, framing, and referrer exposure. A Content Security Policy, HSTS, and production redirect configuration must be designed and verified in the deployment step rather than guessed in the scaffold.

## Operational conventions

- Display and interpret club dates with an explicit `Africa/Lagos` strategy; do not rely on the browser or server's local time zone.
- Return limited user-facing errors; keep diagnostics server-side and redact credentials, private dues data, and receipt links.
- Before any deployment, verify current service plans, limits, and configuration from official provider documentation. Do not assume a free plan includes a control.
