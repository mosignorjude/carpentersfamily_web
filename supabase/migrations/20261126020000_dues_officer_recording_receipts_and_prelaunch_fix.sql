-- Fix officer dues recording & member dues payment pre-launch eligibility,
-- enforce officer self-recording / President separation / Admin exemption on
-- record_dues_payment, support optional cash dues receipts, and allow officers
-- to attach receipts to recorded dues payments via attach_finance_receipt('dues', ...).

-- 1. Shared month-eligibility helper matching public.dues_month_status
create or replace function private.is_member_dues_month_payable(
  p_member_id uuid,
  p_covered_month date,
  p_current_month date,
  p_first_month date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_covered_month is not null
    and p_first_month is not null
    and p_covered_month >= p_first_month
    and (
      p_covered_month > p_current_month
      or exists (
        select 1
        from public.dues_membership_periods as dmp
        where dmp.member_id = p_member_id
          and dmp.starts_month <= p_covered_month
          and (
            dmp.ends_before_month is null
            or p_covered_month < dmp.ends_before_month
          )
      )
      or (
        p_covered_month between date '2026-02-01' and date '2026-09-01'
        and (
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
        )
      )
    );
$function$;

revoke all on function private.is_member_dues_month_payable(uuid, date, date, date)
  from public, anon, authenticated, service_role;

-- 2. Officer dues recording: pre-launch parity + self-recording / President separation / Admin exemption + optional cash receipts
create or replace function public.record_dues_payment(
  p_member_id uuid,
  p_amount_ngn bigint,
  p_payment_date date,
  p_covered_months date[],
  p_payment_method text default 'cash'::text,
  p_payment_id uuid default null::uuid,
  p_receipt_id uuid default null::uuid,
  p_receipt_object_key text default null::text,
  p_receipt_filename text default null::text,
  p_receipt_content_type text default null::text,
  p_receipt_size_bytes integer default null::integer,
  p_receipt_sha256 text default null::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_member_status text;
  v_caller_is_executive boolean;
  v_caller_is_admin boolean;
  v_caller_is_president boolean;
  v_target_is_president boolean;
  v_target_is_admin boolean;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_current_month date;
  v_first_month date;
  v_rate_count integer;
  v_expected_amount bigint;
  v_pmt_id uuid := coalesce(p_payment_id, gen_random_uuid());
  v_has_any_receipt boolean;
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

  v_caller_is_executive := (select private.has_club_role('executive'));
  v_caller_is_admin := (select private.has_club_role('admin'));
  v_caller_is_president := (select private.has_club_role('president'));

  if not (select private.is_active_club_member())
     or not (v_caller_is_executive or v_caller_is_admin or v_caller_is_president) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Club Admin, or President may record dues payments.';
  end if;

  select mp.status
  into v_member_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'The selected member does not exist.';
  end if;

  if v_actor_id = p_member_id then
    raise exception using
      errcode = '42501',
      message = 'Officers cannot record their own dues payments.';
  end if;

  v_target_is_president := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = p_member_id
      and mra.role = 'president'
      and mra.revoked_at is null
  );

  if v_target_is_president and not (v_caller_is_executive or v_caller_is_admin) then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive or Club Admin may record the President''s dues payments.';
  end if;

  v_target_is_admin := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = p_member_id
      and mra.role = 'admin'
      and mra.revoked_at is null
  );

  if v_target_is_admin then
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
    where not (select private.is_member_dues_month_payable(
      p_member_id, requested.covered_month, v_current_month, v_first_month
    ))
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

  v_has_any_receipt := (
    p_receipt_id is not null
    or p_receipt_object_key is not null
    or p_receipt_filename is not null
    or p_receipt_content_type is not null
    or p_receipt_size_bytes is not null
    or p_receipt_sha256 is not null
  );

  if p_payment_method = 'bank_transfer' or v_has_any_receipt then
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

  if p_payment_method = 'bank_transfer' or v_has_any_receipt then
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
      'payment_method', p_payment_method,
      'has_receipt', (p_payment_method = 'bank_transfer' or v_has_any_receipt)
    ),
    'Manual dues payment entry recorded by officer'
  );

  return v_pmt_id;
end;
$function$;

-- 3. Member dues submission: pre-launch parity + optional cash receipts
create or replace function public.submit_dues_payment_request(
  p_amount_ngn bigint,
  p_covered_months date[],
  p_payment_method text,
  p_notes text default null::text,
  p_request_id uuid default null::uuid,
  p_receipt_id uuid default null::uuid,
  p_receipt_object_key text default null::text,
  p_receipt_filename text default null::text,
  p_receipt_content_type text default null::text,
  p_receipt_size_bytes integer default null::integer,
  p_receipt_sha256 text default null::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_has_any_receipt boolean;
  v_expected_key text;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may submit dues payments.';
  end if;

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
    where not (select private.is_member_dues_month_payable(
      v_actor_id, requested.covered_month, v_current_month, v_first_month
    ))
  ) then
    raise exception using
      errcode = '23514',
      message = 'A covered past or current month is outside the member dues period.';
  end if;

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

  v_has_any_receipt := (
    p_receipt_id is not null
    or p_receipt_object_key is not null
    or p_receipt_filename is not null
    or p_receipt_content_type is not null
    or p_receipt_size_bytes is not null
    or p_receipt_sha256 is not null
  );

  if p_payment_method = 'bank_transfer' or v_has_any_receipt then
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

  if p_payment_method = 'bank_transfer' or v_has_any_receipt then
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
$function$;

-- 4. Write-offs: support pre-launch unpaid months for pre-launch members
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
      or not (select private.is_member_dues_month_payable(
        p_member_id, requested.covered_month, v_current_month, v_first_month
      ))
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

-- 5. Payment corrections: pre-launch month parity
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
    where not (select private.is_member_dues_month_payable(
      p_member_id, requested.covered_month, v_current_month, v_first_month
    ))
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

-- 6. Allow officers to attach receipts post-hoc to recorded dues payments
create or replace function public.attach_finance_receipt(
  p_scope text,
  p_target_id uuid,
  p_receipt_id uuid,
  p_object_key text,
  p_original_filename text,
  p_content_type text,
  p_size_bytes integer,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_expected_key text;
  v_target_member_id uuid := null;
  v_target_is_president boolean;
  v_caller_is_executive boolean;
  v_caller_is_admin boolean;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_scope not in ('club', 'event', 'event_ticket', 'dues') then
    raise exception using errcode = '22023', message = 'Extra receipts can only be attached to club, event, ticket, or dues records.';
  end if;

  v_expected_key := 'receipts/' || p_scope || '/' || p_target_id::text || '/' || p_receipt_id::text || '.' ||
    case p_content_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      else 'bin'
    end;

  if p_object_key <> v_expected_key then
    raise exception using errcode = '22023', message = 'Object key mismatch.';
  end if;

  if p_scope = 'club' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('executive'))
    ) then
      raise exception using errcode = '42501', message = 'Officer permissions required.';
    end if;

    perform 1 from public.club_financial_transactions
    where id = p_target_id and voided_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target club transaction not found or voided.';
    end if;

    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'club', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );

  elsif p_scope = 'event' then
    perform 1 from public.event_financial_transactions
    where id = p_target_id and voided_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target event transaction not found or voided.';
    end if;

    insert into public.finance_receipts (
      id, scope, event_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );

  elsif p_scope = 'event_ticket' then
    perform 1 from public.event_ticket_sales
    where id = p_target_id and refunded_at is null;
    if not found then
      raise exception using errcode = '22023', message = 'Target ticket sale not found or refunded.';
    end if;

    insert into public.finance_receipts (
      id, scope, event_ticket_sale_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event_ticket', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );

  elsif p_scope = 'dues' then
    v_caller_is_executive := (select private.has_club_role('executive'));
    v_caller_is_admin := (select private.has_club_role('admin'));

    if not (
      v_caller_is_admin
      or v_caller_is_executive
      or (select private.has_club_role('backup_admin'))
    ) then
      raise exception using errcode = '42501', message = 'Officer permissions required.';
    end if;

    select dp.member_id
    into v_target_member_id
    from public.dues_payments as dp
    where dp.id = p_target_id
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'Target dues payment not found.';
    end if;

    if v_actor_id = v_target_member_id then
      raise exception using errcode = '42501', message = 'Officers cannot attach receipts to their own dues payments.';
    end if;

    v_target_is_president := exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = v_target_member_id
        and mra.role = 'president'
        and mra.revoked_at is null
    );

    if v_target_is_president and not (v_caller_is_executive or v_caller_is_admin) then
      raise exception using errcode = '42501', message = 'Only an Executive or Club Admin may update the President''s dues receipts.';
    end if;

    insert into public.finance_receipts (
      id, scope, dues_payment_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'dues', p_target_id, p_object_key, p_original_filename,
      p_content_type, p_size_bytes, p_sha256, v_actor_id
    );
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id, after_data, reason
  ) values (
    v_actor_id, 'finance_receipt_attached', 'finance_receipt', p_receipt_id, v_target_member_id,
    pg_catalog.jsonb_build_object('scope', p_scope, 'target_id', p_target_id, 'object_key', p_object_key),
    'Attached additional receipt evidence.'
  );
end;
$function$;

notify pgrst, 'reload schema';
