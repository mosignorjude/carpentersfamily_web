-- 1. Modify event_financial_transactions: tighten payment_method check and allow on expenses
alter table public.event_financial_transactions
  drop constraint if exists event_financial_transactions_fields_check;

alter table public.event_financial_transactions
  add constraint event_financial_transactions_fields_check check (
    kind = 'expense'::text
      and description is not null
      and char_length(btrim(description)) between 1 and 500
      and description = btrim(description)
      and description !~ '[[:cntrl:]]'
      and payer_payee is not null
      and char_length(btrim(payer_payee)) between 1 and 160
      and payer_payee = btrim(payer_payee)
      and payer_payee !~ '[[:cntrl:]]'
      and source_note is null
      and (payment_method is null or payment_method in ('bank_transfer', 'cash'))
    or
    kind = 'income'::text
      and description is null
      and source_note is not null
      and char_length(btrim(source_note)) between 1 and 500
      and source_note = btrim(source_note)
      and source_note !~ '[[:cntrl:]]'
      and (payer_payee is null or (
        payer_payee = btrim(payer_payee)
        and char_length(payer_payee) between 1 and 160
        and payer_payee !~ '[[:cntrl:]]'
      ))
      and (payment_method is null or payment_method in ('bank_transfer', 'cash'))
  ) not valid;

alter table public.event_financial_transactions
  drop constraint if exists event_financial_transactions_payment_method_check;

alter table public.event_financial_transactions
  add constraint event_financial_transactions_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'cash')) not valid;

-- 2. Modify event_ticket_sales
alter table public.event_ticket_sales
  drop constraint if exists event_ticket_sales_payment_method_check;

alter table public.event_ticket_sales
  add constraint event_ticket_sales_payment_method_check
  check (payment_method in ('bank_transfer', 'cash')) not valid;

-- 3. Update private.append_event_finance_audit to query finance_receipts
create or replace function private.append_event_finance_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
begin
  select case p_entity_type
    when 'event_ticket_tier' then (select t.event_id from public.event_ticket_tiers as t where t.id = p_entity_id)
    when 'event_financial_transaction' then (select t.event_id from public.event_financial_transactions as t where t.id = p_entity_id)
    when 'event_ticket_sale' then (select s.event_id from public.event_ticket_sales as s where s.id = p_entity_id)
    when 'event_ledger_entry' then (select le.event_id from public.event_ledger_entries as le where le.id = p_entity_id)
    when 'event_financial_receipt' then (
      select coalesce(
        (select t.event_id from public.finance_receipts as r join public.event_financial_transactions as t on t.id = r.event_transaction_id where r.id = p_entity_id),
        (select s.event_id from public.finance_receipts as r join public.event_ticket_sales as s on s.id = r.event_ticket_sale_id where r.id = p_entity_id)
      )
    )
    when 'finance_receipt' then (
      select coalesce(
        (select t.event_id from public.finance_receipts as r join public.event_financial_transactions as t on t.id = r.event_transaction_id where r.id = p_entity_id),
        (select s.event_id from public.finance_receipts as r join public.event_ticket_sales as s on s.id = r.event_ticket_sale_id where r.id = p_entity_id)
      )
    )
    else null
  end into v_event_id;

  if v_event_id is null then
    raise exception using errcode = '23503', message = 'Event financial audit target is unavailable.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
  ) values (
    p_actor_id, p_action, p_entity_type, p_entity_id, v_event_id, p_before, p_after,
    coalesce(p_reason, 'Event financial action recorded.')
  );
end;
$function$;

-- 4. Drop existing signatures to avoid overload ambiguity
drop function if exists public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid);
drop function if exists private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid, uuid, text, uuid);
drop function if exists public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text);
drop function if exists private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, uuid, uuid, text, text);
drop function if exists public.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid);
drop function if exists private.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid);
drop function if exists public.edit_event_ticket_sale(uuid, integer, text, text, text);
drop function if exists private.edit_event_ticket_sale(uuid, integer, text, text, text);

-- 5. Recreate record_event_financial_transaction with atomic receipt
create or replace function public.record_event_financial_transaction(
  p_event_id uuid,
  p_kind text,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_payer_payee text,
  p_source_note text,
  p_payment_method text,
  p_idempotency_key uuid,
  p_category_id uuid default null,
  p_budget_allocation_category_id uuid default null,
  p_payment_status text default 'paid',
  p_transaction_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns table (
  transaction_id uuid,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_tx_id uuid := coalesce(p_transaction_id, gen_random_uuid());
  v_existing public.event_financial_transactions%rowtype;
  v_expected_key text;
  v_category_name text;
  v_alloc_name text;
  v_status text := coalesce(p_payment_status, 'paid');
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_event_id is null or p_kind is null or p_kind not in ('income', 'expense')
     or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000
     or p_transaction_date is null or p_transaction_date < '1900-01-01'::date
     or p_transaction_date > v_today or p_idempotency_key is null
     or (p_payment_method is not null and p_payment_method not in ('bank_transfer', 'cash'))
     or v_status not in ('paid', 'pending', 'deposit', 'unpaid')
     or (p_kind = 'expense' and v_status not in ('paid', 'pending', 'deposit', 'unpaid'))
     or (p_kind = 'income' and v_status not in ('paid', 'pending', 'unpaid')) then
    raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may record financial transactions.';
  end if;

  -- Replay check
  select t.* into v_existing
  from public.event_financial_transactions as t
  where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.event_id = p_event_id
       and v_existing.kind = p_kind
       and v_existing.amount_ngn = p_amount_ngn
       and v_existing.transaction_date = p_transaction_date
       and v_existing.description is not distinct from p_description
       and v_existing.payer_payee is not distinct from p_payer_payee
       and v_existing.source_note is not distinct from p_source_note
       and v_existing.payment_method is not distinct from p_payment_method
       and v_existing.category_id is not distinct from p_category_id
       and v_existing.budget_allocation_category_id is not distinct from p_budget_allocation_category_id
       and v_existing.payment_status = v_status then
      return query select v_existing.id, true;
      return;
    else
      raise exception using errcode = '23505', message = 'This submission key was already used for different event financial data.';
    end if;
  end if;

  if p_kind = 'expense' then
    if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
        or p_description <> pg_catalog.btrim(p_description) or p_description ~ '[[:cntrl:]]'
        or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
        or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_payer_payee ~ '[[:cntrl:]]'
        or p_source_note is not null then
      raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
    end if;
  else
    if p_description is not null or p_category_id is not null
        or p_budget_allocation_category_id is not null
        or (p_payer_payee is not null and (
          pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
          or p_payer_payee <> pg_catalog.btrim(p_payer_payee)
          or p_payer_payee ~ '[[:cntrl:]]'))
        or p_source_note is null
        or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
        or p_source_note <> pg_catalog.btrim(p_source_note)
        or p_source_note ~ '[[:cntrl:]]' then
      raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
    end if;
  end if;

  -- Receipt requirements: required iff bank_transfer AND paid
  if p_payment_method = 'bank_transfer' and v_status = 'paid' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata is required for paid bank transfers.';
    end if;

    v_expected_key := 'receipts/event/' || v_tx_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata forbidden for cash or non-paid bank transfers.';
    end if;
  end if;

  if p_category_id is not null then
    select name into v_category_name from public.event_finance_categories where id = p_category_id;
  end if;
  if p_budget_allocation_category_id is not null then
    select name into v_alloc_name from public.event_finance_categories where id = p_budget_allocation_category_id;
  end if;

  insert into public.event_financial_transactions (
    id, event_id, kind, amount_ngn, transaction_date, description,
    payer_payee, source_note, payment_method, category_id,
    category_name_snapshot, budget_allocation_category_id,
    budget_allocation_name_snapshot, payment_status, created_by,
    updated_by, idempotency_key
  ) values (
    v_tx_id, p_event_id, p_kind, p_amount_ngn, p_transaction_date, p_description,
    p_payer_payee, p_source_note, p_payment_method, p_category_id,
    v_category_name, p_budget_allocation_category_id,
    v_alloc_name, v_status, v_actor_id,
    v_actor_id, p_idempotency_key
  );

  if p_payment_method = 'bank_transfer' and v_status = 'paid' then
    insert into public.finance_receipts (
      id, scope, event_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event', v_tx_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_recorded', 'event_financial_transaction', v_tx_id, null,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'kind', p_kind, 'amount_ngn', p_amount_ngn,
      'transaction_date', p_transaction_date, 'payment_method', p_payment_method,
      'payment_status', v_status
    ), 'Event transaction recorded'
  );

  return query select v_tx_id, false;
end;
$$;

-- 6. Recreate correct_event_financial_transaction (immutable method, transition receipt)
create or replace function public.correct_event_financial_transaction(
  p_transaction_id uuid,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_payer_payee text,
  p_source_note text,
  p_payment_method text,
  p_category_id uuid default null,
  p_budget_allocation_category_id uuid default null,
  p_payment_status text default 'paid',
  p_reason text default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_existing public.event_financial_transactions%rowtype;
  v_has_receipt boolean;
  v_expected_key text;
  v_category_name text;
  v_alloc_name text;
  v_status text := coalesce(p_payment_status, 'paid');
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  select * into v_existing
  from public.event_financial_transactions
  where id = p_transaction_id and voided_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Active event transaction not found.';
  end if;

  if not (select private.can_manage_event_finances(v_existing.event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may correct transactions.';
  end if;

  if p_payment_method is distinct from v_existing.payment_method then
    raise exception using errcode = '42501', message = 'Payment method is immutable after creation.';
  end if;

  select exists(
    select 1 from public.finance_receipts where event_transaction_id = p_transaction_id
  ) into v_has_receipt;

  -- Transitioning a bank transfer from non-paid into paid requires a receipt if none exists
  if v_existing.payment_method = 'bank_transfer'
     and v_existing.payment_status <> 'paid'
     and v_status = 'paid'
     and not v_has_receipt then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt required when transitioning bank transfer to paid.';
    end if;

    v_expected_key := 'receipts/event/' || p_transaction_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;

    insert into public.finance_receipts (
      id, scope, event_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event', p_transaction_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt parameters not permitted on this correction.';
    end if;
  end if;

  if p_category_id is not null then
    select name into v_category_name from public.event_finance_categories where id = p_category_id;
  end if;
  if p_budget_allocation_category_id is not null then
    select name into v_alloc_name from public.event_finance_categories where id = p_budget_allocation_category_id;
  end if;

  update public.event_financial_transactions
  set amount_ngn = p_amount_ngn,
      transaction_date = p_transaction_date,
      description = p_description,
      payer_payee = p_payer_payee,
      source_note = p_source_note,
      category_id = p_category_id,
      category_name_snapshot = v_category_name,
      budget_allocation_category_id = p_budget_allocation_category_id,
      budget_allocation_name_snapshot = v_alloc_name,
      payment_status = v_status,
      updated_by = v_actor_id,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_transaction_id;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_corrected', 'event_financial_transaction', p_transaction_id,
    pg_catalog.row_to_json(v_existing)::jsonb,
    pg_catalog.jsonb_build_object('amount_ngn', p_amount_ngn, 'payment_status', v_status),
    p_reason
  );
end;
$$;

-- 7. Recreate record_event_ticket_sale with receipt support
create or replace function public.record_event_ticket_sale(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_buyer_name text,
  p_payment_method text,
  p_idempotency_key uuid,
  p_sale_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns table (
  sale_id uuid,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_sid uuid := coalesce(p_sale_id, gen_random_uuid());
  v_existing public.event_ticket_sales%rowtype;
  v_tier public.event_ticket_tiers%rowtype;
  v_expected_key text;
  v_sold bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_event_id is null or p_tier_id is null or p_quantity is null or p_quantity not between 1 and 1000
     or p_idempotency_key is null
     or (p_buyer_name is not null and (p_buyer_name <> pg_catalog.btrim(p_buyer_name)
       or pg_catalog.char_length(p_buyer_name) not between 1 and 160 or p_buyer_name ~ '[[:cntrl:]]'))
     or p_payment_method not in ('bank_transfer', 'cash') then
    raise exception using errcode = '23514', message = 'The ticket sale values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may record ticket sales.';
  end if;

  -- Replay check
  select s.* into v_existing
  from public.event_ticket_sales as s
  where s.seller_id = v_actor_id and s.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.tier_id = p_tier_id
       and v_existing.buyer_name is not distinct from p_buyer_name
       and v_existing.quantity = p_quantity
       and v_existing.payment_method = p_payment_method then
      return query select v_existing.id, true;
      return;
    else
      raise exception using errcode = '23505', message = 'This submission key was already used for different ticket sale data.';
    end if;
  end if;

  select * into v_tier from public.event_ticket_tiers where id = p_tier_id and event_id = p_event_id;
  if not found then
    raise exception using errcode = '23503', message = 'Ticket tier not found.';
  end if;

  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
  from public.event_ticket_sales as s where s.tier_id = p_tier_id and s.refunded_at is null;
  if v_sold + p_quantity > v_tier.capacity then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;

  if p_payment_method = 'bank_transfer' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata required for bank transfer ticket sales.';
    end if;

    v_expected_key := 'receipts/event_ticket/' || v_sid::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata forbidden for cash ticket sales.';
    end if;
  end if;

  insert into public.event_ticket_sales (
    id, event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, created_at, updated_at
  ) values (
    v_sid, p_event_id, p_tier_id, v_actor_id, p_buyer_name, p_quantity, v_tier.price_ngn,
    p_payment_method, p_idempotency_key, v_now, v_now
  );

  if p_payment_method = 'bank_transfer' then
    insert into public.finance_receipts (
      id, scope, event_ticket_sale_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event_ticket', v_sid, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_recorded', 'event_ticket_sale', v_sid, null,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'tier_id', p_tier_id,
      'quantity', p_quantity, 'unit_price_ngn', v_tier.price_ngn,
      'amount_ngn', v_tier.price_ngn * p_quantity,
      'payment_method', p_payment_method
    ), null
  );

  return query select v_sid, false;
end;
$$;

-- 8. Recreate edit_event_ticket_sale (immutable method)
create or replace function public.edit_event_ticket_sale(
  p_sale_id uuid,
  p_quantity integer,
  p_buyer_name text,
  p_payment_method text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_existing public.event_ticket_sales%rowtype;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  select * into v_existing
  from public.event_ticket_sales
  where id = p_sale_id and refunded_at is null
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Ticket sale not found.';
  end if;

  if not (select private.can_manage_event_finances(v_existing.event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may edit ticket sales.';
  end if;

  if p_payment_method is distinct from v_existing.payment_method then
    raise exception using errcode = '42501', message = 'Payment method is immutable after creation.';
  end if;

  update public.event_ticket_sales
  set quantity = p_quantity,
      buyer_name = p_buyer_name,
      updated_at = pg_catalog.clock_timestamp()
  where id = p_sale_id;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_edited', 'event_ticket_sale', p_sale_id,
    pg_catalog.row_to_json(v_existing)::jsonb,
    pg_catalog.jsonb_build_object('quantity', p_quantity, 'buyer_name', p_buyer_name),
    p_reason
  );
end;
$$;

-- 9. Write guards: reject payment_method mutation
create or replace function private.guard_event_finance_method_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.payment_method is distinct from new.payment_method then
    raise exception using errcode = '42501', message = 'Payment method is immutable after creation.';
  end if;
  return new;
end;
$$;

drop trigger if exists event_financial_transactions_method_guard on public.event_financial_transactions;
create trigger event_financial_transactions_method_guard
before update on public.event_financial_transactions
for each row execute function private.guard_event_finance_method_immutable();

drop trigger if exists event_ticket_sales_method_guard on public.event_ticket_sales;
create trigger event_ticket_sales_method_guard
before update on public.event_ticket_sales
for each row execute function private.guard_event_finance_method_immutable();

revoke all on function public.record_event_financial_transaction from public, anon, service_role;
grant execute on function public.record_event_financial_transaction to authenticated;

revoke all on function public.correct_event_financial_transaction from public, anon, service_role;
grant execute on function public.correct_event_financial_transaction to authenticated;

revoke all on function public.record_event_ticket_sale from public, anon, service_role;
grant execute on function public.record_event_ticket_sale to authenticated;

revoke all on function public.edit_event_ticket_sale from public, anon, service_role;
grant execute on function public.edit_event_ticket_sale to authenticated;
