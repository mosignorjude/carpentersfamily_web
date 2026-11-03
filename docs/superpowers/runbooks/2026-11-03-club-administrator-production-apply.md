# Production apply: Club Admin (Phase 2)

Status: operator-gated. Nothing in this document is run by the agent. Every number
below was measured read-only on 2026-11-03 against project `kgihmudjdvwrvteclodl`
(www) and the local stack; no production row was written.

## 1. What this push carries

Four migrations are pending on production (`supabase migration list --linked`):

| Version | File | Objects it writes |
| --- | --- | --- |
| `20261101010000` | fix_dues_report_and_role_notification_dedup | 6 functions plus a duplicate-notification cleanup `do $$` block |
| `20261101130000` | club_administrator_appointment | `member_role_assignments_one_current_admin_uidx`, `private/public.staff_grant_admin`, `private/public.staff_revoke_admin`, grants, `private.format_role_label` |
| `20261102120000` | club_administrator_dues_review | `public.record_dues_payment`, `private.approve_dues_payment_request`, `private.reject_dues_payment_request` (no grants; `create or replace` keeps the existing ACL) |
| `20261102150000` | club_event_shared_balance | the five-column `club_finance_summary` and its event cash helper — a different programme, see §3 |

`db push --include-all` cannot select one of these. Approving this runbook approves
both programmes as a single release.

## 2. Pre-flight: the singleton ceiling (§7.1 of the spec)

The partial unique index is the only statement in this push that can fail outright,
and it fails only if production holds two or more live `admin` rows.

    select count(*) from public.member_role_assignments
     where role = 'admin' and revoked_at is null;

Measured 2026-11-03: **0** live admins, 1 live president, 1 staff profile. The index
creates as written and there is no incumbent to reconcile. Re-run this immediately
before the push; if it has become 2 or more, stop and reconcile by hand.

## 3. Drift found in production's migration history

Production's `supabase_migrations.schema_migrations` holds two versions with **no
matching file in the repository**:

- `20261031234554` — `fix_dues_report_and_role_notification_dedup`
- `20261031235534` — `add_public_ticketed_events_rpc`

Both were applied on the Phase 1 rollout night, outside the repo. Their content is
inside the repo's `20261101010000` (same name, plus `get_public_ticketed_events`).
Compared by function definition, production vs the repo-applied local stack:

| Function | Verdict |
| --- | --- |
| `public.get_public_ticketed_events` | identical hash |
| `private.update_own_member_profile` | identical hash |
| `private.fanout_officer_notification` | hash differs; normalized diff shows **comments and formatting only** |

So there is no behavioural drift — but two consequences are real:

1. Re-applying `20261101010000` re-runs its `do $$ ... delete from public.notifications ...`
   block. That is a **write**, not a no-op statement, even though the dedupe keys make a
   second run delete nothing new. Count it in the restore drill.
2. The repo is not yet the sole source of truth for the production schema. Before the
   next `db reset`-class operation, dump those two versions into committed files or
   record that `20261101010000` supersedes them.

## 3a. Why the nightly backup had never produced a snapshot since 10-31

`scripts/backup-hosted-snapshot.mjs:296` aborts when production's
`supabase_migrations.schema_migrations` holds a version the repository cannot name —
the two rows above. Reproduced verbatim on 2026-11-03:

    Snapshot failed: Production has migration(s) missing locally:
    20261031234554, 20261031235534. Bring them into this branch before backing up.

GitHub Actions history matches that cause exactly: run 1 (`workflow_dispatch`,
2026-10-31T02:34Z) succeeded, and runs 2-4 (scheduled, 11-01, 11-02, 11-03) all died
at step 8 "Create the encrypted snapshot". The Phase 1 rollout applied those two
versions at 23:45/23:55 on 10-31, i.e. between the last success and the first failure.

Fixed by `09ba67a`: two deliberately-empty migrations at those exact versions. They
carry no DDL because their content is already in the repo (`20261101010000` has the
same name as the first, and defines `public.get_public_ticketed_events()` at line 428
for the second), and a comment-only file cannot duplicate DDL ahead of its
dependencies. `db push` skips versions already in history, so the markers are inert
in every direction.

## 3b. The pre-push snapshot

Taken 2026-11-03T16:32:41Z from this machine against `kgihmudjdvwrvteclodl`, label
`pre-club-admin-push`, source `feat/club-administrator-role @ 09ba67a`:

| Fact | Value |
| --- | --- |
| Auth users / member profiles / receipts | 16 / 16 / 11 (3,713,995 receipt bytes) |
| Applied migrations on production | 66 |
| Pending on this branch | `20261101010000`, `20261101130000`, `20261102120000`, `20261102150000` |
| Database archive | 530,609 B, sha256 `5cfcd348b7d96add6ee7b513067ce6bfa9bd698ca083a01c0b789fcaa95032b5` |
| Receipts archive | 3,370,348 B, sha256 `06fffa5c8044ae8669d3273df5fdefd546abff1cd63f7ef70b681a2e273d8455` |
| Copies | `Documents\CarpentersFamilyBackups`, `r2://carpenters-receipts/backups/production/` |
| Key | `CarpentersFamilyBackups-KEY\backup-key-20261031.txt` (decrypt verified) |

Manifest warning, unresolved by design: **"WAL changed during the dump"** — the five
dumps may not share one instant. The restore drill's count checks decide whether that
matters; if a count disagrees, retake the snapshot during a quieter window.

The drill's schema-parity gate had never actually run: nothing in the repository
produced `staging/schema.fingerprint.json`, so `assertFingerprint` logged "No hosted
schema fingerprint file found" and skipped. For this drill the hosted side is
generated read-only from production with `fingerprintSql` / `fingerprintDetailsSql`,
so the comparison is real: 15 fingerprint keys and the four grant detail sets.

## 4. Order of operations

Steps 1 and 2 are done; the measurements are in §3b and §4a. Steps 3-5 are the
operator-gated part of this runbook.

1. Encrypted snapshot of the hosted database.
2. Restore that snapshot into an isolated database and apply all four pending
   migrations against it; confirm no abort and re-run §2 and §6 there.
3. `supabase db push --linked --include-all` — review the pending list it prints first.
4. Verify §5 and §6 on production.
5. **Only then** release the app build.

App before migration fails safe but is visibly broken: `/admin/governance` calls
`staff_grant_admin` directly ([src/app/(staff)/admin/actions.ts:204](../../../src/app/(staff)/admin/actions.ts)),
so a missing function returns an error notice instead of appointing. The finance
programme has the same rule for its export route in
[2026-11-03-club-event-shared-balance-production.md](2026-11-03-club-event-shared-balance-production.md).

## 4a. Restore drill and migration rehearsal, measured 2026-11-03

Both ran against `CarpentersFamily-20261103T163241Z-pre-club-admin-push`, inside an
isolated project (`cfsc-restore-20261103164359-4d0016c7`), and the shared local stack
was restarted afterwards with its volumes intact.

**Drill — passed.** Counts after load and again after the test suite: 16 auth users,
16 profiles, 11 receipts, 3,713,995 receipt bytes, 66 migration rows, 36 public
tables all RLS-enabled and forced, 0 storage objects. Six integrity checks all zero.
Eleven receipt objects verified against the R2 manifest. The WAL warning cost
nothing: no count disagreed with the manifest.

**Schema parity is now a real gate, not a skip.** 15 of 15 fingerprint keys matched
the hosted database (columns, function signatures, policies, triggers, constraints,
indexes, and the table/column/routine grant sets). Before this run, no code in the
repository produced `staging/schema.fingerprint.json`, so `assertFingerprint` logged
"No hosted schema fingerprint file found" and returned — including for the 2026-10-31
drill whose write-up claims the fingerprint matched. The hosted side is now generated
read-only from production with the script's own `fingerprintSql`.

pgTAP in the drill stayed informational and red, as documented: 16 files, 102 tests.

**Rehearsal — the four migrations apply to real production data without aborting.**
`db push --local --include-all` on the restored copy listed exactly the four, then
applied them: history 66 → 70, `private.format_role_label('admin')` = `Club Admin`,
`member_role_assignments_one_current_admin_uidx` present, and `club_finance_summary()`
returning `dues_income, other_income, expenses, event_inflow, event_outflow, balance`.

The money prediction held exactly. As an active member before the push: balance
202,000 / dues 195,000 / other 0 / expenses 0. After: **294,100 / 195,000 / 0 / 0 /
368,000 / 275,900** — and 202,000 + 368,000 − 275,900 = 294,100, matching §7.1's
recompute. Notifications went 291 → 286, precisely the 5 duplicate officer rows the
`20261101010000` cleanup query counted beforehand, so that row loss is the
migration's intended work and is now a known quantity rather than a surprise.

The dues exemption behaves on real data: member `d30c8eba…` had 10 months (8 paid, 2
unpaid, ₦10,000 outstanding). While holding the role the view returned 8 rows, all
paid, nothing unpaid — the generated months drop and the recorded payment history
stays. Revoke-returns-everything was proven by the pgTAP suite's 73 assertions; it
was not re-measured here, because granting the role to a second member *displaces*
the first holder (revoke-then-grant is the RPC's design), which is also why the
singleton index never sees two live rows.

Two operational notes: `db push --local` honours `[db.migrations] enabled = false`,
which is exactly what the drill writes into its throwaway config, so a rehearsal must
flip it in the temp copy; and `--keep-project` exists so the isolated copy survives
teardown for that rehearsal. The local stack now has two "pending" migrations that
are the comment-only markers — pushing them locally applies nothing.

## 4b. Finding: `dues_month_status` leaks every member's ledger club-wide

Measured on production, read-only, as an active member with no live role:

    rows_seen_by_plain_member | members_exposed | foreign_rows | members_shown_unpaid
    90                        | 11              | 80           | 11

So a member reads other members' `covered_month`, `amount_ngn`, `status`, `due_date`
and `is_overdue`. The app never asks for that: the single reader
([src/app/(member)/dues/page.tsx:228](../../../src/app/(member)/dues/page.tsx))
filters `.eq("member_id", targetMemberId)`.

Cause is structural, not a policy someone forgot. The view's `prelaunch_months`
branch enumerates `member_profiles where status = 'active'` — which the club
directory policy deliberately allows any active member to read — and synthesises a
month per member. Row security on `dues_membership_periods` and
`dues_month_dispositions` cannot clamp that, because those rows do not come from
those tables; the generated set is the view's own output.

This is **pre-existing and unchanged by this push**: the same 90/11 exposure exists
on production today and in the restored copy after all four migrations. The guard
that should have caught it asserts own-count equals total-count at
[supabase/tests/database/dues_privacy_test.sql:127](../../../supabase/tests/database/dues_privacy_test.sql),
and that suite is one of the seven that abort before reaching its assertions (§8).

A fix is small and contained — a visibility predicate on the view's final select
(`member_id = auth.uid() or private.has_officer_history_access()`) plus repairing
`dues_privacy` so it actually runs — but it is a separate decision from this release.

## 5. Verify after apply

    select private.format_role_label('admin');                     -- 'Club Admin'
    select indexdef from pg_indexes
     where indexname = 'member_role_assignments_one_current_admin_uidx';
    select count(*) from public.member_role_assignments
     where role = 'admin' and revoked_at is null;                  -- still 0 until staff appoint

Then, in the released panel: appoint a Club Admin, confirm the member sees the
**Club Admin Dues Exempt** badge with an own schedule of All (0).

Appointment is **replace, not refuse**. `private.staff_grant_admin` is
revoke-then-grant (it revokes the live assignment and writes a `club_role_revoked`
audit row before inserting), so the singleton index never sees two live rows and a
second appointment moves the role rather than erroring. The panel says so:
`src/components/staff/staff-club-admin-card.tsx:69` labels the action
**Replace Club Admin** and `:76` names the incumbent in the confirmation. Verify that
transfer, not a refusal: appoint A, then appoint B, and expect B to hold it while A's
assignment is revoked with the reason recorded.

## 6. The dues ruling, verified on production

Operator ruling 2026-11-03: revocation **restores** the months and the club then
decides whether an officer writes them off. After revoking a test appointment, read
that member's schedule and expect every month back as `unpaid`, with no
`written_off` row created by the revoke. This is pinned locally by
`supabase/tests/database/club_administrator_appointment_test.sql` (73 assertions).

## 6a. Production apply record — 2026-11-03

`supabase db push --linked --include-all` against `kgihmudjdvwrvteclodl` applied
exactly the four rehearsed versions, in order, with no abort:
`20261101010000`, `20261101130000`, `20261102120000`, `20261102150000`. History
66 → 70. Nothing was applied twice and the two out-of-band markers were correctly
skipped (already in history).

Every §5 check passed on production, measured after apply:

| Check | Result |
| --- | --- |
| `private.format_role_label('admin')` | `Club Admin` |
| `member_role_assignments_one_current_admin_uidx` | 1 index present |
| live `admin` assignments | 0 (no appointment made) |
| new RPCs | `public.staff_grant_admin`, `staff_revoke_admin`, `record_dues_payment`, `approve_/reject_dues_payment_request` + the `private` cores, all present |
| `public.club_finance_summary()` | `dues_income, other_income, expenses, event_inflow, event_outflow, balance` |
| `events_sync_ledger_status` trigger | present on `public.events`, calls `private.sync_event_status_to_ledger()` |
| RLS on public tables | 36 tables, 36 enabled, 36 forced — unchanged from the snapshot |
| notifications | 291 → **286**; duplicate-officer rows remaining: **0** |
| money, read as active member `02b5bf3d…` | dues 195,000 / other 0 / expenses 0 / event inflow 368,000 / event outflow 275,900 / **balance 294,100** |

The balance equals the rehearsal's prediction to the naira (202,000 + 368,000 −
275,900) and the notification drop equals the 5 rows the cleanup query counted
beforehand.

**Old app against new schema is safe, checked not assumed.** The signature change
dropped the four-column `club_finance_summary()` and replaced it with six columns, so
the deployed `main` build was audited: both of its readers name keys, never positions
— `src/app/(member)/finances/page.tsx:283` takes `data[0]` then reads properties, and
`src/lib/home-dashboard.mjs:413-416` reads `dues_income`, `other_income`, `expenses`,
`balance`. All four survive in the new return. The `event_inflow`/`event_outflow`
readers exist only on this branch.

Deferred to after the app deploy, because both need a real appointment: the panel
proof in §5 (badge, own schedule All (0), and the replace-transfer behaviour) and the
§6 revoke-restores-months read on production.

**Nothing from the event-balance programme is left to deploy.** That task ships
exactly one migration — `20261102150000_club_event_shared_balance.sql`, built up
across `cbdf0bf`, `751f779` and `15f822d` — and it was the fourth of the four just
applied. After the push, `migration list --linked` reports **zero local-only and
zero remote-only** rows: production history and main's 70 files name the same set.
The migration adds no table and no column, so the known column-level-grant hazard
does not apply to it; the only breaking change was the `club_finance_summary()`
signature, and PostgREST reloads on DDL by itself because `pgrst_ddl_watch`
(`ddl_command_end`) and `pgrst_drop_watch` (`sql_drop`) are installed on production.

Four versions exist in abandoned branch history but in neither main nor production —
`20261027130000`, `20261027133759`, `20261027145318`, `20261027170000`. They are
reverted superseded work, correct to leave alone, but merging the branch that still
names them would hand `db push` four migrations production has never seen.

## 7. Rollback

Migrations are up-only; a rollback is hand-written. For the two Club Admin migrations
that is: drop `member_role_assignments_one_current_admin_uidx`, drop the four
`staff_grant_admin`/`staff_revoke_admin` functions with their grants, and restore
`private.format_role_label` plus the three dues functions from their prior definitions
(`20261029121000_president_role_and_alias.sql`, `20261027170450_opening_balance_classification.sql`).
Rolling back the app alone is not enough: the RPCs stay callable by an authenticated
staff subject, though every one of them re-checks `private.is_staff_administrator()`.

## 8. Evidence state at the SHA this was written against (`f830436`)

- App gates: `npm test` 742 tests / 96 suites / 741 pass / 0 fail / 1 skipped;
  `npm run lint` 251 files, no findings; `npm run build` compiled, 28 static pages.
- **CI does not cover either of those first two.** `security-build.yml` runs
  `npm ci`, `npm audit`, `npm run lint`, `npm run test:security-regression`,
  `npm run build`, and one headers test. It never runs the full `npm test` and never
  runs pgTAP. A green pipeline is not evidence the app suite passed.
- pgTAP, run per file against the local stack: **14 of 21 suites pass**. The batch
  `supabase test db --local` form is unusable here — it aborts every file against an
  empty search path — so each suite was invoked individually.
- The 7 failures are pre-existing suite drift, none introduced by this branch:

  | Suite | Cause |
  | --- | --- |
  | `club_finances` | calls `record_club_financial_transaction` with a signature no migration defines |
  | `dues_privacy` | calls `record_dues_payment(uuid,bigint,date,date[])`; the function takes 9 arguments |
  | `event_finance_ticketing_ledger` | asserts RLS on `public.event_financial_receipts`, dropped by `20261025120000` in favour of `finance_receipts` |
  | `report_exports` | its fixture self-changes a club role, which `20261012171000` forbids |
  | `notification_outbox_reminders` | fixture violates `dues_membership_periods_ends_before_month_check` |
  | `events_roles_budgets_lifecycle` | passes `{name, amount_ngn}` allocations; `20261013040328` requires `{category, percentage}` |
  | `in_app_notifications` | `have: 1 / want: 0` on three counts — leftover rows from the 2026-11-02 browser verification |

  The branch's own suites pass: `club_administrator_appointment` 73, `club_event_shared_balance` 38,
  `membership_roles_rls` 54, `president_staff_admin` 43.
- One honest gap: the branch edited `event_finance_ticketing_ledger_test.sql` and
  `dues_privacy_test.sql`, but both files abort before reaching those changed
  assertions, so **the new expectations in them have never executed**.
- A clean baseline would need `supabase db reset --local`, which destroys the shared
  local stack including its auth users. That is the operator's call, not the agent's.

## 9. Standing cautions

- Never a bare `supabase db push` — `--linked` or `--local`, always.
- Another session is committing to `feat/club-administrator-role` while this runs.
  Re-measure every gate at the exact SHA being deployed.
- Local-only disclosure, unchanged: `verify-staff@local.test` and
  `verify-officer@local.test` still carry the same known local password. No
  production credential is affected.
