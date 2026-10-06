-- Step 9: member-visible minutes and event-scoped attendance.
-- Check-in identity, session state, cutoff classification and corrections are
-- verified in PostgreSQL. QR tokens are short-lived hashes, never table data.

create table public.club_attendance_settings (
  singleton_id boolean primary key default true check (singleton_id),
  default_late_after_minutes smallint not null default 15,
  changed_by uuid references public.member_profiles (id) on delete restrict,
  changed_at timestamptz not null default pg_catalog.clock_timestamp(),
  change_reason text,
  constraint club_attendance_settings_cutoff_check
    check (default_late_after_minutes between 0 and 240),
  constraint club_attendance_settings_change_check check (
    (changed_by is null and change_reason is null)
    or (
      changed_by is not null and change_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(change_reason)) between 1 and 500
      and change_reason = pg_catalog.btrim(change_reason)
      and change_reason !~ '[[:cntrl:]]'
    )
  )
);

insert into public.club_attendance_settings (singleton_id, default_late_after_minutes)
values (true, 15);

create table public.event_minutes (
  event_id uuid primary key references public.events (id) on delete restrict,
  content text not null,
  revision_number integer not null default 1,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint event_minutes_content_check check (
    pg_catalog.char_length(pg_catalog.btrim(content)) between 1 and 20000
    and content = pg_catalog.btrim(content)
    and pg_catalog.translate(content, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint event_minutes_revision_check check (revision_number > 0)
);

create table public.event_minutes_revisions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  revision_number integer not null,
  content text not null,
  editor_id uuid not null references public.member_profiles (id) on delete restrict,
  edited_at timestamptz not null default pg_catalog.clock_timestamp(),
  reason text not null,
  constraint event_minutes_revisions_event_version_key unique (event_id, revision_number),
  constraint event_minutes_revisions_version_check check (revision_number > 0),
  constraint event_minutes_revisions_content_check check (
    pg_catalog.char_length(pg_catalog.btrim(content)) between 1 and 20000
    and content = pg_catalog.btrim(content)
    and pg_catalog.translate(content, E'\n\r\t', '') !~ '[[:cntrl:]]'
  ),
  constraint event_minutes_revisions_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
    and reason = pg_catalog.btrim(reason)
    and reason !~ '[[:cntrl:]]'
  )
);

create index event_minutes_revisions_event_idx
  on public.event_minutes_revisions (event_id, revision_number desc);

create table public.event_attendance_sessions (
  event_id uuid primary key references public.events (id) on delete restrict,
  opened_at timestamptz not null,
  opened_by uuid not null references public.member_profiles (id) on delete restrict,
  late_after_minutes smallint not null,
  late_after_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references public.member_profiles (id) on delete restrict,
  qr_challenge_hash text,
  qr_challenge_expires_at timestamptz,
  qr_challenge_issued_by uuid references public.member_profiles (id) on delete restrict,
  constraint event_attendance_sessions_cutoff_check
    check (late_after_minutes between 0 and 240),
  constraint event_attendance_sessions_closed_fields_check check (
    (closed_at is null and closed_by is null)
    or (closed_at is not null and closed_by is not null and closed_at >= opened_at)
  ),
  constraint event_attendance_sessions_qr_fields_check check (
    (qr_challenge_hash is null and qr_challenge_expires_at is null and qr_challenge_issued_by is null)
    or (
      qr_challenge_hash ~ '^[0-9a-f]{64}$'
      and qr_challenge_expires_at is not null
      and qr_challenge_issued_by is not null
    )
  )
);

create table public.event_attendance (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  attendance_status text not null,
  check_in_method text not null,
  checked_in_at timestamptz,
  checked_in_by uuid references public.member_profiles (id) on delete restrict,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  recorded_by uuid not null references public.member_profiles (id) on delete restrict,
  corrected_at timestamptz,
  corrected_by uuid references public.member_profiles (id) on delete restrict,
  correction_reason text,
  constraint event_attendance_event_member_key unique (event_id, member_id),
  constraint event_attendance_status_check
    check (attendance_status in ('present', 'late', 'absent', 'rejected')),
  constraint event_attendance_method_check
    check (check_in_method in ('button', 'qr', 'session_close')),
  constraint event_attendance_checkin_fields_check check (
    (check_in_method in ('button', 'qr') and checked_in_at is not null and checked_in_by = member_id)
    or (check_in_method = 'session_close' and checked_in_at is null and checked_in_by is null)
  ),
  constraint event_attendance_correction_fields_check check (
    (corrected_at is null and corrected_by is null and correction_reason is null)
    or (
      corrected_at is not null and corrected_by is not null and correction_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(correction_reason)) between 1 and 500
      and correction_reason = pg_catalog.btrim(correction_reason)
      and correction_reason !~ '[[:cntrl:]]'
    )
  )
);

create index event_attendance_member_history_idx
  on public.event_attendance (member_id, recorded_at desc);
create index event_attendance_event_status_idx
  on public.event_attendance (event_id, attendance_status, member_id);

alter table public.club_attendance_settings enable row level security;
alter table public.club_attendance_settings force row level security;
alter table public.event_minutes enable row level security;
alter table public.event_minutes force row level security;
alter table public.event_minutes_revisions enable row level security;
alter table public.event_minutes_revisions force row level security;
alter table public.event_attendance_sessions enable row level security;
alter table public.event_attendance_sessions force row level security;
alter table public.event_attendance enable row level security;
alter table public.event_attendance force row level security;

create policy club_attendance_settings_select_active
  on public.club_attendance_settings for select to authenticated
  using ((select private.is_active_club_member()));

create policy event_minutes_select_active_feature_members
  on public.event_minutes for select to authenticated
  using (
    (select private.is_active_club_member())
    and exists (
      select 1 from public.events as e
      where e.id = event_minutes.event_id and e.minutes_enabled
    )
  );

create policy event_minutes_revisions_select_officer_history
  on public.event_minutes_revisions for select to authenticated
  using ((select private.has_officer_history_access()));

create policy event_attendance_sessions_select_active_members
  on public.event_attendance_sessions for select to authenticated
  using ((select private.is_active_club_member()));

revoke all on table public.club_attendance_settings from public, anon, authenticated, service_role;
revoke all on table public.event_minutes from public, anon, authenticated, service_role;
revoke all on table public.event_minutes_revisions from public, anon, authenticated, service_role;
revoke all on table public.event_attendance_sessions from public, anon, authenticated, service_role;
revoke all on table public.event_attendance from public, anon, authenticated, service_role;

grant select (singleton_id, default_late_after_minutes)
  on public.club_attendance_settings to authenticated;
grant select (event_id, content, revision_number, updated_at)
  on public.event_minutes to authenticated;
grant select (event_id, revision_number, content, editor_id, edited_at, reason)
  on public.event_minutes_revisions to authenticated;
grant select (event_id, opened_at, late_after_minutes, late_after_at, closed_at)
  on public.event_attendance_sessions to authenticated;
grant select (
  event_id, member_id, attendance_status, check_in_method, checked_in_at,
  recorded_at, corrected_at, correction_reason
) on public.event_attendance to authenticated;

create or replace function private.can_manage_event_attendance(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('executive'))
      or (select private.has_event_role(p_event_id, 'lead'))
      or (select private.has_event_role(p_event_id, 'assistant'))
    ), false
  );
$function$;

create or replace function private.can_manage_meeting_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('executive'))
    ), false
  );
$function$;

create or replace function private.can_control_attendance_sessions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('executive'))
    ), false
  );
$function$;

create policy event_attendance_select_self_or_event_officer
  on public.event_attendance for select to authenticated
  using (
    (select private.is_active_club_member())
    and (
      member_id = (select auth.uid())
      or (select private.can_manage_event_attendance(event_id))
    )
  );

create or replace function private.append_attendance_audit(
  p_actor_id uuid,
  p_event_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_target_member_id uuid,
  p_before_data jsonb,
  p_after_data jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason, event_id
  ) values (
    p_actor_id, p_action, p_entity_type, p_entity_id, p_target_member_id,
    p_before_data, p_after_data, p_reason, p_event_id
  );
end;
$function$;

create or replace function private.guard_meeting_minutes_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.current_setting('app.meeting_minutes_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Minutes are changed only through the checked minutes procedure.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Meeting minutes are retained and cannot be deleted.';
  end if;
  return new;
end;
$function$;

create trigger event_minutes_write_guard
before insert or update or delete on public.event_minutes
for each row execute function private.guard_meeting_minutes_write();

create or replace function private.guard_event_minutes_revision_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'INSERT'
     or pg_catalog.current_setting('app.meeting_minutes_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Meeting minutes history is append-only.';
  end if;
  return new;
end;
$function$;

create trigger event_minutes_revisions_append_only
before insert or update or delete on public.event_minutes_revisions
for each row execute function private.guard_event_minutes_revision_write();

create or replace function private.guard_attendance_session_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.current_setting('app.attendance_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Attendance sessions are changed only through checked procedures.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Attendance sessions are retained.';
  end if;
  if tg_op = 'UPDATE' and (
    new.event_id is distinct from old.event_id
    or new.opened_at is distinct from old.opened_at
    or new.opened_by is distinct from old.opened_by
    or new.late_after_minutes is distinct from old.late_after_minutes
    or new.late_after_at is distinct from old.late_after_at
    or (old.closed_at is not null and (
      new.closed_at is distinct from old.closed_at
      or new.closed_by is distinct from old.closed_by
    ))
  ) then
    raise exception using errcode = '42501', message = 'Closed attendance sessions cannot be reopened or rewritten.';
  end if;
  return new;
end;
$function$;

create trigger event_attendance_sessions_write_guard
before insert or update or delete on public.event_attendance_sessions
for each row execute function private.guard_attendance_session_write();

create or replace function private.guard_event_attendance_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if pg_catalog.current_setting('app.attendance_write', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Attendance is changed only through checked procedures.';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Attendance history is retained.';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.member_id is distinct from old.member_id
    or new.check_in_method is distinct from old.check_in_method
    or new.checked_in_at is distinct from old.checked_in_at
    or new.checked_in_by is distinct from old.checked_in_by
    or new.recorded_at is distinct from old.recorded_at
    or new.recorded_by is distinct from old.recorded_by
  ) then
    raise exception using errcode = '42501', message = 'Attendance check-in attribution is retained.';
  end if;
  return new;
end;
$function$;

create trigger event_attendance_write_guard
before insert or update or delete on public.event_attendance
for each row execute function private.guard_event_attendance_write();

create or replace function private.guard_club_attendance_settings_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'UPDATE'
     or pg_catalog.current_setting('app.attendance_settings_write', true) is distinct from 'on'
     or new.singleton_id is distinct from old.singleton_id
     or new.changed_by is null
     or new.changed_at <= old.changed_at
     or new.change_reason is null then
    raise exception using errcode = '42501', message = 'Attendance settings change only through the checked settings procedure.';
  end if;
  return new;
end;
$function$;

create trigger club_attendance_settings_write_guard
before update or delete on public.club_attendance_settings
for each row execute function private.guard_club_attendance_settings_write();

create or replace function private.save_event_minutes(
  p_event_id uuid,
  p_content text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_old public.event_minutes%rowtype;
  v_content text := pg_catalog.btrim(p_content);
  v_reason text := pg_catalog.btrim(p_reason);
  v_revision integer;
  v_before jsonb;
  v_exists boolean := false;
begin
  if v_actor_id is null or not (select private.can_manage_meeting_content()) then
    raise exception using errcode = '42501', message = 'Meeting minutes management access is required.';
  end if;
  if v_content is null or pg_catalog.char_length(v_content) not between 1 and 20000
     or pg_catalog.translate(v_content, E'\n\r\t', '') ~ '[[:cntrl:]]'
     or (p_reason is not null and (
       v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
       or v_reason ~ '[[:cntrl:]]'
     )) then
    raise exception using errcode = '22023', message = 'Minutes or reason are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or not v_event.minutes_enabled then
    raise exception using errcode = '42501', message = 'Minutes are not enabled for this event.';
  end if;
  if v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Archived event minutes are read-only.';
  end if;

  select em.* into v_old from public.event_minutes as em
  where em.event_id = p_event_id for update;
  if found then
    v_exists := true;
    if v_reason is null then
      raise exception using errcode = '22023', message = 'Editing minutes requires a reason.';
    end if;
    v_revision := v_old.revision_number + 1;
    v_before := pg_catalog.jsonb_build_object(
      'revision_number', v_old.revision_number,
      'character_count', pg_catalog.char_length(v_old.content)
    );
  else
    v_revision := 1;
    v_reason := coalesce(v_reason, 'Initial minutes entry');
  end if;

  perform pg_catalog.set_config('app.meeting_minutes_write', 'on', true);
  if v_exists then
    update public.event_minutes set
      content = v_content,
      revision_number = v_revision,
      updated_by = v_actor_id,
      updated_at = pg_catalog.clock_timestamp()
    where event_id = p_event_id;
  else
    insert into public.event_minutes (
      event_id, content, revision_number, created_by, updated_by
    ) values (p_event_id, v_content, v_revision, v_actor_id, v_actor_id);
  end if;

  insert into public.event_minutes_revisions (
    event_id, revision_number, content, editor_id, reason
  ) values (p_event_id, v_revision, v_content, v_actor_id, v_reason);
  perform pg_catalog.set_config('app.meeting_minutes_write', 'off', true);

  perform private.append_attendance_audit(
    v_actor_id, p_event_id,
    case when v_revision = 1 then 'meeting.minutes_created' else 'meeting.minutes_edited' end,
    'event_minutes', p_event_id, null, v_before,
    pg_catalog.jsonb_build_object('revision_number', v_revision, 'character_count', pg_catalog.char_length(v_content)),
    v_reason
  );
  return v_revision;
end;
$function$;

create or replace function private.set_attendance_default(
  p_late_after_minutes integer,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_old smallint;
begin
  if v_actor_id is null or not (select private.can_control_attendance_sessions()) then
    raise exception using errcode = '42501', message = 'Attendance settings access is required.';
  end if;
  if p_late_after_minutes is null or p_late_after_minutes not between 0 and 240
     or v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Attendance cutoff or reason is invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  select s.default_late_after_minutes into v_old
  from public.club_attendance_settings as s where s.singleton_id for update;
  perform pg_catalog.set_config('app.attendance_settings_write', 'on', true);
  update public.club_attendance_settings set
    default_late_after_minutes = p_late_after_minutes::smallint,
    changed_by = v_actor_id,
    changed_at = pg_catalog.clock_timestamp(),
    change_reason = v_reason
  where singleton_id;
  perform pg_catalog.set_config('app.attendance_settings_write', 'off', true);

  perform private.append_attendance_audit(
    v_actor_id, null, 'attendance.default_cutoff_changed', 'attendance_settings',
    '00000000-0000-0000-0000-000000000000'::uuid, null,
    pg_catalog.jsonb_build_object('late_after_minutes', v_old),
    pg_catalog.jsonb_build_object('late_after_minutes', p_late_after_minutes), v_reason
  );
end;
$function$;

create or replace function private.open_event_attendance(
  p_event_id uuid,
  p_late_after_minutes integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_cutoff_minutes integer;
  v_late_after_at timestamptz;
begin
  if v_actor_id is null or not (select private.can_control_attendance_sessions()) then
    raise exception using errcode = '42501', message = 'Only an attendance officer can open check-in.';
  end if;
  if p_late_after_minutes is not null and p_late_after_minutes not between 0 and 240 then
    raise exception using errcode = '22023', message = 'The event-specific cutoff must be from 0 to 240 minutes.';
  end if;
  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or not v_event.attendance_enabled or v_event.status <> 'scheduled'
     or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Attendance requires a scheduled, non-archived event with attendance enabled.';
  end if;
  if exists (select 1 from public.event_attendance_sessions as s where s.event_id = p_event_id) then
    raise exception using errcode = '23505', message = 'This event already has an attendance session.';
  end if;

  if p_late_after_minutes is null then
    select s.default_late_after_minutes into v_cutoff_minutes
    from public.club_attendance_settings as s where s.singleton_id;
  else
    v_cutoff_minutes := p_late_after_minutes;
  end if;
  v_late_after_at := v_event.starts_at + pg_catalog.make_interval(mins => v_cutoff_minutes);
  perform pg_catalog.set_config('app.attendance_write', 'on', true);
  insert into public.event_attendance_sessions (
    event_id, opened_at, opened_by, late_after_minutes, late_after_at
  ) values (
    p_event_id, pg_catalog.clock_timestamp(), v_actor_id,
    v_cutoff_minutes::smallint, v_late_after_at
  );
  perform pg_catalog.set_config('app.attendance_write', 'off', true);
  perform private.append_attendance_audit(
    v_actor_id, p_event_id, 'attendance.session_opened', 'attendance_session', p_event_id,
    null, null,
    pg_catalog.jsonb_build_object('late_after_minutes', v_cutoff_minutes, 'late_after_at', v_late_after_at),
    'Attendance check-in opened'
  );
  return v_late_after_at;
end;
$function$;

create or replace function private.close_event_attendance_internal(
  p_event_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.event_attendance_sessions%rowtype;
  v_absent_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select s.* into v_session from public.event_attendance_sessions as s
  where s.event_id = p_event_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The attendance session is not open.';
  end if;
  if v_session.closed_at is not null then
    raise exception using errcode = '55000', message = 'Attendance check-in is already closed.';
  end if;

  perform pg_catalog.set_config('app.attendance_write', 'on', true);
  insert into public.event_attendance (
    event_id, member_id, attendance_status, check_in_method,
    checked_in_at, checked_in_by, recorded_by
  )
  select p_event_id, mp.id, 'absent', 'session_close', null, null, p_actor_id
  from public.member_profiles as mp
  where mp.status = 'active'
    and not exists (
      select 1 from public.event_attendance as ea
      where ea.event_id = p_event_id and ea.member_id = mp.id
    );
  get diagnostics v_absent_count = row_count;

  update public.event_attendance_sessions set
    closed_at = v_now,
    closed_by = p_actor_id,
    qr_challenge_hash = null,
    qr_challenge_expires_at = null,
    qr_challenge_issued_by = null
  where event_id = p_event_id;
  perform pg_catalog.set_config('app.attendance_write', 'off', true);

  perform private.append_attendance_audit(
    p_actor_id, p_event_id, 'attendance.session_closed', 'attendance_session', p_event_id,
    null, null,
    pg_catalog.jsonb_build_object('absent_rows_added', v_absent_count, 'closed_at', v_now),
    p_reason
  );
  return v_absent_count;
end;
$function$;

create or replace function private.close_event_attendance(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_absent_count integer;
begin
  if v_actor_id is null or not (select private.can_control_attendance_sessions()) then
    raise exception using errcode = '42501', message = 'Only an attendance officer can close check-in.';
  end if;
  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or not v_event.attendance_enabled or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Attendance is unavailable for this event.';
  end if;
  v_absent_count := private.close_event_attendance_internal(
    p_event_id, v_actor_id, 'Attendance check-in closed by an officer'
  );
  return v_absent_count;
end;
$function$;

create or replace function private.issue_event_attendance_qr(
  p_event_id uuid,
  p_challenge_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_session public.event_attendance_sessions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.can_control_attendance_sessions()) then
    raise exception using errcode = '42501', message = 'Only an attendance officer can issue a check-in QR.';
  end if;
  if p_challenge_hash is null or p_challenge_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null or p_expires_at <= v_now
     or p_expires_at > v_now + interval '2 minutes' then
    raise exception using errcode = '22023', message = 'The QR challenge is invalid or too long-lived.';
  end if;
  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  select s.* into v_session from public.event_attendance_sessions as s
  where s.event_id = p_event_id for update;
  if not found or not v_event.attendance_enabled or v_event.archived_at is not null
     or v_session.closed_at is not null then
    raise exception using errcode = '42501', message = 'A QR is available only during an open attendance session.';
  end if;
  perform pg_catalog.set_config('app.attendance_write', 'on', true);
  update public.event_attendance_sessions set
    qr_challenge_hash = p_challenge_hash,
    qr_challenge_expires_at = p_expires_at,
    qr_challenge_issued_by = v_actor_id
  where event_id = p_event_id;
  perform pg_catalog.set_config('app.attendance_write', 'off', true);
  perform private.append_attendance_audit(
    v_actor_id, p_event_id, 'attendance.qr_issued', 'attendance_session', p_event_id,
    null, null,
    pg_catalog.jsonb_build_object('expires_at', p_expires_at),
    'A short-lived attendance QR was issued'
  );
end;
$function$;

create or replace function private.check_in_event_attendance(
  p_event_id uuid,
  p_challenge_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_session public.event_attendance_sessions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_status text;
  v_method text;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member must check in using their own account.';
  end if;
  if p_challenge_hash is not null and p_challenge_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The check-in QR challenge is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  select s.* into v_session from public.event_attendance_sessions as s
  where s.event_id = p_event_id for update;
  if not found or not v_event.attendance_enabled or v_event.archived_at is not null
     or v_event.status <> 'scheduled' or v_session.closed_at is not null then
    raise exception using errcode = '42501', message = 'Check-in is not open for this event.';
  end if;
  if p_challenge_hash is not null and (
    v_session.qr_challenge_hash is distinct from p_challenge_hash
    or v_session.qr_challenge_expires_at is null
    or v_session.qr_challenge_expires_at <= v_now
  ) then
    raise exception using errcode = '42501', message = 'This QR is expired or has been replaced.';
  end if;
  if exists (
    select 1 from public.event_attendance as ea
    where ea.event_id = p_event_id and ea.member_id = v_actor_id
  ) then
    raise exception using errcode = '23505', message = 'This member has already checked in for the event.';
  end if;

  v_status := case when v_now > v_session.late_after_at then 'late' else 'present' end;
  v_method := case when p_challenge_hash is null then 'button' else 'qr' end;
  perform pg_catalog.set_config('app.attendance_write', 'on', true);
  insert into public.event_attendance (
    event_id, member_id, attendance_status, check_in_method,
    checked_in_at, checked_in_by, recorded_by
  ) values (
    p_event_id, v_actor_id, v_status, v_method, v_now, v_actor_id, v_actor_id
  );
  perform pg_catalog.set_config('app.attendance_write', 'off', true);
  perform private.append_attendance_audit(
    v_actor_id, p_event_id, 'attendance.checked_in', 'event_attendance',
    (select ea.id from public.event_attendance as ea where ea.event_id = p_event_id and ea.member_id = v_actor_id),
    v_actor_id, null,
    pg_catalog.jsonb_build_object('status', v_status, 'method', v_method, 'checked_in_at', v_now),
    'Member checked in as self'
  );
  return v_status;
end;
$function$;

create or replace function private.correct_event_attendance(
  p_event_id uuid,
  p_member_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_session public.event_attendance_sessions%rowtype;
  v_attendance public.event_attendance%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if v_actor_id is null or not (select private.can_manage_event_attendance(p_event_id)) then
    raise exception using errcode = '42501', message = 'Attendance review access is required for this event.';
  end if;
  if p_member_id is null or p_status not in ('present', 'absent', 'rejected')
     or v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Attendance status or correction reason is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for share;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  select s.* into v_session from public.event_attendance_sessions as s
  where s.event_id = p_event_id for update;
  if not found or not v_event.attendance_enabled or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Attendance is unavailable for this event.';
  end if;
  select ea.* into v_attendance from public.event_attendance as ea
  where ea.event_id = p_event_id and ea.member_id = p_member_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The member has no attendance record for this event.';
  end if;

  perform pg_catalog.set_config('app.attendance_write', 'on', true);
  update public.event_attendance set
    attendance_status = p_status,
    corrected_at = pg_catalog.clock_timestamp(),
    corrected_by = v_actor_id,
    correction_reason = v_reason
  where id = v_attendance.id;
  perform pg_catalog.set_config('app.attendance_write', 'off', true);
  perform private.append_attendance_audit(
    v_actor_id, p_event_id, 'attendance.corrected', 'event_attendance',
    v_attendance.id, p_member_id,
    pg_catalog.jsonb_build_object('status', v_attendance.attendance_status),
    pg_catalog.jsonb_build_object('status', p_status), v_reason
  );
end;
$function$;

create or replace function private.close_attendance_on_event_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.status in ('completed', 'cancelled') and old.status = 'scheduled')
     or (new.archived_at is not null and old.archived_at is null) then
    if exists (
      select 1 from public.event_attendance_sessions as s
      where s.event_id = new.id and s.closed_at is null
    ) then
      perform private.close_event_attendance_internal(
        new.id, coalesce(new.status_changed_by, new.archived_by, new.updated_by),
        'Attendance check-in closed when the event entered a terminal or archived state'
      );
    end if;
  end if;
  return new;
end;
$function$;

create trigger events_close_open_attendance
after update of status, archived_at on public.events
for each row execute function private.close_attendance_on_event_terminal();

create or replace function public.save_event_minutes(
  p_event_id uuid, p_content text, p_reason text
)
returns integer language sql security invoker set search_path = '' as $function$
  select private.save_event_minutes(p_event_id, p_content, p_reason);
$function$;

create or replace function public.set_attendance_default(
  p_late_after_minutes integer, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.set_attendance_default(p_late_after_minutes, p_reason);
$function$;

create or replace function public.open_event_attendance(
  p_event_id uuid, p_late_after_minutes integer default null
)
returns timestamptz language sql security invoker set search_path = '' as $function$
  select private.open_event_attendance(p_event_id, p_late_after_minutes);
$function$;

create or replace function public.close_event_attendance(p_event_id uuid)
returns integer language sql security invoker set search_path = '' as $function$
  select private.close_event_attendance(p_event_id);
$function$;

create or replace function public.issue_event_attendance_qr(
  p_event_id uuid, p_challenge_hash text, p_expires_at timestamptz
)
returns void language sql security invoker set search_path = '' as $function$
  select private.issue_event_attendance_qr(p_event_id, p_challenge_hash, p_expires_at);
$function$;

create or replace function public.check_in_event_attendance(
  p_event_id uuid, p_challenge_hash text default null
)
returns text language sql security invoker set search_path = '' as $function$
  select private.check_in_event_attendance(p_event_id, p_challenge_hash);
$function$;

create or replace function public.correct_event_attendance(
  p_event_id uuid, p_member_id uuid, p_status text, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.correct_event_attendance(p_event_id, p_member_id, p_status, p_reason);
$function$;

revoke all on function private.can_manage_event_attendance(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_manage_meeting_content() from public, anon, authenticated, service_role;
revoke all on function private.can_control_attendance_sessions() from public, anon, authenticated, service_role;
revoke all on function private.append_attendance_audit(uuid, uuid, text, text, uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.guard_meeting_minutes_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_minutes_revision_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_attendance_session_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_attendance_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_club_attendance_settings_write() from public, anon, authenticated, service_role;
revoke all on function private.save_event_minutes(uuid, text, text) from public, anon, service_role;
revoke all on function private.set_attendance_default(integer, text) from public, anon, service_role;
revoke all on function private.open_event_attendance(uuid, integer) from public, anon, service_role;
revoke all on function private.close_event_attendance_internal(uuid, uuid, text) from public, anon, service_role;
revoke all on function private.close_event_attendance(uuid) from public, anon, service_role;
revoke all on function private.issue_event_attendance_qr(uuid, text, timestamptz) from public, anon, service_role;
revoke all on function private.check_in_event_attendance(uuid, text) from public, anon, service_role;
revoke all on function private.correct_event_attendance(uuid, uuid, text, text) from public, anon, service_role;
revoke all on function private.close_attendance_on_event_terminal() from public, anon, authenticated, service_role;
revoke all on function public.save_event_minutes(uuid, text, text) from public, anon, service_role;
revoke all on function public.set_attendance_default(integer, text) from public, anon, service_role;
revoke all on function public.open_event_attendance(uuid, integer) from public, anon, service_role;
revoke all on function public.close_event_attendance(uuid) from public, anon, service_role;
revoke all on function public.issue_event_attendance_qr(uuid, text, timestamptz) from public, anon, service_role;
revoke all on function public.check_in_event_attendance(uuid, text) from public, anon, service_role;
revoke all on function public.correct_event_attendance(uuid, uuid, text, text) from public, anon, service_role;

grant execute on function private.can_manage_event_attendance(uuid) to authenticated;
grant execute on function private.can_manage_meeting_content() to authenticated;
grant execute on function private.can_control_attendance_sessions() to authenticated;
grant execute on function private.save_event_minutes(uuid, text, text) to authenticated;
grant execute on function private.set_attendance_default(integer, text) to authenticated;
grant execute on function private.open_event_attendance(uuid, integer) to authenticated;
grant execute on function private.close_event_attendance(uuid) to authenticated;
grant execute on function private.issue_event_attendance_qr(uuid, text, timestamptz) to authenticated;
grant execute on function private.check_in_event_attendance(uuid, text) to authenticated;
grant execute on function private.correct_event_attendance(uuid, uuid, text, text) to authenticated;

grant execute on function public.save_event_minutes(uuid, text, text) to authenticated;
grant execute on function public.set_attendance_default(integer, text) to authenticated;
grant execute on function public.open_event_attendance(uuid, integer) to authenticated;
grant execute on function public.close_event_attendance(uuid) to authenticated;
grant execute on function public.issue_event_attendance_qr(uuid, text, timestamptz) to authenticated;
grant execute on function public.check_in_event_attendance(uuid, text) to authenticated;
grant execute on function public.correct_event_attendance(uuid, uuid, text, text) to authenticated;
