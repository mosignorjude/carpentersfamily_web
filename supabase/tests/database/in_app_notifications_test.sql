begin;

select no_plan();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'notifications')
  and (select c.relrowsecurity and c.relforcerowsecurity
       from pg_catalog.pg_class as c
       join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'notification_preferences'),
  'notification and preference rows use forced RLS'
);

select ok(
  has_table_privilege('authenticated', 'public.notifications', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notifications', 'INSERT,UPDATE,DELETE')
  and has_table_privilege('authenticated', 'public.notification_preferences', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notification_preferences', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.notifications', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.notifications', 'SELECT,INSERT,UPDATE,DELETE'),
  'clients can read only their RLS-filtered data; notification writes are RPC-only'
);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as p
   where p.oid = 'private.mark_notification_read(uuid)'::regprocedure)
  and (select not p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'public.mark_notification_read(uuid)'::regprocedure)
  and has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.mark_notification_read(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.generate_scheduled_notifications()', 'EXECUTE'),
  'public actions are invoker wrappers and scheduled fan-out remains private'
);

select ok(
  not exists (
    select 1 from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.notifications'::regclass
      and a.attnum > 0 and not a.attisdropped
      and a.attname in ('voter_id', 'member_id', 'option_id', 'amount_ngn', 'receipt_path')
  ),
  'notification payloads contain no dues amounts, receipt paths, or poll-choice fields'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000002101', 'authenticated', 'authenticated', 'notify-admin@example.test', '', '{}'::jsonb, '{"full_name":"Notify Admin","username":"notify_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002102', 'authenticated', 'authenticated', 'notify-backup@example.test', '', '{}'::jsonb, '{"full_name":"Notify Backup","username":"notify_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002103', 'authenticated', 'authenticated', 'notify-exec@example.test', '', '{}'::jsonb, '{"full_name":"Notify Executive","username":"notify_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002104', 'authenticated', 'authenticated', 'notify-member@example.test', '', '{}'::jsonb, '{"full_name":"Notify Member","username":"notify_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002105', 'authenticated', 'authenticated', 'notify-member-two@example.test', '', '{}'::jsonb, '{"full_name":"Notify Member Two","username":"notify_member_two"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002106', 'authenticated', 'authenticated', 'notify-lead@example.test', '', '{}'::jsonb, '{"full_name":"Notify Lead","username":"notify_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002107', 'authenticated', 'authenticated', 'notify-pending@example.test', '', '{}'::jsonb, '{"full_name":"Notify Pending","username":"notify_pending"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002108', 'authenticated', 'authenticated', 'notify-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Notify Inactive","username":"notify_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002109', 'authenticated', 'authenticated', 'notify-paid@example.test', '', '{}'::jsonb, '{"full_name":"Notify Paid","username":"notify_paid"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000002110', 'authenticated', 'authenticated', 'notify-committee@example.test', '', '{}'::jsonb, '{"full_name":"Notify Committee","username":"notify_committee"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000002101'::uuid
  and '00000000-0000-0000-0000-000000002106'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000002108';
update public.member_profiles set status = 'active'
where id in (
  '00000000-0000-0000-0000-000000002109',
  '00000000-0000-0000-0000-000000002110'
);

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values
  ('00000000-0000-0000-0000-000000002101', 'admin', '00000000-0000-0000-0000-000000002101', 'Notification security test'),
  ('00000000-0000-0000-0000-000000002102', 'backup_admin', '00000000-0000-0000-0000-000000002101', 'Notification security test'),
  ('00000000-0000-0000-0000-000000002103', 'executive', '00000000-0000-0000-0000-000000002101', 'Notification security test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002101', true);
select set_config('test.notification_announcement_one', public.create_announcement(
  null, 'Notification test notice', 'A generic announcement for notification tests.'
)::text, true);
select set_config('test.notification_poll', public.create_announcement_poll(
  null, 'Notification test poll', 60, 'yes_no', array['Yes', 'No']::text[]
)::text, true);

set local role postgres;
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'announcement'
     and dedupe_key = 'announcement:' || current_setting('test.notification_announcement_one')),
  1,
  'announcement creation notifies an active member once without copying content'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002101'
     and category = 'announcement'),
  0,
  'the announcement actor is not sent a duplicate notification'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'new_poll'
     and source_id = current_setting('test.notification_poll')::uuid),
  1,
  'poll creation produces a generic member notice without poll-choice data'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002104', true);
select is(
  (select count(*)::integer from public.notifications where category = 'announcement'),
  1,
  'members can read only their own notification rows'
);
select lives_ok(
  $$select public.mark_notification_read((
    select id from public.notifications where category = 'announcement' limit 1
  ))$$,
  'a member can mark their own notification read through the checked RPC'
);
select throws_ok(
  $$select public.set_notification_preference('dues_reminder', false)$$,
  '23514', 'Notification preference is invalid.',
  'members cannot disable mandatory monthly dues reminders'
);
select lives_ok(
  $$select public.set_notification_preference('announcement', false)$$,
  'an active member can change an allowed routine in-app preference'
);
select is(
  (select count(*)::integer from public.notification_preferences),
  1,
  'a member can read only their own preference rows'
);

set local role postgres;
select ok(
  (select read_at is not null from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'announcement'),
  'the checked read RPC records the read timestamp'
);
select ok(
  exists (
    select 1 from public.audit_log
    where actor_id = '00000000-0000-0000-0000-000000002104'
      and action = 'notification.preference_changed'
      and target_member_id = '00000000-0000-0000-0000-000000002104'
      and after_data = '{"category":"announcement","enabled":false}'::jsonb
  ),
  'a changed preference is recorded in the append-only audit history'
);
select set_config('test.notification_other_member_id', (
  select id::text from public.notifications
  where recipient_id = '00000000-0000-0000-0000-000000002105'
    and category = 'announcement'
  limit 1
), true);
select ok(current_setting('test.notification_other_member_id') <> '',
  'the second member received an independent notification for IDOR testing');

set local role authenticated;
select lives_ok(
  $$select public.mark_notification_read(current_setting('test.notification_other_member_id')::uuid)$$,
  'tampering with a notification ID does not expose or mutate another member record'
);

set local role postgres;
select ok(
  (select read_at is null from public.notifications
   where id = current_setting('test.notification_other_member_id')::uuid),
  'an IDOR read attempt leaves the other member notification unchanged'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002101', true);
select set_config('test.notification_announcement_two', public.create_announcement(
  null, 'Second notification test notice', 'A second generic announcement.'
)::text, true);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'announcement'),
  1,
  'disabled announcement preference suppresses later matching notifications'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002105'
     and category = 'announcement'),
  2,
  'a preference change does not affect another member'
);

select set_config('app.notification_insert_write', 'on', true);
insert into public.notifications (
  recipient_id, category, title, body, source_type, dedupe_key
) values
  ('00000000-0000-0000-0000-000000002107', 'announcement', 'Pending test notice', 'A test notice.', 'audit', 'state-test-pending'),
  ('00000000-0000-0000-0000-000000002108', 'announcement', 'Deactivated test notice', 'A test notice.', 'audit', 'state-test-deactivated');
select set_config('app.notification_insert_write', 'off', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002107', true);
select is(
  (select count(*)::integer from public.notifications), 0,
  'pending accounts cannot read notification rows even if a row exists'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002108', true);
select is(
  (select count(*)::integer from public.notifications), 0,
  'deactivated accounts cannot read notification rows even if a row exists'
);

set local role postgres;

select lives_ok(
  $$select private.queue_poll_closing_notifications((
    select created_at + ((closes_at - created_at) * 0.8)
    from public.announcement_polls
    where id = current_setting('test.notification_poll')::uuid
  ))$$,
  'the scheduler queues a poll-closing reminder after the 75-percent threshold'
);
select lives_ok(
  $$select private.queue_poll_closing_notifications((
    select created_at + ((closes_at - created_at) * 0.8)
    from public.announcement_polls
    where id = current_setting('test.notification_poll')::uuid
  ))$$,
  'replaying a poll-closing job is idempotent'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'poll_closing'
     and source_id = current_setting('test.notification_poll')::uuid),
  1,
  'a repeated scheduled run creates only one closing-soon notice per poll'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002103', true);
select set_config('test.notification_event', public.create_event(
  'Notification Attendance Event', 'meeting', pg_catalog.clock_timestamp() + interval '2 days',
  'Club Hall', null, true, true, false, false, false, false
)::text, true);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.notification_event')::uuid,
    '00000000-0000-0000-0000-000000002106', 'lead', 'Notification security test'
  )$$,
  'event Lead assignment is set up for scoped officer notifications'
);
select lives_ok(
  $$select public.assign_event_role(
    current_setting('test.notification_event')::uuid,
    '00000000-0000-0000-0000-000000002110', 'committee', 'Notification security test'
  )$$,
  'Committee is set up as a separate event role'
);
select lives_ok(
  $$select public.open_event_attendance(current_setting('test.notification_event')::uuid, 15)$$,
  'the authorized Executive opens attendance'
);

set local role postgres;
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'attendance_open'
     and event_id = current_setting('test.notification_event')::uuid),
  1,
  'opening attendance notifies an active member for the correct event'
);
select ok(
  exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002104'
      and category = 'event_activity'
      and event_id = current_setting('test.notification_event')::uuid
  )
  and exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002102'
      and category = 'officer_event'
      and event_id = current_setting('test.notification_event')::uuid
  ),
  'event creation notifies members and global officers with separate generic categories'
);

insert into public.audit_log (
  actor_id, action, entity_type, entity_id, event_id, reason
) values (
  '00000000-0000-0000-0000-000000002103', 'event_ticket_sale_recorded',
  'event_ticket_sale', pg_catalog.gen_random_uuid(),
  current_setting('test.notification_event')::uuid, 'Notification event-finance test'
);
select ok(
  exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002106'
      and category = 'officer_money'
      and event_id = current_setting('test.notification_event')::uuid
  )
  and exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002102'
      and category = 'officer_money'
      and event_id = current_setting('test.notification_event')::uuid
  )
  and not exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002110'
      and category = 'officer_money'
      and event_id = current_setting('test.notification_event')::uuid
  )
  and not exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002104'
      and category = 'officer_money'
      and event_id = current_setting('test.notification_event')::uuid
  ),
  'event finance alerts go only to global officers and that event Lead/Assistant, not Committee or ordinary members'
);

insert into public.audit_log (
  actor_id, action, entity_type, entity_id, target_member_id, reason
) values (
  '00000000-0000-0000-0000-000000002101', 'member_deactivated',
  'member_profile', '00000000-0000-0000-0000-000000002104',
  '00000000-0000-0000-0000-000000002104', 'Notification member-change test'
);
select ok(
  exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002102'
      and category = 'officer_member'
  )
  and exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002103'
      and category = 'officer_member'
  )
  and not exists (
    select 1 from public.notifications
    where recipient_id = '00000000-0000-0000-0000-000000002104'
      and category = 'officer_member'
  ),
  'membership changes alert other active global officers without exposing the target to ordinary members'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002102', true);
select lives_ok(
  $$select public.record_dues_payment(
    '00000000-0000-0000-0000-000000002109'::uuid,
    (select monthly_amount_ngn from public.dues_rates
     where effective_month <= pg_catalog.date_trunc(
       'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
     )::date
     order by effective_month desc limit 1),
    (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    array[pg_catalog.date_trunc(
      'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
    )::date]::date[]
  )$$,
  'authorized payment is recorded for the paid-member reminder exclusion case'
);

set local role postgres;
select lives_ok(
  $$select private.queue_dues_notifications(pg_catalog.date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date)$$,
  'the monthly job creates a reminder for eligible members'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'dues_reminder'),
  1,
  'an active member with an unpaid current month receives a reminder'
);
select is(
  (select count(*)::integer from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002109'
     and category = 'dues_reminder'),
  0,
  'a member whose current-month dues are paid is not reminded'
);
select ok(
  (select body !~ '[0-9]' from public.notifications
   where recipient_id = '00000000-0000-0000-0000-000000002104'
     and category = 'dues_reminder'),
  'dues notice text contains no amount or private dues status'
);
select is(
  private.queue_dues_notifications(pg_catalog.date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date),
  0,
  'the monthly dues run is idempotent for its WAT month key'
);

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'carpenters-in-app-notifications'
      and schedule = '* * * * *'
  ),
  'one per-minute local pg_cron job is configured through cron.schedule'
);

select * from finish();
rollback;
