-- Step 19: Allow Admin, Backup Admin, and Event Leads to create and edit event finance categories.
-- Only Admin and Backup Admin can delete (retire) categories.

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
    raise exception using errcode = '42501', message = 'An active Admin, Backup Admin, or Event Lead is required.';
  end if;
  if p_category_type is null or p_category_type not in ('budget_allocation', 'expense', 'revenue')
    or p_name is null or pg_catalog.char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]'
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A valid category type, name, and reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
    or not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or exists (
        select 1 from public.event_role_assignments as era
        where era.member_id = v_actor_id
          and era.role in ('lead', 'event_lead')
          and era.revoked_at is null
      )
    ) then
    raise exception using errcode = '42501', message = 'Only an active Admin, Backup Admin, or Event Lead may create event finance categories.';
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
    raise exception using errcode = '42501', message = 'An active Admin, Backup Admin, or Event Lead is required.';
  end if;
  if p_category_id is null or p_name is null
    or pg_catalog.char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]'
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A valid category, name, and reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
    or not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or exists (
        select 1 from public.event_role_assignments as era
        where era.member_id = v_actor_id
          and era.role in ('lead', 'event_lead')
          and era.revoked_at is null
      )
    ) then
    raise exception using errcode = '42501', message = 'Only an active Admin, Backup Admin, or Event Lead may edit event finance categories.';
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
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may delete event finance categories.';
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
