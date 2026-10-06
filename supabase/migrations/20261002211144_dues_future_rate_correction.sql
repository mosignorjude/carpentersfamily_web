alter table public.dues_rates rename column created_by to changed_by;
alter table public.dues_rates rename column created_at to changed_at;

create or replace function private.prevent_dues_rate_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_current_month date := date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date;
begin
  if tg_op = 'UPDATE'
     and old.effective_month > v_current_month
     and new.id = old.id
     and new.effective_month = old.effective_month
     and new.changed_by is not null
     and new.changed_at >= old.changed_at
     and new.monthly_amount_ngn <> old.monthly_amount_ngn then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Effective dues rate history is immutable.';
end;
$function$;

create or replace function private.set_dues_rate(
  p_effective_month date,
  p_monthly_amount_ngn bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_current_month date := date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date;
  v_rate_id uuid;
  v_previous_amount bigint;
  v_before_data jsonb;
  v_after_data jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_effective_month is null
     or date_part('day', p_effective_month) <> 1
     or p_effective_month <> (v_current_month + interval '1 month')::date
     or p_monthly_amount_ngn not between 1 and 1000000000
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A valid amount and reason are required; a rate change takes effect next month.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may change dues rates.';
  end if;

  select dr.id, dr.monthly_amount_ngn
  into v_rate_id, v_previous_amount
  from public.dues_rates as dr
  where dr.effective_month = p_effective_month
  for update;

  if found then
    if v_previous_amount = p_monthly_amount_ngn then
      raise exception using
        errcode = '22023',
        message = 'The scheduled dues rate already has that amount.';
    end if;

    select pg_catalog.jsonb_build_object(
      'effective_month', dr.effective_month,
      'monthly_amount_ngn', dr.monthly_amount_ngn,
      'changed_by', dr.changed_by,
      'changed_at', dr.changed_at
    )
    into v_before_data
    from public.dues_rates as dr
    where dr.id = v_rate_id;

    update public.dues_rates as dr
    set monthly_amount_ngn = p_monthly_amount_ngn,
        changed_by = v_actor_id,
        changed_at = pg_catalog.clock_timestamp(),
        reason = v_reason
    where dr.id = v_rate_id;
  else
    insert into public.dues_rates (
      effective_month,
      monthly_amount_ngn,
      changed_by,
      reason
    ) values (
      p_effective_month,
      p_monthly_amount_ngn,
      v_actor_id,
      v_reason
    ) returning id into v_rate_id;
    v_before_data := null;
  end if;

  select pg_catalog.jsonb_build_object(
    'effective_month', dr.effective_month,
    'monthly_amount_ngn', dr.monthly_amount_ngn,
    'changed_by', dr.changed_by,
    'changed_at', dr.changed_at
  )
  into v_after_data
  from public.dues_rates as dr
  where dr.id = v_rate_id;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'dues_rate_changed',
    'dues_rate',
    v_rate_id,
    v_before_data,
    v_after_data,
    v_reason
  );

  return v_rate_id;
end;
$function$;
