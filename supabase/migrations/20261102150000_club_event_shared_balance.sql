-- One bank account backs club and event money. Event cash is club money from
-- the moment it moves, so the club balance reads it live instead of waiting for
-- the end-of-event ledger posting. This helper is the single definition of
-- "event cash" for the live summary and for the closing snapshot, so the two
-- cannot drift apart.

create or replace function private.event_cash_totals(p_event_id uuid)
returns table (inflow numeric, outflow numeric, net numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select totals.v_inflow, totals.v_outflow, totals.v_inflow - totals.v_outflow
  from (
    select
      (
        coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
          from public.event_financial_transactions as t
          where t.kind = 'income' and t.payment_status = 'paid'
            and t.voided_at is null
            and (p_event_id is null or t.event_id = p_event_id)), 0::numeric)
        + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
          from public.event_ticket_sales as s
          where s.refunded_at is null
            and (p_event_id is null or s.event_id = p_event_id)), 0::numeric)
      )::numeric as v_inflow,
      coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
        from public.event_financial_transactions as t
        where t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
          and t.voided_at is null
          and (p_event_id is null or t.event_id = p_event_id)), 0::numeric
      )::numeric as v_outflow
  ) as totals;
$function$;

revoke all on function private.event_cash_totals(uuid)
  from public, anon, authenticated, service_role;

-- The closing posting now reads the same helper. Its generation, entry_kind,
-- event_status, created_by, audit rows and append-only guard dance are
-- unchanged; only the arithmetic source moves.
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
    select cash.net::numeric(30, 0) into v_signed_amount
      from private.event_cash_totals(new.id) as cash;
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

-- The club formula. Event postings are no longer summed anywhere in it; live
-- event cash is, as its own inflow and outflow lines. The return type changed,
-- so the old four-column functions are dropped and their grants re-applied.
drop function if exists public.club_finance_summary();
drop function if exists private.club_finance_summary();
drop function if exists private.club_finance_summary_core();

create or replace function private.club_finance_summary_core()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select private.club_dues_income_total()), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'income' and t.is_opening_balance is false and t.voided_at is null), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric,
    cash.inflow,
    cash.outflow,
    coalesce((select pg_catalog.sum(dp.amount_ngn) from public.dues_payments as dp
      where dp.payment_method is distinct from 'pre_launch_reconciliation'), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + cash.net
  from private.event_cash_totals(null::uuid) as cash;
$function$;

create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select summary.* from private.club_finance_summary_core() as summary
  where (select private.is_active_club_member());
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric,
  event_inflow numeric, event_outflow numeric, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.club_finance_summary();
$function$;

revoke all on function private.club_finance_summary_core()
  from public, anon, authenticated, service_role;
revoke all on function private.club_finance_summary()
  from public, anon, service_role;
revoke all on function public.club_finance_summary()
  from public, anon, service_role;
grant execute on function private.club_finance_summary() to authenticated;
grant execute on function public.club_finance_summary() to authenticated;

-- The export snapshot reports event cash as its own lines. It stays SECURITY
-- INVOKER, so the member gate and every grant still apply, and its transaction
-- list stays club-only.
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
        'event_inflow', summary.event_inflow::text,
        'event_outflow', summary.event_outflow::text,
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

-- The summary RPC changed row shape; without this PostgREST keeps serving the
-- four-column signature.
notify pgrst, 'reload schema';
