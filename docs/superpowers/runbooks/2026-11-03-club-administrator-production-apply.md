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

## 4. Order of operations

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

## 5. Verify after apply

    select private.format_role_label('admin');                     -- 'Club Admin'
    select indexdef from pg_indexes
     where indexname = 'member_role_assignments_one_current_admin_uidx';
    select count(*) from public.member_role_assignments
     where role = 'admin' and revoked_at is null;                  -- still 0 until staff appoint

Then, in the released panel: appoint a Club Admin, confirm the member sees the
**Club Admin Dues Exempt** badge with an own schedule of All (0), and confirm a
second appointment is refused while the first is live.

## 6. The dues ruling, verified on production

Operator ruling 2026-11-03: revocation **restores** the months and the club then
decides whether an officer writes them off. After revoking a test appointment, read
that member's schedule and expect every month back as `unpaid`, with no
`written_off` row created by the revoke. This is pinned locally by
`supabase/tests/database/club_administrator_appointment_test.sql` (73 assertions).

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
