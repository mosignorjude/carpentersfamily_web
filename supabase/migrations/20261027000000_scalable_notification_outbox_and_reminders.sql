-- Phase 2: transactional email outbox and stateful reminder ledger.
--
-- The outbox is server-only. Browser clients never read or write it; Next.js
-- server code reaches it through service-role RPCs and the worker uses the
-- claim/complete/reschedule/webhook RPCs. Reminder evaluation also runs in the
-- database so a missed browser tab or function invocation cannot lose a window.

-- 1. Events gain an explicit timezone. The club default remains Africa/Lagos,
-- which has no daylight-saving transitions, but each event can override it.
alter table public.events
  add column timezone text not null default 'Africa/Lagos',
  add constraint events_timezone_check check (
    pg_catalog.char_length(pg_catalog.btrim(timezone)) between 1 and 64
    and timezone = pg_catalog.btrim(timezone)
    and timezone !~ '[[:cntrl:]]'
  );

comment on column public.events.timezone is
  'IANA timezone used for reminder windows and rendered local event times.';

create or replace function private.validate_event_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.timezone is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as timezone_name
       where timezone_name.name = new.timezone
     ) then
    raise exception using errcode = '23514', message = 'The event timezone is invalid.';
  end if;
  return new;
end;
$function$;

create trigger events_validate_timezone
before insert or update of timezone on public.events
for each row execute function private.validate_event_timezone();

-- 2. Outbox status and ledger enums.
create type public.notification_outbox_status as enum (
  'pending',
  'processing',
  'sent',
  'delivered',
  'paused_rate_limit',
  'failed_permanent',
  'cancelled',
  'skipped'
);

create type public.reminder_entity_type as enum ('meeting', 'event', 'dues_period');

create type public.reminder_slot_type as enum (
  '7d_before',
  '3d_before',
  '24h_before',
  '2h_before',
  'dues_upcoming',
  'dues_on_due_date',
  'dues_weekly_overdue'
);

create type public.reminder_state as enum (
  'pending',
  'dispatched',
  'skipped_past_due',
  'cancelled'
);

-- 3. One row per recipient per email. The idempotency key is the durable
-- deduplication boundary: retries, duplicate button clicks, and replays all
-- collapse into the first insert.
create table public.notification_outbox (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  idempotency_key varchar(255) not null unique,
  trigger_type varchar(64) not null,
  recipient_user_id uuid references public.member_profiles (id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  heading text not null,
  body_text text not null,
  cta_label text,
  cta_url text,
  template_payload jsonb not null default '{}'::jsonb,
  batch_group_key varchar(128),
  status public.notification_outbox_status not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  locked_until timestamptz,
  resend_email_id text,
  last_error text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint notification_outbox_idempotency_key_check check (
    idempotency_key ~ '^[a-z0-9][a-z0-9:_-]{0,254}$'
  ),
  constraint notification_outbox_trigger_type_check check (
    trigger_type ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  constraint notification_outbox_recipient_email_check check (
    recipient_email = pg_catalog.lower(pg_catalog.btrim(recipient_email))
    and pg_catalog.char_length(recipient_email) between 3 and 320
    and recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint notification_outbox_recipient_name_check check (
    recipient_name is null
    or (
      pg_catalog.char_length(pg_catalog.btrim(recipient_name)) between 1 and 200
      and recipient_name !~ '[[:cntrl:]]'
    )
  ),
  constraint notification_outbox_subject_check check (
    pg_catalog.char_length(subject) between 1 and 300
    and subject !~ '[[:cntrl:]]'
  ),
  constraint notification_outbox_heading_check check (
    pg_catalog.char_length(heading) between 1 and 160
    and heading !~ '[[:cntrl:]]'
  ),
  constraint notification_outbox_body_check check (
    pg_catalog.char_length(body_text) between 1 and 5000
    and pg_catalog.translate(body_text, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint notification_outbox_cta_check check (
    (cta_label is null and cta_url is null)
    or (
      cta_label is not null
      and cta_url is not null
      and pg_catalog.char_length(pg_catalog.btrim(cta_label)) between 1 and 80
      and cta_label !~ '[[:cntrl:]]'
      and pg_catalog.char_length(cta_url) between 1 and 2048
      and cta_url like '/%'
      and cta_url !~ '[[:cntrl:]]'
    )
  ),
  constraint notification_outbox_batch_group_key_check check (
    batch_group_key is null
    or batch_group_key ~ '^[a-z0-9][a-z0-9:_-]{0,127}$'
  ),
  constraint notification_outbox_attempts_check check (
    attempt_count >= 0 and max_attempts between 1 and 20
  ),
  constraint notification_outbox_template_payload_check check (
    pg_catalog.jsonb_typeof(template_payload) = 'object'
  ),
  constraint notification_outbox_resend_email_id_check check (
    resend_email_id is null
    or pg_catalog.char_length(resend_email_id) between 1 and 255
  ),
  constraint notification_outbox_last_error_check check (
    last_error is null or pg_catalog.char_length(last_error) between 1 and 2000
  )
);

comment on table public.notification_outbox is
  'Server-only transactional email queue. One row per recipient; idempotency_key prevents duplicate sends.';

create index idx_notification_outbox_claimable
  on public.notification_outbox (next_attempt_at asc, id asc)
  where status in ('pending', 'paused_rate_limit');

create index idx_notification_outbox_stale_processing
  on public.notification_outbox (locked_until asc)
  where status = 'processing';

create index idx_notification_outbox_resend_id
  on public.notification_outbox (resend_email_id)
  where resend_email_id is not null;

-- 4. The reminder ledger records every reminder window. A dispatched row is
-- history and is never rewritten; pending rows are reassessed when a schedule
-- changes, and past windows are skipped rather than sent late in a burst.
create table public.notification_reminders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  entity_type public.reminder_entity_type not null,
  entity_id uuid not null,
  reminder_slot public.reminder_slot_type not null,
  cycle_key varchar(32) not null default 'ONCE',
  timezone varchar(64) not null default 'Africa/Lagos',
  target_occurrence_at timestamptz not null,
  scheduled_for timestamptz not null,
  state public.reminder_state not null default 'pending',
  dispatched_at timestamptz,
  skip_reason text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint notification_reminders_cycle_key_check check (
    cycle_key ~ '^(ONCE|[0-9]{4}-[0-9]{2}|[0-9]{4}-W[0-9]{2})$'
  ),
  constraint notification_reminders_timezone_check check (
    pg_catalog.char_length(pg_catalog.btrim(timezone)) between 1 and 64
    and timezone = pg_catalog.btrim(timezone)
    and timezone !~ '[[:cntrl:]]'
  ),
  constraint notification_reminders_skip_reason_check check (
    skip_reason is null
    or (
      pg_catalog.char_length(pg_catalog.btrim(skip_reason)) between 1 and 500
      and skip_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint notification_reminders_dispatched_at_check check (
    (state = 'dispatched') = (dispatched_at is not null)
  ),
  constraint notification_reminders_entity_slot_cycle_key unique (
    entity_type, entity_id, reminder_slot, cycle_key
  )
);

comment on table public.notification_reminders is
  'Server-only reminder state machine: pending, dispatched, skipped_past_due, cancelled.';

create index idx_notification_reminders_due
  on public.notification_reminders (scheduled_for asc, id asc)
  where state = 'pending';

create index idx_notification_reminders_entity_state
  on public.notification_reminders (entity_type, entity_id, state);

-- 5. Both ledgers are server-only. No policies exist, so even a leaked anon or
-- authenticated key cannot read recipient addresses or message payloads.
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
alter table public.notification_reminders enable row level security;
alter table public.notification_reminders force row level security;

revoke all on table public.notification_outbox
  from public, anon, authenticated, service_role;
revoke all on table public.notification_reminders
  from public, anon, authenticated, service_role;

-- 6. Small helpers shared by enqueue, fan-out, and the reminder evaluator.
create or replace function private.is_valid_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_email is not null
    and pg_catalog.char_length(pg_catalog.btrim(p_email)) between 3 and 320
    and pg_catalog.btrim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$function$;

create or replace function private.resolve_timezone(p_timezone text)
returns text
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (
      select timezone_name.name
      from pg_catalog.pg_timezone_names as timezone_name
      where timezone_name.name = p_timezone
    ),
    'Africa/Lagos'
  );
$function$;

create or replace function private.touch_notification_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function private.touch_notification_updated_at();

create trigger notification_reminders_set_updated_at
before update on public.notification_reminders
for each row execute function private.touch_notification_updated_at();

-- 7. Atomic single-recipient enqueue. A blank address is ignored; a malformed
-- address is a programming error. A repeated idempotency key returns NULL and
-- leaves the original row untouched.
create or replace function public.enqueue_notification_email(
  p_idempotency_key varchar(255),
  p_trigger_type varchar(64),
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_recipient_name text,
  p_subject text,
  p_heading text,
  p_body_text text,
  p_cta_label text default null,
  p_cta_url text default null,
  p_batch_group_key varchar(128) default null,
  p_template_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbox_id uuid;
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_recipient_email));
  v_name text := nullif(pg_catalog.btrim(p_recipient_name), '');
begin
  if p_recipient_email is null or pg_catalog.btrim(p_recipient_email) = '' then
    return null;
  end if;
  if not private.is_valid_email(p_recipient_email) then
    raise exception using errcode = '23514', message = 'A valid recipient email is required.';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[a-z0-9][a-z0-9:_-]{0,254}$' then
    raise exception using errcode = '23514', message = 'The email idempotency key is invalid.';
  end if;
  if p_trigger_type is null
     or p_trigger_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode = '23514', message = 'The email trigger type is invalid.';
  end if;
  if p_subject is null or pg_catalog.char_length(p_subject) not between 1 and 300
     or p_subject ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The email subject is invalid.';
  end if;
  if p_heading is null or pg_catalog.char_length(p_heading) not between 1 and 160
     or p_heading ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The email heading is invalid.';
  end if;
  if p_body_text is null or pg_catalog.char_length(p_body_text) not between 1 and 5000
     or pg_catalog.translate(p_body_text, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The email body is invalid.';
  end if;
  if (p_cta_label is null) <> (p_cta_url is null) then
    raise exception using errcode = '23514', message = 'The email call to action is incomplete.';
  end if;
  if p_cta_url is not null
     and (p_cta_url not like '/%' or pg_catalog.char_length(p_cta_url) > 2048) then
    raise exception using errcode = '23514', message = 'The email call to action URL must be relative.';
  end if;
  if p_batch_group_key is not null
     and p_batch_group_key !~ '^[a-z0-9][a-z0-9:_-]{0,127}$' then
    raise exception using errcode = '23514', message = 'The email batch group key is invalid.';
  end if;
  if p_template_payload is not null
     and pg_catalog.jsonb_typeof(p_template_payload) <> 'object' then
    raise exception using errcode = '23514', message = 'The email template payload must be an object.';
  end if;

  insert into public.notification_outbox (
    idempotency_key,
    trigger_type,
    recipient_user_id,
    recipient_email,
    recipient_name,
    subject,
    heading,
    body_text,
    cta_label,
    cta_url,
    batch_group_key,
    template_payload
  ) values (
    p_idempotency_key,
    p_trigger_type,
    p_recipient_user_id,
    v_email,
    v_name,
    p_subject,
    p_heading,
    p_body_text,
    nullif(pg_catalog.btrim(p_cta_label), ''),
    p_cta_url,
    p_batch_group_key,
    coalesce(p_template_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$function$;

-- 8. Set-based broadcast fan-out. This is one INSERT for the whole club, not
-- one JavaScript loop per member, and it is safe to retry.
create or replace function public.enqueue_notification_broadcast(
  p_batch_group_key varchar(128),
  p_trigger_type varchar(64),
  p_subject text,
  p_heading text,
  p_body_text text,
  p_cta_label text default null,
  p_cta_url text default null,
  p_template_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if p_batch_group_key is null
     or p_batch_group_key !~ '^[a-z0-9][a-z0-9:_-]{0,127}$' then
    raise exception using errcode = '23514', message = 'The broadcast group key is invalid.';
  end if;
  if p_trigger_type is null
     or p_trigger_type !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception using errcode = '23514', message = 'The broadcast trigger type is invalid.';
  end if;
  if p_subject is null or pg_catalog.char_length(p_subject) not between 1 and 300
     or p_subject ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The broadcast subject is invalid.';
  end if;
  if p_heading is null or pg_catalog.char_length(p_heading) not between 1 and 160
     or p_heading ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The broadcast heading is invalid.';
  end if;
  if p_body_text is null or pg_catalog.char_length(p_body_text) not between 1 and 5000
     or pg_catalog.translate(p_body_text, E'\n\r\t', '') ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The broadcast body is invalid.';
  end if;
  if (p_cta_label is null) <> (p_cta_url is null) then
    raise exception using errcode = '23514', message = 'The broadcast call to action is incomplete.';
  end if;
  if p_cta_url is not null
     and (p_cta_url not like '/%' or pg_catalog.char_length(p_cta_url) > 2048) then
    raise exception using errcode = '23514', message = 'The broadcast call to action URL must be relative.';
  end if;
  if p_template_payload is not null
     and pg_catalog.jsonb_typeof(p_template_payload) <> 'object' then
    raise exception using errcode = '23514', message = 'The broadcast template payload must be an object.';
  end if;

  insert into public.notification_outbox (
    idempotency_key,
    trigger_type,
    recipient_user_id,
    recipient_email,
    recipient_name,
    subject,
    heading,
    body_text,
    cta_label,
    cta_url,
    batch_group_key,
    template_payload
  )
  select
    p_batch_group_key || ':recipient:' || profile.id::text,
    p_trigger_type,
    profile.id,
    pg_catalog.lower(pg_catalog.btrim(account.email)),
    profile.full_name,
    p_subject,
    p_heading,
    p_body_text,
    nullif(pg_catalog.btrim(p_cta_label), ''),
    p_cta_url,
    p_batch_group_key,
    coalesce(p_template_payload, '{}'::jsonb)
  from public.member_profiles as profile
  join auth.users as account on account.id = profile.id
  where profile.status = 'active'
    and private.is_valid_email(account.email)
  on conflict (idempotency_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 9. Claim a batch of due jobs. FOR UPDATE SKIP LOCKED lets several workers
-- share the queue without blocking. Expired processing locks are reclaimed and
-- exhausted rows are retired before the claim.
create or replace function public.claim_notification_outbox_jobs(
  p_limit integer default 200,
  p_lock_seconds integer default 300,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '23514', message = 'The outbox claim limit must be between 1 and 1000.';
  end if;
  if p_lock_seconds is null or p_lock_seconds < 30 or p_lock_seconds > 3600 then
    raise exception using errcode = '23514', message = 'The outbox lock duration must be between 30 and 3600 seconds.';
  end if;
  if p_now is null then
    raise exception using errcode = '23514', message = 'The outbox claim time is required.';
  end if;

  update public.notification_outbox as outbox
  set status = 'failed_permanent',
      last_error = coalesce(outbox.last_error, 'Maximum delivery attempts exhausted.'),
      updated_at = p_now
  where outbox.status in ('pending', 'paused_rate_limit')
    and outbox.attempt_count >= outbox.max_attempts;

  update public.notification_outbox as outbox
  set status = 'failed_permanent',
      last_error = coalesce(outbox.last_error, 'Expired worker lock reached the attempt limit.'),
      locked_until = null,
      updated_at = p_now
  where outbox.status = 'processing'
    and outbox.locked_until <= p_now
    and outbox.attempt_count >= outbox.max_attempts;

  return query
  with candidates as (
    select outbox.id
    from public.notification_outbox as outbox
    where outbox.attempt_count < outbox.max_attempts
      and (
        (
          outbox.status in ('pending', 'paused_rate_limit')
          and outbox.next_attempt_at <= p_now
        )
        or (
          outbox.status = 'processing'
          and outbox.locked_until <= p_now
        )
      )
    order by outbox.next_attempt_at asc, outbox.id asc
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.notification_outbox as outbox
    set status = 'processing',
        attempt_count = outbox.attempt_count + 1,
        locked_until = p_now + pg_catalog.make_interval(secs => p_lock_seconds),
        updated_at = p_now
    from candidates
    where outbox.id = candidates.id
    returning outbox.*
  )
  select * from claimed;
end;
$function$;

-- 10. Worker outcomes. Completion records the provider id; rescheduling either
-- pauses for rate limits (without consuming a permanent attempt) or applies a
-- normal retry, and retires the row once attempts are exhausted.
create or replace function public.complete_notification_outbox_jobs(
  p_job_ids uuid[],
  p_resend_email_ids text[],
  p_sent_at timestamptz default pg_catalog.clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  if p_job_ids is null
     or p_resend_email_ids is null
     or pg_catalog.cardinality(p_job_ids) = 0
     or pg_catalog.cardinality(p_job_ids) <> pg_catalog.cardinality(p_resend_email_ids) then
    raise exception using errcode = '23514', message = 'Complete jobs requires matching non-empty job and provider id arrays.';
  end if;
  if p_sent_at is null then
    raise exception using errcode = '23514', message = 'The completion time is required.';
  end if;

  update public.notification_outbox as outbox
  set status = 'sent',
      sent_at = coalesce(outbox.sent_at, p_sent_at),
      resend_email_id = updates.resend_email_id,
      locked_until = null,
      last_error = null,
      updated_at = p_sent_at
  from pg_catalog.unnest(p_job_ids) with ordinality
    as jobs(job_id, ordinal)
  join pg_catalog.unnest(p_resend_email_ids) with ordinality
    as updates(resend_email_id, ordinal) on updates.ordinal = jobs.ordinal
  where outbox.id = jobs.job_id
    and outbox.status in ('processing', 'pending', 'paused_rate_limit');

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.reschedule_notification_outbox_jobs(
  p_job_ids uuid[],
  p_reason text,
  p_delay_seconds integer default 60,
  p_paused boolean default false,
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_reason text := pg_catalog.left(pg_catalog.btrim(p_reason), 2000);
begin
  if p_job_ids is null or pg_catalog.cardinality(p_job_ids) = 0 then
    raise exception using errcode = '23514', message = 'At least one outbox job is required.';
  end if;
  if v_reason is null or pg_catalog.char_length(v_reason) = 0 then
    raise exception using errcode = '23514', message = 'A reschedule reason is required.';
  end if;
  if p_delay_seconds is null or p_delay_seconds < 0 or p_delay_seconds > 86400 then
    raise exception using errcode = '23514', message = 'The reschedule delay must be between 0 and 86400 seconds.';
  end if;
  if p_now is null then
    raise exception using errcode = '23514', message = 'The reschedule time is required.';
  end if;

  update public.notification_outbox as outbox
  set status = case
        when p_paused then 'paused_rate_limit'::public.notification_outbox_status
        when outbox.attempt_count >= outbox.max_attempts
          then 'failed_permanent'::public.notification_outbox_status
        else 'pending'::public.notification_outbox_status
      end,
      attempt_count = case
        when p_paused and outbox.attempt_count > 0 then outbox.attempt_count - 1
        else outbox.attempt_count
      end,
      next_attempt_at = case
        when not p_paused and outbox.attempt_count >= outbox.max_attempts
          then outbox.next_attempt_at
        else p_now + pg_catalog.make_interval(secs => p_delay_seconds)
      end,
      locked_until = null,
      last_error = v_reason,
      updated_at = p_now
  where outbox.id = any (p_job_ids)
    and outbox.status in ('processing', 'pending', 'paused_rate_limit');

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 11. Provider webhook sync. Event timestamps come from Resend, so a delayed
-- webhook cannot move delivered_at backwards. A delivered row is never demoted
-- to sent by a late webhook.
create or replace function public.apply_resend_webhook_event(
  p_resend_email_id text,
  p_event_type text,
  p_event_created_at timestamptz default pg_catalog.clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
  v_provider_id text := pg_catalog.btrim(p_resend_email_id);
  v_event_time timestamptz := coalesce(p_event_created_at, pg_catalog.clock_timestamp());
begin
  if v_provider_id is null or pg_catalog.char_length(v_provider_id) not between 1 and 255 then
    raise exception using errcode = '23514', message = 'A Resend email id is required.';
  end if;
  if p_event_type is null or p_event_type not in (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.bounced',
    'email.complained',
    'email.failed'
  ) then
    raise exception using errcode = '23514', message = 'The Resend webhook event type is unsupported.';
  end if;

  update public.notification_outbox as outbox
  set status = case p_event_type
        when 'email.delivered' then 'delivered'::public.notification_outbox_status
        when 'email.bounced' then 'failed_permanent'::public.notification_outbox_status
        when 'email.complained' then 'failed_permanent'::public.notification_outbox_status
        when 'email.sent' then case
          when outbox.status in ('delivered', 'failed_permanent') then outbox.status
          else 'sent'::public.notification_outbox_status
        end
        when 'email.failed' then case
          when outbox.attempt_count >= outbox.max_attempts
            then 'failed_permanent'::public.notification_outbox_status
          else 'pending'::public.notification_outbox_status
        end
        else outbox.status
      end,
      sent_at = case
        when p_event_type in ('email.sent', 'email.delivered')
          then coalesce(outbox.sent_at, v_event_time)
        else outbox.sent_at
      end,
      delivered_at = case
        when p_event_type = 'email.delivered'
          then coalesce(outbox.delivered_at, v_event_time)
        else outbox.delivered_at
      end,
      next_attempt_at = case
        when p_event_type = 'email.failed'
          and outbox.attempt_count < outbox.max_attempts
          then v_event_time + interval '1 minute'
        else outbox.next_attempt_at
      end,
      last_error = case
        when p_event_type in ('email.bounced', 'email.complained')
          then p_event_type
        when p_event_type = 'email.delivery_delayed'
          then 'delivery_delayed'
        else outbox.last_error
      end,
      locked_until = case
        when p_event_type in ('email.delivered', 'email.bounced', 'email.complained')
          then null
        else outbox.locked_until
      end,
      updated_at = v_event_time
  where outbox.resend_email_id = v_provider_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 12. Timezone-aware event reminder helpers. Computing the window in the
-- event's local wall time preserves the intended clock time across any future
-- daylight-saving change.
create or replace function private.event_notification_entity_type(p_event_type text)
returns public.reminder_entity_type
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_event_type = 'meeting' then 'meeting'::public.reminder_entity_type
    else 'event'::public.reminder_entity_type
  end;
$function$;

create or replace function private.event_reminder_scheduled_for(
  p_starts_at timestamptz,
  p_timezone text,
  p_slot public.reminder_slot_type
)
returns timestamptz
language sql
stable
set search_path = ''
as $function$
  select (
    (
      p_starts_at at time zone private.resolve_timezone(p_timezone)
    ) - case p_slot
        when '7d_before' then interval '7 days'
        when '3d_before' then interval '3 days'
        when '24h_before' then interval '24 hours'
        when '2h_before' then interval '2 hours'
        else interval '0'
      end
  ) at time zone private.resolve_timezone(p_timezone);
$function$;

create or replace function private.event_reminder_is_due_window(
  p_now timestamptz,
  p_starts_at timestamptz,
  p_scheduled_for timestamptz,
  p_slot public.reminder_slot_type
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case
    when p_slot = '2h_before' then
      p_now <= p_scheduled_for + interval '90 minutes'
      and p_now < p_starts_at - interval '15 minutes'
    else
      p_now <= p_scheduled_for + interval '6 hours'
      and p_now < p_starts_at - interval '2 hours'
  end;
$function$;

-- 13. Reconcile one event's reminder rows with its current schedule.
--
-- Dispatched rows are never touched. Pending, cancelled, and skipped rows are
-- reassessed against the new schedule. A window that has already passed is
-- skipped instead of being sent as a catch-up burst. A non-scheduled or
-- archived event cancels its pending rows. Changing an event between meeting
-- and event cancels pending rows under the old entity type.
create or replace function private.sync_event_notification_reminders(
  p_event_id uuid,
  p_now timestamptz default pg_catalog.clock_timestamp(),
  p_allow_past_grace boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event public.events%rowtype;
  v_entity_type public.reminder_entity_type;
  v_slot public.reminder_slot_type;
  v_slots public.reminder_slot_type[];
  v_scheduled_for timestamptz;
  v_state public.reminder_state;
  v_skip_reason text;
  v_count integer := 0;
begin
  select event.* into v_event
  from public.events as event
  where event.id = p_event_id;
  if not found then
    return 0;
  end if;

  v_entity_type := private.event_notification_entity_type(v_event.event_type);
  v_slots := case
    when v_event.event_type = 'meeting'
      then array['24h_before', '2h_before']::public.reminder_slot_type[]
    else array['7d_before', '3d_before', '24h_before', '2h_before']::public.reminder_slot_type[]
  end;

  update public.notification_reminders as reminder
  set state = 'cancelled'::public.reminder_state,
      skip_reason = 'entity_type_changed',
      updated_at = p_now
  where reminder.entity_id = p_event_id
    and reminder.entity_type in (
      'meeting'::public.reminder_entity_type,
      'event'::public.reminder_entity_type
    )
    and reminder.entity_type <> v_entity_type
    and reminder.state = 'pending';

  foreach v_slot in array v_slots loop
    v_scheduled_for := private.event_reminder_scheduled_for(
      v_event.starts_at, v_event.timezone, v_slot
    );

    if v_event.archived_at is not null
       or v_event.status <> 'scheduled' then
      update public.notification_reminders as reminder
      set state = 'cancelled'::public.reminder_state,
          skip_reason = case
            when v_event.archived_at is not null then 'event_archived'
            else 'event_not_scheduled'
          end,
          updated_at = p_now
      where reminder.entity_type = v_entity_type
        and reminder.entity_id = p_event_id
        and reminder.reminder_slot = v_slot
        and reminder.cycle_key = 'ONCE'
        and reminder.state = 'pending';
      continue;
    end if;

    if v_scheduled_for <= p_now
       and not (
         p_allow_past_grace
         and private.event_reminder_is_due_window(
           p_now, v_event.starts_at, v_scheduled_for, v_slot
         )
       ) then
      v_state := 'skipped_past_due'::public.reminder_state;
      v_skip_reason := 'reminder_window_passed';
    else
      v_state := 'pending'::public.reminder_state;
      v_skip_reason := null;
    end if;

    insert into public.notification_reminders (
      entity_type,
      entity_id,
      reminder_slot,
      cycle_key,
      timezone,
      target_occurrence_at,
      scheduled_for,
      state,
      skip_reason
    ) values (
      v_entity_type,
      p_event_id,
      v_slot,
      'ONCE',
      private.resolve_timezone(v_event.timezone),
      v_event.starts_at,
      v_scheduled_for,
      v_state,
      v_skip_reason
    )
    on conflict (entity_type, entity_id, reminder_slot, cycle_key) do update
    set timezone = excluded.timezone,
        target_occurrence_at = excluded.target_occurrence_at,
        scheduled_for = excluded.scheduled_for,
        state = excluded.state,
        skip_reason = excluded.skip_reason,
        updated_at = p_now
    where public.notification_reminders.state <> 'dispatched';

    v_count := v_count + 1;
  end loop;

  -- Rows for slots that this entity type no longer uses are not left pending.
  update public.notification_reminders as reminder
  set state = 'cancelled'::public.reminder_state,
      skip_reason = 'reminder_slot_reassigned',
      updated_at = p_now
  where reminder.entity_type = v_entity_type
    and reminder.entity_id = p_event_id
    and reminder.cycle_key = 'ONCE'
    and reminder.state = 'pending'
    and not (reminder.reminder_slot = any (v_slots));

  return v_count;
end;
$function$;

create or replace function private.sync_event_notification_reminders_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.sync_event_notification_reminders(new.id);
  return new;
end;
$function$;

create trigger events_sync_notification_reminders
after insert or update of starts_at, timezone, status, archived_at, event_type
on public.events
for each row execute function private.sync_event_notification_reminders_trigger();

-- 14. Dues obligation helpers. "Obligation" means an active member, a
-- membership period covering the month, and no current paid or written-off
-- disposition for that month.
create or replace function private.dues_member_has_month_obligation(
  p_member_id uuid,
  p_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select pg_catalog.date_trunc('month', p_month)::date as month_start
  )
  select coalesce((
    select true
    from public.member_profiles as profile
    cross join target
    where profile.id = p_member_id
      and profile.status = 'active'
      and exists (
        select 1
        from public.dues_membership_periods as period
        where period.member_id = profile.id
          and period.starts_month <= target.month_start
          and (
            period.ends_before_month is null
            or target.month_start < period.ends_before_month
          )
      )
      and not exists (
        select 1
        from public.dues_month_dispositions as disposition
        where disposition.member_id = profile.id
          and disposition.covered_month = target.month_start
          and disposition.is_current
      )
  ), false);
$function$;

create or replace function private.dues_member_has_overdue(
  p_member_id uuid,
  p_before_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select pg_catalog.date_trunc('month', p_before_month)::date as before_month
  )
  select coalesce((
    select true
    from public.member_profiles as profile
    cross join target
    where profile.id = p_member_id
      and profile.status = 'active'
      and exists (
        select 1
        from public.dues_membership_periods as period
        cross join lateral pg_catalog.generate_series(
          period.starts_month::timestamp,
          least(
            coalesce(period.ends_before_month, target.before_month) - interval '1 month',
            target.before_month::timestamp - interval '1 month'
          ),
          interval '1 month'
        ) as series(month_start)
        where period.member_id = profile.id
          and series.month_start::date >= period.starts_month
          and not exists (
            select 1
            from public.dues_month_dispositions as disposition
            where disposition.member_id = profile.id
              and disposition.covered_month = series.month_start::date
              and disposition.is_current
          )
      )
  ), false);
$function$;

-- 15. Seed the three dues windows. Rows are created only on the scheduled day
-- and the following day, so a long outage skips a window instead of generating
-- a late catch-up burst. Re-runs are no-ops unless a value actually changed.
create or replace function private.seed_due_notification_reminders(
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_local_date date;
  v_month date;
  v_next_month date;
  v_due_target timestamptz;
  v_upcoming_date date;
  v_upcoming_scheduled timestamptz;
  v_week_start date;
  v_week_scheduled timestamptz;
  v_week_key text;
  v_count integer;
  v_seeded integer := 0;
begin
  if p_now is null then
    raise exception using errcode = '23514', message = 'The reminder seed time is required.';
  end if;

  v_local_date := (p_now at time zone 'Africa/Lagos')::date;
  v_month := pg_catalog.date_trunc('month', v_local_date)::date;
  v_next_month := (v_month + interval '1 month')::date;
  v_due_target := (v_month::timestamp + time '08:00') at time zone 'Africa/Lagos';
  v_upcoming_date := v_next_month - 7;
  v_upcoming_scheduled :=
    (v_upcoming_date::timestamp + time '08:00') at time zone 'Africa/Lagos';

  -- 7 days before next month's due date (the 25th for a 31/30-day month).
  if v_local_date between v_upcoming_date and v_upcoming_date + 1 then
    insert into public.notification_reminders (
      entity_type,
      entity_id,
      reminder_slot,
      cycle_key,
      timezone,
      target_occurrence_at,
      scheduled_for,
      state,
      skip_reason
    )
    select
      'dues_period'::public.reminder_entity_type,
      profile.id,
      'dues_upcoming'::public.reminder_slot_type,
      pg_catalog.to_char(v_next_month, 'YYYY-MM'),
      'Africa/Lagos',
      (v_next_month::timestamp + time '08:00') at time zone 'Africa/Lagos',
      v_upcoming_scheduled,
      case
        when v_upcoming_scheduled <= p_now
          and p_now > v_upcoming_scheduled + interval '24 hours'
          then 'skipped_past_due'::public.reminder_state
        else 'pending'::public.reminder_state
      end,
      case
        when v_upcoming_scheduled <= p_now
          and p_now > v_upcoming_scheduled + interval '24 hours'
          then 'reminder_window_passed'
        else null
      end
    from public.member_profiles as profile
    where profile.status = 'active'
      and exists (
        select 1
        from public.dues_membership_periods as period
        where period.member_id = profile.id
          and period.starts_month <= v_next_month
          and (
            period.ends_before_month is null
            or v_next_month < period.ends_before_month
          )
      )
      and not exists (
        select 1
        from public.dues_month_dispositions as disposition
        where disposition.member_id = profile.id
          and disposition.covered_month = v_next_month
          and disposition.is_current
      )
    on conflict (entity_type, entity_id, reminder_slot, cycle_key) do update
    set timezone = excluded.timezone,
        target_occurrence_at = excluded.target_occurrence_at,
        scheduled_for = excluded.scheduled_for,
        state = excluded.state,
        skip_reason = excluded.skip_reason,
        updated_at = p_now
    where public.notification_reminders.state <> 'dispatched'
      and (
        public.notification_reminders.timezone is distinct from excluded.timezone
        or public.notification_reminders.target_occurrence_at is distinct from excluded.target_occurrence_at
        or public.notification_reminders.scheduled_for is distinct from excluded.scheduled_for
        or public.notification_reminders.state is distinct from excluded.state
        or public.notification_reminders.skip_reason is distinct from excluded.skip_reason
      );

    get diagnostics v_count = row_count;
    v_seeded := v_seeded + v_count;
  end if;

  -- On the 1st (and the 2nd as an outage grace day) for the current month.
  if v_local_date between v_month and v_month + 1 then
    insert into public.notification_reminders (
      entity_type,
      entity_id,
      reminder_slot,
      cycle_key,
      timezone,
      target_occurrence_at,
      scheduled_for,
      state,
      skip_reason
    )
    select
      'dues_period'::public.reminder_entity_type,
      profile.id,
      'dues_on_due_date'::public.reminder_slot_type,
      pg_catalog.to_char(v_month, 'YYYY-MM'),
      'Africa/Lagos',
      v_due_target,
      v_due_target,
      case
        when p_now > v_due_target + interval '24 hours'
          then 'skipped_past_due'::public.reminder_state
        else 'pending'::public.reminder_state
      end,
      case
        when p_now > v_due_target + interval '24 hours'
          then 'reminder_window_passed'
        else null
      end
    from public.member_profiles as profile
    where profile.status = 'active'
      and exists (
        select 1
        from public.dues_membership_periods as period
        where period.member_id = profile.id
          and period.starts_month <= v_month
          and (
            period.ends_before_month is null
            or v_month < period.ends_before_month
          )
      )
      and not exists (
        select 1
        from public.dues_month_dispositions as disposition
        where disposition.member_id = profile.id
          and disposition.covered_month = v_month
          and disposition.is_current
      )
    on conflict (entity_type, entity_id, reminder_slot, cycle_key) do update
    set timezone = excluded.timezone,
        target_occurrence_at = excluded.target_occurrence_at,
        scheduled_for = excluded.scheduled_for,
        state = excluded.state,
        skip_reason = excluded.skip_reason,
        updated_at = p_now
    where public.notification_reminders.state <> 'dispatched'
      and (
        public.notification_reminders.timezone is distinct from excluded.timezone
        or public.notification_reminders.target_occurrence_at is distinct from excluded.target_occurrence_at
        or public.notification_reminders.scheduled_for is distinct from excluded.scheduled_for
        or public.notification_reminders.state is distinct from excluded.state
        or public.notification_reminders.skip_reason is distinct from excluded.skip_reason
      );

    get diagnostics v_count = row_count;
    v_seeded := v_seeded + v_count;
  end if;

  -- Weekly overdue follow-up on Monday and Tuesday (the Tuesday run covers a
  -- missed Monday worker tick).
  if pg_catalog.date_part('isodow', v_local_date)::integer in (1, 2) then
    v_week_start :=
      v_local_date - (pg_catalog.date_part('isodow', v_local_date)::integer - 1);
    v_week_key := pg_catalog.to_char(v_local_date, 'IYYY-"W"IW');
    v_week_scheduled :=
      (v_week_start::timestamp + time '08:00') at time zone 'Africa/Lagos';

    insert into public.notification_reminders (
      entity_type,
      entity_id,
      reminder_slot,
      cycle_key,
      timezone,
      target_occurrence_at,
      scheduled_for,
      state,
      skip_reason
    )
    select
      'dues_period'::public.reminder_entity_type,
      profile.id,
      'dues_weekly_overdue'::public.reminder_slot_type,
      v_week_key,
      'Africa/Lagos',
      v_week_scheduled,
      v_week_scheduled,
      case
        when p_now > v_week_scheduled + interval '24 hours'
          then 'skipped_past_due'::public.reminder_state
        else 'pending'::public.reminder_state
      end,
      case
        when p_now > v_week_scheduled + interval '24 hours'
          then 'reminder_window_passed'
        else null
      end
    from public.member_profiles as profile
    where profile.status = 'active'
      and exists (
        select 1
        from public.dues_membership_periods as period
        cross join lateral pg_catalog.generate_series(
          period.starts_month::timestamp,
          least(
            coalesce(period.ends_before_month, v_month) - interval '1 month',
            v_month::timestamp - interval '1 month'
          ),
          interval '1 month'
        ) as series(month_start)
        where period.member_id = profile.id
          and series.month_start::date >= period.starts_month
          and not exists (
            select 1
            from public.dues_month_dispositions as disposition
            where disposition.member_id = profile.id
              and disposition.covered_month = series.month_start::date
              and disposition.is_current
          )
      )
    on conflict (entity_type, entity_id, reminder_slot, cycle_key) do update
    set timezone = excluded.timezone,
        target_occurrence_at = excluded.target_occurrence_at,
        scheduled_for = excluded.scheduled_for,
        state = excluded.state,
        skip_reason = excluded.skip_reason,
        updated_at = p_now
    where public.notification_reminders.state <> 'dispatched'
      and (
        public.notification_reminders.timezone is distinct from excluded.timezone
        or public.notification_reminders.target_occurrence_at is distinct from excluded.target_occurrence_at
        or public.notification_reminders.scheduled_for is distinct from excluded.scheduled_for
        or public.notification_reminders.state is distinct from excluded.state
        or public.notification_reminders.skip_reason is distinct from excluded.skip_reason
      );

    get diagnostics v_count = row_count;
    v_seeded := v_seeded + v_count;
  end if;

  return v_seeded;
end;
$function$;

-- 16. Cancel pending dues reminders whose obligation has disappeared: a paid or
-- written-off month, a deactivated member, or a closed membership period.
create or replace function private.cancel_stale_dues_reminders(
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_month date := pg_catalog.date_trunc(
    'month', p_now at time zone 'Africa/Lagos'
  )::date;
  v_count integer;
begin
  update public.notification_reminders as reminder
  set state = 'cancelled'::public.reminder_state,
      skip_reason = 'dues_obligation_cleared',
      updated_at = p_now
  where reminder.entity_type = 'dues_period'
    and reminder.state = 'pending'
    and (
      not exists (
        select 1
        from public.member_profiles as profile
        where profile.id = reminder.entity_id
          and profile.status = 'active'
      )
      or case reminder.reminder_slot
        when 'dues_weekly_overdue'::public.reminder_slot_type
          then not private.dues_member_has_overdue(reminder.entity_id, v_month)
        else not private.dues_member_has_month_obligation(
          reminder.entity_id,
          pg_catalog.to_date(reminder.cycle_key || '-01', 'YYYY-MM-DD')
        )
      end
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 17. Evaluate due reminders and enqueue emails. Event reminders fan out to all
-- active members; dues reminders go only to the affected member. The function
-- never sends an event reminder whose window has passed beyond its grace.
create or replace function public.evaluate_notification_reminders(
  p_now timestamptz default pg_catalog.clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_due_ids uuid[];
  v_reminder_id uuid;
  v_reminder public.notification_reminders%rowtype;
  v_event public.events%rowtype;
  v_member public.member_profiles%rowtype;
  v_outbox_id uuid;
  v_timezone text;
  v_when_local text;
  v_subject text;
  v_heading text;
  v_body text;
  v_trigger_type text;
  v_slot_prefix text;
  v_batch_group_key text;
  v_cycle_month date;
  v_expected_upcoming date;
  v_current_week text;
  v_month_label text;
  v_recipient_count integer;
  v_seeded integer;
  v_stale_cancelled integer;
  v_processed integer := 0;
  v_dispatched integer := 0;
  v_skipped integer := 0;
  v_cancelled integer := 0;
  v_enqueued integer := 0;
begin
  if p_now is null then
    raise exception using errcode = '23514', message = 'The reminder evaluation time is required.';
  end if;

  v_seeded := private.seed_due_notification_reminders(p_now);
  v_stale_cancelled := private.cancel_stale_dues_reminders(p_now);

  select array_agg(due.id)
  into v_due_ids
  from (
    select reminder.id
    from public.notification_reminders as reminder
    where reminder.state = 'pending'
      and reminder.scheduled_for <= p_now
    order by reminder.scheduled_for asc, reminder.id asc
    limit 500
    for update skip locked
  ) as due;

  if v_due_ids is not null then
    foreach v_reminder_id in array v_due_ids loop
      select reminder.* into v_reminder
      from public.notification_reminders as reminder
      where reminder.id = v_reminder_id
      for update;
      if not found or v_reminder.state <> 'pending' then
        continue;
      end if;

      v_processed := v_processed + 1;

      if v_reminder.entity_type in ('event', 'meeting') then
        select event.* into v_event
        from public.events as event
        where event.id = v_reminder.entity_id;

        if not found then
          update public.notification_reminders
          set state = 'cancelled', skip_reason = 'event_not_found', updated_at = p_now
          where id = v_reminder.id;
          v_cancelled := v_cancelled + 1;
        elsif v_event.archived_at is not null or v_event.status <> 'scheduled' then
          update public.notification_reminders
          set state = 'cancelled', skip_reason = 'event_not_scheduled', updated_at = p_now
          where id = v_reminder.id;
          v_cancelled := v_cancelled + 1;
        elsif v_event.starts_at <= p_now then
          update public.notification_reminders
          set state = 'skipped_past_due', skip_reason = 'event_already_started', updated_at = p_now
          where id = v_reminder.id;
          v_skipped := v_skipped + 1;
        elsif (v_reminder.entity_type = 'meeting') <> (v_event.event_type = 'meeting') then
          update public.notification_reminders
          set state = 'cancelled', skip_reason = 'entity_type_changed', updated_at = p_now
          where id = v_reminder.id;
          v_cancelled := v_cancelled + 1;
        elsif not private.event_reminder_is_due_window(
          p_now, v_event.starts_at, v_reminder.scheduled_for, v_reminder.reminder_slot
        ) then
          update public.notification_reminders
          set state = 'skipped_past_due', skip_reason = 'reminder_window_passed', updated_at = p_now
          where id = v_reminder.id;
          v_skipped := v_skipped + 1;
        else
          v_timezone := private.resolve_timezone(v_event.timezone);
          v_slot_prefix := pg_catalog.replace(v_reminder.reminder_slot::text, '_before', '');
          v_trigger_type := case
            when v_reminder.entity_type = 'meeting' then 'meeting_reminder_'
            else 'event_reminder_'
          end || v_slot_prefix;
          v_batch_group_key := v_trigger_type || ':' || v_event.id::text;
          v_subject := 'Reminder: ' || v_event.title;
          v_heading := case
            when v_reminder.entity_type = 'meeting' then 'Meeting reminder: '
            else 'Event reminder: '
          end || v_event.title;
          v_when_local := pg_catalog.to_char(
            v_event.starts_at at time zone v_timezone,
            'FMDay, FMDD FMMonth YYYY "at" FMHH24:MI'
          );
          v_body := v_event.title || ' starts on ' || v_when_local
            || ' (' || v_timezone || ') at ' || v_event.location || '.';

          insert into public.notification_outbox (
            idempotency_key,
            trigger_type,
            recipient_user_id,
            recipient_email,
            recipient_name,
            subject,
            heading,
            body_text,
            cta_label,
            cta_url,
            batch_group_key,
            template_payload
          )
          select
            v_trigger_type || ':' || v_reminder.entity_type::text || ':'
              || v_event.id::text || ':recipient:' || profile.id::text,
            v_trigger_type,
            profile.id,
            pg_catalog.lower(pg_catalog.btrim(account.email)),
            profile.full_name,
            v_subject,
            v_heading,
            v_body,
            'View event',
            '/events/' || v_event.id::text,
            v_batch_group_key,
            pg_catalog.jsonb_build_object(
              'event_id', v_event.id,
              'event_type', v_event.event_type,
              'title', v_event.title,
              'starts_at', v_event.starts_at,
              'timezone', v_timezone,
              'location', v_event.location,
              'reminder_slot', v_reminder.reminder_slot::text
            )
          from public.member_profiles as profile
          join auth.users as account on account.id = profile.id
          where profile.status = 'active'
            and private.is_valid_email(account.email)
          on conflict (idempotency_key) do nothing;

          get diagnostics v_recipient_count = row_count;
          v_enqueued := v_enqueued + v_recipient_count;

          update public.notification_reminders
          set state = 'dispatched', dispatched_at = p_now,
              skip_reason = null, updated_at = p_now
          where id = v_reminder.id;
          v_dispatched := v_dispatched + 1;
        end if;

      elsif v_reminder.entity_type = 'dues_period' then
        select profile.* into v_member
        from public.member_profiles as profile
        where profile.id = v_reminder.entity_id;

        if not found or v_member.status <> 'active' then
          update public.notification_reminders
          set state = 'cancelled', skip_reason = 'member_inactive', updated_at = p_now
          where id = v_reminder.id;
          v_cancelled := v_cancelled + 1;

        elsif v_reminder.reminder_slot = 'dues_weekly_overdue' then
          v_current_week := pg_catalog.to_char(
            p_now at time zone 'Africa/Lagos', 'IYYY-"W"IW'
          );

          if v_reminder.cycle_key <> v_current_week then
            update public.notification_reminders
            set state = 'skipped_past_due', skip_reason = 'reminder_cycle_passed', updated_at = p_now
            where id = v_reminder.id;
            v_skipped := v_skipped + 1;
          elsif not private.dues_member_has_overdue(
            v_member.id, (p_now at time zone 'Africa/Lagos')::date
          ) then
            update public.notification_reminders
            set state = 'cancelled', skip_reason = 'dues_obligation_cleared', updated_at = p_now
            where id = v_reminder.id;
            v_cancelled := v_cancelled + 1;
          elsif p_now > v_reminder.scheduled_for + interval '24 hours' then
            update public.notification_reminders
            set state = 'skipped_past_due', skip_reason = 'reminder_window_passed', updated_at = p_now
            where id = v_reminder.id;
            v_skipped := v_skipped + 1;
          else
            v_trigger_type := 'dues_overdue_weekly';
            v_subject := 'Outstanding club dues';
            v_heading := 'Dues follow-up';
            v_body := 'You have unpaid club dues from an earlier month. '
              || 'Open your private dues page to review your status.';
            v_cycle_month := pg_catalog.date_trunc(
              'month', p_now at time zone 'Africa/Lagos'
            )::date;
            v_outbox_id := public.enqueue_notification_email(
              'dues_overdue_weekly:period:'
                || pg_catalog.to_char(v_cycle_month, 'YYYY-MM')
                || ':week:' || pg_catalog.lower(v_reminder.cycle_key)
                || ':user:' || v_member.id::text,
              v_trigger_type,
              v_member.id,
              (
                select account.email
                from auth.users as account
                where account.id = v_member.id
              ),
              v_member.full_name,
              v_subject,
              v_heading,
              v_body,
              'View my dues',
              '/dues',
              null,
              pg_catalog.jsonb_build_object(
                'member_id', v_member.id,
                'period', v_reminder.cycle_key,
                'reminder_slot', v_reminder.reminder_slot::text
              )
            );
            if v_outbox_id is not null then
              v_enqueued := v_enqueued + 1;
            end if;
            update public.notification_reminders
            set state = 'dispatched', dispatched_at = p_now,
                skip_reason = null, updated_at = p_now
            where id = v_reminder.id;
            v_dispatched := v_dispatched + 1;
          end if;

        else
          v_cycle_month := pg_catalog.to_date(
            v_reminder.cycle_key || '-01', 'YYYY-MM-DD'
          );
          v_month_label := pg_catalog.to_char(v_cycle_month, 'FMMonth YYYY');

          if v_reminder.reminder_slot = 'dues_upcoming' then
            v_expected_upcoming := (
              pg_catalog.date_trunc('month', p_now at time zone 'Africa/Lagos')::date
              + interval '1 month'
            )::date;

            if v_cycle_month <> v_expected_upcoming then
              update public.notification_reminders
              set state = 'skipped_past_due', skip_reason = 'reminder_cycle_passed', updated_at = p_now
              where id = v_reminder.id;
              v_skipped := v_skipped + 1;
              continue;
            end if;

            v_trigger_type := 'dues_upcoming';
            v_subject := 'Dues reminder for ' || v_month_label;
            v_heading := 'Monthly dues';
            v_body := 'Your club dues for ' || v_month_label
              || ' are due on the 1st. Open your private dues page to review your status.';
          elsif v_reminder.reminder_slot = 'dues_on_due_date' then
            if v_cycle_month <> pg_catalog.date_trunc(
              'month', p_now at time zone 'Africa/Lagos'
            )::date then
              update public.notification_reminders
              set state = 'skipped_past_due', skip_reason = 'reminder_cycle_passed', updated_at = p_now
              where id = v_reminder.id;
              v_skipped := v_skipped + 1;
              continue;
            end if;

            v_trigger_type := 'dues_on_due_date';
            v_subject := 'Dues due today: ' || v_month_label;
            v_heading := 'Monthly dues';
            v_body := 'Your club dues for ' || v_month_label
              || ' are due today. Open your private dues page to review your status.';
          else
            update public.notification_reminders
            set state = 'cancelled', skip_reason = 'unknown_reminder_slot', updated_at = p_now
            where id = v_reminder.id;
            v_cancelled := v_cancelled + 1;
            continue;
          end if;

          if not private.dues_member_has_month_obligation(v_member.id, v_cycle_month) then
            update public.notification_reminders
            set state = 'cancelled', skip_reason = 'dues_obligation_cleared', updated_at = p_now
            where id = v_reminder.id;
            v_cancelled := v_cancelled + 1;
          elsif p_now > v_reminder.scheduled_for + interval '24 hours' then
            update public.notification_reminders
            set state = 'skipped_past_due', skip_reason = 'reminder_window_passed', updated_at = p_now
            where id = v_reminder.id;
            v_skipped := v_skipped + 1;
          else
            v_outbox_id := public.enqueue_notification_email(
              v_trigger_type || ':period:' || v_reminder.cycle_key
                || ':user:' || v_member.id::text,
              v_trigger_type,
              v_member.id,
              (
                select account.email
                from auth.users as account
                where account.id = v_member.id
              ),
              v_member.full_name,
              v_subject,
              v_heading,
              v_body,
              'View my dues',
              '/dues',
              null,
              pg_catalog.jsonb_build_object(
                'member_id', v_member.id,
                'period', v_reminder.cycle_key,
                'reminder_slot', v_reminder.reminder_slot::text
              )
            );
            if v_outbox_id is not null then
              v_enqueued := v_enqueued + 1;
            end if;
            update public.notification_reminders
            set state = 'dispatched', dispatched_at = p_now,
                skip_reason = null, updated_at = p_now
            where id = v_reminder.id;
            v_dispatched := v_dispatched + 1;
          end if;
        end if;

      else
        update public.notification_reminders
        set state = 'cancelled', skip_reason = 'unknown_entity_type', updated_at = p_now
        where id = v_reminder.id;
        v_cancelled := v_cancelled + 1;
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'seeded', v_seeded,
    'stale_cancelled', v_stale_cancelled,
    'processed', v_processed,
    'dispatched', v_dispatched,
    'skipped', v_skipped,
    'cancelled', v_cancelled,
    'enqueued', v_enqueued
  );
end;
$function$;

-- 18. Backfill future scheduled events without sending any past window during
-- the deployment itself.
do $backfill$
declare
  event_row record;
begin
  for event_row in
    select event.id
    from public.events as event
    where event.status = 'scheduled'
      and event.archived_at is null
      and event.starts_at > pg_catalog.clock_timestamp()
  loop
    perform private.sync_event_notification_reminders(
      event_row.id, pg_catalog.clock_timestamp(), false
    );
  end loop;
end;
$backfill$;

-- 19. Reminder evaluation runs every minute inside Postgres. The outbox worker
-- remains a separate Next.js route because Resend credentials must stay
-- server-side.
select cron.unschedule(jobid)
from cron.job
where jobname = 'carpenters-notification-reminders';

select cron.schedule(
  'carpenters-notification-reminders',
  '* * * * *',
  'select public.evaluate_notification_reminders();'
);

-- 20. Function privileges. Everything is service-role/function-only; private
-- helpers are not callable by any client role.
revoke all on function private.validate_event_timezone()
  from public, anon, authenticated, service_role;
revoke all on function private.is_valid_email(text)
  from public, anon, authenticated, service_role;
revoke all on function private.resolve_timezone(text)
  from public, anon, authenticated, service_role;
revoke all on function private.touch_notification_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function private.event_notification_entity_type(text)
  from public, anon, authenticated, service_role;
revoke all on function private.event_reminder_scheduled_for(timestamptz, text, public.reminder_slot_type)
  from public, anon, authenticated, service_role;
revoke all on function private.event_reminder_is_due_window(timestamptz, timestamptz, timestamptz, public.reminder_slot_type)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_event_notification_reminders(uuid, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.sync_event_notification_reminders_trigger()
  from public, anon, authenticated, service_role;
revoke all on function private.dues_member_has_month_obligation(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.dues_member_has_overdue(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.seed_due_notification_reminders(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.cancel_stale_dues_reminders(timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.enqueue_notification_email
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_notification_broadcast
  from public, anon, authenticated, service_role;
revoke all on function public.claim_notification_outbox_jobs
  from public, anon, authenticated, service_role;
revoke all on function public.complete_notification_outbox_jobs
  from public, anon, authenticated, service_role;
revoke all on function public.reschedule_notification_outbox_jobs
  from public, anon, authenticated, service_role;
revoke all on function public.apply_resend_webhook_event
  from public, anon, authenticated, service_role;
revoke all on function public.evaluate_notification_reminders
  from public, anon, authenticated, service_role;

grant execute on function public.enqueue_notification_email to service_role;
grant execute on function public.enqueue_notification_broadcast to service_role;
grant execute on function public.claim_notification_outbox_jobs to service_role;
grant execute on function public.complete_notification_outbox_jobs to service_role;
grant execute on function public.reschedule_notification_outbox_jobs to service_role;
grant execute on function public.apply_resend_webhook_event to service_role;
grant execute on function public.evaluate_notification_reminders to service_role;
