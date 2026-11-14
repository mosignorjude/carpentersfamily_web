-- 1. Scope prelaunch months (Feb-Sep 2026) strictly to pre-launch members
-- (members whose membership period started on/before launch 2026-10-01, or
-- who hold pre-launch historical reconciliation dispositions < 2026-10-01).
-- Future post-launch members must not see Feb-Sep 2026 dues.
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
    and (
      profile.id = (select auth.uid())
      or (select private.has_officer_history_access())
    )
    and (
      exists (
        select 1
        from public.dues_membership_periods as dmp
        where dmp.member_id = profile.id
          and dmp.starts_month <= date '2026-10-01'
      )
      or exists (
        select 1
        from public.dues_month_dispositions as dmd
        where dmd.member_id = profile.id
          and dmd.covered_month < date '2026-10-01'
      )
    )
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
  coalesce(
    disposition.amount_ngn,
    rate.monthly_amount_ngn,
    fallback_rate.monthly_amount_ngn,
    5000::bigint
  ) as amount_ngn,
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
) as rate on true
left join lateral (
  select dr.monthly_amount_ngn
  from public.dues_rates as dr
  order by dr.effective_month asc
  limit 1
) as fallback_rate on true;

revoke all on public.dues_month_status from public, anon, authenticated, service_role;
grant select on public.dues_month_status to authenticated;

-- 2. Apply the same pre-launch cohort restriction to reminder eligibility helpers
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
        (
          target.month_start between date '2026-02-01' and date '2026-09-01'
          and (
            exists (
              select 1
              from public.dues_membership_periods as dmp
              where dmp.member_id = profile.id
                and dmp.starts_month <= date '2026-10-01'
            )
            or exists (
              select 1
              from public.dues_month_dispositions as dmd
              where dmd.member_id = profile.id
                and dmd.covered_month < date '2026-10-01'
            )
          )
        )
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
  is_prelaunch as (
    select (
      exists (
        select 1
        from public.dues_membership_periods as dmp
        where dmp.member_id = p_member_id
          and dmp.starts_month <= date '2026-10-01'
      )
      or exists (
        select 1
        from public.dues_month_dispositions as dmd
        where dmd.member_id = p_member_id
          and dmd.covered_month < date '2026-10-01'
      )
    ) as flag
  ),
  obligation_months as (
    select generated.month_start::date as covered_month
    from target
    cross join is_prelaunch
    cross join lateral pg_catalog.generate_series(
      date '2026-02-01'::timestamp,
      least(date '2026-09-01', target.before_month - interval '1 month')::timestamp,
      interval '1 month'
    ) as generated(month_start)
    where is_prelaunch.flag
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

revoke all on function private.dues_member_has_month_obligation(uuid, date) from public, anon, authenticated, service_role;
revoke all on function private.dues_member_has_overdue(uuid, date) from public, anon, authenticated, service_role;

-- 3. Align open membership period starts_month to club launch (2026-10-01)
-- whenever pre-launch historical dues are backfilled for an active member
-- approved after launch.
create or replace function private.backfill_member_historical_dues(
  p_member_id uuid,
  p_covered_months date[],
  p_notes text default null,
  p_payment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_pmt_id uuid := coalesce(p_payment_id, pg_catalog.gen_random_uuid());
  v_month_count integer;
  v_total_amount bigint;
  v_reason text;
  v_aligned_starts_month date := null;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may backfill historical dues.';
  end if;

  if p_member_id is null then
    raise exception using errcode = '22023', message = 'A member id is required.';
  end if;

  if p_covered_months is null or pg_catalog.cardinality(p_covered_months) < 1 then
    raise exception using errcode = '22023', message = 'At least one covered month is required.';
  end if;

  -- Validate covered months are first-of-month dates
  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month is null
      or requested.covered_month <> pg_catalog.date_trunc('month', requested.covered_month::timestamp)::date
  ) then
    raise exception using
      errcode = '22023',
      message = 'Covered months must be valid first-of-month dates.';
  end if;

  -- Validate covered months fall strictly between 2026-02-01 and 2026-09-01
  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month < date '2026-02-01'
       or requested.covered_month > date '2026-09-01'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Historical dues backfill is only permitted for months between February 2026 and September 2026.';
  end if;

  -- Validate no duplicate dates
  v_month_count := pg_catalog.cardinality(p_covered_months);
  if v_month_count <> (
    select pg_catalog.count(distinct requested.covered_month)
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Covered months must not contain duplicate dates.';
  end if;

  -- Concurrency guard
  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  -- Lock member profile and check existence
  select mp.status
  into v_member_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'The selected member does not exist.';
  end if;

  if v_member_status <> 'active' then
    raise exception using errcode = '22023', message = 'Historical dues backfill is only permitted for active club members.';
  end if;

  -- Admin dues exemption rule
  if exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = p_member_id
      and mra.role = 'admin'
      and mra.revoked_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Admins are exempt from statutory dues obligations.';
  end if;

  -- Check if any selected month already has a current disposition
  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    join public.dues_month_dispositions as dmd
      on dmd.member_id = p_member_id
     and dmd.covered_month = requested.covered_month
     and dmd.is_current
  ) then
    raise exception using
      errcode = '23505',
      message = 'At least one selected month already has a final dues disposition.';
  end if;

  v_total_amount := v_month_count * 5000;

  -- Insert payment record
  insert into public.dues_payments (
    id,
    member_id,
    amount_ngn,
    payment_date,
    recorded_by,
    payment_method
  ) values (
    v_pmt_id,
    p_member_id,
    v_total_amount,
    date '2026-10-01',
    v_actor_id,
    'pre_launch_reconciliation'
  );

  -- Insert dispositions for each covered month
  insert into public.dues_month_dispositions (
    member_id,
    covered_month,
    amount_ngn,
    disposition,
    payment_id,
    recorded_by
  )
  select
    p_member_id,
    m.covered_month,
    5000,
    'paid',
    v_pmt_id,
    v_actor_id
  from pg_catalog.unnest(p_covered_months) as m(covered_month);

  -- Pre-launch members approved after October 2026 must still carry the launch
  -- month (2026-10-01) onward continuously instead of skipping October.
  update public.dues_membership_periods as dmp
  set starts_month = date '2026-10-01'
  where dmp.member_id = p_member_id
    and dmp.ends_before_month is null
    and dmp.starts_month > date '2026-10-01'
    and not exists (
      select 1
      from public.dues_membership_periods as prior_period
      where prior_period.member_id = p_member_id
        and prior_period.id <> dmp.id
        and (
          prior_period.starts_month = date '2026-10-01'
          or (
            prior_period.starts_month < date '2026-10-01'
            and (
              prior_period.ends_before_month is null
              or prior_period.ends_before_month > date '2026-10-01'
            )
          )
        )
    )
  returning dmp.starts_month into v_aligned_starts_month;

  -- Prepare reason for audit log (bounded and non-empty)
  v_reason := pg_catalog.btrim(pg_catalog.substr(coalesce(nullif(pg_catalog.btrim(p_notes), ''), 'Pre-launch historical dues reconciliation'), 1, 500));
  if v_reason = '' then
    v_reason := 'Pre-launch historical dues reconciliation';
  end if;

  -- Insert audit log entry
  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    after_data,
    reason
  ) values (
    v_actor_id,
    'pre_launch_dues_backfill',
    'dues_payment',
    v_pmt_id,
    p_member_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_pmt_id,
      'member_id', p_member_id,
      'covered_months', p_covered_months,
      'amount_ngn', v_total_amount,
      'payment_method', 'pre_launch_reconciliation',
      'notes', p_notes,
      'starts_month_aligned_to', v_aligned_starts_month
    ),
    v_reason
  );

  return v_pmt_id;
end;
$function$;

-- 4. Authorized data reconciliation for Shedrach and Nwosu Daniel Ogechukwu
-- (membership start aligned to 2026-10-01; payment and disposition rows untouched)
update public.dues_membership_periods as dmp
set starts_month = date '2026-10-01'
where dmp.member_id in (
  'e3d3c724-71e1-4f82-8532-f5da8330147d'::uuid,
  'd5850893-6592-423c-8472-9802da999d37'::uuid
)
  and dmp.starts_month = date '2026-11-01'
  and dmp.ends_before_month is null
  and not exists (
    select 1
    from public.dues_membership_periods as existing_oct
    where existing_oct.member_id = dmp.member_id
      and existing_oct.starts_month = date '2026-10-01'
  );
