-- Keep rate-scheduled future months visible as unpaid until they are covered.
-- User-entered prepayments beyond the scheduled rate horizon still appear via
-- their current month dispositions.
create or replace view public.dues_month_status
with (security_invoker = true)
as
with current_month as (
  select date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date as month_start
),
schedule_horizon as (
  select
    cm.month_start,
    greatest(cm.month_start, coalesce(max(dr.effective_month), cm.month_start)) as last_month
  from current_month as cm
  left join public.dues_rates as dr on true
  group by cm.month_start
),
first_configured_month as (
  select min(dr.effective_month) as month_start
  from public.dues_rates as dr
),
eligible_months as (
  select
    dmp.member_id,
    generated.month_start::date as covered_month
  from public.dues_membership_periods as dmp
  cross join schedule_horizon as horizon
  cross join first_configured_month as first_month
  cross join lateral pg_catalog.generate_series(
    greatest(dmp.starts_month, first_month.month_start)::timestamp,
    least(
      coalesce(dmp.ends_before_month - interval '1 month', horizon.last_month),
      horizon.last_month
    )::timestamp,
    interval '1 month'
  ) as generated(month_start)
  where dmp.starts_month <= horizon.last_month
),
all_months as (
  select member_id, covered_month from eligible_months
  union
  select member_id, covered_month
  from public.dues_month_dispositions
  where is_current
)
select
  all_months.member_id,
  all_months.covered_month,
  coalesce(disposition.amount_ngn, rate.monthly_amount_ngn) as amount_ngn,
  coalesce(disposition.disposition, 'unpaid') as status,
  (
    all_months.covered_month + interval '1 month' - interval '1 day'
  )::date as due_date,
  (
    disposition.id is null
    and (
      all_months.covered_month + interval '1 month' - interval '1 day'
    )::date < (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date
  ) as is_overdue
from all_months
left join public.dues_month_dispositions as disposition
  on disposition.member_id = all_months.member_id
 and disposition.covered_month = all_months.covered_month
 and disposition.is_current
left join lateral (
  select dr.monthly_amount_ngn
  from public.dues_rates as dr
  where dr.effective_month <= all_months.covered_month
  order by dr.effective_month desc
  limit 1
) as rate on true;
