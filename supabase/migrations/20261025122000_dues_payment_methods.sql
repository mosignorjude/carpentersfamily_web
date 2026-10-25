-- 1. Modify dues_payment_requests: drop payment_reference, tighten method
alter table public.dues_payment_requests
  drop column if exists payment_reference cascade;

alter table public.dues_payment_requests
  drop constraint if exists dues_payment_requests_payment_method_check;

alter table public.dues_payment_requests
  add constraint dues_payment_requests_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'cash')) not valid;

-- 2. Modify dues_payments: add payment_method and request_id
alter table public.dues_payments
  add column if not exists payment_method text,
  add column if not exists request_id uuid references public.dues_payment_requests(id) on delete set null;

alter table public.dues_payments
  drop constraint if exists dues_payments_payment_method_check;

alter table public.dues_payments
  add constraint dues_payments_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'cash')) not valid;

grant select (payment_method, request_id) on public.dues_payments to authenticated;

-- 3. Drop existing signatures to avoid overload ambiguity
drop function if exists public.submit_dues_payment_request(bigint, date[], text, text, text);
drop function if exists private.submit_dues_payment_request(bigint, date[], text, text, text);
drop function if exists public.record_dues_payment(uuid, bigint, date, date[]);
drop function if exists private.record_dues_payment(uuid, bigint, date, date[]);

-- 4. Recreate submit_dues_payment_request with receipt support
create or replace function public.submit_dues_payment_request(
  p_amount_ngn bigint,
  p_covered_months date[],
  p_payment_method text,
  p_notes text default null,
  p_request_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_notes text := case when p_notes is not null then pg_catalog.btrim(p_notes) else null end;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_rate_count integer;
  v_expected_amount bigint;
  v_req_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_expected_key text;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may submit dues payments.';
  end if;

  -- Admins don't pay dues
  if (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Admins are exempt from paying dues.';
  end if;

  if p_amount_ngn is null
     or p_covered_months is null
     or p_payment_method is null
     or pg_catalog.cardinality(p_covered_months) not between 1 and 1200
     or p_amount_ngn not between 1 and 1200000000000
     or p_payment_method not in ('bank_transfer', 'cash') then
    raise exception using
      errcode = '22023',
      message = 'A valid positive amount, payment method (bank_transfer or cash), and 1 to 1,200 covered months are required.';
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

  -- Receipt requirements
  if p_payment_method = 'bank_transfer' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata is required for bank transfer dues requests.';
    end if;

    v_expected_key := 'receipts/dues/' || v_req_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch for dues receipt.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata must not be provided for cash dues requests.';
    end if;
  end if;

  insert into public.dues_payment_requests (
    id,
    member_id,
    amount_ngn,
    covered_months,
    payment_method,
    notes,
    status
  ) values (
    v_req_id,
    v_actor_id,
    p_amount_ngn,
    p_covered_months,
    p_payment_method,
    v_notes,
    'pending'
  );

  if p_payment_method = 'bank_transfer' then
    insert into public.finance_receipts (
      id, scope, dues_request_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'dues', v_req_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

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
    v_req_id,
    v_actor_id,
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn,
      'covered_months', p_covered_months,
      'payment_method', p_payment_method,
      'notes', v_notes
    ),
    'Member submitted dues payment request'
  );

  return v_req_id;
end;
$$;

-- 5. Recreate record_dues_payment (direct officer entry)
create or replace function public.record_dues_payment(
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[],
  p_payment_method text default 'cash',
  p_payment_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_rate_count integer;
  v_expected_amount bigint;
  v_pmt_id uuid := coalesce(p_payment_id, gen_random_uuid());
  v_expected_key text;
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
     or p_payment_date > v_today
     or p_payment_method not in ('bank_transfer', 'cash') then
    raise exception using
      errcode = '22023',
      message = 'A member, positive amount, valid non-future payment date, valid method (bank_transfer or cash), and 1 to 1,200 covered months are required.';
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

  if p_payment_method = 'bank_transfer' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata is required for bank transfer dues payments.';
    end if;

    v_expected_key := 'receipts/dues/' || v_pmt_id::text || '/' || p_receipt_id::text || '.' ||
      case p_receipt_content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
        else 'bin'
      end;

    if p_receipt_object_key <> v_expected_key then
      raise exception using errcode = '22023', message = 'Object key mismatch.';
    end if;
  else
    if p_receipt_id is not null or p_receipt_object_key is not null then
      raise exception using errcode = '22023', message = 'Receipt metadata must not be provided for cash dues payments.';
    end if;
  end if;

  insert into public.dues_payments (
    id,
    member_id,
    amount_ngn,
    payment_date,
    recorded_by,
    payment_method,
    request_id
  ) values (
    v_pmt_id,
    p_member_id,
    p_amount_ngn,
    p_payment_date,
    v_actor_id,
    p_payment_method,
    null
  );

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
    v_pmt_id,
    v_actor_id
  from pg_catalog.unnest(p_covered_months) as requested(covered_month)
  join lateral (
    select dr.monthly_amount_ngn
    from public.dues_rates as dr
    where dr.effective_month <= requested.covered_month
    order by dr.effective_month desc
    limit 1
  ) as rate on true;

  if p_payment_method = 'bank_transfer' then
    insert into public.finance_receipts (
      id, scope, dues_payment_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'dues', v_pmt_id, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

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
    v_pmt_id,
    p_member_id,
    pg_catalog.jsonb_build_object(
      'amount_ngn', p_amount_ngn,
      'payment_date', p_payment_date,
      'covered_months', p_covered_months,
      'payment_method', p_payment_method
    ),
    'Manual dues payment entry recorded by officer'
  );

  return v_pmt_id;
end;
$$;

-- 6. Update private.approve_dues_payment_request and public wrapper
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

  -- Admins don't pay dues
  if v_target_is_admin then
    raise exception using
      errcode = '42501',
      message = 'Admins are exempt from paying dues.';
  end if;

  -- If target is backup_admin, caller must be admin or executive
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
    recorded_by,
    payment_method,
    request_id
  ) values (
    v_request.member_id,
    v_request.amount_ngn,
    (v_request.created_at at time zone 'Africa/Lagos')::date,
    v_actor_id,
    v_request.payment_method,
    p_request_id
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
      'covered_months', v_request.covered_months,
      'payment_method', v_request.payment_method
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
set search_path = ''
as $function$
  select private.approve_dues_payment_request(p_request_id);
$function$;

revoke all on function public.submit_dues_payment_request from public, anon, service_role;
grant execute on function public.submit_dues_payment_request to authenticated;

revoke all on function public.record_dues_payment from public, anon, service_role;
grant execute on function public.record_dues_payment to authenticated;

revoke all on function public.approve_dues_payment_request(uuid) from public, anon, service_role;
grant execute on function public.approve_dues_payment_request(uuid) to authenticated;
