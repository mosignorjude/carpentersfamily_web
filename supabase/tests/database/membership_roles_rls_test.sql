begin;

select plan(53);

-- Structural checks: all public tables have deliberate grants and forced RLS.
select has_table('public', 'member_profiles', 'member profiles table exists');
select has_table('public', 'member_role_assignments', 'role assignment history table exists');
select has_table('public', 'audit_log', 'audit log table exists');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'member_profiles'),
  'member_profiles has forced RLS'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'member_role_assignments'),
  'member_role_assignments has forced RLS'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'audit_log'),
  'audit_log has forced RLS'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'member_profiles'
      and column_name = 'email'
  ),
  'member email is not in the Data API profile table'
);

select ok(
  not has_table_privilege('anon', 'public.member_profiles', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no profile table access'
);
select ok(
  not has_table_privilege('anon', 'public.member_role_assignments', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no role history access'
);
select ok(
  not has_table_privilege('anon', 'public.audit_log', 'SELECT,INSERT,UPDATE,DELETE'),
  'anon has no audit log access'
);
select ok(
  has_table_privilege('authenticated', 'public.member_profiles', 'SELECT')
  and not has_table_privilege('authenticated', 'public.member_profiles', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.member_role_assignments', 'SELECT')
  and not has_table_privilege('authenticated', 'public.member_role_assignments', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.audit_log', 'SELECT')
  and not has_table_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE,DELETE'),
  'authenticated has read-only table grants'
);
select ok(
  not has_function_privilege('anon', 'public.grant_club_role(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.revoke_club_role(uuid,text,text)', 'EXECUTE'),
  'anon cannot execute role mutation RPCs'
);
select ok(
  not (select p.prosecdef
       from pg_catalog.pg_proc as p
       where p.oid = 'public.grant_club_role(uuid,text,text)'::regprocedure)
  and not (select p.prosecdef
           from pg_catalog.pg_proc as p
           where p.oid = 'public.revoke_club_role(uuid,text,text)'::regprocedure),
  'public RPC wrappers are SECURITY INVOKER'
);
select has_index(
  'public', 'member_profiles', 'member_profiles_username_lower_uidx',
  'usernames are unique case-insensitively'
);
select has_index(
  'public', 'member_role_assignments', 'member_role_assignments_one_current_president_uidx',
  'there is at most one active President'
);

-- Temporary fixtures are inserted as the migration test owner and rolled back.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'president@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'executive@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'member-one@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'member-two@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'pending@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'inactive@example.test', '', '{}'::jsonb, '{}'::jsonb, now());

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000001' then 'Admin One'
      when '00000000-0000-0000-0000-000000000002' then 'President One'
      when '00000000-0000-0000-0000-000000000003' then 'Executive One'
      when '00000000-0000-0000-0000-000000000004' then 'Member One'
      when '00000000-0000-0000-0000-000000000005' then 'Member Two'
      when '00000000-0000-0000-0000-000000000006' then 'Pending One'
      else 'Inactive One'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000001' then 'admin_one'
      when '00000000-0000-0000-0000-000000000002' then 'president_one'
      when '00000000-0000-0000-0000-000000000003' then 'executive_one'
      when '00000000-0000-0000-0000-000000000004' then 'member_one'
      when '00000000-0000-0000-0000-000000000005' then 'member_two'
      when '00000000-0000-0000-0000-000000000006' then 'pending_one'
      else 'inactive_one'
    end,
    status = case
      when id = '00000000-0000-0000-0000-000000000001' then 'active'
      when id = '00000000-0000-0000-0000-000000000002' then 'active'
      when id = '00000000-0000-0000-0000-000000000003' then 'active'
      when id = '00000000-0000-0000-0000-000000000004' then 'active'
      when id = '00000000-0000-0000-0000-000000000005' then 'active'
      when id = '00000000-0000-0000-0000-000000000007' then 'deactivated'
      else 'pending'
    end,
    profile_completed_at = case
      when id in (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000005'
      ) then now()
      else null
    end
where id between '00000000-0000-0000-0000-000000000001'::uuid
             and '00000000-0000-0000-0000-000000000007'::uuid;

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000001', 'admin', '00000000-0000-0000-0000-000000000001', 'Initial test administrator'),
  ('00000000-0000-0000-0000-000000000002', 'president', '00000000-0000-0000-0000-000000000001', 'Initial test president'),
  ('00000000-0000-0000-0000-000000000003', 'executive', '00000000-0000-0000-0000-000000000001', 'Initial test executive');

select throws_ok(
  $$update public.member_profiles set username = 'bad username' where id = '00000000-0000-0000-0000-000000000006'$$,
  '23514',
  'new row for relation "member_profiles" violates check constraint "member_profiles_username_check"',
  'database rejects malformed usernames'
);
select throws_ok(
  $$update public.member_profiles set username = 'ADMIN_ONE' where id = '00000000-0000-0000-0000-000000000006'$$,
  '23505',
  'duplicate key value violates unique constraint "member_profiles_username_lower_uidx"',
  'database rejects case-insensitive duplicate usernames'
);
select throws_ok(
  $$update public.member_profiles set full_name = '   ' where id = '00000000-0000-0000-0000-000000000006'$$,
  '23514',
  'new row for relation "member_profiles" violates check constraint "member_profiles_full_name_check"',
  'database rejects blank profile names'
);

-- Active ordinary members see only the active directory and their own role history.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from public.member_profiles
   where id between '00000000-0000-0000-0000-000000000001'::uuid
                and '00000000-0000-0000-0000-000000000007'::uuid),
  5::bigint,
  'active member sees the active fixtures only'
);
select is(
  (select count(*) from public.member_profiles
   where id between '00000000-0000-0000-0000-000000000001'::uuid
                and '00000000-0000-0000-0000-000000000007'::uuid
     and status <> 'active'),
  0::bigint,
  'active member cannot see pending or deactivated status'
);
select is((select count(*) from public.member_profiles where id = auth.uid()), 1::bigint, 'member can read own profile');
select is((select count(*) from public.member_role_assignments), 0::bigint, 'member cannot read other members’ role history');
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'executive', 'Forged member promotion')$$,
  '42501',
  'Only Admin or President may grant or remove Executive status.',
  'ordinary member cannot grant Executive status'
);
select throws_ok(
  $$update public.member_profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000005'$$,
  '42501',
  'permission denied for table member_profiles',
  'ordinary member cannot update account status directly'
);
reset role;

-- The President may manage Executive status but primary roles are staff-appointed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.member_profiles
   where id between '00000000-0000-0000-0000-000000000001'::uuid
                and '00000000-0000-0000-0000-000000000007'::uuid),
  7::bigint,
  'President may inspect every fixture profile state'
);
select lives_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'executive', 'Appointed to the event committee')$$,
  'President can grant Executive status'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'executive', 'Duplicate executive assignment')$$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_current_role_uidx"',
  'database rejects a duplicate active role assignment'
);
select is(
  (select count(*) from public.member_role_assignments
   where member_id = '00000000-0000-0000-0000-000000000005'
     and role = 'executive' and revoked_at is null),
  1::bigint,
  'President grant takes effect once'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'executive', '   ')$$,
  '22023',
  'A role-change reason of 1 to 500 characters is required.',
  'role mutation requires a nonblank reason'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'superuser', 'Forged role enum')$$,
  '22023',
  'Invalid member or club role.',
  'role mutation rejects unexpected role values'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000006', 'executive', 'Attempted promotion while pending')$$,
  '23514',
  'Club roles may only be granted to active members.',
  'role mutation rejects pending targets'
);
select lives_ok(
  $$select public.revoke_club_role('00000000-0000-0000-0000-000000000005', 'executive', 'Executive term ended')$$,
  'President can revoke Executive status'
);
select is(
  (select count(*) from public.member_role_assignments
   where member_id = '00000000-0000-0000-0000-000000000005'
     and role = 'executive' and revoked_at is null),
  0::bigint,
  'revoked Executive status is no longer active'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000005', 'admin', 'Attempted primary-admin appointment')$$,
  '22023',
  'Invalid member or club role.',
  'member-facing role RPCs no longer appoint primary admins'
);
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000004', 'president', 'Attempted president appointment')$$,
  '22023',
  'Invalid member or club role.',
  'member-facing role RPCs no longer appoint presidents'
);

-- set_club_role is the replacement path and is limited to member and Executive.
select lives_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000004', 'executive', 'Appointed by the President')$$,
  'President can set Executive status through the replacement RPC'
);
select is(
  (select count(*) from public.member_role_assignments
   where member_id = '00000000-0000-0000-0000-000000000004'
     and role = 'executive' and revoked_at is null),
  1::bigint,
  'replacement RPC records exactly one active Executive role'
);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000002', 'member', 'Attempted self demotion')$$,
  '42501',
  'Administrators cannot change their own club role.',
  'roles cannot be changed on the caller account'
);
select throws_ok(
  $$select public.set_club_role('00000000-0000-0000-0000-000000000004', 'admin', 'Attempted admin promotion')$$,
  '22023',
  'Invalid member or club role.',
  'replacement RPC rejects primary-role targets'
);
reset role;

-- Executives can review change history but cannot grant roles.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select ok((select count(*) > 0 from public.audit_log), 'Executive can read audit history');
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000004', 'executive', 'Attempted role assignment')$$,
  '42501',
  'Only Admin or President may grant or remove Executive status.',
  'Executive cannot grant Executive status'
);
reset role;

-- Primary roles stay single-valued at the database level.
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$
    insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values (
      '00000000-0000-0000-0000-000000000003', 'president',
      '00000000-0000-0000-0000-000000000001', 'Second president'
    );
  $$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_current_president_uidx"',
  'database permits at most one active President'
);
select throws_ok(
  $$
    insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
    values (
      '00000000-0000-0000-0000-000000000002', 'admin',
      '00000000-0000-0000-0000-000000000001', 'Admin beside president'
    );
  $$,
  '23505',
  'duplicate key value violates unique constraint "member_role_assignments_one_admin_identity_per_member_uidx"',
  'database permits one primary identity per member'
);

-- The last-active-primary-admin guard still protects legacy Admin rows.
select lives_ok(
  $$
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = '00000000-0000-0000-0000-000000000001',
        revoke_reason = 'Test isolation for the final-admin guard'
    where role = 'admin'
      and revoked_at is null
      and member_id <> '00000000-0000-0000-0000-000000000001';
  $$,
  'the fixture administrator is the only active primary Admin'
);
select throws_ok(
  $$update public.member_profiles set status = 'deactivated' where id = '00000000-0000-0000-0000-000000000001'$$,
  '23514',
  'At least one active primary Admin must remain active.',
  'database trigger blocks deactivation of the last active primary Admin'
);
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

-- A deactivated user with a still-valid JWT loses effective privileges immediately.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.member_profiles), 1::bigint, 'deactivated account sees only its own profile despite a stale JWT');
select throws_ok(
  $$select public.grant_club_role('00000000-0000-0000-0000-000000000004', 'executive', 'Attempted by a deactivated account')$$,
  '42501',
  'Inactive accounts cannot perform privileged operations.',
  'deactivated account cannot perform privileged mutations'
);
reset role;

-- Audit records retain reason and target and cannot be edited or deleted.
select ok(
  exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000000002'
      and target_member_id = '00000000-0000-0000-0000-000000000005'
      and action = 'club_role_granted'
      and reason = 'Appointed to the event committee'
      and after_data = '{"role": "executive", "active": true}'::jsonb
  ),
  'role audit captures actor, target, prior/new values and reason'
);
select throws_ok(
  $$update public.audit_log set reason = 'rewritten history' where action = 'club_role_granted'$$,
  '42501',
  'Audit history is append-only.',
  'audit records cannot be rewritten'
);
select throws_ok(
  $$delete from public.audit_log where action = 'club_role_granted'$$,
  '42501',
  'Audit history is append-only.',
  'audit records cannot be deleted'
);
select is(
  (select count(*) from public.member_role_assignments
   where member_id = '00000000-0000-0000-0000-000000000005'
     and role = 'executive' and revoked_at is not null),
  1::bigint,
  'revoked role history remains retained'
);

select * from finish();
rollback;
