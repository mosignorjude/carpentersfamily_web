# Club Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff appoint and revoke a single "Club Admin" — an active member holding the existing `admin` club role, who therefore has full money-write authority and is exempt from dues — without touching any existing authorisation gate.

**Architecture:** One migration adds a partial unique index that caps live `admin` assignments at one, and a staff-gated `staff_grant_admin` / `staff_revoke_admin` SECURITY DEFINER RPC pair modelled on the existing president pair. Authority itself is already implemented: every money, dues, event and attendance gate calls `private.has_club_role('admin')`, which requires `private.is_active_club_member()`, so granting the role to an active member turns those gates on with zero edits. The staff panel gains a load function, a card, and two server actions; the club admin does their work from ordinary member screens, never from `/admin`.

**Tech Stack:** Supabase Postgres (plpgsql, pgTAP), Next.js 16 App Router server components + `"use server"` actions, Node built-in test runner asserting on source text, Biome.

**Spec:** [docs/superpowers/specs/2026-11-01-club-administrator-role-design.md](../specs/2026-11-01-club-administrator-role-design.md) — this plan argues from that document; read both.

## Global Constraints

- **Never run `supabase db push` without `--local`.** Plain `db push` applies migrations to the production database. Local stack commands are `npx supabase db push --local --include-all`, `npx supabase db reset --local`, `npx supabase test db --local`.
- Production migrations are applied only through the operator-approved path (encrypted snapshot → isolated restore drill → confirmed push). No task in this plan applies anything to production.
- No task converts an account, edits `auth.users` in the application, or changes `member_profiles.status` for an existing user.
- Migrations are immutable once written to a branch that has been pushed: later tasks **append** to the same new migration file rather than editing earlier hunks.
- All definer functions: `set search_path = ''`, every object schema-qualified, fronted by a `public.*` `language sql security invoker` wrapper, then `revoke all on function … from public, anon, service_role;` and `grant execute … to authenticated;`.
- Audit `action` values reuse `club_role_granted` and `club_role_revoked`. No new action names.
- `member_profiles.status` must be `'active'` for any grant target; staff profiles can never hold a club role (`private.reject_staff_role_target`).
- pgTAP suites use `select no_plan();` except `membership_roles_rls_test.sql`, which uses `select plan(N);` and must be kept arithmetically exact.
- **Reading `supabase test db` output: never grep for `^not ok`.** The CLI runs `pg_prove` inside a container, so it prints per-file summaries (`(Wstat: 0 Tests: 43 Failed: 5)`), `# Failed test N: "label"` lines and a final `Result: PASS|FAIL` — a raw `not ok` line is never emitted, and `grep -c "^not ok"` returns `0` on a wholly broken run. Count failures with `grep -cE "^# Failed test"` and list the suites with `grep -E "Failed: [1-9]"`; treat `Result: FAIL` as the pass/fail signal for a single-suite run.
- **Pre-change pgTAP baseline, recorded 2026-11-02 on the local stack at migration `20261101010000` (65 applied, no reset):** `Files=19, Tests=503`, **34 failing assertions across 8 suites** — `events_roles_budgets_lifecycle` (17), `in_app_notifications` (5), `president_staff_admin` (5, tests 30-34), `meetings_minutes_attendance` (2), `report_exports` (2), `auth_member_lifecycle` (1, test 8), `event_finance_ticketing_ledger` (1, test 1), `staff_resend_email_confirmation` (1, test 19). Five suites abort mid-file on missing objects (`record_club_financial_transaction(text,bigint,date,text,uuid,text,text,uuid)`, `record_dues_payment(uuid,bigint,date,date[])`, `event_financial_receipts`, a `dues_membership_periods` check violation, and an own-role guard trip), so their reported assertion counts are lower than their file contents. Full transcript: `~/supabase-local-backups/2026-11-02-pre-club-admin-reset/pgtap-baseline.txt`. **A "zero failures" expectation is wrong for this stack — the gate is always a diff against these numbers.**
- App tests are Node built-in runner, flat `tests/*.test.mjs`, asserting on `fs.readFileSync` source text.
- Formatting: Biome, double quotes, 2-space indent, trailing commas. `npm run lint` is `biome check next.config.ts src` with **no `--write`**, so formatting must be correct as typed.
- Local UI verification uses a production build at `http://127.0.0.1:3001` (`npm run build` then `npx next start -p 3001`), because the long-running `next dev` on :3000 serves unhydrated HTML. Stop any leftover `next start -p 3001` before building, and stop the temporary server afterwards.
- Relationship to [docs/superpowers/plans/2026-11-01-staff-phase2-money-visibility.md](2026-11-01-staff-phase2-money-visibility.md): independent and parallel. That plan adds read-only staff money views in new modules; this plan adds a migration, `loadClubAdmin`, one card, two actions, and one notice code. The only shared files are `src/lib/system-notices.ts` and `src/lib/staff-notices.ts`; if both plans land, resolve by keeping both sets of entries and re-run `npm run lint && npm test && npm run build`.

**File structure**

| File | Role | Action |
| --- | --- | --- |
| `supabase/migrations/20261101130000_club_administrator_appointment.sql` | singleton index, grant RPC, revoke RPC, label change, grants | Create (built by Tasks 1–3, 6) |
| `supabase/tests/database/club_administrator_appointment_test.sql` | every database assertion in this plan | Create (built by Tasks 1–6) |
| `supabase/tests/database/membership_roles_rls_test.sql` | asserts a second live admin is legal — contradicts this design | Modify (Task 1) |
| `src/lib/staff-panel.server.ts` | staff panel officer loader | Modify (Task 7) |
| `src/app/(staff)/admin/actions.ts` | staff server actions | Modify (Task 8) |
| `src/lib/rpc-error-notice.ts` | DB error → notice code | Modify (Task 8) |
| `src/lib/staff-notices.ts`, `src/lib/system-notices.ts` | notice allowlist + copy | Modify (Task 8) |
| `src/components/staff/staff-club-admin-card.tsx` | appointment card | Create (Task 9) |
| `src/app/(staff)/admin/governance/page.tsx` | card wiring + notices | Modify (Task 9) |
| `tests/staff-governance-club-admin.test.mjs` | app source-text tests | Create (Task 7, extended by 8 and 9) |

Deliberately **not** touched: `private.has_club_role`, `private.is_active_club_member`, any money/dues/event policy or RPC, `grant_club_role` / `revoke_club_role` / `set_club_role`, `private.guard_last_active_primary_admin`, and every member screen. The 49 app-side `"admin"` role literals already admit the holder.

---

### Task 1: Singleton ceiling on live club-admin assignments

**Files:**
- Create: `supabase/migrations/20261101130000_club_administrator_appointment.sql`
- Create: `supabase/tests/database/club_administrator_appointment_test.sql`
- Modify: `supabase/tests/database/membership_roles_rls_test.sql`

**Interfaces:**
- Consumes: existing table `public.member_role_assignments (id uuid pk, member_id uuid, role text, assigned_by uuid, grant_reason text, revoked_at timestamptz, revoked_by uuid, revoke_reason text)`.
- Produces: index `public.member_role_assignments_one_current_admin_uidx`; the pgTAP fixture block (users `…0501`–`…0509`) that Tasks 2–6 append to.

- [ ] **Step 1: Pre-flight the local data before creating the index**

The index fails to build over live duplicates, so check first.

Run: `npx supabase db query --local "select count(*) as live_admins from public.member_role_assignments where role = 'admin' and revoked_at is null;"`
Expected: `0` on a freshly reset stack. Any result of 1 is also fine (that member simply becomes the incumbent). A result of 2 or more means the local stack is dirty — run `npx supabase db reset --local` and re-check before continuing.

- [ ] **Step 2: Create the migration with the index**

Write `supabase/migrations/20261101130000_club_administrator_appointment.sql`:

```sql
-- Club Admin: a staff-appointed, dues-exempt money authority.
-- This migration adds one cardinality index, one grant/revoke RPC pair and a
-- display label. It changes no existing authorisation gate: every money, dues,
-- event and attendance check already calls private.has_club_role('admin'), and
-- that predicate already requires member_profiles.status = 'active', so an
-- active member holding a live admin assignment passes those gates unchanged.

-- At most one live Club Admin assignment may exist at a time. The index counts
-- rows, not member status: an unreoked assignment belonging to a deactivated
-- member would occupy the slot, which is why the existing status trigger
-- (member_profiles_preserve_last_primary_admin) forces revoke-before-deactivate.
create unique index member_role_assignments_one_current_admin_uidx
  on public.member_role_assignments (role)
  where role = 'admin' and revoked_at is null;

comment on index public.member_role_assignments_one_current_admin_uidx is
  'At most one live Club Admin assignment exists; staff appoint and revoke it.';
```

- [ ] **Step 3: Create the new pgTAP suite with its fixture block and cardinality assertions**

Write `supabase/tests/database/club_administrator_appointment_test.sql`:

```sql
begin;

select no_plan();

-- ===========================================================================
-- Fixtures. Each suite reserves its own auth.users block; this one uses
-- …0501-…0509. member_profiles rows are created by the handle_new_user
-- trigger, so they are updated here rather than inserted.
-- ===========================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000501', 'authenticated', 'authenticated', 'ca-staff@example.test', '', '{}'::jsonb, '{"full_name":"Records Staff","username":"ca_staff"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000502', 'authenticated', 'authenticated', 'ca-staff-off@example.test', '', '{}'::jsonb, '{"full_name":"Disabled Staff","username":"ca_staff_off"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000503', 'authenticated', 'authenticated', 'ca-a@example.test', '', '{}'::jsonb, '{"full_name":"First Administrator","username":"ca_admin_one"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000504', 'authenticated', 'authenticated', 'ca-b@example.test', '', '{}'::jsonb, '{"full_name":"Second Administrator","username":"ca_admin_two"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000505', 'authenticated', 'authenticated', 'ca-president@example.test', '', '{}'::jsonb, '{"full_name":"Sitting President","username":"ca_pres"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000506', 'authenticated', 'authenticated', 'ca-exec@example.test', '', '{}'::jsonb, '{"full_name":"Fixture Executive","username":"ca_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000507', 'authenticated', 'authenticated', 'ca-member@example.test', '', '{}'::jsonb, '{"full_name":"Plain Member","username":"ca_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000508', 'authenticated', 'authenticated', 'ca-pending@example.test', '', '{}'::jsonb, '{"full_name":"Pending Applicant","username":"ca_pending"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000509', 'authenticated', 'authenticated', 'ca-exit@example.test', '', '{}'::jsonb, '{"full_name":"Deactivation Target","username":"ca_exit"}'::jsonb, now());

update public.member_profiles
set status = case
      when id in (
        '00000000-0000-0000-0000-000000000501',
        '00000000-0000-0000-0000-000000000502'
      ) then 'staff'
      when id = '00000000-0000-0000-0000-000000000508' then 'pending'
      else 'active'
    end,
    profile_completed_at = now(),
    staff_disabled_at = case
      when id = '00000000-0000-0000-0000-000000000502' then now()
      else null
    end
where id between '00000000-0000-0000-0000-000000000501'::uuid
             and '00000000-0000-0000-0000-000000000509'::uuid;

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000505', 'president', '00000000-0000-0000-0000-000000000501', 'Fixture president'),
  ('00000000-0000-0000-0000-000000000506', 'executive', '00000000-0000-0000-0000-000000000501', 'Fixture executive');

-- ===========================================================================
-- Structural checks.
-- ===========================================================================

select has_index(
  'public', 'member_role_assignments',
  'member_role_assignments_one_current_admin_uidx',
  'the club administrator singleton index exists'
);

select ok(
  (select pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%role = ''admin''::text%'
         and pg_catalog.pg_get_indexdef(i.indexrelid) ilike '%revoked_at is null%'
   from pg_catalog.pg_index as i
   where i.indexrelid = 'public.member_role_assignments_one_current_admin_uidx'::regclass),
  'the club administrator singleton is a partial index over live admin rows'
);

select ok(
  (select pg_catalog.pg_get_constraintdef(cc.oid) like '%admin%'
   from pg_catalog.pg_constraint as cc
   where cc.conname = 'member_role_assignments_role_check'
     and cc.conrelid = 'public.member_role_assignments'::regclass),
  'the admin role value remains permitted by the role check constraint'
);

-- ===========================================================================
-- Cardinality, proved with direct writes (no RPC exists yet in this task).
-- ===========================================================================

select lives_ok(
  $$insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values ('00000000-0000-0000-0000-000000000503', 'admin',
            '00000000-0000-0000-0000-000000000501', 'First club administrator')$$,
  'the first live club administrator assignment is accepted'
);

select throws_ok(
  $$insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values ('00000000-0000-0000-0000-000000000504', 'admin',
            '00000000-0000-0000-0000-000000000501', 'Second club administrator')$$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_current_admin_uidx"',
  'a second live club administrator assignment is rejected'
);

select is(
  (select count(*) from public.member_role_assignments
   where role = 'admin' and revoked_at is null),
  1::bigint,
  'exactly one live club administrator assignment remains'
);

select lives_ok(
  $$update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = '00000000-0000-0000-0000-000000000501',
        revoke_reason = 'Handed back to staff for later assertions'
    where role = 'admin' and revoked_at is null$$,
  'the incumbent club administrator can be revoked'
);

select * from finish();
rollback;
```

**Fixture state this suite depends on:** `…0501` staff, `…0502` staff and disabled, `…0503`/`…0504`/`…0509` active members with no role, `…0505` president, `…0506` executive, `…0507` active member, `…0508` pending. Tasks 2–6 append to this file in order, and each later block sees the state the earlier blocks left, so append **above** the `select * from finish();` line and do not reorder blocks.

- [ ] **Step 4: Re-read the applied objects before trusting them**

Run: `npx supabase db query --local "select pg_catalog.pg_get_indexdef('public.member_role_assignments_one_current_admin_uidx'::regclass) as idx;"`
Expected: an index definition ending in a `WHERE ((role = 'admin'::text) AND (revoked_at IS NULL))` predicate, on `(role)`. If the predicate is missing, the index is a plain unique index on `role` and would block `executive` from ever having two holders — stop and fix the migration.

- [ ] **Step 5: Apply the migration locally and run the new suite**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: `# Done` then `not ok` count of **zero**. If `has_index` fails, the migration did not apply — re-run the push and check for `ERROR: could not create unique index` (that is the duplicate-data case from Step 1).

- [ ] **Step 6: Fix the existing suite that asserts the opposite rule**

`membership_roles_rls_test.sql` currently proves that a *second* active primary Admin may be recorded. Under the singleton index that is no longer legal, and the design says it must not be. Find this exact text in that file and replace the whole two-statement block with the three statements below. Match on the labels, not on line numbers:

```sql
select lives_ok(
  $$
    insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values (
      '00000000-0000-0000-0000-000000000004', 'admin',
      '00000000-0000-0000-0000-000000000001', 'Successor administrator'
    );
  $$,
  'a second active primary Admin can be recorded'
);
select lives_ok(
  $$update public.member_profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000001'$$,
  'non-final former Admin may be deactivated'
);
```

Replacement:

```sql
select throws_ok(
  $$
    insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values (
      '00000000-0000-0000-0000-000000000004', 'admin',
      '00000000-0000-0000-0000-000000000001', 'Successor administrator'
    );
  $$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_current_admin_uidx"',
  'only one current club administrator may exist'
);
select lives_ok(
  $$
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = '00000000-0000-0000-0000-000000000001',
        revoke_reason = 'The successor must wait for the incumbent to be revoked'
    where role = 'admin'
      and revoked_at is null
      and member_id = '00000000-0000-0000-0000-000000000001';
  $$,
  'the incumbent club administrator can be revoked'
);
select lives_ok(
  $$update public.member_profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000001'$$,
  'a former club administrator may be deactivated once revoked'
);
```

Why this is the right rewrite: at this point in the file the only live admin row belongs to `…0001` (the preceding block revoked every other live admin row, and the block just above proves `…0001` cannot be deactivated while it holds the role), so the insert can only violate the new singleton, and `…0004` holds no live admin or president row so the per-member identity index is not in play. Revoking `…0001` first is what lets its deactivation through — the same ordering the new staff UI has to teach.

The file opens with `select plan(53);` and two assertions became three, so change it to `select plan(54);`.

- [ ] **Step 7: Confirm the untouched negative assertion still names the right index**

`membership_roles_rls_test.sql:320-328` inserts an `admin` row for a member who is president while another live admin exists, and expects `member_role_assignments_one_admin_identity_per_member_uidx`. Two indexes are now violated by that statement. PostgreSQL reports the one with the lower OID, i.e. the one created first — `20261029121000` predates `20261101130000` — so the per-member identity error must still win.

Run: `npx supabase test db --local supabase/tests/database/membership_roles_rls_test.sql`
Expected: zero `not ok` lines. If that single assertion now names `member_role_assignments_one_current_admin_uidx` instead, **do not** silently edit the expected string: the OID ordering is load-bearing for the migration-file assumption above. Stop and report it as a finding, then re-verify by moving the per-member identity probe to a point in the file where no other live admin row exists.

- [ ] **Step 8: Confirm no other suite creates two live admins**

Run: `grep -c "'admin'" supabase/tests/database/*_test.sql | grep -v ":0$" | sort -t: -k2 -n`
Expected: every file reports 1 except `membership_roles_rls_test.sql` and `president_staff_admin_test.sql`. The latter's extra mentions are a `has_club_role('admin')` probe and a rejected `set_club_role(…, 'admin', …)` call, not assignments. `pre_launch_financial_onboarding_test.sql`, `payment_methods_test.sql`, `club_finances_test.sql`, `dues_privacy_test.sql`, `auth_member_lifecycle_test.sql`, `events_roles_budgets_lifecycle_test.sql`, `event_finance_ticketing_ledger_test.sql`, `meetings_minutes_attendance_test.sql`, `announcements_polls_test.sql`, `in_app_notifications_test.sql`, `notification_outbox_reminders_test.sql` and `member_email_confirmation_state_test.sql` each hold exactly one live admin and must be unaffected.

- [ ] **Step 9: Run the full local suite and compare to the baseline**

Run: `npx supabase test db --local 2>&1 | tee "$HOME/supabase-local-backups/pgtap-task1.txt" | grep -E "Failed: [1-9]|^# Failed test" | head -50`
Expected: no `# Failed test` line labelled from `club_administrator_appointment_test.sql`, and `membership_roles_rls_test.sql` gone from the `Failed: [1-9]` list (it passed at baseline, so any appearance is caused by this task). The rest must be exactly the eight baseline suites and 34 assertions from Global Constraints — **do not expect a clean run on this stack**. A ninth failing suite, or a baseline suite whose count rose, is a regression from this task. Note that `db reset --local` is deliberately not run here: it would destroy the `verify-*@local.test` auth users Task 11 needs, and the pre-change baseline was taken on this same unreset stack.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261101130000_club_administrator_appointment.sql supabase/tests/database/club_administrator_appointment_test.sql supabase/tests/database/membership_roles_rls_test.sql
git commit -m "feat(staff): cap live club administrator assignments at one"
```

---

### Task 2: `staff_grant_admin` — the appointment path

**Files:**
- Modify: `supabase/migrations/20261101130000_club_administrator_appointment.sql` (append)
- Modify: `supabase/tests/database/club_administrator_appointment_test.sql` (insert above `select * from finish();`)

**Interfaces:**
- Consumes: `private.is_staff_administrator()`, `private.administration_guard (singleton_id boolean)`, `public.member_profiles (id, status)`, `public.member_role_assignments`, `public.audit_log`, index from Task 1.
- Produces: `private.staff_grant_admin(p_member_id uuid, p_reason text) returns void` and `public.staff_grant_admin(uuid, text)`; SQLSTATEs `42501` (not staff), `22023` (bad reason), `23514` (target not active / does not exist / target is president).

- [ ] **Step 1: Write the failing grant assertions**

Insert into `club_administrator_appointment_test.sql` immediately above `select * from finish();`:

```sql
-- ===========================================================================
-- staff_grant_admin: the happy path and the handover.
-- State entering this block: zero live admin assignments (Task 1 revoked it).
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select lives_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Appointed records officer')$$,
  'a staff administrator can grant the club administrator role'
);
reset role;

select is(
  (select count(*) from public.member_role_assignments
   where role = 'admin' and revoked_at is null),
  1::bigint,
  'exactly one live club administrator assignment exists after a grant'
);

select is(
  (select member_id from public.member_role_assignments
   where role = 'admin' and revoked_at is null),
  '00000000-0000-0000-0000-000000000503'::uuid,
  'the granted member holds the live assignment'
);

select is(
  (select action from public.audit_log
   where entity_type = 'member_role_assignment'
     and target_member_id = '00000000-0000-0000-0000-000000000503'
   order by occurred_at desc limit 1),
  'club_role_granted'::text,
  'the grant is audited'
);

select is(
  (select actor_id from public.audit_log
   where action = 'club_role_granted'
     and target_member_id = '00000000-0000-0000-0000-000000000503'
   order by occurred_at desc limit 1),
  '00000000-0000-0000-0000-000000000501'::uuid,
  'the staff account is recorded as the actor, not the appointee'
);

-- Handover: a second grant moves the slot rather than failing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select lives_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000504', 'Handed the books to a second officer')$$,
  'a second grant replaces the incumbent instead of raising'
);
reset role;

select is(
  (select member_id from public.member_role_assignments
   where role = 'admin' and revoked_at is null),
  '00000000-0000-0000-0000-000000000504'::uuid,
  'the successor holds the single live assignment'
);

select is(
  (select revoked_by from public.member_role_assignments
   where role = 'admin'
     and member_id = '00000000-0000-0000-0000-000000000503'
     and revoked_at is not null),
  '00000000-0000-0000-0000-000000000501'::uuid,
  'the revoked incumbent assignment records the staff actor'
);

select is(
  (select count(*) from public.audit_log
   where action in ('club_role_granted', 'club_role_revoked')
     and reason = 'Handed the books to a second officer'),
  2::bigint,
  'a handover writes one revoke and one grant audit row'
);

-- The successor must resolve as club administrator through the shared predicate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
select is(
  (select private.has_club_role('admin')),
  true,
  'the successor resolves as club administrator through the shared predicate'
);
reset role;
```

`private.has_club_role()` reads `auth.uid()`, so it can only be answered inside the holder's own session — evaluating it from the suite's default superuser session returns null and proves nothing.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: FAIL — `function public.staff_grant_admin(uuid, text) does not exist` surfaces as `not ok` on the grant assertions.

- [ ] **Step 3: Append the definer function to the migration**

Append to `supabase/migrations/20261101130000_club_administrator_appointment.sql`:

```sql
-- Staff grant the Club Admin role. Members have no path that accepts
-- p_role = 'admin', so this is the only way the role can be created.
create or replace function private.staff_grant_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_existing record;
  v_assignment_id uuid;
begin
  if v_actor_id is null or not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  if exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status <> 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'The club administrator must be an active member.';
  end if;

  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'That account does not exist.';
  end if;

  if exists (
    select 1 from public.member_role_assignments
    where member_id = p_member_id and role = 'president' and revoked_at is null
  ) then
    raise exception using errcode = '23514',
      message = 'Revoke the president role before granting Club Admin.';
  end if;

  for v_existing in
    select mra.id, mra.member_id
    from public.member_role_assignments as mra
    where mra.role = 'admin' and mra.revoked_at is null
    for update
  loop
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = v_actor_id,
        revoke_reason = v_reason
    where id = v_existing.id;

    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'club_role_revoked', 'member_role_assignment',
      v_existing.id, v_existing.member_id,
      pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
      pg_catalog.jsonb_build_object('role', 'admin', 'active', false),
      v_reason
    );
  end loop;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    p_member_id, 'admin', v_actor_id, v_reason
  ) returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_granted', 'member_role_assignment',
    v_assignment_id, p_member_id, null,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    v_reason
  );
end;
$function$;

create or replace function public.staff_grant_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_grant_admin(p_member_id, p_reason);
$function$;

revoke all on function private.staff_grant_admin(uuid, text) from public, anon, service_role;
revoke all on function public.staff_grant_admin(uuid, text) from public, anon, service_role;
grant execute on function private.staff_grant_admin(uuid, text) to authenticated;
grant execute on function public.staff_grant_admin(uuid, text) to authenticated;
```

Why the two profile checks are in that order: a known-but-not-active account gets the specific message, and only an unknown id reaches "does not exist", so probing cannot enumerate accounts. The revoke loop normally handles at most one row because of the Task 1 index; it stays a loop so a hand-edited duplicate cannot wedge the appointment. No self-grant guard is needed — a staff profile is never `'active'`, so staff cannot be their own grantee.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: PASS — zero `not ok` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261101130000_club_administrator_appointment.sql supabase/tests/database/club_administrator_appointment_test.sql
git commit -m "feat(staff): add staff_grant_admin appointment RPC"
```

---

### Task 3: `staff_revoke_admin` — the withdrawal path

**Files:**
- Modify: `supabase/migrations/20261101130000_club_administrator_appointment.sql` (append)
- Modify: `supabase/tests/database/club_administrator_appointment_test.sql` (insert above `select * from finish();`)

**Interfaces:**
- Consumes: everything Task 2 consumes; `member_role_assignments` row for the incumbent (holder is `…0504` at this point in the suite).
- Produces: `private.staff_revoke_admin(p_member_id uuid, p_reason text) returns void` and `public.staff_revoke_admin(uuid, text)`; SQLSTATE `P0002` when no live assignment exists for that member. **Deliberately no "one admin must remain" floor check** — ending with zero club admins is legal because every money gate also accepts `has_club_role('backup_admin')`, which the president alias resolves.

- [ ] **Step 1: Write the failing revoke assertions**

Insert above `select * from finish();`:

```sql
-- ===========================================================================
-- staff_revoke_admin. State entering: …0504 holds the live assignment.
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
select throws_ok(
  $$select public.staff_revoke_admin('00000000-0000-0000-0000-000000000504', 'Attempted self-revocation')$$,
  '42501',
  'An active staff administrator account is required.',
  'a club administrator cannot revoke themselves'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select lives_ok(
  $$select public.staff_revoke_admin('00000000-0000-0000-0000-000000000504', 'Officer stood down')$$,
  'staff can revoke the club administrator role'
);
reset role;

select is(
  (select count(*) from public.member_role_assignments
   where role = 'admin' and revoked_at is null),
  0::bigint,
  'revoking leaves the club with zero live club administrators'
);

select is(
  (select after_data ->> 'active' from public.audit_log
   where action = 'club_role_revoked'
     and target_member_id = '00000000-0000-0000-0000-000000000504'
   order by occurred_at desc limit 1),
  'false'::text,
  'the revoke is audited'
);

-- Zero administrators must stay revocable: no floor guard, no lockout.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select throws_ok(
  $$select public.staff_revoke_admin('00000000-0000-0000-0000-000000000504', 'Already revoked')$$,
  'P0002',
  'No active club administrator assignment exists.',
  'revoking with no incumbent reports a missing assignment, not a floor guard'
);
reset role;

-- Zero administrators must still be a survivable state: the president alone
-- satisfies every paired admin/backup_admin money gate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000505', true);
select is(
  (select private.has_club_role('backup_admin')),
  true,
  'the president alone still satisfies every paired admin/backup_admin money gate'
);
reset role;
```

- [ ] **Step 2: Run the suite to verify it fails**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: FAIL on the revoke assertions with `function public.staff_revoke_admin(uuid, text) does not exist`.

- [ ] **Step 3: Append the revoke function and its wrapper**

Append to the migration:

```sql
-- Staff withdraw the Club Admin role. There is no "at least one admin must
-- remain" floor guard here, unlike the legacy officer paths: staff are the only
-- granters and must always be able to pull authority back, and a club with zero
-- club admins is still governed by its president through backup_admin.
create or replace function private.staff_revoke_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_assignment_id uuid;
begin
  if v_actor_id is null or not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  update public.member_role_assignments as mra
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id,
      revoke_reason = v_reason
  where mra.member_id = p_member_id
    and mra.role = 'admin'
    and mra.revoked_at is null
  returning mra.id into v_assignment_id;

  if v_assignment_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No active club administrator assignment exists.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_revoked', 'member_role_assignment',
    v_assignment_id, p_member_id,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    pg_catalog.jsonb_build_object('role', 'admin', 'active', false),
    v_reason
  );
end;
$function$;

create or replace function public.staff_revoke_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_revoke_admin(p_member_id, p_reason);
$function$;

revoke all on function private.staff_revoke_admin(uuid, text) from public, anon, service_role;
revoke all on function public.staff_revoke_admin(uuid, text) from public, anon, service_role;
grant execute on function private.staff_revoke_admin(uuid, text) to authenticated;
grant execute on function public.staff_revoke_admin(uuid, text) to authenticated;
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: PASS — zero `not ok` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261101130000_club_administrator_appointment.sql supabase/tests/database/club_administrator_appointment_test.sql
git commit -m "feat(staff): add staff_revoke_admin withdrawal RPC"
```

---

### Task 4: Grant guardrails — who may mint the role, and to whom

**Files:**
- Modify: `supabase/tests/database/club_administrator_appointment_test.sql` (insert above `select * from finish();`)

**Interfaces:**
- Consumes: `public.staff_grant_admin(uuid, text)` (Task 2), fixture members `…0502` disabled staff, `…0505` president, `…0506` executive, `…0507` plain member, `…0508` pending.
- Produces: no product code. This task pins the security contract the spec's failure-mode table promises.

- [ ] **Step 1: Write the guardrail assertions**

Insert above `select * from finish();`:

```sql
-- ===========================================================================
-- Grant guardrails. State entering: zero live admin assignments.
-- ===========================================================================

-- Only staff may grant. Everyone else sees the staff gate, whatever their club role.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000505', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'President tries')$$,
  '42501',
  'An active staff administrator account is required.',
  'the president cannot mint a club administrator'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000506', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Executive tries')$$,
  '42501',
  'An active staff administrator account is required.',
  'an executive cannot mint a club administrator'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000507', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Member tries')$$,
  '42501',
  'An active staff administrator account is required.',
  'an ordinary member cannot mint a club administrator'
);
reset role;

-- anon has no EXECUTE, so Postgres raises its own 42501 with a different message.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Anon tries')$$,
  '42501', null,
  'anonymous callers cannot reach the grant function at all'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.staff_grant_admin(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.staff_revoke_admin(uuid, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.staff_grant_admin(uuid, text)', 'EXECUTE'),
  'the club administrator RPCs are revoked from anon and service_role'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Disabled staff tries')$$,
  '42501',
  'An active staff administrator account is required.',
  'a disabled staff account cannot grant the role'
);
reset role;

-- Reason validation happens before any write.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', '   ')$$,
  '22023',
  'A member ID and a valid 1 to 500 character reason are required.',
  'a whitespace-only reason is rejected'
);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', pg_catalog.repeat('x', 501))$$,
  '22023',
  'A member ID and a valid 1 to 500 character reason are required.',
  'a reason longer than 500 characters is rejected'
);
select throws_ok(
  $$select public.staff_grant_admin(null, 'No target supplied')$$,
  '22023',
  'A member ID and a valid 1 to 500 character reason are required.',
  'a null member id is rejected'
);
reset role;

select is(
  (select count(*) from public.member_role_assignments where role = 'admin'),
  3::bigint,
  'the rejected calls wrote no assignment rows'
);

-- Target eligibility.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000508', 'Pending tries')$$,
  '23514',
  'The club administrator must be an active member.',
  'a pending applicant cannot be appointed'
);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000502', 'Staff tries')$$,
  '23514',
  'The club administrator must be an active member.',
  'a staff account cannot be appointed'
);
select throws_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000505', 'President tries as target')$$,
  '23514',
  'Revoke the president role before granting Club Admin.',
  'the sitting president is refused a friendly conflict, not a raw unique violation'
);
select throws_ok(
  $$select public.staff_grant_admin('95f2b9a2-3f6d-4e77-9b0f-0d4e5a56c111', 'Unknown account')$$,
  '23514',
  'That account does not exist.',
  'an unknown member id reports a missing account'
);
reset role;

-- No member-facing RPC accepts p_role = 'admin'.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000505', true);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000503', 'admin', 'President tries the old way')$$,
  '22023',
  'Invalid member or club role.',
  'the president cannot grant admin through set_club_role'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000503', 'admin', 'President tries the old way')$$,
  '22023',
  'Invalid member or club role.',
  'the president cannot grant admin through grant_club_role'
);
select throws_ok(
  $$select public.revoke_club_role('00000000-0000-0000-0000-000000000506', 'admin', 'President tries the old way')$$,
  '22023',
  'Invalid member or club role.',
  'the president cannot revoke admin through revoke_club_role'
);
reset role;
```

- [ ] **Step 2: Run the suite**

Run: `npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: PASS if Tasks 2–3 were implemented as written. This task adds no product code — a failure here is a guardrail that drifted, so fix the function, not the assertion. Two assertions to watch:
- `'the rejected calls wrote no assignment rows'` counts every `admin` row in the table, live or revoked. The earlier blocks leave exactly three: `…0503` (Task 1 direct insert, then revoked), `…0503` again (Task 2 grant, then handed over), and `…0504` (Task 2 grant, then Task 3 revoke). If you edited an earlier block, recount from those blocks rather than patching this number.
- the anon `throws_ok` passes `null` for the message because the privilege denial message is Postgres's own, not the function's.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/database/club_administrator_appointment_test.sql
git commit -m "test(staff): pin club administrator grant guardrails"
```

---

### Task 5: Prove the authority claim — the holder writes money, staff still cannot

**Files:**
- Modify: `supabase/tests/database/club_administrator_appointment_test.sql` (insert above `select * from finish();`)

**Interfaces:**
- Consumes: `public.create_finance_category(text, text) returns uuid`, `public.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid, text)` (the 9-argument current form; the 8-argument legacy overload still exists and must not be used), `public.void_club_financial_transaction(uuid, text)`, `public.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) returns uuid`, `public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid)`, `public.approve_dues_payment_request(uuid)`, `public.set_club_role(uuid, text, text)`, `public.staff_appoint_president(uuid, text)`, `public.dues_month_status(member_id, covered_month, amount_ngn, status, due_date, is_overdue)`, `private.guard_last_active_primary_admin` via the `member_profiles_preserve_last_primary_admin` trigger.
- Produces: no new product code. This is the task that proves the spec's central claim instead of assuming it.

- [ ] **Step 1: Write the authority assertions**

Insert above `select * from finish();`:

```sql
-- ===========================================================================
-- The authority claim: an active member holding admin can write money through
-- the gates that already exist, and nothing else changes.
-- State entering: zero live admin assignments.
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select lives_ok(
  $$select public.staff_grant_admin('00000000-0000-0000-0000-000000000503', 'Records officer for the ledger test')$$,
  'the authority holder is appointed'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);

select set_config(
  'ca.category_id',
  public.create_finance_category('Records test category', 'Opened by the club administrator')::text,
  true
);

select set_config(
  'ca.club_income_id',
  public.record_club_financial_transaction(
    'income', 5000,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Monthly subscription', current_setting('ca.category_id')::uuid,
    'A. Member', null,
    '50000000-0000-0000-0000-000000000001', 'cash'
  )::text,
  true
);

select ok(
  current_setting('ca.club_income_id') <> '',
  'the club administrator records a club ledger income line'
);

select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 5000, current_date, 'Duplicate submission key', null,
    'A. Member', null, '50000000-0000-0000-0000-000000000001', 'cash')$$,
  '23505',
  'This submission key was already used for different financial data.',
  'the holder reaches the real ledger rules, not a permissive stub'
);

select lives_ok(
  $$select public.void_club_financial_transaction(
    current_setting('ca.club_income_id')::uuid, 'Entered against the wrong payer')$$,
  'the club administrator voids a club ledger line'
);

select set_config(
  'ca.event_id',
  public.create_event(
    'Club Admin Authority Event', 'party',
    pg_catalog.clock_timestamp() + interval '3 days', 'Club Hall',
    null, false, false, true, true, true, true
  )::text,
  true
);

select set_config(
  'ca.event_expense_id',
  public.record_event_financial_transaction(
    current_setting('ca.event_id')::uuid, 'expense', 2000,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Sound hire', 'Local Sound Co', null, 'cash',
    '50000000-0000-0000-0000-000000000002'
  )::text,
  true
);

select ok(
  current_setting('ca.event_expense_id') <> '',
  'the club administrator writes an event ledger line'
);

-- Dues governance, proved differentially rather than with an invented request
-- fixture: a missing request id raises 23503, so reaching that error inside the
-- holder's session means every authorisation check in front of it passed.
select throws_ok(
  $$select public.approve_dues_payment_request(gen_random_uuid())$$,
  '23503',
  'Dues payment request not found.',
  'the club administrator clears both dues gates and reaches the record lookup'
);

-- Role administration inside the holder's remit.
select lives_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000509', 'executive', 'Promoted by the club administrator')$$,
  'the club administrator can grant executive status'
);

-- Role administration outside the holder's remit.
select throws_ok(
  $$select public.staff_appoint_president('00000000-0000-0000-0000-000000000509', 'Holder tries to move the president')$$,
  '42501',
  'An active staff administrator account is required.',
  'the club administrator cannot touch the president role'
);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000503', 'executive', 'Self promotion')$$,
  '42501',
  'Administrators cannot change their own club role.',
  'the club administrator cannot change their own roles'
);
reset role;
```

- [ ] **Step 2: Verify the five messages and gates Step 1 assumes**

Step 1 hard-codes error messages copied from earlier work and relies on three gates accepting `has_club_role('admin')`. Confirm all six against the schema before running:

```bash
grep -rn "Administrators cannot change their own club role" supabase/migrations/ | head -2
grep -rn "This submission key was already used for different financial data" supabase/migrations/ | head -2
grep -rn "Dues payment request not found" supabase/migrations/ | head -2
grep -rn "Only active club members may approve dues" supabase/migrations/ | head -2
grep -rn "Only an active Executive, Admin, or Backup Admin may create an event" supabase/migrations/ | head -2
grep -rn "Event financial management access is required" -B 6 supabase/migrations/20261003102501_event_finance_ticketing_ledger.sql | grep -c "has_club_role"
```
Expected: the first five each return a migration line; the last returns a non-zero count, showing the event ledger gate consults the role predicates. The self-role guard is `42501` at `20261029122000_staff_administration_rpcs.sql:1016`; the `create_event` admin allowance is at `20261003101500_events_roles_budgets_lifecycle.sql:526-530`; the missing-request error is `23503` at `20261025122000_dues_payment_methods.sql:615`. If any message or SQLSTATE differs, read that function's `raise exception using errcode = …` clause and correct the assertion in Step 1. Do not change the product code to match a test.

- [ ] **Step 3: Write the exemption, the staff regression, and the ordering assertions**

Insert above `select * from finish();`:

```sql
-- ===========================================================================
-- Dues exemption, the staff regression, and revoke-before-deactivate.
-- State entering: …0503 holds the live admin assignment.
-- ===========================================================================

select is(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000503'),
  0::bigint,
  'the club administrator has no dues months at all'
);

select ok(
  (select count(*) > 0 from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000506'),
  'an active executive in the same fixture does owe dues months, so the exemption is real'
);

-- The regression that matters most: staff themselves still cannot write money.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 1, current_date, 'Staff tries the ledger', null, 'Nobody', null,
    '50000000-0000-0000-0000-000000000003', 'cash')$$,
  '42501',
  'Active membership is required.',
  'a staff session is still rejected by the club ledger'
);
select throws_ok(
  $$select public.approve_dues_payment_request(gen_random_uuid())$$,
  '42501',
  'Only active club members may approve dues.',
  'a staff session is stopped by the dues gate, where the holder reached the record lookup'
);
select throws_ok(
  $$insert into public.club_financial_transactions (
    kind, amount_ngn, transaction_date, source_note, created_by, idempotency_key
  ) values ('income', 1, current_date, 'Direct insert by staff', auth.uid(), gen_random_uuid())$$,
  '42501', null,
  'a staff session still cannot write the ledger table directly'
);
reset role;

-- Revoke before deactivate: the existing status trigger forces the ordering,
-- because the singleton index counts rows and cannot see member status. These
-- two statements run from the suite's default session on purpose — a BEFORE
-- UPDATE trigger fires for every role, whereas a direct member_profiles update
-- from a staff session would be stopped by RLS for a reason unrelated to the
-- ordering rule being proved.
select throws_ok(
  $$update public.member_profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000503'$$,
  '23514',
  'At least one active primary Admin must remain active.',
  'deactivating a member who still holds Club Admin is blocked by the existing trigger'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select lives_ok(
  $$select public.staff_revoke_admin('00000000-0000-0000-0000-000000000503', 'Stepped down before leaving')$$,
  'staff revoke the role first'
);
reset role;

select ok(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000503') > 0,
  'once revoked, the former administrator is dues-liable again'
);

select lives_ok(
  $$update public.member_profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000503'$$,
  'after revoking, the same deactivation succeeds'
);
```

The dues-liability reversal is the assertion that ties the two halves of the design together: exemption is a property of the live assignment, not of the person, so withdrawing the role puts the member back in the dues population and frees the singleton slot in the same statement.

- [ ] **Step 4: Run the suite**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: PASS if Step 2 confirmed the messages. If the ledger or event assertions fail with an authorisation error instead of the intended success, the gate that function uses does **not** name `has_club_role('admin')` — that is a finding worth reporting, because spec §6's authority table asserts it does. Report the exact `not ok` text and the raised message; do not delete the assertion.

- [ ] **Step 5: Confirm no existing authority test changed status**

Run: `npx supabase test db --local supabase/tests/database/president_staff_admin_test.sql supabase/tests/database/club_finances_test.sql supabase/tests/database/event_finance_ticketing_ledger_test.sql`
Expected: zero `not ok` lines. These suites prove that reusing `admin` did not disturb anyone else's authority.

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/database/club_administrator_appointment_test.sql
git commit -m "test(staff): prove club administrator money authority and dues exemption"
```

---

### Task 6: The role reads "Club Admin" in notifications

**Files:**
- Modify: `supabase/migrations/20261101130000_club_administrator_appointment.sql` (append)
- Modify: `supabase/tests/database/club_administrator_appointment_test.sql` (insert above `select * from finish();`)

**Interfaces:**
- Consumes: `private.format_role_label(p_role text) returns text`, currently defined in `20261029121000_president_role_and_alias.sql:900` (verified as the latest definition — nothing redefines it after that).
- Produces: the same function with `'admin' → 'Club Admin'`. Notification bodies and the officer roster read the label through this function, so no application file changes.

- [ ] **Step 1: Confirm nothing pins the old string**

Run: `grep -rn "'Admin'\|\"Admin\"" tests/ supabase/tests/ | head`
Expected: **no output** (verified on 2026-11-01). If anything now matches, that assertion is a superseded expectation and must be updated to `'Club Admin'`, not left to fail.

- [ ] **Step 2: Write the failing label assertion**

Insert above `select * from finish();`:

```sql
select is(
  (select private.format_role_label('admin')),
  'Club Admin'::text,
  'the club administrator role is labelled for members'
);

select is(
  (select private.format_role_label('backup_admin')),
  'Backup Admin'::text,
  'the legacy backup label is unchanged'
);

select is(
  (select private.format_role_label('president')),
  'President'::text,
  'the president label is unchanged'
);
```

- [ ] **Step 3: Run the suite to verify it fails**

Run: `npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql`
Expected: FAIL — `# not ok 1 - the club administrator role is labelled for members` with `# Failed test … expected: "Club Admin"` / `#     got: "Admin"`.

- [ ] **Step 4: Append the restated function to the migration**

Migrations are immutable, so restate the whole function — copied from `20261029121000_president_role_and_alias.sql:900-918` with one line changed. `create or replace` preserves the existing ACL, which already revokes this function from `public, anon, authenticated, service_role`; it is reached only from inside other definer functions, so that is correct.

```sql
-- Display label only. The technical role value stays 'admin' everywhere; the
-- word "superuser" describes staff and must never appear in member-facing text.
create or replace function private.format_role_label(p_role text)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  select case pg_catalog.lower(coalesce(p_role, ''))
    when 'admin' then 'Club Admin'
    when 'backup_admin' then 'Backup Admin'
    when 'president' then 'President'
    when 'executive' then 'Executive'
    when 'member' then 'Member'
    when 'lead' then 'Event Lead'
    when 'assistant' then 'Event Assistant'
    when 'committee' then 'Committee Member'
    else initcap(pg_catalog.replace(coalesce(p_role, 'Member'), '_', ' '))
  end;
$function$;
```

- [ ] **Step 5: Run the suite to verify it passes**

Run: `npx supabase db push --local --include-all && npx supabase test db --local supabase/tests/database/club_administrator_appointment_test.sql supabase/tests/database/in_app_notifications_test.sql`
Expected: PASS, zero `not ok` lines in both files.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101130000_club_administrator_appointment.sql supabase/tests/database/club_administrator_appointment_test.sql
git commit -m "feat(staff): label the club administrator role for members"
```

---

### Task 7: Staff panel data layer — read the incumbent

**Files:**
- Modify: `src/lib/staff-panel.server.ts`
- Create: `tests/staff-governance-club-admin.test.mjs`

**Interfaces:**
- Consumes: `loadHolders(supabase, role)` (private, currently typed to the two-member union `"president" | "executive"`), `OfficerHolder { memberId, fullName, username, since, status }`.
- Produces: `loadClubAdmin(supabase: ServerSupabaseClient): Promise<OfficerHolder | null>` — consumed by Task 9's governance page.

- [ ] **Step 1: Write the failing test**

Create `tests/staff-governance-club-admin.test.mjs`:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panel = fs.readFileSync("src/lib/staff-panel.server.ts", "utf8");

test("the staff panel can read the incumbent club administrator", () => {
  assert.match(
    panel,
    /role: "president" \| "executive" \| "admin"/,
    "loadHolders must accept the admin role",
  );
  const loader = panel.match(
    /export async function loadClubAdmin\([\s\S]*?\n}\n/,
  );
  assert.ok(loader, "loadClubAdmin must be exported");
  assert.match(loader[0], /loadHolders\(supabase, "admin"\)/);
  assert.match(loader[0], /Promise<OfficerHolder \| null>/);
  assert.match(loader[0], /return holders\[0\] \?\? null;/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/staff-governance-club-admin.test.mjs`
Expected: FAIL on both assertions (`loadHolders must accept the admin role`, `loadClubAdmin must be exported`).

- [ ] **Step 3: Widen the loader and add the sibling**

In `src/lib/staff-panel.server.ts`, change the private loader's parameter type from `role: "president" | "executive"` to:

```ts
async function loadHolders(
  supabase: ServerSupabaseClient,
  role: "president" | "executive" | "admin",
): Promise<OfficerHolder[]> {
```

Then add this directly below the existing `loadPresident` function, matching its style:

```ts
export async function loadClubAdmin(
  supabase: ServerSupabaseClient,
): Promise<OfficerHolder | null> {
  const holders = await loadHolders(supabase, "admin");
  return holders[0] ?? null;
}
```

`loadHolders` already returns `[]` on error or empty results, so a club with no administrator reads as `null` without new branching.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/staff-governance-club-admin.test.mjs && npm run lint`
Expected: PASS, then Biome clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/staff-panel.server.ts tests/staff-governance-club-admin.test.mjs
git commit -m "feat(staff): load the incumbent club administrator for the panel"
```

---

### Task 8: Staff server actions and the revoke-first error copy

**Files:**
- Modify: `src/app/(staff)/admin/actions.ts` (append below `revokePresidentAction`)
- Modify: `src/lib/rpc-error-notice.ts`
- Modify: `src/lib/staff-notices.ts`
- Modify: `src/lib/system-notices.ts`
- Modify: `tests/staff-governance-club-admin.test.mjs` (append tests)

**Interfaces:**
- Consumes: `requireStaffActor()`, `formString(formData, key, maxLength)`, `uuidPattern`, `rpcErrorNotice(error)`, `redirect`, `revalidatePath`; RPCs `staff_grant_admin` / `staff_revoke_admin` from Tasks 2–3.
- Produces: `staffGrantClubAdminAction(formData: FormData)` and `staffRevokeClubAdminAction(formData: FormData)`, plus notice codes `club-admin-granted`, `club-admin-revoked` (page-local, Task 9) and `revoke-club-admin-first` (shared).

- [ ] **Step 1: Write the failing tests**

Append to `tests/staff-governance-club-admin.test.mjs`. Move the two new `fs.readFileSync` constants up into the existing constant block at the top of the file (they are shown inline here for context) and put the `test()` calls at the end:

```js
const actions = fs.readFileSync("src/app/(staff)/admin/actions.ts", "utf8");
const errorNotices = fs.readFileSync("src/lib/rpc-error-notice.ts", "utf8");

test("the appointment action is staff-gated and calls the grant RPC", () => {
  const block = actions.match(
    /export async function staffGrantClubAdminAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffGrantClubAdminAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /uuidPattern\.test\(memberId\)/);
  assert.match(block[0], /supabase\.rpc\(\s*"staff_grant_admin",/);
  assert.match(
    block[0],
    /redirect\("\/admin\/governance\?notice=club-admin-granted"\)/,
  );
});

test("the revocation action is staff-gated and calls the revoke RPC", () => {
  const block = actions.match(
    /export async function staffRevokeClubAdminAction\([\s\S]*?\n}\n/,
  );
  assert.ok(block, "staffRevokeClubAdminAction must be exported");
  assert.match(block[0], /await requireStaffActor\(\)/);
  assert.match(block[0], /supabase\.rpc\(\s*"staff_revoke_admin",/);
  assert.match(
    block[0],
    /redirect\("\/admin\/governance\?notice=club-admin-revoked"\)/,
  );
});

test("deactivating a serving club administrator is explained, not dumped", () => {
  assert.match(
    errorNotices,
    /primary Admin must remain active/i,
    "the trigger message maps to a notice code",
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/staff-governance-club-admin.test.mjs`
Expected: FAIL — both actions missing, and no rule for the trigger message.

- [ ] **Step 3: Append the two server actions**

Add below `revokePresidentAction` in `src/app/(staff)/admin/actions.ts`:

```ts
export async function staffGrantClubAdminAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);
  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect("/admin/governance?notice=invalid-request");
  }

  const { error } = await supabase.rpc("staff_grant_admin", {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(`/admin/governance?notice=${rpcErrorNotice(error)}`);

  revalidatePath("/admin/governance");
  revalidatePath("/admin");
  revalidatePath("/officers/members");
  revalidatePath("/dues");
  redirect("/admin/governance?notice=club-admin-granted");
}

export async function staffRevokeClubAdminAction(formData: FormData) {
  const { supabase } = await requireStaffActor();

  const memberId = formString(formData, "member_id", 36);
  const reason = formString(formData, "reason", 500);
  if (!memberId || !uuidPattern.test(memberId) || !reason) {
    redirect("/admin/governance?notice=invalid-request");
  }

  const { error } = await supabase.rpc("staff_revoke_admin", {
    p_member_id: memberId,
    p_reason: reason,
  });
  if (error) redirect(`/admin/governance?notice=${rpcErrorNotice(error)}`);

  revalidatePath("/admin/governance");
  revalidatePath("/admin");
  revalidatePath("/officers/members");
  revalidatePath("/dues");
  redirect("/admin/governance?notice=club-admin-revoked");
}
```

No audit writes here — `audit_log` is written inside the RPCs, and `requireStaffActor()` already re-checks `status = 'staff'` and `staff_disabled_at is null` before the call.

- [ ] **Step 4: Map the deactivation error to an actionable notice**

The status trigger raises `At least one active primary Admin must remain active.` and nothing in `rpcErrorNotice` currently matches that sentence, so it falls through to `operation-failed`. Verify the fall-through is safe before appending: no existing pattern in `MESSAGE_RULES` matches that text. Append this entry as the **last** element of `MESSAGE_RULES` in `src/lib/rpc-error-notice.ts`:

```ts
  [
    /primary Admin must remain active/i,
    "revoke-club-admin-first",
  ],
```

Then add `"revoke-club-admin-first"` to the end of the `sharedCodes` array in `src/lib/staff-notices.ts`, and this entry to the notice definitions object in `src/lib/system-notices.ts`, alongside `"invalid-state"` and `denied`:

```ts
  "revoke-club-admin-first": {
    type: "error",
    title: "Revoke Club Admin First",
    message:
      "This member still holds the Club Admin role. Revoke it on the Governance page before deactivating the account, then try again.",
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/staff-governance-club-admin.test.mjs && npm run lint && npx tsc --noEmit`
Expected: PASS, Biome clean, no type errors. Biome may collapse the two-line array entry above into one line — if `npm run lint` reports a formatting difference, apply exactly what it asks and re-run.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(staff)/admin/actions.ts" src/lib/rpc-error-notice.ts src/lib/staff-notices.ts src/lib/system-notices.ts tests/staff-governance-club-admin.test.mjs
git commit -m "feat(staff): add club administrator appointment actions and revoke-first copy"
```

---

### Task 9: The appointment card and governance page wiring

**Files:**
- Create: `src/components/staff/staff-club-admin-card.tsx`
- Modify: `src/app/(staff)/admin/governance/page.tsx`
- Modify: `tests/staff-governance-club-admin.test.mjs` (append tests)

**Interfaces:**
- Consumes: `StaffActionDialog` props `{ action, fields?, triggerLabel, title, description, confirmLabel, reasonLabel?, reasonHelp?, danger?, children? }` — the dialog always emits a `reason` textarea (`required`, `maxLength={500}`) plus hidden inputs from `fields`, so the `<select name="member_id">` in `children` is the member picker; `OfficerHolder` and `loadClubAdmin` from Task 7; `staffGrantClubAdminAction` / `staffRevokeClubAdminAction` from Task 8; `formatStaffTimestamp` from `@/lib/staff-presentation.mjs`.
- Produces: `StaffClubAdminCard({ clubAdmin, candidates })` exporting `interface ClubAdminCandidate { id: string; fullName: string; username: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/staff-governance-club-admin.test.mjs`:

```js
const card = fs.readFileSync("src/components/staff/staff-club-admin-card.tsx", "utf8");
const page = fs.readFileSync("src/app/(staff)/admin/governance/page.tsx", "utf8");

test("the club admin card offers appoint, replace and revoke", () => {
  assert.match(card, /export default function StaffClubAdminCard/);
  assert.match(card, /clubAdmin: OfficerHolder \| null/);
  assert.match(card, /candidates: ClubAdminCandidate\[\]/);
  assert.match(card, /Money & records authority/);
  assert.match(card, /staffGrantClubAdminAction/);
  assert.match(card, /staffRevokeClubAdminAction/);
  assert.match(card, /name="member_id"/);
  assert.match(
    card,
    /Does not pay dues while holding this role/,
    "the card must state the dues exemption",
  );
  assert.match(card, /cannot appoint another Club Admin/i);
});

test("the governance page wires the card and hides ineligible candidates", () => {
  assert.match(page, /loadClubAdmin/);
  assert.match(page, /StaffClubAdminCard/);
  assert.match(page, /row\.id !== president\?\.memberId/);
  assert.match(page, /row\.id !== clubAdmin\?\.memberId/);
  assert.match(page, /"club-admin-granted"/);
  assert.match(page, /"club-admin-revoked"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/staff-governance-club-admin.test.mjs`
Expected: FAIL — the card file does not exist (`readFileSync` throws ENOENT, reported as a test failure).

- [ ] **Step 3: Create the card**

Write `src/components/staff/staff-club-admin-card.tsx`:

```tsx
import {
  staffGrantClubAdminAction,
  staffRevokeClubAdminAction,
} from "@/app/(staff)/admin/actions";
import type { OfficerHolder } from "@/lib/staff-panel.server";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface ClubAdminCandidate {
  id: string;
  fullName: string;
  username: string;
}

export default function StaffClubAdminCard({
  clubAdmin,
  candidates,
}: {
  clubAdmin: OfficerHolder | null;
  candidates: ClubAdminCandidate[];
}) {
  return (
    <section className="rounded-2xl border border-linen bg-white p-5 sm:p-6 shadow-xs space-y-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-forest">
          Money & records authority
        </p>
        <h2 className="text-lg font-extrabold text-espresso">
          Current Club Admin
        </h2>
        <p className="mt-1 text-xs text-muted">
          Runs the club&apos;s records — finances, dues, events and attendance.
          Cannot change the president and cannot appoint another Club Admin.
          Does not pay dues while holding this role.
        </p>
      </div>

      {clubAdmin ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-sm font-bold text-forest">
              {clubAdmin.fullName}
            </p>
            <p className="text-xs text-body">@{clubAdmin.username}</p>
            <p className="mt-1 text-[11px] text-muted">
              Appointed {formatStaffTimestamp(clubAdmin.since)}
            </p>
          </div>
          <StaffActionDialog
            action={staffRevokeClubAdminAction}
            confirmLabel="Revoke Club Admin"
            danger
            description="The member keeps their account and loses every Club Admin authority immediately. The president can still run the books until a replacement is appointed."
            fields={{ member_id: clubAdmin.memberId }}
            reasonLabel="Reason for revoking"
            title={`Revoke ${clubAdmin.fullName} as Club Admin?`}
            triggerLabel="Revoke Club Admin"
          />
        </div>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
          Vacant. No member currently holds Club Admin, so dues corrections,
          ledger entries and event finances rest with the president alone.
        </p>
      )}

      <StaffActionDialog
        action={staffGrantClubAdminAction}
        confirmLabel={clubAdmin ? "Replace Club Admin" : "Appoint Club Admin"}
        danger={Boolean(clubAdmin)}
        description="Appointing a Club Admin gives one active member full write access to club money and officer roles. Appointing a new one revokes the current holder. This is recorded in the audit history and the president is notified."
        reasonHelp="Required. Explain why this member needs money authority."
        reasonLabel="Reason for appointment"
        title={
          clubAdmin
            ? `Replace ${clubAdmin.fullName} as Club Admin?`
            : "Appoint a Club Admin"
        }
        triggerLabel={clubAdmin ? "Replace Club Admin" : "Appoint Club Admin"}
      >
        <label className="grid gap-1 text-xs font-bold text-espresso">
          Member
          <select
            aria-required="true"
            className="min-h-11 rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso focus-visible:border-forest focus-visible:outline-hidden"
            defaultValue=""
            name="member_id"
            required
          >
            <option disabled value="">
              Select an active member
            </option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName} (@{candidate.username})
              </option>
            ))}
          </select>
        </label>
      </StaffActionDialog>

      {candidates.length === 0 ? (
        <p className="text-xs text-muted">
          No active member is eligible. Approve a member request first, or
          revoke the president role if the intended holder is the president.
        </p>
      ) : null}
    </section>
  );
}
```

`danger={Boolean(clubAdmin)}` makes the replace path read as destructive, exactly as the president card does.

- [ ] **Step 4: Wire the governance page**

In `src/app/(staff)/admin/governance/page.tsx`:

Add the import next to the existing `StaffPresidentCard` import:

```tsx
import StaffClubAdminCard, {
  type ClubAdminCandidate,
} from "@/components/staff/staff-club-admin-card";
```

Widen the loader import:

```tsx
import {
  loadClubAdmin,
  loadExecutiveRoster,
  loadPresident,
} from "@/lib/staff-panel.server";
```

Add two entries to `pageNotices`, after `"president-revoked"`:

```ts
  "club-admin-granted": {
    message:
      "Club Admin appointed. The change is recorded in the audit history and the president has been notified.",
    isError: false,
  },
  "club-admin-revoked": {
    message:
      "Club Admin revoked. The change is recorded in the audit history.",
    isError: false,
  },
```

Load the incumbent alongside the president — replace the existing `Promise.all` block:

```tsx
  const [president, clubAdmin, executives, activeMembers] = await Promise.all([
    loadPresident(supabase),
    loadClubAdmin(supabase),
    loadExecutiveRoster(supabase),
    supabase
      .from("member_profiles")
      .select("id, full_name, username")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);
```

Build the candidate list, excluding both the incumbent admin and the sitting president because `member_role_assignments_one_admin_identity_per_member_uidx` makes that appointment impossible — filtering it in the UI turns a database error into an unavailable option. Replace the existing `candidates` block, keeping `PresidentCandidate` for the president card and adding the admin list beside it:

```tsx
  const candidates: PresidentCandidate[] = (activeMembers.data ?? [])
    .filter((row) => row.id !== president?.memberId)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      username: row.username,
    }));

  const adminCandidates: ClubAdminCandidate[] = (activeMembers.data ?? [])
    .filter(
      (row) =>
        row.id !== president?.memberId && row.id !== clubAdmin?.memberId,
    )
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      username: row.username,
    }));
```

Render the card directly under `StaffPresidentCard`:

```tsx
      <StaffPresidentCard candidates={candidates} president={president} />
      <StaffClubAdminCard
        candidates={adminCandidates}
        clubAdmin={clubAdmin}
      />
```

- [ ] **Step 5: Run the tests and the type check**

Run: `node --test tests/staff-governance-club-admin.test.mjs && npm run lint && npx tsc --noEmit && npm run build`
Expected: all PASS, build succeeds. If the build complains about an unused `PresidentCandidate` import or a missing `ClubAdminCandidate` export, the import block in Step 4 was applied in the wrong order.

- [ ] **Step 6: Confirm the audit domain needs no change**

The new rows use `club_role_granted` / `club_role_revoked`, which already map to the governance "roles" domain (`tests/president-staff-routing.test.mjs:63` asserts `matchesAuditDomain("club_role_granted", "roles") === true`). No change to `src/lib/audit-domains.mjs`.

Run: `node --test tests/president-staff-routing.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/staff/staff-club-admin-card.tsx "src/app/(staff)/admin/governance/page.tsx" tests/staff-governance-club-admin.test.mjs
git commit -m "feat(staff): add Club Admin appointment card to the governance panel"
```

---

### Task 10: Full gate against a recorded baseline

**Files:**
- No source changes expected. Any failure is fixed in the file that caused it.

**Interfaces:**
- Consumes: every deliverable from Tasks 1–9.
- Produces: the evidence block that the implementation report and the rollout step quote.

- [ ] **Step 1: Confirm the pre-change pgTAP baseline is still valid**

The baseline is recorded in Global Constraints (503 tests, 34 failing assertions, 8 suites). Re-take it only if the stack has drifted since; if it must be re-taken, **do not use `db reset --local` without asking the operator** — this stack carries the four `verify-*@local.test` auth users that Task 11's browser pass signs in with, and a reset destroys them. Compare the two runs with:

Run: `npx supabase test db --local 2>&1 | tee "$HOME/supabase-local-backups/pgtap-baseline-check.txt" | grep -cE "^# Failed test"`
Expected: `34`, and `grep -E "Failed: [1-9]"` naming the same eight suites. A different number means the stack moved and the baseline must be re-recorded before Step 2 means anything.

- [ ] **Step 2: Apply and re-run**

Run: `npx supabase db push --local --include-all && npx supabase test db --local 2>&1 | tee "$HOME/supabase-local-backups/pgtap-after.txt" | grep -cE "^# Failed test"`
Expected: no more than 34 failing assertions, **zero `# Failed test` lines labelled from `club_administrator_appointment_test.sql`**, and `membership_roles_rls_test.sql` absent from the `Failed: [1-9]` list (its rewritten block must pass). Prove no new failure by name, not by count:

Run: `diff <(grep -E "^# Failed test" "$HOME/supabase-local-backups/pgtap-baseline.txt" | sort) <(grep -E "^# Failed test" "$HOME/supabase-local-backups/pgtap-after.txt" | sort) | grep "^>"`
Expected: no output. A `<` line is a baseline failure that disappeared — an improvement worth reporting, but confirm it disappeared because this feature fixed it, not because a suite aborted earlier than before.

- [ ] **Step 3: App gate**

Run: `npm run lint && npm test && npm run build`
Expected: all clean. `npm test` is `node --test` over ~95 flat `tests/*.test.mjs` files; a failure in an unrelated suite is a regression from the notice-code additions in Task 8 (the `sharedCodes` array and `system-notices` object are shared), so fix the mapping rather than skipping the test.

- [ ] **Step 4: CI parity**

Run: `npm run test:security-regression`
Expected: PASS. This is the exact script CI runs, alongside lint and build.

- [ ] **Step 5: Report the gate with numbers, not adjectives**

State: baseline failing-assertion count and after count (both from `grep -cE "^# Failed test"`), the failing suite list from each run, the `# ` labelled assertion count reported by the new suite's own run line (`Tests: N Failed: 0`), `npm test` pass count, and build status. Do not describe any of it as "looks good".

---

### Task 11: Browser verification and rollout

**Files:**
- Modify: `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md` (§8 authority matrix)

**Interfaces:**
- Consumes: the whole feature. Production is reached only by the operator-approved path in Step 5.

- [ ] **Step 1: Build a verification server**

Run: `netstat -ano | grep :3001`
If anything is listening, confirm its command line belongs to this repo's `next start -p 3001` and stop it; never stop the user's `next dev` on :3000. Then:

Run: `npm run build && npx next start -p 3001`
Browse `http://127.0.0.1:3001` (not `localhost` — the session cookie is host-scoped).

- [ ] **Step 2: Staff appoints a Club Admin**

Sign in as a staff account, open `/admin/governance`. Expected: the "Money & records authority" card under the president card showing "Vacant…", the appoint dialog listing active members **without** the sitting president, and a required reason field. Appoint an active member. Expected: the green success notice `Club Admin appointed. The change is recorded…` and the card showing that member with "Appointed …".

- [ ] **Step 3: The holder writes money**

Sign in as the appointed member (separate login — this is the point of separate hats). All of these are member routes in the `(member)` group, which is exactly where the holder belongs:

- `/finances` — the write controls are present, not greyed out. Record an income line against a real category, then void it.
- `/dues` — the holder's own standing reads as exempt (no unpaid months), while an executive's does not.
- `/officers/members` — change another member to executive and back. The role picker must offer member and executive only.
- `/events/<eventId>` — record an event ledger line, and if the local dues rates make it possible, approve a pending dues payment request submitted by a second member account. This is the end-to-end counterpart of Task 5's differential proof, which deliberately stopped at the authorisation gates rather than inventing a `dues_payment_requests` fixture the local stack cannot produce.

If `/dues` shows unpaid months for the holder, the exemption is broken — check that the assignment row is live (`revoked_at is null`) and that the holder's `member_profiles.status` is `active`, because both halves are required by the view's `not exists` predicate.

- [ ] **Step 4: The holder is boxed in**

Still as the holder: expected — `/admin` redirects to the sign-in or home page with `notice=denied` (the staff layout requires `status = 'staff'`); no president-appointment UI anywhere; the officer role picker offers member/executive only, never admin. Then sign in as staff, try to **deactivate** the holder without revoking: expected notice **"Revoke Club Admin First — This member still holds the Club Admin role. Revoke it on the Governance page before deactivating the account, then try again."** Revoke on `/admin/governance`, deactivate, and confirm it succeeds; the former holder's `/finances` reverts to member read-only and their `/dues` page shows liability again.

- [ ] **Step 5: The president sees the handover**

Sign in as the president. Expected: in-app notifications for the grant and the revoke, worded with the label **"Club Admin"** — never "admin" raw and never "superuser". Check `/admin/audit` (or the governance audit list) shows both `club_role_granted` and `club_role_revoked` rows attributed to the staff actor.

- [ ] **Step 6: Stop the verification server and record what was not verified**

Stop `next start -p 3001`. The Desktop browser viewport is locked and screenshots can stop mid-session, so state plainly which of Steps 2–5 were checked by DOM probe versus rendered, and which breakpoints were never actually rendered.

- [ ] **Step 7: Update the report, then stop before production**

In `PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md` §8, replace the Phase 1 line stating that club roles cannot be granted from `/admin` with the accurate rule: **staff may grant and revoke exactly one Club Admin (`admin`); president, executive and member roles still move only through their existing paths.** Append the authority rows from spec §6.

Production rollout is **not** a step in this plan. It requires, in order: the spec §7.1 pre-flight count run against the hosted database; an encrypted snapshot; an isolated restore drill of this migration against that snapshot; then `supabase db push` against the linked project — **with explicit operator confirmation at each stage**. Never run `supabase db push` without `--local` unless that confirmation has been given in this conversation. Nothing here converts accounts or touches `auth.users`.

- [ ] **Step 8: Commit**

```bash
git add PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md
git commit -m "docs(staff): record the Club Admin authority matrix"
```

---

## Self-review notes

- **Spec coverage.** §6 authority table → Task 5 (proved by execution, not by reading gates). §7.1 singleton → Task 1. §7.2 grant → Task 2. §7.3 revoke and the deliberate no-floor-check decision → Task 3. §7.4 wrappers and grants → Tasks 2–3. §8 deactivation ordering → Task 1 Step 6 (existing suite), Task 5 Step 3 (trigger assertion), Task 8 Step 4 (staff copy). §9 app surface → Tasks 7–9, including the "Money & records authority" eyebrow and the president-excluded candidate filter. §10 notifications → Task 6's label plus Task 9 Step 6's audit domain, with no new notification code as the spec requires. §11 failure modes → Task 4, plus Task 3's self-revoke case and Task 5's staff-still-cannot-write block. §12 testing → Tasks 1–6 pgTAP, 7–9 app, 10 full gate, 11 browser. §14 rollout → Task 11 Step 7. §5's rejected Approach B is enforced by Task 5's regression block.
- **Two findings this plan makes against the spec, both resolved here rather than in the product code.**
  1. Spec §12's list did not notice that `membership_roles_rls_test.sql` explicitly proves a *second* live primary Admin **is permitted** (`lives_ok`, label "a second active primary Admin can be recorded"). The singleton index makes that assertion false, so Task 1 Step 6 rewrites the block into three assertions that prove the new rule plus the revoke-first escape, and adjusts `plan(53)` → `plan(54)`. Every other suite holds at most one live admin (`grep -c "'admin'"` per file) and `supabase/seed.sql` contains none.
  2. Spec §12 item 8 asks the holder's session to "approve a dues payment request". Doing that in pgTAP needs a `pending` request row, and building one means either inventing a `dues_payment_requests` column set or driving `submit_dues_payment_request`, which requires a configured `dues_rates` row for every requested month — a fixture no existing suite builds (`grep` finds no `dues_rates` insert and no `submit_dues_payment_request` call anywhere in `supabase/tests/`, and the local seed has no rates). Task 5 therefore proves the same claim differentially and without a fixture: the holder's call reaches `23503 'Dues payment request not found.'`, which is only reachable after both the membership gate and the `has_club_role('admin')` officer gate have passed, while a staff call to the same function stops at `42501 'Only active club members may approve dues.'`. The end-to-end approval, with real rates, moves to Task 11 Step 3 where the browser already has a populated dues path.
- **Placeholders.** None. Every code step contains the exact text to be written. Two throwaway assertions drafted during review were replaced with the real ones, and one invented dues fixture was replaced by a differential proof — see finding 2 above.
- **Type consistency.** `loadClubAdmin` returns `Promise<OfficerHolder | null>` (Task 7) and is consumed as `clubAdmin: OfficerHolder | null` (Task 9). `ClubAdminCandidate { id, fullName, username }` is exported by the card and imported by the page as a type. Action names are `staffGrantClubAdminAction` / `staffRevokeClubAdminAction` in Tasks 8 and 9 and in the tests. RPC names are `staff_grant_admin` / `staff_revoke_admin` in the migration, the pgTAP suite and the actions. Notice keys are `club-admin-granted` / `club-admin-revoked` (page-local, Task 9) and `revoke-club-admin-first` (shared, Task 8) and appear identically in the redirect strings and the tests. The index is named `member_role_assignments_one_current_admin_uidx` in the migration, both pgTAP suites, and spec §7.1.
