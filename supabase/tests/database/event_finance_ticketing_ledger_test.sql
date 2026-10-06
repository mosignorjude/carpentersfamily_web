begin;

select no_plan();

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_ticket_tiers')
  and (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_financial_transactions')
  and (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_ticket_sales')
  and (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_ledger_entries')
  and (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'event_financial_receipts'),
  'all event finance tables have forced row-level security'
);
select ok(
  has_column_privilege('authenticated', 'public.event_financial_transactions', 'payer_payee', 'SELECT')
  and has_column_privilege('authenticated', 'public.event_ticket_sales', 'buyer_name', 'SELECT')
  and has_column_privilege('authenticated', 'public.event_ticket_sales', 'seller_id', 'SELECT')
  and has_column_privilege('authenticated', 'public.event_financial_receipts', 'original_filename', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_financial_receipts', 'object_path', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_financial_receipts', 'sha256', 'SELECT')
  and not has_column_privilege('authenticated', 'public.event_ticket_sales', 'idempotency_key', 'SELECT')
  and not has_table_privilege('authenticated', 'public.event_financial_transactions', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.event_ticket_sales', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.event_ledger_entries', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.event_financial_transactions', 'SELECT,INSERT,UPDATE,DELETE'),
  'members receive approved transparency fields only and have no direct mutation privileges'
);
select ok(
  not (select p.prosecdef from pg_catalog.pg_proc as p
    where p.oid = 'public.record_event_ticket_sale(uuid,uuid,integer,text,text,uuid)'::regprocedure)
  and not (select p.prosecdef from pg_catalog.pg_proc as p
    where p.oid = 'public.record_event_financial_transaction(uuid,text,bigint,date,text,text,text,text,uuid)'::regprocedure)
  and not has_function_privilege('anon', 'public.refund_event_ticket_sale(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.event_finance_summary(uuid)', 'EXECUTE'),
  'public wrappers are invoker procedures and anonymous users cannot invoke writes'
);
select ok(
  exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.event_ticket_sales'::regclass and conname = 'event_ticket_sales_amount_check')
  and exists (select 1 from pg_catalog.pg_constraint where conrelid = 'public.event_financial_transactions'::regclass and conname = 'event_financial_transactions_amount_check')
  and exists (select 1 from pg_catalog.pg_class as c join pg_catalog.pg_index as i on i.indexrelid = c.oid where c.relname = 'event_ledger_entries_one_reversal_uidx' and i.indisunique),
  'database constraints protect amounts and one-reversal-per-post history'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000801', 'authenticated', 'authenticated', 'event-fin-admin@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Admin","username":"event_fin_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000802', 'authenticated', 'authenticated', 'event-fin-backup@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Backup","username":"event_fin_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000803', 'authenticated', 'authenticated', 'event-fin-exec@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Executive","username":"event_fin_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000804', 'authenticated', 'authenticated', 'event-fin-member@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Member","username":"event_fin_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000805', 'authenticated', 'authenticated', 'event-fin-lead@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Lead","username":"event_fin_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000806', 'authenticated', 'authenticated', 'event-fin-assistant@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Assistant","username":"event_fin_assistant"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000807', 'authenticated', 'authenticated', 'event-fin-committee@example.test', '', '{}'::jsonb, '{"full_name":"Event Finance Committee","username":"event_fin_committee"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000808', 'authenticated', 'authenticated', 'event-fin-other-lead@example.test', '', '{}'::jsonb, '{"full_name":"Other Event Lead","username":"other_event_lead"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000809', 'authenticated', 'authenticated', 'event-fin-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Inactive Event Member","username":"inactive_event_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000810', 'authenticated', 'authenticated', 'event-fin-pending@example.test', '', '{}'::jsonb, '{"full_name":"Pending Event Member","username":"pending_event_member"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000801'::uuid and '00000000-0000-0000-0000-000000000808'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000809';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason) values
  ('00000000-0000-0000-0000-000000000801', 'admin', '00000000-0000-0000-0000-000000000801', 'Event finance test primary Admin'),
  ('00000000-0000-0000-0000-000000000802', 'backup_admin', '00000000-0000-0000-0000-000000000801', 'Event finance test Backup Admin'),
  ('00000000-0000-0000-0000-000000000803', 'executive', '00000000-0000-0000-0000-000000000801', 'Event finance test Executive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
select set_config('test.event_finance_one', public.create_event(
  'Event Finance Test One', 'party', pg_catalog.clock_timestamp() + interval '2 days',
  'Club Hall', null, false, false, true, true, true, true
)::text, true);
select set_config('test.event_finance_two', public.create_event(
  'Event Finance Test Two', 'party', pg_catalog.clock_timestamp() + interval '4 days',
  'Community Hall', null, false, false, false, true, true, true
)::text, true);
select lives_ok($$select public.assign_event_role(current_setting('test.event_finance_one')::uuid, '00000000-0000-0000-0000-000000000805', 'lead', 'Assigned event finance lead')$$,
  'Executive can assign a Lead for one event');
select lives_ok($$select public.assign_event_role(current_setting('test.event_finance_one')::uuid, '00000000-0000-0000-0000-000000000806', 'assistant', 'Assigned event finance assistant')$$,
  'Executive can assign an Assistant for one event');
select lives_ok($$select public.assign_event_role(current_setting('test.event_finance_one')::uuid, '00000000-0000-0000-0000-000000000807', 'committee', 'Assigned committee member')$$,
  'Executive can assign Committee for one event');
select lives_ok($$select public.assign_event_role(current_setting('test.event_finance_two')::uuid, '00000000-0000-0000-0000-000000000808', 'lead', 'Assigned another event lead')$$,
  'Executive can assign a separate Lead for another event');

select set_config('test.event_finance_tier', public.create_event_ticket_tier(
  current_setting('test.event_finance_one')::uuid, 'General admission', 500, 2, 'Initial capacity'
)::text, true);
select set_config('test.event_finance_receipt_transaction', public.record_event_financial_transaction(
  current_setting('test.event_finance_one')::uuid, 'income', 500,
  (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  null, 'A. Member', 'Donation', 'cash', '80000000-0000-0000-0000-000000000001'
)::text, true);
select set_config('test.event_finance_expense', public.record_event_financial_transaction(
  current_setting('test.event_finance_one')::uuid, 'expense', 200,
  (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
  'Hall decoration', 'Community Decorators', null, null,
  '80000000-0000-0000-0000-000000000002'
)::text, true);
reset role;

select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, null, 5, current_date, null, null, 'No kind', 'cash', '80000000-0000-0000-0000-000000000003')$$,
  '23514', 'The event financial transaction values are invalid.',
  'database rejects a null transaction kind'
);
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', null, current_date, null, null, 'Donation', 'cash', '80000000-0000-0000-0000-000000000004')$$,
  '23514', 'The event financial transaction values are invalid.',
  'database rejects a null amount instead of relying on a CHECK UNKNOWN result'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000807', true);
select is((select count(*) from public.event_financial_transactions where event_id = current_setting('test.event_finance_one')::uuid), 2::bigint,
  'Committee can read transparent event financial records');
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', 10, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, null, null, 'Committee write attempt', 'cash', '80000000-0000-0000-0000-000000000010')$$,
  '42501', 'Event financial management access is required.',
  'Committee membership alone cannot create event income'
);
select throws_ok(
  $$select public.create_event_ticket_tier(current_setting('test.event_finance_one')::uuid, 'Unauthorized tier', 100, 5, 'Committee attempt')$$,
  '42501', 'Event financial management access is required.',
  'Committee membership alone cannot create a ticket tier'
);
select throws_ok(
  $$select public.reserve_event_finance_receipt('00000000-0000-0000-0000-000000000903', current_setting('test.event_finance_receipt_transaction')::uuid, 'committee.pdf', 'application/pdf', 128)$$,
  '42501', 'An active event financial record and event manager access are required.',
  'Committee membership alone cannot reserve an event receipt upload'
);
select throws_ok(
  $$insert into public.event_financial_transactions (event_id, kind, amount_ngn, transaction_date, source_note, payment_method, created_by, updated_by, idempotency_key) values (current_setting('test.event_finance_one')::uuid, 'income', 1, current_date, 'direct', 'cash', auth.uid(), auth.uid(), gen_random_uuid())$$,
  '42501', null, 'Committee cannot write financial rows directly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000805', true);
select lives_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', 500, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, null, 'A. Member', 'Ticket donation', 'cash', '80000000-0000-0000-0000-000000000005')$$,
  'assigned event Lead can record event income'
);
select is(
  public.reserve_event_finance_receipt(
    '00000000-0000-0000-0000-000000000902',
    current_setting('test.event_finance_receipt_transaction')::uuid,
    'event receipt.pdf', 'application/pdf', 128
  ),
  'event/' || current_setting('test.event_finance_receipt_transaction') || '/00000000-0000-0000-0000-000000000902.pdf',
  'event manager receives only the database-generated receipt path'
);
select throws_ok(
  $$select public.finalize_event_finance_receipt('00000000-0000-0000-0000-000000000902', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,
  '42501', 'This pending event receipt cannot be finalized.',
  'receipt finalization fails closed until Storage confirms the object exists'
);
select lives_ok(
  $$select public.fail_event_finance_receipt_upload('00000000-0000-0000-0000-000000000902')$$,
  'uploader can mark an incomplete receipt upload failed'
);
select throws_ok(
  $$select public.reserve_event_finance_receipt('00000000-0000-0000-0000-000000000904', current_setting('test.event_finance_receipt_transaction')::uuid, '../unsafe.pdf', 'application/pdf', 128)$$,
  '23514', 'The event receipt metadata or file size is invalid.',
  'database rejects path traversal in a receipt filename'
);
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_two')::uuid, 'income', 10, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, null, null, 'Wrong event', 'cash', '80000000-0000-0000-0000-000000000006')$$,
  '42501', 'Event financial management access is required.',
  'a Lead assignment for one event cannot authorize another event'
);
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', 10, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date + 1, null, null, 'Future date', 'cash', '80000000-0000-0000-0000-000000000007')$$,
  '23514', 'The event financial transaction values are invalid.',
  'database rejects a future transaction date'
);
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', 10, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, null, null, 'No payment method', null, '80000000-0000-0000-0000-000000000008')$$,
  '23514', 'The event financial transaction values are invalid.',
  'database rejects a missing income payment method'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000806', true);
select lives_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'expense', 200, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, 'Hall decoration', 'Community Decorators', null, null, '80000000-0000-0000-0000-000000000009')$$,
  'assigned event Assistant can record an expense'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000804', true);
select is(
  (select payer_payee from public.event_financial_transactions where id = current_setting('test.event_finance_receipt_transaction')::uuid),
  'A. Member',
  'active members can see event payer details'
);
select is(
  public.record_event_ticket_sale(
    current_setting('test.event_finance_one')::uuid,
    current_setting('test.event_finance_tier')::uuid, 1, 'Buyer One', 'cash',
    '80000000-0000-0000-0000-000000000011'
  ),
  public.record_event_ticket_sale(
    current_setting('test.event_finance_one')::uuid,
    current_setting('test.event_finance_tier')::uuid, 1, 'Buyer One', 'cash',
    '80000000-0000-0000-0000-000000000011'
  ),
  'identical ticket-sale retry returns the original sale'
);
select set_config('test.event_finance_sale_one', public.record_event_ticket_sale(
  current_setting('test.event_finance_one')::uuid,
  current_setting('test.event_finance_tier')::uuid, 1, 'Buyer One', 'cash',
  '80000000-0000-0000-0000-000000000011'
)::text, true);
select lives_ok(
  $$select public.edit_event_ticket_sale(current_setting('test.event_finance_sale_one')::uuid, 1, 'Buyer One Updated', 'cash', 'Corrected buyer spelling')$$,
  'seller can edit their own sale with an audit reason'
);
select throws_ok(
  $$select public.edit_event_ticket_sale(current_setting('test.event_finance_sale_one')::uuid, 1, 'Buyer One Updated', 'cash', '')$$,
  '23514', 'The corrected ticket sale values or reason are invalid.',
  'seller edit requires a nonempty reason'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000807', true);
select throws_ok(
  $$select public.edit_event_ticket_sale(current_setting('test.event_finance_sale_one')::uuid, 1, 'Buyer One Tampered', 'cash', 'Another seller attempt')$$,
  '42501', 'Only the active seller or Admin/Backup Admin may edit an unrefunded sale.',
  'another member cannot edit the seller ticket sale by changing its ID'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000808', true);
select set_config('test.event_finance_sale_two', public.record_event_ticket_sale(
  current_setting('test.event_finance_one')::uuid,
  current_setting('test.event_finance_tier')::uuid, 1, 'Buyer Two', 'bank_transfer',
  '80000000-0000-0000-0000-000000000013'
)::text, true);
select throws_ok(
  $$select public.record_event_ticket_sale(current_setting('test.event_finance_one')::uuid, current_setting('test.event_finance_tier')::uuid, -1, 'Invalid quantity', 'cash', '80000000-0000-0000-0000-000000000014')$$,
  '23514', 'The ticket sale values are invalid.',
  'database rejects a negative ticket quantity'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000804', true);
select throws_ok(
  $$select public.record_event_ticket_sale(current_setting('test.event_finance_one')::uuid, current_setting('test.event_finance_tier')::uuid, 1, 'Oversell buyer', 'cash', '80000000-0000-0000-0000-000000000018')$$,
  '23514', 'Ticket tier capacity has been reached.',
  'database rejects a sale beyond the final available ticket'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
select throws_ok(
  $$select public.refund_event_ticket_sale(current_setting('test.event_finance_sale_two')::uuid, 'Executive refund attempt')$$,
  '42501', 'Only Admin or Backup Admin may refund ticket sales.',
  'Executive cannot refund a ticket sale'
);
select lives_ok(
  $$select public.update_event_ticket_tier(current_setting('test.event_finance_tier')::uuid, 'General admission', 750, 2, 'New listed price')$$,
  'Executive can update an event tier price'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select lives_ok(
  $$select public.refund_event_ticket_sale(current_setting('test.event_finance_sale_two')::uuid, 'Buyer cancelled purchase')$$,
  'primary Admin can refund a ticket sale with a reason'
);
select is(
  (select unit_price_ngn from public.event_ticket_sales where id = current_setting('test.event_finance_sale_one')::uuid),
  500::bigint,
  'existing ticket price remains snapshotted after tier price update'
);
select set_config('test.event_finance_sale_three', public.record_event_ticket_sale(
  current_setting('test.event_finance_one')::uuid,
  current_setting('test.event_finance_tier')::uuid, 1, 'Buyer Three', 'cash',
  '80000000-0000-0000-0000-000000000015'
)::text, true);
select is(
  (select sum(quantity) from public.event_ticket_sales where tier_id = current_setting('test.event_finance_tier')::uuid and refunded_at is null),
  2::bigint,
  'refund releases capacity without deleting the historical ticket sale'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
select throws_ok(
  $$select public.correct_event_financial_transaction(current_setting('test.event_finance_expense')::uuid, 250, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, 'Corrected hall decoration', 'Community Decorators', null, null, 'Executive correction attempt')$$,
  '42501', 'Only Admin or Backup Admin may correct event finances.',
  'Executive cannot correct event financial history'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select lives_ok(
  $$select public.correct_event_financial_transaction(current_setting('test.event_finance_expense')::uuid, 200, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, 'Corrected hall decoration', 'Community Decorators', null, null, 'Verified description')$$,
  'primary Admin can correct an event financial record with a reason'
);
select is(
  (select count(*) from public.audit_log where event_id = current_setting('test.event_finance_one')::uuid and action = 'event_finance_corrected' and reason = 'Verified description'),
  1::bigint,
  'financial correction audit includes event, actor, and reason'
);
select ok(
  (select before_data ->> 'description' = 'Hall decoration'
      and after_data ->> 'description' = 'Corrected hall decoration'
   from public.audit_log where event_id = current_setting('test.event_finance_one')::uuid and action = 'event_finance_corrected' and reason = 'Verified description'),
  'correction audit retains before and after values'
);

reset role;
insert into public.event_financial_receipts (
  id, transaction_id, object_path, original_filename, content_type, size_bytes,
  sha256, uploaded_by, status, uploaded_at
) values (
  '00000000-0000-0000-0000-000000000901', current_setting('test.event_finance_receipt_transaction')::uuid,
  'event/' || current_setting('test.event_finance_receipt_transaction') || '/00000000-0000-0000-0000-000000000901.pdf',
  'shared.pdf', 'application/pdf', 128, pg_catalog.repeat('a', 64),
  '00000000-0000-0000-0000-000000000801', 'available', now()
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
select is(
  (select count(*) from public.event_financial_receipts where id = '00000000-0000-0000-0000-000000000901'),
  1::bigint,
  'active event managers can attach an available receipt to a shared record'
);
select set_config('test.event_finance_summary_net', (select net_result_ngn::text from public.event_finance_summary(current_setting('test.event_finance_one')::uuid)), true);
select is(current_setting('test.event_finance_summary_net'), '1850',
  'event result includes recorded income, expenses, and only unrefunded ticket sales');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000804', true);
select is(
  (select original_filename from public.event_financial_receipts where id = '00000000-0000-0000-0000-000000000901'),
  'shared.pdf',
  'all active members can read available receipt metadata for event transparency'
);
select throws_ok(
  $$select object_path from public.event_financial_receipts where id = '00000000-0000-0000-0000-000000000901'$$,
  '42501', null,
  'members cannot query private storage paths directly'
);
select is(
  (select count(*) from public.get_event_finance_receipt_download('00000000-0000-0000-0000-000000000901')),
  1::bigint,
  'active members can resolve an available receipt through its authorized download RPC'
);
select throws_ok(
  $$insert into public.event_ledger_entries (event_id, generation, entry_kind, event_status, signed_amount_ngn, created_by) values (current_setting('test.event_finance_one')::uuid, 9, 'posting', 'completed', 1, auth.uid())$$,
  '42501', null,
  'ordinary members cannot forge a ledger post'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000809', true);
select is((select count(*) from public.event_financial_transactions), 0::bigint,
  'deactivated members cannot read event finances using an old session');
select is((select count(*) from public.event_financial_receipts), 0::bigint,
  'deactivated members cannot read receipt metadata using an old session');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000810', true);
select is((select count(*) from public.event_ticket_sales), 0::bigint,
  'pending members cannot read ticket sales');
select throws_ok(
  $$select public.record_event_ticket_sale(current_setting('test.event_finance_one')::uuid, current_setting('test.event_finance_tier')::uuid, 1, 'Pending user', 'cash', '80000000-0000-0000-0000-000000000016')$$,
  '42501', 'Active membership is required to record ticket sales.',
  'pending members cannot record ticket sales'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000805', true);
select lives_ok($$select public.set_event_status(current_setting('test.event_finance_one')::uuid, 'completed', 'Event completed')$$,
  'authorized Lead can complete the event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries where event_id = current_setting('test.event_finance_one')::uuid and entry_kind = 'posting' and generation = 1),
  1850::numeric,
  'event completion appends the signed net result once'
);
select throws_ok(
  $$select public.record_event_financial_transaction(current_setting('test.event_finance_one')::uuid, 'income', 1, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date, null, null, 'After completion', 'cash', '80000000-0000-0000-0000-000000000017')$$,
  '42501', 'This event does not allow that financial entry.',
  'completed event finance cannot be modified'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
select throws_ok(
  $$select public.set_event_status(current_setting('test.event_finance_one')::uuid, 'scheduled', 'Executive reopen attempt')$$,
  '42501', 'Only an Admin or Backup Admin may reopen an event.',
  'Executive cannot reopen a completed event'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
select lives_ok($$select public.set_event_status(current_setting('test.event_finance_one')::uuid, 'scheduled', 'Approved reopening')$$,
  'Backup Admin can reopen a completed event');
select is(
  (select signed_amount_ngn from public.event_ledger_entries where event_id = current_setting('test.event_finance_one')::uuid and entry_kind = 'reversal' and generation = 1),
  -1850::numeric,
  'reopening appends an equal opposite ledger entry'
);
select is((select balance from public.club_finance_summary()), 0::numeric,
  'club balance nets the original event post and its reversal');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
select lives_ok($$select public.set_event_status(current_setting('test.event_finance_one')::uuid, 'cancelled', 'Event cancelled after reopening')$$,
  'an authorized event Lead can cancel the reopened event');
select is(
  (select count(*) from public.event_ledger_entries where event_id = current_setting('test.event_finance_one')::uuid and entry_kind = 'posting'),
  2::bigint,
  'a later terminal status creates a fresh posting generation');
select is(
  (select count(*) from public.event_ledger_entries where event_id = current_setting('test.event_finance_one')::uuid and entry_kind = 'reversal'),
  1::bigint,
  'each prior posting has at most one reversal');
select is((select balance from public.club_finance_summary()), 1850::numeric,
  'club balance includes the fresh event posting after the reversal');
reset role;

select finish();
rollback;
