-- Migration: 20261028014047_sync_event_void_with_verification_status.sql
-- Synchronizes voiding/refunding with verification_status and allows verification triggers

-- 1. Backfill any existing voided/refunded entries
alter table public.event_ticket_sales disable trigger event_ticket_sales_write_guard;
alter table public.event_financial_transactions disable trigger event_financial_transactions_write_guard;

update public.event_ticket_sales
set verification_status = 'rejected',
    rejection_reason = coalesce(refund_reason, 'Historical refunded ticket sale')
where refunded_at is not null and verification_status <> 'rejected';

update public.event_financial_transactions
set verification_status = 'rejected',
    rejection_reason = coalesce(void_reason, 'Historical voided transaction')
where voided_at is not null and verification_status <> 'rejected';

alter table public.event_ticket_sales enable trigger event_ticket_sales_write_guard;
alter table public.event_financial_transactions enable trigger event_financial_transactions_write_guard;

-- 2. Update private.refund_event_ticket_sale to sync verification_status
create or replace function private.refund_event_ticket_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_sale public.event_ticket_sales%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_sale_id is null or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A ticket refund reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may refund ticket sales.';
  end if;
  select s.* into v_sale from public.event_ticket_sales as s where s.id = p_sale_id;
  if not found then raise exception using errcode = 'P0002', message = 'The ticket sale is unavailable.'; end if;
  perform 1 from public.events as e where e.id = v_sale.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'Only ticket sales in a scheduled event can be refunded.'; end if;
  select s.* into v_sale from public.event_ticket_sales as s where s.id = p_sale_id for update;
  if v_sale.refunded_at is not null then
    raise exception using errcode = '23505', message = 'The ticket sale has already been refunded.';
  end if;
  update public.event_ticket_sales set
    refunded_at = v_now,
    refunded_by = v_actor_id,
    refund_reason = v_reason,
    verification_status = 'rejected',
    verified_by = v_actor_id,
    verified_at = v_now,
    rejection_reason = v_reason,
    updated_at = v_now
  where id = p_sale_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_refunded', 'event_ticket_sale', p_sale_id,
    pg_catalog.jsonb_build_object('quantity', v_sale.quantity, 'amount_ngn', v_sale.amount_ngn,
      'refunded_at', null),
    pg_catalog.jsonb_build_object('quantity', v_sale.quantity, 'amount_ngn', v_sale.amount_ngn,
      'refunded_at', v_now), v_reason
  );
end;
$function$;

-- 3. Update private.void_event_financial_transaction to sync verification_status
create or replace function private.void_event_financial_transaction(p_transaction_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction public.event_financial_transactions%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_transaction_id is null or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A financial void reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may void event finances.';
  end if;
  select t.* into v_transaction from public.event_financial_transactions as t
    where t.id = p_transaction_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event transaction is unavailable.'; end if;
  perform 1 from public.events as e where e.id = v_transaction.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found or v_transaction.voided_at is not null then
    raise exception using errcode = '42501', message = 'Only an unvoided transaction in a scheduled event may be voided.';
  end if;
  update public.event_financial_transactions set
    voided_at = v_now,
    voided_by = v_actor_id,
    void_reason = v_reason,
    verification_status = 'rejected',
    verified_by = v_actor_id,
    verified_at = v_now,
    rejection_reason = v_reason,
    updated_by = v_actor_id,
    updated_at = v_now
  where id = p_transaction_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_voided', 'event_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date),
    pg_catalog.jsonb_build_object('voided', true), v_reason
  );
end;
$function$;

-- 4. Update guard_event_ticket_sale_write to recognize app.event_verification_active
create or replace function private.guard_event_ticket_sale_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_tier public.event_ticket_tiers%rowtype;
  v_sold bigint;
  v_exclude_sale_id uuid;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Ticket-sale history is retained and cannot be deleted.';
  end if;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if pg_catalog.current_setting('app.event_verification_active', true) = 'on' then
    if new.id is distinct from old.id or new.event_id is distinct from old.event_id
      or new.tier_id is distinct from old.tier_id or new.seller_id is distinct from old.seller_id
      or new.unit_price_ngn is distinct from old.unit_price_ngn
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at or new.updated_at <= old.updated_at then
      raise exception using errcode = '42501', message = 'Ticket-sale price and ownership history cannot be rewritten.';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.seller_id is distinct from v_actor_id then
      raise exception using errcode = '42501', message = 'A ticket sale must be attributed to the signed-in seller.';
    end if;
  elsif not (select private.can_correct_event_finances())
      and old.seller_id is distinct from v_actor_id then
    raise exception using errcode = '42501', message = 'Only the seller or Admin/Backup Admin may change this ticket sale.';
  end if;

  select e.* into v_event from public.events as e where e.id = new.event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or not v_event.ticketing_enabled then
    raise exception using errcode = '42501', message = 'Ticket sales require a scheduled event with ticketing enabled.';
  end if;
  select t.* into v_tier from public.event_ticket_tiers as t
    where t.event_id = new.event_id and t.id = new.tier_id for update;
  if not found or (tg_op = 'INSERT' and v_tier.retired_at is not null) then
    raise exception using errcode = '23503', message = 'The ticket tier is unavailable.';
  end if;

  if tg_op = 'INSERT' then
    if new.unit_price_ngn is distinct from v_tier.price_ngn
      or new.updated_at is distinct from new.created_at
      or new.refunded_at is not null then
      raise exception using errcode = '42501', message = 'Ticket price and seller must come from trusted database state.';
    end if;
  else
    v_exclude_sale_id := old.id;
    if old.refunded_at is not null
      or new.id is distinct from old.id or new.event_id is distinct from old.event_id
      or new.tier_id is distinct from old.tier_id or new.seller_id is distinct from old.seller_id
      or new.unit_price_ngn is distinct from old.unit_price_ngn
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at or new.updated_at <= old.updated_at then
      raise exception using errcode = '42501', message = 'Ticket-sale price and ownership history cannot be rewritten.';
    end if;
    if new.refunded_at is distinct from old.refunded_at then
      if not (select private.can_correct_event_finances())
        or new.refunded_at is null or new.refunded_by is distinct from v_actor_id
        or new.refund_reason is null or new.quantity is distinct from old.quantity
        or new.buyer_name is distinct from old.buyer_name
        or new.payment_method is distinct from old.payment_method then
        raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may refund a ticket sale.';
      end if;
    elsif new.refunded_by is distinct from old.refunded_by
        or new.refund_reason is distinct from old.refund_reason then
      raise exception using errcode = '42501', message = 'Ticket refund history cannot be rewritten.';
    end if;
  end if;

  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
    from public.event_ticket_sales as s
    where s.tier_id = new.tier_id and s.refunded_at is null
      and s.id is distinct from v_exclude_sale_id;
  if new.refunded_at is null and v_sold + new.quantity > v_tier.capacity then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;
  return new;
end;
$function$;

-- 5. Update guard_event_financial_transaction_write to recognize app.event_verification_active
create or replace function private.guard_event_financial_transaction_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Event financial history is retained; records cannot be deleted.';
  end if;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;

  if pg_catalog.current_setting('app.event_verification_active', true) = 'on' then
    if new.id is distinct from old.id or new.event_id is distinct from old.event_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
      or new.idempotency_key is distinct from old.idempotency_key
      or new.updated_at <= old.updated_at then
      raise exception using errcode = '42501', message = 'Only a current unvoided transaction in a scheduled event may be corrected.';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not (select private.can_manage_event_finances(new.event_id))
      or new.created_by is distinct from v_actor_id or new.updated_by is distinct from v_actor_id
      or new.voided_at is not null then
      raise exception using errcode = '42501', message = 'Event financial management access is required.';
    end if;
    select e.* into v_event from public.events as e where e.id = new.event_id for update;
    if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
      or (new.kind = 'income' and not v_event.income_enabled)
      or (new.kind = 'expense' and not v_event.expenses_enabled) then
      raise exception using errcode = '42501', message = 'This event does not allow that financial entry.';
    end if;
    if new.transaction_date > v_today
      or (new.transaction_date < v_today
        and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin')))) then
      raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter a past-dated event transaction.';
    end if;
    return new;
  end if;

  if not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may correct or void event finances.';
  end if;
  select e.* into v_event from public.events as e where e.id = old.event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or old.voided_at is not null
    or new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
    or new.idempotency_key is distinct from old.idempotency_key
    or new.updated_by is distinct from v_actor_id or new.updated_at <= old.updated_at then
    raise exception using errcode = '42501', message = 'Only a current unvoided transaction in a scheduled event may be corrected.';
  end if;
  if new.voided_at is distinct from old.voided_at then
    if new.voided_at is null or new.voided_by is distinct from v_actor_id or new.void_reason is null
      or new.kind is distinct from old.kind or new.amount_ngn is distinct from old.amount_ngn
      or new.transaction_date is distinct from old.transaction_date
      or new.description is distinct from old.description or new.payer_payee is distinct from old.payer_payee
      or new.source_note is distinct from old.source_note or new.payment_method is distinct from old.payment_method
      or new.category_id is distinct from old.category_id
      or new.category_name_snapshot is distinct from old.category_name_snapshot
      or new.budget_allocation_category_id is distinct from old.budget_allocation_category_id
      or new.budget_allocation_name_snapshot is distinct from old.budget_allocation_name_snapshot
      or new.payment_status is distinct from old.payment_status then
      raise exception using errcode = '42501', message = 'A void must retain the original transaction values.';
    end if;
  elsif new.voided_by is distinct from old.voided_by or new.void_reason is distinct from old.void_reason then
    raise exception using errcode = '42501', message = 'Void history cannot be rewritten.';
  end if;
  return new;
end;
$function$;

-- 6. Update verify_event_ticket_sale with session flag & updated_at
create or replace function public.verify_event_ticket_sale(
  p_sale_id uuid,
  p_decision text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
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
  if v_actor_role = 'executive' and v_sale.seller_id = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Executives cannot verify or reverse their own ticket sales.';
  end if;

  if v_actor_role is null and v_sale.seller_id = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Event leads cannot verify or reverse their own ticket sales.';
  end if;

  -- Enforce Terminal State: Rejections or refunds cannot be reversed
  if v_sale.verification_status = 'rejected' or v_sale.refunded_at is not null then
    raise exception using errcode = '22000', message = 'Cannot modify rejected entry: rejection is terminal.';
  end if;

  perform pg_catalog.set_config('app.event_verification_active', 'on', true);

  if p_decision = 'approved' then
    update public.event_ticket_sales
    set verification_status = 'approved',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = null,
        updated_at = v_now
    where id = p_sale_id;
  else
    update public.event_ticket_sales
    set verification_status = 'rejected',
        verified_by = v_actor_id,
        verified_at = v_now,
        rejection_reason = v_trimmed_reason,
        refunded_at = v_now,
        refunded_by = v_actor_id,
        refund_reason = v_trimmed_reason,
        updated_at = v_now
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

-- 7. Update verify_event_financial_transaction with session flag & updated_at
create or replace function public.verify_event_financial_transaction(
  p_transaction_id uuid,
  p_decision text,
  p_reason text default null
)
returns void language plpgsql security definer set search_path = '' as $$
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
    raise exception using errcode = '42501', message = 'Cannot modify transactions for an archived event.';
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
  if v_actor_role = 'executive' and v_txn.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Executives cannot verify or reverse their own transactions.';
  end if;

  if v_actor_role is null and v_txn.created_by = v_actor_id then
    raise exception using errcode = '42501', message = 'Segregation of duties: Event leads cannot verify or reverse their own transactions.';
  end if;

  -- Enforce Terminal State: Rejections or voids cannot be reversed
  if v_txn.verification_status = 'rejected' or v_txn.voided_at is not null then
    raise exception using errcode = '22000', message = 'Cannot modify rejected entry: rejection is terminal.';
  end if;

  perform pg_catalog.set_config('app.event_verification_active', 'on', true);

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
