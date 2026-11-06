begin;

select no_plan();

-- Fixtures. These UUID blocks belong to this suite alone: 7a7a7a7a-… for auth.users,
-- 7b7b7b7b-… for club rows. Nothing else in supabase/tests/database/ uses either prefix.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('7a7a7a7a-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'till-admin@example.test', '', '{}'::jsonb, '{"full_name":"Till Admin","username":"till_admin"}'::jsonb, now()),
  ('7a7a7a7a-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'till-seller@example.test', '', '{}'::jsonb, '{"full_name":"Till Seller","username":"till_seller"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id in (
  '7a7a7a7a-0000-0000-0000-000000000001'::uuid,
  '7a7a7a7a-0000-0000-0000-000000000002'::uuid
);
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('7a7a7a7a-0000-0000-0000-000000000001', 'admin', '7a7a7a7a-0000-0000-0000-000000000001', 'Till test primary Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000001', true);

select set_config('test.till_event', public.create_event(
  'Box Office Test Gala', 'party', pg_catalog.clock_timestamp() + interval '21 days',
  'Club Hall', null, false, false, true, true, true, true
)::text, true);
select set_config('test.till_tier', public.create_event_ticket_tier(
  current_setting('test.till_event')::uuid, 'Standard', 15000, 20, 'Test capacity'
)::text, true);

reset role;

-- 1. The four new columns exist, and the manual default keeps every old row manual.
select has_column('public', 'event_ticket_sales', 'source', 'source column exists');
select has_column('public', 'event_ticket_sales', 'buyer_email', 'buyer_email column exists');
select has_column('public', 'event_ticket_sales', 'buyer_phone', 'buyer_phone column exists');
select has_column('public', 'event_ticket_sales', 'public_reference', 'public_reference column exists');

select is(
  (select pg_catalog.count(*) from public.event_ticket_sales),
  0::bigint,
  'suite starts with an empty sales table'
);

-- 2. cancelled is a legal fourth review status.
select lives_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 'Cancelled Probe', 1, 15000,
    'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000a1', 'cancelled'
  )
$$, 'cancelled is accepted by the status check');

-- 3. The online shape CHECK (deviation 7: there is no created_by column, so the rule is about
--    the seller and the buyer's own contact details).
select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, buyer_name, quantity, unit_price_ngn,
    payment_method, idempotency_key, source, buyer_email, buyer_phone
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 'Blurred Row', 1, 15000,
    'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000a2', 'online',
    'blurred@example.test', '08031234567'
  )
$$, '23514', 'an online row may not carry a seller');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a3', 'online',
    'noseller@example.test', '08031234567'
  )
$$, '23514', 'an online row without a reference is refused');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a4', 'online',
    'badreference@example.test', '08031234567', 'CF-2026-8492'
  )
$$, '23514', 'the prototype reference shape is refused: no separators, eight unambiguous chars');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a5', 'online',
    'MixedCase@Example.Test', '08031234567', 'CF-K7M2QX9B'
  )
$$, '23514', 'buyer_email is stored normalized, not as typed');

select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000a6', 'online',
    'good@example.test', 'call me', 'CF-K7M2QX9C'
  )
$$, '23514', 'buyer_phone must be digits with an optional leading +');

-- 4. Two online rows may not reuse one idempotency key (deviation 8).
select throws_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method,
    idempotency_key, source, buyer_email, buyer_phone, public_reference
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000b1', 'online',
    'double@click.example.test', '08031234567', 'CF-K7M2QX9D'
  ), (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    1, 15000, 'bank_transfer',
    '7b7b7b7b-0000-0000-0000-0000000000b1', 'online',
    'double@click.example.test', '08031234567', 'CF-K7M2QX9E'
  )
$$, '23505', 'a repeated online idempotency key violates the partial unique index');

-- 5. The seller-scoped index still treats NULL sellers as distinct: it must not be "fixed" by
--    dropping it, because manual rows keep relying on it.
select lives_ok($$
  insert into public.event_ticket_sales (
    event_id, tier_id, seller_id, quantity, unit_price_ngn, payment_method,
    idempotency_key
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    '7a7a7a7a-0000-0000-0000-000000000002', 1, 15000, 'cash',
    '7b7b7b7b-0000-0000-0000-0000000000b2'
  )
$$, 'a manual row with a null-source default still inserts');

-- ── Approved-only arithmetic ────────────────────────────────────────────────────────────
-- A staged online sale and an approved one, side by side, on a tier with capacity 20.
select set_config('test.till_staged', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    3, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c1', 'online',
    'staged@example.test', '08031234567', 'CF-K7M2QX9F', 'recorded'
  ) returning id)::text, true);

select set_config('test.till_ok', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    2, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c2', 'online',
    'approved@example.test', '08031234568', 'CF-K7M2QX9G', 'approved'
  ) returning id)::text, true);

-- 6. The club balance and the per-event cash totals count the approved sale only.
select is(
  (select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  30000::numeric,
  'event_cash_totals counts approved ticket sales only');
select is(
  (select net from private.event_cash_totals(null)),
  30000::numeric,
  'the club-wide balance sees the same approved-only event cash');

-- 7. Every reporting aggregate agrees with it.
select is((select ticket_income_ngn from private.event_finance_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'event_finance_summary counts approved sales only');
select is((select tickets_sold from private.event_finance_summary(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'event_finance_summary counts approved quantity only');
select is((select ticket_income_ngn from private.event_finance_budget_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'event_finance_budget_summary counts approved sales only');
select is((select sold_quantity from private.event_ticket_tier_status(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'tier status sells only what an officer approved');
select is((select sold_quantity from private.event_ticket_tier_status(null)), 0::bigint,
  'tier status stays gated for a null event');

select is((select ticket_income_ngn from private.event_finance_ticket_tier_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'tier summary counts approved sales with no date range');
select is((select ticket_income_ngn from private.event_finance_ticket_tier_summary(
  current_setting('test.till_event')::uuid,
  ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date - 1),
  ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1))),
  30000::numeric, 'tier summary counts approved sales inside a date range');

select is((select ticket_income_ngn from private.event_finance_report_summary(
  current_setting('test.till_event')::uuid)), 30000::numeric,
  'report summary counts approved sales with no date range');
select is((select tickets_sold from private.event_finance_report_summary(
  current_setting('test.till_event')::uuid)), 2::bigint,
  'report summary counts approved quantity with no date range');

-- 8. §4's branch asymmetry. A rejected row carries refunded_at as well as its status; if the
--    ranged subtract branch could still see it, a sale created before the window and rejected
--    inside it would subtract money that was never added.
select set_config('test.till_rej', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status,
    refunded_at, refunded_by, refund_reason
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    4, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c3', 'online',
    'rejected@example.test', '08031234569', 'CF-K7M2QX9H', 'rejected',
    pg_catalog.clock_timestamp(), '7a7a7a7a-0000-0000-0000-000000000001',
    'No matching transfer'
  ) returning id)::text, true);

select set_config('test.till_cancel', (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    5, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c4', 'online',
    'cancelled@example.test', '08031234570', 'CF-K7M2QX9J', 'cancelled'
  ) returning id)::text, true);

select is((select ticket_income_ngn from private.event_finance_report_summary(
    current_setting('test.till_event')::uuid)), 30000::numeric,
  'a rejected and a cancelled sale move the un-ranged total by nothing');
select is((select ticket_income_ngn from private.event_finance_report_summary(
    current_setting('test.till_event')::uuid,
    ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date - 1),
    ((pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1))),
  30000::numeric,
  'the ranged subtract branch ignores a rejected row, so nothing is over-subtracted');
select is((select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  30000::numeric, 'club balance ignores rejected and cancelled');

-- 9. Deviation 17 pinned from the other side: an officer transaction that is staged but paid
--    STILL moves event cash, because 20261102150000 defines event money as "did cash move".
--    This assertion exists so nobody applies the sales rule to transactions by accident.
select set_config('test.till_txn', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.till_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 10000,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'Sound hire', p_source_note => 'Staged but paid',
  p_payment_method => 'cash',
  p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000c5'::uuid
) as summary;

select is((select net from private.event_cash_totals(current_setting('test.till_event')::uuid)),
  20000::numeric,
  'a paid but unreviewed event transaction still counts as cash that moved');

-- 10. §5 close gate. The event cannot close while a sale is staged.
select throws_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Wrapping up'
  )
$$, '22000', 'Ticket sales or transactions still await review on this event.',
  'closing is refused while a ticket sale awaits review');

-- Cancelling the staged rows, then the same close succeeds.
update public.event_ticket_sales set verification_status = 'cancelled'
where verification_status = 'recorded';

select lives_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Wrapping up'
  )
$$, 'closing works once nothing is staged');

-- The same-status call is still a no-op, gate or no gate (20261003101500:1025).
select lives_ok($$
  select public.set_event_status(
    current_setting('test.till_event')::uuid, 'completed', 'Again'
  )
$$, 're-submitting the current status stays a no-op');

-- 11. The public tier list agrees: `sold` is approved quantity. get_public_ticketed_events()
--     returns one jsonb; route it through a setting, as event_duration_12hour_test.sql does.
select set_config('test.till_public', public.get_public_ticketed_events()::text, true);
select is(
  (select (current_setting('test.till_public')::jsonb #>> '{events,0,tiers,0,sold}')),
  '2',
  'the public storefront sells approved tickets only');

select * from finish();

reset role;
rollback;
