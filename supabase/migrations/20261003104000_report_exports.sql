-- Report requests are logged without copying report content or member dues data.
create or replace function public.club_finance_report_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with report_period as (
    select
      (pg_catalog.transaction_timestamp() at time zone 'Africa/Lagos')::date as as_of
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
    'transactions', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', transaction_rows.id,
            'kind', transaction_rows.kind,
            'amount_ngn', transaction_rows.amount_ngn,
            'transaction_date', transaction_rows.transaction_date,
            'description', transaction_rows.description,
            'category_name_snapshot', transaction_rows.category_name_snapshot,
            'payer_payee', transaction_rows.payer_payee,
            'source_note', transaction_rows.source_note,
            'voided_at', transaction_rows.voided_at,
            'void_reason', transaction_rows.void_reason
          )
          order by transaction_rows.transaction_date,
            transaction_rows.created_at, transaction_rows.id
        )
        from transaction_rows
      ),
      '[]'::jsonb
    )
  )
  from bounds
  where (select private.is_active_club_member());
$function$;

create or replace function public.dues_report_data()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with report_period as (
    select
      (pg_catalog.transaction_timestamp() at time zone 'Africa/Lagos')::date as as_of
  ),
  bounds as (
    select
      extract(year from report_period.as_of)::integer as report_year,
      pg_catalog.date_trunc('year', report_period.as_of::timestamp)::date as period_start,
      report_period.as_of,
      (pg_catalog.date_trunc('year', report_period.as_of::timestamp) + interval '1 year')::date as next_year
    from report_period
  ),
  dues_rows as (
    select
      dues_status.member_id,
      profile.full_name,
      profile.username,
      dues_status.covered_month::text as covered_month,
      dues_status.amount_ngn::text as amount_ngn,
      dues_status.status,
      dues_status.due_date::text as due_date,
      (dues_status.status = 'unpaid' and dues_status.due_date < bounds.as_of) as is_overdue
    from public.dues_month_status as dues_status
    join public.member_profiles as profile on profile.id = dues_status.member_id
    cross join bounds
    where dues_status.covered_month >= bounds.period_start
      and dues_status.covered_month < bounds.next_year
    order by dues_status.member_id, dues_status.covered_month
    limit 1001
  )
  select pg_catalog.jsonb_build_object(
    'year', bounds.report_year,
    'as_of', bounds.as_of::text,
    'row_count', (
      select pg_catalog.count(*)::text
      from public.dues_month_status as dues_status
      where dues_status.covered_month >= bounds.period_start
        and dues_status.covered_month < bounds.next_year
    ),
    'rows', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'member_id', dues_rows.member_id,
            'full_name', dues_rows.full_name,
            'username', dues_rows.username,
            'covered_month', dues_rows.covered_month,
            'amount_ngn', dues_rows.amount_ngn,
            'status', dues_rows.status,
            'due_date', dues_rows.due_date,
            'is_overdue', dues_rows.is_overdue
          )
          order by dues_rows.member_id, dues_rows.covered_month
        )
        from dues_rows
      ),
      '[]'::jsonb
    )
  )
  from bounds
  where (select private.is_active_club_member());
$function$;

create or replace function private.log_report_export(
  p_report_type text,
  p_format text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;
  if p_report_type is null or p_format is null
     or p_report_type not in ('finances', 'dues')
     or p_format not in ('csv', 'pdf') then
    raise exception using errcode = '23514', message = 'The report request is invalid.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after_data, reason
  ) values (
    v_actor_id,
    'report_export_requested',
    'report',
    pg_catalog.gen_random_uuid(),
    pg_catalog.jsonb_build_object('report_type', p_report_type, 'format', p_format),
    'Authenticated member requested a report export.'
  );
end;
$function$;

create or replace function public.log_report_export(
  p_report_type text,
  p_format text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.log_report_export(p_report_type, p_format);
$function$;

revoke all on function private.log_report_export(text, text)
  from public, anon, service_role;
revoke all on function public.log_report_export(text, text)
  from public, anon, service_role;
revoke all on function public.club_finance_report_data()
  from public, anon, service_role;
revoke all on function public.dues_report_data()
  from public, anon, service_role;
grant execute on function private.log_report_export(text, text) to authenticated;
grant execute on function public.log_report_export(text, text) to authenticated;
grant execute on function public.club_finance_report_data() to authenticated;
grant execute on function public.dues_report_data() to authenticated;
