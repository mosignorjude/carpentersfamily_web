-- An anonymous buyer may now order a ticket: source='online', a buyer's own contact details, a
-- generated reference, and no seller. Only officer-approved rows count as money or capacity, at
-- every site that computes either, so a staged order cannot move a balance even if every other
-- control were bypassed. Design: docs/superpowers/specs/2026-11-05-public-flow-landing-tickets-portal-design.md
-- §3-§7. This one migration holds the schema, the arithmetic, the guest write path and the review
-- rules together: splitting them would leave a deploy where production sums a set nobody approved.

-- 1. Columns on the sales table.
alter table public.event_ticket_sales
  add column if not exists source text not null default 'manual',
  add column if not exists buyer_email text,
  add column if not exists buyer_phone text,
  add column if not exists public_reference text;

-- An online row has no authoring member. Manual rows keep supplying one; nothing but the shape
-- CHECK below keeps the two from blurring.
alter table public.event_ticket_sales alter column seller_id drop not null;

-- 2. Constraints, guarded the way 20261028000000:29-41 does so a re-run is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_source_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_source_check
      check (source in ('manual', 'online'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_source_shape_check'
  ) then
    -- No created_by clause: the column does not exist on this table (plan deviation 7).
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_source_shape_check
      check (
        (source = 'manual' and seller_id is not null)
        or (source = 'online' and seller_id is null
            and buyer_email is not null and buyer_phone is not null
            and public_reference is not null)
      );
  end if;

  -- The house email rules, copied from notification_outbox_recipient_email_check
  -- (20261027000000:108-112): stored normalized, so the lookup's comparison cannot be
  -- case-tricked and one address has one spelling in the database.
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_buyer_email_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_buyer_email_check
      check (
        buyer_email is null
        or (buyer_email = pg_catalog.lower(pg_catalog.btrim(buyer_email))
            and pg_catalog.char_length(buyer_email) between 3 and 320
            and buyer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_buyer_phone_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_buyer_phone_check
      check (
        buyer_phone is null
        or (buyer_phone ~ '^\+?[0-9]{10,15}$' and buyer_phone !~ '[[:cntrl:]]')
      );
  end if;

  -- CF- + eight characters from an alphabet with no I/O/0/1. The prototype's `CF-2026-8492`
  -- is refused: 9000 values by Math.random() is brute-forceable, and a year baked into a stored
  -- column goes stale on 1 January.
  if not exists (
    select 1 from pg_constraint where conname = 'event_ticket_sales_public_reference_check'
  ) then
    alter table public.event_ticket_sales
      add constraint event_ticket_sales_public_reference_check
      check (
        public_reference is null
        or public_reference ~ '^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
      );
  end if;
end $$;

-- 3. `cancelled` exists for ticket sales only. event_financial_transactions keeps its three
--    values: only a ticket can be cancelled without any money having moved.
do $$
begin
  alter table public.event_ticket_sales
    drop constraint event_ticket_sales_verification_status_check;
  alter table public.event_ticket_sales
    add constraint event_ticket_sales_verification_status_check
    check (verification_status in ('recorded', 'approved', 'rejected', 'cancelled'));
end $$;

-- 4. Indexes.
create unique index if not exists event_ticket_sales_public_reference_uidx
  on public.event_ticket_sales (public_reference)
  where public_reference is not null;

-- event_ticket_sales_seller_idempotency_uidx (20261003102501:137) cannot see a NULL seller:
-- NULLs are distinct in a unique index, so every online row could reuse one key. This is the
-- half that makes a double-clicked guest submit safe (deviation 8).
create unique index if not exists event_ticket_sales_online_idempotency_uidx
  on public.event_ticket_sales (idempotency_key)
  where seller_id is null;

-- The capacity scans now lead with the status they filter on.
create index if not exists event_ticket_sales_tier_approved_idx
  on public.event_ticket_sales (tier_id, created_at, id)
  where refunded_at is null and verification_status = 'approved';

-- 5. Grants. Event finance tables grant SELECT per column, so an ungranted new column silently
--    empties a whole dashboard read rather than erroring (20261003102501:234-241). anon and
--    service_role get nothing here, as elsewhere in this migration.
grant select (source, buyer_email, buyer_phone, public_reference)
  on public.event_ticket_sales to authenticated;

-- 6. A guest's proof of payment has no uploader. finance_receipts.uploaded_by is `not null`
--    (20261025120000:55) and nothing authorizes on it — can_read_finance_receipt grants any active
--    member read for scope 'event_ticket' (20261025120000:137-139). Deviation 18.
alter table public.finance_receipts alter column uploaded_by drop not null;


-- 7. Approved-only arithmetic. The rule lives at every site that sums event_ticket_sales, in one
--    migration, so no deploy can leave a window where production sums a set nobody approved.
--    event_financial_transactions keeps its 20261102150000 "did cash move" rule (plan deviation 17).

-- 7a. private.event_cash_totals — the live club balance AND the closing snapshot both read this.
create or replace function private.event_cash_totals(p_event_id uuid)
returns table (inflow numeric, outflow numeric, net numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  select totals.v_inflow, totals.v_outflow, totals.v_inflow - totals.v_outflow
  from (
    select
      (
        coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
          from public.event_financial_transactions as t
          where t.kind = 'income' and t.payment_status = 'paid'
            and t.voided_at is null
            and (p_event_id is null or t.event_id = p_event_id)), 0::numeric)
        + coalesce((select pg_catalog.sum(s.amount_ngn::numeric)
          from public.event_ticket_sales as s
          where s.refunded_at is null
            and s.verification_status = 'approved'
            and (p_event_id is null or s.event_id = p_event_id)), 0::numeric)
      )::numeric as v_inflow,
      coalesce((select pg_catalog.sum(t.amount_ngn::numeric)
        from public.event_financial_transactions as t
        where t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
          and t.voided_at is null
          and (p_event_id is null or t.event_id = p_event_id)), 0::numeric
      )::numeric as v_outflow
  ) as totals;
$function$;

-- 7b. private.event_finance_summary
create or replace function private.event_finance_summary(p_event_id uuid)
returns table (
  income_ngn numeric, expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0)
  where p_event_id is not null and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

-- 7c. private.event_finance_budget_summary
create or replace function private.event_finance_budget_summary(p_event_id uuid)
returns table (
  received_income_ngn numeric, actual_expense_ngn numeric,
  committed_expense_ngn numeric, ticket_income_ngn numeric,
  tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid' and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('pending', 'unpaid') and t.voided_at is null), 0),
    coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(s.quantity)::bigint from public.event_ticket_sales as s
      where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null), 0)
      + coalesce((select pg_catalog.sum(s.amount_ngn::numeric) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.refunded_at is null and s.verification_status = 'approved'), 0)
  where p_event_id is not null and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id);
$function$;

-- 7d. private.event_ticket_tier_status
create or replace function private.event_ticket_tier_status(p_event_id uuid)
returns table (tier_id uuid, sold_quantity bigint)
language sql stable security definer set search_path = '' as $function$
  select t.id, coalesce(sum(s.quantity), 0)::bigint
  from public.event_ticket_tiers as t
  left join public.event_ticket_sales as s
    on s.tier_id = t.id and s.refunded_at is null and s.verification_status = 'approved'
  where t.event_id = p_event_id
    and p_event_id is not null and (select private.is_active_club_member())
  group by t.id;
$function$;

-- 7e. private.event_finance_ticket_tier_summary
create or replace function private.event_finance_ticket_tier_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  tier_id uuid, tier_name text, price_ngn bigint, capacity integer,
  sold_quantity bigint, ticket_income_ngn numeric, retired_at timestamptz
)
language sql stable security definer set search_path = '' as $function$
  select tier.id, tier.name, tier.price_ngn, tier.capacity,
    coalesce(pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when sale.refunded_at is null then sale.quantity else 0 end
      else
        case when (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.quantity else 0 end
        - case when sale.refunded_at is not null and (sale.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.quantity else 0 end
      end)::bigint, 0),
    coalesce(pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when sale.refunded_at is null then sale.amount_ngn::numeric else 0 end
      else
        case when (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.amount_ngn::numeric else 0 end
        - case when sale.refunded_at is not null and (sale.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then sale.amount_ngn::numeric else 0 end
      end), 0), tier.retired_at
  from public.event_ticket_tiers as tier
  left join public.event_ticket_sales as sale
    on sale.tier_id = tier.id and sale.event_id = tier.event_id
    and sale.verification_status = 'approved'
    and ((p_start_date is null and p_end_date is null and sale.refunded_at is null)
      or ((p_start_date is not null or p_end_date is not null) and (
        (sale.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
        or (sale.refunded_at is not null and
          (sale.refunded_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31'))
      )))
  where p_event_id is not null and tier.event_id = p_event_id
    and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id)
    and (p_start_date is null or p_end_date is null or p_start_date <= p_end_date)
  group by tier.id, tier.name, tier.price_ngn, tier.capacity, tier.retired_at
  order by tier.created_at, tier.id;
$function$;

-- 7f. private.event_finance_report_summary
create or replace function private.event_finance_report_summary(
  p_event_id uuid, p_start_date date default null, p_end_date date default null
)
returns table (
  paid_income_ngn numeric, pending_income_ngn numeric, unpaid_income_ngn numeric,
  actual_expense_ngn numeric, committed_expense_ngn numeric,
  ticket_income_ngn numeric, tickets_sold bigint, net_result_ngn numeric
)
language sql stable security definer set search_path = '' as $function$
  select
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'paid'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'pending'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'income' and t.payment_status = 'unpaid'
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('paid', 'deposit')
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(t.amount_ngn::numeric) from public.event_financial_transactions as t
      where t.event_id = p_event_id and t.kind = 'expense' and t.payment_status in ('pending', 'unpaid')
        and t.voided_at is null and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0),
    coalesce((select pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when s.refunded_at is null then s.amount_ngn::numeric else 0 end
      else
        case when (s.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.amount_ngn::numeric else 0 end
        - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.amount_ngn::numeric else 0 end
      end)
      from public.event_ticket_sales as s where s.event_id = p_event_id and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(case
      when p_start_date is null and p_end_date is null then
        case when s.refunded_at is null then s.quantity else 0 end
      else
        case when (s.created_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.quantity else 0 end
        - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
          coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
          then s.quantity else 0 end
      end)::bigint
      from public.event_ticket_sales as s where s.event_id = p_event_id and s.verification_status = 'approved'), 0),
    coalesce((select pg_catalog.sum(case
      when t.kind = 'income' and t.payment_status = 'paid' then t.amount_ngn::numeric
      when t.kind = 'expense' and t.payment_status in ('paid', 'deposit') then -t.amount_ngn::numeric
      else 0 end)
      from public.event_financial_transactions as t where t.event_id = p_event_id and t.voided_at is null
        and (p_start_date is null or t.transaction_date >= p_start_date)
        and (p_end_date is null or t.transaction_date <= p_end_date)), 0)
      + coalesce((select pg_catalog.sum(case
        when p_start_date is null and p_end_date is null then
          case when s.refunded_at is null then s.amount_ngn::numeric else 0 end
        else
          case when (s.created_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
            then s.amount_ngn::numeric else 0 end
          - case when s.refunded_at is not null and (s.refunded_at at time zone 'Africa/Lagos')::date between
            coalesce(p_start_date, date '1900-01-01') and coalesce(p_end_date, date '9999-12-31')
            then s.amount_ngn::numeric else 0 end
        end)
        from public.event_ticket_sales as s where s.event_id = p_event_id and s.verification_status = 'approved'), 0)
  where p_event_id is not null
    and (select private.is_active_club_member())
    and exists (select 1 from public.events as e where e.id = p_event_id)
    and (p_start_date is null or p_end_date is null or p_start_date <= p_end_date);
$function$;

-- 7g. public.get_public_ticketed_events
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
      and ets.verification_status = 'approved'
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

-- 7h. private.guard_event_ticket_sale_write
-- Note: record_event_ticket_sale and the write guard can no longer refuse an over-capacity staged
-- row. That is intended: an unapproved row reserves nothing. The binding check moves to approval time.
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
    if new.created_at is null or new.updated_at is null or new.created_at <> new.updated_at then
      raise exception using errcode = '42501', message = 'Ticket sale timestamps must match at creation.';
    end if;
    if new.unit_price_ngn <> v_tier.price_ngn then
      raise exception using errcode = '23514', message = 'Ticket unit price must match tier price.';
    end if;
    if new.refunded_at is not null or new.refunded_by is not null or new.refund_reason is not null then
      raise exception using errcode = '42501', message = 'A new ticket sale cannot be refunded at creation.';
    end if;
  else
    if new.id is distinct from old.id or new.event_id is distinct from old.event_id
      or new.tier_id is distinct from old.tier_id or new.seller_id is distinct from old.seller_id
      or new.unit_price_ngn is distinct from old.unit_price_ngn
      or new.idempotency_key is distinct from old.idempotency_key
      or new.created_at is distinct from old.created_at or new.updated_at <= old.updated_at then
      raise exception using errcode = '42501', message = 'Ticket-sale price and ownership history cannot be rewritten.';
    end if;
    v_exclude_sale_id := old.id;
    if old.refunded_at is null and new.refunded_at is not null then
      if not (
        (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))
      ) then
        raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may refund a ticket sale.';
      end if;
      if new.refunded_by is distinct from v_actor_id or new.refund_reason is null
        or pg_catalog.char_length(pg_catalog.btrim(new.refund_reason)) not between 1 and 500
        or new.quantity is distinct from old.quantity
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
      and s.verification_status = 'approved'
      and s.id is distinct from v_exclude_sale_id;
  if new.refunded_at is null and v_sold + new.quantity > v_tier.capacity then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;
  return new;
end;
$function$;

-- 7i. public.record_event_ticket_sale
create or replace function public.record_event_ticket_sale(
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_buyer_name text,
  p_payment_method text,
  p_idempotency_key uuid,
  p_sale_id uuid default null,
  p_receipt_id uuid default null,
  p_receipt_object_key text default null,
  p_receipt_filename text default null,
  p_receipt_content_type text default null,
  p_receipt_size_bytes integer default null,
  p_receipt_sha256 text default null
)
returns table (
  sale_id uuid,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_sid uuid := coalesce(p_sale_id, gen_random_uuid());
  v_existing public.event_ticket_sales%rowtype;
  v_tier public.event_ticket_tiers%rowtype;
  v_expected_key text;
  v_sold bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active member account is required.';
  end if;

  if p_event_id is null or p_tier_id is null or p_quantity is null or p_quantity not between 1 and 1000
     or p_idempotency_key is null
     or (p_buyer_name is not null and (p_buyer_name <> pg_catalog.btrim(p_buyer_name)
       or pg_catalog.char_length(p_buyer_name) not between 1 and 160 or p_buyer_name ~ '[[:cntrl:]]'))
     or p_payment_method not in ('bank_transfer', 'cash') then
    raise exception using errcode = '23514', message = 'The ticket sale values are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;

  if not (select private.can_manage_event_finances(p_event_id)) then
    raise exception using errcode = '42501', message = 'Only authorized event finance managers may record ticket sales.';
  end if;

  -- Replay check
  select s.* into v_existing
  from public.event_ticket_sales as s
  where s.seller_id = v_actor_id and s.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.tier_id = p_tier_id
       and v_existing.buyer_name is not distinct from p_buyer_name
       and v_existing.quantity = p_quantity
       and v_existing.payment_method = p_payment_method then
      return query select v_existing.id, true;
      return;
    else
      raise exception using errcode = '23505', message = 'This submission key was already used for different ticket sale data.';
    end if;
  end if;

  select * into v_tier from public.event_ticket_tiers where id = p_tier_id and event_id = p_event_id;
  if not found then
    raise exception using errcode = '23503', message = 'Ticket tier not found.';
  end if;

  select coalesce(pg_catalog.sum(s.quantity), 0) into v_sold
  from public.event_ticket_sales as s where s.tier_id = p_tier_id and s.refunded_at is null
    and s.verification_status = 'approved';
  if v_sold + p_quantity > v_tier.capacity then
    raise exception using errcode = '23514', message = 'Ticket tier capacity has been reached.';
  end if;

  if p_payment_method = 'bank_transfer' then
    if p_receipt_id is null
       or p_receipt_object_key is null
       or p_receipt_filename is null
       or p_receipt_content_type is null
       or p_receipt_size_bytes is null
       or p_receipt_sha256 is null then
      raise exception using errcode = '22023', message = 'Receipt metadata required for bank transfer ticket sales.';
    end if;

    v_expected_key := 'receipts/event_ticket/' || v_sid::text || '/' || p_receipt_id::text || '.' ||
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
      raise exception using errcode = '22023', message = 'Receipt metadata forbidden for cash ticket sales.';
    end if;
  end if;

  insert into public.event_ticket_sales (
    id, event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, created_at, updated_at
  ) values (
    v_sid, p_event_id, p_tier_id, v_actor_id, p_buyer_name, p_quantity, v_tier.price_ngn,
    p_payment_method, p_idempotency_key, v_now, v_now
  );

  if p_payment_method = 'bank_transfer' then
    insert into public.finance_receipts (
      id, scope, event_ticket_sale_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      p_receipt_id, 'event_ticket', v_sid, p_receipt_object_key, p_receipt_filename,
      p_receipt_content_type, p_receipt_size_bytes, p_receipt_sha256, v_actor_id
    );
  end if;

  perform private.append_event_finance_audit(
    v_actor_id, 'event_ticket_sale_recorded', 'event_ticket_sale', v_sid, null,
    pg_catalog.jsonb_build_object(
      'event_id', p_event_id, 'tier_id', p_tier_id,
      'quantity', p_quantity, 'unit_price_ngn', v_tier.price_ngn,
      'amount_ngn', v_tier.price_ngn * p_quantity,
      'payment_method', p_payment_method
    ), null
  );

  return query select v_sid, false;
end;
$$;

-- 7j. private.guard_event_ticket_tier_write
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
    where s.tier_id = old.id and s.refunded_at is null
      and s.verification_status = 'approved';
  if new.capacity < v_sold then
    raise exception using errcode = '23514', message = 'Tier capacity cannot be lower than sold tickets.';
  end if;
  return new;
end;
$function$;

-- 8. §5: an event cannot close while anything on it awaits review, so nothing can be left staged
--    behind a closed door. The message is phrase-stable and carries no count: raw database text is
--    matched into an allowlisted notice by rpcErrorNotice, and the counts go to the audit trail.
create or replace function private.set_event_status(
  p_event_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_event public.events%rowtype;
  v_reason text := pg_catalog.btrim(p_reason);
  v_pending_sales bigint;
  v_pending_transactions bigint;
begin
  if p_event_id is null or p_status is null
    or p_status not in ('scheduled', 'completed', 'cancelled')
    or p_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500
    or v_reason <> p_reason or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '23514', message = 'The event status request or reason is invalid.';
  end if;
  perform 1 from private.administration_guard where singleton_id for update;
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if p_status = 'scheduled' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) then
      raise exception using errcode = '42501', message = 'Only an Admin or Backup Admin may reopen an event.';
    end if;
  elsif not (
    (select private.has_club_role('executive'))
    or (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
    or (select private.has_event_role(p_event_id, 'lead'))
  ) then
    raise exception using errcode = '42501', message = 'Only an Executive, Admin, Backup Admin, or this event''s lead may complete or cancel it.';
  end if;

  select e.* into v_event from public.events as e
  where e.id = p_event_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The event is unavailable.'; end if;
  if v_event.archived_at is not null then
    raise exception using errcode = '42501', message = 'Archived events are read-only.';
  end if;
  if v_event.status = p_status then return; end if;
  if p_status = 'scheduled' then
    if v_event.status not in ('completed', 'cancelled') then
      raise exception using errcode = '42501', message = 'Only a completed or cancelled event can be reopened.';
    end if;
  elsif v_event.status <> 'scheduled' then
    raise exception using errcode = '42501', message = 'Only a scheduled event can be completed or cancelled.';
  end if;

  if p_status in ('completed', 'cancelled') then
    select
      (select pg_catalog.count(*) from public.event_ticket_sales as s
        where s.event_id = p_event_id and s.verification_status = 'recorded'),
      (select pg_catalog.count(*) from public.event_financial_transactions as t
        where t.event_id = p_event_id and t.verification_status = 'recorded')
    into v_pending_sales, v_pending_transactions;

    if v_pending_sales > 0 or v_pending_transactions > 0 then
      raise exception using errcode = '22000',
        message = 'Ticket sales or transactions still await review on this event.';
    end if;
  end if;

  update public.events set
    status = p_status, status_changed_at = pg_catalog.clock_timestamp(),
    status_changed_by = v_actor_id, updated_by = v_actor_id,
    updated_at = pg_catalog.clock_timestamp()
  where id = p_event_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, before_data, after_data, reason
  ) values (
    v_actor_id,
    case
      when p_status = 'scheduled' then 'event_reopened'
      when p_status = 'completed' then 'event_completed'
      else 'event_cancelled'
    end,
    'event', p_event_id,
    pg_catalog.jsonb_build_object('status', v_event.status),
    pg_catalog.jsonb_build_object('status', p_status),
    v_reason
  );
end;
$function$;
