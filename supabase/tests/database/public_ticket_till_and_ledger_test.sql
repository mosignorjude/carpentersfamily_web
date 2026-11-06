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

select * from finish();

reset role;
rollback;
