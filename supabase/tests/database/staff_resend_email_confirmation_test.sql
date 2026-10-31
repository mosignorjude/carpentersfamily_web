begin;

select no_plan();

-- ===========================================================================
-- Structural checks: the pair exists, the private half is a definer, and only
-- authenticated may execute either half.
-- ===========================================================================

select has_function('private', 'staff_resend_member_email_confirmation',
  array['uuid', 'text'], 'the internal resend write exists');
select has_function('public', 'staff_resend_member_email_confirmation',
  array['uuid', 'text'], 'the RPC wrapper is exposed to the API');

select ok(
  (select p.prosecdef from pg_catalog.pg_proc as p
   join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'staff_resend_member_email_confirmation'),
  'the internal resend write is security definer'
);

select ok(
  has_function_privilege('authenticated',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated',
    'private.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE'),
  'authenticated can execute the wrapper and the gated write it forwards to'
);

select ok(
  not has_function_privilege('anon',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'public.staff_resend_member_email_confirmation(uuid, text)', 'EXECUTE'),
  'anon and service_role hold no execute privilege'
);

-- ===========================================================================
-- Fixtures. 301 is the acting staff administrator, 302 an executive, 303 an
-- ordinary member, 304 the pending unconfirmed applicant, 305 a pending but
-- already-confirmed applicant, 306 a rejected unconfirmed applicant, and 307 a
-- second applicant whose only resend happened outside the cooldown window.
-- Every unconfirmed applicant is pending because
-- enforce_member_profile_activation forbids an active status without a
-- confirmed email.
-- ===========================================================================

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'rs-admin@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'rs-exec@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'rs-member@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'rs-applicant@example.test', '', '{}'::jsonb, '{}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'rs-confirmed@example.test', '', '{}'::jsonb, '{}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000306', 'authenticated', 'authenticated', 'rs-rejected@example.test', '', '{}'::jsonb, '{}'::jsonb, null),
  ('00000000-0000-0000-0000-000000000307', 'authenticated', 'authenticated', 'rs-stale@example.test', '', '{}'::jsonb, '{}'::jsonb, null);

update public.member_profiles
set full_name = case id
      when '00000000-0000-0000-0000-000000000301' then 'Resend Admin'
      when '00000000-0000-0000-0000-000000000302' then 'Resend Exec'
      when '00000000-0000-0000-0000-000000000303' then 'Resend Member'
      when '00000000-0000-0000-0000-000000000304' then 'Resend Applicant'
      when '00000000-0000-0000-0000-000000000305' then 'Resend Confirmed'
      when '00000000-0000-0000-0000-000000000307' then 'Resend Stale'
      else 'Resend Rejected'
    end,
    username = case id
      when '00000000-0000-0000-0000-000000000301' then 'rs_admin'
      when '00000000-0000-0000-0000-000000000302' then 'rs_exec'
      when '00000000-0000-0000-0000-000000000303' then 'rs_member'
      when '00000000-0000-0000-0000-000000000304' then 'rs_apply'
      when '00000000-0000-0000-0000-000000000305' then 'rs_conf'
      when '00000000-0000-0000-0000-000000000307' then 'rs_stale'
      else 'rs_reject'
    end,
    status = case
      when id = '00000000-0000-0000-0000-000000000301' then 'staff'
      when id in ('00000000-0000-0000-0000-000000000304',
                  '00000000-0000-0000-0000-000000000307') then 'pending'
      when id = '00000000-0000-0000-0000-000000000306' then 'rejected'
      else 'active'
    end,
    profile_completed_at = case
      when id in ('00000000-0000-0000-0000-000000000304',
                  '00000000-0000-0000-0000-000000000306',
                  '00000000-0000-0000-0000-000000000307') then null
      else now() - interval '30 days'
    end
where id in (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000304',
  '00000000-0000-0000-0000-000000000305',
  '00000000-0000-0000-0000-000000000306',
  '00000000-0000-0000-0000-000000000307'
);

-- 301 holds no role assignment: reject_staff_role_target forbids a staff
-- administrator from holding club or event roles, and is_staff_administrator()
-- reads the profile status alone.
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000302', 'executive', '00000000-0000-0000-0000-000000000301', 'Fixture executive');

-- ===========================================================================
-- A staff administrator gets the recipient details back and the audit row exists
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select is(
  (select array_agg(r.email || '|' || r.full_name || '|' || r.username)
   from public.staff_resend_member_email_confirmation(
     '00000000-0000-0000-0000-000000000304'::uuid,
     'Applicant reported the confirmation email was never delivered.') as r),
  array['rs-applicant@example.test|Resend Applicant|rs_apply']::text[],
  'the recipient details are returned to the staff administrator'
);

reset role;

-- audit_log is FORCE ROW LEVEL SECURITY, so audit assertions run as postgres,
-- exactly as the existing suites do.
set local role postgres;

select ok(
  exists (select 1 from public.audit_log
          where target_member_id = '00000000-0000-0000-0000-000000000304'
            and action = 'member_email_confirmation_resent'
            and actor_id = '00000000-0000-0000-0000-000000000301'
            and reason = 'Applicant reported the confirmation email was never delivered.'),
  'the resend is recorded in the audit history'
);

reset role;

-- ===========================================================================
-- The cooldown blocks an immediate second attempt
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'second attempt')$$,
  '23514',
  'A confirmation email was sent to this applicant less than 15 minutes ago. Try again later.',
  'the 15 minute cooldown blocks a repeated resend'
);

reset role;

-- audit_log is append-only (prevent_audit_log_mutation), so an expired window
-- is represented by a second applicant whose single earlier resend is inserted
-- in the past, rather than by rewinding the row above.
set local role postgres;
insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id,
  before_data, after_data, reason, occurred_at
) values (
  '00000000-0000-0000-0000-000000000301',
  'member_email_confirmation_resent',
  'member_profile',
  '00000000-0000-0000-0000-000000000307',
  '00000000-0000-0000-0000-000000000307',
  '{"email_confirmed": false}'::jsonb,
  '{"confirmation_link_queued": true}'::jsonb,
  'Resend recorded outside the cooldown window.',
  now() - interval '20 minutes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select lives_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000307'::uuid, 'outside the window')$$,
  'the resend is allowed again once the window has passed'
);

reset role;

-- ===========================================================================
-- State refusals, checked before any audit row is written
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000301', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000305'::uuid, 'already verified')$$,
  '23514',
  'This applicant has already confirmed their email address.',
  'a confirmed applicant cannot be re-sent a confirmation email'
);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000306'::uuid, 'declined applicant')$$,
  '23514',
  'Only a pending applicant can be sent a confirmation email.',
  'a rejected applicant cannot be re-sent a confirmation email'
);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000999'::uuid, 'ghost account')$$,
  'P0002',
  'That applicant account was not found.',
  'an unknown member id is refused'
);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(null, 'no id')$$,
  '22023', null, 'a member id and a reason are required');

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, '   ')$$,
  '22023', null, 'a blank reason is refused');

reset role;

-- ===========================================================================
-- Everyone else is refused before any row is read or any audit row is written
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000302', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'executive probe')$$,
  '42501',
  'An active staff administrator account is required.',
  'an executive may not resend a confirmation email'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',
                  '00000000-0000-0000-0000-000000000303', true);

select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'member probe')$$,
  '42501',
  'An active staff administrator account is required.',
  'an ordinary member may not resend a confirmation email'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'no jwt subject')$$,
  '28000', null, 'a caller with no auth.uid is refused'
);

reset role;

set local role anon;
select throws_ok(
  $$select * from public.staff_resend_member_email_confirmation(
    '00000000-0000-0000-0000-000000000304'::uuid, 'anon probe')$$,
  '42501', null, 'anon cannot execute the resend RPC');

reset role;

-- ===========================================================================
-- A refusal must never leave an audit row behind
-- ===========================================================================

set local role postgres;
select ok(
  (select count(*)::integer from public.audit_log
   where action = 'member_email_confirmation_resent') = 3,
  'only the two live resends and the seeded historical row are recorded'
);
select ok(
  (select count(*)::integer from public.audit_log
   where action = 'member_email_confirmation_resent'
     and target_member_id = '00000000-0000-0000-0000-000000000304') = 1,
  'the cooldown and state refusals left no extra audit row for that applicant'
);
select ok(
  (select count(*)::integer from public.audit_log
   where action = 'member_email_confirmation_resent'
     and target_member_id in ('00000000-0000-0000-0000-000000000305',
                              '00000000-0000-0000-0000-000000000306')) = 0,
  'a refused applicant never gains an audit row'
);
reset role;

select * from finish();
rollback;
