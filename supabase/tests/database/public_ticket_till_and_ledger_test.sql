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
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000002', true);

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
select set_config('request.jwt.claim.sub', '', true);

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
$$, '23514', null, 'an online row may not carry a seller');

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
$$, '23514', null, 'an online row without a reference is refused');

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
$$, '23514', null, 'the prototype reference shape is refused: no separators, eight unambiguous chars');

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
$$, '23514', null, 'buyer_email is stored normalized, not as typed');

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
$$, '23514', null, 'buyer_phone must be digits with an optional leading +');

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
$$, '23505', null, 'a repeated online idempotency key violates the partial unique index');

-- 5. The seller-scoped index still treats NULL sellers as distinct: it must not be "fixed" by
--    dropping it, because manual rows keep relying on it.
select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000002', true);

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
alter table public.event_ticket_sales disable trigger event_ticket_sales_write_guard;

with staged_ins as (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    3, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c1', 'online',
    'staged@example.test', '08031234567', 'CF-K7M2QX9F', 'recorded'
  ) returning id
)
select set_config('test.till_staged', id::text, true) from staged_ins;

with ok_ins as (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    2, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c2', 'online',
    'approved@example.test', '08031234568', 'CF-K7M2QX9G', 'approved'
  ) returning id
)
select set_config('test.till_ok', id::text, true) from ok_ins;

alter table public.event_ticket_sales enable trigger event_ticket_sales_write_guard;

select set_config('request.jwt.claim.sub', '7a7a7a7a-0000-0000-0000-000000000001', true);

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
select is(coalesce((select sold_quantity from private.event_ticket_tier_status(null)), 0::bigint), 0::bigint,
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
alter table public.event_ticket_sales disable trigger event_ticket_sales_write_guard;

with rej_ins as (
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
  ) returning id
)
select set_config('test.till_rej', id::text, true) from rej_ins;

with cancel_ins as (
  insert into public.event_ticket_sales (
    event_id, tier_id, quantity, unit_price_ngn, payment_method, idempotency_key,
    source, buyer_email, buyer_phone, public_reference, verification_status
  ) values (
    current_setting('test.till_event')::uuid, current_setting('test.till_tier')::uuid,
    5, 15000, 'bank_transfer', '7b7b7b7b-0000-0000-0000-0000000000c4', 'online',
    'cancelled@example.test', '08031234570', 'CF-K7M2QX9J', 'cancelled'
  ) returning id
)
select set_config('test.till_cancel', id::text, true) from cancel_ins;

alter table public.event_ticket_sales enable trigger event_ticket_sales_write_guard;

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
  p_description => 'Sound hire', p_payer_payee => 'Sound hire', p_source_note => null,
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
alter table public.event_ticket_sales disable trigger event_ticket_sales_write_guard;
update public.event_ticket_sales set verification_status = 'cancelled'
where verification_status = 'recorded';
alter table public.event_ticket_sales enable trigger event_ticket_sales_write_guard;

alter table public.event_financial_transactions disable trigger event_financial_transactions_write_guard;
update public.event_financial_transactions set verification_status = 'approved'
where verification_status = 'recorded';
alter table public.event_financial_transactions enable trigger event_financial_transactions_write_guard;

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

-- Reopen so the storefront can list it as scheduled.
select public.set_event_status(
  current_setting('test.till_event')::uuid, 'scheduled', 'Reopening for storefront check'
);

-- 11. The public tier list agrees: `sold` is approved quantity. get_public_ticketed_events()
--     returns one jsonb; route it through a setting, as event_duration_12hour_test.sql does.
select set_config('test.till_public', public.get_public_ticketed_events()::text, true);
select is(
  (select (current_setting('test.till_public')::jsonb #>> '{events,0,tiers,0,sold}')),
  '2',
  'the public storefront sells approved tickets only');

-- ── The guest write path ────────────────────────────────────────────────────────────────
-- The tier must have room for the throttle test's 20 orders, and the suite's tier has capacity 20.
reset role;
alter table public.event_ticket_tiers disable trigger event_ticket_tiers_write_guard;
update public.event_ticket_tiers set capacity = 200
where id = current_setting('test.till_tier')::uuid;
alter table public.event_ticket_tiers enable trigger event_ticket_tiers_write_guard;

select set_config('request.jwt.claim.sub', '', true);
set local role anon;

-- 12. A well-formed order is accepted and returns both secrets the buyer needs.
select set_config('test.till_guest', o->>'public_reference', true)
from public.submit_ticket_order(
  p_event_id => current_setting('test.till_event')::uuid,
  p_tier_id => current_setting('test.till_tier')::uuid,
  p_quantity => 2, p_buyer_name => 'Chidi Obi',
  p_buyer_email => '  Chidi@Example.TEST  ', p_buyer_phone => '08031234571',
  p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000d1',
  p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000d2',
  p_receipt_id => '7b7b7b7b-0000-0000-0000-0000000000d3',
  p_receipt_filename => 'transfer-slip.pdf', p_receipt_object_key =>
    'receipts/event_ticket/7b7b7b7b-0000-0000-0000-0000000000d2/7b7b7b7b-0000-0000-0000-0000000000d3.pdf',
  p_receipt_content_type => 'application/pdf', p_receipt_size_bytes => 20480,
  p_receipt_sha256 => pg_catalog.repeat('a', 64)
) as o;

select matches(
  (select current_setting('test.till_guest')), '^CF-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$',
  'a guest order returns a CF- reference from the unambiguous alphabet');

reset role;

select is(
  (select s.verification_status from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  'recorded', 'an online order starts staged, so it counts as nothing');
select is(
  (select s.buyer_email from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  'chidi@example.test', 'the buyer email is normalized before it is stored');
select is(
  (select s.seller_id from public.event_ticket_sales as s
    where s.id = '7b7b7b7b-0000-0000-0000-0000000000d2'),
  NULL::uuid, 'an online order has no seller');

set local role anon;

-- 13. The same key returns the same reference instead of a second order.
select is(
  (select o->>'public_reference' from public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid,
    p_quantity => 2, p_buyer_name => 'Chidi Obi',
    p_buyer_email => 'chidi@example.test', p_buyer_phone => '08031234571',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000d1',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000d9',
    p_receipt_id => '7b7b7b7b-0000-0000-0000-0000000000da',
    p_receipt_filename => 'transfer-slip.pdf', p_receipt_object_key => 'x',
    p_receipt_content_type => 'application/pdf', p_receipt_size_bytes => 20480,
    p_receipt_sha256 => pg_catalog.repeat('a', 64)
  ) as o),
  current_setting('test.till_guest'),
  'a replayed idempotency key returns the original reference');

reset role;
select is((select pg_catalog.count(*) from public.event_ticket_sales as s
  where s.buyer_email = 'chidi@example.test'), 1::bigint,
  'the replay created no second row');
set local role anon;

-- 14. Validation refusals.
select throws_ok($$
  select public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 11,
    p_buyer_name => 'Too Many', p_buyer_email => 'many@example.test',
    p_buyer_phone => '08031234572',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000e1',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000e2', p_receipt_id => null,
    p_receipt_filename => null, p_receipt_object_key => null,
    p_receipt_content_type => null, p_receipt_size_bytes => null,
    p_receipt_sha256 => null)
$$, '23514', null, 'the online ceiling refuses quantity 11');

select throws_ok($$
  select public.submit_ticket_order(
    p_event_id => current_setting('test.till_event')::uuid,
    p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 1,
    p_buyer_name => 'Bad Email', p_buyer_email => 'not-an-email',
    p_buyer_phone => '08031234573',
    p_idempotency_key => '7b7b7b7b-0000-0000-0000-0000000000e3',
    p_sale_id => '7b7b7b7b-0000-0000-0000-0000000000e4', p_receipt_id => null,
    p_receipt_filename => null, p_receipt_object_key => null,
    p_receipt_content_type => null, p_receipt_size_bytes => null,
    p_receipt_sha256 => null)
$$, '22023', null, 'an invalid email is refused');

-- 15. The per-email throttle: three live orders per address per event.
select throws_ok($test$
  do $block$
  declare i int;
  begin
    for i in 1..4 loop
      perform public.submit_ticket_order(
        p_event_id => current_setting('test.till_event')::uuid,
        p_tier_id => current_setting('test.till_tier')::uuid, p_quantity => 1,
        p_buyer_name => 'Flood Buyer',
        p_buyer_email => 'flood@example.test', p_buyer_phone => '08031234574',
        p_idempotency_key => ('7b7b7b7b-0000-0000-0000-0000000001f' || i)::uuid,
        p_sale_id => ('7b7b7b7b-0000-0000-0000-0000000002f' || i)::uuid,
        p_receipt_id => null, p_receipt_filename => null, p_receipt_object_key => null,
        p_receipt_content_type => null, p_receipt_size_bytes => null,
        p_receipt_sha256 => null);
    end loop;
  end $block$;
$test$, '22000', 'This email address has too many pending ticket orders for this event.',
  'the fourth live order from one address on one event is refused');

-- 16. Lookup needs both halves, and a case-insensitive reference.
select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    (select lower(current_setting('test.till_guest'))), 'chidi@example.test'))::integer,
  1, 'the lookup normalizes reference case, so a retyped lowercase k still finds the order');

select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    current_setting('test.till_guest'), 'someone-else@example.test'))::integer,
  0, 'a wrong email returns no rows, not an error, so references cannot be probed');

select is((select pg_catalog.count(*) from public.lookup_ticket_order(
    current_setting('test.till_guest'), NULL))::integer, 0, 'a reference alone returns nothing');

reset role;

select * from finish();

reset role;
rollback;
