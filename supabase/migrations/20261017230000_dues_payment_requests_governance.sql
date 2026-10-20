-- Phase 4: Database-backed Member Dues Payment Submission and Approval Governance

-- 1. Define public.dues_payment_requests table
create table if not exists public.dues_payment_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  amount_ngn bigint not null,
  covered_months date[] not null,
  payment_method text not null,
  payment_reference text not null,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  reviewed_by uuid references public.member_profiles (id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  constraint dues_payment_requests_amount_check check (
    amount_ngn between 1 and 1200000000000
  ),
  constraint dues_payment_requests_covered_months_cardinality_check check (
    pg_catalog.cardinality(covered_months) between 1 and 1200
  ),
  constraint dues_payment_requests_payment_method_check check (
    payment_method in ('bank_transfer', 'paystack', 'pos', 'cash', 'other')
  ),
  constraint dues_payment_requests_reference_check check (
    pg_catalog.char_length(pg_catalog.btrim(payment_reference)) between 2 and 160
    and payment_reference = pg_catalog.btrim(payment_reference)
  ),
  constraint dues_payment_requests_notes_check check (
    notes is null
    or (
      pg_catalog.char_length(pg_catalog.btrim(notes)) between 1 and 500
      and notes = pg_catalog.btrim(notes)
    )
  ),
  constraint dues_payment_requests_status_check check (
    status in ('pending', 'approved', 'rejected')
  ),
  constraint dues_payment_requests_review_reason_check check (
    review_reason is null
    or (
      pg_catalog.char_length(pg_catalog.btrim(review_reason)) between 1 and 500
      and review_reason = pg_catalog.btrim(review_reason)
    )
  ),
  constraint dues_payment_requests_review_lifecycle_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null and review_reason is null)
    or (status = 'approved' and reviewed_by is not null and reviewed_at is not null)
    or (status = 'rejected' and reviewed_by is not null and reviewed_at is not null and review_reason is not null)
  )
);

create index if not exists dues_payment_requests_member_created_idx
  on public.dues_payment_requests (member_id, created_at desc);

create index if not exists dues_payment_requests_status_created_idx
  on public.dues_payment_requests (status, created_at desc);

alter table public.dues_payment_requests enable row level security;
alter table public.dues_payment_requests force row level security;

revoke all on public.dues_payment_requests from public, anon;
grant select on public.dues_payment_requests to authenticated;

drop policy if exists dues_payment_requests_select on public.dues_payment_requests;
create policy dues_payment_requests_select on public.dues_payment_requests
  for select to authenticated
  using (
    (member_id = (select auth.uid()))
    or (select private.has_officer_history_access())
  );

-- 2. Update dues_month_status view to exempt active Admins from unpaid dues obligations
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
    and not exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = dmp.member_id
        and mra.role = 'admin'
        and mra.revoked_at is null
    )
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

revoke all on public.dues_month_status from public, anon, authenticated, service_role;
grant select on public.dues_month_status to authenticated;

-- 3. Update private.record_dues_payment with admin exemption check
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
    after_data,
    reason
  ) values (
    v_actor_id,
    'dues_payment_recorded',
    'dues_payment',
    v_payment_id,
    p_member_id,
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn,
      'payment_date', p_payment_date,
      'covered_months', p_covered_months
    ),
    'Manual dues payment entry recorded by officer'
  );

  return v_payment_id;
end;
$function$;

-- 4. Create private.submit_dues_payment_request and public wrapper
create or replace function private.submit_dues_payment_request(
  p_amount_ngn bigint,
  p_covered_months date[],
  p_payment_method text,
  p_payment_reference text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_reference text := pg_catalog.btrim(p_payment_reference);
  v_notes text := case when p_notes is not null then pg_catalog.btrim(p_notes) else null end;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_rate_count integer;
  v_expected_amount bigint;
  v_request_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may submit dues payments.';
  end if;

  -- Admins dont pay dues
  if (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Admins are exempt from paying dues.';
  end if;

  if p_amount_ngn is null
     or p_covered_months is null
     or p_payment_method is null
     or v_reference is null
     or pg_catalog.cardinality(p_covered_months) not between 1 and 1200
     or p_amount_ngn not between 1 and 1200000000000
     or p_payment_method not in ('bank_transfer', 'paystack', 'pos', 'cash', 'other')
     or pg_catalog.char_length(v_reference) not between 2 and 160 then
    raise exception using
      errcode = '22023',
      message = 'A valid positive amount, payment method, payment reference, and 1 to 1,200 covered months are required.';
  end if;

  if v_notes is not null and pg_catalog.char_length(v_notes) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'Notes must be between 1 and 500 characters.';
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

  select mp.status
  into v_member_status
  from public.member_profiles as mp
  where mp.id = v_actor_id
  for update;

  if not found or v_member_status <> 'active' then
    raise exception using errcode = '42501', message = 'Member profile is not active.';
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
          where dmp.member_id = v_actor_id
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

  -- Check if already finalized
  if exists (
    select 1
    from pg_catalog.unnest(p_covered_months) as requested(covered_month)
    join public.dues_month_dispositions as dmd
      on dmd.member_id = v_actor_id
     and dmd.covered_month = requested.covered_month
     and dmd.is_current
  ) then
    raise exception using
      errcode = '23505',
      message = 'At least one selected month already has a final dues disposition.';
  end if;

  -- Check if already in another pending request
  if exists (
    select 1
    from public.dues_payment_requests as dpr,
         pg_catalog.unnest(dpr.covered_months) as pending(m),
         pg_catalog.unnest(p_covered_months) as requested(m)
    where dpr.member_id = v_actor_id
      and dpr.status = 'pending'
      and pending.m = requested.m
  ) then
    raise exception using
      errcode = '23505',
      message = 'A pending dues payment request already covers one or more of the selected months.';
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

  insert into public.dues_payment_requests (
    member_id,
    amount_ngn,
    covered_months,
    payment_method,
    payment_reference,
    notes,
    status
  ) values (
    v_actor_id,
    p_amount_ngn,
    p_covered_months,
    p_payment_method,
    v_reference,
    v_notes,
    'pending'
  ) returning id into v_request_id;

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
    'dues_payment_request_submitted',
    'dues_payment_request',
    v_request_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn,
      'covered_months', p_covered_months,
      'payment_method', p_payment_method,
      'payment_reference', v_reference
    ),
    coalesce(v_notes, 'Dues payment request submitted by member')
  );

  return v_request_id;
end;
$function$;

create or replace function public.submit_dues_payment_request(
  p_amount_ngn bigint,
  p_covered_months date[],
  p_payment_method text,
  p_payment_reference text,
  p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.submit_dues_payment_request(
    p_amount_ngn,
    p_covered_months,
    p_payment_method,
    p_payment_reference,
    p_notes
  );
$function$;

revoke all on function public.submit_dues_payment_request(bigint, date[], text, text, text) from public, anon;
grant execute on function public.submit_dues_payment_request(bigint, date[], text, text, text) to authenticated;

-- 5. Create private.approve_dues_payment_request and public wrapper
create or replace function private.approve_dues_payment_request(
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_request record;
  v_caller_is_admin boolean;
  v_caller_is_backup_admin boolean;
  v_caller_is_executive boolean;
  v_target_is_admin boolean;
  v_target_is_backup_admin boolean;
  v_payment_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may approve dues.';
  end if;

  v_caller_is_admin := (select private.has_club_role('admin'));
  v_caller_is_backup_admin := (select private.has_club_role('backup_admin'));
  v_caller_is_executive := (select private.has_club_role('executive'));

  if not (v_caller_is_admin or v_caller_is_backup_admin or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive, Admin, or Backup Admin may approve dues payments.';
  end if;

  select *
  into v_request
  from public.dues_payment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Dues payment request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = '23514', message = 'This dues payment request has already been reviewed.';
  end if;

  -- Rule: "executives, executives cant approve thier own own dues."
  -- Officers cannot approve their own dues payments
  if v_actor_id = v_request.member_id then
    raise exception using
      errcode = '42501',
      message = 'Officers cannot approve their own dues payments.';
  end if;

  v_target_is_admin := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = v_request.member_id
      and mra.role = 'admin'
      and mra.revoked_at is null
  );

  v_target_is_backup_admin := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = v_request.member_id
      and mra.role = 'backup_admin'
      and mra.revoked_at is null
  );

  -- Admins dont pay dues
  if v_target_is_admin then
    raise exception using
      errcode = '42501',
      message = 'Admins are exempt from paying dues.';
  end if;

  -- Rule: "only admin can approve all users dues including backup admin." + "executive can approve backup admin dues."
  -- If target is backup_admin, caller must be admin or executive (Backup Admin cannot approve backup admin dues)
  if v_target_is_backup_admin and not (v_caller_is_admin or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Admin or Executive may approve Backup Admin dues payments.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if exists (
    select 1
    from pg_catalog.unnest(v_request.covered_months) as req(m)
    join public.dues_month_dispositions as dmd
      on dmd.member_id = v_request.member_id
     and dmd.covered_month = req.m
     and dmd.is_current
  ) then
    raise exception using
      errcode = '23505',
      message = 'At least one covered month already has a final dues disposition.';
  end if;

  insert into public.dues_payments (
    member_id,
    amount_ngn,
    payment_date,
    recorded_by
  ) values (
    v_request.member_id,
    v_request.amount_ngn,
    (v_request.created_at at time zone 'Africa/Lagos')::date,
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
    v_request.member_id,
    req.m,
    rate.monthly_amount_ngn,
    'paid',
    v_payment_id,
    v_actor_id
  from pg_catalog.unnest(v_request.covered_months) as req(m)
  join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= req.m
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  update public.dues_payment_requests
  set status = 'approved',
      reviewed_by = v_actor_id,
      reviewed_at = pg_catalog.clock_timestamp()
  where id = p_request_id;

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
    'dues_payment_request_approved',
    'dues_payment_request',
    p_request_id,
    v_request.member_id,
    pg_catalog.jsonb_build_object('status', 'pending'),
    pg_catalog.jsonb_build_object(
      'status', 'approved',
      'payment_id', v_payment_id,
      'reviewed_by', v_actor_id,
      'amount_ngn', v_request.amount_ngn,
      'covered_months', v_request.covered_months
    ),
    'Dues payment request verified and approved'
  );

  return v_payment_id;
end;
$function$;

create or replace function public.approve_dues_payment_request(
  p_request_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.approve_dues_payment_request(p_request_id);
$function$;

revoke all on function public.approve_dues_payment_request(uuid) from public, anon;
grant execute on function public.approve_dues_payment_request(uuid) to authenticated;

-- 6. Create private.reject_dues_payment_request and public wrapper
create or replace function private.reject_dues_payment_request(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_request record;
  v_reason text := pg_catalog.btrim(p_reason);
  v_caller_is_admin boolean;
  v_caller_is_backup_admin boolean;
  v_caller_is_executive boolean;
  v_target_is_backup_admin boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may review dues.';
  end if;

  v_caller_is_admin := (select private.has_club_role('admin'));
  v_caller_is_backup_admin := (select private.has_club_role('backup_admin'));
  v_caller_is_executive := (select private.has_club_role('executive'));

  if not (v_caller_is_admin or v_caller_is_backup_admin or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive, Admin, or Backup Admin may review dues payments.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A rejection reason of 1 to 500 characters is required.';
  end if;

  select *
  into v_request
  from public.dues_payment_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Dues payment request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = '23514', message = 'This dues payment request has already been reviewed.';
  end if;

  -- Officers cannot review their own dues
  if v_actor_id = v_request.member_id then
    raise exception using
      errcode = '42501',
      message = 'Officers cannot review their own dues payments.';
  end if;

  v_target_is_backup_admin := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = v_request.member_id
      and mra.role = 'backup_admin'
      and mra.revoked_at is null
  );

  if v_target_is_backup_admin and not (v_caller_is_admin or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Admin or Executive may review Backup Admin dues payments.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  update public.dues_payment_requests
  set status = 'rejected',
      reviewed_by = v_actor_id,
      reviewed_at = pg_catalog.clock_timestamp(),
      review_reason = v_reason
  where id = p_request_id;

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
    'dues_payment_request_rejected',
    'dues_payment_request',
    p_request_id,
    v_request.member_id,
    pg_catalog.jsonb_build_object('status', 'pending'),
    pg_catalog.jsonb_build_object(
      'status', 'rejected',
      'reviewed_by', v_actor_id,
      'reason', v_reason
    ),
    v_reason
  );
end;
$function$;

create or replace function public.reject_dues_payment_request(
  p_request_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.reject_dues_payment_request(p_request_id, p_reason);
$function$;

revoke all on function public.reject_dues_payment_request(uuid, text) from public, anon;
grant execute on function public.reject_dues_payment_request(uuid, text) to authenticated;
