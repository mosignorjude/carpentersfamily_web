-- Give every event its own SLK-style budget, ticketing, overview, and reporting rules.

alter table public.event_budget_allocations
  add column allocation_percent numeric(18, 12) not null default 0;

update public.event_budget_allocations as a
set allocation_percent = pg_catalog.round(
  a.amount_ngn::numeric * 100 / nullif(b.total_ngn, 0), 12
)
from public.event_budgets as b
where b.event_id = a.event_id;

alter table public.event_budget_allocations
  drop constraint event_budget_allocations_amount_check,
  add constraint event_budget_allocations_amount_check
    check (amount_ngn between 0 and 1000000000000),
  add constraint event_budget_allocations_percent_check
    check (allocation_percent between 0 and 100);

grant select (allocation_percent)
  on public.event_budget_allocations to authenticated;

-- Ticketing belongs to an event, not to a particular event type or the manual
-- income switch. Ticket revenue has its own audited ticket-sales ledger.
alter table public.events
  drop constraint events_ticketing_feature_check,
  add constraint events_ticketing_finance_check
    check (not ticketing_enabled or (budget_enabled and income_enabled and expenses_enabled));

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
    or (p_ticketing_enabled and not (p_budget_enabled and p_income_enabled and p_expenses_enabled)) then
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

-- Rebuild the budget procedure around percentages. Amounts are rounded to whole
-- Naira in the database and allocations may leave any remainder unallocated.
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
  v_category public.event_finance_categories%rowtype;
  v_category_id uuid;
  v_percentage_text text;
  v_percentage numeric(18, 12);
  v_amount bigint;
  v_position integer := 0;
  v_sum_percent numeric(24, 12) := 0;
  v_sum_amount numeric(30, 0) := 0;
  v_category_ids uuid[] := array[]::uuid[];
  v_allocations_input jsonb := '[]'::jsonb;
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
    or pg_catalog.jsonb_array_length(p_allocations) not between 0 and 50
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
      or not (v_item ? 'category_id') or not (v_item ? 'percentage')
      or pg_catalog.jsonb_typeof(v_item -> 'category_id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'percentage') is distinct from 'number' then
      raise exception using errcode = '23514', message = 'Each allocation must contain only a catalog category and percentage.';
    end if;
    if (v_item ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '23514', message = 'Each allocation must use a valid budget category.';
    end if;
    v_category_id := (v_item ->> 'category_id')::uuid;
    v_percentage_text := v_item ->> 'percentage';
    if v_percentage_text is null or v_percentage_text !~ '^(100(\.0{1,12})?|[0-9]{1,2}(\.[0-9]{1,12})?)$' then
      raise exception using errcode = '23514', message = 'An allocation percentage is invalid.';
    end if;
    v_percentage := v_percentage_text::numeric;
    if v_percentage not between 0 and 100 or v_category_id = any(v_category_ids) then
      raise exception using errcode = '23514', message = 'Allocation categories must be unique and percentages must be between 0 and 100.';
    end if;
    v_category_ids := pg_catalog.array_append(v_category_ids, v_category_id);
    v_sum_percent := v_sum_percent + v_percentage;
    v_amount := pg_catalog.round(p_total_ngn::numeric * v_percentage / 100)::bigint;
    v_sum_amount := v_sum_amount + v_amount;
    v_allocations_input := v_allocations_input || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'position', v_position, 'category_id', v_category_id,
        'percentage', v_percentage, 'amount_ngn', v_amount
      )
    );
  end loop;
  if v_sum_percent > 100 or v_sum_amount > p_total_ngn then
    raise exception using errcode = '23514', message = 'Allocation percentages and rounded amounts cannot exceed the budget total.';
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
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null or v_event.status <> 'scheduled'
    or not v_event.budget_enabled then
    raise exception using errcode = '42501', message = 'This event does not accept budget changes.';
  end if;

  for v_item in
    select item.value from pg_catalog.jsonb_array_elements(v_allocations_input) as item(value)
  loop
    select c.* into v_category
    from public.event_finance_categories as c
    where c.id = (v_item ->> 'category_id')::uuid
      and c.category_type = 'budget_allocation'
      and c.retired_at is null
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Choose an active Admin-managed budget allocation category.';
    end if;
    v_new_allocations := v_new_allocations || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'position', (v_item ->> 'position')::integer,
        'category_id', v_category.id,
        'name', v_category.name,
        'percentage', (v_item ->> 'percentage')::numeric,
        'amount_ngn', (v_item ->> 'amount_ngn')::bigint
      )
    );
  end loop;

  select b.* into v_budget from public.event_budgets as b
  where b.event_id = p_event_id for update;
  v_exists := found;
  if v_exists and v_reason is null then
    raise exception using errcode = '23514', message = 'A reason is required for a budget revision.';
  end if;
  if v_exists then
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'position', a.position, 'category_id', a.category_id,
          'name', a.allocation_name, 'percentage', a.allocation_percent,
          'amount_ngn', a.amount_ngn
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
    event_id, position, category_id, allocation_name, amount_ngn,
    allocation_percent
  )
  select p_event_id, (item.value ->> 'position')::smallint,
    (item.value ->> 'category_id')::uuid, item.value ->> 'name',
    (item.value ->> 'amount_ngn')::bigint,
    (item.value ->> 'percentage')::numeric
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

-- A completed/cancelled event posts realized money only. Pending/unpaid
-- expenses remain commitments and pending/unpaid income is not cash received.
create or replace function private.sync_event_status_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_signed_amount numeric(30, 0);
  v_generation integer;
  v_posting public.event_ledger_entries%rowtype;
  v_ledger_id uuid;
begin
  if old.status = new.status then return new; end if;
  if old.status = 'scheduled' and new.status in ('completed', 'cancelled') then
    select
      coalesce((select pg_catalog.sum(case
        when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
        when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
        else 0 end)
        from public.event_financial_transactions as t where t.event_id = new.id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
        from public.event_ticket_sales as s where s.event_id = new.id and s.refunded_at is null), 0)
      into v_signed_amount;
    select coalesce(pg_catalog.max(le.generation), 0) + 1 into v_generation
      from public.event_ledger_entries as le where le.event_id = new.id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
    insert into public.event_ledger_entries (
      event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by
    ) values (
      new.id, v_generation, 'posting', new.status, v_signed_amount, new.status_changed_by
    ) returning id into v_ledger_id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
    ) values (
      new.status_changed_by, 'event_ledger_posted', 'event_ledger_entry', v_ledger_id, new.id,
      null, pg_catalog.jsonb_build_object('event_id', new.id, 'generation', v_generation,
        'event_status', new.status, 'signed_amount_ngn', v_signed_amount),
      'Automatic event ledger post on event completion or cancellation.'
    );
  elsif old.status in ('completed', 'cancelled') and new.status = 'scheduled' then
    select le.* into v_posting from public.event_ledger_entries as le
      where le.event_id = new.id and le.entry_kind = 'posting'
        and not exists (
          select 1 from public.event_ledger_entries as rev
          where rev.entry_kind = 'reversal' and rev.reverses_entry_id = le.id
        )
      order by le.generation desc limit 1 for update;
    if found then
      perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
      insert into public.event_ledger_entries (
        event_id, generation, entry_kind, event_status, signed_amount_ngn,
        reverses_entry_id, created_by
      ) values (
        new.id, v_posting.generation, 'reversal', old.status,
        -v_posting.signed_amount_ngn, v_posting.id, new.status_changed_by
      ) returning id into v_ledger_id;
      perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
      insert into public.audit_log (
        actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
      ) values (
        new.status_changed_by, 'event_ledger_reversed', 'event_ledger_entry', v_ledger_id, new.id,
        pg_catalog.jsonb_build_object('posting_id', v_posting.id,
          'signed_amount_ngn', v_posting.signed_amount_ngn),
        pg_catalog.jsonb_build_object('event_id', new.id, 'reverses_entry_id', v_posting.id,
          'signed_amount_ngn', -v_posting.signed_amount_ngn),
        'Automatic event ledger reversal on event reopening.'
      );
    end if;
  end if;
  return new;
end;
$function$;

create function private.event_finance_allocation_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  "position" smallint, category_id uuid, category_name text,
  allocation_percent numeric, amount_ngn bigint,
  actual_expense_ngn numeric, committed_expense_ngn numeric,
  cash_remaining_ngn numeric, available_after_commitments_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select a.position, a.category_id, a.allocation_name,
    a.allocation_percent, a.amount_ngn,
    coalesce(pg_catalog.sum(t.amount_ngn::numeric) filter (
      where t.payment_status in ('paid', 'deposit')
    ), 0),
    coalesce(pg_catalog.sum(t.amount_ngn::numeric) filter (
      where t.payment_status in ('pending', 'unpaid')
    ), 0),
    a.amount_ngn::numeric - coalesce(pg_catalog.sum(t.amount_ngn::numeric) filter (
      where t.payment_status in ('paid', 'deposit')
    ), 0),
    a.amount_ngn::numeric - coalesce(pg_catalog.sum(t.amount_ngn::numeric) filter (
      where t.payment_status in ('paid', 'deposit', 'pending', 'unpaid')
    ), 0)
  from public.event_budget_allocations as a
  left join public.event_financial_transactions as t
    on t.event_id = a.event_id and t.kind = 'expense' and t.voided_at is null
    and (t.budget_allocation_category_id = a.category_id
      or (t.budget_allocation_category_id is null
        and t.budget_allocation_name_snapshot = a.allocation_name))
    and (p_start_date is null or t.transaction_date >= p_start_date)
    and (p_end_date is null or t.transaction_date <= p_end_date)
  where p_event_id is not null and a.event_id = p_event_id
    and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id)
    and (p_start_date is null or p_end_date is null or p_start_date <= p_end_date)
  group by a.position, a.category_id, a.allocation_name,
    a.allocation_percent, a.amount_ngn
  order by a.position;
$function$;

create function public.event_finance_allocation_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  "position" smallint, category_id uuid, category_name text,
  allocation_percent numeric, amount_ngn bigint,
  actual_expense_ngn numeric, committed_expense_ngn numeric,
  cash_remaining_ngn numeric, available_after_commitments_ngn numeric
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.event_finance_allocation_summary(p_event_id, p_start_date, p_end_date);
$function$;

create function private.event_finance_ticket_tier_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  tier_id uuid, tier_name text, price_ngn bigint, capacity integer,
  sold_quantity bigint, ticket_income_ngn numeric, retired_at timestamptz
)
language sql stable security definer set search_path = '' as $function$
  select tier.id, tier.name, tier.price_ngn, tier.capacity,
    coalesce(pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when sale.refunded_at is null then sale.quantity else 0 end
      else
        case when (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.quantity else 0 end
        - case when sale.refunded_at is not null and (sale.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.quantity else 0 end
      end)::bigint, 0),
    coalesce(pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when sale.refunded_at is null then sale.amount_ngn::numeric else 0 end
      else
        case when (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.amount_ngn::numeric else 0 end
        - case when sale.refunded_at is not null and (sale.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.amount_ngn::numeric else 0 end
      end), 0), tier.retired_at
  from public.event_ticket_tiers as tier
  left join public.event_ticket_sales as sale
    on sale.tier_id = tier.id and sale.event_id = tier.event_id
    and ((p_start_date is null and p_end_date is null and sale.refunded_at is null)
      or ((p_start_date is not null or p_end_date is not null) and (
        (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
        or (sale.refunded_at is not null and
          (sale.refunded_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31'))
      )))
  where p_event_id is not null and tier.event_id = p_event_id
    and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id)
    and (p_start_date is null or p_end_date is null or p_start_date <= p_end_date)
  group by tier.id, tier.name, tier.price_ngn, tier.capacity, tier.retired_at
  order by tier.created_at, tier.id;
$function$;

create function public.event_finance_ticket_tier_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  tier_id uuid, tier_name text, price_ngn bigint, capacity integer,
  sold_quantity bigint, ticket_income_ngn numeric, retired_at timestamptz
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.event_finance_ticket_tier_summary(p_event_id, p_start_date, p_end_date);
$function$;

create function private.event_finance_report_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  paid_income_ngn numeric, pending_income_ngn numeric, unpaid_income_ngn numeric,
  actual_expense_ngn numeric, committed_expense_ngn numeric,
  ticket_income_ngn numeric, tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'pending'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'unpaid'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('pending', 'unpaid')
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when s.refunded_at is null then s.amount_ngn::numeric else 0 end
      else
        case when (s.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.amount_ngn::numeric else 0 end
        - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.amount_ngn::numeric else 0 end
      end)
      from public.event_ticket_sales as s where s.event_id = p_event_id), 0),
    coalesce((select pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when s.refunded_at is null then s.quantity else 0 end
      else
        case when (s.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.quantity else 0 end
        - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.quantity else 0 end
      end)::bigint
      from public.event_ticket_sales as s where s.event_id = p_event_id), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null
        and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0)
      + coalesce((select pg_catalog.sum(case
        when p_start_date is null and p_end_date is null then
          case when s.refunded_at is null then s.amount_ngn::numeric else 0 end
        else
          case when (s.created_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
            then s.amount_ngn::numeric else 0 end
          - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
            then s.amount_ngn::numeric else 0 end
        end)
        from public.event_ticket_sales as s where s.event_id = p_event_id), 0)
  where p_event_id is not null
    and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id)
    and (p_start_date is null or p_end_date is null or p_start_date <= p_end_date);
$function$;

create function public.event_finance_report_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  paid_income_ngn numeric, pending_income_ngn numeric, unpaid_income_ngn numeric,
  actual_expense_ngn numeric, committed_expense_ngn numeric,
  ticket_income_ngn numeric, tickets_sold bigint, net_result_ngn numeric
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.event_finance_report_summary(p_event_id, p_start_date, p_end_date);
$function$;

revoke all on function private.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon, service_role;
revoke all on function private.set_event_budget(uuid, bigint, jsonb, text) from public, anon, service_role;
revoke all on function private.sync_event_status_to_ledger() from public, anon, authenticated, service_role;
revoke all on function private.event_finance_allocation_summary(uuid, date, date) from public, anon, service_role;
revoke all on function public.event_finance_allocation_summary(uuid, date, date) from public, anon, service_role;
revoke all on function private.event_finance_ticket_tier_summary(uuid, date, date) from public, anon, service_role;
revoke all on function public.event_finance_ticket_tier_summary(uuid, date, date) from public, anon, service_role;
revoke all on function private.event_finance_report_summary(uuid, date, date) from public, anon, service_role;
revoke all on function public.event_finance_report_summary(uuid, date, date) from public, anon, service_role;

grant execute on function private.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function private.set_event_budget(uuid, bigint, jsonb, text) to authenticated;
grant execute on function private.event_finance_allocation_summary(uuid, date, date) to authenticated;
grant execute on function public.event_finance_allocation_summary(uuid, date, date) to authenticated;
grant execute on function private.event_finance_ticket_tier_summary(uuid, date, date) to authenticated;
grant execute on function public.event_finance_ticket_tier_summary(uuid, date, date) to authenticated;
grant execute on function private.event_finance_report_summary(uuid, date, date) to authenticated;
grant execute on function public.event_finance_report_summary(uuid, date, date) to authenticated;
