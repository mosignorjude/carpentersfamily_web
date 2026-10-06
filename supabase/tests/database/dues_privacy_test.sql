begin;

select no_plan();

select has_table('public', 'dues_rates', 'dues rate history table exists');
select has_table('public', 'dues_membership_periods', 'membership dues periods table exists');
select has_table('public', 'dues_payments', 'dues payments table exists');
select has_table('public', 'dues_month_dispositions', 'month disposition history table exists');
select has_view('public', 'dues_month_status', 'private dues status view exists');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'dues_rates')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'dues_membership_periods')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'dues_payments')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'dues_month_dispositions'),
  'all dues tables have forced RLS'
);

select ok(
  has_table_privilege('authenticated', 'public.dues_rates', 'SELECT')
  and has_table_privilege('authenticated', 'public.dues_payments', 'SELECT')
  and has_table_privilege('authenticated', 'public.dues_month_dispositions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.dues_payments', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.dues_month_dispositions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.dues_payments', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated clients are read-only and anonymous clients have no dues access'
);

select ok(
  not has_function_privilege('anon', 'public.record_dues_payment(uuid,bigint,date,date[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.write_off_dues_months(uuid,date[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.correct_dues_payment(uuid,uuid,bigint,date,date[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_dues_rate(date,bigint,text)', 'EXECUTE'),
  'anonymous callers cannot execute dues mutation procedures'
);

select ok(
  not (select p.prosecdef
       from pg_catalog.pg_proc as p
       where p.oid = 'public.record_dues_payment(uuid,bigint,date,date[])'::regprocedure)
  and not (select p.prosecdef
           from pg_catalog.pg_proc as p
           where p.oid = 'public.correct_dues_payment(uuid,uuid,bigint,date,date[],text)'::regprocedure),
  'public dues RPC wrappers are SECURITY INVOKER'
);

select ok(
  (select monthly_amount_ngn = 5000
   from public.dues_rates
   order by effective_month
   limit 1),
  'the initial whole-Naira dues rate is ₦5,000'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'dues-admin@example.test', '', '{}'::jsonb, '{"full_name":"Dues Admin","username":"dues_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'dues-backup@example.test', '', '{}'::jsonb, '{"full_name":"Dues Backup","username":"dues_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'dues-exec@example.test', '', '{}'::jsonb, '{"full_name":"Dues Executive","username":"dues_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000204', 'authenticated', 'authenticated', 'dues-member-one@example.test', '', '{}'::jsonb, '{"full_name":"Dues Member One","username":"dues_member_one"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000205', 'authenticated', 'authenticated', 'dues-member-two@example.test', '', '{}'::jsonb, '{"full_name":"Dues Member Two","username":"dues_member_two"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000206', 'authenticated', 'authenticated', 'dues-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Dues Inactive","username":"dues_inactive"}'::jsonb, now());

update public.member_profiles
set status = 'active'
where id between '00000000-0000-0000-0000-000000000201'::uuid
             and '00000000-0000-0000-0000-000000000206'::uuid;

update public.dues_membership_periods
set starts_month = (select min(effective_month) from public.dues_rates)
where member_id between '00000000-0000-0000-0000-000000000201'::uuid
                    and '00000000-0000-0000-0000-000000000206'::uuid;

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000201', 'admin', '00000000-0000-0000-0000-000000000201', 'Dues test primary Admin'),
  ('00000000-0000-0000-0000-000000000202', 'backup_admin', '00000000-0000-0000-0000-000000000201', 'Dues test Backup Admin'),
  ('00000000-0000-0000-0000-000000000203', 'executive', '00000000-0000-0000-0000-000000000201', 'Dues test Executive');

update public.member_profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000206';

-- Model an earlier departure so return behavior proves that the gap is not
-- billed. The current-month date expressions remain timezone-aware.
update public.dues_membership_periods
set ends_before_month = greatest(
  (select min(effective_month) from public.dues_rates),
  (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '2 months')::date
)
where member_id = '00000000-0000-0000-0000-000000000206'
  and ends_before_month is not null;

select is(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000206'
     and covered_month = date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date),
  0::bigint,
  'dues stop in the member deactivation month'
);
select is(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000206'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '1 month')::date),
  0::bigint,
  'the gap before reactivation does not accrue dues'
);

-- Ordinary member: own dues only, no payment/write-off/correction authority.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000204', true);

select is(
  (select count(*) from public.dues_month_status where member_id = '00000000-0000-0000-0000-000000000204'),
  (select count(*) from public.dues_month_status),
  'a member can read their own dues status and no other member status'
);
select is(
  (select count(*) from public.dues_month_status where member_id = '00000000-0000-0000-0000-000000000205'),
  0::bigint,
  'a member cannot read another member dues status by changing the ID'
);
select is(
  (select count(*) from public.dues_payments where member_id = '00000000-0000-0000-0000-000000000205'),
  0::bigint,
  'a member cannot read another member payment rows'
);
select throws_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 5000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date]
    )$$,
  '42501',
  'Only an active Executive, Admin, or Backup Admin may record dues payments.',
  'member cannot record a dues payment for another member'
);
select throws_ok(
  $$select public.write_off_dues_months(
      '00000000-0000-0000-0000-000000000204',
      array[(date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '1 month')::date],
      'Member attempted write-off'
    )$$,
  '42501',
  'Only an active Executive, Admin, or Backup Admin may write off dues.',
  'member cannot write off their own dues'
);
select is(public.club_dues_income_total(), 0::bigint, 'active member can query only the all-club aggregate total');
reset role;

-- Executive can record exact dues and make reasoned old-month write-offs.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000203', true);

select lives_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 10000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[
        date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
        (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date
      ]
    )$$,
  'Executive can record current dues and prepay a future month atomically'
);
select set_config(
  'test.dues_payment_id',
  (select id::text from public.dues_payments where member_id = '00000000-0000-0000-0000-000000000205'),
  true
);
select is(
  (select amount_ngn from public.dues_payments where id = current_setting('test.dues_payment_id')::uuid),
  10000::bigint,
  'payment amount is stored as the exact sum of selected months'
);
select is(
  (select count(*) from public.dues_month_dispositions
   where payment_id = current_setting('test.dues_payment_id')::uuid and is_current),
  2::bigint,
  'one current paid disposition exists for each covered month'
);
select throws_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 4999,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[(date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '2 months')::date]
    )$$,
  '23514',
  'Payment amount must exactly equal the configured rate total for the selected months.',
  'partial or manipulated payment amount is rejected'
);
select throws_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 10000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[
        date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
        (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date
      ]
    )$$,
  '23505',
  'At least one selected month already has a final dues disposition.',
  'duplicate payment cannot overlap already-covered months'
);
select throws_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 5000,
      ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1),
      array[(date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '2 months')::date]
    )$$,
  '22023',
  'A member, positive amount, valid non-future payment date, and 1 to 1,200 covered months are required.',
  'future payment dates are rejected'
);
select throws_ok(
  $$select public.set_dues_rate(
      (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '2 months')::date,
      6000,
      'Executive attempted rate change'
    )$$,
  '22023',
  'A valid amount and reason are required; a rate change takes effect next month.',
  'rate changes cannot be scheduled beyond the following month'
);
select throws_ok(
  $$select public.correct_dues_payment(
      current_setting('test.dues_payment_id')::uuid,
      '00000000-0000-0000-0000-000000000205',
      5000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date],
      'Executive attempted correction'
    )$$,
  '42501',
  'Only an active Admin or Backup Admin may correct dues payments.',
  'Executive cannot correct a recorded payment'
);
select lives_ok(
  $$select public.write_off_dues_months(
      '00000000-0000-0000-0000-000000000204',
      array[(date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '1 month')::date],
      'Executive approved an old dues write-off'
    )$$,
  'Executive can write off an unpaid old month with a reason'
);
select is(
  (select status from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000204'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '1 month')::date),
  'written_off'::text,
  'write-off is a final per-month disposition'
);
select throws_ok(
  $$select public.write_off_dues_months(
      '00000000-0000-0000-0000-000000000204',
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date],
      'Attempt current-month write-off'
    )$$,
  '23514',
  'Write-offs are limited to unpaid past months within the member dues period.',
  'current-month dues cannot be written off as old debt'
);
reset role;

-- Only Admin/Backup Admin can change rates and correct payment history.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);

select lives_ok(
  $$select public.set_dues_rate(
      (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date,
      6500,
      'Corrected a scheduled rate entry before it takes effect'
    )$$,
  'Backup Admin can append a future rate before it takes effect'
);
select lives_ok(
  $$select public.set_dues_rate(
      (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date,
      6000,
      'Approved rate change effective next month'
    )$$,
  'Backup Admin can correct a scheduled future rate before it takes effect'
);
select is(
  (select amount_ngn from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000205'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date),
  5000::bigint,
  'prepaid future month keeps its original rate snapshot after a rate change'
);
select lives_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000205', 6000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[(date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '2 months')::date]
    )$$,
  'future month payment uses the rate effective for that month'
);
select lives_ok(
  $$select public.correct_dues_payment(
      current_setting('test.dues_payment_id')::uuid,
      '00000000-0000-0000-0000-000000000205',
      5000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date],
      'Corrected the months covered by the recorded payment'
    )$$,
  'Backup Admin can correct payment values and covered months with a reason'
);
select is(
  (select count(*) from public.dues_month_dispositions
   where payment_id = current_setting('test.dues_payment_id')::uuid and is_current),
  1::bigint,
  'correction replaces current coverage while retaining one final disposition per month'
);
select is(
  (select count(*) from public.dues_month_dispositions
   where payment_id = current_setting('test.dues_payment_id')::uuid and not is_current
     and superseded_by = '00000000-0000-0000-0000-000000000202'
     and superseded_reason = 'Corrected the months covered by the recorded payment'),
  2::bigint,
  'corrected coverage remains retained with actor and reason'
);
select is(
  (select status from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000205'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date),
  'unpaid'::text,
  'removed coverage reopens the month as unpaid'
);
select is(
  (select amount_ngn from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000205'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') + interval '1 month')::date),
  6000::bigint,
  'reopened future month uses the new effective rate'
);
select ok(
  exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000000202'
      and action = 'dues_payment_corrected'
      and entity_id = current_setting('test.dues_payment_id')::uuid
      and before_data ->> 'amount_ngn' = '10000'
      and after_data ->> 'amount_ngn' = '5000'
      and reason = 'Corrected the months covered by the recorded payment'
  ),
  'payment correction audit retains actor, prior/new amount and reason'
);
select is(public.club_dues_income_total(), 11000::bigint, 'member-visible aggregate reflects corrected payments only');
reset role;

-- Deactivated stale sessions lose personal dues, rates, aggregate and mutations.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000206', true);
select is(
  (select count(*) from public.dues_month_status where member_id = '00000000-0000-0000-0000-000000000206'),
  0::bigint,
  'deactivated member cannot read dues through a stale session'
);
select is((select count(*) from public.dues_rates), 0::bigint, 'deactivated account cannot read rate data');
select throws_ok(
  $$select public.record_dues_payment(
      '00000000-0000-0000-0000-000000000204', 5000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      array[date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date]
    )$$,
  '42501',
  'Only an active Executive, Admin, or Backup Admin may record dues payments.',
  'deactivated officer or member cannot create dues payments'
);
reset role;

select throws_ok(
  $$update public.dues_rates
    set monthly_amount_ngn = 1
    where effective_month = (select min(effective_month) from public.dues_rates)$$,
  '42501',
  'Effective dues rate history is immutable.',
  'existing dues rate values cannot be rewritten'
);
select throws_ok(
  $$delete from public.dues_month_dispositions$$,
  '42501',
  'Dues disposition history cannot be deleted.',
  'dues month dispositions cannot be deleted'
);
select ok(
  exists (
    select 1 from public.audit_log
    where action = 'dues_month_written_off'
      and target_member_id = '00000000-0000-0000-0000-000000000204'
      and reason = 'Executive approved an old dues write-off'
  )
  and exists (
    select 1 from public.audit_log
    where action = 'dues_rate_changed'
      and actor_id = '00000000-0000-0000-0000-000000000202'
      and reason = 'Approved rate change effective next month'
      and before_data ->> 'monthly_amount_ngn' = '6500'
      and after_data ->> 'monthly_amount_ngn' = '6000'
  ),
  'write-offs and rate changes are audited with actor, target/value and reason'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select lives_ok(
  $$select public.reactivate_member(
      '00000000-0000-0000-0000-000000000206',
      'Dues test member returned'
    )$$,
  'Backup Admin can reactivate a former member'
);
select is(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000206'
     and covered_month = date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date),
  1::bigint,
  'dues restart in the member reactivation month'
);
select is(
  (select count(*) from public.dues_month_status
   where member_id = '00000000-0000-0000-0000-000000000206'
     and covered_month = (date_trunc('month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos') - interval '1 month')::date),
  0::bigint,
  'reactivation does not bill the inactive gap'
);
reset role;

select * from finish();
rollback;
