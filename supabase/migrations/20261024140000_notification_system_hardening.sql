-- Step 21: Notification system hardening (Realtime publication, poll_closing job deduplication,
-- read/unread audit trail, and event-role officer fanout).

-- 1. H1: Publish public.notifications to supabase_realtime so authenticated clients
-- receive live INSERT and UPDATE events governed by RLS.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- 2. H4: Allow private.notification_job_runs to track poll-closing job keys as well as monthly dues keys.
alter table private.notification_job_runs
  drop constraint if exists notification_job_runs_key_check;

alter table private.notification_job_runs
  add constraint notification_job_runs_key_check check (
    job_key ~ '^(dues:[0-9]{4}-[0-9]{2}|poll-closing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
  );

create or replace function private.queue_poll_closing_notifications(p_as_of timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_poll record;
  v_job_key text;
  v_inserted_key text;
  v_count integer := 0;
begin
  if p_as_of is null then
    raise exception using errcode = '23514', message = 'Notification time is invalid.';
  end if;

  for v_poll in
    select poll.id, poll.event_id
    from public.announcement_polls as poll
    where poll.closes_at > p_as_of
      and poll.created_at + ((poll.closes_at - poll.created_at) * 0.75) <= p_as_of
      and not exists (
        select 1
        from private.notification_job_runs as run
        where run.job_key = 'poll-closing:' || poll.id::text
      )
    order by poll.closes_at, poll.id
    limit 250
  loop
    v_job_key := 'poll-closing:' || v_poll.id::text;
    insert into private.notification_job_runs (job_key)
    values (v_job_key)
    on conflict (job_key) do nothing
    returning job_key into v_inserted_key;

    if v_inserted_key is not null then
      perform private.fanout_member_notification(
        'poll_closing',
        v_job_key,
        'poll',
        v_poll.id,
        v_poll.event_id,
        'Poll closing soon',
        'A club poll is closing soon. Open polls to review and cast your vote before it closes.',
        null
      );
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

-- 3. M8: Include event_role_granted and event_role_revoked in officer audit fanout.
create or replace function private.notify_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.action = 'announcement.created' then
    perform private.fanout_member_notification(
      'announcement', 'announcement:' || new.entity_id::text,
      'announcement', new.entity_id, new.event_id,
      'New announcement', 'A new club announcement is available.', new.actor_id
    );
  elsif new.action = 'poll.created' then
    perform private.fanout_member_notification(
      'new_poll', 'poll:' || new.entity_id::text,
      'poll', new.entity_id, new.event_id,
      'New poll', 'A new club poll is available.', new.actor_id
    );
  elsif new.action = 'attendance.session_opened' then
    perform private.fanout_member_notification(
      'attendance_open', 'attendance-open:' || new.entity_id::text,
      'attendance', new.entity_id, coalesce(new.event_id, new.entity_id),
      'Attendance is open', 'Check in for the event while the session is open.', new.actor_id
    );
  elsif new.action in (
    'event_created', 'event_details_updated', 'event_completed',
    'event_cancelled', 'event_reopened', 'event_archived',
    'event_role_granted', 'event_role_revoked'
  ) then
    if new.action not in ('event_role_granted', 'event_role_revoked') then
      perform private.fanout_member_notification(
        'event_activity', 'event-activity:' || new.id::text,
        'event', coalesce(new.event_id, new.entity_id),
        coalesce(new.event_id, new.entity_id),
        'Event update', 'Club event information has changed. Open events to review it.', new.actor_id
      );
    end if;
    perform private.fanout_officer_notification(
      'officer_event', 'officer-event:' || new.id::text,
      'audit', new.id, coalesce(new.event_id, new.entity_id),
      'An event record changed', 'Review the event history and current event details.', new.actor_id
    );
  elsif new.action in (
    'member_approved', 'member_deactivated', 'member_reactivated',
    'member_rejected', 'club_role_granted', 'club_role_revoked'
  ) then
    perform private.fanout_officer_notification(
      'officer_member', 'officer-member:' || new.id::text,
      'audit', new.id, null,
      'A membership record changed', 'Review member administration and its audit history.', new.actor_id
    );
  elsif new.action like 'dues_%'
     or new.action like 'club_finance_%'
     or new.action like 'event_finance_%'
     or new.action like 'event_ticket_%'
     or new.action like 'event_ledger_%'
     or new.action like 'event_budget_%'
     or new.action in ('finance_category_created', 'finance_category_retired') then
    perform private.fanout_officer_notification(
      'officer_money', 'officer-money:' || new.id::text,
      'audit', new.id, new.event_id,
      'A financial record changed', 'Review the relevant private or event finance records.', new.actor_id
    );
  end if;
  return new;
end;
$function$;

-- 4. M6: Record audit trail entries in mark_notification_read, mark_notification_unread,
-- and mark_all_notifications_read when notification read state changes.
create or replace function private.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_read_at timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if p_notification_id is null then
    raise exception using errcode = '23514', message = 'Notification identifier is invalid.';
  end if;

  perform pg_catalog.set_config('app.notification_read_write', 'on', true);
  update public.notifications
  set read_at = v_read_at
  where id = p_notification_id
    and recipient_id = v_actor_id
    and read_at is null;
  if found then
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'notification.marked_read', 'notification',
      p_notification_id, v_actor_id,
      pg_catalog.jsonb_build_object('read_at', null),
      pg_catalog.jsonb_build_object('read_at', v_read_at),
      'Member marked an in-app notification as read.'
    );
  end if;
  perform pg_catalog.set_config('app.notification_read_write', 'off', true);
end;
$function$;

create or replace function private.mark_notification_unread(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_previous_read_at timestamptz;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if p_notification_id is null then
    raise exception using errcode = '23514', message = 'Notification identifier is invalid.';
  end if;

  select n.read_at into v_previous_read_at
  from public.notifications as n
  where n.id = p_notification_id
    and n.recipient_id = v_actor_id
  for update;

  if v_previous_read_at is null then
    return;
  end if;

  perform pg_catalog.set_config('app.notification_read_write', 'on', true);
  update public.notifications
  set read_at = null
  where id = p_notification_id
    and recipient_id = v_actor_id
    and read_at is not null;
  if found then
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'notification.marked_unread', 'notification',
      p_notification_id, v_actor_id,
      pg_catalog.jsonb_build_object('read_at', v_previous_read_at),
      pg_catalog.jsonb_build_object('read_at', null),
      'Member marked an in-app notification as unread.'
    );
  end if;
  perform pg_catalog.set_config('app.notification_read_write', 'off', true);
end;
$function$;

create or replace function private.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_read_at timestamptz := pg_catalog.clock_timestamp();
  v_count integer;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  perform pg_catalog.set_config('app.notification_read_write', 'on', true);
  update public.notifications
  set read_at = v_read_at
  where recipient_id = v_actor_id
    and read_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'notification.marked_all_read', 'notification',
      v_actor_id, v_actor_id,
      null,
      pg_catalog.jsonb_build_object('marked_count', v_count, 'read_at', v_read_at),
      'Member marked all unread in-app notifications as read.'
    );
  end if;
  perform pg_catalog.set_config('app.notification_read_write', 'off', true);
  return v_count;
end;
$function$;

revoke all on function private.queue_poll_closing_notifications(timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.notify_from_audit_log() from public, anon, authenticated, service_role;
revoke all on function private.mark_notification_read(uuid) from public, anon, authenticated, service_role;
revoke all on function private.mark_notification_unread(uuid) from public, anon, authenticated, service_role;
revoke all on function private.mark_all_notifications_read() from public, anon, authenticated, service_role;
grant execute on function private.mark_notification_read(uuid) to authenticated;
grant execute on function private.mark_notification_unread(uuid) to authenticated;
grant execute on function private.mark_all_notifications_read() to authenticated;
