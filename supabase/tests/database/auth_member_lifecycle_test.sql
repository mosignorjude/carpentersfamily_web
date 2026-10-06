begin;

select no_plan();

select ok(
  exists (
    select 1
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'on_auth_user_created_member_profile'
      and not t.tgisinternal
  ),
  'Auth user creation installs the pending-profile trigger'
);
select ok(
  not has_table_privilege('authenticated', 'public.member_profiles', 'INSERT,UPDATE,DELETE'),
  'authenticated clients cannot directly mutate profile lifecycle fields'
);
select ok(
  not has_function_privilege('anon', 'public.complete_member_profile(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.approve_member(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.deactivate_member(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reactivate_member(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot execute lifecycle procedures'
);
select ok(
  not (select p.prosecdef
       from pg_catalog.pg_proc as p
       where p.oid = 'public.approve_member(uuid,text)'::regprocedure)
  and not (select p.prosecdef
           from pg_catalog.pg_proc as p
           where p.oid = 'public.deactivate_member(uuid,text)'::regprocedure),
  'public lifecycle RPC wrappers are SECURITY INVOKER'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000101', 'authenticated', 'authenticated', 'life-admin@example.test', '', '{}'::jsonb, '{"full_name":"Lifecycle Admin","username":"life_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000102', 'authenticated', 'authenticated', 'life-backup@example.test', '', '{}'::jsonb, '{"full_name":"Lifecycle Backup","username":"life_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000103', 'authenticated', 'authenticated', 'life-exec@example.test', '', '{}'::jsonb, '{"full_name":"Lifecycle Executive","username":"life_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000104', 'authenticated', 'authenticated', 'life-member@example.test', '', '{}'::jsonb, '{"full_name":"Lifecycle Member","username":"life_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000105', 'authenticated', 'authenticated', 'life-applicant@example.test', '', '{}'::jsonb, '{"status":"active","role":"admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000106', 'authenticated', 'authenticated', 'life-unverified@example.test', '', '{}'::jsonb, '{"full_name":"Unverified Member","username":"unverified_member"}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000107', 'authenticated', 'authenticated', 'life-target@example.test', '', '{}'::jsonb, '{"full_name":"Lifecycle Target","username":"life_target"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000108', 'authenticated', 'authenticated', 'life-second-applicant@example.test', '', '{}'::jsonb, '{"full_name":"Second Applicant","username":"second_applicant"}'::jsonb, now());

select is(
  (select status from public.member_profiles where id = '00000000-0000-0000-0000-000000000105'),
  'pending'::text,
  'untrusted Auth metadata cannot set an account active'
);
select is(
  (select count(*) from public.member_role_assignments where member_id = '00000000-0000-0000-0000-000000000105'),
  0::bigint,
  'untrusted Auth metadata cannot assign a club role'
);
select ok(
  (select profile_completed_at is null and username ~ '^member_[A-Fa-f0-9]{23}$'
   from public.member_profiles where id = '00000000-0000-0000-0000-000000000105'),
  'OAuth or incomplete signups receive a safe pending profile that needs member completion'
);

update public.member_profiles
set status = 'active'
where id in (
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000103',
  '00000000-0000-0000-0000-000000000104',
  '00000000-0000-0000-0000-000000000107'
);

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000101', 'admin', '00000000-0000-0000-0000-000000000101', 'Lifecycle test primary administrator'),
  ('00000000-0000-0000-0000-000000000102', 'backup_admin', '00000000-0000-0000-0000-000000000101', 'Lifecycle test backup administrator'),
  ('00000000-0000-0000-0000-000000000103', 'executive', '00000000-0000-0000-0000-000000000101', 'Lifecycle test executive');

-- Ordinary members see only themselves plus the active name directory. They
-- cannot see pending/deactivated status rows or operate on another profile.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000104', true);
select is((select count(*) from public.member_profiles), 5::bigint, 'active member sees only the active directory');
select is((select count(*) from public.member_profiles where status = 'pending'), 0::bigint, 'active member cannot inspect pending applicants');
select throws_ok(
  $$select public.complete_member_profile('Forged Name', 'forged_name')$$,
  '42501',
  'Only a pending member with an incomplete profile can complete their own profile.',
  'active member cannot use profile completion to edit another member'
);
select throws_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000108', 'Forged approval')$$,
  '42501',
  'Only an active Executive, Admin, or Backup Admin may approve members.',
  'ordinary member cannot approve an applicant'
);
reset role;

-- Executive can approve, but cannot deactivate or reactivate.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select throws_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000105', 'Attempted premature approval')$$,
  '23514',
  'The member must complete their profile before approval.',
  'incomplete profile cannot be approved'
);
select throws_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000106', 'Attempted unverified approval')$$,
  '23514',
  'The member must confirm their email before approval.',
  'unverified email cannot be approved'
);
select throws_ok(
  $$select public.deactivate_member('00000000-0000-0000-0000-000000000107', 'Attempted executive deactivation')$$,
  '42501',
  'Only an active Admin or Backup Admin may deactivate members.',
  'Executive cannot deactivate a member'
);
select throws_ok(
  $$select public.reactivate_member('00000000-0000-0000-0000-000000000107', 'Attempted executive reactivation')$$,
  '42501',
  'Only an active Admin or Backup Admin may reactivate members.',
  'Executive cannot reactivate a member'
);
reset role;

-- A pending member can complete only their own profile, only once, and cannot
-- use metadata to acquire roles. Profile identity fields are then immutable.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000105', true);
select lives_ok(
  $$select public.complete_member_profile('Applicant Five', 'applicant_five')$$,
  'pending member can complete their own profile'
);
select throws_ok(
  $$select public.complete_member_profile('Changed Name', 'changed_name')$$,
  '42501',
  'Only a pending member with an incomplete profile can complete their own profile.',
  'completed profile cannot be changed through the completion RPC'
);
reset role;
select throws_ok(
  $$update public.member_profiles set username = 'changed_name' where id = '00000000-0000-0000-0000-000000000105'$$,
  '42501',
  'A completed member profile is immutable.',
  'completed name and username cannot be rewritten by database updates'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000103', true);
select lives_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000105', 'Profile and email verified')$$,
  'Executive can approve a verified applicant with a complete profile'
);
reset role;
select is(
  (select status from public.member_profiles where id = '00000000-0000-0000-0000-000000000105'),
  'active'::text,
  'successful approval activates the account'
);

-- The database independently guards email confirmation even if an operator
-- or a privileged SQL path attempts to activate an unverified profile.
select throws_ok(
  $$update public.member_profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000106'$$,
  '23514',
  'A confirmed email address is required before membership approval.',
  'activation trigger rejects unconfirmed email'
);
update auth.users
set email_confirmed_at = now()
where id = '00000000-0000-0000-0000-000000000106';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select lives_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000108', 'Backup Admin verified applicant')$$,
  'Backup Admin can approve a confirmed applicant'
);
reset role;

-- Only Admin/Backup Admin can change an active account. A deactivated account
-- loses effective privilege despite a still-valid JWT; reactivation retains
-- historical role assignments but the account status remains authoritative.
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values ('00000000-0000-0000-0000-000000000107', 'executive', '00000000-0000-0000-0000-000000000101', 'Lifecycle test executive role');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select throws_ok(
  $$select public.deactivate_member('00000000-0000-0000-0000-000000000101', 'Self deactivation')$$,
  '42501',
  'Administrators cannot deactivate their own account.',
  'primary Admin cannot deactivate themselves'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
select throws_ok(
  $$select public.deactivate_member('00000000-0000-0000-0000-000000000101', 'Last primary Admin')$$,
  '23514',
  'At least one active primary Admin must remain active.',
  'Backup Admin cannot deactivate the last active primary Admin'
);
select lives_ok(
  $$select public.deactivate_member('00000000-0000-0000-0000-000000000107', 'Member access review')$$,
  'Backup Admin can deactivate another active member'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000107', true);
select is((select count(*) from public.member_profiles where status = 'active'), 0::bigint, 'deactivated account cannot inspect active directory with stale JWT');
select throws_ok(
  $$select public.approve_member('00000000-0000-0000-0000-000000000108', 'Attempted action after deactivation')$$,
  '42501',
  'Only an active Executive, Admin, or Backup Admin may approve members.',
  'deactivated Executive cannot perform privileged actions with stale JWT'
);
select throws_ok(
  $$update public.member_profiles set full_name = 'Changed after completion' where id = '00000000-0000-0000-0000-000000000107'$$,
  '42501',
  'permission denied for table member_profiles',
  'deactivated user has no direct profile write access'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select lives_ok(
  $$select public.reactivate_member('00000000-0000-0000-0000-000000000107', 'Membership restored')$$,
  'primary Admin can reactivate a deactivated member'
);
reset role;

select is(
  (select status from public.member_profiles where id = '00000000-0000-0000-0000-000000000107'),
  'active'::text,
  'reactivation restores active account status'
);
select is(
  (select count(*) from public.member_role_assignments
   where member_id = '00000000-0000-0000-0000-000000000107'
     and role = 'executive' and revoked_at is null),
  1::bigint,
  'reactivation preserves the member role history and current assignment'
);
select ok(
  exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000000103'
      and target_member_id = '00000000-0000-0000-0000-000000000105'
      and action = 'member_approved'
      and before_data = '{"status":"pending"}'::jsonb
      and after_data = '{"status":"active"}'::jsonb
      and reason = 'Profile and email verified'
  )
  and exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000000102'
      and target_member_id = '00000000-0000-0000-0000-000000000107'
      and action = 'member_deactivated'
      and before_data = '{"status":"active"}'::jsonb
      and after_data = '{"status":"deactivated"}'::jsonb
      and reason = 'Member access review'
  )
  and exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000000101'
      and target_member_id = '00000000-0000-0000-0000-000000000107'
      and action = 'member_reactivated'
      and before_data = '{"status":"deactivated"}'::jsonb
      and after_data = '{"status":"active"}'::jsonb
      and reason = 'Membership restored'
  ),
  'approval, deactivation, and reactivation are audited with actor, target, states, and reason'
);

select * from finish();
rollback;
