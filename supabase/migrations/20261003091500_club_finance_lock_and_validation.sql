-- Align category locking with the shared administration lock. Preserve current
-- retired-category snapshots during an audited correction and reject controls.

alter table public.club_financial_transactions
  add constraint club_financial_transactions_text_controls_check check (
    (description is null or description !~ '[[:cntrl:]]')
    and (category_name_snapshot is null or category_name_snapshot !~ '[[:cntrl:]]')
    and (payer_payee is null or payer_payee !~ '[[:cntrl:]]')
    and (source_note is null or source_note !~ '[[:cntrl:]]')
  );

create or replace function private.record_club_financial_transaction(
  p_kind text,
  p_amount_ngn bigint,
  p_transaction_date date,
  p_description text,
  p_category_id uuid,
  p_payer_payee text,
  p_source_note text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_category_name text;
  v_existing public.club_financial_transactions%rowtype;
  v_id uuid;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not ((select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an Executive, Admin, or Backup Admin may record club finances.';
  end if;
  if p_kind is null or p_kind not in ('income', 'expense') or p_amount_ngn is null
      or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
      or p_transaction_date < pg_catalog.make_date(extract(year from v_today)::integer, 1, 1)
      or p_transaction_date > v_today or p_idempotency_key is null then
    raise exception using errcode = '23514', message = 'The financial transaction values are invalid.';
  end if;
  if p_transaction_date <> v_today
      and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter historical transactions.';
  end if;

  -- Use a consistent lock order for category retirement, posting, correction,
  -- and void operations. The idempotency lookup occurs before category status
  -- so an exact retry remains safe even after the category is retired.
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_existing from public.club_financial_transactions as t
    where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.kind = p_kind and v_existing.amount_ngn = p_amount_ngn
      and v_existing.transaction_date = p_transaction_date
      and v_existing.description is not distinct from p_description
      and v_existing.category_id is not distinct from p_category_id
      and v_existing.payer_payee is not distinct from p_payer_payee
      and v_existing.source_note is not distinct from p_source_note then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'This submission key was already used for different financial data.';
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

  insert into public.club_financial_transactions (
    kind, amount_ngn, transaction_date, description, category_id,
    category_name_snapshot, payer_payee, source_note, created_by, idempotency_key
  ) values (
    p_kind, p_amount_ngn, p_transaction_date, p_description, p_category_id,
    v_category_name, p_payer_payee, p_source_note, v_actor_id, p_idempotency_key
  ) returning id into v_id;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'club_finance_recorded', 'club_financial_transaction', v_id, null,
    pg_catalog.jsonb_build_object(
      'kind', p_kind, 'amount_ngn', p_amount_ngn, 'transaction_date', p_transaction_date,
      'description', p_description, 'category_id', p_category_id,
      'category_name', v_category_name, 'payer_payee', p_payer_payee,
      'source_note', p_source_note
    ), 'Initial transaction entry'
  );
  return v_id;
end;
$function$;

create or replace function private.correct_club_financial_transaction(
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
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_reason text := pg_catalog.btrim(p_reason);
  v_transaction public.club_financial_transactions%rowtype;
  v_category_name text;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor_id is null or not (select private.is_active_club_member())
    or not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may correct club financial records.';
  end if;
  if p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A correction reason is required.';
  end if;
  if p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
    or p_transaction_date < pg_catalog.make_date(extract(year from v_today)::integer, 1, 1)
    or p_transaction_date > v_today then
    raise exception using errcode = '23514', message = 'The corrected amount or date is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_transaction from public.club_financial_transactions as t
    where t.id = p_transaction_id and t.voided_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'The financial record is unavailable.'; end if;

  if v_transaction.kind = 'expense' then
    if p_description is null or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
      or p_description <> pg_catalog.btrim(p_description) or p_description ~ '[[:cntrl:]]'
      or p_category_id is null or p_payer_payee is null
      or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
      or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_payer_payee ~ '[[:cntrl:]]'
      or p_source_note is not null then
      raise exception using errcode = '23514', message = 'The corrected expense details are invalid.';
    end if;
    select fc.name into v_category_name from public.finance_categories as fc
      where fc.id = p_category_id
        and (fc.retired_at is null or fc.id = v_transaction.category_id) for share;
    if v_category_name is null then raise exception using errcode = '23503', message = 'The selected category is unavailable.'; end if;
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
      raise exception using errcode = '23514', message = 'The corrected income details are invalid.';
    end if;
  end if;

  v_before := pg_catalog.jsonb_build_object(
    'kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
    'transaction_date', v_transaction.transaction_date, 'description', v_transaction.description,
    'category_id', v_transaction.category_id, 'category_name', v_transaction.category_name_snapshot,
    'payer_payee', v_transaction.payer_payee, 'source_note', v_transaction.source_note
  );
  v_after := pg_catalog.jsonb_build_object(
    'kind', v_transaction.kind, 'amount_ngn', p_amount_ngn,
    'transaction_date', p_transaction_date, 'description', p_description,
    'category_id', p_category_id, 'category_name', v_category_name,
    'payer_payee', p_payer_payee, 'source_note', p_source_note
  );
  update public.club_financial_transactions set
    amount_ngn = p_amount_ngn, transaction_date = p_transaction_date,
    description = p_description, category_id = p_category_id,
    category_name_snapshot = v_category_name, payer_payee = p_payer_payee,
    source_note = p_source_note, updated_at = pg_catalog.clock_timestamp()
  where id = p_transaction_id;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'club_finance_corrected', 'club_financial_transaction', p_transaction_id,
    v_before, v_after, v_reason
  );
end;
$function$;
