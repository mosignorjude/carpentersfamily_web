-- Step 23: Deduplicate event lifecycle notifications and ensure actors receive notifications for their own actions.

-- 1. Update private.fanout_member_notification to include the acting member so actors see broadcast activity in their feed.
create or replace function private.fanout_member_notification(
  p_category text,
  p_dedupe_key text,
  p_source_type text,
  p_source_id uuid,
  p_event_id uuid,
  p_title text,
  p_body text,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_category not in (
       'announcement', 'new_poll', 'poll_closing', 'attendance_open', 'event_activity'
     )
     or p_source_type not in ('announcement', 'poll', 'attendance', 'event')
     or p_dedupe_key is null or p_title is null or p_body is null then
    raise exception using errcode = '23514', message = 'Notification request is invalid.';
  end if;

  perform pg_catalog.set_config('app.notification_insert_write', 'on', true);
  insert into public.notifications (
    recipient_id, category, title, body, source_type, source_id,
    event_id, dedupe_key
  )
  select
    profile.id,
    p_category,
    private.sanitize_notification_text(p_title, 120),
    private.sanitize_notification_text(p_body, 300),
    p_source_type,
    p_source_id,
    p_event_id,
    p_dedupe_key
  from public.member_profiles as profile
  left join public.notification_preferences as preference
    on preference.member_id = profile.id
   and preference.category = p_category
  where profile.status = 'active'
    and coalesce(preference.enabled, true)
  on conflict (recipient_id, dedupe_key) do nothing;
  perform pg_catalog.set_config('app.notification_insert_write', 'off', true);
end;
$function$;

-- 2. Update private.fanout_officer_notification to include acting officers so officer action audit feeds include the actor.
create or replace function private.fanout_officer_notification(
  p_category text,
  p_dedupe_key text,
  p_source_type text,
  p_source_id uuid,
  p_event_id uuid,
  p_title text,
  p_body text,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_category not in ('officer_money', 'officer_member', 'officer_event')
     or p_source_type not in ('audit', 'event')
     or p_dedupe_key is null or p_title is null or p_body is null then
    raise exception using errcode = '23514', message = 'Notification request is invalid.';
  end if;

  perform pg_catalog.set_config('app.notification_insert_write', 'on', true);
  insert into public.notifications (
    recipient_id, category, title, body, source_type, source_id,
    event_id, dedupe_key
  )
  select distinct
    profile.id,
    p_category,
    private.sanitize_notification_text(p_title, 120),
    private.sanitize_notification_text(p_body, 300),
    p_source_type,
    p_source_id,
    p_event_id,
    p_dedupe_key
  from public.member_profiles as profile
  where profile.status = 'active'
    and (
      exists (
        select 1
        from public.member_role_assignments as club_role
        where club_role.member_id = profile.id
          and club_role.role in ('executive', 'admin', 'backup_admin')
          and club_role.revoked_at is null
      )
      or (
        p_event_id is not null
        and exists (
          select 1
          from public.event_role_assignments as event_role
          where event_role.member_id = profile.id
            and event_role.event_id = p_event_id
            and event_role.role in ('lead', 'assistant')
            and event_role.revoked_at is null
        )
      )
    )
  on conflict (recipient_id, dedupe_key) do nothing;
  perform pg_catalog.set_config('app.notification_insert_write', 'off', true);
end;
$function$;

-- 3. Update private.notify_single_member so targeted members always receive notice, even if self-assigned.
create or replace function private.notify_single_member(
  p_recipient_id uuid,
  p_category text,
  p_dedupe_key text,
  p_source_type text,
  p_source_id uuid,
  p_event_id uuid,
  p_title text,
  p_body text,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_recipient_id is null
     or p_dedupe_key is null
     or p_title is null
     or p_body is null then
    return;
  end if;

  perform pg_catalog.set_config('app.notification_insert_write', 'on', true);
  perform pg_catalog.set_config('app.notification_content_write', 'on', true);
  insert into public.notifications (
    recipient_id, category, title, body, source_type, source_id,
    event_id, dedupe_key
  )
  select
    profile.id,
    p_category,
    private.sanitize_notification_text(p_title, 120),
    private.sanitize_notification_text(p_body, 300),
    p_source_type,
    p_source_id,
    p_event_id,
    p_dedupe_key
  from public.member_profiles as profile
  left join public.notification_preferences as preference
    on preference.member_id = profile.id
   and preference.category = p_category
  where profile.id = p_recipient_id
    and profile.status = 'active'
    and coalesce(preference.enabled, true)
  on conflict (recipient_id, dedupe_key) do update
    set title = excluded.title,
        body = excluded.body;
  perform pg_catalog.set_config('app.notification_content_write', 'off', true);
  perform pg_catalog.set_config('app.notification_insert_write', 'off', true);
end;
$function$;

-- 4. Update private.notify_from_audit_log to eliminate duplicate officer_event fanout for general event actions.
create or replace function private.notify_from_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_copy record;
begin
  -- Ignore non-notifiable audit actions early
  if new.action not in (
    'announcement.created',
    'poll.created',
    'attendance.session_opened',
    'event_created', 'event_details_updated', 'event_completed',
    'event_cancelled', 'event_reopened', 'event_archived',
    'event_role_assigned', 'event_role_granted', 'event_role_revoked',
    'member_approved', 'member_deactivated', 'member_reactivated',
    'member_rejected', 'member_request_rejected',
    'club_role_granted', 'club_role_revoked',
    'finance_category_created', 'finance_category_retired'
  )
  and new.action not like 'dues_%'
  and new.action not like 'club_finance_%'
  and new.action not like 'event_finance_%'
  and new.action not like 'event_ticket_%'
  and new.action not like 'event_ledger_%'
  and new.action not like 'event_budget_%' then
    return new;
  end if;

  select * into v_copy
  from private.build_audit_notification_copy(new);

  if new.action = 'announcement.created' then
    perform private.fanout_member_notification(
      'announcement', 'announcement:' || new.entity_id::text,
      'announcement', new.entity_id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  elsif new.action = 'poll.created' then
    perform private.fanout_member_notification(
      'new_poll', 'poll:' || new.entity_id::text,
      'poll', new.entity_id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  elsif new.action = 'attendance.session_opened' then
    perform private.fanout_member_notification(
      'attendance_open', 'attendance-open:' || new.entity_id::text,
      'attendance', new.entity_id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  elsif new.action in (
    'event_created', 'event_details_updated', 'event_completed',
    'event_cancelled', 'event_reopened', 'event_archived'
  ) then
    -- Canonical event notification to all active members (which includes all officers)
    perform private.fanout_member_notification(
      'event_activity', 'event-activity:' || new.id::text,
      'event', v_copy.resolved_event_id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  elsif new.action in ('event_role_assigned', 'event_role_granted', 'event_role_revoked') then
    if v_copy.self_body is not null then
      perform private.notify_single_member(
        new.target_member_id,
        v_copy.self_category,
        'event-role-self:' || new.id::text,
        v_copy.self_source_type,
        v_copy.resolved_event_id,
        v_copy.resolved_event_id,
        v_copy.self_title,
        v_copy.self_body,
        new.actor_id
      );
    end if;
    perform private.fanout_officer_notification(
      'officer_event', 'officer-event:' || new.id::text,
      'audit', new.id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  elsif new.action in (
    'member_approved', 'member_deactivated', 'member_reactivated',
    'member_rejected', 'member_request_rejected',
    'club_role_granted', 'club_role_revoked'
  ) then
    if new.action = 'club_role_granted' then
      perform pg_catalog.set_config('app.notification_delete_write', 'on', true);
      delete from public.notifications as n
      using public.audit_log as al
      where n.source_type = 'audit'
        and n.source_id = al.id
        and al.action = 'club_role_revoked'
        and al.target_member_id = new.target_member_id
        and al.actor_id is not distinct from new.actor_id
        and n.created_at >= pg_catalog.transaction_timestamp();
      perform pg_catalog.set_config('app.notification_delete_write', 'off', true);
    end if;

    if v_copy.self_body is not null then
      perform private.notify_single_member(
        new.target_member_id,
        v_copy.self_category,
        'member-self:' || new.id::text,
        v_copy.self_source_type,
        new.id,
        null,
        v_copy.self_title,
        v_copy.self_body,
        new.actor_id
      );
    end if;

    perform private.fanout_officer_notification(
      'officer_member', 'officer-member:' || new.id::text,
      'audit', new.id, null,
      v_copy.title, v_copy.officer_body, new.actor_id
    );

  else
    if v_copy.self_body is not null then
      perform private.notify_single_member(
        new.target_member_id,
        v_copy.self_category,
        'dues-self:' || new.id::text,
        v_copy.self_source_type,
        new.entity_id,
        null,
        v_copy.self_title,
        v_copy.self_body,
        new.actor_id
      );
    end if;

    perform private.fanout_officer_notification(
      'officer_money', 'officer-money:' || new.id::text,
      'audit', new.id, v_copy.resolved_event_id,
      v_copy.title, v_copy.officer_body, new.actor_id
    );
  end if;

  return new;
end;
$function$;

-- 5. Revoke and grant execution permissions
revoke all on function private.fanout_member_notification(text, text, text, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.fanout_member_notification(text, text, text, uuid, uuid, text, text, uuid) to authenticated;

revoke all on function private.fanout_officer_notification(text, text, text, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.fanout_officer_notification(text, text, text, uuid, uuid, text, text, uuid) to authenticated;

revoke all on function private.notify_single_member(uuid, text, text, text, uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function private.notify_single_member(uuid, text, text, text, uuid, uuid, text, text, uuid) to authenticated;

revoke all on function private.notify_from_audit_log() from public, anon, authenticated, service_role;
grant execute on function private.notify_from_audit_log() to authenticated;

-- 6. Clean up existing duplicate officer_event notifications that mirror event-activity
do $$
begin
  perform pg_catalog.set_config('app.notification_delete_write', 'on', true);
  delete from public.notifications as n_officer
  where n_officer.category = 'officer_event'
    and n_officer.dedupe_key like 'officer-event:%'
    and exists (
      select 1
      from public.notifications as n_member
      where n_member.recipient_id = n_officer.recipient_id
        and n_member.category = 'event_activity'
        and n_member.dedupe_key = 'event-activity:' || pg_catalog.substring(n_officer.dedupe_key, 15)
    );
  perform pg_catalog.set_config('app.notification_delete_write', 'off', true);
end
$$;

-- 7. Backfill missing event_activity notifications for actors who created events previously
do $$
begin
  perform pg_catalog.set_config('app.notification_insert_write', 'on', true);
  perform pg_catalog.set_config('app.notification_content_write', 'on', true);

  insert into public.notifications (
    recipient_id, category, title, body, source_type, source_id,
    event_id, dedupe_key, created_at
  )
  select
    al.actor_id,
    'event_activity',
    v_copy.title,
    v_copy.officer_body,
    'event',
    v_copy.resolved_event_id,
    v_copy.resolved_event_id,
    'event-activity:' || al.id::text,
    al.occurred_at
  from public.audit_log as al
  cross join lateral private.build_audit_notification_copy(al) as v_copy
  join public.member_profiles as mp on mp.id = al.actor_id
  where al.action in (
    'event_created', 'event_details_updated', 'event_completed',
    'event_cancelled', 'event_reopened', 'event_archived'
  )
    and al.actor_id is not null
    and mp.status = 'active'
  on conflict (recipient_id, dedupe_key) do nothing;

  perform pg_catalog.set_config('app.notification_content_write', 'off', true);
  perform pg_catalog.set_config('app.notification_insert_write', 'off', true);
end
$$;
