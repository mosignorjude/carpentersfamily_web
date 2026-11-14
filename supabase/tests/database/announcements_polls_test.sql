begin;

select no_plan();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'announcements')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'announcement_reads')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'announcement_polls')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'private' and c.relname = 'poll_voter_eligibility')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'private' and c.relname = 'poll_ballots'),
  'communications and anonymous-vote tables use forced row-level security'
);

select ok(
  has_column_privilege('authenticated', 'public.announcements', 'title', 'SELECT')
  and has_column_privilege('authenticated', 'public.announcement_revisions', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.announcement_poll_revisions', 'id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.announcements', 'created_by', 'SELECT')
  and not has_table_privilege('authenticated', 'public.announcements', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.announcement_reads', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'private.poll_voter_eligibility', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'private.poll_ballots', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'private.poll_voter_eligibility', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'private.poll_ballots', 'SELECT,INSERT,UPDATE,DELETE'),
  'members read only safe content columns; direct writes and all vote-table access are denied'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as p
   where p.oid = 'private.cast_announcement_poll_vote(uuid,uuid)'::regprocedure)
  and (select not p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'public.cast_announcement_poll_vote(uuid,uuid)'::regprocedure)
  and has_function_privilege('authenticated', 'public.cast_announcement_poll_vote(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cast_announcement_poll_vote(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.append_communication_audit(uuid,text,text,uuid,uuid,jsonb,jsonb,text)', 'EXECUTE'),
  'vote writes run through a fixed-search-path private function and a restricted invoker wrapper'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as p
   where p.oid = 'private.get_announcement_poll_summary()'::regprocedure)
  and has_function_privilege('authenticated', 'public.get_announcement_poll_summary()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_announcement_poll_summary()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.get_announcement_poll_summary()', 'EXECUTE'),
  'the live summary is a bounded authenticated aggregate with no anonymous execution path'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_attribute as a
    where a.attrelid = 'private.poll_ballots'::regclass
      and a.attnum > 0 and not a.attisdropped
      and a.attname in ('member_id', 'voter_id', 'cast_at', 'voted_at')
  ),
  'anonymous ballot rows contain no voter identity or vote timestamp'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000002001', 'authenticated', 'authenticated', 'comms-admin@example.test', '', '{}'::jsonb, '{"full_name":"Comms Admin","username":"comms_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002002', 'authenticated', 'authenticated', 'comms-backup@example.test', '', '{}'::jsonb, '{"full_name":"Comms Backup","username":"comms_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002003', 'authenticated', 'authenticated', 'comms-exec@example.test', '', '{}'::jsonb, '{"full_name":"Comms Executive","username":"comms_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002004', 'authenticated', 'authenticated', 'comms-member@example.test', '', '{}'::jsonb, '{"full_name":"Comms Member","username":"comms_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002005', 'authenticated', 'authenticated', 'comms-lead@example.test', '', '{}'::jsonb, '{"full_name":"Comms Lead","username":"comms_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002006', 'authenticated', 'authenticated', 'comms-committee@example.test', '', '{}'::jsonb, '{"full_name":"Comms Committee","username":"comms_committee"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002007', 'authenticated', 'authenticated', 'comms-other@example.test', '', '{}'::jsonb, '{"full_name":"Comms Other","username":"comms_other"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002008', 'authenticated', 'authenticated', 'comms-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Comms Inactive","username":"comms_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002009', 'authenticated', 'authenticated', 'comms-pending@example.test', '', '{}'::jsonb, '{"full_name":"Comms Pending","username":"comms_pending"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002010', 'authenticated', 'authenticated', 'comms-member-two@example.test', '', '{}'::jsonb, '{"full_name":"Comms Member Two","username":"comms_member_two"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000002001'::uuid
  and '00000000-0000-0000-0000-000000002007'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000002008';
update public.member_profiles set status = 'active'
where id = '00000000-0000-0000-0000-000000002010';

insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
) values
  ('00000000-0000-0000-0000-000000002001', 'admin', '00000000-0000-0000-0000-000000002001', 'Communications security test'),
  ('00000000-0000-0000-0000-000000002002', 'president', '00000000-0000-0000-0000-000000002001', 'Communications security test'),
  ('00000000-0000-0000-0000-000000002003', 'executive', '00000000-0000-0000-0000-000000002001', 'Communications security test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002003', true);
select set_config('test.comms_event_one', public.create_event(
  'Communications Event One', 'meeting', pg_catalog.clock_timestamp() + interval '2 days',
  'Club Hall', null, true, true, false, false, false, false
)::text, true);
select set_config('test.comms_event_two', public.create_event(
  'Communications Event Two', 'meeting', pg_catalog.clock_timestamp() + interval '3 days',
  'Club Hall', null, true, true, false, false, false, false
)::text, true);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.comms_event_one')::uuid,
    '00000000-0000-0000-0000-000000002005', 'lead', 'Scoped communications test'
  )$$,
  'an Executive assigns an event Lead for scoped publication'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.comms_event_one')::uuid,
    '00000000-0000-0000-0000-000000002006', 'committee', 'Scoped communications test'
  )$$,
  'an Executive assigns Committee for explicit denial tests'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
select set_config('test.club_announcement', public.create_announcement(
  null, 'Club Notice', 'The monthly meeting is on Saturday.'
)::text, true);
select set_config('test.poll_yes_no', public.create_announcement_poll(
  null, 'Should the club host a picnic?', 60, 'yes_no', array['Yes', 'No']::text[]
)::text, true);
select set_config('test.poll_expired', public.create_announcement_poll(
  null, 'Should expire?', 5, 'yes_no', array['Yes', 'No']::text[]
)::text, true);

select lives_ok(
  $$select public.update_announcement_poll(
    current_setting('test.poll_yes_no')::uuid, 'Should the club host a summer picnic?',
    60, 'yes_no', array['Yes', 'No']::text[], 'Clarified the event period'
  )$$,
  'an Admin can make a reasoned poll edit before the first vote'
);
select is(
  (select count(*)::integer from public.announcement_poll_revisions
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  2,
  'poll edits retain append-only configuration history'
);
set local role postgres;
select is(
  (select count(*)::integer from public.audit_log
   where entity_id = current_setting('test.poll_yes_no')::uuid
     and action in ('poll.created', 'poll.edited')),
  2,
  'poll creation and reasoned edit append audit entries'
);
select is(
  (select reason from public.audit_log
   where entity_id = current_setting('test.poll_yes_no')::uuid
     and action = 'poll.edited'),
  'Clarified the event period',
  'poll audit captures the editor reason'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002003', true);
select set_config('test.event_announcement', public.create_announcement(
  current_setting('test.comms_event_one')::uuid,
  'Event Notice', 'Meet at the north gate.'
)::text, true);
select set_config('test.event_poll', public.create_announcement_poll(
  current_setting('test.comms_event_one')::uuid,
  'Which time works?', 1440, 'multiple_choice', array['Morning', 'Afternoon', 'Evening']::text[]
)::text, true);
select lives_ok(
  $$select public.create_announcement(
    null, 'Executive notice', 'This is a club-wide notice.'
  )$$,
  'an Executive can publish a club-wide notice'
);
select lives_ok(
  $$select public.create_announcement_poll(
    null, 'Club-wide poll?', 120, 'multiple_choice', array['First', 'Second']::text[]
  )$$,
  'an Executive can publish a club-wide poll'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002005', true);
select set_config('test.lead_announcement', public.create_announcement(
  current_setting('test.comms_event_one')::uuid,
  'Lead Notice', 'Event-only announcement.'
)::text, true);
select set_config('test.lead_poll', public.create_announcement_poll(
  current_setting('test.comms_event_one')::uuid,
  'Lead poll?', 60, 'multiple_choice', array['One', 'Two']::text[]
)::text, true);
select throws_ok(
  $$select public.create_announcement(null, 'Too broad', 'Lead must stay event-scoped.')$$,
  '42501', 'Announcement publishing access is required.',
  'an Event Lead cannot publish club-wide announcements'
);
select throws_ok(
  $$select public.create_announcement_poll(
    current_setting('test.comms_event_two')::uuid,
    'Wrong event?', 60, 'yes_no', array['Yes', 'No']::text[]
  )$$,
  '42501', 'Poll publishing access is required.',
  'a Lead cannot publish into another event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002006', true);
select throws_ok(
  $$select public.create_announcement(
    current_setting('test.comms_event_one')::uuid, 'Committee notice', 'Not allowed.'
  )$$,
  '42501', 'Announcement publishing access is required.',
  'Committee does not inherit publisher permissions'
);
select throws_ok(
  $$select public.create_announcement_poll(
    current_setting('test.comms_event_one')::uuid,
    'Committee poll?', 60, 'yes_no', array['Yes', 'No']::text[]
  )$$,
  '42501', 'Poll publishing access is required.',
  'Committee cannot create polls'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', true);
select ok(
  private.can_publish_communications(null),
  'the President holds club-wide publishing access'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select is((select count(*)::integer from public.announcements), 4,
  'active members can read all club and event announcements');
select is((select count(*)::integer from public.announcement_polls), 5,
  'active members can read all club and event polls');
select lives_ok(
  $$select public.mark_announcement_read(current_setting('test.club_announcement')::uuid)$$,
  'a member can add their own private read marker'
);
select is(
  (select count(*)::integer from public.announcement_reads
   where announcement_id = current_setting('test.club_announcement')::uuid),
  1,
  'a member can see their own read marker'
);
select throws_ok(
  $$insert into public.announcement_reads (announcement_id, member_id)
    values (current_setting('test.club_announcement')::uuid,
      '00000000-0000-0000-0000-000000002007')$$,
  '42501', 'permission denied for table announcement_reads',
  'a member cannot insert a read marker for another member'
);
select throws_ok(
  $$select public.update_announcement(
    current_setting('test.club_announcement')::uuid, 'Tampered notice', 'Changed', 'Member tampering'
  )$$,
  '42501', 'Announcement editing access is required.',
  'an ordinary member cannot edit an announcement'
);
select throws_ok(
  $$select public.create_announcement(null, 'Member notice', 'Not a publisher.')$$,
  '42501', 'Announcement publishing access is required.',
  'an ordinary member cannot publish an announcement'
);
select throws_ok(
  $$select public.create_announcement_poll(
    null, 'Member poll?', 60, 'yes_no', array['Yes', 'No']::text[]
  )$$,
  '42501', 'Poll publishing access is required.',
  'an ordinary member cannot publish a poll'
);
select throws_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    (select id from public.announcement_poll_options
     where poll_id = current_setting('test.event_poll')::uuid and label = 'Morning')
  )$$,
  '22023', 'The selected poll option is invalid.',
  'an option ID from another poll is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002005', true);
select lives_ok(
  $$select public.update_announcement(
    current_setting('test.lead_announcement')::uuid,
    'Updated Event Notice', 'Meet at the east gate.', 'The venue entrance changed'
  )$$,
  'an Event Lead can reason and retain an edit for their event'
);
select throws_ok(
  $$select public.update_announcement(
    current_setting('test.club_announcement')::uuid, 'Changed', 'Changed', 'Wrong scope'
  )$$,
  '42501', 'Announcement editing access is required.',
  'an Event Lead cannot edit a club-wide announcement'
);
select is(
  (select count(*)::integer from public.announcement_revisions
   where announcement_id = current_setting('test.lead_announcement')::uuid),
  2,
  'the event announcement keeps its prior version and edit reason'
);
select is(
  (select count(*)::integer from public.announcement_revisions
   where announcement_id = current_setting('test.lead_announcement')::uuid),
  2,
  'an authorized Event Lead can review revisions for their event'
);
set local role postgres;
select is(
  (select count(*)::integer from public.audit_log
   where entity_id = current_setting('test.lead_announcement')::uuid
     and action in ('announcement.created', 'announcement.edited')),
  2,
  'announcement creation and edit append audit entries'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002005', true);
select is(
  (select count(*)::integer from public.announcement_revisions
   where announcement_id = current_setting('test.club_announcement')::uuid),
  0,
  'an Event Lead cannot review club-wide revision history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002007', true);
select is(
  (select count(*)::integer from public.announcement_reads),
  0,
  'another active member cannot see someone else’s private read state'
);
select is(
  (select count(*)::integer from public.announcement_revisions
   where announcement_id = current_setting('test.lead_announcement')::uuid),
  0,
  'ordinary members cannot read announcement revision history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
select set_config('test.poll_yes_option', (
  select id::text from public.announcement_poll_options
  where poll_id = current_setting('test.poll_yes_no')::uuid and label = 'Yes'
), true);
select set_config('test.poll_no_option', (
  select id::text from public.announcement_poll_options
  where poll_id = current_setting('test.poll_yes_no')::uuid and label = 'No'
), true);
select is(public.get_my_announcement_poll_status(current_setting('test.poll_yes_no')::uuid), false,
  'the private vote-status check reveals only whether this Admin has voted');
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  0,
  'no exact poll results are returned while voting is open'
);
select is(
  (select bool_and(votes is null and not results_visible) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  true,
  'the summary suppresses all exact counts while the poll is open, including at zero votes'
);
select is(public.can_manage_announcement(current_setting('test.club_announcement')::uuid), true,
  'Admin can see edit controls for a club-wide announcement');
select is(public.can_manage_announcement_poll(current_setting('test.poll_yes_no')::uuid), true,
  'Admin can see edit controls for an unlocked poll');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select lives_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_yes_option')::uuid
  )$$,
  'an active member can cast a vote as themselves'
);
select is(public.get_my_announcement_poll_status(current_setting('test.poll_yes_no')::uuid), true,
  'a voter can verify that they voted without learning or exposing their choice');
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  0,
  'one vote does not release exact results during an open poll'
);
select is(
  (select bool_and(has_voted) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  true,
  'the batch response reports only the current member’s own vote status'
);
select is(
  (select locked_at is not null from public.announcement_polls
   where id = current_setting('test.poll_yes_no')::uuid),
  true,
  'the first successful vote locks poll configuration'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
select is(public.can_manage_announcement_poll(current_setting('test.poll_yes_no')::uuid), false,
  'even an Admin loses poll edit access after voting starts');
select throws_ok(
  $$select public.update_announcement_poll(
    current_setting('test.poll_yes_no')::uuid, 'Altered after vote', 60,
    'yes_no', array['Yes', 'No']::text[], 'Attempt to rewrite'
  )$$,
  '42501', 'Poll configuration is locked after voting starts or the poll closes.',
  'an authorized Admin cannot change a poll after its first vote'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select throws_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_no_option')::uuid
  )$$,
  '23505', 'A member may vote once and votes are final.',
  'a second or changed vote by the same member is rejected'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002010', true);
select lives_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_no_option')::uuid
  )$$,
  'a second eligible active member can vote independently'
);
select is(
  (select bool_and(votes is null and not results_visible) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  true,
  'two open-poll votes still reveal no exact aggregate through the batch summary'
);
select is(public.get_my_announcement_poll_status(current_setting('test.poll_yes_no')::uuid), true,
  'the second member sees only their own voted status'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', true);
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  0,
  'the President cannot bypass the open-poll result privacy rule'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select throws_ok(
  $$select public.update_announcement(
    current_setting('test.club_announcement')::uuid, 'Member edit', 'Not authorized', 'Not a publisher'
  )$$,
  '42501', 'Announcement editing access is required.',
  'an ordinary member cannot use administrative visibility to edit announcements'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002008', true);
select throws_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_yes_option')::uuid
  )$$,
  '42501', 'An active member account is required.',
  'a deactivated account cannot vote'
);
select is((select count(*)::integer from public.announcements), 0,
  'a deactivated member cannot read announcements');
select is((select count(*)::integer from public.announcement_polls), 0,
  'a deactivated member cannot read polls');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002009', true);
select throws_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_yes_option')::uuid
  )$$,
  '42501', 'An active member account is required.',
  'a pending account cannot vote'
);
select is((select count(*)::integer from public.announcements), 0,
  'a pending member cannot read announcements');
select is((select count(*)::integer from public.announcement_polls), 0,
  'a pending member cannot read polls');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
select lives_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_yes_option')::uuid
  )$$,
  'Admin can vote as an eligible member without receiving live counts'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002003', true);
select lives_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_no_option')::uuid
  )$$,
  'Executive can vote as an eligible member without receiving live counts'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002007', true);
select lives_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_yes_no')::uuid,
    current_setting('test.poll_yes_option')::uuid
  )$$,
  'a fifth eligible member vote is accepted'
);
select is(
  (select bool_and(votes is null and not results_visible) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  true,
  'five votes still reveal no exact count before the poll closes'
);
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  0,
  'the direct per-poll results function also suppresses five open-poll votes'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002001', true);
select throws_ok(
  $$select public.create_announcement_poll(
    null, 'Bad duration', 43201, 'yes_no', array['Yes', 'No']::text[]
  )$$,
  '22023', 'Poll question, duration, type or options are invalid.',
  'poll durations above 30 days are rejected'
);
select throws_ok(
  $$select public.create_announcement_poll(
    null, 'Duplicate choices', 60, 'multiple_choice', array['Choice', ' choice ']::text[]
  )$$,
  '22023', 'Poll choices must be unique, bounded text.',
  'duplicate or whitespace-tampered poll options are rejected'
);
select throws_ok(
  $$select public.mark_announcement_read(gen_random_uuid())$$,
  '42501', 'Announcement is unavailable.',
  'read markers cannot be set for nonexistent announcements'
);

set local role postgres;
alter table public.announcement_polls
  disable trigger announcement_polls_write_guard;
alter table public.announcement_polls
  drop constraint announcement_polls_duration_check;
update public.announcement_polls
set closes_at = pg_catalog.clock_timestamp() - interval '1 second'
where id in (
  current_setting('test.poll_yes_no')::uuid,
  current_setting('test.poll_expired')::uuid
);
alter table public.announcement_polls
  enable trigger announcement_polls_write_guard;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  2,
  'closed polls with at least five votes release option aggregates'
);
select is(
  (select sum(votes)::integer from public.get_announcement_poll_results(current_setting('test.poll_yes_no')::uuid)),
  5,
  'the released aggregate total matches the five recorded anonymous ballots'
);
select is(
  (select bool_and(results_visible) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_yes_no')::uuid),
  true,
  'the batch summary marks released results visible only after closure and threshold'
);
select is(
  (select count(*)::integer from public.get_announcement_poll_results(current_setting('test.poll_expired')::uuid)),
  0,
  'a closed poll below five votes never releases exact results'
);
select is(
  (select bool_and(votes is null and not results_visible) from public.get_announcement_poll_summary()
   where poll_id = current_setting('test.poll_expired')::uuid),
  true,
  'a closed poll below five votes remains count-free in the batch summary'
);
select throws_ok(
  $$select public.cast_announcement_poll_vote(
    current_setting('test.poll_expired')::uuid,
    (select id from public.announcement_poll_options
     where poll_id = current_setting('test.poll_expired')::uuid and label = 'Yes')
  )$$,
  '42501', 'This poll is unavailable or closed.',
  'polls reject votes after their deadline'
);

-- ============================================================================
-- Issues 05 & 06: Draft -> Active -> Archived -> Permanently Deleted Lifecycle
-- ============================================================================

-- President (0000...2002) saves a Club-wide draft with 14d preset: countdown must not start until published.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', true);
select set_config(
  'test.draft_club_announcement',
  public.create_announcement(
    null,
    'Draft club notice',
    'Still being reviewed before release.',
    'important',
    '14d',
    null,
    'draft'
  )::text,
  true
);
select ok(
  (select status = 'draft' and published_at is null and expires_at is null
   from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  'draft announcements do not start expiry countdown before publication and President can set priority'
);

-- Ordinary member (0000...2004) cannot see drafts, cannot archive, cannot restore.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002004', true);
select is(
  (select count(*)::integer from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  0,
  'ordinary members cannot read draft announcements via RLS'
);
select is(
  (select count(*)::integer from public.list_draft_announcements()),
  0,
  'ordinary members see no entries from list_draft_announcements'
);
select throws_ok(
  $$select public.archive_announcement(current_setting('test.club_announcement')::uuid, 'Unauthorized delete')$$,
  '42501', 'Announcement deletion access is required.',
  'ordinary members cannot delete announcements'
);

-- Event Lead (0000...2005) cannot delete or edit Club-wide announcements, and cannot archive other events.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002005', true);
select throws_ok(
  $$select public.archive_announcement(current_setting('test.club_announcement')::uuid, 'Lead delete club note')$$,
  '42501', 'Announcement deletion access is required.',
  'Event Leads cannot delete club-wide announcements'
);
select is(
  (select count(*)::integer from public.list_draft_announcements()
   where id = current_setting('test.draft_club_announcement')::uuid),
  0,
  'Event Leads cannot list club-wide draft announcements'
);

-- Event Lead can set custom/preset duration, edit duration, delete (archive), and restore for their assigned event.
select set_config(
  'test.lead_timed_announcement',
  public.create_announcement(
    current_setting('test.comms_event_one')::uuid,
    'Event logistics timing',
    'Doors open early for setup team.',
    'standard',
    '7d',
    null,
    'active'
  )::text,
  true
);
select ok(
  (select status = 'active' and expires_at > published_at + interval '6 days'
   from public.announcements
   where id = current_setting('test.lead_timed_announcement')::uuid),
  'Event Leads can configure publication duration on their event announcements'
);

-- President publishes draft: published_at and expires_at (14d from publish) are stamped atomically.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', true);
select lives_ok(
  $$select public.publish_announcement(current_setting('test.draft_club_announcement')::uuid)$$,
  'Club President can publish a club-wide draft announcement'
);
select ok(
  (select status = 'active'
     and published_at is not null
     and expires_at between published_at + interval '13 days 23 hours' and published_at + interval '14 days 1 hour'
   from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  'publishing a draft starts the expiry countdown from published_at'
);

-- Content edit in keep mode preserves exact expires_at; manual archive sets 7-day purge_after.
select set_config(
  'test.before_edit_expires',
  (select expires_at::text from public.announcements where id = current_setting('test.draft_club_announcement')::uuid),
  true
);
select lives_ok(
  $$select public.update_announcement(
    current_setting('test.draft_club_announcement')::uuid,
    'Draft club notice updated',
    'Updated copy without resetting expiry.',
    'Copy clarity',
    'important',
    '14d',
    null,
    'keep'
  )$$,
  'editing content with keep mode succeeds'
);
select is(
  (select expires_at from public.announcements where id = current_setting('test.draft_club_announcement')::uuid),
  current_setting('test.before_edit_expires')::timestamptz,
  'editing announcement content preserves existing expires_at'
);
select lives_ok(
  $$select public.archive_announcement(current_setting('test.draft_club_announcement')::uuid, 'No longer needed')$$,
  'authorized officer can manually archive an active announcement'
);
select ok(
  (select status = 'archived'
     and archive_reason = 'manual_delete'
     and purge_after between archived_at + interval '6 days 23 hours' and archived_at + interval '7 days 1 hour'
   from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  'manual deletion moves announcement to archive with 7-day purge_after'
);

-- Expired archived announcement requires new future duration on restore; non-expired manual archive restores cleanly.
select lives_ok(
  $$select public.restore_announcement(current_setting('test.draft_club_announcement')::uuid, null, null, 'Restored by President')$$,
  'unexpired manually deleted announcement restores cleanly without re-broadcast'
);

-- Simulate cron auto-archival and 7-day permanent purge while preserving audit_log.
reset role;
alter table public.announcements disable trigger announcements_write_guard;
update public.announcements
set expires_at = pg_catalog.clock_timestamp() - interval '1 hour',
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    purge_after = null,
    status = 'active'
where id = current_setting('test.draft_club_announcement')::uuid;
alter table public.announcements enable trigger announcements_write_guard;

select lives_ok(
  $$select private.process_announcement_lifecycle()$$,
  'lifecycle worker auto-archives expired active announcements'
);
select ok(
  (select status = 'archived' and archive_reason = 'expired' and purge_after > pg_catalog.clock_timestamp() + interval '6 days'
   from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  'expired active announcement moves automatically to archive for 7 days'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002002', true);
select throws_ok(
  $$select public.restore_announcement(current_setting('test.draft_club_announcement')::uuid, null, null, 'Attempt keep expired')$$,
  '22023', 'Expired announcements require a new future expiry duration before restoration.',
  'restoring an expired archived announcement requires setting a new future duration'
);

reset role;
alter table public.announcements disable trigger announcements_write_guard;
update public.announcements
set purge_after = pg_catalog.clock_timestamp() - interval '1 minute'
where id = current_setting('test.draft_club_announcement')::uuid;
alter table public.announcements enable trigger announcements_write_guard;

select lives_ok(
  $$select private.process_announcement_lifecycle()$$,
  'lifecycle worker permanently purges archived announcements past 7-day retention'
);
select is(
  (select count(*)::integer from public.announcements
   where id = current_setting('test.draft_club_announcement')::uuid),
  0,
  'purged announcement is permanently deleted from public.announcements'
);
select ok(
  exists (
    select 1 from public.audit_log
    where entity_type = 'announcement'
      and entity_id = current_setting('test.draft_club_announcement')::uuid
      and action = 'announcement.permanently_deleted'
  ),
  'permanent purge preserves full audit_log history'
);

select * from finish();
rollback;
