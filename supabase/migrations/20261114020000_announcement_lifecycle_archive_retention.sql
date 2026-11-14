-- Announcement lifecycle improvements (Issues 05 & 06):
-- 1. Support DRAFT -> ACTIVE -> ARCHIVED -> PERMANENTLY DELETED lifecycle
-- 2. Configurable duration presets (7d, 14d, 30d default, 60d, 90d, custom) starting countdown from published_at
-- 3. Preserve expiry on content edits unless explicitly changed; record all changes in revisions & audit_log
-- 4. Fix Club President priority parity and empower scoped Event Leads + Club Officers with duration/delete/restore
-- 5. Manual soft-delete to 7-day Archive retention + Restoration + pg_cron auto-archive & purge

alter table public.announcements
  drop constraint if exists announcements_priority_check,
  add column if not exists status text not null default 'active',
  add column if not exists duration_preset text not null default '30d',
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.member_profiles (id) on delete restrict,
  add column if not exists archive_reason text,
  add column if not exists purge_after timestamptz;

alter table public.announcement_revisions
  drop constraint if exists announcement_revisions_priority_check,
  add column if not exists status text not null default 'active',
  add column if not exists duration_preset text not null default '30d';

-- Backfill existing rows cleanly without mutating revision_number or updated_at.
alter table public.announcements disable trigger announcements_write_guard;
update public.announcements
set
  status = 'active',
  published_at = created_at,
  duration_preset = case
    when expires_at is not null then 'custom'
    else '30d'
  end,
  expires_at = coalesce(expires_at, created_at + interval '30 days')
where published_at is null;
alter table public.announcements enable trigger announcements_write_guard;

alter table public.announcement_revisions disable trigger announcement_revisions_append_only;
update public.announcement_revisions
set
  status = 'active',
  duration_preset = case
    when expires_at is not null then 'custom'
    else '30d'
  end
where duration_preset = '30d' and expires_at is not null;
alter table public.announcement_revisions enable trigger announcement_revisions_append_only;

alter table public.announcements
  add constraint announcements_priority_check check (
    priority in ('standard', 'important', 'urgent')
  ),
  add constraint announcements_status_check check (
    status in ('draft', 'active', 'archived')
  ),
  add constraint announcements_duration_preset_check check (
    duration_preset in ('7d', '14d', '30d', '60d', '90d', 'custom')
  ),
  add constraint announcements_archive_reason_check check (
    archive_reason is null or archive_reason in ('expired', 'manual_delete')
  ),
  add constraint announcements_lifecycle_consistency_check check (
    (
      status = 'draft'
      and published_at is null
      and archived_at is null
      and archived_by is null
      and archive_reason is null
      and purge_after is null
      and (duration_preset = 'custom' or expires_at is null)
    )
    or (
      status = 'active'
      and published_at is not null
      and expires_at is not null
      and archived_at is null
      and archived_by is null
      and archive_reason is null
      and purge_after is null
    )
    or (
      status = 'archived'
      and archived_at is not null
      and archive_reason is not null
      and purge_after is not null
    )
  );

alter table public.announcement_revisions
  add constraint announcement_revisions_priority_check check (
    priority in ('standard', 'important', 'urgent')
  ),
  add constraint announcement_revisions_status_check check (
    status in ('draft', 'active', 'archived')
  ),
  add constraint announcement_revisions_duration_preset_check check (
    duration_preset in ('7d', '14d', '30d', '60d', '90d', 'custom')
  );

create index if not exists announcements_active_expiry_idx
  on public.announcements (expires_at asc)
  where status = 'active';

create index if not exists announcements_archived_purge_idx
  on public.announcements (purge_after asc)
  where status = 'archived';

create index if not exists announcements_drafts_created_idx
  on public.announcements (created_at desc, id desc)
  where status = 'draft';

grant select (
  status,
  duration_preset,
  published_at,
  archived_at,
  archived_by,
  archive_reason,
  purge_after
) on public.announcements to authenticated;

grant select (status, duration_preset)
  on public.announcement_revisions to authenticated;

drop policy if exists announcements_read_active_members on public.announcements;
create policy announcements_read_active_members
  on public.announcements for select to authenticated
  using (
    (select private.is_active_club_member())
    and (
      status = 'active'
      or (
        status in ('draft', 'archived')
        and (select private.can_publish_communications(event_id))
      )
    )
  );

-- Guard triggers: retain strict write controls while permitting 7-day cron purge ONLY under app.communication_purge = 'on'.
create or replace function private.guard_announcement_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if pg_catalog.current_setting('app.communication_purge', true) = 'on'
       and old.status = 'archived'
       and old.purge_after is not null
       and old.purge_after <= pg_catalog.clock_timestamp() then
      return old;
    end if;
    raise exception using errcode = '42501', message = 'Announcements change only through checked procedures and are retained.';
  end if;

  if pg_catalog.current_setting('app.communication_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Announcements change only through checked procedures and are retained.';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or (old.published_at is not null and new.published_at is distinct from old.published_at)
    or new.revision_number <> old.revision_number + 1
    or new.updated_at <= old.updated_at
  ) then
    raise exception using errcode = '42501', message = 'Announcement identity and revision history are retained.';
  end if;

  if tg_op = 'INSERT' and new.revision_number <> 1 then
    raise exception using errcode = '42501', message = 'Announcements start at revision one.';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_announcement_revision_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('app.communication_purge', true) = 'on' then
    return old;
  end if;
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.communication_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Announcement history is append-only.';
  end if;
  return new;
end;
$function$;

create or replace function private.guard_announcement_read_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('app.communication_purge', true) = 'on' then
    return old;
  end if;
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.communication_read_write', true) is distinct from 'on'
     or new.member_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Read markers are private and self-managed.';
  end if;
  return new;
end;
$function$;

create or replace function private.can_elevate_announcement_priority()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('president'))
      or (select private.has_club_role('executive'))
    );
$function$;

revoke execute on function private.can_elevate_announcement_priority()
  from public, anon, service_role;
grant execute on function private.can_elevate_announcement_priority()
  to authenticated;

create or replace function private.resolve_announcement_duration(
  p_status text,
  p_duration_preset text,
  p_custom_expires_at timestamptz,
  p_anchor_at timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_anchor timestamptz := coalesce(p_anchor_at, pg_catalog.clock_timestamp());
  v_expires timestamptz;
begin
  if p_status not in ('draft', 'active') then
    raise exception using errcode = '22023', message = 'Announcement status is invalid.';
  end if;
  if p_duration_preset is null
     or p_duration_preset not in ('7d', '14d', '30d', '60d', '90d', 'custom') then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;

  if p_status = 'draft' then
    if p_duration_preset <> 'custom' then
      return null;
    end if;
    if p_custom_expires_at is not null
       and p_custom_expires_at <= pg_catalog.statement_timestamp() then
      raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
    end if;
    return p_custom_expires_at;
  end if;

  case p_duration_preset
    when '7d' then v_expires := v_anchor + interval '7 days';
    when '14d' then v_expires := v_anchor + interval '14 days';
    when '30d' then v_expires := v_anchor + interval '30 days';
    when '60d' then v_expires := v_anchor + interval '60 days';
    when '90d' then v_expires := v_anchor + interval '90 days';
    when 'custom' then
      if p_custom_expires_at is null
         or p_custom_expires_at <= pg_catalog.statement_timestamp()
         or p_custom_expires_at <= v_anchor then
        raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
      end if;
      v_expires := p_custom_expires_at;
  end case;

  if v_expires is null or v_expires <= pg_catalog.statement_timestamp() then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;
  return v_expires;
end;
$function$;

revoke execute on function private.resolve_announcement_duration(text, text, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function private.resolve_announcement_duration(text, text, timestamptz, timestamptz)
  to authenticated;

-- Canonical 7-arg create_announcement supporting draft/active and configurable duration presets.
create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_duration_preset text,
  p_expires_at timestamptz,
  p_status text
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
  v_priority text := coalesce(nullif(pg_catalog.btrim(p_priority), ''), 'standard');
  v_status text := coalesce(nullif(pg_catalog.btrim(p_status), ''), 'active');
  v_duration_preset text := coalesce(nullif(pg_catalog.btrim(p_duration_preset), ''), '30d');
  v_published_at timestamptz;
  v_expires_at timestamptz;
  v_reason text;
  v_audit_action text;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member())
     or not (select private.can_publish_communications(v_event_id)) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;

  perform private.validate_communication_text(v_title, v_message);

  if v_priority not in ('standard', 'important', 'urgent') then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;
  if v_priority <> 'standard'
     and not (select private.can_elevate_announcement_priority()) then
    raise exception using errcode = '42501', message = 'Only Club Officers may set announcement priority.';
  end if;

  if v_status not in ('draft', 'active') then
    raise exception using errcode = '22023', message = 'Announcement status is invalid.';
  end if;

  if v_event_id is not null then
    perform 1 from public.events as e
    where e.id = v_event_id and e.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'The event is unavailable for announcements.';
    end if;
  end if;

  v_published_at := case when v_status = 'active' then pg_catalog.clock_timestamp() else null end;
  v_expires_at := private.resolve_announcement_duration(
    v_status, v_duration_preset, p_expires_at, v_published_at
  );
  v_reason := case when v_status = 'draft' then 'Saved as draft' else 'Initial post' end;
  v_audit_action := case when v_status = 'draft' then 'announcement.draft_created' else 'announcement.created' end;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  insert into public.announcements (
    event_id, title, message, priority, status, duration_preset,
    published_at, expires_at, created_by, updated_by
  ) values (
    v_event_id, v_title, v_message, v_priority, v_status, v_duration_preset,
    v_published_at, v_expires_at, v_actor, v_actor
  ) returning id into v_id;

  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, status, duration_preset, expires_at, editor_id, reason
  ) values (
    v_id, v_event_id, 1, v_title, v_message,
    v_priority, v_status, v_duration_preset, v_expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);

  perform private.append_communication_audit(
    v_actor, v_audit_action, 'announcement', v_id, v_event_id,
    null,
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'status', v_status,
      'duration_preset', v_duration_preset,
      'published_at', v_published_at,
      'expires_at', v_expires_at
    ),
    v_reason
  );
  return v_id;
end;
$function$;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_expires_at timestamptz
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.create_announcement(
    p_event_id,
    p_title,
    p_message,
    p_priority,
    case when p_expires_at is null then '30d' else 'custom' end,
    p_expires_at,
    'active'
  );
$function$;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text
)
returns uuid
language sql
security definer
set search_path = ''
as $function$
  select private.create_announcement(
    p_event_id, p_title, p_message, 'standard', '30d', null, 'active'
  );
$function$;

create or replace function public.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_duration_preset text,
  p_expires_at timestamptz,
  p_status text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_announcement(
    p_event_id, p_title, p_message, p_priority, p_duration_preset, p_expires_at, p_status
  );
$function$;

-- Publish an existing draft announcement, starting the expiry countdown from actual published_at.
create or replace function private.publish_announcement(
  p_announcement_id uuid,
  p_duration_preset text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_duration_preset text;
  v_custom_expires timestamptz;
  v_expires_at timestamptz;
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;

  if v_old.status <> 'draft' then
    raise exception using errcode = '22023', message = 'Only draft announcements can be published.';
  end if;

  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '22023', message = 'The event is unavailable for announcements.';
  end if;

  v_duration_preset := coalesce(nullif(pg_catalog.btrim(p_duration_preset), ''), v_old.duration_preset);
  v_custom_expires := coalesce(p_expires_at, v_old.expires_at);
  v_expires_at := private.resolve_announcement_duration(
    'active', v_duration_preset, v_custom_expires, v_now
  );
  v_revision := v_old.revision_number + 1;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    status = 'active',
    duration_preset = v_duration_preset,
    published_at = v_now,
    expires_at = v_expires_at,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = greatest(v_now, v_old.updated_at + interval '1 millisecond')
  where id = p_announcement_id;

  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, status, duration_preset, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_old.title, v_old.message,
    v_old.priority, 'active', v_duration_preset, v_expires_at, v_actor, 'Published draft'
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);

  perform private.append_communication_audit(
    v_actor, 'announcement.created', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'status', v_old.status,
      'duration_preset', v_old.duration_preset,
      'expires_at', v_old.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'title', v_old.title,
      'message', v_old.message,
      'priority', v_old.priority,
      'status', 'active',
      'duration_preset', v_duration_preset,
      'published_at', v_now,
      'expires_at', v_expires_at
    ),
    'Published draft'
  );

  return pg_catalog.jsonb_build_object(
    'id', p_announcement_id,
    'event_id', v_old.event_id,
    'title', v_old.title,
    'message', v_old.message,
    'priority', v_old.priority,
    'published_at', v_now,
    'expires_at', v_expires_at,
    'revision_number', v_revision
  );
end;
$function$;

create or replace function public.publish_announcement(
  p_announcement_id uuid,
  p_duration_preset text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.publish_announcement(p_announcement_id, p_duration_preset, p_expires_at);
$function$;

-- Canonical 8-arg update_announcement supporting content edits without resetting expiry, or explicit duration updates.
create or replace function private.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text,
  p_priority text,
  p_duration_preset text,
  p_expires_at timestamptz,
  p_expiry_action text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_reason text := pg_catalog.btrim(p_reason);
  v_priority text := coalesce(nullif(pg_catalog.btrim(p_priority), ''), 'standard');
  v_expiry_action text := coalesce(nullif(pg_catalog.btrim(p_expiry_action), ''), 'keep');
  v_duration_preset text;
  v_expires_at timestamptz;
  v_revision integer;
  v_audit_action text;
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
  if v_priority not in ('standard', 'important', 'urgent') then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;
  if v_expiry_action not in ('keep', 'set') then
    raise exception using errcode = '22023', message = 'Announcement duration action is invalid.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;

  if v_old.status = 'archived' then
    raise exception using errcode = '42501', message = 'Archived announcements must be restored before editing.';
  end if;

  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;

  if v_priority is distinct from v_old.priority
     and not (select private.can_elevate_announcement_priority()) then
    raise exception using errcode = '42501', message = 'Only Club Officers may change announcement priority.';
  end if;

  if v_expiry_action = 'keep' then
    v_duration_preset := v_old.duration_preset;
    v_expires_at := v_old.expires_at;
  else
    v_duration_preset := coalesce(nullif(pg_catalog.btrim(p_duration_preset), ''), v_old.duration_preset);
    v_expires_at := private.resolve_announcement_duration(
      v_old.status, v_duration_preset, p_expires_at, v_now
    );
  end if;

  v_revision := v_old.revision_number + 1;
  v_audit_action := case when v_old.status = 'draft' then 'announcement.draft_edited' else 'announcement.edited' end;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    title = v_title,
    message = v_message,
    priority = v_priority,
    duration_preset = v_duration_preset,
    expires_at = v_expires_at,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = greatest(v_now, v_old.updated_at + interval '1 millisecond')
  where id = p_announcement_id;

  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, status, duration_preset, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_title, v_message,
    v_priority, v_old.status, v_duration_preset, v_expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);

  perform private.append_communication_audit(
    v_actor, v_audit_action, 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'title', v_old.title,
      'message', v_old.message,
      'priority', v_old.priority,
      'duration_preset', v_old.duration_preset,
      'expires_at', v_old.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'duration_preset', v_duration_preset,
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
  v_old_expires timestamptz;
  v_old_preset text;
begin
  select a.expires_at, a.duration_preset into v_old_expires, v_old_preset
  from public.announcements as a
  where a.id = p_announcement_id;
  if not found then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;

  if p_expires_at is distinct from v_old_expires and p_expires_at is not null then
    return private.update_announcement(
      p_announcement_id, p_title, p_message, p_reason, p_priority,
      'custom', p_expires_at, 'set'
    );
  end if;

  return private.update_announcement(
    p_announcement_id, p_title, p_message, p_reason, p_priority,
    v_old_preset, v_old_expires, 'keep'
  );
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
  v_old public.announcements%rowtype;
begin
  select a.* into v_old
  from public.announcements as a
  where a.id = p_announcement_id;
  if not found then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  return private.update_announcement(
    p_announcement_id, p_title, p_message, p_reason, v_old.priority,
    v_old.duration_preset, v_old.expires_at, 'keep'
  );
end;
$function$;

create or replace function public.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text,
  p_priority text,
  p_duration_preset text,
  p_expires_at timestamptz,
  p_expiry_action text
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.update_announcement(
    p_announcement_id, p_title, p_message, p_reason, p_priority,
    p_duration_preset, p_expires_at, p_expiry_action
  );
$function$;

-- Manual soft delete (Issue 06): moves announcement to Archive for 7-day retention.
create or replace function private.archive_announcement(
  p_announcement_id uuid,
  p_reason text default 'Manually deleted'
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reason text := coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'Manually deleted');
  v_purge_after timestamptz := v_now + interval '7 days';
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement deletion access is required.';
  end if;
  if pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Provide a valid reason before deleting this announcement.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement deletion access is required.';
  end if;
  if v_old.status = 'archived' then
    raise exception using errcode = '22023', message = 'Announcement is already in the archive.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;

  v_revision := v_old.revision_number + 1;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    status = 'archived',
    archived_at = v_now,
    archived_by = v_actor,
    archive_reason = 'manual_delete',
    purge_after = v_purge_after,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = greatest(v_now, v_old.updated_at + interval '1 millisecond')
  where id = p_announcement_id;

  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, status, duration_preset, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_old.title, v_old.message,
    v_old.priority, 'archived', v_old.duration_preset, v_old.expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);

  perform private.append_communication_audit(
    v_actor, 'announcement.archived', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'status', v_old.status,
      'published_at', v_old.published_at,
      'expires_at', v_old.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'status', 'archived',
      'archive_reason', 'manual_delete',
      'archived_at', v_now,
      'purge_after', v_purge_after
    ),
    v_reason
  );

  return v_purge_after;
end;
$function$;

create or replace function public.archive_announcement(
  p_announcement_id uuid,
  p_reason text default 'Manually deleted'
)
returns timestamptz
language sql
security invoker
set search_path = ''
as $function$
  select private.archive_announcement(p_announcement_id, p_reason);
$function$;

-- Restore archived announcement within 7-day retention window without re-broadcasting emails.
create or replace function private.restore_announcement(
  p_announcement_id uuid,
  p_duration_preset text default null,
  p_expires_at timestamptz default null,
  p_reason text default 'Restored from archive'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reason text := coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'Restored from archive');
  v_duration_preset text;
  v_expires_at timestamptz;
  v_target_status text;
  v_published_at timestamptz;
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement restoration access is required.';
  end if;
  if pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Provide a valid reason for restoring this announcement.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement restoration access is required.';
  end if;

  if v_old.status <> 'archived' then
    raise exception using errcode = '22023', message = 'Only archived announcements can be restored.';
  end if;
  if v_old.purge_after is null or v_old.purge_after <= v_now then
    raise exception using errcode = '22023', message = 'The 7-day archive recovery window has ended.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;

  if v_old.published_at is null then
    -- Unpublished drafts return safely to DRAFT state instead of publishing without notifications.
    v_target_status := 'draft';
    v_published_at := null;
    v_duration_preset := coalesce(nullif(pg_catalog.btrim(p_duration_preset), ''), v_old.duration_preset);
    v_expires_at := private.resolve_announcement_duration(
      'draft', v_duration_preset, coalesce(p_expires_at, v_old.expires_at), null
    );
  else
    v_target_status := 'active';
    v_published_at := v_old.published_at;
    if p_duration_preset is null and p_expires_at is null then
      if v_old.archive_reason = 'expired'
         or v_old.expires_at is null
         or v_old.expires_at <= v_now then
        raise exception using errcode = '22023', message = 'Expired announcements require a new future expiry duration before restoration.';
      end if;
      v_duration_preset := v_old.duration_preset;
      v_expires_at := v_old.expires_at;
    else
      v_duration_preset := coalesce(nullif(pg_catalog.btrim(p_duration_preset), ''), 'custom');
      v_expires_at := private.resolve_announcement_duration(
        'active', v_duration_preset, p_expires_at, v_now
      );
    end if;
  end if;

  v_revision := v_old.revision_number + 1;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    status = v_target_status,
    published_at = v_published_at,
    duration_preset = v_duration_preset,
    expires_at = v_expires_at,
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    purge_after = null,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = greatest(v_now, v_old.updated_at + interval '1 millisecond')
  where id = p_announcement_id;

  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, status, duration_preset, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_old.title, v_old.message,
    v_old.priority, v_target_status, v_duration_preset, v_expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);

  perform private.append_communication_audit(
    v_actor, 'announcement.restored', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'status', 'archived',
      'archive_reason', v_old.archive_reason,
      'archived_at', v_old.archived_at,
      'purge_after', v_old.purge_after
    ),
    pg_catalog.jsonb_build_object(
      'status', v_target_status,
      'duration_preset', v_duration_preset,
      'published_at', v_published_at,
      'expires_at', v_expires_at
    ),
    v_reason
  );

  return v_revision;
end;
$function$;

create or replace function public.restore_announcement(
  p_announcement_id uuid,
  p_duration_preset text default null,
  p_expires_at timestamptz default null,
  p_reason text default 'Restored from archive'
)
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.restore_announcement(
    p_announcement_id, p_duration_preset, p_expires_at, p_reason
  );
$function$;

-- Restrict mark_announcement_read to active, unexpired announcements.
create or replace function private.mark_announcement_read(p_announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if not exists (
    select 1 from public.announcements as a
    where a.id = p_announcement_id
      and a.status = 'active'
      and (a.expires_at is null or a.expires_at > pg_catalog.clock_timestamp())
  ) then
    raise exception using errcode = '42501', message = 'Announcement is unavailable.';
  end if;
  perform pg_catalog.set_config('app.communication_read_write', 'on', true);
  insert into public.announcement_reads (announcement_id, member_id)
  values (p_announcement_id, v_actor)
  on conflict (announcement_id, member_id) do nothing;
  perform pg_catalog.set_config('app.communication_read_write', 'off', true);
end;
$function$;

-- Scoped reader RPCs for Drafts and Archive sections (authorized officers & event leads only).
create or replace function public.list_draft_announcements()
returns table (
  id uuid,
  event_id uuid,
  title text,
  message text,
  priority text,
  status text,
  duration_preset text,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_by uuid,
  updated_at timestamptz,
  revision_number integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    a.id, a.event_id, a.title, a.message, a.priority, a.status,
    a.duration_preset, a.expires_at, a.created_by, a.created_at,
    a.updated_by, a.updated_at, a.revision_number
  from public.announcements as a
  where a.status = 'draft'
    and (select private.is_active_club_member())
    and (select private.can_publish_communications(a.event_id))
  order by a.updated_at desc, a.id desc;
$function$;

create or replace function public.list_archived_announcements()
returns table (
  id uuid,
  event_id uuid,
  title text,
  message text,
  priority text,
  status text,
  duration_preset text,
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  purge_after timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_by uuid,
  updated_at timestamptz,
  revision_number integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    a.id, a.event_id, a.title, a.message, a.priority, a.status,
    a.duration_preset, a.published_at, a.expires_at,
    a.archived_at, a.archived_by, a.archive_reason, a.purge_after,
    a.created_by, a.created_at, a.updated_by, a.updated_at, a.revision_number
  from public.announcements as a
  where a.status = 'archived'
    and (select private.is_active_club_member())
    and (select private.can_publish_communications(a.event_id))
  order by a.archived_at desc nulls last, a.id desc;
$function$;

-- Cron lifecycle worker:
-- 1) Transition expired active announcements -> ARCHIVED (7-day recovery window)
-- 2) Permanently delete archived announcements past purge_after while preserving audit_log & notification_outbox
create or replace function private.process_announcement_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_archived_count integer := 0;
  v_purged_count integer := 0;
  v_row public.announcements%rowtype;
  v_purge_after timestamptz;
  v_audit_actor uuid;
  v_revision integer;
begin
  -- Step 1: Auto-archive active announcements whose expiry has passed.
  for v_row in
    select a.*
    from public.announcements as a
    where a.status = 'active'
      and a.expires_at is not null
      and a.expires_at <= v_now
    for update skip locked
  loop
    v_purge_after := v_now + interval '7 days';
    v_audit_actor := coalesce(v_row.archived_by, v_row.updated_by, v_row.created_by);
    v_revision := v_row.revision_number + 1;

    perform pg_catalog.set_config('app.communication_write', 'on', true);
    update public.announcements set
      status = 'archived',
      archived_at = v_now,
      archived_by = null,
      archive_reason = 'expired',
      purge_after = v_purge_after,
      revision_number = v_revision,
      updated_at = greatest(v_now, v_row.updated_at + interval '1 millisecond')
    where id = v_row.id;

    insert into public.announcement_revisions (
      announcement_id, event_id, revision_number, title, message,
      priority, status, duration_preset, expires_at, editor_id, reason
    ) values (
      v_row.id, v_row.event_id, v_revision, v_row.title, v_row.message,
      v_row.priority, 'archived', v_row.duration_preset, v_row.expires_at,
      v_audit_actor, 'Automatically archived after expiry'
    );
    perform pg_catalog.set_config('app.communication_write', 'off', true);

    perform private.append_communication_audit(
      v_audit_actor, 'announcement.auto_archived', 'announcement', v_row.id, v_row.event_id,
      pg_catalog.jsonb_build_object(
        'status', v_row.status,
        'published_at', v_row.published_at,
        'expires_at', v_row.expires_at
      ),
      pg_catalog.jsonb_build_object(
        'status', 'archived',
        'archive_reason', 'expired',
        'archived_at', v_now,
        'purge_after', v_purge_after,
        'system_job', true
      ),
      'Automatically archived after expiry'
    );

    v_archived_count := v_archived_count + 1;
  end loop;

  -- Step 2: Permanently purge archived announcements past 7-day retention.
  for v_row in
    select a.*
    from public.announcements as a
    where a.status = 'archived'
      and a.purge_after is not null
      and a.purge_after <= v_now
    for update skip locked
  loop
    v_audit_actor := coalesce(v_row.archived_by, v_row.updated_by, v_row.created_by);

    perform private.append_communication_audit(
      v_audit_actor, 'announcement.permanently_deleted', 'announcement', v_row.id, v_row.event_id,
      pg_catalog.jsonb_build_object(
        'title', v_row.title,
        'priority', v_row.priority,
        'status', v_row.status,
        'published_at', v_row.published_at,
        'expires_at', v_row.expires_at,
        'archived_at', v_row.archived_at,
        'archive_reason', v_row.archive_reason,
        'purge_after', v_row.purge_after
      ),
      pg_catalog.jsonb_build_object(
        'permanently_deleted_at', v_now,
        'system_job', true
      ),
      'Permanently purged after 7-day archive retention'
    );

    perform pg_catalog.set_config('app.communication_purge', 'on', true);
    perform pg_catalog.set_config('app.communication_write', 'on', true);
    perform pg_catalog.set_config('app.notification_delete_write', 'on', true);

    delete from public.announcement_reads where announcement_id = v_row.id;
    delete from public.announcement_revisions where announcement_id = v_row.id;
    delete from public.notifications
    where source_type = 'announcement' and source_id = v_row.id;
    delete from public.announcements where id = v_row.id;

    perform pg_catalog.set_config('app.notification_delete_write', 'off', true);
    perform pg_catalog.set_config('app.communication_write', 'off', true);
    perform pg_catalog.set_config('app.communication_purge', 'off', true);

    v_purged_count := v_purged_count + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'archived_count', v_archived_count,
    'purged_count', v_purged_count,
    'processed_at', v_now
  );
end;
$function$;

revoke all on function private.process_announcement_lifecycle()
  from public, anon, authenticated, service_role;

revoke execute on function private.create_announcement(uuid, text, text, text, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function private.create_announcement(uuid, text, text, text, text, timestamptz, text)
  to authenticated;
revoke execute on function public.create_announcement(uuid, text, text, text, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function public.create_announcement(uuid, text, text, text, text, timestamptz, text)
  to authenticated;

revoke execute on function private.publish_announcement(uuid, text, timestamptz)
  from public, anon, service_role;
grant execute on function private.publish_announcement(uuid, text, timestamptz)
  to authenticated;
revoke execute on function public.publish_announcement(uuid, text, timestamptz)
  from public, anon, service_role;
grant execute on function public.publish_announcement(uuid, text, timestamptz)
  to authenticated;

revoke execute on function private.update_announcement(uuid, text, text, text, text, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function private.update_announcement(uuid, text, text, text, text, text, timestamptz, text)
  to authenticated;
revoke execute on function public.update_announcement(uuid, text, text, text, text, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function public.update_announcement(uuid, text, text, text, text, text, timestamptz, text)
  to authenticated;

revoke execute on function private.archive_announcement(uuid, text)
  from public, anon, service_role;
grant execute on function private.archive_announcement(uuid, text)
  to authenticated;
revoke execute on function public.archive_announcement(uuid, text)
  from public, anon, service_role;
grant execute on function public.archive_announcement(uuid, text)
  to authenticated;

revoke execute on function private.restore_announcement(uuid, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function private.restore_announcement(uuid, text, timestamptz, text)
  to authenticated;
revoke execute on function public.restore_announcement(uuid, text, timestamptz, text)
  from public, anon, service_role;
grant execute on function public.restore_announcement(uuid, text, timestamptz, text)
  to authenticated;

revoke execute on function public.list_draft_announcements()
  from public, anon, service_role;
grant execute on function public.list_draft_announcements()
  to authenticated;

revoke execute on function public.list_archived_announcements()
  from public, anon, service_role;
grant execute on function public.list_archived_announcements()
  to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'carpenters-announcement-lifecycle';

select cron.schedule(
  'carpenters-announcement-lifecycle',
  '* * * * *',
  $cron$select private.process_announcement_lifecycle();$cron$
);

notify pgrst, 'reload schema';
