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
