-- Step 8: event income/expenses, ticketing, receipts, and retained ledger posts.
-- Financial writes are performed by current-session RPCs; event results are
-- appended to the club ledger on completion/cancellation and reversed on reopen.

create table public.event_ticket_tiers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  name text not null,
  price_ngn bigint not null,
  capacity integer not null,
  retired_at timestamptz,
  retired_by uuid references public.member_profiles (id) on delete restrict,
  retire_reason text,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint event_ticket_tiers_event_id_id_uidx unique (event_id, id),
  constraint event_ticket_tiers_name_check check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 1 and 80
    and name !~ '[[:cntrl:]]'
  ),
  constraint event_ticket_tiers_price_check check (price_ngn between 1 and 1000000000000),
  constraint event_ticket_tiers_capacity_check check (capacity between 1 and 100000),
  constraint event_ticket_tiers_retirement_check check (
    (retired_at is null and retired_by is null and retire_reason is null)
    or (retired_at is not null and retired_by is not null and retire_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(retire_reason)) between 1 and 500
      and retire_reason = pg_catalog.btrim(retire_reason)
      and retire_reason !~ '[[:cntrl:]]')
  )
);

create unique index event_ticket_tiers_event_name_uidx
  on public.event_ticket_tiers (event_id, pg_catalog.lower(name));
create index event_ticket_tiers_event_idx
  on public.event_ticket_tiers (event_id, created_at, id);

create table public.event_financial_transactions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  kind text not null,
  amount_ngn bigint not null,
  transaction_date date not null,
  description text,
  payer_payee text,
  source_note text,
  payment_method text,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_by uuid not null references public.member_profiles (id) on delete restrict,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  voided_at timestamptz,
  voided_by uuid references public.member_profiles (id) on delete restrict,
  void_reason text,
  constraint event_financial_transactions_kind_check check (kind in ('income', 'expense')),
  constraint event_financial_transactions_amount_check check (amount_ngn between 1 and 1000000000000),
  constraint event_financial_transactions_date_check check (transaction_date >= date '1900-01-01'),
  constraint event_financial_transactions_fields_check check (
    (kind = 'expense'
      and description is not null
      and pg_catalog.char_length(pg_catalog.btrim(description)) between 1 and 500
      and description = pg_catalog.btrim(description)
      and description !~ '[[:cntrl:]]'
      and payer_payee is not null
      and pg_catalog.char_length(pg_catalog.btrim(payer_payee)) between 1 and 160
      and payer_payee = pg_catalog.btrim(payer_payee)
      and payer_payee !~ '[[:cntrl:]]'
      and source_note is null and payment_method is null)
    or
    (kind = 'income'
      and description is null
      and source_note is not null
      and pg_catalog.char_length(pg_catalog.btrim(source_note)) between 1 and 500
      and source_note = pg_catalog.btrim(source_note)
      and source_note !~ '[[:cntrl:]]'
      and (payer_payee is null or (payer_payee = pg_catalog.btrim(payer_payee)
        and pg_catalog.char_length(payer_payee) between 1 and 160
        and payer_payee !~ '[[:cntrl:]]'))
      and payment_method in ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other'))
  ),
  constraint event_financial_transactions_void_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(void_reason)) between 1 and 500
      and void_reason = pg_catalog.btrim(void_reason)
      and void_reason !~ '[[:cntrl:]]')
  )
);

create unique index event_financial_transactions_actor_idempotency_uidx
  on public.event_financial_transactions (created_by, idempotency_key);
create index event_financial_transactions_event_date_idx
  on public.event_financial_transactions (event_id, transaction_date desc, created_at desc, id);

create table public.event_ticket_sales (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  tier_id uuid not null,
  seller_id uuid not null references public.member_profiles (id) on delete restrict,
  buyer_name text,
  quantity integer not null,
  unit_price_ngn bigint not null,
  amount_ngn bigint generated always as (quantity::bigint * unit_price_ngn) stored,
  payment_method text,
  idempotency_key uuid not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  refunded_at timestamptz,
  refunded_by uuid references public.member_profiles (id) on delete restrict,
  refund_reason text,
  constraint event_ticket_sales_event_tier_fk foreign key (event_id, tier_id)
    references public.event_ticket_tiers (event_id, id) on delete restrict,
  constraint event_ticket_sales_quantity_check check (quantity between 1 and 1000),
  constraint event_ticket_sales_price_check check (unit_price_ngn between 1 and 1000000000000),
  constraint event_ticket_sales_amount_check check (quantity::bigint * unit_price_ngn <= 1000000000000),
  constraint event_ticket_sales_buyer_check check (
    buyer_name is null or (buyer_name = pg_catalog.btrim(buyer_name)
      and pg_catalog.char_length(buyer_name) between 1 and 160
      and buyer_name !~ '[[:cntrl:]]')
  ),
  constraint event_ticket_sales_payment_method_check check (
    payment_method is null or payment_method in ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')
  ),
  constraint event_ticket_sales_refund_check check (
    (refunded_at is null and refunded_by is null and refund_reason is null)
    or (refunded_at is not null and refunded_by is not null and refund_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(refund_reason)) between 1 and 500
      and refund_reason = pg_catalog.btrim(refund_reason)
      and refund_reason !~ '[[:cntrl:]]')
  ),
  constraint event_ticket_sales_event_id_id_uidx unique (event_id, id)
);

create unique index event_ticket_sales_seller_idempotency_uidx
  on public.event_ticket_sales (seller_id, idempotency_key);
create index event_ticket_sales_capacity_idx
  on public.event_ticket_sales (tier_id, created_at, id)
  where refunded_at is null;
create index event_ticket_sales_event_created_idx
  on public.event_ticket_sales (event_id, created_at desc, id desc);

create table public.event_ledger_entries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  generation integer not null,
  entry_kind text not null,
  event_status text not null,
  signed_amount_ngn numeric(30, 0) not null,
  reverses_entry_id uuid references public.event_ledger_entries (id) on delete restrict,
  created_by uuid not null references public.member_profiles (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint event_ledger_entries_generation_check check (generation > 0),
  constraint event_ledger_entries_kind_check check (entry_kind in ('posting', 'reversal')),
  constraint event_ledger_entries_status_check check (event_status in ('completed', 'cancelled')),
  constraint event_ledger_entries_shape_check check (
    (entry_kind = 'posting' and reverses_entry_id is null)
    or (entry_kind = 'reversal' and reverses_entry_id is not null)
  ),
  constraint event_ledger_entries_self_fk_check check (reverses_entry_id is null or reverses_entry_id <> id),
  constraint event_ledger_entries_event_generation_kind_uidx unique (event_id, generation, entry_kind)
);

create unique index event_ledger_entries_one_reversal_uidx
  on public.event_ledger_entries (reverses_entry_id)
  where entry_kind = 'reversal';
create index event_ledger_entries_event_idx
  on public.event_ledger_entries (event_id, created_at desc, id desc);

alter table public.audit_log
  add column event_id uuid references public.events (id) on delete restrict;
create index audit_log_event_occurred_idx
  on public.audit_log (event_id, occurred_at desc, id desc)
  where event_id is not null;

create or replace function private.can_manage_event_finances(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_event_role(p_event_id, 'lead'))
      or (select private.has_event_role(p_event_id, 'assistant'))
    ), false
  );
$function$;

create or replace function private.can_correct_event_finances()
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))),
    false
  );
$function$;

alter table public.event_ticket_tiers enable row level security;
alter table public.event_ticket_tiers force row level security;
alter table public.event_financial_transactions enable row level security;
alter table public.event_financial_transactions force row level security;
alter table public.event_ticket_sales enable row level security;
alter table public.event_ticket_sales force row level security;
alter table public.event_ledger_entries enable row level security;
alter table public.event_ledger_entries force row level security;

create policy event_ticket_tiers_active_member_read
  on public.event_ticket_tiers for select to authenticated
  using ((select private.is_active_club_member()));
create policy event_financial_transactions_active_member_read
  on public.event_financial_transactions for select to authenticated
  using ((select private.is_active_club_member()));
create policy event_ticket_sales_active_member_read
  on public.event_ticket_sales for select to authenticated
  using ((select private.is_active_club_member()));
create policy event_ledger_entries_active_member_read
  on public.event_ledger_entries for select to authenticated
  using ((select private.is_active_club_member()));

revoke all on table public.event_ticket_tiers from public, anon, authenticated, service_role;
revoke all on table public.event_financial_transactions from public, anon, authenticated, service_role;
revoke all on table public.event_ticket_sales from public, anon, authenticated, service_role;
revoke all on table public.event_ledger_entries from public, anon, authenticated, service_role;
grant select (id, event_id, name, price_ngn, capacity, retired_at, created_at, updated_at)
  on public.event_ticket_tiers to authenticated;
grant select (
  id, event_id, kind, amount_ngn, transaction_date, description, payer_payee,
  source_note, payment_method, created_at, updated_at, voided_at, void_reason
) on public.event_financial_transactions to authenticated;
grant select (
  id, event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
  amount_ngn, payment_method, created_at, updated_at, refunded_at, refund_reason
) on public.event_ticket_sales to authenticated;
grant select (
  id, event_id, generation, entry_kind, event_status, signed_amount_ngn, created_at
) on public.event_ledger_entries to authenticated;

create or replace function private.guard_event_ticket_tier_write()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_sold bigint;
  v_count integer;
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'Ticket tiers are retained and cannot be deleted.';
  end if;
  if v_actor_id is null or not (select private.can_manage_event_finances(new.event_id)) then
    raise exception using errcode = '42501', message = 'Event financial management access is required.';
  end if;
  select e.* into v_event from public.events as e where e.id = new.event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or not v_event.ticketing_enabled then
    raise exception using errcode = '42501', message = 'Ticket tiers require a scheduled event with ticketing enabled.';
  end if;
  if tg_op = 'INSERT' then
    if new.created_by is distinct from v_actor_id or new.updated_by is distinct from v_actor_id
      or new.retired_at is not null then
      raise exception using errcode = '42501', message = 'Ticket tier attribution is invalid.';
    end if;
    select pg_catalog.count(*) into v_count from public.event_ticket_tiers as t where t.event_id = new.event_id;
    if v_count >= 50 then
      raise exception using errcode = '23514', message = 'An event may have at most 50 ticket tiers.';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.event_id is distinct from old.event_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.updated_by is distinct from v_actor_id or new.updated_at <= old.updated_at
    or (old.retired_at is not null and new.retired_at is distinct from old.retired_at)
    or (old.retired_at is null and new.retired_at is not null
      and (new.retired_by is distinct from v_actor_id or new.retire_reason is null))
    or (old.retired_at is not null and new.retired_by is distinct from old.retired_by)
    or (old.retired_at is not null and new.retire_reason is distinct from old.retire_reason) then
    raise exception using errcode = '42501', message = 'Ticket tier history cannot be rewritten.';
  end if;
  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
    from public.event_ticket_sales as s
    where s.tier_id = old.id and s.refunded_at is null;
  if new.capacity < v_sold then
    raise exception using errcode = '23514', message = 'Tier capacity cannot be lower than sold tickets.';
  end if;
  return new;
end;
$function$;

create trigger event_ticket_tiers_write_guard
before insert or update or delete on public.event_ticket_tiers
for each row execute function private.guard_event_ticket_tier_write();

create or replace function private.guard_event_financial_transaction_write()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
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
      or new.source_note is distinct from old.source_note or new.payment_method is distinct from old.payment_method then
      raise exception using errcode = '42501', message = 'A void must retain the original transaction values.';
    end if;
  elsif new.voided_by is distinct from old.voided_by or new.void_reason is distinct from old.void_reason then
    raise exception using errcode = '42501', message = 'Void history cannot be rewritten.';
  end if;
  return new;
end;
$function$;

create trigger event_financial_transactions_write_guard
before insert or update or delete on public.event_financial_transactions
for each row execute function private.guard_event_financial_transaction_write();

create or replace function private.guard_event_ticket_sale_write()
returns trigger
language plpgsql security definer set search_path = ''
as $function$
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

create trigger event_ticket_sales_write_guard
before insert or update or delete on public.event_ticket_sales
for each row execute function private.guard_event_ticket_sale_write();

create or replace function private.append_event_finance_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_event_id uuid;
begin
  select case p_entity_type
    when 'event_ticket_tier' then (select t.event_id from public.event_ticket_tiers as t where t.id = p_entity_id)
    when 'event_financial_transaction' then (select t.event_id from public.event_financial_transactions as t where t.id = p_entity_id)
    when 'event_ticket_sale' then (select s.event_id from public.event_ticket_sales as s where s.id = p_entity_id)
    when 'event_ledger_entry' then (select le.event_id from public.event_ledger_entries as le where le.id = p_entity_id)
    when 'event_financial_receipt' then (
      select t.event_id from public.event_financial_receipts as r
      join public.event_financial_transactions as t on t.id = r.transaction_id
      where r.id = p_entity_id
    )
    else null
  end into v_event_id;
  if v_event_id is null then
    raise exception using errcode = '23503', message = 'Event financial audit target is unavailable.';
  end if;
  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
  ) values (
    p_actor_id, p_action, p_entity_type, p_entity_id, v_event_id, p_before, p_after,
    coalesce(p_reason, 'Event financial action recorded.')
  );
end;
$function$;

create or replace function private.create_event_ticket_tier(
  p_event_id uuid, p_name text, p_price_ngn bigint, p_capacity integer, p_reason text
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_tier_id uuid;
  v_name text := pg_catalog.btrim(p_name);
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_name is null or v_name is null or v_name <> p_name
    or pg_catalog.char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]'
    or p_price_ngn is null or p_price_ngn not between 1 and 1000000000000
    or p_capacity is null or p_capacity not between 1 and 100000
    or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'Ticket tier details and reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Event financial management access is required.';
  end if;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or not v_event.ticketing_enabled then
    raise exception using errcode = '42501', message = 'Ticket tiers require a scheduled event with ticketing enabled.';
  end if;
  insert into public.event_ticket_tiers (
    event_id, name, price_ngn, capacity, created_by, created_at, updated_by, updated_at
  ) values (p_event_id, v_name, p_price_ngn, p_capacity, v_actor_id, v_now, v_actor_id, v_now)
  returning id into v_tier_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_tier_created', 'event_ticket_tier', v_tier_id,
    null, pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'name', v_name, 'price_ngn', p_price_ngn, 'capacity', p_capacity
    ), v_reason
  );
  return v_tier_id;
end;
$function$;

create or replace function private.update_event_ticket_tier(
  p_tier_id uuid, p_name text, p_price_ngn bigint, p_capacity integer, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_tier public.event_ticket_tiers%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_name text := pg_catalog.btrim(p_name);
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_tier_id is null or p_name is null or v_name is null or v_name <> p_name
    or pg_catalog.char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]'
    or p_price_ngn is null or p_price_ngn not between 1 and 1000000000000
    or p_capacity is null or p_capacity not between 1 and 100000
    or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'Ticket tier details and reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_tier from public.event_ticket_tiers as t where t.id = p_tier_id for update;
  if not found or v_actor_id is null or not (select private.can_manage_event_finances(v_tier.event_id))
    or v_tier.retired_at is not null then
    raise exception using errcode = '42501', message = 'An active ticket tier and event financial access are required.';
  end if;
  perform 1 from public.events as e where e.id = v_tier.event_id
    and e.status = 'scheduled' and e.archived_at is null and e.ticketing_enabled for update;
  if not found then
    raise exception using errcode = '42501', message = 'Ticket tiers can only be changed for a scheduled event.';
  end if;
  update public.event_ticket_tiers set
    name = v_name, price_ngn = p_price_ngn, capacity = p_capacity,
    updated_by = v_actor_id, updated_at = v_now
  where id = p_tier_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_tier_updated', 'event_ticket_tier', p_tier_id,
    pg_catalog.jsonb_build_object('name', v_tier.name, 'price_ngn', v_tier.price_ngn, 'capacity', v_tier.capacity),
    pg_catalog.jsonb_build_object('name', v_name, 'price_ngn', p_price_ngn, 'capacity', p_capacity), v_reason
  );
end;
$function$;

create or replace function private.retire_event_ticket_tier(p_tier_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_tier public.event_ticket_tiers%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if p_tier_id is null or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'A ticket tier retirement reason is required.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_tier from public.event_ticket_tiers as t where t.id = p_tier_id for update;
  if not found or v_actor_id is null or not (select private.can_manage_event_finances(v_tier.event_id))
    or v_tier.retired_at is not null then
    raise exception using errcode = '42501', message = 'An active ticket tier and event financial access are required.';
  end if;
  perform 1 from public.events as e where e.id = v_tier.event_id
    and e.status = 'scheduled' and e.archived_at is null and e.ticketing_enabled for update;
  if not found then
    raise exception using errcode = '42501', message = 'Ticket tiers can only be retired for a scheduled event.';
  end if;
  update public.event_ticket_tiers set
    retired_at = pg_catalog.clock_timestamp(), retired_by = v_actor_id,
    retire_reason = v_reason, updated_by = v_actor_id, updated_at = pg_catalog.clock_timestamp()
  where id = p_tier_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_tier_retired', 'event_ticket_tier', p_tier_id,
    pg_catalog.jsonb_build_object('retired_at', null, 'name', v_tier.name),
    pg_catalog.jsonb_build_object('retired_at', pg_catalog.clock_timestamp(), 'name', v_tier.name), v_reason
  );
end;
$function$;

create or replace function private.record_event_financial_transaction(
  p_event_id uuid, p_kind text, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text, p_payment_method text,
  p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_existing public.event_financial_transactions%rowtype;
  v_event public.events%rowtype;
  v_id uuid;
begin
  if p_event_id is null or p_kind is null or p_kind not in ('income', 'expense')
    or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000 or p_transaction_date is null
    or p_transaction_date < date '1900-01-01' or p_transaction_date > v_today
    or p_idempotency_key is null
    or (p_kind = 'income' and (p_source_note is null or p_payment_method is null or p_payment_method not in
      ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')))
    or (p_kind = 'expense' and (p_description is null or p_payer_payee is null
      or p_payment_method is not null or p_source_note is not null))
    or (p_description is not null and (p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 500 or p_description ~ '[[:cntrl:]]'))
    or (p_payer_payee is not null and (p_payer_payee <> pg_catalog.btrim(p_payer_payee)
      or pg_catalog.char_length(p_payer_payee) not between 1 and 160 or p_payer_payee ~ '[[:cntrl:]]'))
    or (p_source_note is not null and (p_source_note <> pg_catalog.btrim(p_source_note)
      or pg_catalog.char_length(p_source_note) not between 1 and 500 or p_source_note ~ '[[:cntrl:]]') ) then
    raise exception using errcode = '23514', message = 'The event financial transaction values are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Event financial management access is required.';
  end if;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or (p_kind = 'income' and not v_event.income_enabled)
    or (p_kind = 'expense' and not v_event.expenses_enabled) then
    raise exception using errcode = '42501', message = 'This event does not allow that financial entry.';
  end if;
  if p_transaction_date < v_today
    and not ((select private.has_club_role('admin')) or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may enter a past-dated event transaction.';
  end if;
  select t.* into v_existing from public.event_financial_transactions as t
    where t.created_by = v_actor_id and t.idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.event_id = p_event_id and v_existing.kind = p_kind
      and v_existing.amount_ngn = p_amount_ngn and v_existing.transaction_date = p_transaction_date
      and v_existing.description is not distinct from p_description
      and v_existing.payer_payee is not distinct from p_payer_payee
      and v_existing.source_note is not distinct from p_source_note
      and v_existing.payment_method is not distinct from p_payment_method then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'The event financial idempotency key was already used with different values.';
  end if;
  insert into public.event_financial_transactions (
    event_id, kind, amount_ngn, transaction_date, description, payer_payee,
    source_note, payment_method, created_by, idempotency_key, updated_by
  ) values (
    p_event_id, p_kind, p_amount_ngn, p_transaction_date, p_description, p_payer_payee,
    p_source_note, p_payment_method, v_actor_id, p_idempotency_key, v_actor_id
  ) returning id into v_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_recorded', 'event_financial_transaction', v_id, null,
    pg_catalog.jsonb_build_object('event_id', p_event_id, 'kind', p_kind,
      'amount_ngn', p_amount_ngn, 'transaction_date', p_transaction_date), null
  );
  return v_id;
end;
$function$;

create or replace function private.correct_event_financial_transaction(
  p_transaction_id uuid, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text,
  p_payment_method text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction public.event_financial_transactions%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_transaction_id is null or p_amount_ngn is null or p_amount_ngn not between 1 and 1000000000000
    or p_transaction_date is null or p_transaction_date < date '1900-01-01'
    or p_transaction_date > v_today or p_reason is null or v_reason <> p_reason
    or pg_catalog.char_length(v_reason) not between 1 and 500 or v_reason ~ '[[:cntrl:]]'
    or (p_description is not null and (p_description <> pg_catalog.btrim(p_description)
      or pg_catalog.char_length(p_description) not between 1 and 500 or p_description ~ '[[:cntrl:]]'))
    or (p_payer_payee is not null and (p_payer_payee <> pg_catalog.btrim(p_payer_payee)
      or pg_catalog.char_length(p_payer_payee) not between 1 and 160 or p_payer_payee ~ '[[:cntrl:]]'))
    or (p_source_note is not null and (p_source_note <> pg_catalog.btrim(p_source_note)
      or pg_catalog.char_length(p_source_note) not between 1 and 500 or p_source_note ~ '[[:cntrl:]]')) then
    raise exception using errcode = '23514', message = 'The corrected event transaction values or reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.can_correct_event_finances()) then
    raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may correct event finances.';
  end if;
  select t.* into v_transaction from public.event_financial_transactions as t
    where t.id = p_transaction_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The event financial transaction is unavailable.';
  end if;
  perform 1 from public.events as e where e.id = v_transaction.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found or v_transaction.voided_at is not null then
    raise exception using errcode = '42501', message = 'Only an unvoided transaction in a scheduled event may be corrected.';
  end if;
  update public.event_financial_transactions set
    amount_ngn = p_amount_ngn, transaction_date = p_transaction_date,
    description = p_description, payer_payee = p_payer_payee,
    source_note = p_source_note, payment_method = p_payment_method,
    updated_by = v_actor_id, updated_at = v_now
  where id = p_transaction_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_corrected', 'event_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date, 'description', v_transaction.description,
      'payer_payee', v_transaction.payer_payee, 'source_note', v_transaction.source_note,
      'payment_method', v_transaction.payment_method),
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', p_amount_ngn,
      'transaction_date', p_transaction_date, 'description', p_description,
      'payer_payee', p_payer_payee, 'source_note', p_source_note,
      'payment_method', p_payment_method), v_reason
  );
end;
$function$;

create or replace function private.void_event_financial_transaction(p_transaction_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction public.event_financial_transactions%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
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
    voided_at = pg_catalog.clock_timestamp(), voided_by = v_actor_id,
    void_reason = v_reason, updated_by = v_actor_id, updated_at = pg_catalog.clock_timestamp()
  where id = p_transaction_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_voided', 'event_financial_transaction', p_transaction_id,
    pg_catalog.jsonb_build_object('kind', v_transaction.kind, 'amount_ngn', v_transaction.amount_ngn,
      'transaction_date', v_transaction.transaction_date),
    pg_catalog.jsonb_build_object('voided', true), v_reason
  );
end;
$function$;

create or replace function private.record_event_ticket_sale(
  p_event_id uuid, p_tier_id uuid, p_quantity integer,
  p_buyer_name text, p_payment_method text, p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_existing public.event_ticket_sales%rowtype;
  v_event public.events%rowtype;
  v_tier public.event_ticket_tiers%rowtype;
  v_sold bigint;
  v_sale_id uuid;
  v_amount bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_event_id is null or p_tier_id is null or p_quantity is null or p_quantity not between 1 and 1000
    or p_idempotency_key is null
    or (p_buyer_name is not null and (p_buyer_name <> pg_catalog.btrim(p_buyer_name)
      or pg_catalog.char_length(p_buyer_name) not between 1 and 160 or p_buyer_name ~ '[[:cntrl:]]'))
    or (p_payment_method is not null and p_payment_method not in
      ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')) then
    raise exception using errcode = '23514', message = 'The ticket sale values are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required to record ticket sales.';
  end if;
  select s.* into v_existing from public.event_ticket_sales as s
    where s.seller_id = v_actor_id and s.idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.event_id = p_event_id and v_existing.tier_id = p_tier_id
      and v_existing.quantity = p_quantity and v_existing.buyer_name is not distinct from p_buyer_name
      and v_existing.payment_method is not distinct from p_payment_method then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'The ticket sale request key was already used with different values.';
  end if;
  select e.* into v_event from public.events as e where e.id = p_event_id for update;
  if not found or v_event.status <> 'scheduled' or v_event.archived_at is not null
    or not v_event.ticketing_enabled then
    raise exception using errcode = '42501', message = 'Ticket sales require a scheduled event with ticketing enabled.';
  end if;
  select t.* into v_tier from public.event_ticket_tiers as t
    where t.id = p_tier_id and t.event_id = p_event_id for update;
  if not found or v_tier.retired_at is not null then
    raise exception using errcode = '23503', message = 'The ticket tier is unavailable.';
  end if;
  v_amount := v_tier.price_ngn * p_quantity;
  if v_amount > 1000000000000 then
    raise exception using errcode = '23514', message = 'The ticket sale total exceeds the allowed limit.';
  end if;
  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
    from public.event_ticket_sales as s where s.tier_id = p_tier_id and s.refunded_at is null;
  if v_sold + p_quantity > v_tier.capacity then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, created_at, updated_at
  ) values (
    p_event_id, p_tier_id, v_actor_id, p_buyer_name, p_quantity, v_tier.price_ngn,
    p_payment_method, p_idempotency_key, v_now, v_now
  ) returning id into v_sale_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_recorded', 'event_ticket_sale', v_sale_id, null,
    pg_catalog.jsonb_build_object('event_id', p_event_id, 'tier_id', p_tier_id,
      'quantity', p_quantity, 'unit_price_ngn', v_tier.price_ngn, 'amount_ngn', v_amount,
      'payment_method', p_payment_method), null
  );
  return v_sale_id;
end;
$function$;

create or replace function private.edit_event_ticket_sale(
  p_sale_id uuid, p_quantity integer, p_buyer_name text,
  p_payment_method text, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_sale public.event_ticket_sales%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_sold bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_sale_id is null or p_quantity is null or p_quantity not between 1 and 1000 or p_reason is null
    or v_reason <> p_reason or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason ~ '[[:cntrl:]]'
    or (p_buyer_name is not null and (p_buyer_name <> pg_catalog.btrim(p_buyer_name)
      or pg_catalog.char_length(p_buyer_name) not between 1 and 160 or p_buyer_name ~ '[[:cntrl:]]'))
    or (p_payment_method is not null and p_payment_method not in
      ('cash', 'bank_transfer', 'mobile_money', 'card', 'cheque', 'other')) then
    raise exception using errcode = '23514', message = 'The corrected ticket sale values or reason are invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select s.* into v_sale from public.event_ticket_sales as s where s.id = p_sale_id;
  if not found then raise exception using errcode = 'P0002', message = 'The ticket sale is unavailable.'; end if;
  perform 1 from public.events as e where e.id = v_sale.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'Only ticket sales in a scheduled event can be edited.'; end if;
  select s.* into v_sale from public.event_ticket_sales as s where s.id = p_sale_id for update;
  if not found or v_sale.refunded_at is not null or v_actor_id is null
    or not (select private.is_active_club_member())
    or (v_sale.seller_id is distinct from v_actor_id and not (select private.can_correct_event_finances())) then
    raise exception using errcode = '42501', message = 'Only the active seller or Admin/Backup Admin may edit an unrefunded sale.';
  end if;
  perform 1 from public.event_ticket_tiers as t where t.id = v_sale.tier_id for update;
  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
    from public.event_ticket_sales as s
    where s.tier_id = v_sale.tier_id and s.refunded_at is null and s.id <> p_sale_id;
  if v_sold + p_quantity > (select t.capacity from public.event_ticket_tiers as t where t.id = v_sale.tier_id) then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;
  if v_sale.unit_price_ngn * p_quantity > 1000000000000 then
    raise exception using errcode = '23514', message = 'The ticket sale total exceeds the allowed limit.';
  end if;
  update public.event_ticket_sales set quantity = p_quantity,
    buyer_name = p_buyer_name, payment_method = p_payment_method, updated_at = v_now
  where id = p_sale_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_edited', 'event_ticket_sale', p_sale_id,
    pg_catalog.jsonb_build_object('quantity', v_sale.quantity, 'buyer_name', v_sale.buyer_name,
      'payment_method', v_sale.payment_method, 'amount_ngn', v_sale.amount_ngn),
    pg_catalog.jsonb_build_object('quantity', p_quantity, 'buyer_name', p_buyer_name,
      'payment_method', p_payment_method, 'amount_ngn', v_sale.unit_price_ngn * p_quantity), v_reason
  );
end;
$function$;

create or replace function private.refund_event_ticket_sale(p_sale_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_sale public.event_ticket_sales%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
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
    refunded_at = pg_catalog.clock_timestamp(), refunded_by = v_actor_id,
    refund_reason = v_reason, updated_at = pg_catalog.clock_timestamp()
  where id = p_sale_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_refunded', 'event_ticket_sale', p_sale_id,
    pg_catalog.jsonb_build_object('quantity', v_sale.quantity, 'amount_ngn', v_sale.amount_ngn,
      'refunded_at', null),
    pg_catalog.jsonb_build_object('quantity', v_sale.quantity, 'amount_ngn', v_sale.amount_ngn,
      'refunded_at', pg_catalog.clock_timestamp()), v_reason
  );
end;
$function$;

create or replace function private.guard_event_ledger_entry_write()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_op <> 'INSERT' or pg_catalog.current_setting('app.event_ledger_insert', true) is distinct from 'on' then
    raise exception using errcode = '42501', message = 'Event ledger entries are append-only and status-generated.';
  end if;
  return new;
end;
$function$;

create trigger event_ledger_entries_append_only
before insert or update or delete on public.event_ledger_entries
for each row execute function private.guard_event_ledger_entry_write();

create or replace function private.sync_event_status_to_ledger()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_signed_amount numeric(30, 0);
  v_generation integer;
  v_posting public.event_ledger_entries%rowtype;
  v_ledger_id uuid;
begin
  if old.status = new.status then return new; end if;
  if old.status = 'scheduled' and new.status in ('completed', 'cancelled') then
    select
      coalesce((select pg_catalog.sum(case when t.kind = 'income' then t.amount_ngn::numeric else -t.amount_ngn::numeric end)
        from public.event_financial_transactions as t where t.event_id = new.id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
        from public.event_ticket_sales as s where s.event_id = new.id and s.refunded_at is null), 0)
      into v_signed_amount;
    select coalesce(pg_catalog.max(le.generation), 0) + 1 into v_generation
      from public.event_ledger_entries as le where le.event_id = new.id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
    insert into public.event_ledger_entries (
      event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by
    ) values (
      new.id, v_generation, 'posting', new.status, v_signed_amount, new.status_changed_by
    ) returning id into v_ledger_id;
    perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
    ) values (
      new.status_changed_by, 'event_ledger_posted', 'event_ledger_entry', v_ledger_id, new.id,
      null, pg_catalog.jsonb_build_object('event_id', new.id, 'generation', v_generation,
        'event_status', new.status, 'signed_amount_ngn', v_signed_amount),
      'Automatic event ledger post on event completion or cancellation.'
    );
  elsif old.status in ('completed', 'cancelled') and new.status = 'scheduled' then
    select le.* into v_posting from public.event_ledger_entries as le
      where le.event_id = new.id and le.entry_kind = 'posting'
        and not exists (
          select 1 from public.event_ledger_entries as rev
          where rev.entry_kind = 'reversal' and rev.reverses_entry_id = le.id
        )
      order by le.generation desc limit 1 for update;
    if found then
      perform pg_catalog.set_config('app.event_ledger_insert', 'on', true);
      insert into public.event_ledger_entries (
        event_id, generation, entry_kind, event_status, signed_amount_ngn,
        reverses_entry_id, created_by
      ) values (
        new.id, v_posting.generation, 'reversal', old.status,
        -v_posting.signed_amount_ngn, v_posting.id, new.status_changed_by
      ) returning id into v_ledger_id;
      perform pg_catalog.set_config('app.event_ledger_insert', 'off', true);
      insert into public.audit_log (
        actor_id, action, entity_type, entity_id, event_id, before_data, after_data, reason
      ) values (
        new.status_changed_by, 'event_ledger_reversed', 'event_ledger_entry', v_ledger_id, new.id,
        pg_catalog.jsonb_build_object('posting_id', v_posting.id,
          'signed_amount_ngn', v_posting.signed_amount_ngn),
        pg_catalog.jsonb_build_object('event_id', new.id, 'reverses_entry_id', v_posting.id,
          'signed_amount_ngn', -v_posting.signed_amount_ngn),
        'Automatic event ledger reversal on event reopening.'
      );
    end if;
  end if;
  return new;
end;
$function$;

create trigger events_sync_ledger_status
after update of status on public.events
for each row execute function private.sync_event_status_to_ledger();

create or replace function private.event_finance_summary(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null), 0),
    coalesce((select pg_catalog.sum(case when t.kind = 'income' then t.amount_ngn::numeric else -t.amount_ngn::numeric end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null), 0)
  where p_event_id is not null and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

create or replace function public.event_finance_summary(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security invoker set search_path = '' as $function$
  select * from private.event_finance_summary(p_event_id);
$function$;

create or replace function private.event_ticket_tier_status(p_event_id uuid)
returns table (tier_id uuid, sold_quantity bigint)
language sql stable security definer set search_path = '' as $function$
  select t.id, coalesce(sum(s.quantity), 0)::bigint
  from public.event_ticket_tiers as t
  left join public.event_ticket_sales as s
    on s.tier_id = t.id and s.refunded_at is null
  where t.event_id = p_event_id
    and p_event_id is not null and (select private.is_active_club_member())
  group by t.id;
$function$;

create or replace function public.event_ticket_tier_status(p_event_id uuid)
returns table (tier_id uuid, sold_quantity bigint)
language sql stable security invoker set search_path = '' as $function$
  select * from private.event_ticket_tier_status(p_event_id);
$function$;

create or replace function private.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql stable security definer set search_path = '' as $function$
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
    coalesce((select private.club_dues_income_total()), 0)::numeric
      + coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'income' and t.voided_at is null), 0)::numeric
      - coalesce((select pg_catalog.sum(t.amount_ngn) from public.club_financial_transactions as t
        where t.kind = 'expense' and t.voided_at is null), 0)::numeric
      + coalesce((select pg_catalog.sum(le.signed_amount_ngn) from public.event_ledger_entries as le), 0)::numeric
  where (select private.is_active_club_member());
$function$;

create or replace function public.club_finance_summary()
returns table (dues_income numeric, other_income numeric, expenses numeric, balance numeric)
language sql stable security invoker set search_path = '' as $function$
  select * from private.club_finance_summary();
$function$;

-- Event receipts share the existing private 4 MiB bucket and its restrictive Storage policies.
create table public.event_financial_receipts (
  id uuid primary key,
  transaction_id uuid not null references public.event_financial_transactions (id) on delete restrict,
  object_path text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes integer not null,
  sha256 text,
  uploaded_by uuid not null references public.member_profiles (id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  uploaded_at timestamptz,
  constraint event_financial_receipts_path_check check (
    object_path = 'event/' || transaction_id::text || '/' || id::text || '.' ||
      case content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
      end
  ),
  constraint event_financial_receipts_filename_check check (
    original_filename = pg_catalog.btrim(original_filename)
    and pg_catalog.char_length(original_filename) between 5 and 120
    and original_filename !~ '[[:cntrl:]]'
    and pg_catalog.strpos(original_filename, '/') = 0
    and pg_catalog.strpos(original_filename, pg_catalog.chr(92)) = 0
    and (
      (content_type = 'application/pdf' and original_filename ~* '\.pdf$')
      or (content_type = 'image/jpeg' and original_filename ~* '\.(jpg|jpeg)$')
      or (content_type = 'image/png' and original_filename ~* '\.png$')
    )
  ),
  constraint event_financial_receipts_content_type_check check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint event_financial_receipts_size_check check (size_bytes between 1 and 4194304),
  constraint event_financial_receipts_status_check check (status in ('pending', 'available', 'failed')),
  constraint event_financial_receipts_hash_check check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint event_financial_receipts_state_check check (
    (status in ('pending', 'failed') and sha256 is null and uploaded_at is null)
    or (status = 'available' and sha256 is not null and uploaded_at is not null)
  )
);

alter table public.event_financial_receipts enable row level security;
alter table public.event_financial_receipts force row level security;
create policy event_financial_receipts_active_member_read
  on public.event_financial_receipts for select to authenticated
  using (status = 'available' and (select private.is_active_club_member()));
revoke all on table public.event_financial_receipts from public, anon, authenticated, service_role;
grant select (id, transaction_id, original_filename, content_type, size_bytes, uploaded_at)
  on public.event_financial_receipts to authenticated;
create index event_financial_receipts_transaction_idx
  on public.event_financial_receipts (transaction_id, uploaded_at desc)
  where status = 'available';
create unique index event_financial_receipts_transaction_hash_uidx
  on public.event_financial_receipts (transaction_id, sha256)
  where status = 'available';
create unique index event_financial_receipts_one_pending_per_uploader_uidx
  on public.event_financial_receipts (uploaded_by)
  where status = 'pending';

create or replace function private.reserve_event_finance_receipt(
  p_receipt_id uuid, p_transaction_id uuid, p_original_filename text,
  p_content_type text, p_size_bytes integer
)
returns text language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_transaction public.event_financial_transactions%rowtype;
  v_path text;
begin
  if v_actor_id is null or p_receipt_id is null or p_transaction_id is null
    or p_content_type is null or p_content_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_size_bytes is null or p_size_bytes not between 1 and 4194304 or p_original_filename is null
    or p_original_filename <> pg_catalog.btrim(p_original_filename)
    or pg_catalog.char_length(p_original_filename) not between 5 and 120
    or p_original_filename ~ '[[:cntrl:]]'
    or pg_catalog.strpos(p_original_filename, '/') > 0
    or pg_catalog.strpos(p_original_filename, pg_catalog.chr(92)) > 0
    or not ((p_content_type = 'application/pdf' and p_original_filename ~* '\.pdf$')
      or (p_content_type = 'image/jpeg' and p_original_filename ~* '\.(jpg|jpeg)$')
      or (p_content_type = 'image/png' and p_original_filename ~* '\.png$')) then
    raise exception using errcode = '23514', message = 'The event receipt metadata or file size is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select t.* into v_transaction from public.event_financial_transactions as t where t.id = p_transaction_id;
  if not found or v_transaction.voided_at is not null
    or not (select private.can_manage_event_finances(v_transaction.event_id)) then
    raise exception using errcode = '42501', message = 'An active event financial record and event manager access are required.';
  end if;
  perform 1 from public.events as e where e.id = v_transaction.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found then
    raise exception using errcode = '42501', message = 'Receipts can only be attached before the event is completed or cancelled.';
  end if;
  v_path := 'event/' || p_transaction_id::text || '/' || p_receipt_id::text || '.' ||
    case p_content_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' end;
  insert into public.event_financial_receipts (
    id, transaction_id, object_path, original_filename, content_type, size_bytes, uploaded_by
  ) values (
    p_receipt_id, p_transaction_id, v_path, p_original_filename, p_content_type, p_size_bytes, v_actor_id
  );
  return v_path;
end;
$function$;

create or replace function private.finalize_event_finance_receipt(p_receipt_id uuid, p_sha256 text)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.event_financial_receipts%rowtype;
  v_transaction public.event_financial_transactions%rowtype;
begin
  if v_actor_id is null or p_receipt_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'The event receipt checksum is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  select r.* into v_receipt from public.event_financial_receipts as r where r.id = p_receipt_id for update;
  if not found or v_receipt.uploaded_by is distinct from v_actor_id or v_receipt.status <> 'pending'
    or not exists (select 1 from storage.objects as o
      where o.bucket_id = 'club-finance-receipts' and o.name = v_receipt.object_path) then
    raise exception using errcode = '42501', message = 'This pending event receipt cannot be finalized.';
  end if;
  select t.* into v_transaction from public.event_financial_transactions as t
    where t.id = v_receipt.transaction_id for update;
  if not found or not (select private.is_active_club_member())
    or not (select private.can_manage_event_finances(v_transaction.event_id)) then
    raise exception using errcode = '42501', message = 'Current event financial access is required to finalize this receipt.';
  end if;
  perform 1 from public.events as e where e.id = v_transaction.event_id
    and e.status = 'scheduled' and e.archived_at is null for update;
  if not found then
    raise exception using errcode = '42501', message = 'Receipts can only be finalized for a scheduled event.';
  end if;
  update public.event_financial_receipts set status = 'available', sha256 = p_sha256,
    uploaded_at = pg_catalog.clock_timestamp()
  where id = p_receipt_id;
  perform private.append_event_finance_audit(
    v_actor_id, 'event_finance_receipt_attached', 'event_financial_receipt', p_receipt_id,
    null, pg_catalog.jsonb_build_object('transaction_id', v_receipt.transaction_id,
      'content_type', v_receipt.content_type, 'size_bytes', v_receipt.size_bytes), null
  );
end;
$function$;

create or replace function private.fail_event_finance_receipt_upload(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or p_receipt_id is null then
    raise exception using errcode = '42501', message = 'A signed-in uploader is required.';
  end if;
  update public.event_financial_receipts set status = 'failed'
    where id = p_receipt_id and uploaded_by = v_actor_id and status = 'pending';
end;
$function$;

create or replace function private.get_event_finance_receipt_download(p_receipt_id uuid)
returns table (id uuid, transaction_id uuid, object_path text, content_type text,
  size_bytes integer, sha256 text, original_filename text)
language sql stable security definer set search_path = '' as $function$
  select r.id, r.transaction_id, r.object_path, r.content_type, r.size_bytes, r.sha256, r.original_filename
  from public.event_financial_receipts as r
  join public.event_financial_transactions as t on t.id = r.transaction_id
  join public.events as e on e.id = t.event_id
  where r.id = p_receipt_id and r.status = 'available'
    and (select private.is_active_club_member()) and e.id = t.event_id;
$function$;

create or replace function public.reserve_event_finance_receipt(
  p_receipt_id uuid, p_transaction_id uuid, p_original_filename text,
  p_content_type text, p_size_bytes integer
)
returns text language sql security invoker set search_path = '' as $function$
  select private.reserve_event_finance_receipt(p_receipt_id, p_transaction_id,
    p_original_filename, p_content_type, p_size_bytes);
$function$;

create or replace function public.finalize_event_finance_receipt(p_receipt_id uuid, p_sha256 text)
returns void language sql security invoker set search_path = '' as $function$
  select private.finalize_event_finance_receipt(p_receipt_id, p_sha256);
$function$;

create or replace function public.fail_event_finance_receipt_upload(p_receipt_id uuid)
returns void language sql security invoker set search_path = '' as $function$
  select private.fail_event_finance_receipt_upload(p_receipt_id);
$function$;

create or replace function public.get_event_finance_receipt_download(p_receipt_id uuid)
returns table (id uuid, transaction_id uuid, object_path text, content_type text,
  size_bytes integer, sha256 text, original_filename text)
language sql security invoker set search_path = '' as $function$
  select * from private.get_event_finance_receipt_download(p_receipt_id);
$function$;

create or replace function public.create_event_ticket_tier(
  p_event_id uuid, p_name text, p_price_ngn bigint, p_capacity integer, p_reason text
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.create_event_ticket_tier(p_event_id, p_name, p_price_ngn, p_capacity, p_reason);
$function$;

create or replace function public.update_event_ticket_tier(
  p_tier_id uuid, p_name text, p_price_ngn bigint, p_capacity integer, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.update_event_ticket_tier(p_tier_id, p_name, p_price_ngn, p_capacity, p_reason);
$function$;

create or replace function public.retire_event_ticket_tier(p_tier_id uuid, p_reason text)
returns void language sql security invoker set search_path = '' as $function$
  select private.retire_event_ticket_tier(p_tier_id, p_reason);
$function$;

create or replace function public.record_event_financial_transaction(
  p_event_id uuid, p_kind text, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text, p_payment_method text,
  p_idempotency_key uuid
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.record_event_financial_transaction(p_event_id, p_kind, p_amount_ngn,
    p_transaction_date, p_description, p_payer_payee, p_source_note, p_payment_method, p_idempotency_key);
$function$;

create or replace function public.correct_event_financial_transaction(
  p_transaction_id uuid, p_amount_ngn bigint, p_transaction_date date,
  p_description text, p_payer_payee text, p_source_note text,
  p_payment_method text, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.correct_event_financial_transaction(p_transaction_id, p_amount_ngn,
    p_transaction_date, p_description, p_payer_payee, p_source_note, p_payment_method, p_reason);
$function$;

create or replace function public.void_event_financial_transaction(p_transaction_id uuid, p_reason text)
returns void language sql security invoker set search_path = '' as $function$
  select private.void_event_financial_transaction(p_transaction_id, p_reason);
$function$;

create or replace function public.record_event_ticket_sale(
  p_event_id uuid, p_tier_id uuid, p_quantity integer,
  p_buyer_name text, p_payment_method text, p_idempotency_key uuid
)
returns uuid language sql security invoker set search_path = '' as $function$
  select private.record_event_ticket_sale(p_event_id, p_tier_id, p_quantity,
    p_buyer_name, p_payment_method, p_idempotency_key);
$function$;

create or replace function public.edit_event_ticket_sale(
  p_sale_id uuid, p_quantity integer, p_buyer_name text,
  p_payment_method text, p_reason text
)
returns void language sql security invoker set search_path = '' as $function$
  select private.edit_event_ticket_sale(p_sale_id, p_quantity, p_buyer_name, p_payment_method, p_reason);
$function$;

create or replace function public.refund_event_ticket_sale(p_sale_id uuid, p_reason text)
returns void language sql security invoker set search_path = '' as $function$
  select private.refund_event_ticket_sale(p_sale_id, p_reason);
$function$;

revoke all on function private.can_manage_event_finances(uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_correct_event_finances() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_ticket_tier_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_financial_transaction_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_ticket_sale_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_event_ledger_entry_write() from public, anon, authenticated, service_role;
revoke all on function private.sync_event_status_to_ledger() from public, anon, authenticated, service_role;
revoke all on function private.append_event_finance_audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.create_event_ticket_tier(uuid, text, bigint, integer, text) from public, anon, service_role;
revoke all on function private.update_event_ticket_tier(uuid, text, bigint, integer, text) from public, anon, service_role;
revoke all on function private.retire_event_ticket_tier(uuid, text) from public, anon, service_role;
revoke all on function private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid) from public, anon, service_role;
revoke all on function private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text) from public, anon, service_role;
revoke all on function private.void_event_financial_transaction(uuid, text) from public, anon, service_role;
revoke all on function private.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid) from public, anon, service_role;
revoke all on function private.edit_event_ticket_sale(uuid, integer, text, text, text) from public, anon, service_role;
revoke all on function private.refund_event_ticket_sale(uuid, text) from public, anon, service_role;
revoke all on function private.event_finance_summary(uuid) from public, anon, service_role;
revoke all on function private.event_ticket_tier_status(uuid) from public, anon, service_role;
revoke all on function private.club_finance_summary() from public, anon, service_role;
revoke all on function private.reserve_event_finance_receipt(uuid, uuid, text, text, integer) from public, anon, service_role;
revoke all on function private.finalize_event_finance_receipt(uuid, text) from public, anon, service_role;
revoke all on function private.fail_event_finance_receipt_upload(uuid) from public, anon, service_role;
revoke all on function private.get_event_finance_receipt_download(uuid) from public, anon, service_role;

revoke all on function public.create_event_ticket_tier(uuid, text, bigint, integer, text) from public, anon, service_role;
revoke all on function public.update_event_ticket_tier(uuid, text, bigint, integer, text) from public, anon, service_role;
revoke all on function public.retire_event_ticket_tier(uuid, text) from public, anon, service_role;
revoke all on function public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid) from public, anon, service_role;
revoke all on function public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text) from public, anon, service_role;
revoke all on function public.void_event_financial_transaction(uuid, text) from public, anon, service_role;
revoke all on function public.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid) from public, anon, service_role;
revoke all on function public.edit_event_ticket_sale(uuid, integer, text, text, text) from public, anon, service_role;
revoke all on function public.refund_event_ticket_sale(uuid, text) from public, anon, service_role;
revoke all on function public.event_finance_summary(uuid) from public, anon, service_role;
revoke all on function public.event_ticket_tier_status(uuid) from public, anon, service_role;
revoke all on function public.club_finance_summary() from public, anon, service_role;
revoke all on function public.reserve_event_finance_receipt(uuid, uuid, text, text, integer) from public, anon, service_role;
revoke all on function public.finalize_event_finance_receipt(uuid, text) from public, anon, service_role;
revoke all on function public.fail_event_finance_receipt_upload(uuid) from public, anon, service_role;
revoke all on function public.get_event_finance_receipt_download(uuid) from public, anon, service_role;

grant execute on function private.create_event_ticket_tier(uuid, text, bigint, integer, text) to authenticated;
grant execute on function private.update_event_ticket_tier(uuid, text, bigint, integer, text) to authenticated;
grant execute on function private.retire_event_ticket_tier(uuid, text) to authenticated;
grant execute on function private.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid) to authenticated;
grant execute on function private.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text) to authenticated;
grant execute on function private.void_event_financial_transaction(uuid, text) to authenticated;
grant execute on function private.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid) to authenticated;
grant execute on function private.edit_event_ticket_sale(uuid, integer, text, text, text) to authenticated;
grant execute on function private.refund_event_ticket_sale(uuid, text) to authenticated;
grant execute on function private.event_finance_summary(uuid) to authenticated;
grant execute on function private.event_ticket_tier_status(uuid) to authenticated;
grant execute on function private.club_finance_summary() to authenticated;
grant execute on function private.reserve_event_finance_receipt(uuid, uuid, text, text, integer) to authenticated;
grant execute on function private.finalize_event_finance_receipt(uuid, text) to authenticated;
grant execute on function private.fail_event_finance_receipt_upload(uuid) to authenticated;
grant execute on function private.get_event_finance_receipt_download(uuid) to authenticated;

grant execute on function public.create_event_ticket_tier(uuid, text, bigint, integer, text) to authenticated;
grant execute on function public.update_event_ticket_tier(uuid, text, bigint, integer, text) to authenticated;
grant execute on function public.retire_event_ticket_tier(uuid, text) to authenticated;
grant execute on function public.record_event_financial_transaction(uuid, text, bigint, date, text, text, text, text, uuid) to authenticated;
grant execute on function public.correct_event_financial_transaction(uuid, bigint, date, text, text, text, text, text) to authenticated;
grant execute on function public.void_event_financial_transaction(uuid, text) to authenticated;
grant execute on function public.record_event_ticket_sale(uuid, uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.edit_event_ticket_sale(uuid, integer, text, text, text) to authenticated;
grant execute on function public.refund_event_ticket_sale(uuid, text) to authenticated;
grant execute on function public.event_finance_summary(uuid) to authenticated;
grant execute on function public.event_ticket_tier_status(uuid) to authenticated;
grant execute on function public.club_finance_summary() to authenticated;
grant execute on function public.reserve_event_finance_receipt(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.finalize_event_finance_receipt(uuid, text) to authenticated;
grant execute on function public.fail_event_finance_receipt_upload(uuid) to authenticated;
grant execute on function public.get_event_finance_receipt_download(uuid) to authenticated;
