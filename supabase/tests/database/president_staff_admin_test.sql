begin;

select no_plan();

-- ===========================================================================
-- Structural checks. These run before the fixtures so the suite fails
-- legibly before the reference migrations exist.
-- ===========================================================================

select ok(
  (
    select pg_catalog.pg_get_constraintdef(c.oid) like '%staff%'
    from pg_catalog.pg_constraint as c
    where c.conname = 'member_profiles_status_check'
      and c.conrelid = 'public.member_profiles'::regclass
  ),
  'member_profiles_status_check accepts the staff status'
);

select has_column(
  'public', 'member_profiles', 'staff_disabled_at',
  'staff accounts track a disabled timestamp'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as c
    where c.conname = 'member_profiles_staff_disabled_check'
      and c.conrelid = 'public.member_profiles'::regclass
      and pg_catalog.pg_get_constraintdef(c.oid) like '%staff%'
  ),
  'staff_disabled_at is constrained to staff rows'
);

select has_function(
  'private', 'is_staff_administrator', array[]::text[],
  'the staff predicate exists'
);

select has_trigger(
  'public', 'member_profiles',
  'member_profiles_preserve_last_active_staff',
  'the last active staff administrator is protected'
);

select has_function(
  'public', 'staff_approve_member', array['uuid', 'text'],
  'the staff approve RPC exists'
);
select has_function(
  'public', 'staff_reject_member', array['uuid', 'text'],
  'the staff reject RPC exists'
);
select has_function(
  'public', 'staff_deactivate_member', array['uuid', 'text'],
  'the staff deactivate RPC exists'
);
select has_function(
  'public', 'staff_reactivate_member', array['uuid', 'text'],
  'the staff reactivate RPC exists'
);
select has_function(
  'public', 'staff_appoint_president', array['uuid', 'text'],
  'the president appointment RPC exists'
);
select has_function(
  'public', 'staff_revoke_president', array['uuid', 'text'],
  'the president revocation RPC exists'
);
select has_function(
  'public', 'staff_set_disabled', array['uuid', 'boolean', 'text'],
  'the staff disable RPC exists'
);
select has_function(
  'private', 'provision_staff_profile',
  array['uuid', 'text', 'text', 'uuid', 'text'],
  'the staff provisioning RPC exists'
);

select has_index(
  'public', 'member_role_assignments',
  'member_role_assignments_one_current_president_uidx',
  'at most one current president exists'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'member_role_assignments_one_current_backup_admin_uidx'
  ),
  'the legacy backup admin index is gone'
);
select ok(
  (
    select pg_catalog.pg_get_constraintdef(c.oid) like '%president%'
    from pg_catalog.pg_constraint as c
    where c.conname = 'member_role_assignments_role_check'
      and c.conrelid = 'public.member_role_assignments'::regclass
  ),
  'the role constraint accepts president'
);

select has_trigger(
  'public', 'member_role_assignments',
  'member_role_assignments_reject_staff_target',
  'staff cannot gain a club role'
);
select has_trigger(
  'public', 'event_role_assignments',
  'event_role_assignments_reject_staff_target',
  'staff cannot gain an event role'
);

-- ===========================================================================
-- Fixtures. Inserted as the migration test owner and rolled back.
-- ===========================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'president-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'executive-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'member-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'pending-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'staff-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'staff-two@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'staff-disabled@example.test', '', '{}'::jsonb, '{}'::jsonb, now());

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000001' then 'Admin One'
      when '00000000-0000-0000-0000-000000000002' then 'President One'
      when '00000000-0000-0000-0000-000000000003' then 'Executive One'
      when '00000000-0000-0000-0000-000000000004' then 'Member One'
      when '00000000-0000-0000-0000-000000000005' then 'Pending One'
      when '00000000-0000-0000-0000-000000000006' then 'Staff One'
      when '00000000-0000-0000-0000-000000000007' then 'Staff Two'
      else 'Disabled Staff'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000001' then 'admin_one'
      when '00000000-0000-0000-0000-000000000002' then 'president_one'
      when '00000000-0000-0000-0000-000000000003' then 'executive_one'
      when '00000000-0000-0000-0000-000000000004' then 'member_one'
      when '00000000-0000-0000-0000-000000000005' then 'pending_one'
      when '00000000-0000-0000-0000-000000000006' then 'staff_one'
      when '00000000-0000-0000-0000-000000000007' then 'staff_two'
      else 'staff_disabled'
    end,
    status = case
      when id in (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004'
      ) then 'active'
      when id in (
        '00000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000008'
      ) then 'staff'
      else 'pending'
    end,
    profile_completed_at = now(),
    staff_disabled_at = case
      when id = '00000000-0000-0000-0000-000000000008' then now()
      else null
    end
where id between '00000000-0000-0000-0000-000000000001'::uuid
             and '00000000-0000-0000-0000-000000000008'::uuid;

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000001', 'admin', '00000000-0000-0000-0000-000000000001', 'Initial test administrator'),
  ('00000000-0000-0000-0000-000000000003', 'executive', '00000000-0000-0000-0000-000000000001', 'Initial test executive');

select set_config('app.notification_insert_write', 'on', true);
insert into public.notifications (
  recipient_id, category, title, body, source_type, dedupe_key
) values (
  '00000000-0000-0000-0000-000000000001', 'announcement',
  'Staff isolation fixture', 'A fixture row staff must not be able to read.',
  'audit', 'fixture:staff-isolation'
);
select set_config('app.notification_insert_write', 'off', true);

-- ===========================================================================
-- Owner-level guards
-- ===========================================================================

select throws_ok(
  $$insert into public.member_role_assignments
      (member_id, role, assigned_by, grant_reason)
    values ('00000000-0000-0000-0000-000000000006', 'executive',
            '00000000-0000-0000-0000-000000000001', 'Staff promotion attempt')$$,
  '23514',
  'Staff administrator accounts cannot hold club or event roles.',
  'staff cannot be given a club role by direct insert'
);

-- Staff isolation as seen by the staff session.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000006', true);

select is(
  (select private.is_staff_administrator()),
  true,
  'active staff pass the staff predicate'
);
select is(
  (select private.is_active_club_member()),
  false,
  'staff are not active club members'
);
select is(
  (select private.has_club_role('president')),
  false,
  'staff hold no club role'
);
select is(
  (select count(*) from public.member_profiles
   where id between '00000000-0000-0000-0000-000000000001'::uuid
                and '00000000-0000-0000-0000-000000000008'::uuid),
  8::bigint,
  'staff can read every fixture profile including pending and disabled staff'
);
select is(
  (select count(*) from public.notifications),
  0::bigint,
  'staff cannot read member notifications even when rows exist'
);
select ok(
  has_column_privilege(
    'authenticated', 'public.club_attendance_settings', 'changed_at', 'SELECT'
  ),
  'the staff settings page can read the attendance settings change time'
);

select throws_ok(
  $$update public.member_profiles set full_name = 'Renamed' where id = auth.uid()$$,
  '42501',
  'permission denied for table member_profiles',
  'staff cannot update profiles directly'
);

-- President fixture is inserted after the staff block so the staff
-- assertions run even before the president role exists.
reset role;
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values ('00000000-0000-0000-0000-000000000002', 'president',
        '00000000-0000-0000-0000-000000000001', 'Initial test president');

select throws_ok(
  $$insert into public.member_role_assignments
      (member_id, role, assigned_by, grant_reason)
    values ('00000000-0000-0000-0000-000000000003', 'president',
            '00000000-0000-0000-0000-000000000001', 'Second president attempt')$$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_current_president_uidx"',
  'only one current president is allowed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000006', true);

select throws_ok(
  $$select public.staff_set_disabled('00000000-0000-0000-0000-000000000006', true, 'Self-disable')$$,
  '42501',
  'Staff cannot disable their own account.',
  'staff cannot disable self'
);
select lives_ok(
  $$select public.staff_set_disabled('00000000-0000-0000-0000-000000000007', true, 'Coverage gap')$$,
  'staff can disable another staff account'
);
select is(
  (select count(*) from public.member_profiles
   where status = 'staff' and staff_disabled_at is null),
  1::bigint,
  'one active staff administrator remains'
);

reset role;
select throws_ok(
  $$update public.member_profiles
    set staff_disabled_at = pg_catalog.clock_timestamp()
    where id = '00000000-0000-0000-0000-000000000006'$$,
  '23514',
  'At least one active staff administrator must remain active.',
  'a direct update cannot disable the last active staff'
);

-- Staff approve a pending member and are recorded as the actor.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000006', true);
select lives_ok(
  $$select public.staff_approve_member('00000000-0000-0000-0000-000000000005', 'Profile verified by staff')$$,
  'staff can approve a pending member'
);
select is(
  (select status from public.member_profiles
   where id = '00000000-0000-0000-0000-000000000005'),
  'active'::text,
  'staff approval activates the member'
);
select is(
  (select actor_id from public.audit_log
   where action = 'member_approved'
     and target_member_id = '00000000-0000-0000-0000-000000000005'
   order by occurred_at desc
   limit 1),
  '00000000-0000-0000-0000-000000000006'::uuid,
  'the staff actor is recorded in the audit log'
);
reset role;

-- Disabled staff fail the predicate.
set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000008', true);
select is(
  (select private.is_staff_administrator()),
  false,
  'a disabled staff account fails the staff predicate'
);
reset role;

-- ===========================================================================
-- President behaviour
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000002', true);

select is(
  (select private.has_club_role('backup_admin')),
  true,
  'legacy backup_admin checks resolve to president'
);
select is(
  (select private.has_club_role('president')),
  true,
  'the president role resolves directly'
);
select is(
  (select private.has_club_role('admin')),
  false,
  'president is not the legacy admin role'
);

select throws_ok(
  $$select public.staff_appoint_president('00000000-0000-0000-0000-000000000004', 'Self-appointment attempt')$$,
  '42501',
  'An active staff administrator account is required.',
  'president cannot appoint a president'
);
select throws_ok(
  $$select public.staff_set_disabled('00000000-0000-0000-0000-000000000007', true, 'Not allowed')$$,
  '42501',
  'An active staff administrator account is required.',
  'president cannot disable staff'
);

select lives_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000004', 'executive', 'Appointed to the welcome committee')$$,
  'president can grant Executive status'
);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000004', 'admin', 'Legacy admin attempt')$$,
  '22023',
  'Invalid member or club role.',
  'members can no longer assign the legacy admin role'
);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000002', 'executive', 'Self promotion')$$,
  '42501',
  'Administrators cannot change their own club role.',
  'an officer cannot change their own role'
);
reset role;

select * from finish();
rollback;
