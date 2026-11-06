begin;

select no_plan();

-- ===========================================================================
-- Structural checks
-- ===========================================================================

select has_function(
  'private', 'unconfirmed_member_email_ids', array[]::text[],
  'the internal email confirmation read exists'
);
select has_function(
  'public', 'unconfirmed_member_email_ids', array[]::text[],
  'the RPC wrapper is exposed to the API'
);

select ok(
  (select p.prosecdef
   from pg_catalog.pg_proc as p
   where p.oid = 'private.unconfirmed_member_email_ids()'::regprocedure)
  and not (select p.prosecdef
           from pg_catalog.pg_proc as p
           where p.oid = 'public.unconfirmed_member_email_ids()'::regprocedure),
  'the read is SECURITY DEFINER internally and SECURITY INVOKER at the API'
);

select ok(
  has_function_privilege('authenticated', 'public.unconfirmed_member_email_ids()', 'EXECUTE'),
  'authenticated officers and staff can execute the RPC'
);
select ok(
  not has_function_privilege('anon', 'public.unconfirmed_member_email_ids()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.unconfirmed_member_email_ids()', 'EXECUTE'),
  'anon and service_role cannot execute the RPC'
);
select ok(
  has_function_privilege('authenticated', 'private.unconfirmed_member_email_ids()', 'EXECUTE'),
  'the security invoker wrapper can reach the gated read it forwards to'
);
select ok(
  not has_function_privilege('anon', 'private.unconfirmed_member_email_ids()', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.unconfirmed_member_email_ids()', 'EXECUTE'),
  'anon and service_role are refused on the internal read'
);

-- ===========================================================================
-- Fixtures
-- ===========================================================================

-- 205 and 211 are the applicants awaiting confirmation. 210 is a staff account
-- with an unconfirmed email: it must stay out of the roster because staff rows
-- are never approvable members. 211 also has an unfinished profile, which
-- proves the read reports the email state without judging completion.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'state-admin@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'state-exec@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'state-president@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'state-member@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated', 'state-pending-unconfirmed@example.test', '', '{}'::jsonb, '{}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000206', 'authenticated', 'authenticated', 'state-pending-confirmed@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000207', 'authenticated', 'authenticated', 'state-staff@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000208', 'authenticated', 'authenticated', 'state-disabled-staff@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000209', 'authenticated', 'authenticated', 'state-revoked@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000210', 'authenticated', 'authenticated', 'state-staff-unconfirmed@example.test', '', '{}'::jsonb, '{}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000211', 'authenticated', 'authenticated', 'state-pending-unclear@example.test', '', '{}'::jsonb, '{}'::jsonb, null);

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000201' then 'State Admin'
      when '00000000-0000-0000-0000-000000000202' then 'State Exec'
      when '00000000-0000-0000-0000-000000000203' then 'State President'
      when '00000000-0000-0000-0000-000000000204' then 'State Member'
      when '00000000-0000-0000-0000-000000000205' then 'State Pending Unconfirmed'
      when '00000000-0000-0000-0000-000000000206' then 'State Pending Confirmed'
      when '00000000-0000-0000-0000-000000000207' then 'State Staff'
      when '00000000-0000-0000-0000-000000000208' then 'State Disabled Staff'
      when '00000000-0000-0000-0000-000000000209' then 'State Revoked'
      when '00000000-0000-0000-0000-000000000210' then 'State Staff Unconfirmed'
      else 'State Pending Unclear'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000201' then 'state_admin'
      when '00000000-0000-0000-0000-000000000202' then 'state_exec'
      when '00000000-0000-0000-0000-000000000203' then 'state_pres'
      when '00000000-0000-0000-0000-000000000204' then 'state_member'
      when '00000000-0000-0000-0000-000000000205' then 'state_pen_unc'
      when '00000000-0000-0000-0000-000000000206' then 'state_pen_conf'
      when '00000000-0000-0000-0000-000000000207' then 'state_staff'
      when '00000000-0000-0000-0000-000000000208' then 'state_dis_staff'
      when '00000000-0000-0000-0000-000000000209' then 'state_revoked'
      when '00000000-0000-0000-0000-000000000210' then 'state_staff_unc'
      else 'state_pen_unclear'
    end,
    status = case
      when id in (
        '00000000-0000-0000-0000-000000000201',
        '00000000-0000-0000-0000-000000000202',
        '00000000-0000-0000-0000-000000000203',
        '00000000-0000-0000-0000-000000000204',
        '00000000-0000-0000-0000-000000000209'
      ) then 'active'
      when id in (
        '00000000-0000-0000-0000-000000000207',
        '00000000-0000-0000-0000-000000000208',
        '00000000-0000-0000-0000-000000000210'
      ) then 'staff'
      else 'pending'
    end,
    profile_completed_at = case
      when id = '00000000-0000-0000-0000-000000000211' then null
      else now()
    end,
    staff_disabled_at = case
      when id = '00000000-0000-0000-0000-000000000208' then now()
      else null
    end
where id between '00000000-0000-0000-0000-000000000201'::uuid
             and '00000000-0000-0000-0000-000000000211'::uuid;

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000201', 'admin', '00000000-0000-0000-0000-000000000201', 'Fixture administrator'),
  ('00000000-0000-0000-0000-000000000202', 'executive', '00000000-0000-0000-0000-000000000201', 'Fixture executive'),
  ('00000000-0000-0000-0000-000000000203', 'president', '00000000-0000-0000-0000-000000000201', 'Fixture president'),
  ('00000000-0000-0000-0000-000000000209', 'executive', '00000000-0000-0000-0000-000000000201', 'Fixture revoked executive');

update public.member_role_assignments
set revoked_at = now(),
    revoked_by = '00000000-0000-0000-0000-000000000201',
    revoke_reason = 'Fixture revocation'
where member_id = '00000000-0000-0000-0000-000000000209';

-- ===========================================================================
-- Authorized readers see exactly the unconfirmed, non-staff members
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000202', true);

select is(
  (select array_agg(member_id order by member_id)
   from public.unconfirmed_member_email_ids()),
  array[
    '00000000-0000-0000-0000-000000000205'::uuid,
    '00000000-0000-0000-0000-000000000211'::uuid
  ]::uuid[],
  'an executive sees every unconfirmed member and none of the staff accounts'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000201', true);

select is(
  (select count(*) from public.unconfirmed_member_email_ids()),
  2::bigint,
  'the administrator sees the same two members'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000203', true);

select is(
  (select count(*) from public.unconfirmed_member_email_ids()),
  2::bigint,
  'the president sees the same two members'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000207', true);

select is(
  (select count(*) from public.unconfirmed_member_email_ids()),
  2::bigint,
  'an active staff administrator can read the confirmation states'
);

reset role;

-- ===========================================================================
-- Everyone else is refused before any row is read
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000204', true);

select throws_ok(
  $$select * from public.unconfirmed_member_email_ids()$$,
  '42501',
  'Only a club officer or a staff administrator may read email confirmation states.',
  'an ordinary member cannot read the confirmation states'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000209', true);

select throws_ok(
  $$select * from public.unconfirmed_member_email_ids()$$,
  '42501',
  'Only a club officer or a staff administrator may read email confirmation states.',
  'a revoked executive keeps no read authority'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000208', true);

select throws_ok(
  $$select * from public.unconfirmed_member_email_ids()$$,
  '42501',
  'Only a club officer or a staff administrator may read email confirmation states.',
  'a disabled staff account cannot read the confirmation states'
);

reset role;

set local role anon;

select throws_ok(
  $$select * from public.unconfirmed_member_email_ids()$$,
  '42501',
  'permission denied for function unconfirmed_member_email_ids',
  'the anon role is refused by the RPC execute grant'
);

reset role;

select * from finish();
rollback;
