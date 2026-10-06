begin;

select no_plan();

select has_function('public', 'log_report_export', array['text', 'text'],
  'report export audit procedure exists');
select has_function('public', 'club_finance_report_data', array[]::text[],
  'single-snapshot club finance report function exists');
select has_function('public', 'dues_report_data', array[]::text[],
  'single-snapshot private dues report function exists');
select ok(
  has_function_privilege('authenticated', 'public.log_report_export(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.log_report_export(text,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.log_report_export(text,text)', 'EXECUTE'),
  'only authenticated database users can request an audited report export'
);
select ok(
  has_function_privilege('authenticated', 'public.club_finance_report_data()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.dues_report_data()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.club_finance_report_data()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.dues_report_data()', 'EXECUTE'),
  'report data functions are only executable by authenticated users'
);
select ok(
  not (select p.prosecdef from pg_catalog.pg_proc p
       where p.oid = 'public.log_report_export(text,text)'::regprocedure)
  and (select p.prosecdef from pg_catalog.pg_proc p
       where p.oid = 'private.log_report_export(text,text)'::regprocedure)
  and not (select p.prosecdef from pg_catalog.pg_proc p
       where p.oid = 'public.club_finance_report_data()'::regprocedure)
  and not (select p.prosecdef from pg_catalog.pg_proc p
       where p.oid = 'public.dues_report_data()'::regprocedure),
  'public report data functions are SECURITY INVOKER and audit helper is controlled'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000901', 'authenticated', 'authenticated', 'report-member@example.test', '', '{}'::jsonb, '{"full_name":"Report Member","username":"report_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000902', 'authenticated', 'authenticated', 'report-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Inactive Report Member","username":"inactive_report"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id = '00000000-0000-0000-0000-000000000901';
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000902';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select lives_ok(
  $$select public.log_report_export('finances', 'csv')$$,
  'active member can request an audited finance export'
);
select ok(
  public.club_finance_report_data() is not null
  and public.club_finance_report_data() ? 'summary'
  and public.club_finance_report_data() ? 'transactions',
  'active member can read one-snapshot shared finance report data'
);
select ok(
  public.dues_report_data() is not null
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(public.dues_report_data()->'rows') as report_row(value)
    where report_row.value->>'member_id' <> auth.uid()::text
  ),
  'dues report function preserves self-only member RLS'
);
select is(
  (select count(*) from public.audit_log where action = 'report_export_requested'),
  0::bigint,
  'ordinary member cannot read report export audit history'
);

reset role;
update public.member_profiles set status = 'active'
where id = '00000000-0000-0000-0000-000000000902';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select ok(
  not exists (
    select 1
    from pg_catalog.jsonb_array_elements(public.dues_report_data()->'rows') as report_row(value)
    where report_row.value->>'member_id' = '00000000-0000-0000-0000-000000000902'
  ),
  'active member report excludes another active member dues row'
);
reset role;
insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
) values (
  '00000000-0000-0000-0000-000000000901', 'executive',
  '00000000-0000-0000-0000-000000000901', 'Report access boundary test'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(public.dues_report_data()->'rows') as report_row(value)
    where report_row.value->>'member_id' = '00000000-0000-0000-0000-000000000902'
  ),
  'Executive dues report follows documented officer access'
);
reset role;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000902';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);

select throws_ok(
  $$select public.log_report_export('dues', 'xlsx')$$,
  '23514', 'The report request is invalid.',
  'unsupported export formats are rejected by the database'
);
select throws_ok(
  $$select public.log_report_export('members', 'pdf')$$,
  '23514', 'The report request is invalid.',
  'unsupported report types are rejected by the database'
);
select throws_ok(
  $$select public.log_report_export(null, 'pdf')$$,
  '23514', 'The report request is invalid.',
  'null report types are rejected'
);
reset role;

select is(
  (select count(*) from public.audit_log
   where actor_id = '00000000-0000-0000-0000-000000000901'
     and action = 'report_export_requested'
     and entity_type = 'report'
     and after_data = '{"report_type":"finances","format":"csv"}'::jsonb
     and before_data is null
     and target_member_id is null
     and reason = 'Authenticated member requested a report export.'),
  1::bigint,
  'audit record uses authenticated actor and contains only report type and format'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
select is(public.club_finance_report_data(), null::jsonb,
  'deactivated session cannot read finance report data');
select is(public.dues_report_data(), null::jsonb,
  'deactivated session cannot read dues report data');
select throws_ok(
  $$select public.log_report_export('dues', 'pdf')$$,
  '42501', 'An active member account is required.',
  'deactivated accounts cannot create export audit records'
);
reset role;

select * from finish();
rollback;
