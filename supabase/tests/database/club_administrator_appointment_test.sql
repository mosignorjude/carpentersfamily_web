begin;

select no_plan();

-- ===========================================================================
-- Fixtures. Each suite reserves its own auth.users block; this one uses
-- …0501-…0509. member_profiles rows are created by the
-- on_auth_user_created_member_profile trigger. The metadata is left empty on
-- purpose: with no full_name or username the trigger creates an *incomplete*
-- profile (profile_completed_at is null), and the identity update below can
-- then name it. A profile that is already completed is immutable, so seeding
-- metadata here would trip member_profiles_keep_completed_identity.
-- ===========================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000501', 'authenticated', 'authenticated', 'ca-staff@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000502', 'authenticated', 'authenticated', 'ca-staff-off@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000503', 'authenticated', 'authenticated', 'ca-a@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000504', 'authenticated', 'authenticated', 'ca-b@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000505', 'authenticated', 'authenticated', 'ca-president@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000506', 'authenticated', 'authenticated', 'ca-exec@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000507', 'authenticated', 'authenticated', 'ca-member@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000508', 'authenticated', 'authenticated', 'ca-pending@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000509', 'authenticated', 'authenticated', 'ca-exit@example.test', '', '{}'::jsonb, '{}'::jsonb, now());

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000501' then 'Records Staff'
      when '00000000-0000-0000-0000-000000000502' then 'Disabled Staff'
      when '00000000-0000-0000-0000-000000000503' then 'First Administrator'
      when '00000000-0000-0000-0000-000000000504' then 'Second Administrator'
      when '00000000-0000-0000-0000-000000000505' then 'Sitting President'
      when '00000000-0000-0000-0000-000000000506' then 'Fixture Executive'
      when '00000000-0000-0000-0000-000000000507' then 'Plain Member'
      when '00000000-0000-0000-0000-000000000508' then 'Pending Applicant'
      else 'Deactivation Target'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000501' then 'ca_staff'
      when '00000000-0000-0000-0000-000000000502' then 'ca_staff_off'
      when '00000000-0000-0000-0000-000000000503' then 'ca_admin_one'
      when '00000000-0000-0000-0000-000000000504' then 'ca_admin_two'
      when '00000000-0000-0000-0000-000000000505' then 'ca_pres'
      when '00000000-0000-0000-0000-000000000506' then 'ca_exec'
      when '00000000-0000-0000-0000-000000000507' then 'ca_member'
      when '00000000-0000-0000-0000-000000000508' then 'ca_pending'
      else 'ca_exit'
    end,
    status = case
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
