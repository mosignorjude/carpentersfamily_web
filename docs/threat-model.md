# Lightweight threat model

**Scope:** First-release Carpenters Family Social Club member app. This threat model was started in Step 1 and extended through Step 11 in-app notifications; it is not a final audit. Revisit it as features and external services are added.

## Actors

- Unauthenticated visitor and pending applicant
- Active member and deactivated member (including one with an old, still-valid identity-provider session)
- Executive
- Event lead, event assistant, and committee member
- Admin and backup admin
- Attacker with a stolen session, crafted request, guessed resource identifier, malicious upload, or automated client
- CI/deployment operator and scheduled job identity

These roles are separate identities. Resolved Admin/Backup Admin authority is recorded in [security-decisions.md](security-decisions.md); event-specific role grants remain separate.

## Important assets

Authentication credentials and sessions; member names, email addresses, usernames, and account status; individual dues status and payment details; club and event transactions; ticket sales and buyer details; budgets and ledger postings; receipts; attendance; meeting minutes; announcements; poll eligibility and ballots; notification preferences and read states; audit history; database/storage backups; Supabase service credentials; OAuth and deployment secrets.

## Trust boundaries

| Boundary | Untrusted input or risk | Security expectation |
| --- | --- | --- |
| Browser ↔ Next.js | Forms, IDs, query parameters, cookies, headers, client state | Revalidate session and authorization on every server mutation; validate shape and business rules on the server. |
| Next.js ↔ Supabase Auth | Callback parameters, provider response, token/session state | Verify callback state and current application membership; deactivation must block database-backed access immediately. |
| Next.js ↔ PostgreSQL | Requests, selected IDs, role claims, filters, amounts | RLS plus constraints and transactions; do not rely on UI role checks. |
| Next.js ↔ Supabase Storage | Object paths, metadata, file content, elevated server key | Private bucket; restrictive deny policies for authenticated direct access; only same-origin, session-checked routes use a server-only key for bounded byte transfer. |
| GitHub Actions/Vercel ↔ production | CI inputs, build artifacts, secrets, scheduled calls | Least-privilege secrets, protected production settings, no secret values in logs or client bundles. |
| Uploaded file ↔ app | Filename, MIME header, extension, bytes | Treat as hostile; validate content/size and do not render active formats as trusted HTML. |
| App ↔ external identity/email services | Provider callback and delivery responses | Validate, minimize personal data, and verify plan/security limits before adoption. |

## Threat assessment and planned controls

| Threat | Relevance | Planned control / verification point |
| --- | --- | --- |
| Unauthorized access, IDOR/BOLA, role escalation | Core risk for private member, dues, event, and finance records. | Per-table RLS and per-mutation server authorization; tests alter member/event/transaction IDs for every role. |
| Profile and role disclosure, forged role mutation | Relevant at the member-profile and role-assignment boundary. | Do not expose email in the member directory; force RLS, grant authenticated read only, keep role writes in current-state-checked RPCs, and test member/Executive/Backup Admin/Admin boundaries and altered target IDs. |
| Last primary Admin removal or concurrent deactivation | Could permanently strand the club without administrative control. | Serialize role mutations and status deactivation on one database lock; reject removal/deactivation of the final active primary Admin; test successor transfer and the final-admin boundary. |
| Audit rewrite after privileged role change | Application-level role changes need trustworthy attribution and historical retention. | Append audit rows in the same transaction, deny direct table writes, reject audit update/delete, and test reason/actor/target capture. |
| Stale sessions after deactivation; takeover and session abuse | Relevant because deactivation is immediate and auth-provider sessions may outlive membership state. | Check current application status in server/database authorization; test a previously issued session after deactivation. |
| SQL injection and malicious search/filter input | Relevant once queries, filters, and reports exist. | Parameterized Supabase/PostgreSQL access, allowlisted filters, bounded pagination, tampering tests. |
| Stored/reflected/DOM XSS | Relevant to profiles, announcements, minutes, descriptions, names, and notes. | Framework output escaping; avoid unsafe HTML; validate length; test hostile content through display and export paths. |
| CSRF | Relevant to cookie-authenticated mutations. | Use framework protections and origin checks; assess cookie SameSite/secure settings and test cross-origin mutation attempts. |
| Financial tampering, duplicates, historical rewriting, race conditions | Critical for dues, ticket capacity, expenses, refunds, and event ledger posting. | Whole-Naira constraints, atomic procedures, unique/idempotency rules, shared administration and event/tier row locks, actor/reason audit trail, role/state/tampering tests, and retained signed reversal entries. Sequential capacity boundaries pass; a true simultaneous two-session sale stress test remains unverified. |
| Over-disclosure of financial counterparties or receipt content | Relevant because the approved transparency policy makes club/event payer/payee, ticket buyer, and receipt details visible to active members. | Event and club rows expose only approved read columns under forced RLS. Active members download available shared receipts only through an active-session database-resolved route. Receipt paths/checksums are not directly selectable. Individual dues rows and dues receipts remain private. |
| Receipt abuse, path traversal, unauthorized downloads | Relevant at the receipt upload/download boundary. | Private 4 MiB bucket; direct client Storage access denied; same-origin POST; active event-finance manager and linked unvoided transaction checks; allowlisted extension/MIME and byte-signature validation; database-generated event path; Storage-object finalization, checksum/size verification, attachment-only response; test unsafe bytes, path traversal, tampered IDs, event-role denial, and inactive state. Hosted Storage and authenticated browser transfers remain unverified. |
| Cross-event privilege reuse, forged event role, lifecycle tampering, or budget mismatch | Relevant to event and budget procedures; event IDs are attacker-controlled and role assignments are scoped resources. | PostgreSQL repeats event relationship and current-state checks, locks each event, caps and validates budget allocations with exact totals, restricts reopen to Admin/Backup Admin, and records reasoned audit history. Tests attempt another event's lead action, forged role boundaries, terminal edits, budget mismatch, tampered IDs, and archival. |
| Event deletion or old-record rewrite | Could destroy future ticket/ledger references or financial/audit history. | D-006 retains event tombstones with restrictive foreign keys and hard-delete rejection. Only the latest four past events remain ordinarily mutable; older past events are database-enforced read-only while explicit archival remains possible. Tests cover denied old-event mutations, allowed latest-four actions, retained budgets, and denied hard delete. |
| Poll manipulation or voter identification | Relevant because voting is anonymous, final, and one-per-member. | Separate forced-RLS eligibility/deduplication and ballot tables; ballot has no member ID or timestamp; direct table access denied to app roles; one final vote/member; withhold exact counts until closed and five votes; test unauthorized direct access, duplicate/finality, and threshold boundaries. Residual: database operators and outside knowledge are not cryptographically excluded. |
| QR replay, sharing, wrong event, duplicate check-in | Relevant to QR attendance. | The database requires current active identity, session open state, matching event/session and unique event/member row. QR token is a 256-bit challenge stored as SHA-256 hash and carried in the URL fragment; replacement, expiry, wrong-event, duplicate, deactivated, pending and closed-session paths are tested. Active members can still share a valid 90-second challenge; the scan is not proof of physical presence. |
| Notification leakage, email abuse, schedule replay | Relevant to dues/member data and repeated jobs. | Per-member RLS, opt-out enforcement, minimal content, idempotent jobs, recipient and repeat-run tests. |
| CSV formula injection and unsafe/expensive PDF inputs | Relevant to exports containing user text. | Neutralize formula-leading cells, escape PDF text, bound dates/rows/input size; test dangerous prefixes and large data. |
| Secret exposure, vulnerable dependency, unsafe deployment | Relevant across CI and production. | Ignore local env files, keep server secrets server-only, lock dependencies, review advisories, audit production settings and generated bundles. |
| Backup theft, accidental deletion, denial of service | Relevant to full-data export, uploads, auth, and public endpoints. | Restrict backup identities/destination, restore drills, request/upload bounds, and provider rate controls only where verified available. |

## Step 4 implemented controls and verification

- Dues tables have forced RLS and authenticated read-only table grants. Members
  see their own rows; active officers have the approved cross-member review
  capability. A fixed aggregate exposes no individual dues status.
- Server Actions check the authenticated user and active profile, validate
  typed input and role, and call narrow database RPCs. The procedures repeat
  authorization and business checks, lock conflicting state, and commit the
  payment/disposition and audit entry atomically.
- Database constraints and unique indexes reject invalid money, month coverage,
  dates, duplicate current dispositions and impossible history. Effective rate
  history cannot be rewritten; future rate correction is limited to next month.
- The local pgTAP suites passed 135 assertions across membership, lifecycle and
  dues privacy. The UI build and lint passed. No concurrency stress test against
  simultaneous sessions or a hosted Supabase project has been run; row/guard
  locks and unique constraints are covered by transactional regression cases.
- Request-work bounds are 1,200 months per financial operation. Payment and
  audit history use bounded 50-row pages; rate history is capped at 1,200 rows,
  matching the 100-year dues horizon.
- There is no app-level per-actor/IP time-window limiter on dues RPCs. Active
  role checks, unique month dispositions, exact totals and the batch cap limit
  each operation, but repeated authorized requests are not throttled. Hosted
  platform limits have not been verified; set an explicit database throttle if
  club bookkeeping policy needs a per-user threshold.

## Step 5 implemented controls and verification

- Finance tables use forced RLS and authenticated clients have only column-level
  SELECT grants. Every active member can read the shared club ledger, including
  payer/payee details; individual dues records remain private. An aggregate
  database function exposes totals only and requires active membership.
- Executives/Admin/Backup Admin can post current transactions and manage
  categories. Only Admin/Backup Admin can correct or void existing entries.
  Corrections and voids require a reason; voiding preserves the row. Category
  retirement preserves snapshots and cannot erase ledger history.
- Database procedures recheck the current account and role, validate money and
  date bounds, serialize financial writes/category changes, enforce a unique
  actor-scoped idempotency key, and append immutable audit entries in the same
  transaction. The Server Actions independently validate input and current
  account/role before calling those procedures.
- Finance UI output uses React text rendering; no user text is interpreted as
  HTML. Members receive payer/payee, source details, and available club-ledger
  receipt names intentionally. Individual dues records remain private. Receipt
  downloads pass through a no-store, attachment-only Next.js route that checks
  the active account and resolves the linked finance record before using the
  server-only Storage client.
- The local database suites pass 179 assertions, including finance role
  denials, member visibility, deactivation, date/amount checks, retry
  idempotency, historical category retention, audit and balance reconciliation.
  A true simultaneous two-session stress run, hosted RLS verification, and
  browser-driven form exercise have not been performed. Repeated distinct-key
  officer writes have no per-actor/IP throttle under the current free-only
  architecture.

## Step 6 implemented controls and verification

- The club-finance receipt bucket is private, capped at 4 MiB, and limited to
  PDF/JPEG/PNG. Restrictive Storage policies deny direct application-role
  reads/writes. Receipt paths are generated from database UUIDs and are not
  selectable through the metadata table.
- The same-origin Next.js upload route verifies the current Auth user, active
  profile, officer role, unvoided shared finance transaction, exact form shape,
  bounded request bytes, file extension/MIME, and file signature. The database
  repeats current role/state/transaction checks, hides pending/failed rows,
  confirms the Storage object before finalization, and audits actor/time/linked
  transaction/type/size without logging bytes, path, or filename.
- The download route requires an active member, resolves an available receipt
  through the database, validates object path/size/checksum, and responds only
  with an attachment plus `no-store`, sandbox CSP, and `nosniff` headers. An
  unauthenticated request returned 404; a cross-origin POST was redirected to
  the denied notice. A successful authenticated file transfer, hosted Storage
  policy behavior, and Vercel production payload behavior remain unverified.
- The local database suites pass 207 assertions across five files. Six Node
  regression tests cover accepted/rejected file signatures, MIME/extension
  mismatches, size bounds, path traversal, and safe filenames. Lint and the
  production build pass.
- A Low, non-blocking residual risk remains: no per-user/IP upload rate limit.
  An authorized but compromised officer can repeat valid 4 MiB uploads until
  the finite Free Storage/egress quota is exhausted. The database allows one
  pending upload per actor, and requests fail closed when Storage rejects them.
- A second Low, non-blocking residual risk is that byte signatures do not scan
  for malware or all malformed/polyglot documents. Receipts are never rendered
  as HTML and downloads are forced attachments, but downloaded documents still
  need endpoint protection when members open them. No scanning service was
  added in this free-only step.

## Step 7 implemented controls and verification

- Event details, staffing, budgets and allocations use forced RLS and
  read-only authenticated grants. Active members can see retained event and
  budget information; event creation, role assignment, budget changes, status,
  and archive operations use current-session RPCs with independent PostgreSQL
  authorization. Email is not included in the event member picker.
- Lead, Assistant and Committee remain event-scoped. Executive/Admin/Backup
  Admin manage event roles. Lead/Assistant detail and budget changes are
  confined to their event; Lead can complete/cancel; only Admin/Backup Admin
  reopen; Executive does not inherit Admin reopening authority. Deactivated or
  pending accounts cannot read or mutate event data despite an identity/JWT.
- Event-row locks and the shared administration guard serialize lifecycle
  changes against conflicting event state and member role/deactivation
  changes. Budget payloads reject unknown fields, bound allocations, require
  exact totals, and commit with audit atomically. Event timestamps have a
  database range constraint.
- D-006 is implemented with restrictive references, a hard-delete rejection
  trigger, reasoned tombstones, append-only audit, and a latest-four past-event
  mutation boundary enforced in the database. Older past events can still be
  explicitly archived. Active members retain visibility of tombstones and
  budgets; archive reason and full audit history remain officer-only.
- All six local Supabase suites pass 271 pgTAP assertions. `npm run lint` and
  `npm run build` pass. A production-mode unauthenticated GET `/events` returned
  HTTP 307 to the sign-in notice with private/no-store cache headers. Hosted
  RLS, authenticated browser actions, and simultaneous multi-session stress
  tests remain unverified.
- **Low, non-blocking finding:** There is no per-user/IP rate limiter for
  repeated event creation or other authorized event management requests. Role
  and account checks, event locks, row uniqueness and bounded payloads still
  apply, but repeated distinct valid requests are not throttled. No paid
  infrastructure or invented threshold was introduced.

## Step 8 implemented controls and verification

- Event finance and ticketing tables use forced RLS, member-safe column grants,
  restrictive foreign keys and no direct client mutation. Active members can
  read event payer/payee, ticket buyers, and available receipt metadata. The
  approved D-010 boundary keeps Committee finance writes denied; assigned
  Lead/Assistant roles are event-scoped, while Executive/Admin/Backup Admin
  manager rights are global.
- Ticket sale price comes from the locked database tier and is snapshotted.
  Event and tier locks plus the shared administration lock guard capacity;
  refunding marks a retained row and reopens capacity. Actor-scoped idempotency
  protects retries. Transaction corrections/voids, other-seller edits/refunds,
  and event reopening are restricted to Admin/Backup Admin with reasoned,
  append-only audit. Terminal event status posts a signed result; reopening
  posts its opposite; later completion/cancellation has a new generation.
- Event receipt upload/download uses the existing private 4 MiB bucket and
  server-only Storage client. The POST route validates Origin, active identity,
  event relationship, request/file size, exact form fields, MIME/extension and
  bytes. The database reserves a generated path and only finalizes an existing
  object. Active members may download a linked available event receipt after
  database resolution; the route verifies path, size, checksum and bytes and
  serves an attachment with no-store and nosniff.
- All seven local database suites pass 332 pgTAP assertions; six receipt
  byte/request tests pass; lint and production build pass. Test evidence covers
  role and event scope, member transparency, seller IDOR, capacity/oversell,
  idempotency, refunds, reasoned audit, pending receipt failure, terminal state,
  reversal/reposting, and balance reconciliation. Hosted Supabase/Storage,
  authenticated browser file transfer, and true simultaneous ticket-sale stress
  remain unverified.
- **Low, non-blocking finding:** There is no per-user/IP rate limit for distinct
  valid event-finance writes or uploads. An authorized member/officer can repeat
  otherwise valid requests and consume finite Free Storage/egress. The database
  still checks roles, inputs, capacity and state, and rate thresholds were not
  invented. No paid limiter or malware-scanning service was added.

## Step 9 implemented controls and verification

- Minutes are active-member-readable only for an event with minutes enabled.
  Primary Admin/Executive author and edit; edits require a reason and append a
  full officer-only revision. Audit rows retain actor/time/event/reason and
  bounded revision metadata. Text is rendered by React as escaped text.
- Attendance session, settings, minutes, revision and roster tables use forced
  RLS and no direct application write grants. Check-in identity is derived
  exclusively from `auth.uid()`. Members and Committee can read only their own
  attendance. Assigned Lead/Assistant can review and correct only their event;
  global Executive/Admin/Backup Admin can review/correct all events. Only
  primary Admin/Executive can open/close, issue QR, or change the club cutoff.
- The club default is initially 15 minutes; an Admin/Executive can select a
  0–240 minute event override when opening a scheduled attendance-enabled
  session. Cutoff is stored as an absolute timestamp from the event instant and
  shown in `Africa/Lagos`; before-cutoff and after-cutoff cases are covered.
  Close atomically adds absent rows for active members without a record. Event
  completion/cancellation/archive also closes the session. Closed sessions
  cannot be reopened, but officers can correct present/absent/rejected status
  with a reason and immutable audit.
- A locally generated QR contains a random challenge only in the URL fragment;
  HTTP requests do not send it as a path/query. PostgreSQL stores only the hash,
  verifies the event's active session, and enforces a two-minute maximum expiry
  (the UI uses 90 seconds). Replaced, expired, wrong-event, duplicate, closed,
  pending and deactivated cases are covered by local pgTAP tests. The QR package
  install audit reported zero known vulnerabilities; no external QR service is
  used.
- All eight local database suites pass **398 pgTAP assertions**. `npm run lint`,
  `npm run build`, and six receipt-byte tests pass. Hosted RLS behavior, an
  authenticated physical-device QR scan and simultaneous two-session
  check-in/close stress remain unverified.
- **Low, non-blocking QR sharing risk:** an active member can share a valid QR
  challenge with another active member within its 90-second window. The second
  member can only check in as themselves, and the normal button has the same
  attendance behavior. **Recommended mitigation:** supervise the check-in or
  correct the roster with a reason when attendance needs stronger in-person
  evidence. **Blocks Step 9:** No; active authentication, event binding,
  short expiry and per-member uniqueness remain enforced.

## Step 10 implemented controls and verification

- Active members read announcements and polls. Admin/Executive publish globally;
  an assigned Event Lead publishes only to the assigned event. Backup Admin,
  Assistant, Committee, and members do not inherit publisher rights. Members
  see only their own announcement read markers. Every Server Action validates
  the session and form shape; database procedures independently enforce
  membership, roles, event scope, poll state and values.
- Announcement and poll histories are append-only; edits require a reason.
  User-authored text is bounded and rendered by React as escaped text. Direct
  table writes are denied. Deactivated/pending identities cannot vote or read
  protected communications.
- Each active member may cast one final poll vote. Eligibility/member and
  choice/ballot data live in different forced-RLS private tables. The ballot
  contains no member ID or timestamp, and no application role including Admin,
  Backup Admin, or Executive has direct access. Database functions reveal only
  aggregates after poll closure and at least five votes; under-threshold closed
  polls keep exact counts hidden. Open poll totals remain hidden even after
  five votes.
- All nine local database suites pass **472 pgTAP assertions**; six receipt
  validation tests, lint, and production build pass. Tests verify 0/1/2/5 open
  votes, closed release at five, closed suppression below five, duplicate
  voting, configuration lock, role/event scope and direct-table denial.
  Hosted RLS/browser behavior, browser-level hostile-text rendering, and true
  simultaneous vote contention remain unverified. The database row lock and
  unique eligibility key provide local serialization.
- **Low, non-blocking abuse finding:** No per-user/IP throttle applies to
  repeated poll reads or rejected vote requests. Accepted votes remain limited
  to one per active member and poll. Consider an approved quota if usage
  warrants it; no paid service or arbitrary limit was added.
- **Informational privacy limit:** Application roles cannot map an identity to
  a choice, but the design does not provide cryptographic anonymity from
  privileged database operators. A released aggregate may also be inferred by
  people who have outside information about participation or votes.

## Step 11 implemented controls and verification

- **Assets/boundary:** Notification content, per-member read state/preferences, dues membership/payment state, poll timing, officer roles, database schedule and audit history cross Browser → Next.js → Supabase Data API → PostgreSQL/`pg_cron`. No email provider, webhook, service-role key, or external scheduler is involved in notification delivery.
- **Recipient authorization:** Forced RLS limits SELECT to the active caller's notification and preference rows. Direct writes/deletes are revoked; RPCs verify current `auth.uid()` and active status. Pending/deactivated rows remain inaccessible even if present. Dedupe keys prevent repeated business-trigger and scheduled notices. Event finance alerts reach global officers plus that event's Lead/Assistant only; Committee and ordinary members are denied privileged notices.
- **Privacy/content:** Announcement, poll, attendance and event activity bodies use static generic text. Dues notices include no amount/status; polls closing alerts go to all active members rather than filtering by voter status; no receipt paths, audit snapshots, payer/payee data or vote choices enter notification content. React renders all text as escaped nodes. Preference categories are allowlisted and audited; dues and officer alerts cannot be opted out.
- **Integrity/failure:** Month keys are based on `Africa/Lagos`, require an active membership period and no current month disposition, and commit transactionally with reminders. Poll closing reminders run at/after the 75% duration threshold while the poll remains open. Unique recipient dedupe keys make retries idempotent. Notification-trigger failure aborts the same business transaction; a scheduled job failure rolls back its claim and is visible in cron run history for operator investigation.
- **Verification:** Ten local pgTAP suites pass **510 assertions**, including own-row and state RLS, read-ID tampering, allowed/forbidden preferences, audit preference changes, active/pending/deactivated behavior, paid/unpaid reminders, idempotent month/poll schedules, and event Lead/Committee/global officer scoping. Six receipt-byte tests, lint, and production build pass. Hosted RLS/Cron, live browser sessions, concurrent job stress, inactive-project behavior and production quotas were not verified. Supabase Cron is currently labeled Beta; the public Free plan has no separately listed Cron charge, but the target hosted project is not linked and Cron shares database compute. Free-project pausing stops jobs.
- **Low, non-blocking abuse/storage risk:** There is no per-user/IP rate limiter for alternating preference changes or repeated authorized notification-triggering actions. Each changed preference adds retained audit history; notification rows currently have no expiry/cleanup. Review activity and database growth during maintenance; no paid limiter or arbitrary threshold was introduced.

## Step 12 implemented controls and verification

- **Assets/boundary:** Finance and dues rows cross a same-origin POST form →
  Next.js Route Handler → authenticated Supabase session → `SECURITY INVOKER`
  report function → existing PostgreSQL RLS. Download bytes return only after
  an append-only export-request audit succeeds. Browser-supplied IDs, amounts,
  and report dates are not accepted.
- **Authorization/privacy:** The handler verifies the Supabase user and current
  active profile on every request. The finance report preserves the shared
  finance policy, including payer/payee and available receipt filenames. The
  dues report calls the security-invoker view query; members remain self-only
  while Executive/Admin/Backup Admin follow the existing officer policy.
  Deactivated accounts and cross-origin POSTs are rejected. Report rows and
  profile names come from one database statement snapshot.
- **Input/output/integrity:** Only one bounded CSV/PDF format field is allowed;
  the current Africa/Lagos calendar year is fixed server/database side. Report
  row counts cap at 1,000, PDF output caps at 100 pages and 4 MiB, and oversized
  exports fail without a partial file. CSV text cells neutralize formula-like
  leading whitespace followed by `=`, `+`, `-`, or `@`. The dependency-free PDF
  writer emits only text with hex-encoded strings, a fixed standard font, no
  links/scripts/forms/HTML, and an output-size cap. CSV preserves Unicode; the
  PDF transliterates unsupported glyphs. No receipt contents or private object
  paths are placed in a report.
- **Audit:** `report_export_requested` records the authenticated actor and only
  report type/format. Members cannot read audit history; history is immutable
  to application roles. Failed rendering or audit logging returns no file.
- **Verification:** The report pgTAP suite passes 19 assertions, including
  Member self-only vs Executive cross-member dues scope, active/deactivated
  state, report-function invoker grants, denied formats, and minimal audit
  content. Existing dues privacy and club-finance suites pass 49 and 44
  assertions. HTTP checks reject GET, cross-origin POST, duplicate fields,
  caller-supplied query IDs, unauthenticated access, and oversized form data.
  CSV/PDF unit tests, receipt regression tests, lint, and production build are
  recorded under Step 12 in `docs/roadmap.md`. A successful authenticated
  browser download and hosted Supabase/Vercel behavior remain unverified; no
  hosted database was changed.
- **Low, non-blocking abuse finding:** There is no per-user/IP rate limiter for
  repeated exports. The 1,000-row, 100-page, 4 MiB file, and 128-byte request
  caps bound each attempt. No supported free-tier limiter or approved activity
  threshold was available, so repeated authorized exports may still consume
  database and egress resources.

## Out of scope until architecture adds a relevant path

There is no public API integration, payment processor, custom database password handling, or externally executable user content in the current implemented steps. Reassess these threats if such a capability is proposed. No absence of a current path is a claim that the completed product is safe.
