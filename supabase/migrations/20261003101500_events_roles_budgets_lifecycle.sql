-- Step 7: event records, per-event roles, budgets, lifecycle and retention.
-- All browser-visible reads are forced through active-member RLS. Mutations
-- are checked, audited procedures; an event is never hard-deleted.

create table public.events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  title text not null,
  event_type text not null,
  starts_at timestamptz not null,
  location text not null,
  description text,
  minutes_enabled boolean not null default false,
  attendance_enabled boolean not null default false,
  budget_enabled boolean not null default false,
  income_enabled boolean not null default false,
  expenses_enabled boolean not null default false,
  ticketing_enabled boolean not null default false,
  status text not null default 'scheduled',
  status_changed_at timestamptz not null default pg_catalog.clock_timestamp(),
  status_changed_by uuid not null references public.member_profiles (id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references public.member_profiles (id) on delete restrict,
  archive_reason text,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint events_title_check check (
    pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 120
    and title = pg_catalog.btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  constraint events_type_check check (event_type in ('meeting', 'party', 'other')),
  constraint events_location_check check (
    pg_catalog.char_length(pg_catalog.btrim(location)) between 1 and 200
    and location = pg_catalog.btrim(location)
    and location !~ '[[:cntrl:]]'
  ),
  constraint events_description_check check (
    description is null or (
      pg_catalog.char_length(description) between 1 and 2000
      and description = pg_catalog.btrim(description)
      and description !~ '[[:cntrl:]]'
    )
  ),
  constraint events_ticketing_feature_check check (
    not ticketing_enabled or (event_type = 'party' and income_enabled)
  ),
  constraint events_status_check check (status in ('scheduled', 'completed', 'cancelled')),
  constraint events_archive_fields_check check (
    (archived_at is null and archived_by is null and archive_reason is null)
    or (
      archived_at is not null and archived_by is not null and archive_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(archive_reason)) between 1 and 500
      and archive_reason = pg_catalog.btrim(archive_reason)
      and archive_reason !~ '[[:cntrl:]]'
    )
  )
);

create index events_status_starts_at_idx
  on public.events (status, starts_at desc, id);
create index events_archived_starts_at_idx
  on public.events (starts_at desc, id)
  where archived_at is not null;

create table public.event_role_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  role text not null,
  assigned_by uuid not null references public.member_profiles (id) on delete restrict,
  assigned_at timestamptz not null default pg_catalog.clock_timestamp(),
  grant_reason text not null,
  revoked_at timestamptz,
  revoked_by uuid references public.member_profiles (id) on delete restrict,
  revoke_reason text,
  constraint event_role_assignments_role_check check (role in ('lead', 'assistant', 'committee')),
  constraint event_role_assignments_grant_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(grant_reason)) between 1 and 500
    and grant_reason = pg_catalog.btrim(grant_reason)
    and grant_reason !~ '[[:cntrl:]]'
  ),
  constraint event_role_assignments_revocation_fields_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (
      revoked_at is not null and revoked_by is not null and revoke_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(revoke_reason)) between 1 and 500
      and revoke_reason = pg_catalog.btrim(revoke_reason)
      and revoke_reason !~ '[[:cntrl:]]'
    )
  )
);

create unique index event_role_assignments_one_current_role_per_member_uidx
  on public.event_role_assignments (event_id, member_id)
  where revoked_at is null;
create unique index event_role_assignments_one_current_lead_uidx
  on public.event_role_assignments (event_id)
  where role = 'lead' and revoked_at is null;
create unique index event_role_assignments_one_current_assistant_uidx
  on public.event_role_assignments (event_id)
  where role = 'assistant' and revoked_at is null;
create index event_role_assignments_member_current_idx
  on public.event_role_assignments (member_id, event_id)
  where revoked_at is null;
create index event_role_assignments_event_history_idx
  on public.event_role_assignments (event_id, assigned_at desc);
create index event_role_assignments_assigned_by_idx
  on public.event_role_assignments (assigned_by);

create table public.event_budgets (
  event_id uuid primary key references public.events (id) on delete restrict,
  total_ngn bigint not null,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint event_budgets_total_check check (total_ngn between 1 and 1000000000000)
);

create table public.event_budget_allocations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.event_budgets (event_id) on delete restrict,
  position smallint not null,
  allocation_name text not null,
  amount_ngn bigint not null,
  constraint event_budget_allocations_position_check check (position between 1 and 50),
  constraint event_budget_allocations_name_check check (
    pg_catalog.char_length(pg_catalog.btrim(allocation_name)) between 1 and 80
    and allocation_name = pg_catalog.btrim(allocation_name)
    and allocation_name !~ '[[:cntrl:]]'
  ),
  constraint event_budget_allocations_amount_check check (amount_ngn between 1 and 1000000000000),
  constraint event_budget_allocations_event_position_key unique (event_id, position)
);

create unique index event_budget_allocations_event_name_uidx
  on public.event_budget_allocations (event_id, pg_catalog.lower(allocation_name));
create index event_budget_allocations_event_idx
  on public.event_budget_allocations (event_id, position);

alter table public.events enable row level security;
alter table public.events force row level security;
alter table public.event_role_assignments enable row level security;
alter table public.event_role_assignments force row level security;
alter table public.event_budgets enable row level security;
alter table public.event_budgets force row level security;
alter table public.event_budget_allocations enable row level security;
alter table public.event_budget_allocations force row level security;

create policy events_select_active_members
  on public.events for select to authenticated
  using ((select private.is_active_club_member()));

create policy event_role_assignments_select_current_or_officer_history
  on public.event_role_assignments for select to authenticated
  using (
    (select private.has_officer_history_access())
    or (
      revoked_at is null
      and (select private.is_active_club_member())
      and exists (
        select 1 from public.member_profiles as mp
        where mp.id = event_role_assignments.member_id and mp.status = 'active'
      )
    )
  );

create policy event_budgets_select_active_members
  on public.event_budgets for select to authenticated
  using ((select private.is_active_club_member()));

create policy event_budget_allocations_select_active_members
  on public.event_budget_allocations for select to authenticated
  using ((select private.is_active_club_member()));

revoke all on table public.events from public, anon, authenticated, service_role;
revoke all on table public.event_role_assignments from public, anon, authenticated, service_role;
revoke all on table public.event_budgets from public, anon, authenticated, service_role;
revoke all on table public.event_budget_allocations from public, anon, authenticated, service_role;

grant select (
  id, title, event_type, starts_at, location, description,
  minutes_enabled, attendance_enabled, budget_enabled, income_enabled,
  expenses_enabled, ticketing_enabled, status, status_changed_at, archived_at,
  created_at, updated_at
) on public.events to authenticated;
grant select (event_id, member_id, role, assigned_at, revoked_at)
  on public.event_role_assignments to authenticated;
grant select (event_id, total_ngn, created_at, updated_at)
  on public.event_budgets to authenticated;
grant select (event_id, position, allocation_name, amount_ngn)
  on public.event_budget_allocations to authenticated;

create or replace function private.has_event_role(p_event_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    p_role in ('lead', 'assistant', 'committee')
    and (select private.is_active_club_member())
    and exists (
      select 1 from public.event_role_assignments as era
      where era.event_id = p_event_id
        and era.member_id = (select auth.uid())
        and era.role = p_role
        and era.revoked_at is null
    ),
    false
  );
$function$;

create or replace function private.prevent_event_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using errcode = '42501',
    message = 'Events are archived and retained; they cannot be hard-deleted.';
end;
$function$;

create trigger events_never_hard_delete
before delete on public.events
for each row execute function private.prevent_event_deletion();

create or replace function private.guard_event_write()
returns trigger
language plpgsql
security definer
set search_path = ''
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
    or new.description is distinct from old.description then
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

create trigger events_write_guard
before insert or update or delete on public.events
for each row execute function private.guard_event_write();

create or replace function private.guard_event_role_assignment_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Event role history is retained and cannot be deleted.';
  end if;
  if v_actor_id is null or not (select private.is_active_club_member())
    or not (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may manage event roles.';
  end if;
  select e.* into v_event from public.events as e where e.id = new.event_id;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Event roles can only be changed for a scheduled, retained event.';
  end if;
  if tg_op = 'INSERT' then
    if new.assigned_by is distinct from v_actor_id
      or not exists (
        select 1 from public.member_profiles as mp
        where mp.id = new.member_id and mp.status = 'active'
      ) then
      raise exception using errcode = '42501', message = 'The event role target must be an active member and the actor must be recorded.';
    end if;
    return new;
  end if;
  if old.revoked_at is not null
    or new.id is distinct from old.id
    or new.event_id is distinct from old.event_id
    or new.member_id is distinct from old.member_id
    or new.role is distinct from old.role
    or new.assigned_by is distinct from old.assigned_by
    or new.assigned_at is distinct from old.assigned_at
    or new.grant_reason is distinct from old.grant_reason
    or new.revoked_at is null
    or new.revoked_by is distinct from v_actor_id
    or new.revoke_reason is null then
    raise exception using errcode = '42501', message = 'Event role history cannot be rewritten.';
  end if;
  return new;
end;
$function$;

create trigger event_role_assignments_write_guard
before insert or update or delete on public.event_role_assignments
for each row execute function private.guard_event_role_assignment_write();

create or replace function private.guard_event_budget_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event_id uuid;
  v_event public.events%rowtype;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  select e.* into v_event from public.events as e where e.id = v_event_id;
  if not found or v_event.archived_at is not null or v_event.status <> 'scheduled'
    or not v_event.budget_enabled
    or not (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_event_role(v_event_id, 'lead'))
      or (select private.has_event_role(v_event_id, 'assistant'))
    ) then
    raise exception using errcode = '42501', message = 'Budget changes require an active event Executive, Admin, Backup Admin, lead, or assistant.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from v_actor_id or new.updated_by is distinct from v_actor_id then
      raise exception using errcode = '42501', message = 'Budget actor attribution is invalid.';
    end if;
    return new;
  end if;
  if new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.updated_by is distinct from v_actor_id
    or new.updated_at <= old.updated_at then
    raise exception using errcode = '42501', message = 'Budget identity and history cannot be rewritten.';
  end if;
  return new;
end;
$function$;

create trigger event_budgets_write_guard
before insert or update or delete on public.event_budgets
for each row execute function private.guard_event_budget_write();

create or replace function private.guard_event_budget_allocation_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event_id uuid;
begin
  v_event_id := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  if v_actor_id is null or not (select private.is_active_club_member())
    or not exists (
      select 1 from public.events as e
      where e.id = v_event_id and e.status = 'scheduled'
        and e.archived_at is null and e.budget_enabled
    )
    or not (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_event_role(v_event_id, 'lead'))
      or (select private.has_event_role(v_event_id, 'assistant'))
    ) then
    raise exception using errcode = '42501', message = 'Allocation changes require an active event Executive, Admin, Backup Admin, lead, or assistant.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' then
    raise exception using errcode = '42501', message = 'Budget allocation rows are replaced atomically, not rewritten.';
  end if;
  return new;
end;
$function$;

create trigger event_budget_allocations_write_guard
before insert or update or delete on public.event_budget_allocations
for each row execute function private.guard_event_budget_allocation_write();

create or replace function private.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
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
    or (p_ticketing_enabled and (p_event_type <> 'party' or not p_income_enabled)) then
    raise exception using errcode = '23514', message = 'The event details or fixed feature selection is invalid.';
  end if;

  insert into public.events (
    title, event_type, starts_at, location, description,
    minutes_enabled, attendance_enabled, budget_enabled, income_enabled,
    expenses_enabled, ticketing_enabled, status_changed_by, created_by, updated_by
  ) values (
    p_title, p_event_type, p_starts_at, p_location, p_description,
    p_minutes_enabled, p_attendance_enabled, p_budget_enabled, p_income_enabled,
    p_expenses_enabled, p_ticketing_enabled, v_actor_id, v_actor_id, v_actor_id
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
      'status', 'scheduled'
    ),
    'Event created'
  );
  return v_event_id;
end;
$function$;

create or replace function private.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
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
    )) then
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
    and v_event.description is not distinct from p_description then
    return;
  end if;

  update public.events set
    title = p_title, starts_at = p_starts_at, location = p_location,
    description = p_description, updated_by = v_actor_id,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'event_details_updated', 'event', p_event_id,
    pg_catalog.jsonb_build_object(
      'title', v_event.title, 'starts_at', v_event.starts_at,
      'location', v_event.location, 'description', v_event.description
    ),
    pg_catalog.jsonb_build_object(
      'title', p_title, 'starts_at', p_starts_at,
      'location', p_location, 'description', p_description
    ),
    v_reason
  );
end;
$function$;

create or replace function private.assign_event_role(
  p_event_id uuid,
  p_member_id uuid,
  p_role text,
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
  v_reason text := pg_catalog.btrim(p_reason);
  v_before jsonb;
begin
  if p_event_id is null or p_member_id is null
    or p_role is null or p_role not in ('lead', 'assistant', 'committee')
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The event role assignment is invalid or has no reason.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may assign event roles.';
  end if;

  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.status <> 'scheduled' or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Event roles can only be changed for scheduled, unarchived events.';
  end if;
  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23503', message = 'Event roles can only be assigned to an active member.';
  end if;
  if exists (
    select 1 from public.event_role_assignments as era
    where era.event_id = p_event_id and era.member_id = p_member_id
      and era.role = p_role and era.revoked_at is null
  ) then
    return;
  end if;

  select pg_catalog.jsonb_build_object(
    'prior_assignments',
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'assignment_id', era.id, 'member_id', era.member_id, 'role', era.role
        ) order by era.assigned_at
      ),
      '[]'::jsonb
    )
  ) into v_before
  from public.event_role_assignments as era
  where era.event_id = p_event_id and era.revoked_at is null
    and (
      era.member_id = p_member_id
      or (p_role in ('lead', 'assistant') and era.role = p_role)
    );

  update public.event_role_assignments as era
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id, revoke_reason = v_reason
  where era.event_id = p_event_id and era.revoked_at is null
    and (
      era.member_id = p_member_id
      or (p_role in ('lead', 'assistant') and era.role = p_role)
    );

  insert into public.event_role_assignments (
    event_id, member_id, role, assigned_by, grant_reason
  ) values (p_event_id, p_member_id, p_role, v_actor_id, v_reason);

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'event_role_assigned', 'event_role_assignment', p_event_id,
    p_member_id, v_before,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'member_id', p_member_id, 'role', p_role
    ),
    v_reason
  );
end;
$function$;

create or replace function private.revoke_event_role(
  p_event_id uuid,
  p_member_id uuid,
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
  v_reason text := pg_catalog.btrim(p_reason);
  v_assignment public.event_role_assignments%rowtype;
begin
  if p_event_id is null or p_member_id is null or p_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'An event role removal reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may remove event roles.';
  end if;
  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.status <> 'scheduled' or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Event roles can only be changed for scheduled, unarchived events.';
  end if;
  select era.* into v_assignment from public.event_role_assignments as era
  where era.event_id = p_event_id and era.member_id = p_member_id
    and era.revoked_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'The current event role is unavailable.'; end if;

  update public.event_role_assignments set
    revoked_at = pg_catalog.clock_timestamp(),
    revoked_by = v_actor_id, revoke_reason = v_reason
  where id = v_assignment.id;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'event_role_revoked', 'event_role_assignment', p_event_id,
    p_member_id,
    pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id, 'event_id', p_event_id,
      'member_id', p_member_id, 'role', v_assignment.role
    ),
    pg_catalog.jsonb_build_object(
      'assignment_id', v_assignment.id, 'event_id', p_event_id,
      'member_id', p_member_id, 'role', v_assignment.role,
      'revoked', true
    ),
    v_reason
  );
end;
$function$;

create or replace function private.set_event_budget(
  p_event_id uuid,
  p_total_ngn bigint,
  p_allocations jsonb,
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
  v_budget public.event_budgets%rowtype;
  v_item jsonb;
  v_name text;
  v_amount_text text;
  v_amount bigint;
  v_position integer := 0;
  v_sum numeric := 0;
  v_names text[] := array[]::text[];
  v_new_allocations jsonb := '[]'::jsonb;
  v_old_allocations jsonb;
  v_before jsonb;
  v_after jsonb;
  v_reason text := pg_catalog.btrim(p_reason);
  v_exists boolean := false;
begin
  if p_event_id is null or p_total_ngn is null
    or p_total_ngn not between 1 and 1000000000000
    or p_allocations is null or pg_catalog.jsonb_typeof(p_allocations) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_allocations) not between 1 and 50
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'Budget total, allocations, or reason is invalid.';
  end if;

  for v_item in
    select item.value from pg_catalog.jsonb_array_elements(p_allocations) as item(value)
  loop
    v_position := v_position + 1;
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object'
      or (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 2
      or not (v_item ? 'name') or not (v_item ? 'amount_ngn')
      or pg_catalog.jsonb_typeof(v_item -> 'name') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'amount_ngn') is distinct from 'number' then
      raise exception using errcode = '23514', message = 'Each budget allocation must contain only a name and whole-Naira amount.';
    end if;
    v_name := v_item ->> 'name';
    v_amount_text := v_item ->> 'amount_ngn';
    if v_name is null or v_name <> pg_catalog.btrim(v_name)
      or pg_catalog.char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]'
      or v_amount_text is null or v_amount_text !~ '^[1-9][0-9]{0,12}$' then
      raise exception using errcode = '23514', message = 'A budget allocation name or amount is invalid.';
    end if;
    v_amount := v_amount_text::bigint;
    if v_amount > 1000000000000
      or pg_catalog.lower(v_name) = any(v_names) then
      raise exception using errcode = '23514', message = 'Budget allocations must be unique, positive, and within the allowed amount.';
    end if;
    v_names := pg_catalog.array_append(v_names, pg_catalog.lower(v_name));
    v_sum := v_sum + v_amount;
    v_new_allocations := v_new_allocations || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'position', v_position, 'name', v_name, 'amount_ngn', v_amount
      )
    );
  end loop;
  if v_sum <> p_total_ngn then
    raise exception using errcode = '23514', message = 'Budget allocations must add up exactly to the budget total.';
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
    raise exception using errcode = '42501', message = 'Budget changes require an Executive, Admin, Backup Admin, or this event''s lead or assistant.';
  end if;
  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null or v_event.status <> 'scheduled'
    or not v_event.budget_enabled then
    raise exception using errcode = '42501', message = 'This event does not accept budget changes.';
  end if;

  select b.* into v_budget from public.event_budgets as b
  where b.event_id = p_event_id for update;
  v_exists := found;
  if v_exists then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'position', a.position, 'name', a.allocation_name, 'amount_ngn', a.amount_ngn
        ) order by a.position
      ),
      '[]'::jsonb
    ) into v_old_allocations
    from public.event_budget_allocations as a where a.event_id = p_event_id;
    v_before := pg_catalog.jsonb_build_object(
      'total_ngn', v_budget.total_ngn, 'allocations', v_old_allocations
    );
    v_after := pg_catalog.jsonb_build_object(
      'total_ngn', p_total_ngn, 'allocations', v_new_allocations
    );
    if v_before = v_after then return; end if;
    update public.event_budgets set
      total_ngn = p_total_ngn, updated_by = v_actor_id,
      updated_at = pg_catalog.clock_timestamp()
    where event_id = p_event_id;
    delete from public.event_budget_allocations where event_id = p_event_id;
  else
    v_before := null;
    v_after := pg_catalog.jsonb_build_object(
      'total_ngn', p_total_ngn, 'allocations', v_new_allocations
    );
    insert into public.event_budgets (
      event_id, total_ngn, created_by, updated_by
    ) values (p_event_id, p_total_ngn, v_actor_id, v_actor_id);
  end if;

  insert into public.event_budget_allocations (
    event_id, position, allocation_name, amount_ngn
  )
  select p_event_id, (item.value ->> 'position')::smallint,
    item.value ->> 'name', (item.value ->> 'amount_ngn')::bigint
  from pg_catalog.jsonb_array_elements(v_new_allocations) as item(value);

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id,
    case when v_exists then 'event_budget_updated' else 'event_budget_created' end,
    'event_budget', p_event_id, v_before, v_after, v_reason
  );
end;
$function$;

create or replace function private.set_event_status(
  p_event_id uuid,
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
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if p_event_id is null or p_status is null
    or p_status not in ('scheduled', 'completed', 'cancelled')
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The event status request or reason is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if p_status = 'scheduled' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) then
      raise exception using errcode = '42501', message = 'Only an Admin or Backup Admin may reopen an event.';
    end if;
  elsif not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
    or (select private.has_event_role(p_event_id, 'lead'))
  ) then
    raise exception using errcode = '42501', message = 'Only an Executive, Admin, Backup Admin, or this event''s lead may complete or cancel it.';
  end if;

  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Archived events are read-only.';
  end if;
  if v_event.status = p_status then return; end if;
  if p_status = 'scheduled' then
    if v_event.status not in ('completed', 'cancelled') then
      raise exception using errcode = '42501', message = 'Only a completed or cancelled event can be reopened.';
    end if;
  elsif v_event.status <> 'scheduled' then
    raise exception using errcode = '42501', message = 'Only a scheduled event can be completed or cancelled.';
  end if;

  update public.events set
    status = p_status, status_changed_at = pg_catalog.clock_timestamp(),
    status_changed_by = v_actor_id, updated_by = v_actor_id,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id,
    case
      when p_status = 'scheduled' then 'event_reopened'
      when p_status = 'completed' then 'event_completed'
      else 'event_cancelled'
    end,
    'event', p_event_id,
    pg_catalog.jsonb_build_object('status', v_event.status),
    pg_catalog.jsonb_build_object('status', p_status),
    v_reason
  );
end;
$function$;

create or replace function private.archive_event(
  p_event_id uuid,
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
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if p_event_id is null or p_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'An event archive reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may archive an event.';
  end if;
  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null then return; end if;

  update public.events set
    archived_at = pg_catalog.clock_timestamp(), archived_by = v_actor_id,
    archive_reason = v_reason, updated_by = v_actor_id,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'event_archived', 'event', p_event_id,
    pg_catalog.jsonb_build_object('status', v_event.status, 'archived', false),
    pg_catalog.jsonb_build_object('status', v_event.status, 'archived', true),
    v_reason
  );
end;
$function$;

create or replace function public.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_event(
    p_title, p_event_type, p_starts_at, p_location, p_description,
    p_minutes_enabled, p_attendance_enabled, p_budget_enabled,
    p_income_enabled, p_expenses_enabled, p_ticketing_enabled
  );
$function$;

create or replace function public.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.update_event_details(
    p_event_id, p_title, p_starts_at, p_location, p_description, p_reason
  );
$function$;

create or replace function public.assign_event_role(
  p_event_id uuid,
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.assign_event_role(p_event_id, p_member_id, p_role, p_reason);
$function$;

create or replace function public.revoke_event_role(
  p_event_id uuid,
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.revoke_event_role(p_event_id, p_member_id, p_reason);
$function$;

create or replace function public.set_event_budget(
  p_event_id uuid,
  p_total_ngn bigint,
  p_allocations jsonb,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_event_budget(p_event_id, p_total_ngn, p_allocations, p_reason);
$function$;

create or replace function public.set_event_status(
  p_event_id uuid,
  p_status text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_event_status(p_event_id, p_status, p_reason);
$function$;

create or replace function public.archive_event(
  p_event_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.archive_event(p_event_id, p_reason);
$function$;

revoke all on function private.has_event_role(uuid, text) from public, anon, service_role;
revoke all on function private.prevent_event_deletion() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_role_assignment_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_budget_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_budget_allocation_write() from public, anon, authenticated, service_role;
revoke all on function private.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, service_role;
revoke all on function private.update_event_details(uuid, text, timestamptz, text, text, text) from public, anon, service_role;
revoke all on function private.assign_event_role(uuid, uuid, text, text) from public, anon, service_role;
revoke all on function private.revoke_event_role(uuid, uuid, text) from public, anon, service_role;
revoke all on function private.set_event_budget(uuid, bigint, jsonb, text) from public, anon, service_role;
revoke all on function private.set_event_status(uuid, text, text) from public, anon, service_role;
revoke all on function private.archive_event(uuid, text) from public, anon, service_role;
revoke all on function public.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, service_role;
revoke all on function public.update_event_details(uuid, text, timestamptz, text, text, text) from public, anon, service_role;
revoke all on function public.assign_event_role(uuid, uuid, text, text) from public, anon, service_role;
revoke all on function public.revoke_event_role(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.set_event_budget(uuid, bigint, jsonb, text) from public, anon, service_role;
revoke all on function public.set_event_status(uuid, text, text) from public, anon, service_role;
revoke all on function public.archive_event(uuid, text) from public, anon, service_role;

grant execute on function private.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function private.update_event_details(uuid, text, timestamptz, text, text, text) to authenticated;
grant execute on function private.assign_event_role(uuid, uuid, text, text) to authenticated;
grant execute on function private.revoke_event_role(uuid, uuid, text) to authenticated;
grant execute on function private.set_event_budget(uuid, bigint, jsonb, text) to authenticated;
grant execute on function private.set_event_status(uuid, text, text) to authenticated;
grant execute on function private.archive_event(uuid, text) to authenticated;

grant execute on function public.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.update_event_details(uuid, text, timestamptz, text, text, text) to authenticated;
grant execute on function public.assign_event_role(uuid, uuid, text, text) to authenticated;
grant execute on function public.revoke_event_role(uuid, uuid, text) to authenticated;
grant execute on function public.set_event_budget(uuid, bigint, jsonb, text) to authenticated;
grant execute on function public.set_event_status(uuid, text, text) to authenticated;
grant execute on function public.archive_event(uuid, text) to authenticated;
