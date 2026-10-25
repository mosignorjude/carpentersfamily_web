begin;
select plan(8);

-- Fixtures
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000851', 'authenticated', 'authenticated', 'pm-admin@example.test', '', '{}'::jsonb, '{"full_name":"PM Admin","username":"pm_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000852', 'authenticated', 'authenticated', 'pm-exec@example.test', '', '{}'::jsonb, '{"full_name":"PM Exec","username":"pm_exec"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id in ('00000000-0000-0000-0000-000000000851', '00000000-0000-0000-0000-000000000852');

insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000851', 'admin', '00000000-0000-0000-0000-000000000851', 'PM Admin role'),
  ('00000000-0000-0000-0000-000000000852', 'executive', '00000000-0000-0000-0000-000000000851', 'PM Exec role');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000852', true);

select set_config('test.pm_event_id', public.create_event(
  'PM Test Event', 'party', pg_catalog.clock_timestamp() + interval '3 days',
  'PM Hall', null, false, false, true, true, true, true
)::text, true);

select set_config('test.pm_tier_id', public.create_event_ticket_tier(
  current_setting('test.pm_event_id')::uuid, 'PM Standard', 5000, 10, 'Initial capacity'
)::text, true);

reset role;

-- 1. Check constraints on event transactions
select col_has_check(
  'public', 'event_financial_transactions', 'payment_method',
  'event_financial_transactions has check constraint on payment_method'
);

-- 2. Check constraints on ticket sales
select col_has_check(
  'public', 'event_ticket_sales', 'payment_method',
  'event_ticket_sales has check constraint on payment_method'
);

-- 3. Paid bank transfer without receipt throws error
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000852', true);

select throws_ok(
  $$
    select * from public.record_event_financial_transaction(
      current_setting('test.pm_event_id')::uuid,
      'income', 50000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      null, 'Test Sponsor', 'Sponsorship', 'bank_transfer',
      '85000000-0000-0000-0000-000000000001'::uuid,
      null, null, 'paid'
    )
  $$,
  '22023',
  null,
  'paid bank transfer without receipt throws error'
);

-- 4. Pending bank transfer without receipt succeeds
select lives_ok(
  $$
    select * from public.record_event_financial_transaction(
      current_setting('test.pm_event_id')::uuid,
      'income', 50000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      null, 'Test Sponsor Pending', 'Sponsorship Pending', 'bank_transfer',
      '85000000-0000-0000-0000-000000000002'::uuid,
      null, null, 'pending'
    )
  $$,
  'pending bank transfer without receipt succeeds'
);

-- 5. Cash with receipt throws error
select throws_ok(
  $$
    select * from public.record_event_financial_transaction(
      current_setting('test.pm_event_id')::uuid,
      'income', 50000,
      (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
      null, 'Cash Sponsor', 'Cash Sponsorship', 'cash',
      '85000000-0000-0000-0000-000000000003'::uuid,
      null, null, 'paid', null,
      '85111111-1111-4111-8111-111111111111'::uuid,
      'receipts/event/00000000-0000-0000-0000-000000000000/85111111-1111-4111-8111-111111111111.pdf',
      'receipt.pdf', 'application/pdf', 1024,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  $$,
  '22023',
  null,
  'cash with receipt throws error'
);

-- 6. Ticket sale paid bank transfer without receipt throws error
select throws_ok(
  $$
    select * from public.record_event_ticket_sale(
      current_setting('test.pm_event_id')::uuid,
      current_setting('test.pm_tier_id')::uuid,
      1, 'Alice Ticket Buyer', 'bank_transfer',
      '85000000-0000-0000-0000-000000000004'::uuid
    )
  $$,
  '22023',
  null,
  'ticket sale bank transfer without receipt throws error'
);

-- 7. Method is immutable on edit
reset role;

select throws_ok(
  $$
    update public.event_financial_transactions
    set payment_method = 'cash'
    where event_id = current_setting('test.pm_event_id')::uuid
  $$,
  '42501',
  null,
  'updating payment_method directly on transactions throws permission denied'
);

-- 8. Find finance entry id helper
select has_function('public', 'find_finance_entry_id', array['text', 'text'], 'find_finance_entry_id function exists');

select * from finish();
rollback;
