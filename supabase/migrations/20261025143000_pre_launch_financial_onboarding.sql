-- Pre-Launch Financial Records, Opening Balance, and Club Bank Details Onboarding Migration

-- 1. Club Payment Settings Table
create table if not exists public.club_payment_settings (
  id text primary key default 'singleton' check (id = 'singleton'),
  bank_name text not null check (length(trim(bank_name)) > 0),
  account_number text not null check (account_number ~ '^[0-9]{10}$' and length(account_number) = 10),
  account_name text not null check (length(trim(account_name)) > 0),
  instructions text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.member_profiles(id)
);

alter table public.club_payment_settings enable row level security;
alter table public.club_payment_settings force row level security;

create policy club_payment_settings_select
  on public.club_payment_settings
  for select
  to authenticated
  using ((select private.is_active_club_member()));

create policy club_payment_settings_insert
  on public.club_payment_settings
  for insert
  to authenticated
  with check (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  );

create policy club_payment_settings_update
  on public.club_payment_settings
  for update
  to authenticated
  using (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  )
  with check (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  );

create policy club_payment_settings_delete
  on public.club_payment_settings
  for delete
  to authenticated
  using (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
  );

revoke all on table public.club_payment_settings from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.club_payment_settings to authenticated;
grant select, insert, update, delete on table public.club_payment_settings to service_role;

-- Set metadata before write
create or replace function private.set_club_payment_settings_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  if new.updated_by is null then
    new.updated_by := (select auth.uid());
  end if;
  return new;
end;
$function$;

create trigger club_payment_settings_set_metadata
before insert or update on public.club_payment_settings
for each row execute function private.set_club_payment_settings_metadata();

-- Audit log trigger for club_payment_settings
create or replace function private.audit_club_payment_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := coalesce((select auth.uid()), new.updated_by);
begin
  if v_actor_id is not null then
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
      'club_payment_settings_updated',
      'club_payment_settings',
      '00000000-0000-0000-0000-000000000000'::uuid,
      null,
      case when tg_op = 'UPDATE' then jsonb_build_object(
        'bank_name', old.bank_name,
        'account_number', old.account_number,
        'account_name', old.account_name,
        'instructions', old.instructions
      ) else null end,
      jsonb_build_object(
        'bank_name', new.bank_name,
        'account_number', new.account_number,
        'account_name', new.account_name,
        'instructions', new.instructions
      ),
      case when tg_op = 'INSERT' then 'Initialized club bank payment settings'
           else 'Updated club bank payment settings' end
    );
  end if;
  return new;
end;
$function$;

create trigger club_payment_settings_audit_trigger
after insert or update on public.club_payment_settings
for each row execute function private.audit_club_payment_settings();

revoke all on function private.set_club_payment_settings_metadata() from public, anon, authenticated, service_role;
revoke all on function private.audit_club_payment_settings() from public, anon, authenticated, service_role;

-- 2. Dues Rate Schedule & Membership Periods Start Month
alter table public.dues_rates disable trigger dues_rates_append_only;

update public.dues_rates
set effective_month = '2026-02-01'::date
where effective_month = '2026-01-01'::date;

alter table public.dues_rates enable trigger dues_rates_append_only;

update public.dues_membership_periods
set starts_month = '2026-02-01'::date
where starts_month = '2026-01-01'::date;

-- 3. Allow 'pre_launch_reconciliation' in public.dues_payments
alter table public.dues_payments
  drop constraint if exists dues_payments_payment_method_check;

alter table public.dues_payments
  add constraint dues_payments_payment_method_check
  check (payment_method is null or payment_method in ('bank_transfer', 'cash', 'pre_launch_reconciliation')) not valid;

-- 4. Stored Procedure for Dues Backfill
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

  -- Prepare reason for audit log (bounded and non-empty)
  v_reason := coalesce(nullif(pg_catalog.btrim(p_notes), ''), 'Pre-launch historical dues reconciliation');
  if pg_catalog.char_length(v_reason) > 500 then
    v_reason := pg_catalog.substr(v_reason, 1, 500);
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
      'notes', p_notes
    ),
    v_reason
  );

  return v_pmt_id;
end;
$function$;

create or replace function public.backfill_member_historical_dues(
  p_member_id uuid,
  p_covered_months date[],
  p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.backfill_member_historical_dues(
    p_member_id,
    p_covered_months,
    p_notes,
    null
  );
$function$;

create or replace function public.backfill_member_historical_dues(
  p_member_id uuid,
  p_covered_months date[],
  p_notes text,
  p_payment_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.backfill_member_historical_dues(
    p_member_id,
    p_covered_months,
    p_notes,
    p_payment_id
  );
$function$;

revoke all on function private.backfill_member_historical_dues(uuid, date[], text, uuid) from public, anon, service_role;
revoke all on function public.backfill_member_historical_dues(uuid, date[], text) from public, anon, service_role;
revoke all on function public.backfill_member_historical_dues(uuid, date[], text, uuid) from public, anon, service_role;
grant execute on function private.backfill_member_historical_dues(uuid, date[], text, uuid) to authenticated;
grant execute on function public.backfill_member_historical_dues(uuid, date[], text) to authenticated;
grant execute on function public.backfill_member_historical_dues(uuid, date[], text, uuid) to authenticated;

-- 5. Double-Counting Guard in private.club_finance_summary()
create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce((select private.club_dues_income_total()), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'income' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn > 0), 0)::numeric,
    coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
      where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(-le.signed_amount_ngn) from public.event_ledger_entries as le
        where le.signed_amount_ngn < 0), 0)::numeric,
    coalesce((select pg_catalog.sum(dp.amount_ngn) from public.dues_payments as dp
      where dp.payment_method is distinct from 'pre_launch_reconciliation'), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le), 0)::numeric
  where (select private.is_active_club_member());
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.club_finance_summary();
$function$;

revoke all on function private.club_finance_summary() from public, anon, service_role;
revoke all on function public.club_finance_summary() from public, anon, service_role;
grant execute on function private.club_finance_summary() to authenticated;
grant execute on function public.club_finance_summary() to authenticated;
