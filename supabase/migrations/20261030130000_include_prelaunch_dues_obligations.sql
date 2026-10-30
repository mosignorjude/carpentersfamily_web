-- Include the pre-launch dues window for active, non-admin members even when
-- their formal membership period starts at the October 2026 launch. Historical
-- reconciliation dispositions then determine which months remain unpaid.

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
membership_months as (
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
    and not exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = dmp.member_id
        and mra.role = 'admin'
        and mra.revoked_at is null
    )
),
prelaunch_months as (
  select
    profile.id as member_id,
    generated.month_start::date as covered_month
  from public.member_profiles as profile
  cross join lateral pg_catalog.generate_series(
    date '2026-02-01'::timestamp,
    date '2026-09-01'::timestamp,
    interval '1 month'
  ) as generated(month_start)
  where profile.status = 'active'
    and not exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = profile.id
        and mra.role = 'admin'
        and mra.revoked_at is null
    )
),
all_months as (
  select member_id, covered_month from membership_months
  union
  select member_id, covered_month from prelaunch_months
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

revoke all on public.dues_month_status from public, anon, authenticated, service_role;
grant select on public.dues_month_status to authenticated;

create or replace function private.dues_member_has_month_obligation(
  p_member_id uuid,
  p_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select pg_catalog.date_trunc('month', p_month)::date as month_start
  )
  select exists (
    select 1
    from public.member_profiles as profile
    cross join target
    where profile.id = p_member_id
      and profile.status = 'active'
      and (
        target.month_start between date '2026-02-01' and date '2026-09-01'
        or exists (
          select 1
          from public.dues_membership_periods as period
          where period.member_id = profile.id
            and period.starts_month <= target.month_start
            and (
              period.ends_before_month is null
              or target.month_start < period.ends_before_month
            )
        )
      )
      and not exists (
        select 1
        from public.dues_month_dispositions as disposition
        where disposition.member_id = profile.id
          and disposition.covered_month = target.month_start
          and disposition.is_current
      )
  );
$function$;

create or replace function private.dues_member_has_overdue(
  p_member_id uuid,
  p_before_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select pg_catalog.date_trunc('month', p_before_month)::date as before_month
  ),
  obligation_months as (
    select generated.month_start::date as covered_month
    from target
    cross join lateral pg_catalog.generate_series(
      date '2026-02-01'::timestamp,
      least(date '2026-09-01', target.before_month - interval '1 month')::timestamp,
      interval '1 month'
    ) as generated(month_start)
    union
    select generated.month_start::date as covered_month
    from public.dues_membership_periods as period
    cross join target
    cross join lateral pg_catalog.generate_series(
      period.starts_month::timestamp,
      least(
        coalesce(period.ends_before_month, target.before_month) - interval '1 month',
        target.before_month::timestamp - interval '1 month'
      ),
      interval '1 month'
    ) as generated(month_start)
    where period.member_id = p_member_id
  )
  select exists (
    select 1
    from public.member_profiles as profile
    cross join obligation_months as obligation
    cross join target
    where profile.id = p_member_id
      and profile.status = 'active'
      and obligation.covered_month < target.before_month
      and not exists (
        select 1
        from public.dues_month_dispositions as disposition
        where disposition.member_id = profile.id
          and disposition.covered_month = obligation.covered_month
          and disposition.is_current
      )
  );
$function$;

revoke all on function private.dues_member_has_month_obligation(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function private.dues_member_has_overdue(uuid, date)
  from public, anon, authenticated, service_role;
