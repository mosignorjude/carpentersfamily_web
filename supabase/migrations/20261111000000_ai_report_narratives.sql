-- Phase 0/1: AI report narratives store, officer quota, member-safe fingerprint read RPC,
-- club overview snapshot RPC, and automated monthly overview publication RPC.

create table public.ai_report_narratives (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_type text not null,
  scope_id uuid,
  period_start date not null,
  period_end date not null,
  facts_fingerprint text not null,
  provider text not null,
  model text not null,
  content jsonb not null,
  status text not null default 'draft',
  created_by uuid references public.member_profiles (id) on delete restrict,
  approved_by uuid references public.member_profiles (id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint ai_report_narratives_type_check check (
    report_type in (
      'club_finance',
      'dues',
      'event_finance',
      'club_overview',
      'custom',
      'agm_statement',
      'treasurer_report',
      'minutes'
    )
  ),
  constraint ai_report_narratives_status_check check (
    status in ('draft', 'approved', 'discarded')
  ),
  constraint ai_report_narratives_period_check check (
    period_end >= period_start
  ),
  constraint ai_report_narratives_fingerprint_check check (
    facts_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint ai_report_narratives_provider_check check (
    pg_catalog.char_length(pg_catalog.btrim(provider)) between 1 and 40
  ),
  constraint ai_report_narratives_model_check check (
    pg_catalog.char_length(pg_catalog.btrim(model)) between 1 and 120
  ),
  constraint ai_report_narratives_content_object_check check (
    pg_catalog.jsonb_typeof(content) = 'object'
  ),
  constraint ai_report_narratives_approval_check check (
    (status <> 'approved' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_by is not null and approved_at is not null)
  )
);

create unique index ai_report_narratives_active_scope_uidx
  on public.ai_report_narratives (
    report_type,
    coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start,
    period_end,
    facts_fingerprint
  )
  where status <> 'discarded';

create index ai_report_narratives_quota_idx
  on public.ai_report_narratives (created_by, created_at desc)
  where created_by is not null;

create or replace function private.touch_ai_report_narrative_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger ai_report_narratives_touch_updated_at
  before update on public.ai_report_narratives
  for each row
  execute function private.touch_ai_report_narrative_updated_at();

alter table public.ai_report_narratives enable row level security;
alter table public.ai_report_narratives force row level security;

revoke all on table public.ai_report_narratives
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.ai_report_narratives
  to authenticated, service_role;

create policy ai_report_narratives_officer_select
  on public.ai_report_narratives
  for select
  to authenticated
  using (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('president'))
    or (select private.has_club_role('admin'))
  );

create policy ai_report_narratives_officer_insert
  on public.ai_report_narratives
  for insert
  to authenticated
  with check (
    (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('president'))
      or (select private.has_club_role('admin'))
    )
    and created_by = (select auth.uid())
    and (
      status = 'draft'
      or (status = 'approved' and approved_by = (select auth.uid()))
    )
  );

create policy ai_report_narratives_officer_update
  on public.ai_report_narratives
  for update
  to authenticated
  using (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('president'))
    or (select private.has_club_role('admin'))
  )
  with check (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('president'))
    or (select private.has_club_role('admin'))
  );

create or replace function public.is_club_officer()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    (select private.has_club_role('executive'))
    or (select private.has_club_role('president'))
    or (select private.has_club_role('admin'));
$function$;

create or replace function public.ai_generation_quota_ok(p_limit integer default 20)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today_wat date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_effective_limit integer := greatest(1, least(coalesce(p_limit, 20), 200));
  v_used integer;
begin
  if v_actor_id is null or not (select public.is_club_officer()) then
    raise exception using
      errcode = '42501',
      message = 'Only club officers may generate AI report summaries.';
  end if;

  select pg_catalog.count(*)::integer
  into v_used
  from public.ai_report_narratives as arn
  where arn.created_by = v_actor_id
    and (arn.created_at at time zone 'Africa/Lagos')::date = v_today_wat;

  return coalesce(v_used, 0) < v_effective_limit;
end;
$function$;

create or replace function public.get_approved_report_narrative(
  p_report_type text,
  p_scope_id uuid default null,
  p_fingerprint text default null
)
returns table (
  id uuid,
  content jsonb,
  approved_by_name text,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_is_officer boolean;
begin
  if not (select private.is_active_club_member()) then
    return;
  end if;

  if p_report_type is null
     or p_fingerprint is null
     or p_fingerprint !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  v_is_officer := (select public.is_club_officer());
  -- Safeguard: regular members receive approved AI narratives on shared reports only,
  -- never club-wide dues summaries.
  if p_report_type not in ('club_finance', 'event_finance') and not v_is_officer then
    return;
  end if;

  return query
  select
    arn.id,
    arn.content,
    coalesce(mp.full_name, 'Club Officer')::text as approved_by_name,
    arn.approved_at
  from public.ai_report_narratives as arn
  left join public.member_profiles as mp
    on mp.id = arn.approved_by
  where arn.report_type = p_report_type
    and arn.scope_id is not distinct from p_scope_id
    and arn.facts_fingerprint = p_fingerprint
    and arn.status = 'approved'
  order by arn.approved_at desc
  limit 1;
end;
$function$;

create or replace function public.log_ai_report_event(
  p_action text,
  p_report_type text,
  p_narrative_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not (select public.is_club_officer()) then
    raise exception using
      errcode = '42501',
      message = 'Only club officers may record AI report events.';
  end if;

  if p_action is null or p_action not in (
       'ai_report_generated',
       'ai_report_updated',
       'ai_report_approved',
       'ai_report_discarded',
       'ai_report_pdf_exported'
     )
     or p_report_type is null
     or p_report_type not in (
       'club_finance',
       'dues',
       'event_finance',
       'club_overview',
       'custom',
       'agm_statement',
       'treasurer_report',
       'minutes'
     )
     or p_narrative_id is null then
    raise exception using
      errcode = '23514',
      message = 'The AI report audit event is invalid.';
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    reason
  ) values (
    v_actor_id,
    p_action,
    'ai_report_narrative',
    p_narrative_id,
    pg_catalog.jsonb_build_object('report_type', p_report_type),
    'Officer ' || p_action || ' for ' || p_report_type || '.'
  );
end;
$function$;

create or replace function private.club_overview_report_data_core(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with bounds as (
    select
      p_start as period_start,
      p_end as period_end,
      pg_catalog.date_trunc('month', p_start::timestamp)::date as start_month,
      pg_catalog.date_trunc('month', p_end::timestamp)::date as end_month
  ),
  expense_cats as (
    select
      coalesce(nullif(pg_catalog.btrim(t.category_name_snapshot), ''), 'Uncategorized') as category,
      pg_catalog.sum(t.amount_ngn)::bigint as amount
    from public.club_financial_transactions as t
    cross join bounds
    where t.kind = 'expense'
      and t.voided_at is null
      and t.transaction_date >= bounds.period_start
      and t.transaction_date <= bounds.period_end
    group by 1
    order by amount desc, category asc
    limit 10
  ),
  dues_period as (
    select
      dms.member_id,
      dms.status,
      dms.due_date,
      coalesce(dms.amount_ngn, 5000)::bigint as amount_ngn
    from public.dues_month_status as dms
    join public.member_profiles as mp on mp.id = dms.member_id
    cross join bounds
    where mp.status = 'active'
      and dms.covered_month >= bounds.start_month
      and dms.covered_month <= bounds.end_month
  ),
  overdue_by_member as (
    select
      dms.member_id,
      pg_catalog.count(*)::integer as overdue_months
    from public.dues_month_status as dms
    join public.member_profiles as mp on mp.id = dms.member_id
    cross join bounds
    where mp.status = 'active'
      and dms.status = 'unpaid'
      and dms.due_date < bounds.period_end
      and dms.covered_month <= bounds.end_month
    group by dms.member_id
  ),
  period_events as (
    select
      ev.id,
      ev.title,
      ev.status,
      (
        coalesce((
          select pg_catalog.sum(t.amount_ngn::numeric)
          from public.event_financial_transactions as t
          where t.event_id = ev.id
            and t.kind = 'income'
            and t.payment_status = 'paid'
            and t.voided_at is null
            and t.transaction_date >= bounds.period_start
            and t.transaction_date <= bounds.period_end
        ), 0::numeric)
        + coalesce((
          select pg_catalog.sum(
            case
              when (s.created_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
                then s.amount_ngn::numeric
              else 0::numeric
            end
            - case
              when s.refunded_at is not null
               and (s.refunded_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
                then s.amount_ngn::numeric
              else 0::numeric
            end
          )
          from public.event_ticket_sales as s
          where s.event_id = ev.id
            and s.verification_status = 'approved'
        ), 0::numeric)
      ) as cash_in,
      coalesce((
        select pg_catalog.sum(t.amount_ngn::numeric)
        from public.event_financial_transactions as t
        where t.event_id = ev.id
          and t.kind = 'expense'
          and t.payment_status in ('paid', 'deposit')
          and t.voided_at is null
          and t.transaction_date >= bounds.period_start
          and t.transaction_date <= bounds.period_end
      ), 0::numeric) as cash_out,
      coalesce((
        select pg_catalog.sum(
          case
            when (s.created_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
              then s.amount_ngn::numeric
            else 0::numeric
          end
          - case
            when s.refunded_at is not null
             and (s.refunded_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
              then s.amount_ngn::numeric
            else 0::numeric
          end
        )
        from public.event_ticket_sales as s
        where s.event_id = ev.id
          and s.verification_status = 'approved'
      ), 0::numeric) as ticket_rev,
      coalesce((
        select pg_catalog.sum(
          case
            when (s.created_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
              then s.quantity
            else 0
          end
          - case
            when s.refunded_at is not null
             and (s.refunded_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
              then s.quantity
            else 0
          end
        )::bigint
        from public.event_ticket_sales as s
        where s.event_id = ev.id
          and s.verification_status = 'approved'
      ), 0::bigint) as tickets_net
    from public.events as ev
    cross join bounds
    where (ev.starts_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
  ),
  top_events_rows as (
    select
      pe.title,
      (pe.cash_in - pe.cash_out)::bigint as net_result_ngn
    from period_events as pe
    order by pg_catalog.abs(pe.cash_in - pe.cash_out) desc, pe.title asc
    limit 5
  )
  select pg_catalog.jsonb_build_object(
    'period_label',
    case
      when pg_catalog.to_char(bounds.period_start, 'YYYY-MM-01') = bounds.period_start::text
       and (pg_catalog.date_trunc('month', bounds.period_start::timestamp) + interval '1 month - 1 day')::date = bounds.period_end
        then pg_catalog.to_char(bounds.period_start, 'YYYY-MM')
      when pg_catalog.to_char(bounds.period_start, 'YYYY-01-01') = bounds.period_start::text
       and pg_catalog.to_char(bounds.period_end, 'YYYY-12-31') = bounds.period_end::text
       and extract(year from bounds.period_start) = extract(year from bounds.period_end)
        then extract(year from bounds.period_start)::integer::text
      else bounds.period_start::text || '..' || bounds.period_end::text
    end,
    'period_start', bounds.period_start::text,
    'period_end', bounds.period_end::text,
    'club_finance', pg_catalog.jsonb_build_object(
      'period_dues_collected_ngn', coalesce((
        select pg_catalog.sum(dp.amount_ngn)::bigint
        from public.dues_payments as dp
        where dp.payment_date between bounds.period_start and bounds.period_end
          and dp.payment_method is distinct from 'pre_launch_reconciliation'
      ), 0)::text,
      'period_other_income_ngn', coalesce((
        select pg_catalog.sum(t.amount_ngn)::bigint
        from public.club_financial_transactions as t
        where t.kind = 'income'
          and t.is_opening_balance is false
          and t.voided_at is null
          and t.transaction_date between bounds.period_start and bounds.period_end
      ), 0)::text,
      'period_expenses_ngn', coalesce((
        select pg_catalog.sum(t.amount_ngn)::bigint
        from public.club_financial_transactions as t
        where t.kind = 'expense'
          and t.voided_at is null
          and t.transaction_date between bounds.period_start and bounds.period_end
      ), 0)::text,
      'current_club_balance_ngn', coalesce((
        select summary.balance::bigint
        from private.club_finance_summary_core() as summary
      ), 0)::text,
      'expense_by_category', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'category', ec.category,
            'amount', ec.amount::text
          )
        )
        from expense_cats as ec
      ), '[]'::jsonb)
    ),
    'dues', pg_catalog.jsonb_build_object(
      'active_members', (
        select pg_catalog.count(*)::integer
        from public.member_profiles as mp
        where mp.status = 'active'
      )::text,
      'paid_rows_in_period', (
        select pg_catalog.count(*)::integer
        from dues_period as dp
        where dp.status = 'paid'
      )::text,
      'unpaid_rows_in_period', (
        select pg_catalog.count(*)::integer
        from dues_period as dp
        where dp.status = 'unpaid'
      )::text,
      'overdue_rows_as_of_end', (
        select pg_catalog.count(*)::integer
        from dues_period as dp
        where dp.status = 'unpaid'
          and dp.due_date < bounds.period_end
      )::text,
      'overdue_three_plus_members', (
        select pg_catalog.count(*)::integer
        from overdue_by_member as obm
        where obm.overdue_months >= 3
      )::text,
      'paid_amount_ngn', coalesce((
        select pg_catalog.sum(dp.amount_ngn)::bigint
        from dues_period as dp
        where dp.status = 'paid'
      ), 0)::text,
      'owed_through_end_ngn', coalesce((
        select pg_catalog.sum(dp.amount_ngn)::bigint
        from dues_period as dp
        where dp.status = 'unpaid'
          and dp.due_date <= bounds.period_end
      ), 0)::text
    ),
    'events', pg_catalog.jsonb_build_object(
      'events_count', (select pg_catalog.count(*)::integer from period_events)::text,
      'completed_count', (
        select pg_catalog.count(*)::integer from period_events where status = 'completed'
      )::text,
      'scheduled_count', (
        select pg_catalog.count(*)::integer from period_events where status = 'scheduled'
      )::text,
      'cancelled_count', (
        select pg_catalog.count(*)::integer from period_events where status = 'cancelled'
      )::text,
      'event_cash_in_ngn', coalesce((select pg_catalog.sum(pe.cash_in)::bigint from period_events as pe), 0)::text,
      'event_cash_out_ngn', coalesce((select pg_catalog.sum(pe.cash_out)::bigint from period_events as pe), 0)::text,
      'ticket_revenue_ngn', coalesce((select pg_catalog.sum(pe.ticket_rev)::bigint from period_events as pe), 0)::text,
      'tickets_sold', coalesce((select pg_catalog.sum(pe.tickets_net)::bigint from period_events as pe), 0)::text,
      'top_events', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'title', te.title,
            'net_result_ngn', te.net_result_ngn::text
          )
        )
        from top_events_rows as te
      ), '[]'::jsonb)
    ),
    'attendance', pg_catalog.jsonb_build_object(
      'sessions_count', (
        select pg_catalog.count(*)::integer
        from public.event_attendance_sessions as eas
        where (eas.opened_at at time zone 'Africa/Lagos')::date between bounds.period_start and bounds.period_end
      )::text,
      'total_checkins', (
        select pg_catalog.count(*)::integer
        from public.event_attendance as ea
        where ea.attendance_status in ('present', 'late')
          and (coalesce(ea.checked_in_at, ea.recorded_at) at time zone 'Africa/Lagos')::date
              between bounds.period_start and bounds.period_end
      )::text
    )
  )
  from bounds
  where bounds.period_start is not null
    and bounds.period_end is not null
    and bounds.period_end >= bounds.period_start;
$function$;

create or replace function public.club_overview_report_data(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.club_overview_report_data_core(p_start, p_end)
  where (select public.is_club_officer());
$function$;

create or replace function public.cron_club_overview_report_data(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.club_overview_report_data_core(p_start, p_end);
$function$;

create or replace function public.cron_publish_monthly_overview(
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_fingerprint text,
  p_provider text,
  p_model text,
  p_content jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_narrative_id uuid;
begin
  if p_period_label is null
     or p_period_start is null
     or p_period_end is null
     or p_period_end < p_period_start
     or p_fingerprint is null
     or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'Invalid monthly overview publication parameters.';
  end if;

  if p_content is not null and pg_catalog.jsonb_typeof(p_content) = 'object' then
    insert into public.ai_report_narratives (
      report_type,
      scope_id,
      period_start,
      period_end,
      facts_fingerprint,
      provider,
      model,
      content,
      status,
      created_by
    ) values (
      'club_overview',
      null,
      p_period_start,
      p_period_end,
      p_fingerprint,
      coalesce(nullif(pg_catalog.btrim(p_provider), ''), 'system'),
      coalesce(nullif(pg_catalog.btrim(p_model), ''), 'system'),
      p_content,
      'draft',
      null
    )
    on conflict (
      report_type,
      coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid),
      period_start,
      period_end,
      facts_fingerprint
    ) where status <> 'discarded'
    do update set updated_at = public.ai_report_narratives.updated_at
    returning id into v_narrative_id;
  end if;

  perform private.fanout_officer_notification(
    'officer_money',
    'monthly-overview:' || pg_catalog.lower(pg_catalog.btrim(p_period_label)),
    'audit',
    null,
    null,
    'Monthly overview ready (' || pg_catalog.btrim(p_period_label) || ')',
    case
      when v_narrative_id is not null
        then 'The AI-assisted monthly club overview draft for ' || pg_catalog.btrim(p_period_label) || ' is ready for officer review.'
      else 'Monthly club overview totals for ' || pg_catalog.btrim(p_period_label) || ' are ready. AI summary unavailable — generate it manually.'
    end,
    null
  );

  return v_narrative_id;
end;
$function$;

revoke all on function private.club_overview_report_data_core(date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.is_club_officer()
  from public, anon, authenticated, service_role;
revoke all on function public.ai_generation_quota_ok(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_approved_report_narrative(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.log_ai_report_event(text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.club_overview_report_data(date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.cron_club_overview_report_data(date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.cron_publish_monthly_overview(text, date, date, text, text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.is_club_officer() to authenticated;
grant execute on function public.ai_generation_quota_ok(integer) to authenticated;
grant execute on function public.get_approved_report_narrative(text, uuid, text) to authenticated;
grant execute on function public.log_ai_report_event(text, text, uuid) to authenticated;
grant execute on function public.club_overview_report_data(date, date) to authenticated;

grant execute on function public.cron_club_overview_report_data(date, date) to service_role;
grant execute on function public.cron_publish_monthly_overview(text, date, date, text, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
