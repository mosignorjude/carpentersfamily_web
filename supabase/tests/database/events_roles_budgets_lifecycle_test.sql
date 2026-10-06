begin;

select no_plan();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'events'),
  'events use forced RLS'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_role_assignments'),
  'event role assignments use forced RLS'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_budgets'),
  'event budgets use forced RLS'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_budget_allocations'),
  'event budget allocations use forced RLS'
);
select ok(
  exists (
    select 1 from pg_catalog.pg_constraint as c
    where c.conrelid = 'public.events'::regclass
      and c.conname = 'events_starts_at_range_check'
  ),
  'event timestamps have database-enforced supported date bounds'
);
select ok(
  has_column_privilege('authenticated', 'public.events', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.events', 'archived_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.events', 'archive_reason', 'SELECT')
  and not has_column_privilege('authenticated', 'public.events', 'created_by', 'SELECT')
  and not has_table_privilege('authenticated', 'public.events', 'INSERT,UPDATE,DELETE'),
  'members receive safe event fields only and cannot write event rows directly'
);
select ok(
  has_column_privilege('authenticated', 'public.event_role_assignments', 'role', 'SELECT')
  and has_column_privilege('authenticated', 'public.event_role_assignments', 'revoked_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_role_assignments', 'grant_reason', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_role_assignments', 'assigned_by', 'SELECT')
  and not has_table_privilege('authenticated', 'public.event_role_assignments', 'INSERT,UPDATE,DELETE'),
  'member-visible event staffing omits private assignment history fields and direct writes'
);
select ok(
  has_column_privilege('authenticated', 'public.event_budgets', 'total_ngn', 'SELECT')
  and has_column_privilege('authenticated', 'public.event_budget_allocations', 'allocation_name', 'SELECT')
  and not has_table_privilege('authenticated', 'public.event_budgets', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.event_budget_allocations', 'INSERT,UPDATE,DELETE'),
  'active members can read budget details but cannot write them directly'
);
select ok(
  not has_table_privilege('anon', 'public.events', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.event_role_assignments', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.event_budgets', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_function_privilege('anon', 'public.create_event(text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_event_status(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_event(text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.assign_event_role(uuid,uuid,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_event_budget(uuid,bigint,jsonb,text)', 'EXECUTE'),
  'only authenticated requests can use the event procedures'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as p
   where p.oid = 'private.set_event_status(uuid,text,text)'::regprocedure)
  and (select not p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'public.set_event_status(uuid,text,text)'::regprocedure),
  'private mutation procedure uses a fixed search path and public wrapper is invoker'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated', 'event-admin@example.test', '', '{}'::jsonb, '{"full_name":"Event Admin","username":"event_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated', 'event-backup@example.test', '', '{}'::jsonb, '{"full_name":"Event Backup","username":"event_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000703', 'authenticated', 'authenticated', 'event-exec@example.test', '', '{}'::jsonb, '{"full_name":"Event Executive","username":"event_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000704', 'authenticated', 'authenticated', 'event-member@example.test', '', '{}'::jsonb, '{"full_name":"Event Member","username":"event_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000705', 'authenticated', 'authenticated', 'event-lead@example.test', '', '{}'::jsonb, '{"full_name":"Event Lead","username":"event_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000706', 'authenticated', 'authenticated', 'event-assistant@example.test', '', '{}'::jsonb, '{"full_name":"Event Assistant","username":"event_assistant"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000707', 'authenticated', 'authenticated', 'event-committee@example.test', '', '{}'::jsonb, '{"full_name":"Event Committee","username":"event_committee"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000708', 'authenticated', 'authenticated', 'event-replacement@example.test', '', '{}'::jsonb, '{"full_name":"Event Replacement","username":"event_replacement"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000709', 'authenticated', 'authenticated', 'event-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Event Inactive","username":"event_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000710', 'authenticated', 'authenticated', 'event-pending@example.test', '', '{}'::jsonb, '{"full_name":"Event Pending","username":"event_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000701'::uuid
  and '00000000-0000-0000-0000-000000000708'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000709';

insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
) values
  ('00000000-0000-0000-0000-000000000701', 'admin', '00000000-0000-0000-0000-000000000701', 'Event test Admin'),
  ('00000000-0000-0000-0000-000000000702', 'backup_admin', '00000000-0000-0000-0000-000000000701', 'Event test Backup Admin'),
  ('00000000-0000-0000-0000-000000000703', 'executive', '00000000-0000-0000-0000-000000000701', 'Event test Executive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
select throws_ok(
  $$select public.create_event(
    'Out of range event', 'meeting', '2200-01-01 00:00:00+00',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  '23514',
  'new row for relation "events" violates check constraint "events_starts_at_range_check"',
  'direct RPC callers cannot create events beyond the accepted timestamp range'
);
select set_config(
  'test.event_one_id',
  public.create_event(
    'Members Meeting', 'meeting', '2026-10-10 18:00:00+01',
    'Club Hall', 'Quarterly club meeting', true, true, true, true, true, false
  )::text,
  true
);
select set_config(
  'test.event_two_id',
  public.create_event(
    'Annual Party', 'party', '2026-12-20 18:00:00+01',
    'Community Centre', null, false, false, true, true, true, true
  )::text,
  true
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000705',
    'lead', 'Assigned as event lead'
  )$$,
  'an Executive can assign a lead for the selected event'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000706',
    'assistant', 'Assigned as event assistant'
  )$$,
  'an Executive can assign an assistant for the selected event'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000707',
    'committee', 'Assigned to committee'
  )$$,
  'an Executive can assign a committee member for the selected event'
);
select throws_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000709',
    'committee', 'Inactive members are ineligible'
  )$$,
  '23503', 'Event roles can only be assigned to an active member.',
  'deactivated members cannot receive event roles'
);
select is(
  (select count(*) from public.event_role_assignments
   where event_id = current_setting('test.event_one_id')::uuid
     and revoked_at is null),
  3::bigint,
  'one current lead, one assistant, and a committee assignment are retained'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000708',
    'lead', 'Lead reassignment after schedule change'
  )$$,
  'an authorized role change can replace the event lead'
);
select is(
  (select count(*) from public.event_role_assignments
   where event_id = current_setting('test.event_one_id')::uuid
     and role = 'lead' and revoked_at is null),
  1::bigint,
  'the event has at most one current lead'
);
select is(
  (select count(*) from public.event_role_assignments
   where event_id = current_setting('test.event_one_id')::uuid
     and member_id = '00000000-0000-0000-0000-000000000705'
     and role = 'lead' and revoked_at is not null),
  1::bigint,
  'the replaced lead assignment remains in history'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000708', true);
select lives_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":6000},{"name":"Refreshments","amount_ngn":4000}]'::jsonb,
    'Initial approved budget'
  )$$,
  'the event lead can create a budget whose allocation sum is exact'
);
select is(
  (select sum(amount_ngn) from public.event_budget_allocations
   where event_id = current_setting('test.event_one_id')::uuid),
  10000::numeric,
  'stored budget allocations add up exactly to the budget total'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":6000},{"name":"Refreshments","amount_ngn":3999}]'::jsonb,
    'Incorrect allocation total'
  )$$,
  '23514', 'Budget allocations must add up exactly to the budget total.',
  'mismatched allocations are rejected atomically'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":5000},{"name":"venue","amount_ngn":5000}]'::jsonb,
    'Duplicate names'
  )$$,
  '23514', 'Budget allocations must be unique, positive, and within the allowed amount.',
  'case-insensitive duplicate allocation names are rejected'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":5000,"unexpected":"ignored"},{"name":"Rest","amount_ngn":5000}]'::jsonb,
    'Unknown allocation field'
  )$$,
  '23514', 'Each budget allocation must contain only a name and whole-Naira amount.',
  'unexpected allocation fields are rejected'
);
select lives_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":6500},{"name":"Refreshments","amount_ngn":3500}]'::jsonb,
    'Adjusted venue quote'
  )$$,
  'budget updates replace allocations atomically and require a reason'
);
reset role;
select is(
  (select count(*) from public.audit_log
   where entity_type = 'event_budget'
     and entity_id = current_setting('test.event_one_id')::uuid
     and action in ('event_budget_created', 'event_budget_updated')),
  2::bigint,
  'initial and revised budgets create append-only audit records'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000704', true);
select is(
  (select count(*) from public.events),
  2::bigint,
  'active members can read the club event list'
);
select is(
  (select count(*) from public.event_role_assignments
   where event_id = current_setting('test.event_one_id')::uuid and revoked_at is null),
  3::bigint,
  'active members can see current event staffing without the private reason fields'
);
select is(
  (select total_ngn from public.event_budgets
   where event_id = current_setting('test.event_one_id')::uuid),
  10000::bigint,
  'active members can read event budget transparency data'
);
select throws_ok(
  $$select public.create_event(
    'Unauthorized Meeting', 'meeting', '2026-10-11 18:00:00+01',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  '42501', 'Only an active Executive, Admin, or Backup Admin may create an event.',
  'ordinary members cannot create events'
);
select throws_ok(
  $$select public.assign_event_role(
    current_setting('test.event_one_id')::uuid,
    '00000000-0000-0000-0000-000000000704',
    'committee', 'Member tries to assign self'
  )$$,
  '42501', 'Only an active Executive, Admin, or Backup Admin may assign event roles.',
  'ordinary members cannot assign their own event role'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.event_one_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":10000}]'::jsonb,
    'Unauthorized budget'
  )$$,
  '42501', 'Budget changes require an Executive, Admin, Backup Admin, or this event''s lead or assistant.',
  'ordinary members cannot modify event budgets'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.event_two_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":10000}]'::jsonb,
    'Wrong event budget'
  )$$,
  '42501', 'Budget changes require an Executive, Admin, Backup Admin, or this event''s lead or assistant.',
  'lead or assistant access to one event does not authorize another event'
);
select throws_ok(
  $$insert into public.events (
    title, event_type, starts_at, location, status_changed_by, created_by, updated_by
  ) values (
    'Direct write', 'meeting', '2026-10-12 18:00:00+01', 'Club Hall',
    auth.uid(), auth.uid(), auth.uid()
  )$$,
  '42501', 'permission denied for table events',
  'the Data API cannot directly insert event records'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
select set_config(
  'test.oldest_past_event_id',
  public.create_event(
    'Retained old event', 'other', statement_timestamp() - interval '6 days',
    'Club Hall', null, false, false, true, false, false, false
  )::text,
  true
);
select lives_ok(
  $$select public.create_event(
    'Past event five', 'other', statement_timestamp() - interval '5 days',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  'an authorized manager can create a past event for retained reporting'
);
select lives_ok(
  $$select public.create_event(
    'Past event four', 'other', statement_timestamp() - interval '4 days',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  'the second past event is retained'
);
select lives_ok(
  $$select public.create_event(
    'Past event three', 'other', statement_timestamp() - interval '3 days',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  'the third past event is retained'
);
select lives_ok(
  $$select public.create_event(
    'Past event two', 'other', statement_timestamp() - interval '2 days',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  'the fourth past event is retained'
);
select set_config(
  'test.recent_past_event_id',
  public.create_event(
    'Recent past event', 'other', statement_timestamp() - interval '1 day',
    'Club Hall', null, false, false, false, false, false, false
  )::text,
  true
);
reset role;

select ok(
  private.is_event_in_retained_past_archive(current_setting('test.oldest_past_event_id')::uuid),
  'the fifth-oldest past event is placed in the retained archive'
);
select ok(
  not private.is_event_in_retained_past_archive(current_setting('test.recent_past_event_id')::uuid),
  'one of the latest four past events remains in the recent history window'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.oldest_past_event_id')::uuid, 'completed', 'Late status edit'
  )$$,
  '42501', 'Older past events are retained for reporting and are read-only.',
  'an old past event cannot be completed through a direct status RPC'
);
select throws_ok(
  $$select public.set_event_budget(
    current_setting('test.oldest_past_event_id')::uuid, 10000,
    '[{"name":"Venue","amount_ngn":10000}]'::jsonb, 'Late budget edit'
  )$$,
  '42501', 'Older past events are retained for reporting and are read-only.',
  'an old past event cannot receive a new budget through a direct RPC'
);
select throws_ok(
  $$select public.assign_event_role(
    current_setting('test.oldest_past_event_id')::uuid,
    '00000000-0000-0000-0000-000000000704',
    'committee', 'Late role edit'
  )$$,
  '42501', 'Older past events are retained for reporting and are read-only.',
  'an old past event cannot receive new staffing through a direct RPC'
);
select lives_ok(
  $$select public.set_event_status(
    current_setting('test.recent_past_event_id')::uuid, 'completed', 'Recent event closed'
  )$$,
  'the latest four past events retain their normal lifecycle controls'
);
select lives_ok(
  $$select public.archive_event(
    current_setting('test.oldest_past_event_id')::uuid, 'Archived for reporting'
  )$$,
  'an old past event can be explicitly tombstoned with a reason'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000708', true);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_two_id')::uuid, 'completed', 'Cross-event attempt'
  )$$,
  '42501', 'Only an Executive, Admin, Backup Admin, or this event''s lead may complete or cancel it.',
  'an event lead cannot change another event status'
);
select lives_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'completed', 'Meeting concluded'
  )$$,
  'the lead can complete the event they lead'
);
select throws_ok(
  $$select public.update_event_details(
    current_setting('test.event_one_id')::uuid, 'Changed after completion',
    '2026-10-10 18:00:00+01', 'Club Hall', 'Locked', 'Attempt to edit'
  )$$,
  '42501', 'Only scheduled, unarchived events can be edited.',
  'completed event details are locked'
);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'scheduled', 'Lead attempts reopen'
  )$$,
  '42501', 'Only an Admin or Backup Admin may reopen an event.',
  'the lead cannot reopen a completed event'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000703', true);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'scheduled', 'Executive attempts reopen'
  )$$,
  '42501', 'Only an Admin or Backup Admin may reopen an event.',
  'Executive permission does not imply Admin reopening permission'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000702', true);
select lives_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'scheduled', 'Backup Admin reopens meeting'
  )$$,
  'Backup Admin can reopen a completed event under the resolved decision'
);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'cancelled', ''
  )$$,
  '23514', 'The event status request or reason is invalid.',
  'status changes without a reason are rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
select lives_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'cancelled', 'Venue became unavailable'
  )$$,
  'Admin can cancel a reopened event'
);
select lives_ok(
  $$select public.archive_event(
    current_setting('test.event_one_id')::uuid, 'Retained after cancellation'
  )$$,
  'Admin can archive an event with a reason'
);
select is(
  (select status from public.events where id = current_setting('test.event_one_id')::uuid),
  'cancelled',
  'archiving preserves the event lifecycle status'
);
select is(
  (select count(*) from public.event_budgets
   where event_id = current_setting('test.event_one_id')::uuid),
  1::bigint,
  'archiving retains budget history'
);
select is(
  (select count(*) from public.audit_log
   where entity_type = 'event' and entity_id = current_setting('test.event_one_id')::uuid
     and action = 'event_archived'),
  1::bigint,
  'event archival is audited exactly once'
);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_one_id')::uuid, 'scheduled', 'Archived reopen attempt'
  )$$,
  '42501', 'Archived events are read-only.',
  'even an Admin cannot reopen an archived event'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000709', true);
select is(
  (select count(*) from public.events),
  0::bigint,
  'deactivated accounts cannot read events despite an existing auth identity'
);
select throws_ok(
  $$select public.set_event_status(
    current_setting('test.event_two_id')::uuid, 'completed', 'Inactive member attempt'
  )$$,
  '42501', 'Active membership is required.',
  'deactivated accounts cannot mutate event status'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000710', true);
select is(
  (select count(*) from public.event_budgets),
  0::bigint,
  'pending accounts cannot read budgets'
);
select throws_ok(
  $$select public.create_event(
    'Pending Meeting', 'meeting', '2026-10-11 18:00:00+01',
    'Club Hall', null, false, false, false, false, false, false
  )$$,
  '42501', 'Active membership is required.',
  'pending accounts cannot create events'
);
reset role;

select throws_ok(
  $$delete from public.events where id = current_setting('test.event_two_id')::uuid$$,
  '42501', 'Events are archived and retained; they cannot be hard-deleted.',
  'event history cannot be destroyed by a direct database delete'
);
select is(
  (select count(*) from public.audit_log
   where entity_type = 'event' and entity_id = current_setting('test.event_one_id')::uuid
     and action in ('event_created', 'event_details_updated', 'event_completed', 'event_reopened', 'event_cancelled', 'event_archived')),
  5::bigint,
  'event creation, completion, reopening, cancellation, and archival history remains'
);

select * from finish();
rollback;
