# President Rename, Staff Administrators, and `/officers/members` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `backup_admin` to `president`, add a non-member `staff` population with a first-release administration panel at `/admin`, and move officer member management to `/officers/members` without rewriting historical migrations.

**Architecture:** Staff are a new `member_profiles.status = 'staff'` population guarded by a parallel `private.is_staff_administrator()` predicate; the existing `is_active_club_member()` is never widened, so staff fail every member gate automatically. The president rename uses a compatibility alias inside `private.has_club_role()` for the ~198 call sites, plus targeted replacements for the four inline role comparisons. All writes remain security-definer RPCs behind forced RLS; staff reads get five explicit policies and nothing else.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (PostgreSQL, Auth Admin API, RLS), pgTAP, `node --test`, Biome.

**Spec:** [PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/PRESIDENT-STAFF-ADMIN-IMPLEMENTATION-REPORT-2026-10-29.md)

---

## Global Constraints

- Do not widen `private.is_active_club_member()`, `private.has_club_role()`, or `private.has_officer_history_access()` to include staff. Staff access is additive and separate.
- Append new migrations only. Never edit or rewrite a historical migration file.
- Every new table/policy/function must follow the existing pattern: security-definer `private` implementation, security-invoker `public` wrapper, explicit `revoke all` then narrow `grant`, `set search_path = ''`.
- `service_role` has SELECT only on `member_profiles` / `member_role_assignments`; provisioning writes go through a security-definer RPC granted to `service_role`, not a table grant.
- Staff status and member status are mutually exclusive by the `member_profiles_status_check` constraint.
- President authority = today's `backup_admin` authority plus minutes authoring, attendance default, and announcement priority. President does not gain announcement publishing or poll creation.
- Never delete an account with history; disable staff, deactivate members.
- `staff_disabled_at` may be non-null only when `status = 'staff'`, and `staff_disabled_at is not null` is the single definition of a disabled staff account. There is no boolean flag.
- A row with `status = 'staff'` can never hold a `member_role_assignments` or `event_role_assignments` row, enforced by trigger, not only by RPC checks.
- Tests come first. Source-text `.mjs` tests assert exact strings; update superseded assertions deliberately, not by blanket replace.
- No production data conversion runs as part of a migration; conversion is an operator runbook executed only after explicit approval.

---

## Interfaces

These signatures are fixed by this plan; later tasks must use them exactly.

```sql
private.is_staff_administrator() returns boolean

private.approve_member_core(p_member_id uuid, p_reason text, p_actor_id uuid) returns void
private.reject_member_core(p_member_id uuid, p_reason text, p_actor_id uuid) returns void
private.deactivate_member_core(p_member_id uuid, p_reason text, p_actor_id uuid) returns void
private.reactivate_member_core(p_member_id uuid, p_reason text, p_actor_id uuid) returns void

public.staff_approve_member(p_member_id uuid, p_reason text) returns void
public.staff_reject_member(p_member_id uuid, p_reason text) returns void
public.staff_deactivate_member(p_member_id uuid, p_reason text) returns void
public.staff_reactivate_member(p_member_id uuid, p_reason text) returns void

public.staff_appoint_president(p_member_id uuid, p_reason text) returns void
public.staff_revoke_president(p_member_id uuid, p_reason text) returns void

public.staff_set_disabled(p_staff_id uuid, p_disabled boolean, p_reason text) returns void

private.reject_staff_role_target() returns trigger

private.provision_staff_profile(
  p_user_id uuid, p_full_name text, p_username text,
  p_actor_id uuid, p_reason text
) returns void
```

TypeScript contracts for the panel:

```ts
type StaffMemberRow = {
  id: string;
  fullName: string;
  username: string;
  disabledAt: string | null;
  createdAt: string;
};

type PendingMemberRow = {
  id: string;
  fullName: string;
  username: string;
  status: "pending" | "active" | "deactivated" | "rejected";
  profileComplete: boolean;
  requestedAt: string;
};
```

---

## Review Focus

1. **No accidental member authority for staff.** Every member RPC must reject a staff JWT with the pre-existing inactive/member error, not a new one, and no staff row can acquire a club or event role by any path, including direct SQL.
2. **Alias before data rename.** The `has_club_role` alias and the three inline comparisons must ship in the same migration as the `backup_admin → president` update, or finance and dues gates fail closed.
3. **Last-admin conversion ordering.** The conversion transaction must disable `member_profiles_preserve_last_primary_admin` before revoking the sole admin's role, then re-enable it after.
4. **Route collision.** `(member)/admin/*` and `(staff)/admin/*` cannot coexist; officer routes move out first, and the old `/admin/members` path is replaced in the same commit that adds the staff page.
5. **Dues separation of duties.** A president's own dues require an executive approver; the "admin is exempt" branch is deleted, not left to fail.
6. **Disabled staff.** `staff_disabled_at`, the GoTrue ban, and the `is_staff_administrator()` predicate must agree; a failed ban is reported as partial failure, never success.
7. **Audit actor labels.** Staff must display as staff in the audit viewer and role formatter, while the FK continues to point at `member_profiles`.

---

## Phase 0 — Failing tests first

### Task 1: pgTAP regression suite for the new model

**Files:**
- Create: `supabase/tests/database/president_staff_admin_test.sql`
- Reference: `supabase/tests/database/membership_roles_rls_test.sql` (fixture and role-switching style)

**Interfaces:**
- Consumes: nothing yet; the test intentionally fails until Tasks 3–5.
- Produces: the authoritative regression suite for staff isolation, the president alias, lifecycle RPCs, and guards.

- [ ] **Step 1: Write the failing test file**

Create the file with `begin;`, `select plan(N);`, fixtures, assertions, and `select * from finish(); rollback;`. Fixtures follow the existing convention: insert seven `auth.users` rows, update profiles as the test owner, insert roles, then `set local role authenticated; select set_config('request.jwt.claim.sub', '<uuid>', true);` per actor, `reset role;` after each block.

Use these fixture IDs:

| UUID suffix | Person | Status | Current roles |
| --- | --- | --- | --- |
| `...0001` | Admin One | active | admin |
| `...0002` | President One | active | president |
| `...0003` | Executive One | active | executive |
| `...0004` | Member One | active | none |
| `...0005` | Pending One | pending | none |
| `...0006` | Staff One | staff | none |
| `...0007` | Staff Two | staff | none |
| `...0008` | Disabled Staff | staff, disabled | none |

Create one club event in the fixtures: the event-role assertion below inserts against `public.events` and needs a row to select.

Assertions (at minimum):

```sql
-- Structural
select ok((select pg_catalog.pg_get_constraintdef(oid)
           from pg_catalog.pg_constraint
           where conname = 'member_profiles_status_check') like '%staff%',
          'member_profiles accepts the staff status');
select has_function('private', 'is_staff_administrator', array[]::text[],
                    'staff predicate exists');
select has_index('public', 'member_role_assignments',
                 'member_role_assignments_one_current_president_uidx',
                 'one current president is enforced');
select has_column('public', 'member_profiles', 'staff_disabled_at',
                  'staff disabled timestamp exists');
select has_trigger('public', 'member_role_assignments',
                   'member_role_assignments_reject_staff_target',
                   'staff cannot gain a club role');
select has_trigger('public', 'event_role_assignments',
                   'event_role_assignments_reject_staff_target',
                   'staff cannot gain an event role');

-- Staff isolation
select is((select private.is_active_club_member() from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true)) s),
          false, 'staff are not active club members');
select is((select private.is_staff_administrator() from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true)) s),
          true, 'active staff pass the staff predicate');
select is((select private.has_club_role('president') from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true)) s),
          false, 'staff hold no club role');
select is((select private.is_staff_administrator() from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', true)) s),
          false, 'a disabled staff account fails the staff predicate');
select throws_ok(
  $$insert into public.member_role_assignments
      (member_id, role, assigned_by, grant_reason)
    values ('00000000-0000-0000-0000-000000000006', 'executive',
            '00000000-0000-0000-0000-000000000001', 'Staff promotion attempt')$$,
  '23514', 'Staff administrator accounts cannot hold club or event roles.',
  'staff cannot be given a club role by direct insert');
select throws_ok(
  $$insert into public.event_role_assignments
      (event_id, member_id, role, assigned_by, grant_reason)
    select id, '00000000-0000-0000-0000-000000000006', 'lead',
           '00000000-0000-0000-0000-000000000001', 'Staff event lead attempt'
    from public.events limit 1$$,
  '23514', 'Staff administrator accounts cannot hold club or event roles.',
  'staff cannot be given an event role by direct insert');

-- President alias
select is((select private.has_club_role('backup_admin') from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true)) s),
          true, 'legacy backup_admin checks resolve to president');
select is((select private.has_club_role('president') from (select set_config(
             'request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true)) s),
          true, 'president role resolves directly');

-- Guards, executed as Staff One (...0006)
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.staff_set_disabled('00000000-0000-0000-0000-000000000006', true, 'Self-disable')$$,
  '42501', 'Staff cannot disable their own account.',
  'staff cannot disable self');
select lives_ok(
  $$select public.staff_set_disabled('00000000-0000-0000-0000-000000000007', true, 'Coverage gap')$$,
  'staff can disable another staff account');
select is(
  (select count(*) from public.member_profiles
   where status = 'staff' and staff_disabled_at is null),
  1::bigint,
  'one active staff remains');
reset role;  -- direct write as the test owner, bypassing RLS to exercise the trigger
select throws_ok(
  $$update public.member_profiles
    set staff_disabled_at = pg_catalog.clock_timestamp()
    where id = '00000000-0000-0000-0000-000000000006'$$,
  '23514', 'At least one active staff administrator must remain active.',
  'a direct update cannot disable the last active staff');

-- Lifecycle through a staff actor: re-enter the Staff One session after the reset above
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000006', true);
select lives_ok(
  $$select public.staff_approve_member('00000000-0000-0000-0000-000000000005', 'Profile verified by staff')$$,
  'staff can approve a pending member');
select is(
  (select status from public.member_profiles
   where id = '00000000-0000-0000-0000-000000000005'),
  'active'::text,
  'staff approval activates the member');
select is(
  (select actor_id from public.audit_log
   where action = 'member_approved'
     and target_member_id = '00000000-0000-0000-0000-000000000005'
   order by occurred_at desc limit 1),
  '00000000-0000-0000-0000-000000000006'::uuid,
  'staff actor is recorded in the audit log');

-- Staff read surfaces and non-surfaces
select is((select count(*) from public.member_profiles), 8::bigint,
          'staff can read the full member directory');
select is((select count(*) from public.notifications), 0::bigint,
          'staff still cannot read notifications');
```

Also assert: two current presidents raise `23505`; `staff_appoint_president` by a president raises `42501`; `set_club_role(..., 'admin')` by a president raises `22023`; a president can grant executive; staff cannot update `member_profiles` directly.

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
npx supabase test db supabase/tests/database/president_staff_admin_test.sql
```

Expected: FAIL at the first structural assertion (`member_profiles_status_check` does not contain `staff`), with subsequent failures for missing functions and indexes.

- [ ] **Step 3: Commit the failing test**

```bash
git add supabase/tests/database/president_staff_admin_test.sql
git commit -m "test(db): specify staff administrator and president model"
```

### Task 2: Node regression tests for routing, navigation, and role labels

**Files:**
- Create: `tests/president-staff-routing.test.mjs`
- Reference: `tests/app-navigation.test.mjs`, `tests/member-administration-page.test.mjs`, `tests/dues-approval-governance.test.mjs`

**Interfaces:**
- Consumes: `src/lib/app-navigation.mjs`, `src/lib/user-profile.ts`, `src/lib/dues-governance.mjs`.
- Produces: executable expectations for the naming and route changes in Tasks 7–9.

- [ ] **Step 1: Write the failing tests**

Assert exactly:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveMemberNavigationItems } from "../src/lib/app-navigation.mjs";

test("officer navigation points at /officers/members", () => {
  const items = getActiveMemberNavigationItems("active", ["executive"]);
  assert.ok(items.some((item) => item.href === "/officers/members"));
  assert.ok(!items.some((item) => item.href === "/admin/members"));
});

test("staff receive no member navigation", () => {
  assert.equal(getActiveMemberNavigationItems("staff", []), null);
});

test("president is formatted as PRESIDENT", async () => {
  const { formatPrimaryRole } = await import("../src/lib/user-profile.ts");
  assert.equal(formatPrimaryRole(["president"]), "PRESIDENT");
});
```

Add a source-text assertion that `src/app/(member)/officers/members/page.tsx` exists and `src/app/(member)/admin/members/page.tsx` contains the staff redirect, plus that `src/app/(staff)/admin/members/page.tsx` exists. All must fail now.

Also assert the audit domain mapping, which Task 9 Step 4 implements in `src/lib/audit-domains.mjs`:

```js
import { matchesAuditDomain } from "../src/lib/audit-domains.mjs";

test("audit actions map to governance domains", () => {
  assert.equal(matchesAuditDomain("member_approved", "membership"), true);
  assert.equal(matchesAuditDomain("club_role_granted", "roles"), true);
  assert.equal(matchesAuditDomain("staff_disabled", "staff"), true);
  assert.equal(matchesAuditDomain("legacy_admin_converted_to_staff", "staff"), true);
  assert.equal(matchesAuditDomain("club_payment_settings_updated", "settings"), true);
  assert.equal(matchesAuditDomain("member_approved", "roles"), false);
  assert.equal(matchesAuditDomain("anything_at_all", "all"), true);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
node --test tests/president-staff-routing.test.mjs
```

Expected: FAIL on the nav href and missing route files.

- [ ] **Step 3: Commit**

```bash
git add tests/president-staff-routing.test.mjs
git commit -m "test(app): specify officer route move and president labels"
```

---

## Phase 1 — Database

### Task 3: Staff identity, predicate, read policies, and last-staff guard

**Files:**
- Create: `supabase/migrations/20261029120000_staff_administrator_identity.sql`

**Interfaces:**
- Produces: `private.is_staff_administrator()`, `member_profiles.staff_disabled_at`, staff RLS read policies, last-staff trigger. Consumed by Tasks 5, 9, 10.

- [ ] **Step 1: Replace the status constraint**

```sql
alter table public.member_profiles
  drop constraint member_profiles_status_check;

alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending', 'active', 'deactivated', 'rejected', 'staff'));

alter table public.member_profiles
  add column staff_disabled_at timestamptz;

alter table public.member_profiles
  add constraint member_profiles_staff_disabled_check
  check (staff_disabled_at is null or status = 'staff');
```

- [ ] **Step 2: Add the predicate**

```sql
create or replace function private.is_staff_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select mp.status = 'staff' and mp.staff_disabled_at is null
      from public.member_profiles as mp
      where mp.id = (select auth.uid())
    ),
    false
  );
$function$;

revoke all on function private.is_staff_administrator()
  from public, anon, authenticated, service_role;
grant execute on function private.is_staff_administrator() to authenticated;
```

- [ ] **Step 3: Add the last-staff guard trigger**

Mirror `guard_last_active_primary_admin`: it fires on `before update of status, staff_disabled_at`, takes `private.administration_guard` `for update`, and raises `23514` with `'At least one active staff administrator must remain active.'` when `old.status = 'staff' and old.staff_disabled_at is null` and the new row is not active staff, and no other row is active staff. The existing last-admin trigger only names `update of status`; this one must name both columns or a disable would slip past it. Do not attempt self-identification in the trigger; self-disable is an RPC guard.

- [ ] **Step 4: Add the five staff read policies**

```sql
create policy member_profiles_select_staff
  on public.member_profiles for select to authenticated
  using ((select private.is_staff_administrator()));

create policy member_role_assignments_select_staff
  on public.member_role_assignments for select to authenticated
  using ((select private.is_staff_administrator()));

create policy audit_log_select_staff
  on public.audit_log for select to authenticated
  using ((select private.is_staff_administrator()));

create policy club_payment_settings_select_staff
  on public.club_payment_settings for select to authenticated
  using ((select private.is_staff_administrator()));

create policy club_attendance_settings_select_staff
  on public.club_attendance_settings for select to authenticated
  using ((select private.is_staff_administrator()));
```

- [ ] **Step 5: Run structural pgTAP assertions**

```bash
npx supabase test db supabase/tests/database/president_staff_admin_test.sql
```

Expected: status, predicate, column, and staff-read assertions PASS; president alias and RPC assertions still FAIL (Tasks 4–5).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261029120000_staff_administrator_identity.sql
git commit -m "feat(db): add staff administrator identity and read policies"
```

### Task 4: President role, compatibility alias, and inline replacements

**Files:**
- Create: `supabase/migrations/20261029121000_president_role_and_alias.sql`
- Reference (copy current bodies from):
  - `supabase/migrations/20261002135252_core_membership_roles_rls.sql`
  - `supabase/migrations/20261017230000_dues_payment_requests_governance.sql`
  - `supabase/migrations/20261025122000_dues_payment_methods.sql`
  - `supabase/migrations/20261003103000_meetings_minutes_attendance.sql`
  - `supabase/migrations/20261013033223_announcement_priority_and_expiry.sql`

**Interfaces:**
- Consumes: the current `has_club_role` body (core:145–164).
- Produces: stored role `president`; alias behavior for `backup_admin`; staff-target role triggers; president inclusion in meeting content and announcement priority gates.

- [ ] **Step 1: Update the role constraint, indexes, and staff-target guard**

```sql
alter table public.member_role_assignments
  drop constraint member_role_assignments_role_check;

alter table public.member_role_assignments
  add constraint member_role_assignments_role_check
  check (role in ('executive', 'admin', 'backup_admin', 'president'));

drop index public.member_role_assignments_one_current_backup_admin_uidx;

create unique index member_role_assignments_one_current_president_uidx
  on public.member_role_assignments (role)
  where role = 'president' and revoked_at is null;

drop index public.member_role_assignments_one_admin_identity_per_member_uidx;

create unique index member_role_assignments_one_admin_identity_per_member_uidx
  on public.member_role_assignments (member_id)
  where role in ('admin', 'president') and revoked_at is null;
```

Then add the staff-target guard. Both role tables use `member_id`, so one trigger function serves both, and it catches direct SQL as well as RPC paths:

```sql
create or replace function private.reject_staff_role_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.member_profiles as mp
    where mp.id = new.member_id and mp.status = 'staff'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff administrator accounts cannot hold club or event roles.';
  end if;
  return new;
end;
$function$;

create trigger member_role_assignments_reject_staff_target
before insert or update of member_id on public.member_role_assignments
for each row execute function private.reject_staff_role_target();

create trigger event_role_assignments_reject_staff_target
before insert or update of member_id on public.event_role_assignments
for each row execute function private.reject_staff_role_target();
```

Triggers are fired by the system and need no `execute` grant. Do not call `private.reject_staff_role_target()` from RPCs; the trigger is the single enforcement point.

- [ ] **Step 2: Replace `has_club_role` with the alias**

Keep the `is_active_club_member()` requirement. Map `'backup_admin'` to stored `'president'`, accept `'president'` directly, keep `'executive'` and `'admin'` unchanged. Do not add staff.

```sql
create or replace function private.has_club_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    p_role in ('executive', 'admin', 'backup_admin', 'president')
    and (select private.is_active_club_member())
    and exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = (select auth.uid())
        and mra.role = case
          when p_role = 'backup_admin' then 'president'
          else p_role
        end
        and mra.revoked_at is null
    ),
    false
  );
$function$;
```

- [ ] **Step 3: Replace the three inline comparisons**

Re-declare these three functions by copying their current bodies verbatim, changing only `mra.role = 'backup_admin'` to `mra.role = 'president'`:

- `private.approve_dues_payment_request` — [governance:691–697](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261017230000_dues_payment_requests_governance.sql#L691)
- `private.reject_dues_payment_request` — [governance:882–888](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261017230000_dues_payment_requests_governance.sql#L882)
- `private.record_dues_payment` (or its current owner of [payment methods:642](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261025122000_dues_payment_methods.sql#L642)) — use the version from the newest migration that defines it.

In the same bodies, replace the admin compatibility branches so that:

- a president's payment may be approved only by an executive;
- the "admins are exempt from paying dues" branch and the `v_caller_is_admin` variable are removed;
- no branch references `'admin'` for dues decisions.

- [ ] **Step 4: Give president the three admin-or-executive gates**

Re-declare, copying current bodies and adding `or (select private.has_club_role('president'))`:

- `private.can_manage_meeting_content()` — [meetings:204](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261003103000_meetings_minutes_attendance.sql#L204)
- the announcement priority checks inside `private.create_announcement` and `private.update_announcement` — [priority:67](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261013033223_announcement_priority_and_expiry.sql#L67) and [priority:182](file:///C:/Users/HomePC/Documents/codex/Carpentersfamily/supabase/migrations/20261013033223_announcement_priority_and_expiry.sql#L182)

Do not change `can_publish_communications` or the poll publish/edit guards.

- [ ] **Step 5: Rename stored roles**

```sql
update public.member_role_assignments
set role = 'president'
where role = 'backup_admin';
```

- [ ] **Step 6: Run pgTAP**

```bash
npx supabase test db supabase/tests/database/president_staff_admin_test.sql
```

Expected: alias, president index, staff-target trigger, and president-in-meeting/priority assertions PASS. Lifecycle/staff RPC assertions still FAIL.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261029121000_president_role_and_alias.sql
git commit -m "feat(db): rename backup admin to president with compatibility alias"
```

### Task 5: Lifecycle core refactor, staff RPCs, president appointment, staff provisioning

**Files:**
- Create: `supabase/migrations/20261029122000_staff_administration_rpcs.sql`
- Reference:
  - `supabase/migrations/20261002192258_auth_member_lifecycle.sql` (approve/deactivate/reactivate bodies + audit shapes)
  - `supabase/migrations/20261013035611_reject_pending_member_requests.sql` (reject body)
  - `supabase/migrations/20261012170000_club_member_role_replacement.sql` (role revoke/audit shape)

**Interfaces:**
- Consumes: `is_staff_administrator()`, president alias, `administration_guard`.
- Produces: the eight public RPCs in the Interfaces section and `provision_staff_profile`.

- [ ] **Step 1: Extract the four lifecycle cores**

For each of approve, reject, deactivate, reactivate: keep the existing validation and state transitions; move them into `private.*_member_core(p_member_id, p_reason, p_actor_id)`; replace every use of the local `v_actor_id` with `p_actor_id`. The core must not perform role checks. The existing public/member functions keep their current authorization blocks and then `perform private.<verb>_member_core(p_member_id, p_reason, v_actor_id);`.

Audit action names, before/after JSON, and reasons must remain byte-identical to today for the member path.

- [ ] **Step 2: Add the staff wrappers**

```sql
create or replace function private.staff_approve_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform private.approve_member_core(p_member_id, v_reason, v_actor_id);
end;
$function$;
```

Repeat for reject, deactivate, reactivate with the same guard shape. Add `public.staff_*` security-invoker wrappers, `revoke all` from `public, anon, service_role`, and `grant execute ... to authenticated`.

- [ ] **Step 3: Make deactivation revoke a current president**

In `private.deactivate_member_core`, before the status update, when the target has a current `president` assignment, revoke it with `revoked_at`, `revoked_by = p_actor_id`, `revoke_reason = p_reason`, and append the same `club_role_revoked` audit row shape used by `revoke_club_role`. This applies to both member and staff deactivation paths.

- [ ] **Step 4: Add president appointment and revocation**

```sql
create or replace function private.staff_appoint_president(p_member_id uuid, p_reason text)
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
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'The president must be an active member.';
  end if;

  for v_existing in
    select mra.id
    from public.member_role_assignments as mra
    where mra.role = 'president' and mra.revoked_at is null
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
      v_existing.id, p_member_id,
      pg_catalog.jsonb_build_object('role', 'president', 'active', true),
      pg_catalog.jsonb_build_object('role', 'president', 'active', false),
      v_reason
    );
  end loop;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    p_member_id, 'president', v_actor_id, v_reason
  ) returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_granted', 'member_role_assignment',
    v_assignment_id, p_member_id, null,
    pg_catalog.jsonb_build_object('role', 'president', 'active', true),
    v_reason
  );
end;
$function$;
```

`staff_revoke_president` mirrors this without the insert: lock the guard, require a current assignment, revoke it, audit, and raise `P0002` if there is none. Add security-invoker wrappers and grants for both.

- [ ] **Step 5: Add staff disable/enable**

`private.staff_set_disabled(p_staff_id, p_disabled, p_reason)`:

- requires `is_staff_administrator()`;
- raises `42501` with `'Staff cannot disable their own account.'` when `p_staff_id = auth.uid()`;
- requires the target to be `status = 'staff'`;
- locks `administration_guard for update`;
- when disabling, counts other active staff and raises `23514` with `'At least one active staff administrator must remain active.'` if zero remain;
- updates `staff_disabled_at` to `pg_catalog.clock_timestamp()` when disabling and back to `null` when enabling; `status` never changes;
- appends an audit row (`staff_disabled` / `staff_enabled`) with before/after JSON and the reason.

- [ ] **Step 6: Add provisioning**

`private.provision_staff_profile(p_user_id, p_full_name, p_username, p_actor_id, p_reason)`:

- validates name and username with the same regex/bounds as `member_profiles`;
- verifies `p_actor_id` is an active staff account;
- locks `administration_guard`;
- updates the `pending` profile to `full_name`, `username`, `profile_completed_at = clock_timestamp()`, `status = 'staff'`, `staff_disabled_at = null`;
- raises `23505` with `'That username is already in use.'` on unique violation, and `23514` when the row is not `pending`;
- appends `staff_provisioned` audit with the actor and reason.

Grant execute to `service_role` only; revoke from `public`, `anon`, `authenticated`.

- [ ] **Step 7: Lock down role changes for members**

Re-declare `private.set_club_role`, `private.grant_club_role`, and `private.revoke_club_role` from their current bodies so that member actors may only pass `'member'` or `'executive'`. Passing `'admin'`, `'backup_admin'`, or `'president'` raises `22023` with `'Invalid member or club role.'`. Replace the `'backup_admin'` checks with `'president'`. Keep the self-change block and the last-primary-admin check (dormant until conversion).

- [ ] **Step 8: Run pgTAP**

```bash
npx supabase test db supabase/tests/database/president_staff_admin_test.sql
```

Expected: all assertions PASS.

- [ ] **Step 9: Run the full database suite**

```bash
npx supabase test db
```

Expected: PASS. Existing tests that reference `backup_admin` constraints or role names must be updated in this task, deliberately:

- `supabase/tests/database/membership_roles_rls_test.sql` — `has_index(...one_current_backup_admin_uidx...)`, backup-admin role insert, and role-grant messages.
- Any other suite asserting the backup-admin label or index name (grep `backup_admin` under `supabase/tests/database`).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261029122000_staff_administration_rpcs.sql supabase/tests/database
git commit -m "feat(db): add staff lifecycle, president appointment, and provisioning RPCs"
```

### Task 6: Update the data-access matrix

**Files:**
- Modify: `docs/data-access-matrix.md`

- [ ] **Step 1: Rewrite the role and status rows**

Update the Identity rules and table operations to state:

- `member_profiles.status` includes `staff`, `staff_disabled_at` exists, and staff fail every member gate;
- roles are `executive` and `president`;
- staff read `member_profiles`, `member_role_assignments`, `audit_log`, `club_payment_settings`, `club_attendance_settings` and nothing else;
- staff lifecycle and president appointment are staff RPCs;
- the late-default row now reflects the code (admin/executive/president), correcting the existing claim that Backup Admin cannot change it.

- [ ] **Step 2: Commit**

```bash
git add docs/data-access-matrix.md
git commit -m "docs: record staff and president access matrix"
```

---

## Phase 2 — Application

### Task 7: Rename `backup_admin` to `president` across the app

**Files (modify):**
- `src/app/actions.ts` — `clubRoleRank`, `financeCorrectionAllowed`, `eventCorrectionAllowed`, `canManageStatus`, role-grant/role-change guards, `attendanceSessionControllerAllowed` (add president), payment settings, opening balance, backfill.
- `src/lib/app-navigation.mjs`
- `src/lib/user-profile.ts`
- `src/lib/dues-governance.mjs`
- `src/lib/attendance-page-access.mjs`
- `src/lib/event-card-access.mjs`
- `src/lib/member-administration-presentation.mjs`
- `src/lib/club-role-request.mjs`
- `src/lib/notifications/outbox-service.ts`
- `src/lib/email/notifications.ts`
- `src/app/(member)/dues/page.tsx`
- `src/app/(member)/attendance/page.tsx`
- `src/app/(member)/events/page.tsx`
- `src/app/(member)/events/[eventId]/dashboard/page.tsx`
- `src/app/(member)/finances/page.tsx`
- `src/app/(member)/admin/event-finance-categories/actions.ts`
- `src/components/admin/members/member-admin-types.ts`
- `src/components/admin/members/member-admin-role-banner.tsx`
- `src/components/admin/members/member-admin-page-view.tsx`
- `src/components/admin/members/club-role-form.tsx`
- `src/components/admin/members/member-admin-access-denied.tsx` (delete the simulation block)
- `src/components/home/quick-links-section.tsx`
- `src/components/home/next-up-events-card.tsx`
- `src/components/events/dashboard/voucher-inspection-drawer.tsx`
- `src/components/events/dashboard/event-dashboard-view.tsx`
- `src/components/events/dashboard/tab-audit-log.tsx`
- `src/components/events/dashboard/event-domain-ledger.tsx`
- `src/components/events/dashboard/modals/record-transaction-modal.tsx`
- `src/app/globals.css` — rename `.member-admin-role-backup_admin` to `.member-admin-role-president`

**Interfaces:**
- Consumes: the stored `president` role and alias from Task 4.
- Produces: `OfficerRole = "admin" | "president" | "executive" | "member"`; member-callable roles limited to `member` and `executive`.

- [ ] **Step 1: Mechanical rename with semantic checks**

Replace `backup_admin` with `president` in the files above. Then apply these semantic changes, which a raw replace gets wrong:

- `src/lib/club-role-request.mjs`: `ALLOWED_ROLES = new Set(["member", "executive"])`; removing `admin` and `president` prevents a member actor from attempting them.
- `src/app/actions.ts` `attendanceSessionControllerAllowed`: `roles.has("executive") || roles.has("admin") || roles.has("president")` to match the database.
- `src/lib/dues-governance.mjs`: delete the admin exemption branch; rename the backup-admin target branch to president; president payments require `executive`.
- `src/components/admin/members/club-role-form.tsx`: options are Member and Executive only; no admin or president option.
- `src/components/admin/members/member-admin-page-view.tsx`: delete the `simulatedRole` state, the role banner's role select, and the access-denied simulation props; keep the server-provided role.
- `src/app/(member)/admin/members/page.tsx`: `initialOfficerRole` uses `admin` or `president`; display label "President".

- [ ] **Step 2: Update superseded Node tests**

Update exact-string assertions in:

- `tests/app-navigation.test.mjs`
- `tests/member-administration-page.test.mjs`
- `tests/attendance-page-access.test.mjs`
- `tests/event-card-access.test.mjs`
- `tests/dues-approval-governance.test.mjs`
- `tests/event-category-permissions.test.mjs`
- `tests/executive-role-request.test.mjs`
- `tests/president-staff-routing.test.mjs` (label assertions now pass)

- [ ] **Step 3: Run checks**

```bash
npm run lint
npm test
```

Expected: PASS. Any failure should be an assertion this task supersedes, not a skipped test.

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "refactor(app): rename backup admin to president"
```

### Task 8: Move officer routes to `/officers`

**Files:**
- Move: `src/app/(member)/admin/members/**` → `src/app/(member)/officers/members/**`
- Move: `src/app/(member)/admin/event-finance-categories/**` → `src/app/(member)/officers/event-finance-categories/**`
- Create (temporary): `src/app/(member)/admin/members/page.tsx` → `redirect("/officers/members")`
- Create (permanent): `src/app/(member)/admin/event-finance-categories/page.tsx` → `redirect("/officers/event-finance-categories")`
- Modify: `src/app/actions.ts` (all `/admin/members` redirects and revalidations), `src/lib/app-navigation.mjs`, tests asserting paths.

**Interfaces:**
- Consumes: Task 7's renamed role strings.
- Produces: officer pages at `/officers/members` and `/officers/event-finance-categories`; the `/admin/*` namespace free for Task 9.

- [ ] **Step 1: Move the directories**

Use `git mv` for both trees so history follows. Fix relative imports and `revalidatePath` calls inside the moved files.

- [ ] **Step 2: Update server actions**

Replace every `/admin/members` redirect target with `/officers/members` and every `revalidatePath("/admin/members")` with `revalidatePath("/officers/members")` in `src/app/actions.ts` and `src/app/(member)/officers/event-finance-categories/actions.ts`. Run:

```bash
grep -n '"/admin/members"\|/admin/members?' src/app/actions.ts
```

Expected: only the two temporary redirect pages remain under `/admin`.

- [ ] **Step 3: Update navigation**

`src/lib/app-navigation.mjs`: officer link becomes `{ href: "/officers/members", label: "Member administration" }`.

- [ ] **Step 4: Update tests and run**

Update `tests/app-navigation.test.mjs` and `tests/member-administration-page.test.mjs` paths. Then:

```bash
node --test tests/app-navigation.test.mjs tests/member-administration-page.test.mjs
node --test --test-name-pattern="officer|president|legacy|staff receive" tests/president-staff-routing.test.mjs
npm run lint
```

Expected: PASS. The staff-route assertion in `tests/president-staff-routing.test.mjs` cannot pass until Task 9 creates `src/app/(staff)/admin/members/page.tsx`; run that file unfiltered at Task 9 Step 7.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor(app): move officer member administration to /officers"
```

### Task 9: Staff shell, panel, and server actions

**Files:**
- Create: `src/app/(staff)/layout.tsx`
- Create: `src/app/(staff)/admin/page.tsx` (overview)
- Create: `src/app/(staff)/admin/staff/page.tsx`
- Create: `src/app/(staff)/admin/governance/page.tsx`
- Create: `src/app/(staff)/admin/members/page.tsx`
- Create: `src/app/(staff)/admin/audit/page.tsx`
- Create: `src/app/(staff)/admin/settings/page.tsx`
- Create: `src/app/(staff)/admin/actions.ts`
- Create: `src/components/staff/staff-nav.tsx`
- Create: `src/components/staff/staff-overview-stats.tsx`
- Create: `src/components/staff/staff-account-table.tsx`
- Create: `src/components/staff/staff-account-form.tsx`
- Create: `src/components/staff/staff-president-card.tsx`
- Create: `src/components/staff/staff-member-table.tsx`
- Create: `src/components/staff/staff-audit-table.tsx`
- Create: `src/lib/audit-domains.mjs`
- Create: `src/components/staff/staff-settings-card.tsx`
- Delete: `src/app/(member)/admin/members/page.tsx` (the temporary redirect; the staff route replaces the path)
- Modify: `src/app/page.tsx` (staff branch), `src/components/admin/members/member-admin-page-view.tsx` (extract the member table if reused)

**Interfaces:**
- Consumes: `is_staff_administrator()` via a server-side profile read; staff RPCs from Task 5; `createSupabaseAdminClient`, `notifyMemberLifecycleChanged`.
- Produces: the `/admin` staff surface and the five server actions.

- [ ] **Step 1: Add the staff gate layout**

```tsx
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/?notice=sign-in");

  const { data: profile } = await supabase
    .from("member_profiles")
    .select("status, staff_disabled_at, full_name, username")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile || profile.status !== "staff" || profile.staff_disabled_at !== null) {
    redirect("/?notice=denied");
  }

  return (
    <div className="staff-shell">
      <StaffNav fullName={profile.full_name} username={profile.username} />
      <main>{children}</main>
    </div>
  );
}
```

Do not add staff navigation to `AppShell`; the member shell remains member-only. `StaffNav` links: Overview `/admin`, Staff `/admin/staff`, Governance `/admin/governance`, Members `/admin/members`, Audit `/admin/audit`, Settings `/admin/settings`.

- [ ] **Step 2: Add the root-page staff branch**

In `src/app/page.tsx`, immediately after the profile fetch (which must select `staff_disabled_at`):

```tsx
if (profile.status === "staff" && profile.staff_disabled_at === null) {
  redirect("/admin");
}
```

The enabled check matters: redirecting every `status = 'staff'` row would bounce a disabled account between `/` and `/admin`, since the staff layout sends it back to `/`. A disabled staff row falls through to the existing non-active screen, which offers sign-out.

- [ ] **Step 3: Build the overview and the five sections**

`/admin` is the overview: a quick-stats strip (active staff, current president name, active executives, active members, pending requests), the five most recent `audit_log` rows, and links to each section.

Section pages:

1. **`/admin/staff` — Staff accounts.** Table of `status='staff'` rows with name, username, `staff_disabled_at` rendered as "Enabled" or "Disabled since <date>", and created date; create form (email, full name, username) posting to `createStaffAction`; Disable / Re-enable buttons posting `staff_id`, `disabled`, `reason`. Disable is disabled on the signed-in row and, client-side, when only one active staff row remains; the RPC and the last-staff trigger remain the authority.
2. **`/admin/governance` — President and officers.** A Current President card showing the holder or a "Vacant" warning, with Assign / Replace and Revoke actions; an Executive table listing active members with a current `executive` assignment and grant / revoke actions. President appointment is offered only here.
3. **`/admin/members` — Member directory and lifecycle.** Searchable table of all non-staff profiles with status filter tabs (`All`, `Pending`, `Active`, `Deactivated`, `Rejected`), a profile-complete flag, requested date, and approve / reject / deactivate / reactivate actions with a required reason. Reject only for `pending`; deactivate only for `active`; reactivate only for `deactivated`.
4. **`/admin/audit` — Governance audit viewer.** Built in Step 4.
5. **`/admin/settings` — Club settings.** `club_payment_settings` with the account number masked to the last four digits and a client-side Reveal toggle; `club_attendance_settings.default_late_after_minutes`; current president; a read-only club financial lock / onboarding status line. No mutation controls in v1.

Data reads use the staff's normal client (staff read policies). Do not use the service-role client for reads.

- [ ] **Step 4: Build the governance audit viewer**

`/admin/audit` reads the latest 200 `audit_log` rows with actor and target names resolved from `member_profiles`, then filters in memory by the selected domain and a search string.

Domain tabs come from action prefixes, so keep the mapping in `src/lib/audit-domains.mjs` where `node --test` can import it directly; the table component imports the same module:

```js
export const AUDIT_DOMAINS = [
  { id: "all", label: "All" },
  { id: "membership", label: "Member lifecycle",
    test: (action) => action.startsWith("member_") },
  { id: "roles", label: "Role and president changes",
    test: (action) => action.startsWith("club_role_") },
  { id: "staff", label: "Staff accounts",
    test: (action) =>
      action.startsWith("staff_") || action === "legacy_admin_converted_to_staff" },
  { id: "settings", label: "Club settings and finance",
    test: (action) =>
      action.startsWith("club_payment_settings_") ||
      action.startsWith("club_attendance_settings_") ||
      action.startsWith("finance_") ||
      action.startsWith("opening_balance_") },
];

export function matchesAuditDomain(action, domainId) {
  const domain = AUDIT_DOMAINS.find((entry) => entry.id === domainId);
  return !domain || !domain.test || domain.test(action);
}
```

Before shipping, run `select distinct action from public.audit_log order by 1;` and confirm every existing action lands in a tab. An unmapped action appears only under **All**, which is acceptable but must be a conscious choice rather than an oversight.

Each row renders the humanised action, the actor name with a "Staff administrator" badge when the actor's `status = 'staff'` and "President" when the actor holds a current president assignment, the target name, the reason, and the timestamp in `Africa/Lagos`. Search matches actor name, target name, and reason case-insensitively over the fetched rows. The page is read-only: `audit_log` is append-only by trigger, and no write control belongs here.

- [ ] **Step 5: Write the server actions**

`src/app/(staff)/admin/actions.ts`, all starting with a shared `requireStaffActor()` that returns `{ supabase, user }` or redirects to `/?notice=denied`:

```ts
export async function createStaffAction(formData: FormData) {
  const { user } = await requireStaffActor();
  const email = formString(formData, "email", 254)?.toLowerCase();
  const fullName = formString(formData, "full_name", 120);
  const username = formString(formData, "username", 30);
  if (!email || !emailPattern.test(email) || !fullName ||
      !username || !usernamePattern.test(username)) {
    redirect("/admin/staff?notice=invalid-request");
  }

  const admin = createSupabaseAdminClient();
  if (!admin) redirect("/admin/staff?notice=configuration");

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, username },
  });
  if (error || !data.user) redirect("/admin/staff?notice=invite-failed");

  const { error: provisionError } = await admin.rpc("provision_staff_profile", {
    p_user_id: data.user.id,
    p_full_name: fullName,
    p_username: username,
    p_actor_id: user.id,
    p_reason: `Staff account created by ${user.email ?? user.id}`,
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect("/admin/staff?notice=provision-failed");
  }

  revalidatePath("/admin/staff");
  redirect("/admin/staff?notice=staff-created");
}
```

`provision_staff_profile` must be callable through the service-role client; confirm the RPC is in `public` and granted to `service_role` (Task 5 granted `private`; add the public wrapper and grant in this task if Task 5 kept it private).

Implement `setStaffDisabledAction`, `appointPresidentAction`, `revokePresidentAction`, and `staffMemberLifecycleAction` with the same actor guard, calling `staff_set_disabled`, `staff_appoint_president`, `staff_revoke_president`, and `staff_<verb>_member`. Each redirects back to its own section: `/admin/staff`, `/admin/governance`, `/admin/governance`, and `/admin/members` respectively. After a staff disable/enable, call:

```ts
await admin.auth.admin.updateUserById(staffId, {
  ban_duration: disabled ? "876000h" : "none",
});
```

If the ban call fails after the database update, redirect to `/admin/staff?notice=ban-partial` and keep the database state; do not report full success.

After lifecycle actions, call `notifyMemberLifecycleChanged` with the admin client so staff actions send the same emails as member actions.

- [ ] **Step 6: Confirm the route collision is gone**

```bash
find src/app -path '*admin*' -name 'page.tsx'
```

Expected: only `src/app/(staff)/admin/...` paths. No `(member)/admin` page remains.

- [ ] **Step 7: Run tests and lint**

```bash
node --test tests/president-staff-routing.test.mjs
npm run lint
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(app): add staff administration panel at /admin"
```

---

## Phase 3 — Conversion and hardening

### Task 10: Conversion runbook

**Files:**
- Create: `docs/president-staff-conversion.md`

**Interfaces:**
- Consumes: schema from Tasks 3–5.
- Produces: an operator-executable, reversible-until-commit conversion procedure.

- [ ] **Step 1: Write preflight queries**

Include read-only queries listing each current admin (profile, email, current roles, dues state, membership period start), listing every current `event_role_assignments` row held by a converted admin including rows on archived events, and confirming two preconditions:

- Each converted admin has exactly one open `dues_membership_periods` row. The status update closes it, and `member_profiles_track_dues_period` raises `23514` ("An active member dues period is missing.") when none is open.
- No current president exists where that would conflict.

- [ ] **Step 2: Write the transaction**

The block must, in order:

1. `perform 1 from private.administration_guard where singleton_id = true for update;`
2. `alter table public.member_profiles disable trigger member_profiles_preserve_last_primary_admin;`
3. `alter table public.event_role_assignments disable trigger event_role_assignments_write_guard;` and `alter table public.event_role_assignments disable trigger event_role_assignments_past_archive_mutation_guard;` — the write guard requires a live officer JWT and `revoked_by = auth.uid()`, which an operator session cannot satisfy, and the archive guard rejects changes tied to archived events.
4. Revoke every current `member_role_assignments` row for each converted member, setting `revoked_at`, `revoked_by`, and `revoke_reason` together (the table's revocation-fields check requires all three), and append one `club_role_revoked` audit row per assignment.
5. Revoke every current `event_role_assignments` row for each converted member the same way. `event_role_assignments_revocation_fields_check` also requires all three columns. This step is mandatory: a converted account that stayed an event lead would keep event authority without any member status.
6. `update member_profiles set status = 'staff', staff_disabled_at = null, profile_completed_at = coalesce(profile_completed_at, clock_timestamp()) where id = <uuid>;` This fires `member_profiles_track_dues_period`, which closes the member's open dues period; confirm the preflight found one.
7. Insert `legacy_admin_converted_to_staff` audit rows naming the operator, with action `event_role_revoked` / entity type `event_role_assignment` where applicable.
8. `alter table public.event_role_assignments enable trigger event_role_assignments_write_guard;` and re-enable `event_role_assignments_past_archive_mutation_guard`.
9. `alter table public.member_profiles enable trigger member_profiles_preserve_last_primary_admin;`
10. Post-condition checks inside the transaction that raise if any current `admin` assignment remains, if any current event role remains for a converted account, or if any converted row is not active staff (`status = 'staff' and staff_disabled_at is null`).

- [ ] **Step 3: Write post-checks and rollback**

Post-checks: zero current admin rows; zero current event role rows for the converted accounts; `is_staff_administrator()` true for the converted account; `/admin` loads; `/officers/members` redirects for that account; a member account still sees no staff data. Rollback: a documented reverse block (status back to `active`, re-grant `admin`, re-enable trigger) that warns it restores no dues period and should be used only before the change is announced.

- [ ] **Step 4: Commit**

```bash
git add docs/president-staff-conversion.md
git commit -m "docs: add president and staff conversion runbook"
```

### Task 11: Post-conversion hardening

**Files:**
- Create: `supabase/migrations/20261029123000_remove_legacy_admin_role.sql`
- Modify: `supabase/tests/database/president_staff_admin_test.sql` (add assertions)
- Modify: `docs/data-access-matrix.md`

**Interfaces:**
- Consumes: Task 10 confirmed complete (no current admin assignments).
- Produces: `has_club_role('admin')` permanently false; legacy admin removed from member-callable allowlists; last-admin trigger dropped.

- [ ] **Step 1: Add the failing assertions**

In pgTAP, add: `has_club_role('admin')` is false for a member holding a legacy admin row; `set_club_role` rejects `'admin'`; `member_profiles_preserve_last_primary_admin` no longer exists as a trigger.

- [ ] **Step 2: Write the migration**

- Re-declare `has_club_role` so `'admin'` is excluded from the accepted list (and never matches a stored role).
- Remove `'admin'` and `'backup_admin'` from the `grant_club_role`, `revoke_club_role`, and `set_club_role` accepted values.
- Drop the `member_profiles_preserve_last_primary_admin` trigger and `private.guard_last_active_primary_admin()`.
- Keep the last-staff trigger.
- Optionally narrow the role check constraint to `('executive', 'president')` only after confirming no historical `admin`/`backup_admin` rows remain; if any remain, keep the wider constraint and note it in the matrix.

- [ ] **Step 3: Verify**

```bash
npx supabase test db
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261029123000_remove_legacy_admin_role.sql supabase/tests/database docs/data-access-matrix.md
git commit -m "chore(db): retire legacy admin role after conversion"
```

---

## Phase 4 — End-to-end verification

### Task 12: Release gate

**Files:**
- Modify: any test whose assertion changed during Tasks 7–9.

- [ ] **Step 1: Run the full automated suite**

```bash
npm run lint
npm test
npx supabase test db
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Browser matrix**

On the production build at `127.0.0.1:3001` (see the local verification notes), verify each row:

| Actor | Expected |
| --- | --- |
| Staff, enabled | Sign in lands on `/admin`; member pages redirect away; overview stats, staff accounts, president governance, directory, lifecycle, audit viewer, and settings all work |
| Staff, disabled | Sign-in denied; no panel |
| President | `/officers/members` works; finance corrections, dues approvals, event reopen/refund, minutes, late default, announcement priority work |
| Executive | `/officers/members` shows approve/reject only; no finance correction |
| Member | `/officers/members` and `/admin` both denied; member features unchanged |
| Pending | No member or staff surface |
| Officer visiting `/admin/members` | Redirected to `/officers/members` |

Also verify: last staff cannot be disabled; staff cannot disable self; a disabled staff account is refused at `/` and at `/admin`; no staff account can acquire a club or event role (a direct SQL insert is rejected by trigger); a president's dues request cannot be approved by the president; deactivating a president revokes the role; the audit viewer's domain tabs map every action present in `audit_log`, and staff actors are labelled "Staff administrator".

- [ ] **Step 3: Commit any final test updates**

```bash
git add tests supabase/tests
git commit -m "test: align suites with president and staff model"
```

---

## Rollout notes

- Ship Tasks 1–9 as one release with `admin` still valid. Do not ship Task 11 until Task 10 is executed and verified.
- Task 10 touches production identities. It is destructive and must be run by the operator with explicit approval, outside a migration deploy.
- Every migration in this plan is forward-only. Rollback is a compensating migration; the conversion rollback is documented but not automatic.
- If the staff panel is deferred after Task 9, the conversion must also be deferred; otherwise the club would have no primary officer mechanism.
