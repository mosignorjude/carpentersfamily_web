-- Keep user-provided reasons for changes while allowing reason-free initial setup.

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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_audit_reason text;
  v_before jsonb;
begin
  if p_event_id is null or p_member_id is null
    or p_role is null or p_role not in ('lead', 'assistant', 'committee')
    or (p_reason is not null and v_reason is not null and (
      pg_catalog.char_length(v_reason) not between 1 and 500
      or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]'
    )) then
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

  if pg_catalog.jsonb_array_length(v_before -> 'prior_assignments') > 0
    and v_reason is null then
    raise exception using errcode = '23514', message = 'The event role assignment is invalid or has no reason.';
  end if;
  v_audit_reason := coalesce(v_reason, 'Initial event role assignment');

  update public.event_role_assignments as era
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id, revoke_reason = v_audit_reason
  where era.event_id = p_event_id and era.revoked_at is null
    and (
      era.member_id = p_member_id
      or (p_role in ('lead', 'assistant') and era.role = p_role)
    );

  insert into public.event_role_assignments (
    event_id, member_id, role, assigned_by, grant_reason
  ) values (p_event_id, p_member_id, p_role, v_actor_id, v_audit_reason);

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'event_role_assigned', 'event_role_assignment', p_event_id,
    p_member_id, v_before,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'member_id', p_member_id, 'role', p_role
    ),
    v_audit_reason
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
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_exists boolean := false;
begin
  if p_event_id is null or p_total_ngn is null
    or p_total_ngn not between 1 and 1000000000000
    or p_allocations is null or pg_catalog.jsonb_typeof(p_allocations) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_allocations) not between 1 and 50
    or (p_reason is not null and v_reason is not null and (
      pg_catalog.char_length(v_reason) not between 1 and 500
      or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]'
    )) then
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
  if v_exists and v_reason is null then
    raise exception using errcode = '23514', message = 'Budget total, allocations, or reason is invalid.';
  end if;
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
    'event_budget', p_event_id, v_before, v_after,
    coalesce(v_reason, 'Initial event budget setup')
  );
end;
$function$;

create or replace function private.create_event_ticket_tier(
  p_event_id uuid, p_name text, p_price_ngn bigint, p_capacity integer, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_tier_id uuid;
  v_name text := pg_catalog.btrim(p_name);
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_name is null or v_name is null or v_name <> p_name
    or pg_catalog.char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]'
    or p_price_ngn is null or p_price_ngn not between 1 and 1000000000000
    or p_capacity is null or p_capacity not between 1 and 100000
    or (p_reason is not null and v_reason is not null and (
      v_reason <> p_reason
      or pg_catalog.char_length(v_reason) not between 1 and 500
      or v_reason ~ '[[:cntrl:]]'
    )) then
    raise exception using errcode = '23514', message = 'Ticket tier details and reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Event financial management access is required.';
  end if;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or not v_event.ticketing_enabled then
    raise exception using errcode = '42501', message = 'Ticket tiers require a scheduled event with ticketing enabled.';
  end if;
  insert into public.event_ticket_tiers (
    event_id, name, price_ngn, capacity, created_by, created_at, updated_by, updated_at
  ) values (p_event_id, v_name, p_price_ngn, p_capacity, v_actor_id, v_now, v_actor_id, v_now)
  returning id into v_tier_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_tier_created', 'event_ticket_tier', v_tier_id,
    null, pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'name', v_name, 'price_ngn', p_price_ngn, 'capacity', p_capacity
    ), coalesce(v_reason, 'Ticket tier created')
  );
  return v_tier_id;
end;
$function$;
