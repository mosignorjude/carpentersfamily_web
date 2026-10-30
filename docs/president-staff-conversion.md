# President and Staff Conversion Runbook

Operator procedure for retiring the legacy **admin** role and turning each current admin
account into a **staff administrator** account. This is the one-time production step
behind the identity model shipped in Tasks 3–9:

- **President** runs the club: member administration, dues, finance corrections, events.
- **Staff administrator** runs the system: appoints the President, manages accounts,
  reads the audit history.

This runbook is destructive to role history (it adds rows; it never deletes any). Run it
only after the new application code is deployed, and only with explicit approval from the
club owner. Do not run it against local or preview databases.

## What this procedure does and does not do

Does:

1. Revokes every current club role (`admin`, `backup_admin`, `executive`, `president`)
   held by each converted account, with an audited reason.
2. Revokes every current event role held by each converted account, including rows on
   archived events.
3. Changes each converted profile from `status = 'active'` to `status = 'staff'`.
   The profile-status trigger closes the member's open dues membership period.
4. Writes `club_role_revoked`, `event_role_revoked`, and
   `legacy_admin_converted_to_staff` audit rows naming the operator.

Does not:

- Appoint a President. After conversion, sign in as a converted staff account and appoint
  one at `/admin/governance`.
- Delete any historical row. Every revocation is an update plus an audit row.
- Touch `auth.users` rows, passwords, or email addresses.
- Restore role history on rollback (see the rollback block).

## Prerequisites

- [ ] The code from Tasks 3–9 is deployed to production. The staff panel at `/admin`
      must exist before conversion, or a converted account lands on the member sign-in
      page with no way into the panel.
- [ ] Migrations up to `20261029122000_staff_administration_rpcs.sql` are applied.
- [ ] You can open the Supabase SQL editor for the production project (runs as the
      `postgres` owner, which the `disable trigger` statements require). Never paste a
      service-role key into chat or a document.
- [ ] You have the profile UUIDs of the accounts to convert, and one operator profile
      UUID. The operator must be a real `member_profiles` row (for example, the most
      senior admin being converted); `audit_log.actor_id` and `revoked_by` are foreign
      keys to that table.
- [ ] You have run the preflight queries below and recorded the output.
- [ ] Officers have been told to stop making membership or event-role changes. The
      transaction is atomic, but it does not wait for in-flight operator screens.

## Step 1 — Preflight queries (read-only)

Run these and keep the output. Any surprise here is cheaper to resolve before the
conversion than after.

### 1.1 Admins to convert

```sql
select
  mp.id,
  mp.full_name,
  mp.username,
  mp.status,
  au.email,
  au.email_confirmed_at,
  mp.profile_completed_at,
  (
    select array_agg(mra.role order by mra.role)
    from public.member_role_assignments as mra
    where mra.member_id = mp.id and mra.revoked_at is null
  ) as current_roles,
  (
    select count(*)
    from public.dues_membership_periods as dmp
    where dmp.member_id = mp.id and dmp.ends_before_month is null
  ) as open_dues_periods,
  (
    select min(dmp.starts_month)
    from public.dues_membership_periods as dmp
    where dmp.member_id = mp.id
  ) as membership_started_month
from public.member_profiles as mp
join auth.users as au on au.id = mp.id
where exists (
  select 1
  from public.member_role_assignments as mra
  where mra.member_id = mp.id
    and mra.role in ('admin', 'backup_admin')
    and mra.revoked_at is null
)
order by mp.full_name;
```

### 1.2 Current event roles held by those accounts (including archived events)

```sql
select
  era.id as assignment_id,
  era.member_id,
  mp.full_name,
  era.event_id,
  e.title as event_title,
  e.status as event_status,
  e.archived_at,
  era.role,
  era.assigned_at
from public.event_role_assignments as era
join public.member_profiles as mp on mp.id = era.member_id
join public.events as e on e.id = era.event_id
where era.revoked_at is null
  and era.member_id in (
    select mra.member_id
    from public.member_role_assignments as mra
    where mra.role in ('admin', 'backup_admin') and mra.revoked_at is null
  )
order by mp.full_name, e.starts_at desc;
```

Every row here must be revoked by the conversion. A converted account that kept an event
role would hold event authority with no member account behind it.

### 1.3 Preconditions

Run each query; the expected result is written above it. In the 1.1 output every account
must show `status = active` and a non-null `profile_completed_at`; if not, stop and
resolve that account separately.

Each converted admin must have **exactly one open dues period**. The status update closes
it, and `member_profiles_track_dues_period` raises `23514`
("An active member dues period is missing.") when none is open.

```sql
-- Expected: no rows.
select mp.id, mp.full_name, count(dmp.id) as open_periods
from public.member_profiles as mp
left join public.dues_membership_periods as dmp
  on dmp.member_id = mp.id and dmp.ends_before_month is null
where exists (
  select 1
  from public.member_role_assignments as mra
  where mra.member_id = mp.id
    and mra.role in ('admin', 'backup_admin')
    and mra.revoked_at is null
)
group by mp.id, mp.full_name
having count(dmp.id) <> 1;
```

No converted account may already hold the President role. The conversion revokes all
roles, so a President who is also an admin would silently lose the club role.

```sql
-- Expected: no rows.
select mp.id, mp.full_name
from public.member_profiles as mp
where exists (
  select 1 from public.member_role_assignments as mra
  where mra.member_id = mp.id and mra.role = 'president' and mra.revoked_at is null
)
and exists (
  select 1 from public.member_role_assignments as mra
  where mra.member_id = mp.id
    and mra.role in ('admin', 'backup_admin')
    and mra.revoked_at is null
);
```

If either query returns rows, stop and resolve the data issue first.

## Step 2 — The conversion transaction

Replace every `<...>` placeholder. Keep the whole block in one transaction: any failed
assertion or trigger rolls back every step, including the trigger disables.

```sql
begin;

-- 1. List the accounts to convert.
create temp table conversion_targets (
  member_id uuid primary key
) on commit drop;

insert into conversion_targets (member_id) values
  ('<uuid-1>'),
  ('<uuid-2>');

-- 2. Operator profile used for revoked_by and audit_log.actor_id.
create temp table conversion_operator (
  member_id uuid primary key
) on commit drop;

insert into conversion_operator (member_id) values ('<operator-uuid>');

-- 3. Snapshot the roles being retired, for the conversion audit row.
create temp table conversion_role_snapshot on commit drop as
select
  mra.member_id,
  jsonb_agg(
    jsonb_build_object('role', mra.role, 'assigned_at', mra.assigned_at)
    order by mra.assigned_at
  ) as roles
from public.member_role_assignments as mra
where mra.member_id in (select member_id from conversion_targets)
  and mra.role in ('admin', 'backup_admin')
  and mra.revoked_at is null
group by mra.member_id;

-- 4. Serialize with every role RPC and every admin/staff guard.
select 1
from private.administration_guard
where singleton_id = true
for update;

-- 5. Allow converting the last remaining primary admin.
alter table public.member_profiles
  disable trigger member_profiles_preserve_last_primary_admin;

-- 6. Event-role guards require a live officer JWT and reject archived events;
--    an operator session satisfies neither.
alter table public.event_role_assignments
  disable trigger event_role_assignments_write_guard;
alter table public.event_role_assignments
  disable trigger event_role_assignments_past_archive_mutation_guard;

-- 7. Revoke current club roles and audit each one.
with revoked as (
  update public.member_role_assignments as mra
  set revoked_at = clock_timestamp(),
      revoked_by = (select member_id from conversion_operator),
      revoke_reason =
        'Legacy admin role retired; the account is now a staff administrator.'
  where mra.member_id in (select member_id from conversion_targets)
    and mra.revoked_at is null
  returning mra.id, mra.member_id, mra.role
)
insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id,
  before_data, after_data, reason
)
select
  (select member_id from conversion_operator),
  'club_role_revoked',
  'member_role_assignment',
  revoked.id,
  revoked.member_id,
  jsonb_build_object('role', revoked.role, 'active', true),
  jsonb_build_object('role', revoked.role, 'active', false),
  'Legacy admin role retired; the account is now a staff administrator.'
from revoked;

-- 8. Revoke current event roles and audit each one.
with revoked as (
  update public.event_role_assignments as era
  set revoked_at = clock_timestamp(),
      revoked_by = (select member_id from conversion_operator),
      revoke_reason =
        'Account converted to a staff administrator; event roles do not apply to staff.'
  where era.member_id in (select member_id from conversion_targets)
    and era.revoked_at is null
  returning era.id, era.member_id, era.role
)
insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id,
  before_data, after_data, reason
)
select
  (select member_id from conversion_operator),
  'event_role_revoked',
  'event_role_assignment',
  revoked.id,
  revoked.member_id,
  jsonb_build_object('role', revoked.role, 'active', true),
  jsonb_build_object('role', revoked.role, 'active', false),
  'Account converted to a staff administrator; event roles do not apply to staff.'
from revoked;

-- 9. Convert the profiles. This closes each open dues period.
update public.member_profiles as mp
set status = 'staff',
    staff_disabled_at = null,
    profile_completed_at = coalesce(mp.profile_completed_at, clock_timestamp())
where mp.id in (select member_id from conversion_targets);

-- 10. Audit the conversion.
insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id,
  before_data, after_data, reason
)
select
  (select member_id from conversion_operator),
  'legacy_admin_converted_to_staff',
  'member_profile',
  mp.id,
  mp.id,
  jsonb_build_object(
    'status', 'active',
    'roles', coalesce(snapshot.roles, '[]'::jsonb)
  ),
  jsonb_build_object('status', 'staff', 'staff_disabled_at', null),
  'Legacy admin account converted to a staff administrator.'
from public.member_profiles as mp
join conversion_targets as t on t.member_id = mp.id
left join conversion_role_snapshot as snapshot on snapshot.member_id = mp.id;

-- 11. Re-enable the guards before the assertions run.
alter table public.event_role_assignments
  enable trigger event_role_assignments_write_guard;
alter table public.event_role_assignments
  enable trigger event_role_assignments_past_archive_mutation_guard;

alter table public.member_profiles
  enable trigger member_profiles_preserve_last_primary_admin;

-- 12. Post-conditions. Any failure aborts the whole transaction.
do $$
begin
  if exists (
    select 1
    from public.member_role_assignments as mra
    where mra.role in ('admin', 'backup_admin')
      and mra.revoked_at is null
  ) then
    raise exception 'Conversion failed: an admin role is still current.';
  end if;

  if exists (
    select 1
    from public.event_role_assignments as era
    join conversion_targets as t on t.member_id = era.member_id
    where era.revoked_at is null
  ) then
    raise exception 'Conversion failed: an event role is still current for a converted account.';
  end if;

  if exists (
    select 1
    from public.member_profiles as mp
    join conversion_targets as t on t.member_id = mp.id
    where mp.status <> 'staff' or mp.staff_disabled_at is not null
  ) then
    raise exception 'Conversion failed: a converted profile is not active staff.';
  end if;
end
$$;

commit;
```

## Step 3 — Post-conversion checks

Database:

```sql
-- Expected: no rows. No account still holds the legacy admin identity.
select mra.member_id, mra.role
from public.member_role_assignments as mra
where mra.role in ('admin', 'backup_admin') and mra.revoked_at is null;

-- Expected: one row per converted account, status = staff, staff_disabled_at null.
select mp.id, mp.full_name, mp.status, mp.staff_disabled_at
from public.member_profiles as mp
where mp.status = 'staff'
order by mp.full_name;

-- Expected: the conversion audit trail is present.
select action, entity_type, target_member_id, reason, occurred_at
from public.audit_log
where action in (
  'legacy_admin_converted_to_staff',
  'club_role_revoked',
  'event_role_revoked'
)
order by occurred_at desc
limit 20;
```

Application:

- [ ] Sign in as a converted account. It lands on `/admin`, not the member home page.
- [ ] `/admin/staff`, `/admin/governance`, `/admin/members`, `/admin/audit`, and
      `/admin/settings` all load for that account.
- [ ] `/officers/members` redirects that account away (staff are not members).
- [ ] `/admin/members` still lists the club's member accounts.
- [ ] Sign in as an ordinary member: no `/admin` access, member features unchanged.
- [ ] At `/admin/governance`, appoint a President. The appointment now unblocks the
      officer workspace for that officer.
- [ ] At `/admin/staff`, invite a second staff administrator as a backup.

## Rollback

Rollback is only for a conversion announced to nobody yet. It restores *access*, not
history:

- It re-grants the `admin` role as a **new** assignment; the original assignment stays
  revoked.
- It does not recreate revoked event roles, and it does not restore the closed dues
  membership period. Re-activating the account opens a fresh dues period for the current
  month, so dues continuity restarts at the rollback month.

```sql
begin;

create temp table rollback_targets (
  member_id uuid primary key
) on commit drop;

insert into rollback_targets (member_id) values ('<uuid-1>');

create temp table rollback_operator (
  member_id uuid primary key
) on commit drop;

insert into rollback_operator (member_id) values ('<operator-uuid>');

select 1
from private.administration_guard
where singleton_id = true
for update;

-- Converting the last active staff account back to a member trips the last-staff guard.
alter table public.member_profiles
  disable trigger member_profiles_preserve_last_active_staff;

-- Revert the status first. The role insert below then targets an active member, so
-- member_role_assignments_reject_staff_target passes without being disabled.
update public.member_profiles as mp
set status = 'active',
    staff_disabled_at = null
where mp.id in (select member_id from rollback_targets);

insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
)
select
  t.member_id,
  'admin',
  (select member_id from rollback_operator),
  'Rollback: restore the legacy admin role after a staff conversion.'
from rollback_targets as t;

insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id,
  before_data, after_data, reason
)
select
  (select member_id from rollback_operator),
  'legacy_admin_conversion_rolled_back',
  'member_profile',
  t.member_id,
  t.member_id,
  jsonb_build_object('status', 'staff'),
  jsonb_build_object('status', 'active', 'roles', jsonb_build_array('admin')),
  'Rollback: staff conversion reversed before announcement.'
from rollback_targets as t;

alter table public.member_profiles
  enable trigger member_profiles_preserve_last_active_staff;

commit;
```

After rollback, the account signs in to the member home page again and keeps the new
dues period opened by the status change. Event roles stay revoked; re-assign them from
the officer event workspace if needed.

## After conversion

1. Confirm `/admin/governance` shows a President. The President can then grant Executive
   roles and use the officer workspace.
2. Retire the follow-up hardening task only once the post-checks above pass: removing
   `'admin'` from the role allowlists, dropping the last-primary-admin trigger, and
   narrowing the role check constraint.
3. Update the data-access matrix if any operator account IDs changed.
