-- Events occupy a whole number of days instead of a single instant.
-- duration_days counts the start day, so every existing row is a one-day event
-- and ends_at equals starts_at: the change is additive and reversible in data terms.
alter table public.events
  add column duration_days integer not null default 1;

comment on column public.events.duration_days is
  'Whole calendar days the event occupies, including its start day (1-30). Africa/Lagos wall clock.';

-- Separate statement: ends_at references duration_days, and a generated column may not
-- depend on a column introduced by the same ALTER command list.
alter table public.events
  add column ends_at timestamptz
    generated always as (
      timezone('Africa/Lagos', timezone('Africa/Lagos', starts_at) + ((duration_days - 1) * interval '1 day'))
    ) stored;

comment on column public.events.ends_at is
  'Instant the event stops being live: the same wall-clock time duration_days - 1 days later. Derived, never written.';

alter table public.events
  add constraint events_duration_days_range check (duration_days between 1 and 30);

-- Column-level SELECT grants on public.events are load-bearing: an ungranted column
-- silently empties whole dashboard reads. Precedent: 20261027140610_grant_event_timezone.sql.
grant select (duration_days, ends_at) on table public.events to authenticated;

notify pgrst, 'reload schema';


-- Task 4: Drop old signatures
drop function if exists private.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean
);
drop function if exists public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean
);
drop function if exists private.update_event_details(uuid, text, timestamptz, text, text, text);
drop function if exists public.update_event_details(uuid, text, timestamptz, text, text, text);

-- Recreated private.create_event with 12 parameters (p_duration_days integer default 1)
create or replace function private.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamp with time zone,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean,
  p_duration_days integer default 1
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event_id uuid;
begin
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may create an event.';
  end if;
  if p_title is null or p_title <> pg_catalog.btrim(p_title)
    or pg_catalog.char_length(p_title) not between 1 and 120 or p_title ~ '[[:cntrl:]]'
    or p_event_type is null or p_event_type not in ('meeting', 'party', 'other')
    or p_starts_at is null
    or p_location is null or p_location <> pg_catalog.btrim(p_location)
    or pg_catalog.char_length(p_location) not between 1 and 200 or p_location ~ '[[:cntrl:]]'
    or (p_description is not null and (
      p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 2000
      or p_description ~ '[[:cntrl:]]'
    ))
    or p_minutes_enabled is null or p_attendance_enabled is null
    or p_budget_enabled is null or p_income_enabled is null
    or p_expenses_enabled is null or p_ticketing_enabled is null
    or (p_ticketing_enabled and not (p_budget_enabled and p_income_enabled and p_expenses_enabled))
    or p_duration_days is null
    or p_duration_days not between 1 and 30 then
    raise exception using errcode = '23514', message = 'The event details or fixed feature selection is invalid.';
  end if;

  insert into public.events (
    title, event_type, starts_at, location, description,
    minutes_enabled, attendance_enabled, budget_enabled, income_enabled,
    expenses_enabled, ticketing_enabled, duration_days, status_changed_by, created_by, updated_by
  ) values (
    p_title, p_event_type, p_starts_at, p_location, p_description,
    p_minutes_enabled, p_attendance_enabled, p_budget_enabled, p_income_enabled,
    p_expenses_enabled, p_ticketing_enabled, p_duration_days, v_actor_id, v_actor_id, v_actor_id
  ) returning id into v_event_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'event_created', 'event', v_event_id, null,
    pg_catalog.jsonb_build_object(
      'title', p_title, 'event_type', p_event_type, 'starts_at', p_starts_at,
      'location', p_location, 'description', p_description,
      'minutes_enabled', p_minutes_enabled, 'attendance_enabled', p_attendance_enabled,
      'budget_enabled', p_budget_enabled, 'income_enabled', p_income_enabled,
      'expenses_enabled', p_expenses_enabled, 'ticketing_enabled', p_ticketing_enabled,
      'status', 'scheduled', 'duration_days', p_duration_days
    ),
    'Event created'
  );
  return v_event_id;
end;
$function$;

-- Recreated public.create_event invoker wrapper
create or replace function public.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamp with time zone,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean,
  p_duration_days integer default 1
)
returns uuid
language sql
security invoker
set search_path to ''
as $function$
  select private.create_event(
    p_title, p_event_type, p_starts_at, p_location, p_description,
    p_minutes_enabled, p_attendance_enabled, p_budget_enabled, p_income_enabled,
    p_expenses_enabled, p_ticketing_enabled, p_duration_days
  );
$function$;

-- Recreated private.update_event_details with 7 parameters (p_duration_days integer required)
create or replace function private.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamp with time zone,
  p_location text,
  p_description text,
  p_reason text,
  p_duration_days integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if p_event_id is null or p_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'An event edit reason is required.';
  end if;
  if p_title is null or p_title <> pg_catalog.btrim(p_title)
    or pg_catalog.char_length(p_title) not between 1 and 120 or p_title ~ '[[:cntrl:]]'
    or p_starts_at is null
    or p_location is null or p_location <> pg_catalog.btrim(p_location)
    or pg_catalog.char_length(p_location) not between 1 and 200 or p_location ~ '[[:cntrl:]]'
    or (p_description is not null and (
      p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 2000
      or p_description ~ '[[:cntrl:]]'
    ))
    or p_duration_days is null
    or p_duration_days not between 1 and 30 then
    raise exception using errcode = '23514', message = 'The event details are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
    or (select private.has_event_role(p_event_id, 'lead'))
    or (select private.has_event_role(p_event_id, 'assistant'))
  ) then
    raise exception using errcode = '42501', message = 'Event editing requires an Executive, Admin, Backup Admin, or this event''s lead or assistant.';
  end if;

  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null or v_event.status <> 'scheduled' then
    raise exception using errcode = '42501', message = 'Only scheduled, unarchived events can be edited.';
  end if;
  if v_event.title is not distinct from p_title
    and v_event.starts_at is not distinct from p_starts_at
    and v_event.location is not distinct from p_location
    and v_event.description is not distinct from p_description
    and v_event.duration_days is not distinct from p_duration_days then
    return;
  end if;

  update public.events set
    title = p_title, starts_at = p_starts_at, location = p_location,
    description = p_description, duration_days = p_duration_days, updated_by = v_actor_id,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'event_details_updated', 'event', p_event_id,
    pg_catalog.jsonb_build_object(
      'title', v_event.title, 'starts_at', v_event.starts_at,
      'location', v_event.location, 'description', v_event.description,
      'duration_days', v_event.duration_days
    ),
    pg_catalog.jsonb_build_object(
      'title', p_title, 'starts_at', p_starts_at,
      'location', p_location, 'description', p_description,
      'duration_days', p_duration_days
    ),
    v_reason
  );
end;
$function$;

-- Recreated public.update_event_details invoker wrapper
create or replace function public.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamp with time zone,
  p_location text,
  p_description text,
  p_reason text,
  p_duration_days integer
)
returns void
language sql
security invoker
set search_path to ''
as $function$
  select private.update_event_details(
    p_event_id, p_title, p_starts_at, p_location, p_description, p_reason, p_duration_days
  );
$function$;

-- Widen the write guard so a duration edit is an edit
create or replace function private.guard_event_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501',
      message = 'Events are archived and retained; they cannot be hard-deleted.';
  end if;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if tg_op = 'INSERT' then
    if not (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) or new.created_by is distinct from v_actor_id
      or new.updated_by is distinct from v_actor_id
      or new.status_changed_by is distinct from v_actor_id
      or new.status <> 'scheduled' or new.archived_at is not null then
      raise exception using errcode = '42501', message = 'Only an authorized event manager may create an event.';
    end if;
    return new;
  end if;

  if old.archived_at is not null then
    raise exception using errcode = '42501', message = 'Archived events are retained as read-only history.';
  end if;
  if new.id is distinct from old.id
    or new.event_type is distinct from old.event_type
    or new.minutes_enabled is distinct from old.minutes_enabled
    or new.attendance_enabled is distinct from old.attendance_enabled
    or new.budget_enabled is distinct from old.budget_enabled
    or new.income_enabled is distinct from old.income_enabled
    or new.expenses_enabled is distinct from old.expenses_enabled
    or new.ticketing_enabled is distinct from old.ticketing_enabled
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception using errcode = '42501',
      message = 'Event identity, type, and feature settings cannot be rewritten.';
  end if;

  if new.status is distinct from old.status then
    if new.status_changed_by is distinct from v_actor_id
      or new.status_changed_at <= old.status_changed_at
      or new.archived_at is not null then
      raise exception using errcode = '42501', message = 'Invalid event status change metadata.';
    end if;
    if old.status = 'scheduled' and new.status in ('completed', 'cancelled') then
      if not (
        (select private.has_club_role('executive'))
        or (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
        or (select private.has_event_role(old.id, 'lead'))
      ) then
        raise exception using errcode = '42501', message = 'Only an Executive, Admin, Backup Admin, or this event lead may complete or cancel it.';
      end if;
    elsif old.status in ('completed', 'cancelled') and new.status = 'scheduled' then
      if not (
        (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
      ) then
        raise exception using errcode = '42501', message = 'Only an Admin or Backup Admin may reopen this event.';
      end if;
    else
      raise exception using errcode = '42501', message = 'That event status transition is not allowed.';
    end if;
  elsif new.status_changed_at is distinct from old.status_changed_at
    or new.status_changed_by is distinct from old.status_changed_by then
    raise exception using errcode = '42501', message = 'Event status history cannot be rewritten.';
  end if;

  if new.archived_at is distinct from old.archived_at
    or new.archived_by is distinct from old.archived_by
    or new.archive_reason is distinct from old.archive_reason then
    if old.archived_at is not null or new.archived_at is null
      or new.archived_by is distinct from v_actor_id
      or new.status is distinct from old.status
      or not (
        (select private.has_club_role('executive'))
        or (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
      ) then
      raise exception using errcode = '42501', message = 'Event archival is restricted and irreversible.';
    end if;
  end if;

  if new.title is distinct from old.title
    or new.starts_at is distinct from old.starts_at
    or new.location is distinct from old.location
    or new.description is distinct from old.description
    or new.duration_days is distinct from old.duration_days then
    if old.status <> 'scheduled' or new.status is distinct from old.status
      or new.updated_by is distinct from v_actor_id
      or new.updated_at <= old.updated_at
      or not (
        (select private.has_club_role('executive'))
        or (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
        or (select private.has_event_role(old.id, 'lead'))
        or (select private.has_event_role(old.id, 'assistant'))
      ) then
      raise exception using errcode = '42501', message = 'Only this event''s lead, assistant, Executive, Admin, or Backup Admin may edit a scheduled event.';
    end if;
  elsif new.updated_by is distinct from old.updated_by
    or new.updated_at is distinct from old.updated_at then
    if new.updated_by is distinct from v_actor_id or new.updated_at <= old.updated_at then
      raise exception using errcode = '42501', message = 'Invalid event update metadata.';
    end if;
  end if;
  return new;
end;
$function$;

-- Step 4: Re-issue execute grants on the new signatures
revoke all on function private.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) from public, anon, service_role;
revoke all on function private.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) from public, anon, service_role;

revoke all on function public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) from public, anon, service_role;
revoke all on function public.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) from public, anon, service_role;

grant execute on function private.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) to authenticated;
grant execute on function private.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) to authenticated;

grant execute on function public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) to authenticated;
grant execute on function public.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) to authenticated;

notify pgrst, 'reload schema';
