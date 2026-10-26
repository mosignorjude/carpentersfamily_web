begin;

select no_plan();

-- ---------------------------------------------------------------------------
-- Schema and security
-- ---------------------------------------------------------------------------

select has_table('public', 'notification_outbox', 'notification outbox table exists');
select has_table('public', 'notification_reminders', 'notification reminder ledger exists');
select has_type('public', 'notification_outbox_status', 'outbox status enum exists');
select has_type('public', 'reminder_entity_type', 'reminder entity enum exists');
select has_type('public', 'reminder_slot_type', 'reminder slot enum exists');
select has_type('public', 'reminder_state', 'reminder state enum exists');

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'timezone'
      and is_nullable = 'NO'
      and column_default like '%Africa/Lagos%'
  ),
  'events has a required Africa/Lagos timezone with a default'
);

select ok(
  (select class.relrowsecurity and class.relforcerowsecurity
   from pg_catalog.pg_class as class
   join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
   where namespace.nspname = 'public' and class.relname = 'notification_outbox')
  and (select class.relrowsecurity and class.relforcerowsecurity
       from pg_catalog.pg_class as class
       join pg_catalog.pg_namespace as namespace on namespace.oid = class.relnamespace
       where namespace.nspname = 'public' and class.relname = 'notification_reminders'),
  'both notification ledgers use forced row level security'
);

select ok(
  not has_table_privilege('authenticated', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.notification_reminders', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.notification_reminders', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.notification_outbox', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('service_role', 'public.notification_reminders', 'SELECT,INSERT,UPDATE,DELETE'),
  'no client or service role has direct DML on the ledgers'
);

select ok(
  to_regclass('public.idx_notification_outbox_claimable') is not null
  and to_regclass('public.idx_notification_outbox_resend_id') is not null
  and to_regclass('public.idx_notification_reminders_due') is not null,
  'the claim, webhook, and due-reminder indexes exist'
);

select ok(
  (select proc.prosecdef and proc.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public' and proc.proname = 'enqueue_notification_email')
  and (select proc.prosecdef and proc.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as proc
       join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
       where namespace.nspname = 'public' and proc.proname = 'enqueue_notification_broadcast')
  and (select proc.prosecdef and proc.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as proc
       join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
       where namespace.nspname = 'public' and proc.proname = 'claim_notification_outbox_jobs')
  and (select proc.prosecdef and proc.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as proc
       join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
       where namespace.nspname = 'public' and proc.proname = 'evaluate_notification_reminders'),
  'public notification RPCs are security definer with an empty search path'
);

select ok(
  (select has_function_privilege('service_role', proc.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', proc.oid, 'EXECUTE')
      and not has_function_privilege('anon', proc.oid, 'EXECUTE')
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public' and proc.proname = 'evaluate_notification_reminders')
  and (select has_function_privilege('service_role', proc.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', proc.oid, 'EXECUTE')
      and not has_function_privilege('anon', proc.oid, 'EXECUTE')
   from pg_catalog.pg_proc as proc
   join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public' and proc.proname = 'enqueue_notification_email')
  and not exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname in (
        'sync_event_notification_reminders',
        'seed_due_notification_reminders',
        'cancel_stale_dues_reminders'
      )
      and has_function_privilege('authenticated', proc.oid, 'EXECUTE')
  ),
  'notification RPCs are service-role only and private helpers are not client-callable'
);

select ok(
  position(
    'for update skip locked'
    in pg_catalog.lower(
      pg_catalog.pg_get_functiondef(
        (
          select proc.oid
          from pg_catalog.pg_proc as proc
          join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
          where namespace.nspname = 'public'
            and proc.proname = 'claim_notification_outbox_jobs'
        )
      )
    )
  ) > 0,
  'claim uses FOR UPDATE SKIP LOCKED'
);

-- ---------------------------------------------------------------------------
-- Test identities
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000003101', 'authenticated', 'authenticated', 'outbox-admin@example.test', '', '{}'::jsonb, '{"full_name":"Outbox Admin","username":"outbox_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000003102', 'authenticated', 'authenticated', 'outbox-a@example.test', '', '{}'::jsonb, '{"full_name":"Outbox Member A","username":"outbox_member_a"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000003103', 'authenticated', 'authenticated', 'outbox-b@example.test', '', '{}'::jsonb, '{"full_name":"Outbox Member B","username":"outbox_member_b"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000003104', 'authenticated', 'authenticated', 'outbox-pending@example.test', '', '{}'::jsonb, '{"full_name":"Outbox Pending","username":"outbox_pending"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000003105', 'authenticated', 'authenticated', 'outbox-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Outbox Inactive","username":"outbox_inactive"}'::jsonb, now());

update public.member_profiles
set status = 'active'
where id in (
  '00000000-0000-0000-0000-000000003101',
  '00000000-0000-0000-0000-000000003102',
  '00000000-0000-0000-0000-000000003103'
);

update public.member_profiles
set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000003105';

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values (
  '00000000-0000-0000-0000-000000003101', 'admin',
  '00000000-0000-0000-0000-000000003101', 'Outbox reminder test administrator'
);

-- Member A is unpaid from February through October. Member B paid October in
-- the current month. The admin membership period is closed before October so
-- the admin does not add noise to dues assertions.
update public.dues_membership_periods
set starts_month = '2026-02-01'
where member_id = '00000000-0000-0000-0000-000000003102';

update public.dues_membership_periods
set ends_before_month = '2026-10-01'
where member_id = '00000000-0000-0000-0000-000000003101';

with payment as (
  insert into public.dues_payments (member_id, amount_ngn, payment_date, recorded_by)
  values ('00000000-0000-0000-0000-000000003103', 5000, '2026-10-03', '00000000-0000-0000-0000-000000003101')
  returning id
)
select set_config('test.outbox_paid_payment', (select id::text from payment), true);

insert into public.dues_month_dispositions (
  member_id, covered_month, amount_ngn, disposition, payment_id, recorded_by
) values (
  '00000000-0000-0000-0000-000000003103',
  '2026-10-01',
  5000,
  'paid',
  current_setting('test.outbox_paid_payment')::uuid,
  '00000000-0000-0000-0000-000000003101'
);

-- ---------------------------------------------------------------------------
-- Enqueue and idempotency
-- ---------------------------------------------------------------------------

select set_config(
  'test.outbox_one',
  public.enqueue_notification_email(
    'test_enqueue:one:recipient:3102',
    'test_enqueue',
    '00000000-0000-0000-0000-000000003102',
    'OUTBOX-A@EXAMPLE.TEST',
    'Outbox Member A',
    'Test subject',
    'Test heading',
    'A test notification body.',
    'Open dues',
    '/dues',
    'test_enqueue:one',
    '{"kind":"test"}'::jsonb
  )::text,
  true
);

select ok(
  current_setting('test.outbox_one') is not null
  and current_setting('test.outbox_one') <> '',
  'enqueue returns the new outbox id'
);

select is(
  (select recipient_email
   from public.notification_outbox
   where id = current_setting('test.outbox_one')::uuid),
  'outbox-a@example.test',
  'enqueue stores a lower-cased trimmed recipient email'
);

select is(
  public.enqueue_notification_email(
    'test_enqueue:one:recipient:3102',
    'test_enqueue',
    '00000000-0000-0000-0000-000000003102',
    'outbox-a@example.test',
    'Outbox Member A',
    'Test subject',
    'Test heading',
    'A test notification body.',
    'Open dues',
    '/dues',
    'test_enqueue:one',
    '{"kind":"test"}'::jsonb
  ),
  null::uuid,
  'a repeated idempotency key returns NULL'
);

select is(
  (select count(*) from public.notification_outbox
   where idempotency_key = 'test_enqueue:one:recipient:3102'),
  1::bigint,
  'a repeated idempotency key leaves exactly one row'
);

select is(
  public.enqueue_notification_email(
    'test_enqueue:blank',
    'test_enqueue',
    '00000000-0000-0000-0000-000000003102',
    '   ',
    'Outbox Member A',
    'Test subject',
    'Test heading',
    'A test notification body.'
  ),
  null::uuid,
  'a blank recipient email is ignored'
);

select throws_ok(
  $$select public.enqueue_notification_email(
      'test_enqueue:bad', 'test_enqueue',
      '00000000-0000-0000-0000-000000003102'::uuid,
      'not-an-email', 'Outbox Member A',
      'Test subject', 'Test heading', 'A test notification body.'
    )$$,
  '23514',
  'A valid recipient email is required.',
  'a malformed recipient email is rejected'
);

-- ---------------------------------------------------------------------------
-- Broadcast fan-out
-- ---------------------------------------------------------------------------

select is(
  public.enqueue_notification_broadcast(
    'test_broadcast:one',
    'test_broadcast',
    'Broadcast subject',
    'Broadcast heading',
    'Broadcast body',
    null,
    null,
    '{}'::jsonb
  ),
  3,
  'broadcast queues one email for each active member'
);

select is(
  (select count(*)
   from public.notification_outbox
   where batch_group_key = 'test_broadcast:one'),
  3::bigint,
  'broadcast rows share a batch group key'
);

select ok(
  not exists (
    select 1
    from public.notification_outbox as outbox
    join public.member_profiles as profile on profile.id = outbox.recipient_user_id
    where outbox.batch_group_key = 'test_broadcast:one'
      and profile.status <> 'active'
  ),
  'broadcast does not queue pending or deactivated members'
);

select is(
  public.enqueue_notification_broadcast(
    'test_broadcast:one',
    'test_broadcast',
    'Broadcast subject',
    'Broadcast heading',
    'Broadcast body'
  ),
  0,
  'a repeated broadcast is idempotent'
);

-- ---------------------------------------------------------------------------
-- Claim, complete, reschedule, and webhook state
-- ---------------------------------------------------------------------------

update public.notification_outbox
set status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
where status in ('pending', 'paused_rate_limit', 'processing');

select public.enqueue_notification_email(
  'test_claim:one', 'test_claim',
  '00000000-0000-0000-0000-000000003102', 'outbox-a@example.test',
  'Outbox Member A', 'Claim subject', 'Claim heading', 'Claim body.'
);
select public.enqueue_notification_email(
  'test_claim:two', 'test_claim',
  '00000000-0000-0000-0000-000000003103', 'outbox-b@example.test',
  'Outbox Member B', 'Claim subject', 'Claim heading', 'Claim body.'
);
select public.enqueue_notification_email(
  'test_claim:three', 'test_claim',
  '00000000-0000-0000-0000-000000003101', 'outbox-admin@example.test',
  'Outbox Admin', 'Claim subject', 'Claim heading', 'Claim body.'
);
select public.enqueue_notification_email(
  'test_claim:four', 'test_claim',
  '00000000-0000-0000-0000-000000003102', 'outbox-a@example.test',
  'Outbox Member A', 'Claim subject', 'Claim heading', 'Claim body.'
);

update public.notification_outbox
set next_attempt_at = '2026-10-26 11:59:00+00'::timestamptz
where idempotency_key in (
  'test_claim:one', 'test_claim:two', 'test_claim:three', 'test_claim:four'
);

create temporary table test_claimed_one on commit drop as
select *
from public.claim_notification_outbox_jobs(
  2, 300, '2026-10-26 12:00:00+00'::timestamptz
);

select is(
  (select count(*) from test_claimed_one),
  2::bigint,
  'claim returns the requested number of due jobs'
);

select ok(
  (select bool_and(
     status = 'processing'
     and attempt_count = 1
     and locked_until = '2026-10-26 12:05:00+00'::timestamptz
   )
   from test_claimed_one),
  'claimed jobs are processing with an attempt count and a future lock'
);

select set_config(
  'test.claim_one_ids',
  (select array_agg(id)::text from test_claimed_one),
  true
);

create temporary table test_claimed_two on commit drop as
select *
from public.claim_notification_outbox_jobs(
  10, 300, '2026-10-26 12:01:00+00'::timestamptz
);

select is(
  (select count(*) from test_claimed_two),
  2::bigint,
  'a second claim takes only the still-available jobs'
);

select is(
  (select count(*)
   from test_claimed_two
   where id = any (current_setting('test.claim_one_ids')::uuid[])),
  0::bigint,
  'a second claim skips jobs whose lock is still held'
);

select set_config(
  'test.claim_two_ids',
  (select array_agg(id)::text from test_claimed_two),
  true
);

update public.notification_outbox
set locked_until = '2026-10-26 12:00:00+00'::timestamptz
where id = (current_setting('test.claim_one_ids')::uuid[])[1];

create temporary table test_claimed_stale on commit drop as
select *
from public.claim_notification_outbox_jobs(
  10, 300, '2026-10-26 12:01:00+00'::timestamptz
);

select is(
  (select count(*) from test_claimed_stale),
  1::bigint,
  'an expired processing lock is reclaimed'
);

select ok(
  (select id = (current_setting('test.claim_one_ids')::uuid[])[1]
      and attempt_count = 2
   from test_claimed_stale),
  'reclaiming an expired lock increments the attempt count'
);

select is(
  public.complete_notification_outbox_jobs(
    array[(current_setting('test.claim_one_ids')::uuid[])[1]],
    array['re_stale'],
    '2026-10-26 12:02:00+00'::timestamptz
  ),
  1,
  'completing a claimed job returns one updated row'
);

select ok(
  (select status = 'sent'
      and sent_at = '2026-10-26 12:02:00+00'::timestamptz
      and resend_email_id = 're_stale'
      and locked_until is null
   from public.notification_outbox
   where id = (current_setting('test.claim_one_ids')::uuid[])[1]),
  'completion records the provider id and sent time'
);

select is(
  public.apply_resend_webhook_event(
    're_stale', 'email.delivered', '2026-10-26 12:03:00+00'::timestamptz
  ),
  1,
  'a delivered webhook updates one outbox row'
);

select ok(
  (select status = 'delivered'
      and delivered_at = '2026-10-26 12:03:00+00'::timestamptz
   from public.notification_outbox
   where id = (current_setting('test.claim_one_ids')::uuid[])[1]),
  'delivered status and timestamp are stored'
);

select public.apply_resend_webhook_event(
  're_stale', 'email.sent', '2026-10-26 12:04:00+00'::timestamptz
);

select ok(
  (select status = 'delivered'
      and delivered_at = '2026-10-26 12:03:00+00'::timestamptz
   from public.notification_outbox
   where id = (current_setting('test.claim_one_ids')::uuid[])[1]),
  'a late sent webhook does not demote a delivered row'
);

select public.complete_notification_outbox_jobs(
  array[(current_setting('test.claim_one_ids')::uuid[])[2]],
  array['re_one'],
  '2026-10-26 12:02:00+00'::timestamptz
);

select public.complete_notification_outbox_jobs(
  array[(current_setting('test.claim_two_ids')::uuid[])[1]],
  array['re_two'],
  '2026-10-26 12:02:00+00'::timestamptz
);

select is(
  public.apply_resend_webhook_event(
    're_two', 'email.bounced', '2026-10-26 12:03:00+00'::timestamptz
  ),
  1,
  'a bounced webhook updates the outbox row'
);

select ok(
  (select status = 'failed_permanent' and last_error = 'email.bounced'
   from public.notification_outbox
   where id = (current_setting('test.claim_two_ids')::uuid[])[1]),
  'a bounce is permanent and does not retry'
);

select is(
  public.reschedule_notification_outbox_jobs(
    array[(current_setting('test.claim_two_ids')::uuid[])[2]],
    'Resend daily quota exceeded.',
    3600,
    true,
    '2026-10-26 12:02:00+00'::timestamptz
  ),
  1,
  'a rate-limited job is rescheduled'
);

select ok(
  (select status = 'paused_rate_limit'
      and attempt_count = 0
      and next_attempt_at = '2026-10-26 13:02:00+00'::timestamptz
      and last_error = 'Resend daily quota exceeded.'
   from public.notification_outbox
   where id = (current_setting('test.claim_two_ids')::uuid[])[2]),
  'a rate-limit pause preserves the attempt budget and records the retry time'
);

select public.enqueue_notification_email(
  'test_claim:five', 'test_claim',
  '00000000-0000-0000-0000-000000003102', 'outbox-a@example.test',
  'Outbox Member A', 'Claim subject', 'Claim heading', 'Claim body.'
);

update public.notification_outbox
set status = 'pending',
    attempt_count = 5,
    max_attempts = 5,
    next_attempt_at = '2026-10-26 11:00:00+00'::timestamptz
where idempotency_key = 'test_claim:five';

create temporary table test_claimed_exhausted on commit drop as
select *
from public.claim_notification_outbox_jobs(
  1000, 300, '2026-10-26 12:02:00+00'::timestamptz
);

select is(
  (select count(*) from test_claimed_exhausted),
  0::bigint,
  'an exhausted job is not returned by claim'
);

select ok(
  (select status = 'failed_permanent'
   from public.notification_outbox
   where idempotency_key = 'test_claim:five'),
  'an exhausted job is retired as failed_permanent'
);

create temporary table test_claimed_paused on commit drop as
select *
from public.claim_notification_outbox_jobs(
  10, 300, '2026-10-26 13:03:00+00'::timestamptz
);

select ok(
  (select count(*) = 1
      and bool_and(
        id = (current_setting('test.claim_two_ids')::uuid[])[2]
        and attempt_count = 1
      )
   from test_claimed_paused),
  'the paused job is claimable again after its retry time'
);

update public.notification_outbox
set attempt_count = 5,
    status = 'processing',
    locked_until = '2026-10-26 13:10:00+00'::timestamptz
where id = (current_setting('test.claim_two_ids')::uuid[])[2];

select is(
  public.reschedule_notification_outbox_jobs(
    array[(current_setting('test.claim_two_ids')::uuid[])[2]],
    'A non-rate-limit failure.',
    60,
    false,
    '2026-10-26 13:04:00+00'::timestamptz
  ),
  1,
  'a normal retry at the attempt limit is rescheduled'
);

select ok(
  (select status = 'failed_permanent'
   from public.notification_outbox
   where id = (current_setting('test.claim_two_ids')::uuid[])[2]),
  'a normal retry at the attempt limit becomes failed_permanent'
);

select public.enqueue_notification_email(
  'test_claim:six', 'test_claim',
  '00000000-0000-0000-0000-000000003103', 'outbox-b@example.test',
  'Outbox Member B', 'Claim subject', 'Claim heading', 'Claim body.'
);

update public.notification_outbox
set status = 'sent',
    sent_at = '2026-10-26 12:02:00+00'::timestamptz,
    resend_email_id = 're_six'
where idempotency_key = 'test_claim:six';

select is(
  public.apply_resend_webhook_event(
    're_six', 'email.complained', '2026-10-26 12:05:00+00'::timestamptz
  ),
  1,
  'a complaint webhook updates the outbox row'
);

select ok(
  (select status = 'failed_permanent' and last_error = 'email.complained'
   from public.notification_outbox
   where idempotency_key = 'test_claim:six'),
  'a complaint is permanent and does not retry'
);

select is(
  public.apply_resend_webhook_event(
    're_unknown', 'email.delivered', '2026-10-26 12:06:00+00'::timestamptz
  ),
  0,
  'an unknown provider id updates nothing'
);

-- ---------------------------------------------------------------------------
-- Event reminders and rescheduling state machine
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select set_config(
  'test.party10',
  public.create_event(
    'Outbox party ten', 'party',
    pg_catalog.clock_timestamp() + interval '10 days',
    'Main Hall', 'Outbox rescheduling event',
    false, false, false, false, false, false
  )::text,
  true
);

select set_config(
  'test.meeting10',
  public.create_event(
    'Outbox meeting ten', 'meeting',
    pg_catalog.clock_timestamp() + interval '10 days',
    'Board Room', 'Outbox rescheduling meeting',
    false, false, false, false, false, false
  )::text,
  true
);

select set_config(
  'test.past_event',
  public.create_event(
    'Outbox past event', 'party',
    pg_catalog.clock_timestamp() - interval '2 days',
    'Old Hall', 'Outbox past event',
    false, false, false, false, false, false
  )::text,
  true
);

select set_config(
  'test.meeting3',
  public.create_event(
    'Outbox meeting three', 'meeting',
    pg_catalog.clock_timestamp() + interval '3 hours',
    'Side Room', 'Outbox short-notice meeting',
    false, false, false, false, false, false
  )::text,
  true
);

reset role;

select is(
  (select timezone from public.events where id = current_setting('test.party10')::uuid),
  'Africa/Lagos',
  'new events inherit the club timezone'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_type = 'event' and entity_id = current_setting('test.party10')::uuid),
  4::bigint,
  'a non-meeting event seeds four reminder windows'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_type = 'event'
     and entity_id = current_setting('test.party10')::uuid
     and state = 'pending'),
  4::bigint,
  'a future event starts with all four windows pending'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_type = 'meeting' and entity_id = current_setting('test.meeting10')::uuid),
  2::bigint,
  'a meeting seeds only the 24h and 2h windows'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_id = current_setting('test.past_event')::uuid
     and state = 'skipped_past_due'),
  4::bigint,
  'a past event seeds no live reminder windows'
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.meeting3')::uuid
     and reminder_slot = '24h_before'),
  'skipped_past_due'::public.reminder_state,
  'a short-notice meeting skips the already-passed 24h window'
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.meeting3')::uuid
     and reminder_slot = '2h_before'),
  'pending'::public.reminder_state,
  'a short-notice meeting keeps the future 2h window pending'
);

select is(
  private.event_notification_entity_type('meeting'),
  'meeting'::public.reminder_entity_type,
  'meetings use the meeting reminder entity'
);

select is(
  private.event_notification_entity_type('party'),
  'event'::public.reminder_entity_type,
  'parties use the event reminder entity'
);

select is(
  private.event_reminder_scheduled_for(
    '2027-03-14 09:00:00 America/New_York'::timestamptz,
    'America/New_York',
    '24h_before'
  ),
  '2027-03-13 09:00:00 America/New_York'::timestamptz,
  'a reminder window preserves local wall time across a daylight-saving change'
);

select throws_ok(
  $$update public.events
    set timezone = 'Not/AZone'
    where id = current_setting('test.party10')::uuid$$,
  '23514',
  'The event timezone is invalid.',
  'an invalid IANA timezone is rejected'
);

update public.notification_reminders
set state = 'dispatched',
    dispatched_at = '2026-10-26 09:00:00+00'::timestamptz
where entity_id = current_setting('test.party10')::uuid
  and reminder_slot = '7d_before';

select set_config(
  'test.party10_7d_scheduled',
  (
    select scheduled_for::text
    from public.notification_reminders
    where entity_id = current_setting('test.party10')::uuid
      and reminder_slot = '7d_before'
  ),
  true
);

select set_config(
  'test.party10_7d_target',
  (
    select target_occurrence_at::text
    from public.notification_reminders
    where entity_id = current_setting('test.party10')::uuid
      and reminder_slot = '7d_before'
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select public.update_event_details(
  current_setting('test.party10')::uuid,
  'Outbox party updated',
  pg_catalog.clock_timestamp() + interval '12 days',
  'Main Hall',
  'Outbox rescheduling event',
  'Move the event later for the reminder state test'
);

reset role;

select ok(
  (select state = 'dispatched'
      and scheduled_for = current_setting('test.party10_7d_scheduled')::timestamptz
      and target_occurrence_at = current_setting('test.party10_7d_target')::timestamptz
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot = '7d_before'),
  'a dispatched reminder is preserved across a reschedule'
);

select ok(
  (select bool_and(
     state = 'pending'
     and scheduled_for = (
       select starts_at - case reminder_slot
         when '3d_before' then interval '3 days'
         when '24h_before' then interval '24 hours'
         when '2h_before' then interval '2 hours'
       end
       from public.events
       where id = current_setting('test.party10')::uuid
     )
   )
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot in ('3d_before', '24h_before', '2h_before')),
  'unsent reminders are reassessed against the new event time'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select public.update_event_details(
  current_setting('test.party10')::uuid,
  'Outbox party updated',
  pg_catalog.clock_timestamp() + interval '1 day',
  'Main Hall',
  'Outbox rescheduling event',
  'Move the event close for the past-window state test'
);

reset role;

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot = '3d_before'),
  'skipped_past_due'::public.reminder_state,
  'a passed unsent window is skipped instead of sent late'
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot = '24h_before'),
  'pending'::public.reminder_state,
  'a window inside its grace period stays pending'
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot = '7d_before'),
  'dispatched'::public.reminder_state,
  'the dispatched window is still preserved after a second reschedule'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select public.set_event_status(
  current_setting('test.party10')::uuid,
  'cancelled',
  'Cancel the event for the reminder state test'
);

reset role;

select is(
  (select count(*)
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and state = 'cancelled'),
  2::bigint,
  'cancelling an event cancels its pending reminder windows'
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot = '7d_before'),
  'dispatched'::public.reminder_state,
  'cancelling an event does not erase dispatched history'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select public.set_event_status(
  current_setting('test.party10')::uuid,
  'scheduled',
  'Reopen the event for the reminder state test'
);

reset role;

select ok(
  (select bool_and(state = 'pending')
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot in ('24h_before', '2h_before'))
  and (select state = 'dispatched'
       from public.notification_reminders
       where entity_id = current_setting('test.party10')::uuid
         and reminder_slot = '7d_before'),
  'reopening an event reassesses only the unsent windows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select public.archive_event(
  current_setting('test.party10')::uuid,
  'Archive the event for the reminder state test'
);

select public.archive_event(
  current_setting('test.meeting10')::uuid,
  'Archive the meeting for the reminder state test'
);

reset role;

select ok(
  (select bool_and(state = 'cancelled' and skip_reason = 'event_archived')
   from public.notification_reminders
   where entity_id = current_setting('test.party10')::uuid
     and reminder_slot in ('24h_before', '2h_before'))
  and (select count(*) = 2
       from public.notification_reminders
       where entity_id = current_setting('test.meeting10')::uuid
         and state = 'cancelled'
         and skip_reason = 'event_archived'),
  'archiving an event or meeting cancels its pending windows'
);

-- ---------------------------------------------------------------------------
-- Event reminder dispatch and no catch-up bursts
-- ---------------------------------------------------------------------------

select set_config(
  'test.meeting3_eval',
  (
    select (starts_at - interval '1 hour 30 minutes')::text
    from public.events
    where id = current_setting('test.meeting3')::uuid
  ),
  true
);

select public.evaluate_notification_reminders(
  current_setting('test.meeting3_eval')::timestamptz
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.meeting3')::uuid
     and reminder_slot = '2h_before'),
  'dispatched'::public.reminder_state,
  'the due 2h meeting reminder is dispatched'
);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type = 'meeting_reminder_2h'
     and template_payload->>'event_id' = current_setting('test.meeting3')),
  3::bigint,
  'a meeting reminder fans out to every active member exactly once'
);

select ok(
  (select bool_and(
     batch_group_key = 'meeting_reminder_2h:' || current_setting('test.meeting3')
     and cta_url = '/events/' || current_setting('test.meeting3')
     and heading like 'Meeting reminder:%'
     and template_payload->>'reminder_slot' = '2h_before'
   )
   from public.notification_outbox
   where trigger_type = 'meeting_reminder_2h'
     and template_payload->>'event_id' = current_setting('test.meeting3')),
  'meeting reminder payloads share a batch group and carry a relative CTA'
);

select ok(
  not exists (
    select 1
    from public.notification_outbox as outbox
    join public.member_profiles as profile on profile.id = outbox.recipient_user_id
    where outbox.trigger_type = 'meeting_reminder_2h'
      and profile.status <> 'active'
  ),
  'meeting reminders exclude pending and deactivated members'
);

select public.evaluate_notification_reminders(
  current_setting('test.meeting3_eval')::timestamptz
);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type = 'meeting_reminder_2h'
     and template_payload->>'event_id' = current_setting('test.meeting3')),
  3::bigint,
  'replaying the same reminder evaluation does not duplicate email'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select set_config(
  'test.party8',
  public.create_event(
    'Outbox party eight', 'party',
    pg_catalog.clock_timestamp() + interval '8 days',
    'Garden', 'Outbox seven-day reminder event',
    false, false, false, false, false, false
  )::text,
  true
);

reset role;

select set_config(
  'test.party8_eval',
  (
    select (scheduled_for + interval '5 minutes')::text
    from public.notification_reminders
    where entity_id = current_setting('test.party8')::uuid
      and reminder_slot = '7d_before'
  ),
  true
);

select public.evaluate_notification_reminders(
  current_setting('test.party8_eval')::timestamptz
);

select is(
  (select state
   from public.notification_reminders
   where entity_id = current_setting('test.party8')::uuid
     and reminder_slot = '7d_before'),
  'dispatched'::public.reminder_state,
  'the due 7d event reminder is dispatched'
);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type = 'event_reminder_7d'
     and template_payload->>'event_id' = current_setting('test.party8')),
  3::bigint,
  'an event reminder fans out to every active member'
);

select ok(
  (select bool_and(
     batch_group_key = 'event_reminder_7d:' || current_setting('test.party8')
     and cta_url = '/events/' || current_setting('test.party8')
     and heading like 'Event reminder:%'
   )
   from public.notification_outbox
   where trigger_type = 'event_reminder_7d'
     and template_payload->>'event_id' = current_setting('test.party8')),
  'event reminder payloads share a batch group and carry a relative CTA'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003101', true);

select set_config(
  'test.party2',
  public.create_event(
    'Outbox party two', 'party',
    pg_catalog.clock_timestamp() + interval '2 days',
    'Annex', 'Outbox stale window event',
    false, false, false, false, false, false
  )::text,
  true
);

reset role;

select is(
  (select count(*)
   from public.notification_reminders
   where entity_id = current_setting('test.party2')::uuid
     and reminder_slot in ('7d_before', '3d_before')
     and state = 'skipped_past_due'),
  2::bigint,
  'an event created inside 3 days skips the 7d and 3d windows'
);

select set_config(
  'test.party2_eval',
  (
    select (starts_at + interval '1 hour')::text
    from public.events
    where id = current_setting('test.party2')::uuid
  ),
  true
);

select public.evaluate_notification_reminders(
  current_setting('test.party2_eval')::timestamptz
);

select ok(
  (select bool_and(state = 'skipped_past_due')
   from public.notification_reminders
   where entity_id = current_setting('test.party2')::uuid
     and reminder_slot in ('24h_before', '2h_before')),
  'a reminder evaluated after the event starts is skipped, not sent late'
);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type in ('event_reminder_24h', 'event_reminder_2h')
     and template_payload->>'event_id' = current_setting('test.party2')),
  0::bigint,
  'a skipped past event window enqueues no email'
);

-- ---------------------------------------------------------------------------
-- Dues cadence, paid-member exclusion, and cancellation
-- ---------------------------------------------------------------------------

select is(
  private.seed_due_notification_reminders('2026-10-01 08:00:00+01'::timestamptz),
  1,
  'the October due-date window queues only the unpaid member'
);

select is(
  (select scheduled_for
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id = '00000000-0000-0000-0000-000000003102'
     and reminder_slot = 'dues_on_due_date'
     and cycle_key = '2026-10'),
  '2026-10-01 08:00:00+01'::timestamptz,
  'the due-date reminder is scheduled at 08:00 West Africa Time'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id = '00000000-0000-0000-0000-000000003103'
     and reminder_slot = 'dues_on_due_date'),
  0::bigint,
  'a member who paid the current month is not reminded'
);

select public.evaluate_notification_reminders('2026-10-01 08:00:00+01'::timestamptz);

select is(
  (select state
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id = '00000000-0000-0000-0000-000000003102'
     and reminder_slot = 'dues_on_due_date'
     and cycle_key = '2026-10'),
  'dispatched'::public.reminder_state,
  'the due-date reminder is dispatched'
);

select ok(
  exists (
    select 1
    from public.notification_outbox
    where idempotency_key = 'dues_on_due_date:period:2026-10:user:00000000-0000-0000-0000-000000003102'
      and recipient_user_id = '00000000-0000-0000-0000-000000003102'
      and cta_url = '/dues'
      and template_payload->>'period' = '2026-10'
      and body_text not like '%5000%'
      and template_payload::text not like '%amount%'
  ),
  'the dues email is addressed only to the member and contains no amount'
);

select is(
  private.seed_due_notification_reminders('2026-10-05 08:00:00+01'::timestamptz),
  1,
  'the weekly overdue window queues the overdue member'
);

select is(
  (select cycle_key::text
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id = '00000000-0000-0000-0000-000000003102'
     and reminder_slot = 'dues_weekly_overdue'
     and cycle_key = pg_catalog.to_char('2026-10-05'::date, 'IYYY-"W"IW')),
  pg_catalog.to_char('2026-10-05'::date, 'IYYY-"W"IW'),
  'the weekly reminder is keyed by the ISO week'
);

select public.evaluate_notification_reminders('2026-10-05 08:00:00+01'::timestamptz);

select ok(
  exists (
    select 1
    from public.notification_outbox
    where idempotency_key = 'dues_overdue_weekly:period:2026-10:week:'
        || pg_catalog.lower(pg_catalog.to_char('2026-10-05'::date, 'IYYY-"W"IW'))
        || ':user:00000000-0000-0000-0000-000000003102'
      and recipient_user_id = '00000000-0000-0000-0000-000000003102'
      and cta_url = '/dues'
      and body_text not like '%5000%'
  ),
  'the weekly overdue email is queued for the affected member only'
);

select is(
  private.seed_due_notification_reminders('2026-10-12 08:00:00+01'::timestamptz),
  1,
  'the next Monday queues a fresh weekly bucket'
);

with payment as (
  insert into public.dues_payments (member_id, amount_ngn, payment_date, recorded_by)
  values (
    '00000000-0000-0000-0000-000000003102',
    45000,
    '2026-10-12',
    '00000000-0000-0000-0000-000000003101'
  )
  returning id
)
select set_config('test.outbox_a_payment', (select id::text from payment), true);

insert into public.dues_month_dispositions (
  member_id, covered_month, amount_ngn, disposition, payment_id, recorded_by
)
select
  '00000000-0000-0000-0000-000000003102',
  month_start::date,
  5000,
  'paid',
  current_setting('test.outbox_a_payment')::uuid,
  '00000000-0000-0000-0000-000000003101'
from pg_catalog.generate_series(
  '2026-02-01'::date, '2026-10-01'::date, interval '1 month'
) as month_start;

select public.evaluate_notification_reminders('2026-10-12 08:00:00+01'::timestamptz);

select ok(
  (select state = 'cancelled' and skip_reason = 'dues_obligation_cleared'
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id = '00000000-0000-0000-0000-000000003102'
     and reminder_slot = 'dues_weekly_overdue'
     and cycle_key = pg_catalog.to_char('2026-10-12'::date, 'IYYY-"W"IW')),
  'a pending weekly reminder is cancelled when the overdue months are paid'
);

select is(
  (select count(*)
   from public.notification_outbox
   where idempotency_key = 'dues_overdue_weekly:period:2026-10:week:'
       || pg_catalog.lower(pg_catalog.to_char('2026-10-12'::date, 'IYYY-"W"IW'))
       || ':user:00000000-0000-0000-0000-000000003102'),
  0::bigint,
  'a cancelled weekly reminder enqueues no email'
);

select is(
  private.seed_due_notification_reminders('2026-10-25 08:00:00+01'::timestamptz),
  2,
  'the 25th queues next-month reminders for the two unpaid members'
);

select ok(
  (select bool_and(
     state = 'pending'
     and scheduled_for = '2026-10-25 08:00:00+01'::timestamptz
     and target_occurrence_at = '2026-11-01 08:00:00+01'::timestamptz
     and cycle_key = '2026-11'
   )
   from public.notification_reminders
   where entity_type = 'dues_period'
     and reminder_slot = 'dues_upcoming'
     and cycle_key = '2026-11'),
  'the upcoming window is seven days before the next month at 08:00 WAT'
);

select public.evaluate_notification_reminders('2026-10-25 08:00:00+01'::timestamptz);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type = 'dues_upcoming'
     and idempotency_key in (
       'dues_upcoming:period:2026-11:user:00000000-0000-0000-0000-000000003102',
       'dues_upcoming:period:2026-11:user:00000000-0000-0000-0000-000000003103'
     )),
  2::bigint,
  'the upcoming reminder is queued for each unpaid member once'
);

select ok(
  (select subject like '%November 2026%'
      and body_text not like '%5000%'
      and template_payload->>'period' = '2026-11'
   from public.notification_outbox
   where idempotency_key = 'dues_upcoming:period:2026-11:user:00000000-0000-0000-0000-000000003102'),
  'the upcoming email names the period without exposing an amount'
);

select is(
  private.seed_due_notification_reminders('2026-11-01 08:00:00+01'::timestamptz),
  2,
  'the first of the month queues a due-date reminder for the two unpaid members'
);

select public.evaluate_notification_reminders('2026-11-01 08:00:00+01'::timestamptz);

select is(
  (select count(*)
   from public.notification_outbox
   where trigger_type = 'dues_on_due_date'
     and idempotency_key in (
       'dues_on_due_date:period:2026-11:user:00000000-0000-0000-0000-000000003102',
       'dues_on_due_date:period:2026-11:user:00000000-0000-0000-0000-000000003103'
     )),
  2::bigint,
  'the November due-date reminder is queued for each unpaid member'
);

select is(
  (select count(*)
   from public.notification_reminders
   where entity_type = 'dues_period'
     and entity_id in (
       '00000000-0000-0000-0000-000000003101',
       '00000000-0000-0000-0000-000000003104',
       '00000000-0000-0000-0000-000000003105'
     )),
  0::bigint,
  'closed, pending, and deactivated members receive no dues reminders'
);

-- ---------------------------------------------------------------------------
-- Client access is denied
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000003102', true);

select throws_ok(
  $$select count(*) from public.notification_outbox$$,
  '42501',
  'permission denied for table notification_outbox',
  'authenticated clients cannot read the outbox'
);

select throws_ok(
  $$select public.evaluate_notification_reminders()$$,
  '42501',
  'permission denied for function evaluate_notification_reminders',
  'authenticated clients cannot run reminder evaluation'
);

reset role;

select * from finish();
rollback;
