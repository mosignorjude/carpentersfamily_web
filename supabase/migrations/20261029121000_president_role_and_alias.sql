-- Rename the club administrator role to president. Stored rows are renamed and
-- the legacy name stays accepted by private.has_club_role() so historical
-- migrations keep working without a rewrite.
alter table public.member_role_assignments
  drop constraint member_role_assignments_role_check;

alter table public.member_role_assignments
  add constraint member_role_assignments_role_check
  check (role in ('executive', 'admin', 'backup_admin', 'president'));

drop index public.member_role_assignments_one_current_backup_admin_uidx;

create unique index member_role_assignments_one_current_president_uidx
  on public.member_role_assignments (role)
  where role = 'president' and revoked_at is null;

drop index public.member_role_assignments_one_admin_identity_per_member_uidx;

create unique index member_role_assignments_one_admin_identity_per_member_uidx
  on public.member_role_assignments (member_id)
  where role in ('admin', 'president') and revoked_at is null;

create or replace function private.reject_staff_role_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.member_profiles as mp
    where mp.id = new.member_id and mp.status = 'staff'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff administrator accounts cannot hold club or event roles.';
  end if;
  return new;
end;
$function$;

create trigger member_role_assignments_reject_staff_target
before insert or update of member_id on public.member_role_assignments
for each row execute function private.reject_staff_role_target();

create trigger event_role_assignments_reject_staff_target
before insert or update of member_id on public.event_role_assignments
for each row execute function private.reject_staff_role_target();

create or replace function private.has_club_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    p_role in ('executive', 'admin', 'backup_admin', 'president')
    and (select private.is_active_club_member())
    and exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = (select auth.uid())
        and mra.role = case
          when p_role = 'backup_admin' then 'president'
          else p_role
        end
        and mra.revoked_at is null
    ),
    false
  );
$function$;

create or replace function private.can_manage_meeting_content()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('president'))
      or (select private.has_club_role('executive'))
    ), false
  );
$function$;

create or replace function private.create_announcement(
  p_event_id uuid,
  p_title text,
  p_message text,
  p_priority text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
  v_event_id uuid := p_event_id;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_priority text := p_priority;
  v_expires_at timestamptz := p_expires_at;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member())
     or not (select private.can_publish_communications(v_event_id)) then
    raise exception using errcode = '42501', message = 'Announcement publishing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);

  if v_priority is null or v_priority not in ('standard', 'important', 'urgent')
     or (v_priority = 'standard' and v_expires_at is not null)
     or (
       v_expires_at is not null
       and v_expires_at <= pg_catalog.statement_timestamp()
     )
     or (v_priority = 'urgent' and (
       v_expires_at is null or v_expires_at <= pg_catalog.statement_timestamp()
     )) then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;
  if (v_priority <> 'standard' or v_expires_at is not null)
     and not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('president'))
       or (select private.has_club_role('executive'))
     ) then
    raise exception using errcode = '42501', message = 'Only the President, Admin, and Executive may set announcement priority.';
  end if;

  if v_event_id is not null then
    perform 1 from public.events as e
    where e.id = v_event_id and e.archived_at is null
    for share;
    if not found then
      raise exception using errcode = '22023', message = 'The event is unavailable for announcements.';
    end if;
  end if;

  perform pg_catalog.set_config('app.communication_write', 'on', true);
  insert into public.announcements (
    event_id, title, message, priority, expires_at, created_by, updated_by
  ) values (
    v_event_id, v_title, v_message, v_priority, v_expires_at, v_actor, v_actor
  ) returning id into v_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, expires_at, editor_id, reason
  ) values (
    v_id, v_event_id, 1, v_title, v_message,
    v_priority, v_expires_at, v_actor, 'Initial post'
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.created', 'announcement', v_id, v_event_id,
    null,
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'expires_at', v_expires_at
    ),
    'Initial post'
  );
  return v_id;
end;
$function$;

create or replace function private.update_announcement(
  p_announcement_id uuid,
  p_title text,
  p_message text,
  p_reason text,
  p_priority text,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_old public.announcements%rowtype;
  v_title text := pg_catalog.btrim(p_title);
  v_message text := pg_catalog.btrim(p_message);
  v_reason text := pg_catalog.btrim(p_reason);
  v_priority text := p_priority;
  v_expires_at timestamptz := p_expires_at;
  v_priority_changed boolean;
  v_revision integer;
begin
  perform 1 from private.administration_guard where singleton_id for share;
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  perform private.validate_communication_text(v_title, v_message);
  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
     or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Announcement edits require a valid reason.';
  end if;
  if v_priority is null or v_priority not in ('standard', 'important', 'urgent')
     or (v_priority = 'standard' and v_expires_at is not null)
     or (v_priority = 'urgent' and v_expires_at is null) then
    raise exception using errcode = '22023', message = 'Announcement priority or expiry is invalid.';
  end if;

  select a.* into v_old from public.announcements as a
  where a.id = p_announcement_id for update;
  if not found or not (select private.can_publish_communications(v_old.event_id)) then
    raise exception using errcode = '42501', message = 'Announcement editing access is required.';
  end if;
  if v_old.event_id is not null and exists (
    select 1 from public.events as e where e.id = v_old.event_id and e.archived_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Archived event announcements are read-only.';
  end if;

  v_priority_changed := v_priority is distinct from v_old.priority
    or v_expires_at is distinct from v_old.expires_at;
  if v_priority_changed and not (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('president'))
    or (select private.has_club_role('executive'))
  ) then
    raise exception using errcode = '42501', message = 'Only the President, Admin, and Executive may change announcement priority.';
  end if;
  v_revision := v_old.revision_number + 1;
  perform pg_catalog.set_config('app.communication_write', 'on', true);
  update public.announcements set
    title = v_title,
    message = v_message,
    priority = v_priority,
    expires_at = v_expires_at,
    revision_number = v_revision,
    updated_by = v_actor,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_announcement_id;
  insert into public.announcement_revisions (
    announcement_id, event_id, revision_number, title, message,
    priority, expires_at, editor_id, reason
  ) values (
    p_announcement_id, v_old.event_id, v_revision, v_title, v_message,
    v_priority, v_expires_at, v_actor, v_reason
  );
  perform pg_catalog.set_config('app.communication_write', 'off', true);
  perform private.append_communication_audit(
    v_actor, 'announcement.edited', 'announcement', p_announcement_id, v_old.event_id,
    pg_catalog.jsonb_build_object(
      'title', v_old.title,
      'message', v_old.message,
      'priority', v_old.priority,
      'expires_at', v_old.expires_at
    ),
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'message', v_message,
      'priority', v_priority,
      'expires_at', v_expires_at
    ),
    v_reason
  );
  return v_revision;
end;
$function$;

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
       or (select private.has_club_role('president'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive or President may record dues payments.';
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
  v_caller_is_president boolean;
  v_caller_is_executive boolean;
  v_target_is_president boolean;
  v_payment_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may approve dues.';
  end if;

  v_caller_is_president := (select private.has_club_role('president'));
  v_caller_is_executive := (select private.has_club_role('executive'));

  if not (v_caller_is_president or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive or President may approve dues payments.';
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

  v_target_is_president := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = v_request.member_id
      and mra.role = 'president'
      and mra.revoked_at is null
  );

  -- A president's own dues require an executive reviewer.
  if v_target_is_president and not v_caller_is_executive then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive may approve the President''s dues payments.';
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
  v_caller_is_president boolean;
  v_caller_is_executive boolean;
  v_target_is_president boolean;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Only active club members may review dues.';
  end if;

  v_caller_is_president := (select private.has_club_role('president'));
  v_caller_is_executive := (select private.has_club_role('executive'));

  if not (v_caller_is_president or v_caller_is_executive) then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive or President may review dues payments.';
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

  v_target_is_president := exists (
    select 1
    from public.member_role_assignments as mra
    where mra.member_id = v_request.member_id
      and mra.role = 'president'
      and mra.revoked_at is null
  );

  -- A president's own dues require an executive reviewer.
  if v_target_is_president and not v_caller_is_executive then
    raise exception using
      errcode = '42501',
      message = 'Only an Executive may review the President''s dues payments.';
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

create or replace function private.fanout_officer_notification(
  p_category text,
  p_dedupe_key text,
  p_source_type text,
  p_source_id uuid,
  p_event_id uuid,
  p_title text,
  p_body text,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_category not in ('officer_money', 'officer_member', 'officer_event')
     or p_source_type not in ('audit', 'event')
     or p_dedupe_key is null or p_title is null or p_body is null then
    raise exception using errcode = '23514', message = 'Notification request is invalid.';
  end if;

  perform pg_catalog.set_config('app.notification_insert_write', 'on', true);
  insert into public.notifications (
    recipient_id, category, title, body, source_type, source_id,
    event_id, dedupe_key
  )
  select distinct
    profile.id,
    p_category,
    private.sanitize_notification_text(p_title, 120),
    private.sanitize_notification_text(p_body, 300),
    p_source_type,
    p_source_id,
    p_event_id,
    p_dedupe_key
  from public.member_profiles as profile
  where profile.status = 'active'
    -- Only this dues action suppresses the actor. Other officer feeds continue
    -- to include their actor as established by the existing actor-feed policy.
    and not (
      p_category = 'officer_money'
      and p_source_type = 'audit'
      and exists (
        select 1
        from public.audit_log as source_audit
        where source_audit.id = p_source_id
          and source_audit.action = 'dues_payment_request_submitted'
          and source_audit.actor_id = profile.id
      )
    )
    and (
      exists (
        select 1
        from public.member_role_assignments as club_role
        where club_role.member_id = profile.id
          and club_role.role in ('executive', 'admin', 'president')
          and club_role.revoked_at is null
      )
      or (
        p_event_id is not null
        and exists (
          select 1
          from public.event_role_assignments as event_role
          where event_role.member_id = profile.id
            and event_role.event_id = p_event_id
            and event_role.role in ('lead', 'assistant')
            and event_role.revoked_at is null
        )
      )
    )
  on conflict (recipient_id, dedupe_key) do nothing;
  perform pg_catalog.set_config('app.notification_insert_write', 'off', true);
end;
$function$;

create or replace function private.format_role_label(p_role text)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  select case pg_catalog.lower(coalesce(p_role, ''))
    when 'admin' then 'Admin'
    when 'backup_admin' then 'Backup Admin'
    when 'president' then 'President'
    when 'executive' then 'Executive'
    when 'member' then 'Member'
    when 'lead' then 'Event Lead'
    when 'assistant' then 'Event Assistant'
    when 'committee' then 'Committee Member'
    else initcap(pg_catalog.replace(coalesce(p_role, 'Member'), '_', ' '))
  end;
$function$;

-- Existing rows created under the legacy name become president rows.
update public.member_role_assignments
set role = 'president'
where role = 'backup_admin';
