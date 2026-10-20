alter table public.announcements
  add column priority text not null default 'standard',
  add column expires_at timestamptz,
  add constraint announcements_priority_check check (
    priority in ('standard', 'important', 'urgent')
    and (priority <> 'urgent' or expires_at is not null)
    and (priority <> 'standard' or expires_at is null)
  );

alter table public.announcement_revisions
  add column priority text not null default 'standard',
  add column expires_at timestamptz,
  add constraint announcement_revisions_priority_check check (
    priority in ('standard', 'important', 'urgent')
    and (priority <> 'urgent' or expires_at is not null)
    and (priority <> 'standard' or expires_at is null)
  );

create index announcements_priority_expiry_idx
  on public.announcements (priority, expires_at, created_at desc)
  where priority <> 'standard';

grant select (priority, expires_at)
  on public.announcements to authenticated;
grant select (priority, expires_at)
  on public.announcement_revisions to authenticated;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_event_id uuid := p_event_id;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_priority text := p_priority;
  v_expires_at timestamptz := p_expires_at;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member())
     or not (select private.can_publish_communications(v_event_id)) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);

  if v_priority is null or v_priority not in ('standard', 'important', 'urgent')
     or (v_priority = 'standard' and v_expires_at is not null)
     or (
       v_expires_at is not null
       and v_expires_at <= pg_catalog.statement_timestamp()
     )
     or (v_priority = 'urgent' and (
       v_expires_at is null or v_expires_at <= pg_catalog.statement_timestamp()
     )) then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;
  if (v_priority <> 'standard' or v_expires_at is not null)
     and not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('executive'))
     ) then
    raise exception using errcode = '42501', message = 'Only Admin and Executive may set announcement priority.';
  end if;

  if v_event_id is not null then
    perform 1 from public.events as e
    where e.id = v_event_id and e.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'The event is unavailable for announcements.';
    end if;
  end if;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  insert into public.announcements (
    event_id, title, message, priority, expires_at, created_by, updated_by
  ) values (
    v_event_id, v_title, v_message, v_priority, v_expires_at, v_actor, v_actor
  ) returning id into v_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, expires_at, editor_id, reason
  ) values (
    v_id, v_event_id, 1, v_title, v_message,
    v_priority, v_expires_at, v_actor, 'Initial post'
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.created', 'announcement', v_id, v_event_id,
    null,
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'expires_at', v_expires_at
    ),
    'Initial post'
  );
  return v_id;
end;
$function$;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return private.create_announcement(
    p_event_id, p_title, p_message, 'standard', null
  );
end;
$function$;

create or replace function private.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text,
  p_priority text,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_reason text := pg_catalog.btrim(p_reason);
  v_priority text := p_priority;
  v_expires_at timestamptz := p_expires_at;
  v_priority_changed boolean;
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Announcement edits require a valid reason.';
  end if;
  if v_priority is null or v_priority not in ('standard', 'important', 'urgent')
     or (v_priority = 'standard' and v_expires_at is not null)
     or (v_priority = 'urgent' and v_expires_at is null) then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;

  v_priority_changed := v_priority is distinct from v_old.priority
    or v_expires_at is distinct from v_old.expires_at;
  if v_priority_changed and not (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('executive'))
  ) then
    raise exception using errcode = '42501', message = 'Only Admin and Executive may change announcement priority.';
  end if;
  v_revision := v_old.revision_number + 1;
  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    title = v_title,
    message = v_message,
    priority = v_priority,
    expires_at = v_expires_at,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_announcement_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_title, v_message,
    v_priority, v_expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.edited', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'title', v_old.title,
      'message', v_old.message,
      'priority', v_old.priority,
      'expires_at', v_old.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'expires_at', v_expires_at
    ),
    v_reason
  );
  return v_revision;
end;
$function$;

create or replace function private.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_priority text;
  v_expires_at timestamptz;
begin
  select a.priority, a.expires_at into v_priority, v_expires_at
  from public.announcements as a
  where a.id = p_announcement_id;
  if not found then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  return private.update_announcement(
    p_announcement_id, p_title, p_message, p_reason, v_priority, v_expires_at
  );
end;
$function$;

create or replace function public.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_expires_at timestamptz
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_announcement(
    p_event_id, p_title, p_message, p_priority, p_expires_at
  );
$function$;

create or replace function public.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text,
  p_priority text,
  p_expires_at timestamptz
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.update_announcement(
    p_announcement_id, p_title, p_message, p_reason, p_priority, p_expires_at
  );
$function$;

revoke execute on function private.create_announcement(uuid, text, text, text, timestamptz)
  from public, anon, service_role;
revoke execute on function private.update_announcement(uuid, text, text, text, text, timestamptz)
  from public, anon, service_role;
grant execute on function private.create_announcement(uuid, text, text, text, timestamptz)
  to authenticated;
grant execute on function private.update_announcement(uuid, text, text, text, text, timestamptz)
  to authenticated;

revoke execute on function public.create_announcement(uuid, text, text, text, timestamptz)
  from public, anon, service_role;
revoke execute on function public.update_announcement(uuid, text, text, text, text, timestamptz)
  from public, anon, service_role;
grant execute on function public.create_announcement(uuid, text, text, text, timestamptz)
  to authenticated;
grant execute on function public.update_announcement(uuid, text, text, text, text, timestamptz)
  to authenticated;

notify pgrst, 'reload schema';
