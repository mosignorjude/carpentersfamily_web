-- 1. Fix public.dues_month_status so pre-launch unpaid months fall back to the
-- earliest configured dues rate (or 5000 NGN) instead of returning NULL amount_ngn.
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

-- 2. Fix public.dues_report_data so row_count matches the member_profiles join
-- and amount_ngn is always non-null.
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
      coalesce(dues_status.amount_ngn, 5000)::text as amount_ngn,
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
      join public.member_profiles as profile on profile.id = dues_status.member_id
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

-- 3. Prevent duplicate officer fanout notifications when the target member
-- already receives a personal ("Your ...") notification for the same audit event.
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
    -- Suppress the third-person officer fanout for the target member when they
    -- already receive the direct personal notification for that audit action.
    and not (
      p_source_type = 'audit'
      and exists (
        select 1
        from public.audit_log as source_audit
        where source_audit.id = p_source_id
          and source_audit.target_member_id = profile.id
          and source_audit.action in (
            'club_role_granted',
            'club_role_revoked',
            'event_role_assigned',
            'event_role_granted',
            'event_role_revoked',
            'member_approved',
            'member_deactivated',
            'member_reactivated',
            'member_rejected',
            'member_request_rejected',
            'dues_payment_recorded',
            'dues_payment_updated',
            'dues_payment_request_approved',
            'dues_payment_request_rejected',
            'dues_month_written_off'
          )
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

-- Clean up any existing duplicate third-person officer notifications where the
-- same recipient already received the personal self notification for that audit row.
do $$
begin
  perform pg_catalog.set_config('app.notification_delete_write', 'on', true);
  delete from public.notifications as n_officer
  using public.notifications as n_self
  where n_officer.recipient_id = n_self.recipient_id
    and n_officer.source_type = 'audit'
    and n_officer.dedupe_key in (
      'officer-member:' || n_officer.source_id::text,
      'officer-event:' || n_officer.source_id::text,
      'officer-money:' || n_officer.source_id::text
    )
    and n_self.dedupe_key in (
      'member-self:' || n_officer.source_id::text,
      'event-role-self:' || n_officer.source_id::text,
      'dues-self:' || n_officer.source_id::text
    );
  perform pg_catalog.set_config('app.notification_delete_write', 'off', true);
end;
$$;

-- 4. Add avatar_url to public.member_profiles and allow active members to update
-- their own username and avatar_url via public.update_own_member_profile.
alter table public.member_profiles
  add column if not exists avatar_url text;

create or replace function private.prevent_completed_profile_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.profile_completed_at is not null then
    if new.full_name is distinct from old.full_name
       or new.profile_completed_at is distinct from old.profile_completed_at then
      raise exception using
        errcode = '42501',
        message = 'A completed member profile is immutable.';
    end if;

    if new.username is distinct from old.username
       and coalesce(pg_catalog.current_setting('app.member_profile_self_update', true), 'off') <> 'on' then
      raise exception using
        errcode = '42501',
        message = 'A completed member profile is immutable.';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.update_own_member_profile(
  p_username text,
  p_avatar_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := (select auth.uid());
  v_username text := pg_catalog.btrim(p_username);
  v_avatar_url text := case
    when p_avatar_url is null then null
    else nullif(pg_catalog.btrim(p_avatar_url), '')
  end;
begin
  if v_member_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  if v_username is null or v_username !~ '^[A-Za-z0-9_]{3,30}$' then
    raise exception using
      errcode = '22023',
      message = 'A valid username (3-30 letters, numbers, or underscores) is required.';
  end if;

  if v_avatar_url is not null then
    if pg_catalog.char_length(v_avatar_url) > 300000
       or v_avatar_url ~ '[[:cntrl:]]'
       or (
         v_avatar_url !~ '^https://[^\s]+$'
         and v_avatar_url !~ '^data:image/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$'
       ) then
      raise exception using
        errcode = '22023',
        message = 'Profile image must be a valid HTTPS image URL or uploaded PNG/JPEG/WebP image.';
    end if;
  end if;

  perform pg_catalog.set_config('app.member_profile_self_update', 'on', true);

  update public.member_profiles as mp
  set username = v_username,
      avatar_url = case
        when p_avatar_url is null then mp.avatar_url
        else v_avatar_url
      end
  where mp.id = v_member_id
    and mp.status = 'active';

  perform pg_catalog.set_config('app.member_profile_self_update', 'off', true);

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Active member profile not found.';
  end if;
exception when unique_violation then
  perform pg_catalog.set_config('app.member_profile_self_update', 'off', true);
  raise exception using
    errcode = '23505',
    message = 'That username is already in use.';
end;
$function$;

create or replace function public.update_own_member_profile(
  p_username text,
  p_avatar_url text default null
)
returns void
language sql
set search_path = ''
as $function$
  select private.update_own_member_profile(p_username, p_avatar_url);
$function$;

revoke all on function private.update_own_member_profile(text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_own_member_profile(text, text) from public, anon, service_role;
grant execute on function public.update_own_member_profile(text, text) to authenticated;

-- 5. Public ticket storefront read RPC for tickets.carpentersfamily.com.ng
create or replace function public.get_public_ticketed_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with bank as (
    select
      cps.bank_name,
      cps.account_name,
      cps.account_number,
      cps.instructions
    from public.club_payment_settings as cps
    limit 1
  ),
  tier_sales as (
    select
      ets.tier_id,
      coalesce(sum(ets.quantity), 0)::integer as sold
    from public.event_ticket_sales as ets
    where ets.refunded_at is null
      and coalesce(ets.verification_status, 'approved') <> 'rejected'
    group by ets.tier_id
  ),
  active_events as (
    select
      e.id,
      e.title,
      e.starts_at,
      e.location,
      e.description,
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', ett.id,
              'name', ett.name,
              'price_ngn', ett.price_ngn,
              'capacity', ett.capacity,
              'sold', coalesce(ts.sold, 0)
            )
            order by ett.price_ngn asc, ett.name asc
          )
          from public.event_ticket_tiers as ett
          left join tier_sales as ts on ts.tier_id = ett.id
          where ett.event_id = e.id
            and ett.retired_at is null
        ),
        '[]'::jsonb
      ) as tiers
    from public.events as e
    where e.ticketing_enabled = true
      and e.status = 'scheduled'
      and e.archived_at is null
    order by e.starts_at asc
    limit 20
  )
  select pg_catalog.jsonb_build_object(
    'bank', (
      select pg_catalog.jsonb_build_object(
        'bank_name', bank.bank_name,
        'account_name', bank.account_name,
        'account_number', bank.account_number,
        'instructions', bank.instructions
      )
      from bank
    ),
    'events', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', active_events.id,
            'title', active_events.title,
            'starts_at', active_events.starts_at,
            'location', active_events.location,
            'description', active_events.description,
            'tiers', active_events.tiers
          )
          order by active_events.starts_at asc
        )
        from active_events
      ),
      '[]'::jsonb
    )
  );
$function$;

grant execute on function public.get_public_ticketed_events() to anon, authenticated;
