begin;

select no_plan();

select has_table('public', 'finance_categories', 'finance categories table exists');
select has_table('public', 'club_financial_transactions', 'club ledger table exists');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'finance_categories')
  and (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'club_financial_transactions'),
  'finance tables have forced RLS'
);
select ok(
  has_column_privilege('authenticated', 'public.club_financial_transactions', 'amount_ngn', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_transactions', 'payer_payee', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_transactions', 'source_note', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_transactions', 'created_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_transactions', 'idempotency_key', 'SELECT')
  and not has_table_privilege('authenticated', 'public.club_financial_transactions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.club_financial_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
  'active members receive intended ledger columns only and clients cannot write directly'
);
select ok(
  not has_function_privilege('anon', 'public.record_club_financial_transaction(text,bigint,date,text,uuid,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.correct_club_financial_transaction(uuid,bigint,date,text,uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.club_finance_summary()', 'EXECUTE'),
  'anonymous callers cannot use finance procedures'
);
select ok(
  not (select p.prosecdef from pg_catalog.pg_proc p
    where p.oid = 'public.record_club_financial_transaction(text,bigint,date,text,uuid,text,text,uuid)'::regprocedure)
  and not (select p.prosecdef from pg_catalog.pg_proc p
    where p.oid = 'public.club_finance_summary()'::regprocedure),
  'public finance wrappers are SECURITY INVOKER'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'finance-admin@example.test', '', '{}'::jsonb, '{"full_name":"Finance Admin","username":"finance_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'finance-backup@example.test', '', '{}'::jsonb, '{"full_name":"Finance Backup","username":"finance_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'finance-exec@example.test', '', '{}'::jsonb, '{"full_name":"Finance Executive","username":"finance_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'finance-member@example.test', '', '{}'::jsonb, '{"full_name":"Finance Member","username":"finance_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'finance-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Finance Inactive","username":"finance_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000306', 'authenticated', 'authenticated', 'finance-pending@example.test', '', '{}'::jsonb, '{"full_name":"Finance Pending","username":"finance_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000301'::uuid
  and '00000000-0000-0000-0000-000000000304'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000305';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000301', 'admin', '00000000-0000-0000-0000-000000000301', 'Finance test primary Admin'),
  ('00000000-0000-0000-0000-000000000302', 'backup_admin', '00000000-0000-0000-0000-000000000301', 'Finance test Backup Admin'),
  ('00000000-0000-0000-0000-000000000303', 'executive', '00000000-0000-0000-0000-000000000301', 'Finance test Executive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
select is((select count(*) from public.club_financial_transactions), 0::bigint,
  'active ordinary member can read the shared ledger');
select is((select count(*) from public.finance_categories), 0::bigint,
  'active ordinary member can read shared categories');
select is((select balance from public.club_finance_summary()), 0::numeric,
  'active ordinary member can read the fixed derived balance');
select throws_ok(
  $$select public.create_finance_category('Member category', 'Unauthorized')$$,
  '42501', 'Only an active Executive, Admin, or Backup Admin may manage categories.',
  'ordinary member cannot create a category'
);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 1000, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, 'Someone', 'Unauthorized', '10000000-0000-0000-0000-000000000001')$$,
  '42501', 'Only an Executive, Admin, or Backup Admin may record club finances.',
  'ordinary member cannot record income'
);
select throws_ok(
  $$insert into public.club_financial_transactions (
    kind, amount_ngn, transaction_date, source_note, created_by, idempotency_key
  ) values ('income', 1000, current_date, 'Direct insert', auth.uid(), gen_random_uuid())$$,
  '42501', null, 'ordinary member cannot directly insert a ledger row'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000305', true);
select is((select count(*) from public.club_financial_transactions), 0::bigint,
  'deactivated session immediately loses shared ledger access');
select is((select count(*) from public.club_finance_summary()), 0::bigint,
  'deactivated member receives no financial aggregate row');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
select set_config(
  'test.finance_category_id',
  public.create_finance_category('Hall hire', 'Approved shared category')::text,
  true
);
select set_config(
  'test.finance_expense_id',
  public.record_club_financial_transaction(
    'expense', 12500, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Community hall rental', current_setting('test.finance_category_id')::uuid,
    'Greenfield Community Hall', null,
    '20000000-0000-0000-0000-000000000001'
  )::text,
  true
);
select is(
  public.record_club_financial_transaction(
    'expense', 12500, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Community hall rental', current_setting('test.finance_category_id')::uuid,
    'Greenfield Community Hall', null,
    '20000000-0000-0000-0000-000000000001'
  ),
  current_setting('test.finance_expense_id')::uuid,
  'retry with identical idempotency key returns the same transaction'
);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'expense', 12501, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Community hall rental', current_setting('test.finance_category_id')::uuid,
    'Greenfield Community Hall', null,
    '20000000-0000-0000-0000-000000000001')$$,
  '23505', 'This submission key was already used for different financial data.',
  'same idempotency key cannot create a different transaction'
);
select set_config(
  'test.finance_income_id',
  public.record_club_financial_transaction(
    'income', 4000, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, 'A. Member', 'Donation for club supplies',
    '20000000-0000-0000-0000-000000000002'
  )::text,
  true
);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 0, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, null, 'Invalid amount', '20000000-0000-0000-0000-000000000003')$$,
  '23514', 'The financial transaction values are invalid.',
  'database rejects zero amount even for an authorized Executive'
);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 10, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, null, E'Unsafe\tvalue', '20000000-0000-0000-0000-000000000005')$$,
  '23514', 'Non-dues income requires a source note and cannot have an expense category.',
  'database rejects control characters in user-provided finance text'
);
select throws_ok(
  $$select public.correct_club_financial_transaction(
    current_setting('test.finance_expense_id')::uuid, 1,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Changed', current_setting('test.finance_category_id')::uuid, 'Changed', null, 'No')$$,
  '42501', 'Only an active Admin or Backup Admin may correct club financial records.',
  'Executive cannot correct or rewrite historical financial values'
);
select throws_ok(
  $$select public.void_club_financial_transaction(
    current_setting('test.finance_expense_id')::uuid, 'Executive attempted void')$$,
  '42501', 'Only an active Admin or Backup Admin may void club financial records.',
  'Executive cannot void a posted transaction'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
select is(
  (select payer_payee from public.club_financial_transactions
   where id = current_setting('test.finance_expense_id')::uuid),
  'Greenfield Community Hall',
  'active members can see payer and payee details for transparency'
);
select is(
  (select source_note from public.club_financial_transactions
   where id = current_setting('test.finance_income_id')::uuid),
  'Donation for club supplies',
  'active members can see source notes for shared income'
);
select is((select count(*) from public.club_financial_transactions), 2::bigint,
  'active members can see every shared club ledger row');
select is((select count(*) from public.audit_log
  where action = 'club_finance_recorded'), 0::bigint,
  'ordinary members cannot view finance audit history');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000306', true);
select is((select count(*) from public.club_financial_transactions), 0::bigint,
  'pending applicant cannot read the shared ledger');
select is((select count(*) from public.finance_categories), 0::bigint,
  'pending applicant cannot read finance categories');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
select is((select other_income from public.club_finance_summary()), 4000::numeric,
  'other-income total includes current non-dues transactions');
select is((select expenses from public.club_finance_summary()), 12500::numeric,
  'expense total includes posted expense transactions');
select is((select balance from public.club_finance_summary()), -8500::numeric,
  'derived balance reconciles income less expense and does not use an opening balance');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'income', 1,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date - 1,
    null, null, null, 'Old income', '20000000-0000-0000-0000-000000000004')$$,
  '42501', 'Only Admin or Backup Admin may enter historical transactions.',
  'Executive cannot backdate a transaction'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select set_config(
  'test.finance_historical_id',
  public.record_club_financial_transaction(
    'expense', 2000, pg_catalog.make_date(extract(year from (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date)::integer, 1, 1),
    'Historic stationery', current_setting('test.finance_category_id')::uuid,
    'Office Supply Store', null, '30000000-0000-0000-0000-000000000001'
  )::text,
  true
);
select lives_ok(
  $$select public.correct_club_financial_transaction(
    current_setting('test.finance_historical_id')::uuid, 2500,
    pg_catalog.make_date(extract(year from (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date)::integer, 1, 1),
    'Historic stationery', current_setting('test.finance_category_id')::uuid,
    'Office Supply Store', null, 'Receipt total was transcribed incorrectly')$$,
  'Admin correction requires reason and preserves before/after audit values'
);
select is(
  (select before_data ->> 'amount_ngn' from public.audit_log
   where entity_id = current_setting('test.finance_historical_id')::uuid
     and action = 'club_finance_corrected'),
  '2000', 'financial correction audit retains the previous amount'
);
select is(
  (select after_data ->> 'amount_ngn' from public.audit_log
   where entity_id = current_setting('test.finance_historical_id')::uuid
     and action = 'club_finance_corrected'),
  '2500', 'financial correction audit retains the replacement amount'
);
select lives_ok(
  $$select public.retire_finance_category(
    current_setting('test.finance_category_id')::uuid, 'Category consolidated')$$,
  'category retirement is reason-required and does not delete history'
);
select is(
  (select category_name_snapshot from public.club_financial_transactions
   where id = current_setting('test.finance_expense_id')::uuid),
  'Hall hire', 'historical expenses retain a category name snapshot after retirement'
);
select throws_ok(
  $$select public.record_club_financial_transaction(
    'expense', 100, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Retired category misuse', current_setting('test.finance_category_id')::uuid,
    'A payee', null, '30000000-0000-0000-0000-000000000002')$$,
  '23503', 'The selected category is unavailable.',
  'retired category cannot be assigned to a new expense'
);
select lives_ok(
  $$select public.correct_club_financial_transaction(
    current_setting('test.finance_expense_id')::uuid, 13000,
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    'Community hall rental', current_setting('test.finance_category_id')::uuid,
    'Greenfield Community Hall', null, 'Correct amount after reviewing receipt')$$,
  'an existing expense may be corrected without erasing its retired category snapshot'
);
select lives_ok(
  $$select public.void_club_financial_transaction(
    current_setting('test.finance_income_id')::uuid, 'Duplicate entry retained for history')$$,
  'Admin can reasonedly void a financial record'
);
select is((select count(*) from public.club_financial_transactions
  where id = current_setting('test.finance_income_id')::uuid and voided_at is not null),
  1::bigint, 'voided transaction remains retained for shared historical transparency');
select is((select other_income from public.club_finance_summary()), 0::numeric,
  'voided income is excluded from the current balance');
select is((select expenses from public.club_finance_summary()), 15500::numeric,
  'corrected expenses update the derived balance');
select is(
  (select count(*) from public.audit_log where action in (
    'club_finance_recorded', 'club_finance_corrected', 'club_finance_voided',
    'finance_category_created', 'finance_category_retired')),
  8::bigint, 'financial creation, correction, void, and category changes append audit rows'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
select lives_ok(
  $$select public.correct_club_financial_transaction(
    current_setting('test.finance_historical_id')::uuid, 2600,
    pg_catalog.make_date(extract(year from (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date)::integer, 1, 1),
    'Historic stationery', current_setting('test.finance_category_id')::uuid,
    'Office Supply Store', null, 'Backup Admin approved correction')$$,
  'Backup Admin has the same financial correction permission as Admin'
);
select lives_ok(
  $$select public.record_club_financial_transaction(
    'income', 750,
    pg_catalog.make_date(extract(year from (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date)::integer, 1, 1),
    null, null, 'Community supporter', 'Backfilled club donation',
    '40000000-0000-0000-0000-000000000001')$$,
  'Backup Admin has the same current-year historical entry permission as Admin'
);
reset role;

select * from finish();
rollback;
