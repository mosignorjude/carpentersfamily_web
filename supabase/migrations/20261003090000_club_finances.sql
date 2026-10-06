-- Member-visible club ledger with audited officer mutations and derived balance.

create table public.finance_categories (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  retired_at timestamptz,
  retired_by uuid references public.member_profiles (id) on delete restrict,
  retire_reason text,
  constraint finance_categories_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint finance_categories_retirement_fields_check check (
    (retired_at is null and retired_by is null and retire_reason is null)
    or (
      retired_at is not null and retired_by is not null and retire_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(retire_reason)) between 1 and 500
      and retire_reason = pg_catalog.btrim(retire_reason)
    )
  )
);

create unique index finance_categories_active_name_uidx
  on public.finance_categories (pg_catalog.lower(name)) where retired_at is null;

create table public.club_financial_transactions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  kind text not null,
  amount_ngn bigint not null,
  transaction_date date not null,
  description text,
  category_id uuid references public.finance_categories (id) on delete restrict,
  category_name_snapshot text,
  payer_payee text,
  source_note text,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  voided_at timestamptz,
  voided_by uuid references public.member_profiles (id) on delete restrict,
  void_reason text,
  idempotency_key uuid not null,
  constraint club_financial_transactions_kind_check check (kind in ('income', 'expense')),
  constraint club_financial_transactions_amount_check check (amount_ngn between 1 and 1000000000000),
  constraint club_financial_transactions_date_check check (transaction_date >= date '1900-01-01'),
  constraint club_financial_transactions_fields_check check (
    (kind = 'expense'
      and description is not null
      and pg_catalog.char_length(pg_catalog.btrim(description)) between 1 and 500
      and description = pg_catalog.btrim(description)
      and category_id is not null
      and category_name_snapshot is not null
      and payer_payee is not null
      and pg_catalog.char_length(pg_catalog.btrim(payer_payee)) between 1 and 160
      and payer_payee = pg_catalog.btrim(payer_payee)
      and source_note is null)
    or
    (kind = 'income'
      and description is null
      and category_id is null
      and category_name_snapshot is null
      and source_note is not null
      and pg_catalog.char_length(pg_catalog.btrim(source_note)) between 1 and 500
      and source_note = pg_catalog.btrim(source_note)
      and (payer_payee is null or (
        pg_catalog.char_length(pg_catalog.btrim(payer_payee)) between 1 and 160
        and payer_payee = pg_catalog.btrim(payer_payee))))
  ),
  constraint club_financial_transactions_void_fields_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(void_reason)) between 1 and 500
      and void_reason = pg_catalog.btrim(void_reason))
  )
);

create unique index club_financial_transactions_actor_idempotency_uidx
  on public.club_financial_transactions (created_by, idempotency_key);
create index club_financial_transactions_date_idx
  on public.club_financial_transactions (transaction_date desc, created_at desc);
create index club_financial_transactions_category_idx
  on public.club_financial_transactions (category_id, transaction_date desc)
  where category_id is not null;

alter table public.finance_categories enable row level security;
alter table public.finance_categories force row level security;
alter table public.club_financial_transactions enable row level security;
alter table public.club_financial_transactions force row level security;

create policy finance_categories_active_member_read
  on public.finance_categories for select to authenticated
  using ((select private.is_active_club_member()));
create policy club_financial_transactions_active_member_read
  on public.club_financial_transactions for select to authenticated
  using ((select private.is_active_club_member()));

revoke all on table public.finance_categories from public, anon, authenticated, service_role;
grant select (id, name, created_at, retired_at)
  on public.finance_categories to authenticated;
revoke all on table public.club_financial_transactions from public, anon, authenticated, service_role;
grant select (
  id, kind, amount_ngn, transaction_date, description, category_id,
  category_name_snapshot, payer_payee, source_note, created_at, updated_at,
  voided_at, void_reason
) on public.club_financial_transactions to authenticated;

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
  if p_kind not in ('income', 'expense') or p_amount_ngn not between 1 and 1000000000000
      or p_transaction_date is null or p_transaction_date < pg_catalog.make_date(
        extract(year from v_today)::integer, 1, 1)
      or p_transaction_date > v_today or p_idempotency_key is null then
    raise exception using errcode = '23514', message = 'The financial transaction values are invalid.';
  end if;
  if p_transaction_date <> v_today
      and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter historical transactions.';
  end if;
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
        or p_description <> pg_catalog.btrim(p_description)
        or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
        or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_source_note is not null
        or p_category_id is null then
      raise exception using errcode = '23514', message = 'Expense description, category, payer/payee, amount, and date are required.';
    end if;
    select fc.name into v_category_name from public.finance_categories as fc
      where fc.id = p_category_id and fc.retired_at is null for share;
    if v_category_name is null then
      raise exception using errcode = '23503', message = 'The selected category is unavailable.';
    end if;
  elsif p_description is not null or p_category_id is not null or p_payer_payee is not null
      and pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
      or p_payer_payee is not null and p_payer_payee <> pg_catalog.btrim(p_payer_payee)
      or p_source_note is null or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
      or p_source_note <> pg_catalog.btrim(p_source_note) then
    raise exception using errcode = '23514', message = 'Non-dues income requires a source note and cannot have an expense category.';
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
  if p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
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
      or p_description <> pg_catalog.btrim(p_description) or p_category_id is null
      or p_payer_payee is null or pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160
      or p_payer_payee <> pg_catalog.btrim(p_payer_payee) or p_source_note is not null then
      raise exception using errcode = '23514', message = 'The corrected expense details are invalid.';
    end if;
    select fc.name into v_category_name from public.finance_categories as fc
      where fc.id = p_category_id
        and (fc.retired_at is null or fc.id = v_transaction.category_id) for share;
    if v_category_name is null then raise exception using errcode = '23503', message = 'The selected category is unavailable.'; end if;
  else
    if p_description is not null or p_category_id is not null or p_payer_payee is not null
      and (pg_catalog.char_length(pg_catalog.btrim(p_payer_payee)) not between 1 and 160 or p_payer_payee <> pg_catalog.btrim(p_payer_payee))
      or p_source_note is null or pg_catalog.char_length(pg_catalog.btrim(p_source_note)) not between 1 and 500
      or p_source_note <> pg_catalog.btrim(p_source_note) then
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

create or replace function private.void_club_financial_transaction(p_transaction_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_transaction public.club_financial_transactions%rowtype;
begin
  if v_actor_id is null or not (select private.is_active_club_member())
    or not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may void club financial records.';
  end if;
  if p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A void reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_transaction from public.club_financial_transactions as t
    where t.id = p_transaction_id and t.voided_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'The financial record is unavailable.'; end if;
  update public.club_financial_transactions set
    voided_at = pg_catalog.clock_timestamp(), voided_by = v_actor_id, void_reason = v_reason,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_transaction_id;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id, 'club_finance_voided', 'club_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date, 'voided_at', null),
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date, 'voided_at', pg_catalog.clock_timestamp()),
    v_reason
  );
end;
$function$;

create or replace function private.create_finance_category(p_name text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(p_name);
  v_reason text := pg_catalog.btrim(p_reason);
  v_id uuid;
begin
  if v_actor_id is null or not (select private.is_active_club_member())
    or not ((select private.has_club_role('executive')) or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may manage categories.';
  end if;
  if p_name is null or pg_catalog.char_length(v_name) not between 2 and 80 or v_name ~ '[[:cntrl:]]'
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A valid category name and reason are required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  insert into public.finance_categories (name, created_by) values (v_name, v_actor_id) returning id into v_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, after_data, reason)
    values (v_actor_id, 'finance_category_created', 'finance_category', v_id,
      pg_catalog.jsonb_build_object('name', v_name), v_reason);
  return v_id;
end;
$function$;

create or replace function private.retire_finance_category(p_category_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_category public.finance_categories%rowtype;
begin
  if v_actor_id is null or not (select private.is_active_club_member())
    or not ((select private.has_club_role('executive')) or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only an active Executive, Admin, or Backup Admin may manage categories.';
  end if;
  if p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A category retirement reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select c.* into v_category from public.finance_categories as c where c.id = p_category_id and c.retired_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'The category is unavailable.'; end if;
  update public.finance_categories set retired_at = pg_catalog.clock_timestamp(), retired_by = v_actor_id,
    retire_reason = v_reason where id = p_category_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
    values (v_actor_id, 'finance_category_retired', 'finance_category', p_category_id,
      pg_catalog.jsonb_build_object('name', v_category.name, 'retired_at', null),
      pg_catalog.jsonb_build_object('name', v_category.name, 'retired_at', pg_catalog.clock_timestamp()), v_reason);
end;
$function$;

create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select private.club_dues_income_total()), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'income' and t.voided_at is null), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric,
    coalesce((select private.club_dues_income_total()), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
  where (select private.is_active_club_member());
$function$;

create or replace function public.record_club_financial_transaction(
  p_kind text, p_amount_ngn bigint, p_transaction_date date, p_description text,
  p_category_id uuid, p_payer_payee text, p_source_note text, p_idempotency_key uuid
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.record_club_financial_transaction(p_kind, p_amount_ngn, p_transaction_date,
    p_description, p_category_id, p_payer_payee, p_source_note, p_idempotency_key);
$function$;

create or replace function public.correct_club_financial_transaction(
  p_transaction_id uuid, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_category_id uuid, p_payer_payee text, p_source_note text, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.correct_club_financial_transaction(p_transaction_id, p_amount_ngn,
    p_transaction_date, p_description, p_category_id, p_payer_payee, p_source_note, p_reason);
$function$;

create or replace function public.void_club_financial_transaction(p_transaction_id uuid, p_reason text)
returns void language sql security invoker set search_path = '' as $function$
  select private.void_club_financial_transaction(p_transaction_id, p_reason);
$function$;

create or replace function public.create_finance_category(p_name text, p_reason text)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.create_finance_category(p_name, p_reason);
$function$;

create or replace function public.retire_finance_category(p_category_id uuid, p_reason text)
returns void language sql security invoker set search_path = '' as $function$
  select private.retire_finance_category(p_category_id, p_reason);
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql security invoker set search_path = '' as $function$
  select * from private.club_finance_summary();
$function$;

revoke all on function private.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid) from public, anon, service_role;
revoke all on function private.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text) from public, anon, service_role;
revoke all on function private.void_club_financial_transaction(uuid, text) from public, anon, service_role;
revoke all on function private.create_finance_category(text, text) from public, anon, service_role;
revoke all on function private.retire_finance_category(uuid, text) from public, anon, service_role;
revoke all on function private.club_finance_summary() from public, anon, service_role;
revoke all on function public.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid) from public, anon, service_role;
revoke all on function public.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text) from public, anon, service_role;
revoke all on function public.void_club_financial_transaction(uuid, text) from public, anon, service_role;
revoke all on function public.create_finance_category(text, text) from public, anon, service_role;
revoke all on function public.retire_finance_category(uuid, text) from public, anon, service_role;
revoke all on function public.club_finance_summary() from public, anon, service_role;
grant execute on function private.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid) to authenticated;
grant execute on function private.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text) to authenticated;
grant execute on function private.void_club_financial_transaction(uuid, text) to authenticated;
grant execute on function private.create_finance_category(text, text) to authenticated;
grant execute on function private.retire_finance_category(uuid, text) to authenticated;
grant execute on function private.club_finance_summary() to authenticated;
grant execute on function public.record_club_financial_transaction(text, bigint, date, text, uuid, text, text, uuid) to authenticated;
grant execute on function public.correct_club_financial_transaction(uuid, bigint, date, text, uuid, text, text, text) to authenticated;
grant execute on function public.void_club_financial_transaction(uuid, text) to authenticated;
grant execute on function public.create_finance_category(text, text) to authenticated;
grant execute on function public.retire_finance_category(uuid, text) to authenticated;
grant execute on function public.club_finance_summary() to authenticated;
