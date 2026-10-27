-- A member who submits a dues payment request must not receive the officer
-- review-feed notification for that same request, even when they are an
-- Executive, Admin, or Backup Admin. Keep actor-feed behavior for other
-- officer notifications unchanged.
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
    -- Only this dues action suppresses the actor. Other officer feeds continue
    -- to include their actor as established by the existing actor-feed policy.
    and not (
      p_category = 'officer_money'
      and p_source_type = 'audit'
      and exists (
        select 1
        from public.audit_log as source_audit
        where source_audit.id = p_source_id
          and source_audit.action = 'dues_payment_request_submitted'
          and source_audit.actor_id = profile.id
      )
    )
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

revoke all on function private.fanout_officer_notification(text, text, text, uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.fanout_officer_notification(text, text, text, uuid, uuid, text, text, uuid)
  to authenticated;
