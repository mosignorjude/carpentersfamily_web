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

-- …0503 has two revoked admin rows by now (Task 1 handed one back), so the
-- handover is identified by the reason it wrote, not by the member alone.
select is(
  (select revoked_by from public.member_role_assignments
   where role = 'admin'
     and member_id = '00000000-0000-0000-0000-000000000503'
     and revoked_at is not null
     and revoke_reason = 'Handed the books to a second officer'),
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
-- has_club_role() reads auth.uid(), so it can only be answered inside the
-- holder's own session; from the suite's default session it returns null and
-- proves nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000504', true);
select is(
  (select private.has_club_role('admin')),
  true,
  'the successor resolves as club administrator through the shared predicate'
);
reset role;

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

select ok(
  current_setting('ca.category_id') <> '',
  'the club administrator manages finance categories'
);

-- A club ledger income line carries no description and no category, but must
-- carry a source note; that is the shape record_club_financial_transaction
-- enforces for kind = 'income'.
select set_config(
  'ca.club_income_id',
  (select line.transaction_id::text
   from public.record_club_financial_transaction(
     'income', 5000,
     (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
     null, null, 'A. Member', 'Weekly member collection',
     '50000000-0000-0000-0000-000000000001', 'cash'
   ) as line),
  true
);

select ok(
  current_setting('ca.club_income_id') <> '',
  'the club administrator records a club ledger income line'
);

select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 5000,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, 'A. Member', 'A different source note',
    '50000000-0000-0000-0000-000000000001', 'cash')$$,
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
  (select line.transaction_id::text
   from public.record_event_financial_transaction(
     current_setting('ca.event_id')::uuid, 'expense', 2000,
     (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
     'Sound hire', 'Local Sound Co', null, 'cash',
     '50000000-0000-0000-0000-000000000002'
   ) as line),
  true
);

select ok(
  current_setting('ca.event_expense_id') <> '',
  'the club administrator writes an event ledger line'
);

-- Dues payment-request review is the one §6 authority the holder does NOT have:
-- the Phase 1 president rework (20261029121000) narrowed these three gates to
-- president|executive and never mentioned admin, so the denial lands before any
-- record lookup. Pinned here so widening it later is a visible change.
select throws_ok(
  $$select public.approve_dues_payment_request(gen_random_uuid())$$,
  '42501',
  'Only an Executive or President may approve dues payments.',
  'the club administrator is denied dues payment review by the president-only gate'
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
    'income', 1,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, 'Nobody', 'Staff tries the ledger',
    '50000000-0000-0000-0000-000000000003', 'cash')$$,
  '42501',
  'Active membership is required.',
  'a staff session is still rejected by the club ledger'
);
select throws_ok(
  $$select public.approve_dues_payment_request(gen_random_uuid())$$,
  '42501',
  'Only active club members may approve dues.',
  'a staff session is stopped by the dues gate, where the holder reached the officer gate'
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

-- ===========================================================================
-- Display label. Members must read "Club Admin"; the word "superuser"
-- describes staff and must never appear in member-facing text.
-- ===========================================================================

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

select * from finish();
rollback;
