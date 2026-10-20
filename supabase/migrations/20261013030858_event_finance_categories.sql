-- Shared, Admin-managed categories for event budgets, expenses, and revenue.

create table public.event_finance_categories (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  category_type text not null,
  name text not null,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  retired_by uuid references public.member_profiles (id) on delete restrict,
  retire_reason text,
  constraint event_finance_categories_type_check check (
    category_type in ('budget_allocation', 'expense', 'revenue')
  ),
  constraint event_finance_categories_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint event_finance_categories_retirement_fields_check check (
    (retired_at is null and retired_by is null and retire_reason is null)
    or (
      retired_at is not null
      and retired_by is not null
      and retire_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(retire_reason)) between 1 and 500
      and retire_reason = pg_catalog.btrim(retire_reason)
    )
  )
);

create unique index event_finance_categories_active_name_uidx
  on public.event_finance_categories (category_type, pg_catalog.lower(name))
  where retired_at is null;

alter table public.event_finance_categories enable row level security;
alter table public.event_finance_categories force row level security;

create policy event_finance_categories_active_member_read
  on public.event_finance_categories for select to authenticated
  using ((select private.is_active_club_member()));

revoke all on table public.event_finance_categories
  from public, anon, authenticated, service_role;
grant select (id, category_type, name, created_at, retired_at)
  on public.event_finance_categories to authenticated;

create or replace function private.create_event_finance_category(
  p_category_type text,
  p_name text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(p_name);
  v_reason text := pg_catalog.btrim(p_reason);
  v_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'An active Admin or Backup Admin is required.';
  end if;
  if p_category_type is null or p_category_type not in ('budget_allocation', 'expense', 'revenue')
    or p_name is null or pg_catalog.char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]'
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A valid category type, name, and reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
    or not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may manage event finance categories.';
  end if;

  insert into public.event_finance_categories (category_type, name, created_by)
  values (p_category_type, v_name, v_actor_id)
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, after_data, reason)
  values (
    v_actor_id,
    'event_finance_category_created',
    'event_finance_category',
    v_id,
    pg_catalog.jsonb_build_object('category_type', p_category_type, 'name', v_name),
    v_reason
  );
  return v_id;
end;
$function$;

create or replace function private.rename_event_finance_category(
  p_category_id uuid,
  p_name text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(p_name);
  v_reason text := pg_catalog.btrim(p_reason);
  v_category public.event_finance_categories%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'An active Admin or Backup Admin is required.';
  end if;
  if p_category_id is null or p_name is null
    or pg_catalog.char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]'
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A valid category, name, and reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
    or not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may manage event finance categories.';
  end if;

  select c.* into v_category
  from public.event_finance_categories as c
  where c.id = p_category_id and c.retired_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The category is unavailable.';
  end if;

  update public.event_finance_categories
  set name = v_name
  where id = p_category_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
  values (
    v_actor_id,
    'event_finance_category_renamed',
    'event_finance_category',
    p_category_id,
    pg_catalog.jsonb_build_object('category_type', v_category.category_type, 'name', v_category.name),
    pg_catalog.jsonb_build_object('category_type', v_category.category_type, 'name', v_name),
    v_reason
  );
end;
$function$;

create or replace function private.retire_event_finance_category(
  p_category_id uuid,
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
  v_retired_at timestamptz := pg_catalog.clock_timestamp();
  v_category public.event_finance_categories%rowtype;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'An active Admin or Backup Admin is required.';
  end if;
  if p_category_id is null or p_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A category and retirement reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
    or not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may manage event finance categories.';
  end if;

  select c.* into v_category
  from public.event_finance_categories as c
  where c.id = p_category_id and c.retired_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The category is unavailable.';
  end if;

  update public.event_finance_categories
  set retired_at = v_retired_at, retired_by = v_actor_id, retire_reason = v_reason
  where id = p_category_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
  values (
    v_actor_id,
    'event_finance_category_retired',
    'event_finance_category',
    p_category_id,
    pg_catalog.jsonb_build_object('category_type', v_category.category_type, 'name', v_category.name, 'retired_at', null),
    pg_catalog.jsonb_build_object('category_type', v_category.category_type, 'name', v_category.name, 'retired_at', v_retired_at),
    v_reason
  );
end;
$function$;

create or replace function public.create_event_finance_category(
  p_category_type text,
  p_name text,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_event_finance_category(p_category_type, p_name, p_reason);
$function$;

create or replace function public.rename_event_finance_category(
  p_category_id uuid,
  p_name text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.rename_event_finance_category(p_category_id, p_name, p_reason);
$function$;

create or replace function public.retire_event_finance_category(
  p_category_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.retire_event_finance_category(p_category_id, p_reason);
$function$;

revoke all on function private.create_event_finance_category(text, text, text) from public, anon, service_role;
revoke all on function private.rename_event_finance_category(uuid, text, text) from public, anon, service_role;
revoke all on function private.retire_event_finance_category(uuid, text) from public, anon, service_role;
revoke all on function public.create_event_finance_category(text, text, text) from public, anon, service_role;
revoke all on function public.rename_event_finance_category(uuid, text, text) from public, anon, service_role;
revoke all on function public.retire_event_finance_category(uuid, text) from public, anon, service_role;
grant execute on function private.create_event_finance_category(text, text, text) to authenticated;
grant execute on function private.rename_event_finance_category(uuid, text, text) to authenticated;
grant execute on function private.retire_event_finance_category(uuid, text) to authenticated;
grant execute on function public.create_event_finance_category(text, text, text) to authenticated;
grant execute on function public.rename_event_finance_category(uuid, text, text) to authenticated;
grant execute on function public.retire_event_finance_category(uuid, text) to authenticated;
