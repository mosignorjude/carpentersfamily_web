begin;

select no_plan();

-- Fixture: one Admin who may create events and move event money, one ordinary
-- active member who reads the club summary, one staff profile and one pending
-- profile that the member gate must keep out.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000841', 'authenticated', 'authenticated', 'cbs-admin@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Admin","username":"cbs_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000842', 'authenticated', 'authenticated', 'cbs-member@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Member","username":"cbs_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000843', 'authenticated', 'authenticated', 'cbs-staff@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Staff","username":"cbs_staff"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000844', 'authenticated', 'authenticated', 'cbs-pending@example.test', '', '{}'::jsonb, '{"full_name":"Shared Balance Pending","username":"cbs_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000841'::uuid
  and '00000000-0000-0000-0000-000000000842'::uuid;
update public.member_profiles set status = 'staff'
where id = '00000000-0000-0000-0000-000000000843';
update public.member_profiles set status = 'pending'
where id = '00000000-0000-0000-0000-000000000844';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000841', 'admin', '00000000-0000-0000-0000-000000000841', 'Shared balance test primary Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);

select set_config('test.cbs_event', public.create_event(
  'Shared Balance Test Event', 'party', pg_catalog.clock_timestamp() + interval '2 days',
  'Club Hall', null, false, false, true, true, true, true
)::text, true);
select set_config('test.cbs_tier', public.create_event_ticket_tier(
  current_setting('test.cbs_event')::uuid, 'General admission', 500, 10, 'Test capacity'
)::text, true);

-- Paid event income (inflow), pending income (no cash), and unreviewed money
-- that still counts because the rule is "did cash move".
select set_config('test.cbs_income_paid', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
  p_amount_ngn => 700,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'A. Member', p_source_note => 'Paid ticket income',
  p_payment_method => 'cash',
  p_idempotency_key => '80000000-0000-0000-0000-000000000041'::uuid
) as summary;
select set_config('test.cbs_income_pending', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
  p_amount_ngn => 900,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => null, p_payer_payee => 'B. Member', p_source_note => 'Pledged income',
  p_payment_method => 'cash', p_payment_status => 'pending',
  p_idempotency_key => '80000000-0000-0000-0000-000000000042'::uuid
) as summary;

-- Paid and deposit expenses leave the account; a pending expense does not.
select set_config('test.cbs_expense_paid', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 200,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Hall decoration', p_payer_payee => 'Community Decorators',
  p_source_note => null, p_payment_method => null,
  p_idempotency_key => '80000000-0000-0000-0000-000000000043'::uuid
) as summary;
select set_config('test.cbs_expense_deposit', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 50,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Sound deposit', p_payer_payee => 'DJ Supplies',
  p_source_note => null, p_payment_method => null, p_payment_status => 'deposit',
  p_idempotency_key => '80000000-0000-0000-0000-000000000044'::uuid
) as summary;
select set_config('test.cbs_expense_pending', summary.transaction_id::text, true)
from public.record_event_financial_transaction(
  p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'expense',
  p_amount_ngn => 300,
  p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  p_description => 'Catering invoice', p_payer_payee => 'Catering Co',
  p_source_note => null, p_payment_method => null, p_payment_status => 'pending',
  p_idempotency_key => '80000000-0000-0000-0000-000000000045'::uuid
) as summary;

-- Two tickets at the tier price of 500 each.
select set_config('test.cbs_sale', cash.sale_id::text, true)
from public.record_event_ticket_sale(
  p_event_id => current_setting('test.cbs_event')::uuid,
  p_tier_id => current_setting('test.cbs_tier')::uuid, p_quantity => 2,
  p_buyer_name => 'Ticket buyer', p_payment_method => 'cash',
  p_idempotency_key => '80000000-0000-0000-0000-000000000046'::uuid
) as cash;
reset role;

-- Event cash: income paid 700 + tickets 1000 = 1700 in;
-- expense paid 200 + deposit 50 = 250 out; net 1450.
select is(
  (select inflow from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  1700::numeric,
  'event inflow is paid event income plus unrefunded ticket sales'
);
select is(
  (select outflow from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  250::numeric,
  'event outflow is paid and deposit event expenses only'
);
select is(
  (select net from private.event_cash_totals(current_setting('test.cbs_event')::uuid)),
  1450::numeric,
  'event net is inflow minus outflow'
);
select is(
  (select net from private.event_cash_totals(null)),
  1450::numeric,
  'a null event scope aggregates every event'
);
select is(
  (select net from private.event_cash_totals('00000000-0000-0000-0000-000000000000'::uuid)),
  0::numeric,
  'an unknown event has no cash rather than failing the aggregate'
);
select throws_ok(
  $$select transaction_id from public.record_event_financial_transaction(
    p_event_id => current_setting('test.cbs_event')::uuid, p_kind => 'income',
    p_amount_ngn => 100,
    p_transaction_date => (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    p_description => null, p_payer_payee => null, p_source_note => 'Deposit income',
    p_payment_method => 'cash', p_payment_status => 'deposit',
    p_idempotency_key => '80000000-0000-0000-0000-000000000047'::uuid)$$,
  '23514', 'The event financial transaction values are invalid.',
  'a deposit cannot be recorded as event income, so deposit money is only ever an outflow'
);

-- The club balance now contains event cash while the event is still open, and
-- event money is not a club line item.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 1450::numeric,
  'the club balance contains live event cash before the event closes');
select is(
  (select event_inflow from public.club_finance_summary()), 1700::numeric,
  'the summary reports event inflow as its own line');
select is(
  (select event_outflow from public.club_finance_summary()), 250::numeric,
  'the summary reports event outflow as its own line');
select is(
  (select other_income from public.club_finance_summary()), 0::numeric,
  'event income never enters club other income');
select is(
  (select expenses from public.club_finance_summary()), 0::numeric,
  'event expenses never enter club expenses');
reset role;

-- Money leaving the event leaves the club balance too, without any posting.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.void_event_financial_transaction(current_setting('test.cbs_expense_paid')::uuid, 'Decoration cancelled')$$,
  'Admin can void the paid event expense');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select event_outflow from public.club_finance_summary()), 50::numeric,
  'a voided event expense leaves the club balance immediately');
select is(
  (select balance from public.club_finance_summary()), 1650::numeric,
  'the club balance follows the voided expense');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.refund_event_ticket_sale(current_setting('test.cbs_sale')::uuid, 'Buyer refunded')$$,
  'Admin can refund the ticket sale');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select event_inflow from public.club_finance_summary()), 700::numeric,
  'a refunded ticket sale leaves the club balance immediately');
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'the club balance follows the refund');
reset role;

-- Closing posts the same money that is already in the balance.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'completed', 'Shared balance test close')$$,
  'Admin can complete the event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid
      and entry_kind = 'posting' and generation = 1),
  650::numeric,
  'the closing posting equals that event''s live cash net');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'closing the event does not move the club balance');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'scheduled', 'Shared balance test reopen')$$,
  'Admin can reopen the completed event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid
      and entry_kind = 'reversal' and generation = 1),
  -650::numeric,
  'reopening appends the equal opposite audit row');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'reopening does not reverse money out of the club balance');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000841', true);
select lives_ok(
  $$select public.set_event_status(current_setting('test.cbs_event')::uuid, 'cancelled', 'Shared balance test cancel')$$,
  'Admin can cancel the reopened event');
select is(
  (select count(*) from public.event_ledger_entries
    where event_id = current_setting('test.cbs_event')::uuid and entry_kind = 'posting'),
  2::bigint,
  'the second close appends a fresh posting generation');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'the second posting still leaves the club balance unchanged');
reset role;

-- A posting row, on its own, must not be money.
select set_config('app.event_ledger_insert', 'on', true);
insert into public.event_ledger_entries (
  event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by
) values (
  current_setting('test.cbs_event')::uuid, 98, 'posting', 'completed', 99999,
  '00000000-0000-0000-0000-000000000841'
);
select set_config('app.event_ledger_insert', 'off', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (select balance from public.club_finance_summary()), 650::numeric,
  'an event ledger row alone never moves the club balance');
select is(
  (select other_income from public.club_finance_summary()), 0::numeric,
  'a positive posting row never enters club other income');
select is(
  (select expenses from public.club_finance_summary()), 0::numeric,
  'a negative posting row never enters club expenses');
reset role;

-- The member gate is unchanged, and the internals are not callable.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000843', true);
select is((select count(*) from public.club_finance_summary()), 0::bigint,
  'a staff profile still gets no club aggregate');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000844', true);
select is((select count(*) from public.club_finance_summary()), 0::bigint,
  'a pending profile gets no club aggregate');
select throws_ok($$select * from private.club_finance_summary_core()$$, '42501', null,
  'members cannot execute the summary core');
select throws_ok($$select * from private.event_cash_totals(null)$$, '42501', null,
  'members cannot execute the event cash helper');
reset role;

select ok(
  not has_function_privilege('authenticated', 'private.club_finance_summary_core()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.event_cash_totals(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.club_finance_summary()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.club_finance_summary()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.club_finance_summary()', 'EXECUTE'),
  'only the gated wrappers are callable and the internals stay revoked'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000842', true);
select is(
  (public.club_finance_report_data()->'summary'->>'event_inflow')::numeric, 700::numeric,
  'the report summary exposes event inflow');
select is(
  (public.club_finance_report_data()->'summary'->>'event_outflow')::numeric, 50::numeric,
  'the report summary exposes event outflow');
select is(
  (public.club_finance_report_data()->'summary'->>'balance')::numeric, 650::numeric,
  'the report balance matches the live club summary');
select is(
  jsonb_array_length(public.club_finance_report_data()->'transactions'), 0,
  'event money never enters the club transaction list');
reset role;

select * from finish();

rollback;
