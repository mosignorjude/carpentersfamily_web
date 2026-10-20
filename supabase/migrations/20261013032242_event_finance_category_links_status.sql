-- Link event budgets and manual finance entries to the shared category catalog.
-- Payment status follows SLK Rave: paid/deposit expense is actual spend;
-- pending/unpaid expense is a commitment. Existing entries remain paid so the
-- historical totals keep their previous meaning.

alter table public.event_budget_allocations
  add column category_id uuid references public.event_finance_categories (id) on delete restrict;

grant select (category_id)
  on public.event_budget_allocations to authenticated;

create index event_budget_allocations_category_idx
  on public.event_budget_allocations (category_id)
  where category_id is not null;

alter table public.event_financial_transactions
  add column category_id uuid references public.event_finance_categories (id) on delete restrict,
  add column category_name_snapshot text,
  add column budget_allocation_category_id uuid references public.event_finance_categories (id) on delete restrict,
  add column budget_allocation_name_snapshot text,
  add column payment_status text not null default 'paid';

grant select (category_id, category_name_snapshot, payment_status)
  on public.event_financial_transactions to authenticated;
grant select (budget_allocation_category_id, budget_allocation_name_snapshot)
  on public.event_financial_transactions to authenticated;

alter table public.event_financial_transactions
  add constraint event_financial_transactions_category_snapshot_check check (
    (category_id is null and category_name_snapshot is null)
    or (category_id is not null and category_name_snapshot is not null
      and category_name_snapshot = pg_catalog.btrim(category_name_snapshot)
      and pg_catalog.char_length(category_name_snapshot) between 2 and 80
      and category_name_snapshot !~ '[[:cntrl:]]')
  ),
  add constraint event_financial_transactions_budget_allocation_snapshot_check check (
    (budget_allocation_category_id is null and budget_allocation_name_snapshot is null)
    or (kind = 'expense' and budget_allocation_category_id is not null
      and budget_allocation_name_snapshot is not null
      and budget_allocation_name_snapshot = pg_catalog.btrim(budget_allocation_name_snapshot)
      and pg_catalog.char_length(budget_allocation_name_snapshot) between 2 and 80
      and budget_allocation_name_snapshot !~ '[[:cntrl:]]')
  ),
  add constraint event_financial_transactions_payment_status_check check (
    (kind = 'expense' and payment_status in ('paid', 'pending', 'deposit', 'unpaid'))
    or (kind = 'income' and payment_status in ('paid', 'pending', 'unpaid'))
  );

create index event_financial_transactions_event_category_idx
  on public.event_financial_transactions (event_id, category_id, transaction_date desc)
  where voided_at is null and category_id is not null;

create or replace function private.guard_event_financial_transaction_write()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Event financial history is retained; records cannot be deleted.';
  end if;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if tg_op = 'INSERT' then
    if not (select private.can_manage_event_finances(new.event_id))
      or new.created_by is distinct from v_actor_id or new.updated_by is distinct from v_actor_id
      or new.voided_at is not null then
      raise exception using errcode = '42501', message = 'Event financial management access is required.';
    end if;
    select e.* into v_event from public.events as e where e.id = new.event_id for update;
    if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
      or (new.kind = 'income' and not v_event.income_enabled)
      or (new.kind = 'expense' and not v_event.expenses_enabled) then
      raise exception using errcode = '42501', message = 'This event does not allow that financial entry.';
    end if;
    if new.transaction_date > v_today
      or (new.transaction_date < v_today
        and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin')))) then
      raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter a past-dated event transaction.';
    end if;
    return new;
  end if;

  if not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may correct or void event finances.';
  end if;
  select e.* into v_event from public.events as e where e.id = old.event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or old.voided_at is not null
    or new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
    or new.idempotency_key is distinct from old.idempotency_key
    or new.updated_by is distinct from v_actor_id or new.updated_at <= old.updated_at then
    raise exception using errcode = '42501', message = 'Only a current unvoided transaction in a scheduled event may be corrected.';
  end if;
  if new.voided_at is distinct from old.voided_at then
    if new.voided_at is null or new.voided_by is distinct from v_actor_id or new.void_reason is null
      or new.kind is distinct from old.kind or new.amount_ngn is distinct from old.amount_ngn
      or new.transaction_date is distinct from old.transaction_date
      or new.description is distinct from old.description or new.payer_payee is distinct from old.payer_payee
      or new.source_note is distinct from old.source_note or new.payment_method is distinct from old.payment_method
      or new.category_id is distinct from old.category_id
      or new.category_name_snapshot is distinct from old.category_name_snapshot
      or new.budget_allocation_category_id is distinct from old.budget_allocation_category_id
      or new.budget_allocation_name_snapshot is distinct from old.budget_allocation_name_snapshot
      or new.payment_status is distinct from old.payment_status then
      raise exception using errcode = '42501', message = 'A void must retain the original transaction values.';
    end if;
  elsif new.voided_by is distinct from old.voided_by or new.void_reason is distinct from old.void_reason then
    raise exception using errcode = '42501', message = 'Void history cannot be rewritten.';
  end if;
  return new;
end;
$function$;

-- Replace the old RPC signatures so callers cannot bypass category/status checks.
drop function public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid);
drop function private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid);
drop function public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text);
drop function private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text);

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
  v_name text;
  v_amount_text text;
  v_amount bigint;
  v_position integer := 0;
  v_sum numeric := 0;
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
      or not (v_item ? 'category_id') or not (v_item ? 'amount_ngn')
      or pg_catalog.jsonb_typeof(v_item -> 'category_id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_item -> 'amount_ngn') is distinct from 'number' then
      raise exception using errcode = '23514', message = 'Each allocation must contain only a catalog category and whole-Naira amount.';
    end if;
    if (v_item ->> 'category_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using errcode = '23514', message = 'Each allocation must use a valid budget category.';
    end if;
    v_category_id := (v_item ->> 'category_id')::uuid;
    v_amount_text := v_item ->> 'amount_ngn';
    if v_amount_text is null or v_amount_text !~ '^[1-9][0-9]{0,12}$' then
      raise exception using errcode = '23514', message = 'A budget allocation amount is invalid.';
    end if;
    v_amount := v_amount_text::bigint;
    if v_amount > 1000000000000 or v_category_id = any(v_category_ids) then
      raise exception using errcode = '23514', message = 'Budget categories must be unique and allocation amounts must be within the allowed amount.';
    end if;
    v_category_ids := pg_catalog.array_append(v_category_ids, v_category_id);
    v_sum := v_sum + v_amount;
    v_allocations_input := v_allocations_input || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'position', v_position, 'category_id', v_category_id, 'amount_ngn', v_amount
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
        'amount_ngn', (v_item ->> 'amount_ngn')::bigint
      )
    );
  end loop;

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
          'position', a.position, 'category_id', a.category_id,
          'name', a.allocation_name, 'amount_ngn', a.amount_ngn
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
    event_id, position, category_id, allocation_name, amount_ngn
  )
  select p_event_id, (item.value ->> 'position')::smallint,
    (item.value ->> 'category_id')::uuid, item.value ->> 'name',
    (item.value ->> 'amount_ngn')::bigint
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

create function private.record_event_financial_transaction(
  p_event_id uuid, p_kind text, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text, p_payment_method text,
  p_category_id uuid, p_budget_allocation_category_id uuid,
  p_payment_status text, p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_existing public.event_financial_transactions%rowtype;
  v_event public.events%rowtype;
  v_category_name text;
  v_budget_allocation_name text;
  v_id uuid;
begin
  if p_event_id is null or p_kind is null or p_kind not in ('income', 'expense')
    or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
    or p_transaction_date < date '1900-01-01' or p_transaction_date > v_today
    or p_category_id is null or p_payment_status is null
    or (p_kind = 'income' and p_budget_allocation_category_id is not null)
    or (p_kind = 'income' and (p_payment_status not in ('paid', 'pending', 'unpaid')
      or p_source_note is null or p_payment_method is null or p_payment_method not in
      ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')))
    or (p_kind = 'expense' and (p_payment_status not in ('paid', 'pending', 'deposit', 'unpaid')
      or p_description is null or p_payer_payee is null
      or p_payment_method is not null or p_source_note is not null))
    or p_idempotency_key is null
    or (p_description is not null and (p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 500 or p_description ~ '[[:cntrl:]]'))
    or (p_payer_payee is not null and (p_payer_payee <> pg_catalog.btrim(p_payer_payee)
      or pg_catalog.char_length(p_payer_payee) not between 1 and 160 or p_payer_payee ~ '[[:cntrl:]]'))
    or (p_source_note is not null and (p_source_note <> pg_catalog.btrim(p_source_note)
      or pg_catalog.char_length(p_source_note) not between 1 and 500 or p_source_note ~ '[[:cntrl:]]')) then
    raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Event financial management access is required.';
  end if;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or (p_kind = 'income' and not v_event.income_enabled)
    or (p_kind = 'expense' and not v_event.expenses_enabled) then
    raise exception using errcode = '42501', message = 'This event does not allow that financial entry.';
  end if;
  if p_transaction_date < v_today
    and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter a past-dated event transaction.';
  end if;
  select t.* into v_existing from public.event_financial_transactions as t
    where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.event_id = p_event_id and v_existing.kind = p_kind
      and v_existing.amount_ngn = p_amount_ngn and v_existing.transaction_date = p_transaction_date
      and v_existing.description is not distinct from p_description
      and v_existing.payer_payee is not distinct from p_payer_payee
      and v_existing.source_note is not distinct from p_source_note
      and v_existing.payment_method is not distinct from p_payment_method
      and v_existing.category_id = p_category_id
      and v_existing.budget_allocation_category_id is not distinct from p_budget_allocation_category_id
      and v_existing.payment_status = p_payment_status then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'The event financial idempotency key was already used with different values.';
  end if;
  if p_budget_allocation_category_id is not null then
    select a.allocation_name into v_budget_allocation_name
    from public.event_budget_allocations as a
    where a.event_id = p_event_id
      and a.category_id = p_budget_allocation_category_id
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Choose an allocation currently included in this event budget.';
    end if;
  end if;
  select c.name into v_category_name
  from public.event_finance_categories as c
  where c.id = p_category_id
    and c.category_type = case when p_kind = 'income' then 'revenue' else 'expense' end
    and c.retired_at is null
  for share;
  if not found then
    raise exception using errcode = '23503', message = 'Choose an active Admin-managed category for this transaction.';
  end if;
  insert into public.event_financial_transactions (
    event_id, kind, amount_ngn, transaction_date, description, payer_payee,
    source_note, payment_method, category_id, category_name_snapshot,
    budget_allocation_category_id, budget_allocation_name_snapshot, payment_status,
    created_by, idempotency_key, updated_by
  ) values (
    p_event_id, p_kind, p_amount_ngn, p_transaction_date, p_description, p_payer_payee,
    p_source_note, p_payment_method, p_category_id, v_category_name,
    p_budget_allocation_category_id, v_budget_allocation_name, p_payment_status,
    v_actor_id, p_idempotency_key, v_actor_id
  ) returning id into v_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_recorded', 'event_financial_transaction', v_id, null,
    pg_catalog.jsonb_build_object('event_id', p_event_id, 'kind', p_kind,
      'amount_ngn', p_amount_ngn, 'transaction_date', p_transaction_date,
      'category_id', p_category_id, 'category_name', v_category_name,
      'budget_allocation_category_id', p_budget_allocation_category_id,
      'budget_allocation_name', v_budget_allocation_name,
      'payment_status', p_payment_status), null
  );
  return v_id;
end;
$function$;

create function private.correct_event_financial_transaction(
  p_transaction_id uuid, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text,
  p_payment_method text, p_category_id uuid,
  p_budget_allocation_category_id uuid, p_payment_status text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction public.event_financial_transactions%rowtype;
  v_category_name text;
  v_budget_allocation_name text;
  v_reason text := pg_catalog.btrim(p_reason);
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_transaction_id is null or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000
    or p_transaction_date is null or p_transaction_date < date '1900-01-01'
    or p_transaction_date > v_today or p_category_id is null or p_payment_status is null
    or p_payment_status not in ('paid', 'pending', 'deposit', 'unpaid')
    or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]'
    or (p_description is not null and (p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 500 or p_description ~ '[[:cntrl:]]'))
    or (p_payer_payee is not null and (p_payer_payee <> pg_catalog.btrim(p_payer_payee)
      or pg_catalog.char_length(p_payer_payee) not between 1 and 160 or p_payer_payee ~ '[[:cntrl:]]'))
    or (p_source_note is not null and (p_source_note <> pg_catalog.btrim(p_source_note)
      or pg_catalog.char_length(p_source_note) not between 1 and 500 or p_source_note ~ '[[:cntrl:]]')) then
    raise exception using errcode = '23514', message = 'The corrected event transaction values or reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may correct event finances.';
  end if;
  select t.* into v_transaction from public.event_financial_transactions as t
    where t.id = p_transaction_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The event financial transaction is unavailable.';
  end if;
  if (v_transaction.kind = 'income' and (p_payment_status not in ('paid', 'pending', 'unpaid')
      or p_description is not null or p_source_note is null or p_payment_method is null
      or p_payment_method not in ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')
      or p_budget_allocation_category_id is not null))
    or (v_transaction.kind = 'expense' and (p_description is null or p_source_note is not null
      or p_payment_method is not null)) then
    raise exception using errcode = '23514', message = 'The corrected event transaction fields do not match its type.';
  end if;
  perform 1 from public.events as e where e.id = v_transaction.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found or v_transaction.voided_at is not null then
    raise exception using errcode = '42501', message = 'Only an unvoided transaction in a scheduled event may be corrected.';
  end if;
  if p_budget_allocation_category_id is not null then
    select a.allocation_name into v_budget_allocation_name
    from public.event_budget_allocations as a
    where a.event_id = v_transaction.event_id
      and a.category_id = p_budget_allocation_category_id
    for share;
    if not found then
      raise exception using errcode = '23503', message = 'Choose an allocation currently included in this event budget.';
    end if;
  end if;
  select c.name into v_category_name
  from public.event_finance_categories as c
  where c.id = p_category_id
    and c.category_type = case when v_transaction.kind = 'income' then 'revenue' else 'expense' end
    and c.retired_at is null
  for share;
  if not found then
    raise exception using errcode = '23503', message = 'Choose an active Admin-managed category for this transaction.';
  end if;
  update public.event_financial_transactions set
    amount_ngn = p_amount_ngn, transaction_date = p_transaction_date,
    description = p_description, payer_payee = p_payer_payee,
    source_note = p_source_note, payment_method = p_payment_method,
    category_id = p_category_id, category_name_snapshot = v_category_name,
    budget_allocation_category_id = p_budget_allocation_category_id,
    budget_allocation_name_snapshot = v_budget_allocation_name,
    payment_status = p_payment_status,
    updated_by = v_actor_id, updated_at = v_now
  where id = p_transaction_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_corrected', 'event_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date, 'description', v_transaction.description,
      'payer_payee', v_transaction.payer_payee, 'source_note', v_transaction.source_note,
      'payment_method', v_transaction.payment_method, 'category_id', v_transaction.category_id,
      'category_name', v_transaction.category_name_snapshot,
      'budget_allocation_category_id', v_transaction.budget_allocation_category_id,
      'budget_allocation_name', v_transaction.budget_allocation_name_snapshot,
      'payment_status', v_transaction.payment_status),
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', p_amount_ngn,
      'transaction_date', p_transaction_date, 'description', p_description,
      'payer_payee', p_payer_payee, 'source_note', p_source_note,
      'payment_method', p_payment_method, 'category_id', p_category_id,
      'category_name', v_category_name,
      'budget_allocation_category_id', p_budget_allocation_category_id,
      'budget_allocation_name', v_budget_allocation_name,
      'payment_status', p_payment_status), v_reason
  );
end;
$function$;

create function public.record_event_financial_transaction(
  p_event_id uuid, p_kind text, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text, p_payment_method text,
  p_category_id uuid, p_budget_allocation_category_id uuid,
  p_payment_status text, p_idempotency_key uuid
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.record_event_financial_transaction(p_event_id, p_kind, p_amount_ngn,
    p_transaction_date, p_description, p_payer_payee, p_source_note, p_payment_method,
    p_category_id, p_budget_allocation_category_id, p_payment_status, p_idempotency_key);
$function$;

create function public.correct_event_financial_transaction(
  p_transaction_id uuid, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text,
  p_payment_method text, p_category_id uuid,
  p_budget_allocation_category_id uuid, p_payment_status text, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.correct_event_financial_transaction(p_transaction_id, p_amount_ngn,
    p_transaction_date, p_description, p_payer_payee, p_source_note, p_payment_method,
    p_category_id, p_budget_allocation_category_id, p_payment_status, p_reason);
$function$;

create or replace function private.event_finance_summary(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null), 0)
  where p_event_id is not null and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

create function private.event_finance_budget_summary(p_event_id uuid)
returns table (
  received_income_ngn numeric, actual_expense_ngn numeric,
  committed_expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('pending', 'unpaid') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null), 0)
  where p_event_id is not null and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

create function public.event_finance_budget_summary(p_event_id uuid)
returns table (
  received_income_ngn numeric, actual_expense_ngn numeric,
  committed_expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql security invoker set search_path = '' as $function$
  select * from private.event_finance_budget_summary(p_event_id);
$function$;

revoke all on function private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid) from public, anon, service_role;
revoke all on function private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text) from public, anon, service_role;
revoke all on function public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid) from public, anon, service_role;
revoke all on function public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text) from public, anon, service_role;
revoke all on function private.event_finance_budget_summary(uuid) from public, anon, service_role;
revoke all on function public.event_finance_budget_summary(uuid) from public, anon, service_role;

grant execute on function private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid) to authenticated;
grant execute on function private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text) to authenticated;
grant execute on function public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid) to authenticated;
grant execute on function public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text) to authenticated;
grant execute on function private.event_finance_budget_summary(uuid) to authenticated;
grant execute on function public.event_finance_budget_summary(uuid) to authenticated;
