begin;

select no_plan();

select has_table('public', 'ai_report_narratives', 'ai_report_narratives table exists');

select ok(
  not has_table_privilege('anon', 'public.ai_report_narratives', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ai_report_narratives', 'DELETE'),
  'anon has no access and authenticated cannot delete narrative history'
);

select has_function('public', 'is_club_officer', array[]::text[],
  'is_club_officer RPC exists');
select has_function('public', 'ai_generation_quota_ok', array['integer'],
  'ai_generation_quota_ok RPC exists');
select has_function('public', 'get_approved_report_narrative', array['text', 'uuid', 'text'],
  'get_approved_report_narrative RPC exists');
select has_function('public', 'log_ai_report_event', array['text', 'text', 'uuid'],
  'log_ai_report_event RPC exists');
select has_function('public', 'club_overview_report_data', array['date', 'date'],
  'club_overview_report_data RPC exists');
select has_function('public', 'cron_club_overview_report_data', array['date', 'date'],
  'cron_club_overview_report_data RPC exists');
select has_function('public', 'cron_publish_monthly_overview', array['text', 'date', 'date', 'text', 'text', 'text', 'jsonb'],
  'cron_publish_monthly_overview RPC exists');

select ok(
  has_function_privilege('service_role', 'public.cron_club_overview_report_data(date,date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cron_club_overview_report_data(date,date)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cron_club_overview_report_data(date,date)', 'EXECUTE'),
  'cron_club_overview_report_data is restricted to service_role'
);

select ok(
  has_function_privilege('service_role', 'public.cron_publish_monthly_overview(text,date,date,text,text,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cron_publish_monthly_overview(text,date,date,text,text,text,jsonb)', 'EXECUTE'),
  'cron_publish_monthly_overview is restricted to service_role'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000951', 'authenticated', 'authenticated', 'ai-member@example.test', '', '{}'::jsonb, '{"full_name":"AI Member","username":"ai_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000952', 'authenticated', 'authenticated', 'ai-exec@example.test', '', '{}'::jsonb, '{"full_name":"AI Executive","username":"ai_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000953', 'authenticated', 'authenticated', 'ai-admin@example.test', '', '{}'::jsonb, '{"full_name":"AI Admin","username":"ai_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000954', 'authenticated', 'authenticated', 'ai-inactive@example.test', '', '{}'::jsonb, '{"full_name":"AI Inactive","username":"ai_inactive"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id in (
  '00000000-0000-0000-0000-000000000951',
  '00000000-0000-0000-0000-000000000952',
  '00000000-0000-0000-0000-000000000953'
);
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000954';

do $$
declare
  v_admin_id uuid;
begin
  select member_id into v_admin_id
  from public.member_role_assignments
  where role = 'admin' and revoked_at is null
  limit 1;

  if v_admin_id is null then
    insert into public.member_role_assignments (
      member_id, role, assigned_by, grant_reason
    ) values (
      '00000000-0000-0000-0000-000000000953', 'admin', '00000000-0000-0000-0000-000000000953', 'AI fixture admin'
    );
    v_admin_id := '00000000-0000-0000-0000-000000000953';
  else
    insert into public.member_role_assignments (
      member_id, role, assigned_by, grant_reason
    ) values (
      '00000000-0000-0000-0000-000000000953', 'executive', v_admin_id, 'AI fixture second executive'
    );
  end if;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    '00000000-0000-0000-0000-000000000952', 'executive', v_admin_id, 'AI fixture executive'
  );
end $$;

-- 1. Ordinary active member cannot read/write ai_report_narratives or call officer RPCs
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000951', true);

select is(public.is_club_officer(), false, 'ordinary member is not an officer');
select is(public.club_overview_report_data(date '2026-10-01', date '2026-10-31'), null::jsonb,
  'ordinary member cannot load club overview report data');
select throws_ok(
  $$select public.ai_generation_quota_ok(20)$$,
  '42501', 'Only club officers may generate AI report summaries.',
  'ordinary member blocked from quota check'
);
select throws_ok(
  $$insert into public.ai_report_narratives (
      report_type, period_start, period_end, facts_fingerprint,
      provider, model, content, created_by
    ) values (
      'club_finance', date '2026-01-01', date '2026-11-10', repeat('a', 64),
      'gemini', 'gemini-3.5-flash-lite', '{"headline":"Test"}'::jsonb, auth.uid()
    )$$,
  '42501', null,
  'ordinary member blocked by RLS from inserting ai_report_narratives'
);

-- 2. Officer can generate, approve, audit, and check quota
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000952', true);

select is(public.is_club_officer(), true, 'executive is recognized as officer');
select ok(
  public.club_overview_report_data(date '2026-10-01', date '2026-10-31') ? 'club_finance'
  and public.club_overview_report_data(date '2026-10-01', date '2026-10-31') ? 'dues'
  and public.club_overview_report_data(date '2026-10-01', date '2026-10-31') ? 'events'
  and public.club_overview_report_data(date '2026-10-01', date '2026-10-31') ? 'attendance',
  'officer can fetch club_overview_report_data'
);

select lives_ok(
  $$insert into public.ai_report_narratives (
      report_type, period_start, period_end, facts_fingerprint,
      provider, model, content, status, created_by, approved_by, approved_at
    ) values (
      'club_finance', date '2026-01-01', date '2026-11-10', repeat('a', 64),
      'gemini', 'gemini-3.5-flash-lite',
      '{"headline":"Approved club finance summary.","highlights":["Reserve healthy"],"risks":[],"recommendations":[]}'::jsonb,
      'approved', auth.uid(), auth.uid(), clock_timestamp()
    )$$,
  'officer can insert approved club_finance narrative'
);

select lives_ok(
  $$insert into public.ai_report_narratives (
      report_type, period_start, period_end, facts_fingerprint,
      provider, model, content, status, created_by, approved_by, approved_at
    ) values (
      'dues', date '2026-01-01', date '2026-11-10', repeat('c', 64),
      'gemini', 'gemini-3.5-flash-lite',
      '{"headline":"Approved club-wide dues summary.","highlights":["4 members overdue"],"risks":[],"recommendations":[]}'::jsonb,
      'approved', auth.uid(), auth.uid(), clock_timestamp()
    )$$,
  'officer can insert approved dues narrative'
);

select is(public.ai_generation_quota_ok(2), false,
  'quota returns false once officer reaches daily limit');
select is(public.ai_generation_quota_ok(3), true,
  'quota returns true when below daily limit');

select lives_ok(
  $$select public.log_ai_report_event(
      'ai_report_generated',
      'club_finance',
      (select id from public.ai_report_narratives where facts_fingerprint = repeat('a', 64) limit 1)
    )$$,
  'officer can log AI report audit event'
);

-- 3. Member visibility safeguard via get_approved_report_narrative
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000951', true);

select is(
  (select count(*) from public.ai_report_narratives),
  0::bigint,
  'ordinary member still sees zero rows in ai_report_narratives table'
);

select is(
  (select count(*) from public.get_approved_report_narrative('club_finance', null::uuid, repeat('a', 64))),
  1::bigint,
  'ordinary member receives approved club_finance narrative when fingerprint matches'
);

select is(
  (select count(*) from public.get_approved_report_narrative('club_finance', null::uuid, repeat('b', 64))),
  0::bigint,
  'ordinary member receives nothing when fingerprint does not match'
);

select is(
  (select count(*) from public.get_approved_report_narrative('dues', null::uuid, repeat('c', 64))),
  0::bigint,
  'ordinary member is blocked from club-wide dues summary even on matching fingerprint'
);

-- Deactivated user blocked
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000954', true);
select is(
  (select count(*) from public.get_approved_report_narrative('club_finance', null::uuid, repeat('a', 64))),
  0::bigint,
  'deactivated member receives nothing from get_approved_report_narrative'
);

-- 4. Cron system publish is idempotent and notifies officers only
reset role;
select is(
  public.cron_publish_monthly_overview(
    '2026-10',
    date '2026-10-01',
    date '2026-10-31',
    repeat('d', 64),
    'gemini',
    'gemini-3.5-flash-lite',
    '{"headline":"October overview ready.","highlights":["Steady dues"],"risks":[],"recommendations":[]}'::jsonb
  ),
  public.cron_publish_monthly_overview(
    '2026-10',
    date '2026-10-01',
    date '2026-10-31',
    repeat('d', 64),
    'gemini',
    'gemini-3.5-flash-lite',
    '{"headline":"Duplicate attempt ignored.","highlights":["Ignored"],"risks":[],"recommendations":[]}'::jsonb
  ),
  'cron_publish_monthly_overview is idempotent for same fingerprint'
);

select is(
  (select count(*) from public.notifications
   where dedupe_key = 'monthly-overview:2026-10'
     and recipient_id = '00000000-0000-0000-0000-000000000951'),
  0::bigint,
  'ordinary member does not receive monthly overview officer notification'
);

select ok(
  (select count(*) from public.notifications
   where dedupe_key = 'monthly-overview:2026-10'
     and recipient_id in (
       '00000000-0000-0000-0000-000000000952',
       '00000000-0000-0000-0000-000000000953'
     )) = 2,
  'active officers receive monthly overview in-app notification'
);

select * from finish();
rollback;
