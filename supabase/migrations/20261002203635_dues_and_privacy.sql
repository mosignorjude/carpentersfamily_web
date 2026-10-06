-- Monthly dues with private row access, immutable rate history, atomic payment
-- posting, month-level dispositions, and audited officer corrections.

create table public.dues_rates (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  effective_month date not null unique,
  monthly_amount_ngn bigint not null,
  created_by uuid references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  reason text not null,
  constraint dues_rates_effective_month_check check (
    pg_catalog.date_part('day', effective_month) = 1
  ),
  constraint dues_rates_amount_check check (
    monthly_amount_ngn between 1 and 1000000000
  ),
  constraint dues_rates_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
    and reason = pg_catalog.btrim(reason)
  )
);

-- Start the specified current-year backfill at the approved ₦5,000 rate. The
-- initial configuration has no member actor because migrations can precede
-- creation of the first primary Admin.
insert into public.dues_rates (
  effective_month,
  monthly_amount_ngn,
  created_by,
  reason
) values (
  date_trunc(
    'year',
    pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date,
  5000,
  null,
  'Initial ₦5,000 monthly rate from the approved club requirements.'
);

create table public.dues_membership_periods (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  starts_month date not null,
  ends_before_month date,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint dues_membership_periods_starts_month_check check (
    pg_catalog.date_part('day', starts_month) = 1
  ),
  constraint dues_membership_periods_ends_before_month_check check (
    ends_before_month is null
    or (
      pg_catalog.date_part('day', ends_before_month) = 1
      and ends_before_month >= starts_month
    )
  ),
  constraint dues_membership_periods_member_start_key unique (member_id, starts_month)
);

create index dues_membership_periods_member_range_idx
  on public.dues_membership_periods (member_id, starts_month, ends_before_month);

create table public.dues_payments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  amount_ngn bigint not null,
  payment_date date not null,
  recorded_by uuid not null references public.member_profiles (id) on delete restrict,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  corrected_by uuid references public.member_profiles (id) on delete restrict,
  corrected_at timestamptz,
  constraint dues_payments_amount_check check (
    amount_ngn between 1 and 1200000000000
  ),
  constraint dues_payments_date_check check (
    payment_date >= date '1900-01-01'
  ),
  constraint dues_payments_correction_fields_check check (
    (corrected_by is null and corrected_at is null)
    or (corrected_by is not null and corrected_at is not null)
  )
);

create index dues_payments_member_date_idx
  on public.dues_payments (member_id, payment_date desc, recorded_at desc);

create index dues_payments_recorded_by_idx
  on public.dues_payments (recorded_by, recorded_at desc);

create table public.dues_month_dispositions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  covered_month date not null,
  amount_ngn bigint not null,
  disposition text not null,
  payment_id uuid references public.dues_payments (id) on delete restrict,
  recorded_by uuid not null references public.member_profiles (id) on delete restrict,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  writeoff_reason text,
  is_current boolean not null default true,
  superseded_by uuid references public.member_profiles (id) on delete restrict,
  superseded_at timestamptz,
  superseded_reason text,
  constraint dues_month_dispositions_covered_month_check check (
    pg_catalog.date_part('day', covered_month) = 1
  ),
  constraint dues_month_dispositions_amount_check check (
    amount_ngn between 1 and 1000000000
  ),
  constraint dues_month_dispositions_type_check check (
    (
      disposition = 'paid'
      and payment_id is not null
      and writeoff_reason is null
    )
    or (
      disposition = 'written_off'
      and payment_id is null
      and writeoff_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(writeoff_reason)) between 1 and 500
      and writeoff_reason = pg_catalog.btrim(writeoff_reason)
    )
  ),
  constraint dues_month_dispositions_superseded_fields_check check (
    (
      is_current
      and superseded_by is null
      and superseded_at is null
      and superseded_reason is null
    )
    or (
      not is_current
      and superseded_by is not null
      and superseded_at is not null
      and superseded_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(superseded_reason)) between 1 and 500
      and superseded_reason = pg_catalog.btrim(superseded_reason)
    )
  )
);

create unique index dues_month_dispositions_one_current_per_month_uidx
  on public.dues_month_dispositions (member_id, covered_month)
  where is_current;

create index dues_month_dispositions_payment_current_idx
  on public.dues_month_dispositions (payment_id, covered_month)
  where is_current and payment_id is not null;

create index dues_month_dispositions_member_history_idx
  on public.dues_month_dispositions (member_id, covered_month desc, recorded_at desc);

-- Reconstruct periods from immutable membership lifecycle audit events.
with ordered_status_changes as (
  select
    al.target_member_id as member_id,
    al.occurred_at,
    al.after_data ->> 'status' as new_status,
    pg_catalog.lead(al.occurred_at) over (
      partition by al.target_member_id
      order by al.occurred_at, al.id
    ) as next_occurred_at,
    pg_catalog.lead(al.after_data ->> 'status') over (
      partition by al.target_member_id
      order by al.occurred_at, al.id
    ) as next_status
  from public.audit_log as al
  where al.action in ('member_approved', 'member_deactivated', 'member_reactivated')
    and al.target_member_id is not null
),
period_candidates as (
  select
    member_id,
    date_trunc('month', occurred_at at time zone 'Africa/Lagos')::date as starts_month,
    case
      when next_status = 'deactivated' then date_trunc(
        'month', next_occurred_at at time zone 'Africa/Lagos'
      )::date
      else null
    end as ends_before_month
  from ordered_status_changes
  where new_status = 'active'
),
merged_period_candidates as (
  select
    member_id,
    starts_month,
    case
      when bool_or(ends_before_month is null) then null
      else max(ends_before_month)
    end as ends_before_month
  from period_candidates
  group by member_id, starts_month
)
insert into public.dues_membership_periods (
  member_id,
  starts_month,
  ends_before_month
)
select member_id, starts_month, ends_before_month
from merged_period_candidates
on conflict (member_id, starts_month) do nothing;

-- An active legacy profile without lifecycle audit starts at the current-year
-- backfill boundary rather than receiving invented pre-application arrears.
insert into public.dues_membership_periods (
  member_id,
  starts_month,
  ends_before_month
)
select
  mp.id,
  greatest(
    date_trunc('month', mp.created_at at time zone 'Africa/Lagos')::date,
    (select min(dr.effective_month) from public.dues_rates as dr)
  ),
  null
from public.member_profiles as mp
where mp.status = 'active'
  and not exists (
    select 1
    from public.dues_membership_periods as dmp
    where dmp.member_id = mp.id
  )
on conflict (member_id, starts_month) do nothing;

create or replace function private.prevent_dues_rate_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'Dues rate history is append-only.';
end;
$function$;

create or replace function private.correct_dues_payment(
  p_payment_id uuid,
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_old_member_id uuid;
  v_old_amount bigint;
  v_old_payment_date date;
  v_old_months date[];
  v_new_member_status text;
  v_locked_members integer;
  v_rate_count integer;
  v_expected_amount bigint;
  v_before_data jsonb;
  v_after_data jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_payment_id is null
     or p_member_id is null
     or p_amount_ngn is null
     or p_payment_date is null
     or p_covered_months is null
     or pg_catalog.cardinality(p_covered_months) not between 1 and 1200
     or p_amount_ngn not between 1 and 1200000000000
     or p_payment_date < date '1900-01-01'
     or p_payment_date > v_today
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A payment, member, valid amount/date, 1 to 1,200 months, and a 1 to 500 character reason are required.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month is null
      or pg_catalog.date_part('day', requested.covered_month) <> 1
  ) or pg_catalog.cardinality(p_covered_months) <> (
    select pg_catalog.count(distinct requested.covered_month)
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Covered months must be unique first-of-month dates.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may correct dues payments.';
  end if;

  select dp.member_id
  into v_old_member_id
  from public.dues_payments as dp
  where dp.id = p_payment_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The dues payment does not exist.';
  end if;

  -- Lock member rows in UUID order before the payment row to avoid deadlocks
  -- when two officers correct payments for the same pair of members.
  perform mp.id
  from public.member_profiles as mp
  where mp.id in (v_old_member_id, p_member_id)
  order by mp.id
  for update;
  get diagnostics v_locked_members = row_count;

  if v_locked_members < (case when v_old_member_id = p_member_id then 1 else 2 end) then
    raise exception using errcode = '23503', message = 'The selected member does not exist.';
  end if;

  select dp.member_id, dp.amount_ngn, dp.payment_date
  into v_old_member_id, v_old_amount, v_old_payment_date
  from public.dues_payments as dp
  where dp.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The dues payment does not exist.';
  end if;

  select
    pg_catalog.array_agg(dmd.covered_month order by dmd.covered_month),
    coalesce(pg_catalog.sum(dmd.amount_ngn), 0)
  into v_old_months, v_expected_amount
  from public.dues_month_dispositions as dmd
  where dmd.payment_id = p_payment_id
    and dmd.is_current;

  if v_old_months is null
     or v_expected_amount <> v_old_amount then
    raise exception using
      errcode = '23514',
      message = 'The payment coverage is inconsistent; no correction was made.';
  end if;

  select pg_catalog.jsonb_build_object(
    'member_id', v_old_member_id,
    'amount_ngn', v_old_amount,
    'payment_date', v_old_payment_date,
    'coverage', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'month', dmd.covered_month,
            'amount_ngn', dmd.amount_ngn
          ) order by dmd.covered_month
        ),
        '[]'::jsonb
      )
      from public.dues_month_dispositions as dmd
      where dmd.payment_id = p_payment_id
        and dmd.is_current
    )
  )
  into v_before_data;

  if v_old_member_id = p_member_id
     and v_old_amount = p_amount_ngn
     and v_old_payment_date = p_payment_date
     and v_old_months = (
       select pg_catalog.array_agg(requested.covered_month order by requested.covered_month)
       from pg_catalog.unnest(p_covered_months) as requested(covered_month)
     ) then
    raise exception using
      errcode = '22023',
      message = 'The correction must change at least one payment value.';
  end if;

  v_current_month := date_trunc('month', v_today::timestamp)::date;
  lock table public.dues_rates in share mode;
  select min(dr.effective_month)
  into v_first_month
  from public.dues_rates as dr;

  select mp.status
  into v_new_member_status
  from public.member_profiles as mp
  where mp.id = p_member_id;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month <= v_current_month
      and (
        requested.covered_month < v_first_month
        or not exists (
          select 1
          from public.dues_membership_periods as dmp
          where dmp.member_id = p_member_id
            and dmp.starts_month <= requested.covered_month
            and (
              dmp.ends_before_month is null
              or requested.covered_month < dmp.ends_before_month
            )
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A covered past or current month is outside the member dues period.';
  end if;

  if v_new_member_status <> 'active'
     and exists (
       select 1
       from pg_catalog.unnest(p_covered_months) as requested(covered_month)
       where requested.covered_month > v_current_month
     ) then
    raise exception using
      errcode = '23514',
      message = 'Future dues may only be prepaid for an active member.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    join public.dues_month_dispositions as dmd
      on dmd.member_id = p_member_id
     and dmd.covered_month = requested.covered_month
     and dmd.is_current
     and dmd.payment_id is distinct from p_payment_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'At least one selected month already has a different final dues disposition.';
  end if;

  select
    pg_catalog.count(rate.monthly_amount_ngn),
    coalesce(pg_catalog.sum(rate.monthly_amount_ngn), 0)
  into v_rate_count, v_expected_amount
  from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  left join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= requested.covered_month
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  if v_rate_count <> pg_catalog.cardinality(p_covered_months)
     or p_amount_ngn <> v_expected_amount then
    raise exception using
      errcode = '23514',
      message = 'Payment amount must exactly equal the configured rate total for the selected months.';
  end if;

  update public.dues_month_dispositions as dmd
  set is_current = false,
      superseded_by = v_actor_id,
      superseded_at = pg_catalog.clock_timestamp(),
      superseded_reason = v_reason
  where dmd.payment_id = p_payment_id
    and dmd.is_current;

  update public.dues_payments as dp
  set member_id = p_member_id,
      amount_ngn = p_amount_ngn,
      payment_date = p_payment_date,
      corrected_by = v_actor_id,
      corrected_at = pg_catalog.clock_timestamp()
  where dp.id = p_payment_id;

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
    requested.covered_month,
    rate.monthly_amount_ngn,
    'paid',
    p_payment_id,
    v_actor_id
  from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= requested.covered_month
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  select pg_catalog.jsonb_build_object(
    'member_id', p_member_id,
    'amount_ngn', p_amount_ngn,
    'payment_date', p_payment_date,
    'coverage', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'month', dmd.covered_month,
            'amount_ngn', dmd.amount_ngn
          ) order by dmd.covered_month
        ),
        '[]'::jsonb
      )
      from public.dues_month_dispositions as dmd
      where dmd.payment_id = p_payment_id
        and dmd.is_current
    )
  )
  into v_after_data;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'dues_payment_corrected',
    'dues_payment',
    p_payment_id,
    p_member_id,
    v_before_data,
    v_after_data,
    v_reason
  );
end;
$function$;

create or replace function private.set_dues_rate(
  p_effective_month date,
  p_monthly_amount_ngn bigint,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_current_month date := date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date;
  v_rate_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_effective_month is null
     or pg_catalog.date_part('day', p_effective_month) <> 1
     or p_effective_month <= v_current_month
     or p_monthly_amount_ngn not between 1 and 1000000000
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A future first-of-month effective date, valid amount, and 1 to 500 character reason are required.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may change dues rates.';
  end if;

  insert into public.dues_rates (
    effective_month,
    monthly_amount_ngn,
    created_by,
    reason
  ) values (
    p_effective_month,
    p_monthly_amount_ngn,
    v_actor_id,
    v_reason
  ) returning id into v_rate_id;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'dues_rate_changed',
    'dues_rate',
    v_rate_id,
    null,
    pg_catalog.jsonb_build_object(
      'effective_month', p_effective_month,
      'monthly_amount_ngn', p_monthly_amount_ngn
    ),
    v_reason
  );

  return v_rate_id;
end;
$function$;

create or replace function private.club_dues_income_total()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_active_club_member()) then
    raise exception using
      errcode = '42501',
      message = 'Only active members may view the aggregate dues income.';
  end if;

  return (
    select coalesce(pg_catalog.sum(dp.amount_ngn), 0)::bigint
    from public.dues_payments as dp
  );
end;
$function$;

create or replace function public.correct_dues_payment(
  p_payment_id uuid,
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[],
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.correct_dues_payment(
    p_payment_id, p_member_id, p_amount_ngn, p_payment_date, p_covered_months, p_reason
  );
$function$;

create or replace function public.set_dues_rate(
  p_effective_month date,
  p_monthly_amount_ngn bigint,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.set_dues_rate(p_effective_month, p_monthly_amount_ngn, p_reason);
$function$;

create or replace function public.club_dues_income_total()
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select private.club_dues_income_total();
$function$;

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

revoke all on table public.dues_rates from public, anon, authenticated, service_role;
revoke all on table public.dues_membership_periods from public, anon, authenticated, service_role;
revoke all on table public.dues_payments from public, anon, authenticated, service_role;
revoke all on table public.dues_month_dispositions from public, anon, authenticated, service_role;
grant select on table
  public.dues_rates,
  public.dues_membership_periods,
  public.dues_payments,
  public.dues_month_dispositions
to authenticated;

alter table public.dues_rates enable row level security;
alter table public.dues_rates force row level security;
alter table public.dues_membership_periods enable row level security;
alter table public.dues_membership_periods force row level security;
alter table public.dues_payments enable row level security;
alter table public.dues_payments force row level security;
alter table public.dues_month_dispositions enable row level security;
alter table public.dues_month_dispositions force row level security;

create policy dues_rates_select_active_members
  on public.dues_rates
  for select
  to authenticated
  using ((select private.is_active_club_member()));

create policy dues_membership_periods_select_self_or_officer
  on public.dues_membership_periods
  for select
  to authenticated
  using (
    (
      member_id = (select auth.uid())
      and (select private.is_active_club_member())
    )
    or (select private.has_officer_history_access())
  );

create policy dues_payments_select_self_or_officer
  on public.dues_payments
  for select
  to authenticated
  using (
    (
      member_id = (select auth.uid())
      and (select private.is_active_club_member())
    )
    or (select private.has_officer_history_access())
  );

create policy dues_month_dispositions_select_self_or_officer
  on public.dues_month_dispositions
  for select
  to authenticated
  using (
    (
      member_id = (select auth.uid())
      and (select private.is_active_club_member())
    )
    or (select private.has_officer_history_access())
  );

revoke all on public.dues_month_status from public, anon, authenticated, service_role;
grant select on public.dues_month_status to authenticated;

create trigger dues_rates_append_only
before update or delete on public.dues_rates
for each row execute function private.prevent_dues_rate_mutation();

create or replace function private.prevent_dues_disposition_deletion()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Dues disposition history cannot be deleted.';
  end if;

  if old.is_current
     and not new.is_current
     and new.superseded_by is not null
     and new.superseded_at is not null
     and new.superseded_reason is not null
     and row(
       new.id,
       new.member_id,
       new.covered_month,
       new.amount_ngn,
       new.disposition,
       new.payment_id,
       new.recorded_by,
       new.recorded_at,
       new.writeoff_reason
     ) is not distinct from row(
       old.id,
       old.member_id,
       old.covered_month,
       old.amount_ngn,
       old.disposition,
       old.payment_id,
       old.recorded_by,
       old.recorded_at,
       old.writeoff_reason
     ) then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Dues disposition history is immutable except for audited supersession.';
end;
$function$;

create trigger dues_month_dispositions_retain_history
before update or delete on public.dues_month_dispositions
for each row execute function private.prevent_dues_disposition_deletion();

create or replace function private.track_member_dues_period()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_month date := date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Lagos'
  )::date;
  v_period_id uuid;
begin
  if old.status = new.status then
    return new;
  end if;

  if new.status = 'active' then
    insert into public.dues_membership_periods as existing_period (
      member_id,
      starts_month,
      ends_before_month
    ) values (
      new.id,
      v_month,
      null
    )
    on conflict (member_id, starts_month)
    do update set ends_before_month = null
    where existing_period.ends_before_month = excluded.starts_month
    returning id into v_period_id;

    if v_period_id is null then
      raise exception using
        errcode = '23514',
        message = 'A dues membership period could not be opened for this month.';
    end if;
  elsif old.status = 'active' then
    update public.dues_membership_periods as dmp
    set ends_before_month = v_month
    where dmp.member_id = old.id
      and dmp.ends_before_month is null;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'An active member dues period is missing.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger member_profiles_track_dues_period
after update of status on public.member_profiles
for each row execute function private.track_member_dues_period();

create or replace function private.record_dues_payment(
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_rate_count integer;
  v_expected_amount bigint;
  v_payment_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or p_amount_ngn is null
     or p_payment_date is null
     or p_covered_months is null
     or pg_catalog.cardinality(p_covered_months) not between 1 and 1200
     or p_amount_ngn not between 1 and 1200000000000
     or p_payment_date < date '1900-01-01'
     or p_payment_date > v_today then
    raise exception using
      errcode = '22023',
      message = 'A member, positive amount, valid non-future payment date, and 1 to 1,200 covered months are required.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month is null
      or pg_catalog.date_part('day', requested.covered_month) <> 1
  ) or pg_catalog.cardinality(p_covered_months) <> (
    select pg_catalog.count(distinct requested.covered_month)
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Covered months must be unique first-of-month dates.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or Backup Admin may record dues payments.';
  end if;

  select mp.status
  into v_member_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'The selected member does not exist.';
  end if;

  v_current_month := date_trunc('month', v_today::timestamp)::date;
  lock table public.dues_rates in share mode;
  select min(dr.effective_month)
  into v_first_month
  from public.dues_rates as dr;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month <= v_current_month
      and (
        requested.covered_month < v_first_month
        or not exists (
          select 1
          from public.dues_membership_periods as dmp
          where dmp.member_id = p_member_id
            and dmp.starts_month <= requested.covered_month
            and (
              dmp.ends_before_month is null
              or requested.covered_month < dmp.ends_before_month
            )
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'A covered past or current month is outside the member dues period.';
  end if;

  if v_member_status <> 'active'
     and exists (
       select 1
       from pg_catalog.unnest(p_covered_months) as requested(covered_month)
       where requested.covered_month > v_current_month
     ) then
    raise exception using
      errcode = '23514',
      message = 'Future dues may only be prepaid for an active member.';
  end if;

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

  select
    pg_catalog.count(rate.monthly_amount_ngn),
    coalesce(pg_catalog.sum(rate.monthly_amount_ngn), 0)
  into v_rate_count, v_expected_amount
  from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  left join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= requested.covered_month
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  if v_rate_count <> pg_catalog.cardinality(p_covered_months) then
    raise exception using
      errcode = '23514',
      message = 'A dues rate is not configured for every covered month.';
  end if;

  if p_amount_ngn <> v_expected_amount then
    raise exception using
      errcode = '23514',
      message = 'Payment amount must exactly equal the configured rate total for the selected months.';
  end if;

  insert into public.dues_payments (
    member_id,
    amount_ngn,
    payment_date,
    recorded_by
  ) values (
    p_member_id,
    p_amount_ngn,
    p_payment_date,
    v_actor_id
  ) returning id into v_payment_id;

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
    requested.covered_month,
    rate.monthly_amount_ngn,
    'paid',
    v_payment_id,
    v_actor_id
  from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= requested.covered_month
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'dues_payment_recorded',
    'dues_payment',
    v_payment_id,
    p_member_id,
    null,
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn,
      'payment_date', p_payment_date,
      'covered_months', (
        select pg_catalog.jsonb_agg(requested.covered_month order by requested.covered_month)
        from pg_catalog.unnest(p_covered_months) as requested(covered_month)
      )
    ),
    'Dues payment recorded.'
  );

  return v_payment_id;
end;
$function$;

create or replace function private.write_off_dues_months(
  p_member_id uuid,
  p_covered_months date[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or p_covered_months is null
     or pg_catalog.cardinality(p_covered_months) not between 1 and 1200
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member, 1 to 1,200 months, and a 1 to 500 character reason are required.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month is null
      or pg_catalog.date_part('day', requested.covered_month) <> 1
  ) or pg_catalog.cardinality(p_covered_months) <> (
    select pg_catalog.count(distinct requested.covered_month)
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  ) then
    raise exception using
      errcode = '22023',
      message = 'Covered months must be unique first-of-month dates.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or Backup Admin may write off dues.';
  end if;

  perform 1
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'The selected member does not exist.';
  end if;

  v_current_month := date_trunc('month', v_today::timestamp)::date;
  lock table public.dues_rates in share mode;
  select min(dr.effective_month)
  into v_first_month
  from public.dues_rates as dr;

  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    where requested.covered_month >= v_current_month
      or requested.covered_month < v_first_month
      or not exists (
        select 1
        from public.dues_membership_periods as dmp
        where dmp.member_id = p_member_id
          and dmp.starts_month <= requested.covered_month
          and (
            dmp.ends_before_month is null
            or requested.covered_month < dmp.ends_before_month
          )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Write-offs are limited to unpaid past months within the member dues period.';
  end if;

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

  with inserted_dispositions as (
    insert into public.dues_month_dispositions (
      member_id,
      covered_month,
      amount_ngn,
      disposition,
      payment_id,
      recorded_by,
      writeoff_reason
    )
    select
      p_member_id,
      requested.covered_month,
      rate.monthly_amount_ngn,
      'written_off',
      null,
      v_actor_id,
      v_reason
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    join lateral (
      select dr.monthly_amount_ngn
      from public.dues_rates as dr
      where dr.effective_month <= requested.covered_month
      order by dr.effective_month desc
      limit 1
    ) as rate on true
    returning id, covered_month, amount_ngn
  )
  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    before_data,
    after_data,
    reason
  )
  select
    v_actor_id,
    'dues_month_written_off',
    'dues_month_disposition',
    inserted_dispositions.id,
    p_member_id,
    pg_catalog.jsonb_build_object('status', 'unpaid'),
    pg_catalog.jsonb_build_object(
      'status', 'written_off',
      'covered_month', inserted_dispositions.covered_month,
      'amount_ngn', inserted_dispositions.amount_ngn
    ),
    v_reason
  from inserted_dispositions;
end;
$function$;

-- Define the public invoker wrappers after their private implementations exist.
create or replace function public.record_dues_payment(
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[]
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.record_dues_payment(
    p_member_id, p_amount_ngn, p_payment_date, p_covered_months
  );
$function$;

create or replace function public.write_off_dues_months(
  p_member_id uuid,
  p_covered_months date[],
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.write_off_dues_months(p_member_id, p_covered_months, p_reason);
$function$;

create or replace function public.correct_dues_payment(
  p_payment_id uuid,
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[],
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.correct_dues_payment(
    p_payment_id, p_member_id, p_amount_ngn, p_payment_date, p_covered_months, p_reason
  );
$function$;

create or replace function public.set_dues_rate(
  p_effective_month date,
  p_monthly_amount_ngn bigint,
  p_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.set_dues_rate(p_effective_month, p_monthly_amount_ngn, p_reason);
$function$;

create or replace function public.club_dues_income_total()
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select private.club_dues_income_total();
$function$;

revoke all on function private.prevent_dues_rate_mutation() from public, anon, authenticated, service_role;
revoke all on function private.prevent_dues_disposition_deletion() from public, anon, authenticated, service_role;
revoke all on function private.track_member_dues_period() from public, anon, authenticated, service_role;
revoke all on function private.record_dues_payment(uuid, bigint, date, date[]) from public, anon, service_role;
revoke all on function private.write_off_dues_months(uuid, date[], text) from public, anon, service_role;
revoke all on function private.correct_dues_payment(uuid, uuid, bigint, date, date[], text) from public, anon, service_role;
revoke all on function private.set_dues_rate(date, bigint, text) from public, anon, service_role;
revoke all on function private.club_dues_income_total() from public, anon, service_role;
revoke all on function public.record_dues_payment(uuid, bigint, date, date[]) from public, anon, service_role;
revoke all on function public.write_off_dues_months(uuid, date[], text) from public, anon, service_role;
revoke all on function public.correct_dues_payment(uuid, uuid, bigint, date, date[], text) from public, anon, service_role;
revoke all on function public.set_dues_rate(date, bigint, text) from public, anon, service_role;
revoke all on function public.club_dues_income_total() from public, anon, service_role;

grant execute on function private.record_dues_payment(uuid, bigint, date, date[]) to authenticated;
grant execute on function private.write_off_dues_months(uuid, date[], text) to authenticated;
grant execute on function private.correct_dues_payment(uuid, uuid, bigint, date, date[], text) to authenticated;
grant execute on function private.set_dues_rate(date, bigint, text) to authenticated;
grant execute on function private.club_dues_income_total() to authenticated;
grant execute on function public.record_dues_payment(uuid, bigint, date, date[]) to authenticated;
grant execute on function public.write_off_dues_months(uuid, date[], text) to authenticated;
grant execute on function public.correct_dues_payment(uuid, uuid, bigint, date, date[], text) to authenticated;
grant execute on function public.set_dues_rate(date, bigint, text) to authenticated;
grant execute on function public.club_dues_income_total() to authenticated;
