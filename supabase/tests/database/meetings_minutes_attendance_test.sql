begin;

select no_plan();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_attendance'),
  'attendance has forced row-level security'
);
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_minutes'),
  'minutes have forced row-level security'
);
select ok(
  has_column_privilege('authenticated', 'public.event_attendance_sessions', 'late_after_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_attendance_sessions', 'qr_challenge_hash', 'SELECT')
  and not has_table_privilege('authenticated', 'public.event_attendance', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.event_minutes', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated users receive safe read columns only; anonymous and direct writes are denied'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as p
   where p.oid = 'private.check_in_event_attendance(uuid,text)'::regprocedure)
  and (select not p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'public.check_in_event_attendance(uuid,text)'::regprocedure),
  'check-in uses a fixed-search-path private procedure behind an invoker wrapper'
);
select ok(
  not has_function_privilege('anon', 'public.check_in_event_attendance(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.check_in_event_attendance(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.correct_event_attendance(uuid,uuid,text,text)', 'EXECUTE'),
  'attendance procedures are available only to authenticated requests'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000001001', 'authenticated', 'authenticated', 'meeting-admin@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Admin","username":"meeting_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001002', 'authenticated', 'authenticated', 'meeting-backup@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Backup","username":"meeting_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001003', 'authenticated', 'authenticated', 'meeting-exec@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Executive","username":"meeting_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001004', 'authenticated', 'authenticated', 'meeting-member@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Member","username":"meeting_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001005', 'authenticated', 'authenticated', 'meeting-lead@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Lead","username":"meeting_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001006', 'authenticated', 'authenticated', 'meeting-assistant@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Assistant","username":"meeting_assistant"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001007', 'authenticated', 'authenticated', 'meeting-committee@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Committee","username":"meeting_committee"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001008', 'authenticated', 'authenticated', 'meeting-other@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Other","username":"meeting_other"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001009', 'authenticated', 'authenticated', 'meeting-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Inactive","username":"meeting_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000001010', 'authenticated', 'authenticated', 'meeting-pending@example.test', '', '{}'::jsonb, '{"full_name":"Meeting Pending","username":"meeting_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000001001'::uuid
  and '00000000-0000-0000-0000-000000001008'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000001009';

insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
) values
  ('00000000-0000-0000-0000-000000001001', 'admin', '00000000-0000-0000-0000-000000001001', 'Meeting test primary Admin'),
  ('00000000-0000-0000-0000-000000001002', 'backup_admin', '00000000-0000-0000-0000-000000001001', 'Meeting test Backup Admin'),
  ('00000000-0000-0000-0000-000000001003', 'executive', '00000000-0000-0000-0000-000000001001', 'Meeting test Executive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select set_config('test.meeting_one_id', public.create_event(
  'Quarterly Meeting', 'meeting', pg_catalog.clock_timestamp() - interval '1 hour',
  'Club Hall', null, true, true, false, false, false, false
)::text, true);
select set_config('test.meeting_two_id', public.create_event(
  'Committee Session', 'meeting', pg_catalog.clock_timestamp() + interval '1 hour',
  'Club Hall', null, true, true, false, false, false, false
)::text, true);
select set_config('test.no_attendance_id', public.create_event(
  'Planning Session', 'meeting', pg_catalog.clock_timestamp() + interval '2 hours',
  'Club Hall', null, false, false, false, false, false, false
)::text, true);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001005', 'lead', 'Assigned to review attendance'
  )$$,
  'an Executive assigns a Lead for attendance-scope tests'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001006', 'assistant', 'Assigned to review attendance'
  )$$,
  'an Executive assigns an Assistant for attendance-scope tests'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001007', 'committee', 'Assigned for committee-scope tests'
  )$$,
  'an Executive assigns Committee for negative-scope tests'
);

select lives_ok(
  $$select public.save_event_minutes(
    current_setting('test.meeting_one_id')::uuid,
    E'Agenda\nTreasurer report\nNext meeting', null
  )$$,
  'an Executive can save minutes with ordinary multiline text'
);
select is(
  (select revision_number from public.event_minutes where event_id = current_setting('test.meeting_one_id')::uuid),
  1,
  'initial minutes create revision one'
);
select throws_ok(
  $$select public.save_event_minutes(
    current_setting('test.meeting_one_id')::uuid, 'Updated minutes', null
  )$$,
  '22023', 'Editing minutes requires a reason.',
  'a reason is required for minutes edits'
);
select lives_ok(
  $$select public.save_event_minutes(
    current_setting('test.meeting_one_id')::uuid, 'Updated minutes', 'Corrected the treasurer name'
  )$$,
  'authorized minutes edits can be reasoned and retained'
);
select is(
  (select count(*)::integer from public.event_minutes_revisions
   where event_id = current_setting('test.meeting_one_id')::uuid),
  2,
  'minutes revisions are retained append-only'
);
select throws_ok(
  $$select public.save_event_minutes(
    current_setting('test.no_attendance_id')::uuid, 'Should not exist', null
  )$$,
  '42501', 'Minutes are not enabled for this event.',
  'minutes cannot be added to an event with the feature disabled'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.save_event_minutes(
    current_setting('test.meeting_one_id')::uuid, 'Backup cannot write minutes', null
  )$$,
  '42501', 'Meeting minutes management access is required.',
  'Backup Admin does not inherit the distinct minutes-author role'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.save_event_minutes(
    current_setting('test.meeting_one_id')::uuid, 'Member cannot write minutes', null
  )$$,
  '42501', 'Meeting minutes management access is required.',
  'an ordinary member cannot write minutes'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_one_id')::uuid, null)$$,
  '42501', 'Only an attendance officer can open check-in.',
  'an ordinary member cannot open attendance'
);
select is(
  (select count(*)::integer from public.event_minutes
   where event_id = current_setting('test.meeting_one_id')::uuid),
  1,
  'active members can read saved minutes'
);
select is(
  (select count(*)::integer from public.event_minutes_revisions
   where event_id = current_setting('test.meeting_one_id')::uuid),
  0,
  'ordinary members cannot read private revision history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.set_attendance_default(21, 'Backup scope check')$$,
  '42501', 'Attendance settings access is required.',
  'Backup Admin cannot change the club-wide attendance cutoff'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_one_id')::uuid, null)$$,
  '42501', 'Only an attendance officer can open check-in.',
  'Backup Admin cannot open or close attendance sessions'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok(
  $$select public.set_attendance_default(20, 'Set club default cutoff')$$,
  'an Executive can change the club-wide late cutoff with a reason'
);
select is(
  (select default_late_after_minutes::integer from public.club_attendance_settings where singleton_id),
  20,
  'the club-wide attendance cutoff is stored'
);
select throws_ok(
  $$select public.set_attendance_default(241, 'Out of bounds')$$,
  '22023', 'Attendance cutoff or reason is invalid.',
  'the club-wide cutoff is bounded at four hours'
);
select lives_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_one_id')::uuid, 0)$$,
  'an Executive can open attendance with an event-specific cutoff'
);
select is(
  (select extract(epoch from (late_after_at - (
      select starts_at from public.events where id = current_setting('test.meeting_one_id')::uuid
    )))::integer
   from public.event_attendance_sessions where event_id = current_setting('test.meeting_one_id')::uuid),
  0,
  'event-specific cutoff is anchored to the stored event instant'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_one_id')::uuid, 15)$$,
  '23505', 'This event already has an attendance session.',
  'an event cannot open a second session or silently reopen a closed session'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.no_attendance_id')::uuid, null)$$,
  '42501', 'Attendance requires a scheduled, non-archived event with attendance enabled.',
  'attendance cannot be enabled by a request when the event feature is off'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_two_id')::uuid, 241)$$,
  '22023', 'The event-specific cutoff must be from 0 to 240 minutes.',
  'event-specific cutoffs reject values beyond the database bound'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001005', true);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_two_id')::uuid, null)$$,
  '42501', 'Only an attendance officer can open check-in.',
  'an event Lead cannot open/close the session reserved to global officers'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001007', true);
select throws_ok(
  $$select public.correct_event_attendance(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001004', 'absent', 'Committee cannot correct'
  )$$,
  '42501', 'Attendance review access is required for this event.',
  'Committee does not receive attendance management by implication'
);
select is(
  (select count(*)::integer from public.event_attendance
   where event_id = current_setting('test.meeting_one_id')::uuid),
  0,
  'members and Committee can see only their own attendance rows'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select is(
  public.check_in_event_attendance(current_setting('test.meeting_one_id')::uuid, null),
  'late',
  'a self check-in after the event cutoff is automatically marked late'
);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_one_id')::uuid, null)$$,
  '23505', 'This member has already checked in for the event.',
  'one member cannot create duplicate attendance'
);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, repeat('a',64))$$,
  '42501', 'Check-in is not open for this event.',
  'a member cannot use a QR for a different unopened event'
);
select is(
  (select count(*)::integer from public.event_attendance
   where event_id = current_setting('test.meeting_one_id')::uuid),
  1,
  'a member reads only their own attendance row'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001005', true);
select lives_ok(
  $$select public.correct_event_attendance(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001004', 'present', 'Verified member at the door'
  )$$,
  'an assigned event Lead can correct attendance within the assigned event'
);
select throws_ok(
  $$select public.correct_event_attendance(
    current_setting('test.meeting_two_id')::uuid,
    '00000000-0000-0000-0000-000000001004', 'absent', 'Cross-event attempt'
  )$$,
  '42501', 'Attendance review access is required for this event.',
  'a Lead cannot review or change attendance for another event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_two_id')::uuid, null)$$,
  'the next session uses the club-wide cutoff when no override is supplied'
);
select is(
  (select late_after_minutes::integer from public.event_attendance_sessions
   where event_id = current_setting('test.meeting_two_id')::uuid),
  20,
  'a session snapshots the then-current club default'
);
select lives_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.meeting_two_id')::uuid,
    repeat('a',64), pg_catalog.clock_timestamp() + interval '90 seconds'
  )$$,
  'an attendance officer can issue a short-lived event QR challenge'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001002', true);
select throws_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.meeting_two_id')::uuid,
    repeat('f',64), pg_catalog.clock_timestamp() + interval '60 seconds'
  )$$,
  '42501', 'Only an attendance officer can issue a check-in QR.',
  'Backup Admin can review and correct attendance but cannot issue check-in QR challenges'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.meeting_two_id')::uuid,
    repeat('b',64), pg_catalog.clock_timestamp() + interval '90 seconds'
  )$$,
  'rotating a QR challenge invalidates its predecessor'
);
select throws_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.meeting_two_id')::uuid,
    repeat('c',64), pg_catalog.clock_timestamp() + interval '3 minutes'
  )$$,
  '22023', 'The QR challenge is invalid or too long-lived.',
  'QR challenge expiry is bounded by the database'
);
select throws_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.no_attendance_id')::uuid,
    repeat('c',64), pg_catalog.clock_timestamp() + interval '60 seconds'
  )$$,
  '42501', 'A QR is available only during an open attendance session.',
  'QR challenges cannot be issued for another event or a closed/disabled session'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, repeat('a',64))$$,
  '42501', 'This QR is expired or has been replaced.',
  'a replaced QR cannot be replayed'
);
set local role postgres;
select set_config('app.attendance_write', 'on', true);
update public.event_attendance_sessions set
  qr_challenge_expires_at = pg_catalog.clock_timestamp() - interval '1 second'
where event_id = current_setting('test.meeting_two_id')::uuid;
select set_config('app.attendance_write', 'off', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, repeat('b',64))$$,
  '42501', 'This QR is expired or has been replaced.',
  'an expired challenge cannot be replayed even while the session remains open'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok(
  $$select public.issue_event_attendance_qr(
    current_setting('test.meeting_two_id')::uuid,
    repeat('d',64), pg_catalog.clock_timestamp() + interval '90 seconds'
  )$$,
  'an attendance officer can replace an expired challenge'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select is(
  public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, repeat('d',64)),
  'present',
  'the current event QR authenticates a self check-in and captures present status'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001009', true);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, null)$$,
  '42501', 'An active member must check in using their own account.',
  'a deactivated account cannot check in using an old session'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001010', true);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, null)$$,
  '42501', 'An active member must check in using their own account.',
  'a pending applicant cannot check in'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001001', true);
select is(
  public.close_event_attendance(current_setting('test.meeting_one_id')::uuid),
  7,
  'closing adds absence rows for active members who did not check in'
);
select is(
  (select count(*)::integer from public.event_attendance
   where event_id = current_setting('test.meeting_one_id')::uuid),
  8,
  'the closed roster retains one row for each active member'
);
select ok(
  (select bool_and(attendance_status = 'absent')
   from public.event_attendance
   where event_id = current_setting('test.meeting_one_id')::uuid
     and member_id <> '00000000-0000-0000-0000-000000001004'),
  'unrecorded active members are absent after session close'
);
select ok(
  (select closed_at is not null
   from public.event_attendance_sessions
   where event_id = current_setting('test.meeting_one_id')::uuid),
  'closing timestamps the session'
);
select throws_ok(
  $$select public.close_event_attendance(current_setting('test.meeting_one_id')::uuid)$$,
  '55000', 'Attendance check-in is already closed.',
  'closing an already closed session fails without creating another absent row set'
);
select throws_ok(
  $$select public.open_event_attendance(current_setting('test.meeting_one_id')::uuid, null)$$,
  '23505', 'This event already has an attendance session.',
  'a closed session is not reopened by opening another session'
);
select lives_ok(
  $$select public.correct_event_attendance(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001008', 'present', 'Member verified at the door'
  )$$,
  'an Admin can correct the closed roster with a reason'
);
select throws_ok(
  $$select public.correct_event_attendance(
    current_setting('test.meeting_one_id')::uuid,
    '00000000-0000-0000-0000-000000001008', 'present', null
  )$$,
  '22023', 'Attendance status or correction reason is invalid.',
  'attendance corrections cannot omit a reason'
);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_one_id')::uuid, null)$$,
  '42501', 'Check-in is not open for this event.',
  'check-in after session close is rejected'
);
select ok(
  exists (
    select 1 from public.audit_log
    where event_id = current_setting('test.meeting_one_id')::uuid
      and action = 'attendance.corrected'
      and target_member_id = '00000000-0000-0000-0000-000000001008'
      and reason = 'Member verified at the door'
  ),
  'attendance correction actor, target, timestamp and reason are audited'
);
select ok(
  exists (
    select 1 from public.event_minutes_revisions
    where event_id = current_setting('test.meeting_one_id')::uuid
      and revision_number = 2 and reason = 'Corrected the treasurer name'
  ),
  'minutes edit reason remains in the officer-only history'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001003', true);
select lives_ok(
  $$select public.set_event_status(
    current_setting('test.meeting_two_id')::uuid, 'cancelled', 'Meeting was postponed'
  )$$,
  'an event lifecycle transition can cancel a meeting'
);
select ok(
  (select closed_at is not null
   from public.event_attendance_sessions
   where event_id = current_setting('test.meeting_two_id')::uuid),
  'terminal event status automatically closes attendance'
);
select ok(
  exists (
    select 1 from public.event_attendance
    where event_id = current_setting('test.meeting_two_id')::uuid
      and member_id = '00000000-0000-0000-0000-000000001008'
      and attendance_status = 'absent'
  ),
  'automatic terminal closure records absent active members'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001004', true);
select throws_ok(
  $$select public.check_in_event_attendance(current_setting('test.meeting_two_id')::uuid, repeat('b',64))$$,
  '42501', 'Check-in is not open for this event.',
  'a QR cannot bypass cancelled event state'
);

select * from finish();
rollback;
