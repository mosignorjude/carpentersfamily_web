-- Recreate record_event_financial_transaction to permit revenue categories on income transactions
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
    -- Income (Revenue): p_description is forbidden, p_budget_allocation_category_id is forbidden, source_note is required
    if p_description is not null
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
    select name into v_category_name from public.event_finance_categories
    where id = p_category_id and (
      (p_kind = 'income' and category_type = 'revenue')
      or (p_kind = 'expense' and category_type in ('expense', 'budget_allocation'))
    );
    if v_category_name is null then
      raise exception using errcode = '23503', message = 'Selected event finance category is invalid or of incompatible type.';
    end if;
  end if;

  if p_budget_allocation_category_id is not null then
    select name into v_alloc_name from public.event_finance_categories
    where id = p_budget_allocation_category_id and category_type = 'budget_allocation';
    if v_alloc_name is null then
      raise exception using errcode = '23503', message = 'Selected budget allocation category is invalid.';
    end if;
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

revoke all on function public.record_event_financial_transaction from public, anon, service_role;
grant execute on function public.record_event_financial_transaction to authenticated;
