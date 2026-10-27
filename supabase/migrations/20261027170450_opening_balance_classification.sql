-- Opening treasury cash is a balance sheet starting point, not current-period income.
alter table public.club_financial_transactions
  add column is_opening_balance boolean not null default false;

alter table public.club_financial_transactions
  add constraint club_financial_transactions_opening_balance_kind_check
  check (not is_opening_balance or kind = 'income');

-- The existing write guard is intended for member-authenticated mutations. This
-- migration-only backfill marks already-recorded opening reserve rows.
alter table public.club_financial_transactions
  disable trigger club_financial_transactions_write_guard;

update public.club_financial_transactions
set is_opening_balance = true
where kind = 'income'
  and payer_payee = 'Club Treasury Opening Reserve';

alter table public.club_financial_transactions
  enable trigger club_financial_transactions_write_guard;

create unique index club_financial_transactions_one_active_opening_balance_uidx
  on public.club_financial_transactions (is_opening_balance)
  where is_opening_balance and voided_at is null;

grant select (is_opening_balance)
  on public.club_financial_transactions to authenticated;

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
      where t.kind = 'income' and t.is_opening_balance is false and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn > 0), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(-le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn < 0), 0)::numeric,
    coalesce((select pg_catalog.sum(dp.amount_ngn) from public.dues_payments as dp
      where dp.payment_method is distinct from 'pre_launch_reconciliation'), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le), 0)::numeric
  where (select private.is_active_club_member());
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.club_finance_summary();
$function$;

create or replace function public.record_club_opening_balance(
  p_amount_ngn bigint,
  p_transaction_date date,
  p_source_note text,
  p_idempotency_key uuid,
  p_transaction_id uuid default null
)
returns table (transaction_id uuid, deduplicated boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction_id uuid;
  v_deduplicated boolean;
  v_is_opening_balance boolean;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if not ((select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may record the opening balance.';
  end if;

  select recorded.transaction_id, recorded.deduplicated
    into v_transaction_id, v_deduplicated
  from public.record_club_financial_transaction(
    p_kind => 'income',
    p_amount_ngn => p_amount_ngn,
    p_transaction_date => p_transaction_date,
    p_description => null,
    p_category_id => null,
    p_payer_payee => 'Club Treasury Opening Reserve',
    p_source_note => p_source_note,
    p_idempotency_key => p_idempotency_key,
    p_payment_method => 'cash',
    p_transaction_id => p_transaction_id
  ) as recorded;

  select t.is_opening_balance into v_is_opening_balance
  from public.club_financial_transactions as t
  where t.id = v_transaction_id and t.created_by = v_actor_id and t.kind = 'income'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'The opening balance transaction could not be verified.';
  end if;

  if not v_is_opening_balance then
    update public.club_financial_transactions as t
    set is_opening_balance = true
    where t.id = v_transaction_id and t.created_by = v_actor_id;

    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, before_data, after_data, reason
    ) values (
      v_actor_id,
      'club_opening_balance_classified',
      'club_financial_transaction',
      v_transaction_id,
      pg_catalog.jsonb_build_object('is_opening_balance', false),
      pg_catalog.jsonb_build_object(
        'is_opening_balance', true,
        'amount_ngn', p_amount_ngn,
        'transaction_date', p_transaction_date
      ),
      'Opening treasury cash is a starting balance, not current-period income.'
    );
  end if;

  return query select v_transaction_id, v_deduplicated;
end;
$function$;

revoke all on function public.record_club_opening_balance(bigint, date, text, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.record_club_opening_balance(bigint, date, text, uuid, uuid)
  to authenticated;

-- Keep the financial report detail export explicit about opening cash too.
create or replace function public.club_finance_report_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with report_period as (
    select (pg_catalog.transaction_timestamp() at time zone 'Africa/Lagos')::date as as_of
  ),
  bounds as (
    select
      extract(year from report_period.as_of)::integer as report_year,
      pg_catalog.date_trunc('year', report_period.as_of::timestamp)::date as period_start,
      report_period.as_of,
      (pg_catalog.date_trunc('year', report_period.as_of::timestamp) + interval '1 year')::date as next_year
    from report_period
  ),
  transaction_rows as (
    select
      finance_txn.id,
      finance_txn.kind,
      finance_txn.is_opening_balance,
      finance_txn.amount_ngn::text as amount_ngn,
      finance_txn.transaction_date::text as transaction_date,
      finance_txn.description,
      finance_txn.category_name_snapshot,
      finance_txn.payer_payee,
      finance_txn.source_note,
      finance_txn.voided_at::text as voided_at,
      finance_txn.void_reason,
      finance_txn.created_at
    from public.club_financial_transactions as finance_txn
    cross join bounds
    where finance_txn.transaction_date >= bounds.period_start
      and finance_txn.transaction_date < bounds.next_year
    order by finance_txn.transaction_date, finance_txn.created_at, finance_txn.id
    limit 1001
  )
  select pg_catalog.jsonb_build_object(
    'year', bounds.report_year,
    'as_of', bounds.as_of::text,
    'row_count', (
      select pg_catalog.count(*)::text
      from public.club_financial_transactions as finance_txn
      where finance_txn.transaction_date >= bounds.period_start
        and finance_txn.transaction_date < bounds.next_year
    ),
    'summary', (
      select pg_catalog.jsonb_build_object(
        'dues_income', summary.dues_income::text,
        'other_income', summary.other_income::text,
        'expenses', summary.expenses::text,
        'balance', summary.balance::text
      )
      from public.club_finance_summary() as summary
    ),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', transaction_rows.id,
          'kind', transaction_rows.kind,
          'is_opening_balance', transaction_rows.is_opening_balance,
          'amount_ngn', transaction_rows.amount_ngn,
          'transaction_date', transaction_rows.transaction_date,
          'description', transaction_rows.description,
          'category_name_snapshot', transaction_rows.category_name_snapshot,
          'payer_payee', transaction_rows.payer_payee,
          'source_note', transaction_rows.source_note,
          'voided_at', transaction_rows.voided_at,
          'void_reason', transaction_rows.void_reason
        )
        order by transaction_rows.transaction_date, transaction_rows.created_at, transaction_rows.id
      )
      from transaction_rows
    ), '[]'::jsonb)
  )
  from bounds
  where (select private.is_active_club_member());
$function$;
