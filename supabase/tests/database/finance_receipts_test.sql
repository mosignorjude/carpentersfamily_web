begin;
select plan(11);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values (
  '00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated',
  'finance-tester@example.test', '', '{}'::jsonb,
  '{"full_name":"Finance Tester","username":"finance_tester"}'::jsonb, now()
) on conflict (id) do nothing;

update public.member_profiles
set status = 'active'
where id = '00000000-0000-0000-0000-000000000401';

-- 1. Old tables and functions are dropped
select hasnt_table('public', 'club_financial_receipts', 'club_financial_receipts is dropped');
select hasnt_table('public', 'event_financial_receipts', 'event_financial_receipts is dropped');
select hasnt_function('public', 'reserve_club_financial_receipt', 'reserve_club_financial_receipt is dropped');

-- 2. New table exists with required columns
select has_table('public', 'finance_receipts', 'finance_receipts table exists');
select columns_are('public', 'finance_receipts', array[
  'id', 'scope', 'club_transaction_id', 'event_transaction_id',
  'event_ticket_sale_id', 'dues_request_id', 'dues_payment_id',
  'object_key', 'original_filename', 'content_type', 'size_bytes',
  'sha256', 'uploaded_by', 'created_at'
], 'finance_receipts has exactly the specified columns');

-- 3. RLS is enabled
select table_privs_are(
  'public', 'finance_receipts', 'authenticated',
  array['SELECT'],
  'authenticated has only SELECT privilege on finance_receipts'
);

-- 4. Scope constraint
select throws_ok(
  $$
    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      gen_random_uuid(), 'invalid_scope', gen_random_uuid(),
      'receipts/club/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf',
      'receipt.pdf', 'application/pdf', 1024,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '00000000-0000-0000-0000-000000000401'
    )
  $$,
  '23514',
  null,
  'invalid scope throws check violation'
);

-- 5. Scope-target alignment constraint
select throws_ok(
  $$
    insert into public.finance_receipts (
      id, scope, club_transaction_id, dues_request_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      gen_random_uuid(), 'club', gen_random_uuid(), gen_random_uuid(),
      'receipts/club/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf',
      'receipt.pdf', 'application/pdf', 1024,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '00000000-0000-0000-0000-000000000401'
    )
  $$,
  '23514',
  null,
  'setting multiple target FKs throws check violation'
);

-- 6. Key regex constraint
select throws_ok(
  $$
    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      gen_random_uuid(), 'club', gen_random_uuid(),
      'invalid/key/structure.pdf',
      'receipt.pdf', 'application/pdf', 1024,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '00000000-0000-0000-0000-000000000401'
    )
  $$,
  '23514',
  null,
  'invalid object_key pattern throws check violation'
);

-- 7. Extension matches content type
select throws_ok(
  $$
    insert into public.finance_receipts (
      id, scope, club_transaction_id, object_key, original_filename,
      content_type, size_bytes, sha256, uploaded_by
    ) values (
      gen_random_uuid(), 'club', gen_random_uuid(),
      'receipts/club/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.jpg',
      'receipt.pdf', 'application/pdf', 1024,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '00000000-0000-0000-0000-000000000401'
    )
  $$,
  '23514',
  null,
  'mismatched object extension and content_type throws check violation'
);

-- 8. Download RPC exists
select has_function('public', 'get_finance_receipt_download', array['uuid'], 'get_finance_receipt_download function exists');

select * from finish();
rollback;
