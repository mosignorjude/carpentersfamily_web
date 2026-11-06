-- Preserve the historical category snapshot when correcting an expense whose
-- category has since been retired. Reclassification still requires an active
-- category. Also remove obsolete receipt RPCs that referenced the dropped
-- event_financial_receipts table after finance_receipts became the sole ledger.

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
  v_category_retired_at timestamptz;
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

    select fc.name, fc.retired_at into v_category_name, v_category_retired_at
    from public.finance_categories as fc
    where fc.id = p_category_id
    for share;

    if not found then
      raise exception using errcode = '23503', message = 'The selected category is unavailable.';
    end if;

    if v_category_retired_at is not null then
      if p_category_id is distinct from v_existing.category_id then
        raise exception using errcode = '23503', message = 'The selected category is unavailable.';
      end if;
      v_category_name := coalesce(v_existing.category_name_snapshot, v_category_name);
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

-- The unified public.finance_receipts table and get_finance_receipt_download
-- RPC replaced this old event-specific upload flow. Remove its exposed wrappers
-- before removing the private implementations.
drop function if exists public.reserve_event_finance_receipt(uuid, uuid, text, text, integer);
drop function if exists public.finalize_event_finance_receipt(uuid, text);
drop function if exists public.fail_event_finance_receipt_upload(uuid);
drop function if exists public.get_event_finance_receipt_download(uuid);

drop function if exists private.reserve_event_finance_receipt(uuid, uuid, text, text, integer);
drop function if exists private.finalize_event_finance_receipt(uuid, text);
drop function if exists private.fail_event_finance_receipt_upload(uuid);
drop function if exists private.get_event_finance_receipt_download(uuid);
