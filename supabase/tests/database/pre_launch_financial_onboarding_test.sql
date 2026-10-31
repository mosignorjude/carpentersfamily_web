begin;
select plan(32);

-- Fixtures: Create test users
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000961', 'authenticated', 'authenticated', 'pl-admin@example.test', '', '{}'::jsonb, '{"full_name":"PL Admin","username":"pl_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000962', 'authenticated', 'authenticated', 'pl-backup@example.test', '', '{}'::jsonb, '{"full_name":"PL Backup","username":"pl_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000963', 'authenticated', 'authenticated', 'pl-member@example.test', '', '{}'::jsonb, '{"full_name":"PL Member","username":"pl_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000964', 'authenticated', 'authenticated', 'pl-deactivated@example.test', '', '{}'::jsonb, '{"full_name":"PL Deactivated","username":"pl_deactivated"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000965', 'authenticated', 'authenticated', 'pl-target@example.test', '', '{}'::jsonb, '{"full_name":"PL Target","username":"pl_target"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id in (
  '00000000-0000-0000-0000-000000000961',
  '00000000-0000-0000-0000-000000000962',
  '00000000-0000-0000-0000-000000000963',
  '00000000-0000-0000-0000-000000000965'
);

update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000964';

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000961', 'admin', '00000000-0000-0000-0000-000000000961', 'PL Admin test role'),
  ('00000000-0000-0000-0000-000000000962', 'president', '00000000-0000-0000-0000-000000000961', 'PL Backup Admin test role');

-- 1. Table existence & forced RLS
select has_table('public', 'club_payment_settings', 'club_payment_settings table exists');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'club_payment_settings'),
  'club_payment_settings has forced RLS'
);

-- 2. Check constraints on account_number (rejects invalid NUBAN)
select throws_ok(
  $$
    insert into public.club_payment_settings (id, bank_name, account_number, account_name)
    values ('singleton', 'Access Bank', '12345', 'Carpenters Family');
  $$,
  '23514',
  null,
  'rejects account_number with fewer than 10 digits'
);

select throws_ok(
  $$
    insert into public.club_payment_settings (id, bank_name, account_number, account_name)
    values ('singleton', 'Access Bank', '123456789a', 'Carpenters Family');
  $$,
  '23514',
  null,
  'rejects account_number with non-numeric characters'
);

-- 3. Singleton primary key check
select throws_ok(
  $$
    insert into public.club_payment_settings (id, bank_name, account_number, account_name)
    values ('not_singleton', 'Access Bank', '0123456789', 'Carpenters Family');
  $$,
  '23514',
  null,
  'rejects non-singleton id'
);

-- 4. Ordinary member cannot insert or update payment settings
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);

select throws_ok(
  $$
    insert into public.club_payment_settings (bank_name, account_number, account_name)
    values ('Access Bank', '0123456789', 'Carpenters Family');
  $$,
  '42501',
  null,
  'ordinary active member cannot insert club payment settings'
);

reset role;

-- 5. Admin can insert club payment settings
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', true);

select lives_ok(
  $$
    insert into public.club_payment_settings (bank_name, account_number, account_name, instructions)
    values ('Zenith Bank', '1012345678', 'The Carpenters Family Club', 'Use your full name in transfer memo.');
  $$,
  'admin can insert club payment settings'
);

reset role;

-- 6. Active member CAN select payment settings
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);

select is(
  (select account_number from public.club_payment_settings where id = 'singleton'),
  '1012345678',
  'active member can select club payment settings'
);

-- 7. Deactivated member CANNOT select payment settings
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000964', true);

select is(
  (select count(*) from public.club_payment_settings),
  0::bigint,
  'deactivated member cannot select club payment settings'
);

reset role;

-- 8. Audit log records payment settings insert
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'club_payment_settings_updated'
      and entity_type = 'club_payment_settings'
  ),
  'audit log records club_payment_settings_updated'
);

-- Backup admin can update club payment settings
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', true);

select lives_ok(
  $$
    update public.club_payment_settings
    set instructions = 'Updated instructions by backup admin'
    where id = 'singleton';
  $$,
  'backup admin can update club payment settings'
);

-- Deletion guard on club_payment_settings
select throws_ok(
  $$
    delete from public.club_payment_settings where id = 'singleton';
  $$,
  '42501',
  null,
  'cannot delete singleton club payment settings'
);

reset role;

-- 9. Dues rate schedule and membership periods updated from 2026-01-01 to 2026-02-01
select ok(
  not exists (
    select 1 from public.dues_rates where effective_month = '2026-01-01'::date
  ) and exists (
    select 1 from public.dues_rates where effective_month = '2026-02-01'::date
  ),
  'dues rate schedule effective_month starts at 2026-02-01'
);

select ok(
  not exists (
    select 1 from public.dues_membership_periods where starts_month = '2026-01-01'::date
  ),
  'membership periods start at 2026-02-01 or later'
);

-- 10. Dues payments constraint allows pre_launch_reconciliation
select lives_ok(
  $$
    insert into public.dues_payments (
      id, member_id, amount_ngn, payment_date, recorded_by, payment_method
    ) values (
      '00000000-0000-0000-0000-000000000970',
      '00000000-0000-0000-0000-000000000965',
      5000,
      '2026-10-01'::date,
      '00000000-0000-0000-0000-000000000961',
      'pre_launch_reconciliation'
    );
  $$,
  'dues_payments accepts payment_method pre_launch_reconciliation'
);

-- Clean up direct test row
delete from public.dues_payments where id = '00000000-0000-0000-0000-000000000970';

-- 11. RPC backfill functions exist
select has_function('public', 'backfill_member_historical_dues', array['uuid', 'date[]', 'text'], 'public.backfill_member_historical_dues exists');
select has_function('private', 'backfill_member_historical_dues', array['uuid', 'date[]', 'text', 'uuid'], 'private.backfill_member_historical_dues exists');

-- 12. Non-admin caller cannot backfill historical dues
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);

select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-02-01'::date],
      'Test backfill'
    );
  $$,
  '42501',
  null,
  'ordinary active member cannot backfill dues'
);

reset role;

-- 13. Cannot backfill for Admin (admin exempt from statutory dues)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', true);

select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000961'::uuid,
      array['2026-02-01'::date],
      'Test backfill for admin'
    );
  $$,
  '23514',
  null,
  'cannot backfill dues for admin'
);

-- Cannot backfill for non-active member
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000964'::uuid,
      array['2026-02-01'::date],
      'Backfill for non-active member'
    );
  $$,
  '22023',
  'Historical dues backfill is only permitted for active club members.',
  'cannot backfill dues for non-active member'
);

-- 14. Cannot backfill January 2026 (boundary check: Feb-Sep 2026 only)
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-01-01'::date, '2026-02-01'::date],
      'Backfill with January'
    );
  $$,
  '22023',
  null,
  'backfill rejects January 2026'
);

-- 15. Cannot backfill October 2026 (boundary check: post-launch rejected)
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-10-01'::date],
      'Backfill with October'
    );
  $$,
  '22023',
  null,
  'backfill rejects October 2026'
);

-- 16. Cannot backfill non-first-of-month dates
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-03-15'::date],
      'Backfill mid-month'
    );
  $$,
  '22023',
  null,
  'backfill rejects mid-month date'
);

-- 17. Cannot backfill with duplicate months
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-02-01'::date, '2026-02-01'::date],
      'Duplicate month'
    );
  $$,
  '22023',
  null,
  'backfill rejects duplicate month'
);

-- 18. Successful backfill for valid months (Feb, Mar, Apr 2026)
select set_config(
  'test.backfill_pmt_id',
  public.backfill_member_historical_dues(
    '00000000-0000-0000-0000-000000000965'::uuid,
    array['2026-02-01'::date, '2026-03-01'::date, '2026-04-01'::date],
    'Pre-launch verification from secretariat notes'
  )::text,
  true
);

select ok(
  current_setting('test.backfill_pmt_id') is not null,
  'backfill succeeds and returns payment uuid'
);

-- 19. Verify dues_payments record created
select ok(
  exists (
    select 1 from public.dues_payments
    where id = current_setting('test.backfill_pmt_id')::uuid
      and member_id = '00000000-0000-0000-0000-000000000965'::uuid
      and amount_ngn = 15000
      and payment_date = '2026-10-01'::date
      and payment_method = 'pre_launch_reconciliation'
  ),
  'dues_payments record matches backfill specifications'
);

-- 20. Verify dues_month_dispositions records created
select is(
  (select count(*) from public.dues_month_dispositions
   where member_id = '00000000-0000-0000-0000-000000000965'::uuid
     and payment_id = current_setting('test.backfill_pmt_id')::uuid
     and disposition = 'paid'
     and amount_ngn = 5000),
  3::bigint,
  'dues_month_dispositions created for all 3 backfilled months'
);

-- 21. Verify audit log entry for backfill
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'pre_launch_dues_backfill'
      and target_member_id = '00000000-0000-0000-0000-000000000965'::uuid
      and entity_id = current_setting('test.backfill_pmt_id')::uuid
  ),
  'audit_log records pre_launch_dues_backfill'
);

-- 22. Idempotency: Reject already disposed months
select throws_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000965'::uuid,
      array['2026-03-01'::date, '2026-05-01'::date],
      'Attempting to re-backfill March'
    );
  $$,
  '23505',
  null,
  'rejects month that already has a disposition'
);

-- Backup admin can also backfill historical dues for an active member
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000962', true);

select lives_ok(
  $$
    select public.backfill_member_historical_dues(
      '00000000-0000-0000-0000-000000000963'::uuid,
      array['2026-02-01'::date],
      'Backup admin backfill for pl-member'
    );
  $$,
  'backup admin can backfill historical dues'
);

reset role;

-- 23. Double-counting guard in private.club_finance_summary()
-- Record an opening balance in club_financial_transactions as admin via RPC
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000961', true);

select * from public.record_club_opening_balance(
  250000,
  '2026-10-01'::date,
  'Verified pre-launch opening treasury balance as of October 2026',
  '00000000-0000-0000-0000-000000000980'::uuid,
  null
);

-- As active ordinary member, query club_finance_summary
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);

-- Treasury balance should be opening balance (250,000) WITHOUT the backfilled 15,000 dues.
-- Dues income includes all dues (15,000), but balance excludes pre_launch_reconciliation.
select is(
  (select balance from public.club_finance_summary()),
  250000::numeric,
  'treasury balance does not double count pre_launch_reconciliation dues'
);

-- 24. Live dues payment DOES add to balance
reset role;

insert into public.dues_payments (
  id, member_id, amount_ngn, payment_date, recorded_by, payment_method
) values (
  '00000000-0000-0000-0000-000000000981',
  '00000000-0000-0000-0000-000000000963',
  5000,
  '2026-10-02'::date,
  '00000000-0000-0000-0000-000000000961',
  'bank_transfer'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000963', true);

select is(
  (select balance from public.club_finance_summary()),
  255000::numeric,
  'live dues payment is added to treasury balance'
);

reset role;

select * from finish();
rollback;
