-- Keep the archive UI boundary authoritative: once an unarchived past event
-- falls outside the latest four, it is read-only except for explicit archival.

create or replace function private.is_event_in_retained_past_archive(p_event_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select
        target.archived_at is null
        and (target.status <> 'scheduled' or target.starts_at < statement_timestamp())
        and (
          select pg_catalog.count(*)
          from public.events as newer
          where newer.archived_at is null
            and (
              newer.status <> 'scheduled'
              or newer.starts_at < statement_timestamp()
            )
            and (
              newer.starts_at > target.starts_at
              or (newer.starts_at = target.starts_at and newer.id > target.id)
            )
        ) >= 4
      from public.events as target
      where target.id = p_event_id
    ),
    false
  );
$function$;

create or replace function private.prevent_archived_past_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
begin
  if tg_table_name = 'events' then
    if tg_op <> 'UPDATE' then
      return new;
    end if;
    if (select private.is_event_in_retained_past_archive(old.id))
      and (
        new.title is distinct from old.title
        or new.event_type is distinct from old.event_type
        or new.starts_at is distinct from old.starts_at
        or new.location is distinct from old.location
        or new.description is distinct from old.description
        or new.minutes_enabled is distinct from old.minutes_enabled
        or new.attendance_enabled is distinct from old.attendance_enabled
        or new.budget_enabled is distinct from old.budget_enabled
        or new.income_enabled is distinct from old.income_enabled
        or new.expenses_enabled is distinct from old.expenses_enabled
        or new.ticketing_enabled is distinct from old.ticketing_enabled
        or new.status is distinct from old.status
        or new.status_changed_at is distinct from old.status_changed_at
        or new.status_changed_by is distinct from old.status_changed_by
        or (
          new.archived_at is not distinct from old.archived_at
          and (
            new.updated_at is distinct from old.updated_at
            or new.updated_by is distinct from old.updated_by
          )
        )
      ) then
      raise exception using errcode = '42501',
        message = 'Older past events are retained for reporting and are read-only.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_event_id := old.event_id;
  else
    v_event_id := new.event_id;
  end if;
  if (select private.is_event_in_retained_past_archive(v_event_id)) then
    raise exception using errcode = '42501',
      message = 'Older past events are retained for reporting and are read-only.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger events_past_archive_mutation_guard
before update on public.events
for each row execute function private.prevent_archived_past_event_mutation();

create trigger event_role_assignments_past_archive_mutation_guard
before insert or update or delete on public.event_role_assignments
for each row execute function private.prevent_archived_past_event_mutation();

create trigger event_budgets_past_archive_mutation_guard
before insert or update or delete on public.event_budgets
for each row execute function private.prevent_archived_past_event_mutation();

create trigger event_budget_allocations_past_archive_mutation_guard
before insert or update or delete on public.event_budget_allocations
for each row execute function private.prevent_archived_past_event_mutation();

revoke all on function private.is_event_in_retained_past_archive(uuid) from public, anon, authenticated, service_role;
revoke all on function private.prevent_archived_past_event_mutation() from public, anon, authenticated, service_role;
