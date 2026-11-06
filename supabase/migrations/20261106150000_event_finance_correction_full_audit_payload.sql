-- Keep the correction rules intact while recording the complete saved row in
-- the audit log. This makes the before/after values sufficient to reconstruct
-- what changed during a sensitive financial correction.
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
  v_updated public.event_financial_transactions%rowtype;
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
  where id = p_transaction_id
  returning * into v_updated;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_corrected', 'event_financial_transaction', p_transaction_id,
    pg_catalog.row_to_json(v_existing)::jsonb,
    pg_catalog.row_to_json(v_updated)::jsonb,
    p_reason
  );
end;
$$;
