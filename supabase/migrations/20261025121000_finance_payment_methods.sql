-- 1. Add payment_method to club_financial_transactions
alter table public.club_financial_transactions
  add column if not exists payment_method text;

alter table public.club_financial_transactions
  drop constraint if exists club_financial_transactions_payment_method_check;

alter table public.club_financial_transactions
  add constraint club_financial_transactions_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'cash')) not valid;

grant select (payment_method) on public.club_financial_transactions to authenticated;

-- 2. Preflight idempotency helper
create or replace function public.find_finance_entry_id(
  p_scope text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_key_uuid uuid;
  v_found_id uuid;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    return null;
  end if;

  begin
    v_key_uuid := p_idempotency_key::uuid;
  exception when others then
    return null;
  end;

  if p_scope = 'club' then
    select id into v_found_id
    from public.club_financial_transactions
    where created_by = v_actor_id and idempotency_key = v_key_uuid;
  elsif p_scope = 'event' then
    select id into v_found_id
    from public.event_financial_transactions
    where created_by = v_actor_id and idempotency_key = v_key_uuid;
  elsif p_scope = 'event_ticket' then
    select id into v_found_id
    from public.event_ticket_sales
    where seller_id = v_actor_id and idempotency_key = v_key_uuid;
  end if;

  return v_found_id;
end;
$$;

revoke all on function public.find_finance_entry_id(text, text) from public, anon, service_role;
grant execute on function public.find_finance_entry_id(text, text) to authenticated;

-- 3. Drop old club transaction functions to avoid overload ambiguity
drop function if exists public.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid);
drop function if exists private.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid);
drop function if exists public.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text);
drop function if exists private.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text);

-- 4. Recreate record_club_financial_transaction with atomic receipt insertion
create or replace function public.record_club_financial_transaction(
  p_kind text,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_category_id uuid,
  p_payer_payee text,
  p_source_note text,
  p_idempotency_key uuid,
  p_payment_method text,
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
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_category_name text;
  v_existing public.club_financial_transactions%rowtype;
  v_expected_key text;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an Executive, Admin, or Backup Admin may record club finances.';
  end if;

  if p_payment_method not in ('bank_transfer', 'cash') then
    raise exception using errcode = '22023', message = 'Payment method must be bank_transfer or cash.';
  end if;

  if p_kind is null or p_kind not in ('income', 'expense') or p_amount_ngn is null
      or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
      or p_transaction_date < pg_catalog.make_date(extract(year from v_today)::integer, 1, 1)
      or p_transaction_date > v_today or p_idempotency_key is null then
    raise exception using errcode = '23514', message = 'The financial transaction values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  ) then
    raise exception using errcode = '42501', message = 'Only an Executive, Admin, or Backup Admin may record club finances.';
  end if;

  if p_transaction_date <> v_today
      and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter historical transactions.';
  end if;

  -- Same-value idempotency replay check
  select t.* into v_existing
  from public.club_financial_transactions as t
  where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.kind = p_kind
       and v_existing.amount_ngn = p_amount_ngn
       and v_existing.transaction_date = p_transaction_date
       and v_existing.description is not distinct from p_description
       and v_existing.category_id is not distinct from p_category_id
       and v_existing.payer_payee is not distinct from p_payer_payee
       and v_existing.source_note is not distinct from p_source_note
       and v_existing.payment_method is not distinct from p_payment_method then
      return query select v_existing.id, true;
      return;
    else
      raise exception using errcode = '23505', message = 'This submission key was already used for different financial data.';
    end if;
  end if;

  if p_kind = 'expense' then
    if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
        or p_description <> pg_catalog.btrim(p_description) or p_description ~ '[[:cntrl:]]'
        or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
        or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_payer_payee ~ '[[:cntrl:]]'
        or p_source_note is not null or p_category_id is null then
      raise exception using errcode = '23514', message = 'Expense description, category, payer/payee, amount, and date are required.';
    end if;
    select fc.name into v_category_name from public.finance_categories as fc
      where fc.id = p_category_id and fc.retired_at is null for share;
    if v_category_name is null then
      raise exception using errcode = '23503', message = 'The selected category is unavailable.';
    end if;
  else
    if p_description is not null or p_category_id is not null
        or (p_payer_payee is not null and (
          pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
          or p_payer_payee <> pg_catalog.btrim(p_payer_payee)
          or p_payer_payee ~ '[[:cntrl:]]'))
        or p_source_note is null
        or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
        or p_source_note <> pg_catalog.btrim(p_source_note)
        or p_source_note ~ '[[:cntrl:]]' then
      raise exception using errcode = '23514', message = 'Non-dues income requires a source note and cannot have an expense category.';
    end if;
  end if;

  -- Validate receipt requirements: club transactions are always paid
  if p_payment_method = 'bank_transfer' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata is required for paid bank transfers.';
    end if;

    v_expected_key := 'receipts/club/' || v_tx_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key does not match transaction and receipt IDs.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata must not be provided for cash transactions.';
    end if;
  end if;

  insert into public.club_financial_transactions (
    id, kind, amount_ngn, transaction_date, description, category_id,
    category_name_snapshot, payer_payee, source_note, created_by, idempotency_key, payment_method
  ) values (
    v_tx_id, p_kind, p_amount_ngn, p_transaction_date, p_description, p_category_id,
    v_category_name, p_payer_payee, p_source_note, v_actor_id, p_idempotency_key, p_payment_method
  );

  if p_payment_method = 'bank_transfer' then
    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'club', v_tx_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'club_finance_recorded', 'club_financial_transaction', v_tx_id, null,
    pg_catalog.jsonb_build_object(
      'kind', p_kind, 'amount_ngn', p_amount_ngn, 'transaction_date', p_transaction_date,
      'description', p_description, 'category_id', p_category_id,
      'category_name', v_category_name, 'payer_payee', p_payer_payee,
      'source_note', p_source_note, 'payment_method', p_payment_method
    ), 'Initial transaction entry'
  );

  return query select v_tx_id, false;
end;
$$;

-- 5. Recreate correct_club_financial_transaction (immutable payment method)
create or replace function public.correct_club_financial_transaction(
  p_transaction_id uuid,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_category_id uuid,
  p_payer_payee text,
  p_source_note text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_existing public.club_financial_transactions%rowtype;
  v_category_name text;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may correct a transaction.';
  end if;

  if p_transaction_id is null or p_amount_ngn is null
      or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
      or p_transaction_date < pg_catalog.make_date(extract(year from v_today)::integer, 1, 1)
      or p_transaction_date > v_today or p_reason is null
      or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500
      or p_reason <> pg_catalog.btrim(p_reason) or p_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The correction values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may correct a transaction.';
  end if;

  select t.* into v_existing from public.club_financial_transactions as t
    where t.id = p_transaction_id for update;
  if not found or v_existing.voided_at is not null then
    raise exception using errcode = '42501', message = 'Active transaction not found.';
  end if;

  if v_existing.kind = 'expense' then
    if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
        or p_description <> pg_catalog.btrim(p_description) or p_description ~ '[[:cntrl:]]'
        or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
        or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_payer_payee ~ '[[:cntrl:]]'
        or p_source_note is not null or p_category_id is null then
      raise exception using errcode = '23514', message = 'Expense description, category, payer/payee, amount, and date are required.';
    end if;
    select fc.name into v_category_name from public.finance_categories as fc
      where fc.id = p_category_id and fc.retired_at is null for share;
    if v_category_name is null then
      raise exception using errcode = '23503', message = 'The selected category is unavailable.';
    end if;
  else
    if p_description is not null or p_category_id is not null
        or (p_payer_payee is not null and (
          pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
          or p_payer_payee <> pg_catalog.btrim(p_payer_payee)
          or p_payer_payee ~ '[[:cntrl:]]'))
        or p_source_note is null
        or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
        or p_source_note <> pg_catalog.btrim(p_source_note)
        or p_source_note ~ '[[:cntrl:]]' then
      raise exception using errcode = '23514', message = 'Non-dues income requires a source note and cannot have an expense category.';
    end if;
  end if;

  update public.club_financial_transactions set
    amount_ngn = p_amount_ngn,
    transaction_date = p_transaction_date,
    description = p_description,
    category_id = p_category_id,
    category_name_snapshot = v_category_name,
    payer_payee = p_payer_payee,
    source_note = p_source_note,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_transaction_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'club_finance_corrected', 'club_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object(
      'amount_ngn', v_existing.amount_ngn, 'transaction_date', v_existing.transaction_date,
      'description', v_existing.description, 'category_id', v_existing.category_id,
      'category_name', v_existing.category_name_snapshot, 'payer_payee', v_existing.payer_payee,
      'source_note', v_existing.source_note, 'payment_method', v_existing.payment_method
    ),
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn, 'transaction_date', p_transaction_date,
      'description', p_description, 'category_id', p_category_id,
      'category_name', v_category_name, 'payer_payee', p_payer_payee,
      'source_note', p_source_note, 'payment_method', v_existing.payment_method
    ),
    p_reason
  );
end;
$$;

-- 6. Attach extra receipt RPC
create or replace function public.attach_finance_receipt(
  p_scope text,
  p_target_id uuid,
  p_receipt_id uuid,
  p_object_key text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes integer,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_expected_key text;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_scope not in ('club', 'event', 'event_ticket') then
    raise exception using errcode = '22023', message = 'Extra receipts can only be attached to club, event, or ticket records.';
  end if;

  v_expected_key := 'receipts/' || p_scope || '/' || p_target_id::text || '/' || p_receipt_id::text || '.' ||
    case p_content_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      else 'bin'
    end;

  if p_object_key <> v_expected_key then
    raise exception using errcode = '22023', message = 'Object key mismatch.';
  end if;

  if p_scope = 'club' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('executive'))
    ) then
      raise exception using errcode = '42501', message = 'Officer permissions required.';
    end if;

    perform 1 from public.club_financial_transactions
    where id = p_target_id and voided_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target club transaction not found or voided.';
    end if;

    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'club', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );

  elsif p_scope = 'event' then
    perform 1 from public.event_financial_transactions
    where id = p_target_id and voided_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target event transaction not found or voided.';
    end if;

    insert into public.finance_receipts (
      id, scope, event_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );

  elsif p_scope = 'event_ticket' then
    perform 1 from public.event_ticket_sales
    where id = p_target_id and refunded_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target ticket sale not found or refunded.';
    end if;

    insert into public.finance_receipts (
      id, scope, event_ticket_sale_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event_ticket', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after_data, reason
  ) values (
    v_actor_id, 'finance_receipt_attached', 'finance_receipt', p_receipt_id,
    pg_catalog.jsonb_build_object('scope', p_scope, 'target_id', p_target_id, 'object_key', p_object_key),
    'Attached additional receipt evidence.'
  );
end;
$$;

revoke all on function public.record_club_financial_transaction from public, anon, service_role;
grant execute on function public.record_club_financial_transaction to authenticated;

revoke all on function public.correct_club_financial_transaction from public, anon, service_role;
grant execute on function public.correct_club_financial_transaction to authenticated;

revoke all on function public.attach_finance_receipt from public, anon, service_role;
grant execute on function public.attach_finance_receipt to authenticated;
