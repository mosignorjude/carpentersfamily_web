-- Migration: 20261028000000_event_domain_ledgers_and_verification.sql
-- Adds verification_status to event_financial_transactions and event_ticket_sales.
-- Introduces verify_event_financial_transaction and verify_event_ticket_sale RPCs
-- with segregation of duties and terminal rejection guarantees.

-- 1. Alter public.event_financial_transactions
alter table public.event_financial_transactions
  add column if not exists verification_status text not null default 'approved',
  add column if not exists verified_by uuid references public.member_profiles (id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_financial_transactions_verification_status_check'
  ) then
    alter table public.event_financial_transactions
      add constraint event_financial_transactions_verification_status_check
      check (verification_status in ('recorded', 'approved', 'rejected'));
  end if;
end $$;

-- 2. Alter public.event_ticket_sales
alter table public.event_ticket_sales
  add column if not exists verification_status text not null default 'approved',
  add column if not exists verified_by uuid references public.member_profiles (id),
  add column if not exists verified_at timestamptz,
  add column if not exists rejection_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_verification_status_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_verification_status_check
      check (verification_status in ('recorded', 'approved', 'rejected'));
  end if;
end $$;

-- 3. Align historical voided/refunded entries
update public.event_financial_transactions
set verification_status = 'rejected',
    rejection_reason = coalesce(void_reason, 'Historical voided transaction')
where voided_at is not null and verification_status <> 'rejected';

update public.event_ticket_sales
set verification_status = 'rejected',
    rejection_reason = coalesce(refund_reason, 'Historical refunded ticket sale')
where refunded_at is not null and verification_status <> 'rejected';

-- 4. New insertions default to 'recorded' (staged queue)
alter table public.event_financial_transactions
  alter column verification_status set default 'recorded';

alter table public.event_ticket_sales
  alter column verification_status set default 'recorded';

-- 5. RPC: public.verify_event_financial_transaction
create or replace function public.verify_event_financial_transaction(
  p_transaction_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_txn public.event_financial_transactions%rowtype;
  v_event public.events%rowtype;
  v_trimmed_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '23514', message = 'Invalid decision: must be approved or rejected.';
  end if;

  if p_decision = 'rejected' and (v_trimmed_reason = '' or pg_catalog.char_length(v_trimmed_reason) < 5) then
    raise exception using errcode = '23514', message = 'A mandatory explanation of at least 5 characters is required to reject/reverse a transaction.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  select * into v_txn
  from public.event_financial_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Transaction not found.';
  end if;

  select * into v_event
  from public.events
  where id = v_txn.event_id;

  if not found or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Cannot modify financial records for an archived event.';
  end if;

  -- Determine reviewing actor role
  v_actor_role := case
    when (select private.has_club_role('admin')) then 'admin'
    when (select private.has_club_role('backup_admin')) then 'backup_admin'
    when (select private.has_club_role('executive')) then 'executive'
    else null
  end;

  if v_actor_role is null and not (select private.has_event_role(v_txn.event_id, 'lead')) then
    raise exception using errcode = '42501', message = 'Only authorized officers or event leads may verify transactions.';
  end if;

  -- Enforce Segregation of Duties:
  -- Admin and Backup Admin CAN self-verify and self-reverse.
  -- Executives and Event Leads CANNOT self-verify or self-reverse.
  if v_actor_role = 'executive' and v_txn.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Executives cannot verify or reverse their own transactions.';
  end if;

  if v_actor_role is null and v_txn.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Event leads cannot verify or reverse their own transactions.';
  end if;

  -- Enforce Terminal State: Rejections cannot be reversed or resurrected
  if v_txn.verification_status = 'rejected' then
    raise exception using errcode = '22000', message = 'Cannot modify rejected entry: rejection is terminal.';
  end if;

  if p_decision = 'approved' then
    update public.event_financial_transactions
    set verification_status = 'approved',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = null,
        updated_by = v_actor_id,
        updated_at = v_now
    where id = p_transaction_id;
  else
    -- Rejected: atomically set voided_at, voided_by, void_reason
    update public.event_financial_transactions
    set verification_status = 'rejected',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = v_trimmed_reason,
        voided_at = v_now,
        voided_by = v_actor_id,
        void_reason = v_trimmed_reason,
        updated_by = v_actor_id,
        updated_at = v_now
    where id = p_transaction_id;
  end if;

  perform private.append_event_finance_audit(
    v_actor_id,
    'event_finance_verified',
    'event_financial_transaction',
    p_transaction_id,
    pg_catalog.jsonb_build_object(
      'previous_status', v_txn.verification_status,
      'amount_ngn', v_txn.amount_ngn,
      'kind', v_txn.kind
    ),
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'reason', v_trimmed_reason
    ),
    'Event transaction ' || p_decision
  );
end;
$$;

-- 6. RPC: public.verify_event_ticket_sale
create or replace function public.verify_event_ticket_sale(
  p_sale_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_role text;
  v_sale public.event_ticket_sales%rowtype;
  v_event public.events%rowtype;
  v_trimmed_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '23514', message = 'Invalid decision: must be approved or rejected.';
  end if;

  if p_decision = 'rejected' and (v_trimmed_reason = '' or pg_catalog.char_length(v_trimmed_reason) < 5) then
    raise exception using errcode = '23514', message = 'A mandatory explanation of at least 5 characters is required to reject/reverse a ticket sale.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  select * into v_sale
  from public.event_ticket_sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Ticket sale not found.';
  end if;

  select * into v_event
  from public.events
  where id = v_sale.event_id;

  if not found or v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Cannot modify ticket sales for an archived event.';
  end if;

  -- Determine reviewing actor role
  v_actor_role := case
    when (select private.has_club_role('admin')) then 'admin'
    when (select private.has_club_role('backup_admin')) then 'backup_admin'
    when (select private.has_club_role('executive')) then 'executive'
    else null
  end;

  if v_actor_role is null and not (select private.has_event_role(v_sale.event_id, 'lead')) then
    raise exception using errcode = '42501', message = 'Only authorized officers or event leads may verify ticket sales.';
  end if;

  -- Enforce Segregation of Duties:
  -- Admin and Backup Admin CAN self-verify and self-reverse.
  -- Executives and Event Leads CANNOT self-verify or self-reverse.
  if v_actor_role = 'executive' and v_sale.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Executives cannot verify or reverse their own ticket sales.';
  end if;

  if v_actor_role is null and v_sale.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Event leads cannot verify or reverse their own ticket sales.';
  end if;

  -- Enforce Terminal State: Rejections cannot be reversed
  if v_sale.verification_status = 'rejected' then
    raise exception using errcode = '22000', message = 'Cannot modify rejected entry: rejection is terminal.';
  end if;

  if p_decision = 'approved' then
    update public.event_ticket_sales
    set verification_status = 'approved',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = null
    where id = p_sale_id;
  else
    -- Rejected: atomically set refunded_at, refund_reason to restore tier capacity
    update public.event_ticket_sales
    set verification_status = 'rejected',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = v_trimmed_reason,
        refunded_at = v_now,
        refund_reason = v_trimmed_reason
    where id = p_sale_id;
  end if;

  perform private.append_event_finance_audit(
    v_actor_id,
    'event_ticket_sale_verified',
    'event_ticket_sale',
    p_sale_id,
    pg_catalog.jsonb_build_object(
      'previous_status', v_sale.verification_status,
      'tier_id', v_sale.tier_id,
      'quantity', v_sale.quantity,
      'amount_ngn', v_sale.amount_ngn
    ),
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'reason', v_trimmed_reason
    ),
    'Event ticket sale ' || p_decision
  );
end;
$$;

revoke all on function public.verify_event_financial_transaction from public, anon, service_role;
grant execute on function public.verify_event_financial_transaction to authenticated;

revoke all on function public.verify_event_ticket_sale from public, anon, service_role;
grant execute on function public.verify_event_ticket_sale to authenticated;
