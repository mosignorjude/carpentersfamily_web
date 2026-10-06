begin;

select no_plan();

select has_table('public', 'club_financial_receipts', 'club finance receipt metadata table exists');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_catalog.pg_class as c
   join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'club_financial_receipts'),
  'receipt metadata uses forced RLS'
);
select ok(
  has_column_privilege('authenticated', 'public.club_financial_receipts', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_receipts', 'transaction_id', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_receipts', 'original_filename', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_receipts', 'content_type', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_receipts', 'size_bytes', 'SELECT')
  and has_column_privilege('authenticated', 'public.club_financial_receipts', 'uploaded_at', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_receipts', 'object_path', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_receipts', 'sha256', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_receipts', 'uploaded_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.club_financial_receipts', 'status', 'SELECT')
  and not has_table_privilege('authenticated', 'public.club_financial_receipts', 'INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon', 'public.club_financial_receipts', 'SELECT,INSERT,UPDATE,DELETE'),
  'receipt readers get display metadata only and cannot write rows directly'
);
select ok(
  not has_function_privilege('anon', 'public.reserve_club_finance_receipt(uuid,uuid,text,text,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.finalize_club_finance_receipt(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_club_finance_receipt_download(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reserve_club_finance_receipt(uuid,uuid,text,text,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.finalize_club_finance_receipt(uuid,text)', 'EXECUTE'),
  'only authenticated requests may call the receipt procedures'
);
select ok(
  (select not b.public and b.file_size_limit = 4194304
      and b.allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png']::text[]
      and cardinality(b.allowed_mime_types) = 3
   from storage.buckets as b where b.id = 'club-finance-receipts'),
  'receipt bucket is private, MIME-allowlisted, and capped at 4 MiB'
);
select is(
  (select count(*) from pg_catalog.pg_policies as p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'club_finance_receipts_deny_direct_%'
     and p.permissive = 'RESTRICTIVE'),
  5::bigint,
  'restrictive Storage policies retain write denials and separate anonymous from backup reads'
);
select ok(
  has_function_privilege('authenticated', 'private.can_read_finance_receipt_storage_object(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.can_read_finance_receipt_storage_object(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.can_read_finance_receipt_storage_object(text)', 'EXECUTE')
  and (select p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'private.can_read_finance_receipt_storage_object(text)'::regprocedure),
  'the backup Storage read gate has a fixed search path and only authenticated callers may evaluate it'
);
select ok(
  not has_function_privilege('anon', 'private.get_club_finance_receipt_download(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.get_club_finance_receipt_download(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.get_club_finance_receipt_download(uuid)', 'EXECUTE')
  and (select p.prosecdef and p.proconfig @> array['search_path=""']
       from pg_catalog.pg_proc as p
       where p.oid = 'private.get_club_finance_receipt_download(uuid)'::regprocedure),
  'the private metadata resolver has a fixed search path and is limited to authenticated callers'
);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values
  ('00000000-0000-0000-0000-000000000401', 'authenticated', 'authenticated', 'receipt-admin@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Admin","username":"receipt_admin"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000402', 'authenticated', 'authenticated', 'receipt-backup@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Backup","username":"receipt_backup"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000403', 'authenticated', 'authenticated', 'receipt-exec@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Executive","username":"receipt_exec"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000404', 'authenticated', 'authenticated', 'receipt-member@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Member","username":"receipt_member"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000405', 'authenticated', 'authenticated', 'receipt-inactive@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Inactive","username":"receipt_inactive"}'::jsonb, now()),
  ('00000000-0000-0000-0000-000000000406', 'authenticated', 'authenticated', 'receipt-pending@example.test', '', '{}'::jsonb, '{"full_name":"Receipt Pending","username":"receipt_pending"}'::jsonb, now());

update public.member_profiles set status = 'active'
where id between '00000000-0000-0000-0000-000000000401'::uuid
  and '00000000-0000-0000-0000-000000000404'::uuid;
update public.member_profiles set status = 'deactivated'
where id = '00000000-0000-0000-0000-000000000405';
insert into public.member_role_assignments (
  member_id, role, assigned_by, grant_reason
) values
  ('00000000-0000-0000-0000-000000000401', 'admin', '00000000-0000-0000-0000-000000000401', 'Receipt test Admin'),
  ('00000000-0000-0000-0000-000000000402', 'backup_admin', '00000000-0000-0000-0000-000000000401', 'Receipt test Backup Admin'),
  ('00000000-0000-0000-0000-000000000403', 'executive', '00000000-0000-0000-0000-000000000401', 'Receipt test Executive');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
select set_config(
  'test.receipt_transaction_id',
  public.record_club_financial_transaction(
    'income', 2300, (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date,
    null, null, 'Community donor', 'Receipt test income',
    '30000000-0000-0000-0000-000000000401'
  )::text,
  true
);
reset role;

insert into public.club_financial_receipts (
  id, transaction_id, object_path, original_filename, content_type,
  size_bytes, sha256, uploaded_by, status, uploaded_at
) values (
  '00000000-0000-0000-0000-000000000601',
  current_setting('test.receipt_transaction_id')::uuid,
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf',
  'receipt.pdf', 'application/pdf', 8, repeat('a', 64),
  '00000000-0000-0000-0000-000000000403', 'available', now()
);

insert into public.club_financial_receipts (
  id, transaction_id, object_path, original_filename, content_type,
  size_bytes, sha256, uploaded_by, status
) values (
  '00000000-0000-0000-0000-000000000613',
  current_setting('test.receipt_transaction_id')::uuid,
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000613.pdf',
  'pending.pdf', 'application/pdf', 8, null,
  '00000000-0000-0000-0000-000000000404', 'pending'
);

-- Test-only Storage metadata fixtures; this transaction rolls back. Real objects use the Storage API.
insert into storage.objects (bucket_id, name, metadata) values
  (
    'club-finance-receipts',
    current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf',
    jsonb_build_object('size', '8', 'mimetype', 'application/pdf')
  ),
  (
    'club-finance-receipts',
    current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000613.pdf',
    jsonb_build_object('size', '8', 'mimetype', 'application/pdf')
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
select is(
  (select count(*) from public.club_financial_receipts
   where id = '00000000-0000-0000-0000-000000000601'),
  1::bigint,
  'an active member can see an available receipt attached to shared club finance'
);
select is(
  (select object_path from public.get_club_finance_receipt_download(
    '00000000-0000-0000-0000-000000000601'
  )),
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf',
  'an active member can resolve the authorized private download through the server route procedure'
);
select throws_ok(
  $$insert into public.club_financial_receipts (
    id, transaction_id, object_path, original_filename, content_type,
    size_bytes, uploaded_by
  ) values (
    '00000000-0000-0000-0000-000000000602',
    current_setting('test.receipt_transaction_id')::uuid,
    current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000602.pdf',
    'other.pdf', 'application/pdf', 8, auth.uid()
  )$$,
  '42501', null,
  'active members cannot forge or insert receipt metadata'
);
select throws_ok(
  $$update public.club_financial_receipts
    set original_filename = 'changed.pdf'
    where id = '00000000-0000-0000-0000-000000000601'$$,
  '42501', null,
  'active members cannot rewrite receipt metadata or its history'
);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'club-finance-receipts'
     and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf'),
  0::bigint,
  'receipt metadata alone does not create a downloadable Storage object'
);
select is(
  (select count(*) from public.get_club_finance_receipt_download(
    '00000000-0000-0000-0000-000000000699'
  )),
  0::bigint,
  'unknown receipt IDs do not resolve to private storage paths'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000405', true);
select is(
  (select count(*) from public.club_financial_receipts),
  0::bigint,
  'a deactivated member cannot see receipt metadata'
);
select is(
  (select count(*) from public.get_club_finance_receipt_download(
    '00000000-0000-0000-0000-000000000601'
  )),
  0::bigint,
  'a deactivated member cannot resolve an old receipt link'
);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000603',
    current_setting('test.receipt_transaction_id')::uuid,
    'unauthorized.pdf', 'application/pdf', 8
  )$$,
  '42501', 'Active membership is required.',
  'a deactivated member cannot reserve a receipt upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000406', true);
select is(
  (select count(*) from public.club_financial_receipts),
  0::bigint,
  'a pending applicant cannot see receipt metadata'
);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000604',
    current_setting('test.receipt_transaction_id')::uuid,
    'pending.pdf', 'application/pdf', 8
  )$$,
  '42501', 'Active membership is required.',
  'a pending applicant cannot reserve a receipt upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000605',
    current_setting('test.receipt_transaction_id')::uuid,
    'member.pdf', 'application/pdf', 8
  )$$,
  '42501', 'Only a finance officer may attach a receipt.',
  'an ordinary active member cannot reserve a receipt upload'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
select is(
  public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000606',
    current_setting('test.receipt_transaction_id')::uuid,
    'receipt.pdf', 'application/pdf', 8
  ),
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000606.pdf',
  'an Executive can reserve a receipt for a shared finance record'
);
select is(
  (select count(*) from public.club_financial_receipts
   where id = '00000000-0000-0000-0000-000000000606'),
  0::bigint,
  'a pending upload remains hidden until its Storage object is verified'
);
select throws_ok(
  $$select public.finalize_club_finance_receipt(
    '00000000-0000-0000-0000-000000000606', repeat('b', 64)
  )$$,
  'P0002', 'The receipt upload could not be verified.',
  'receipt metadata cannot be finalized before a trusted Storage upload exists'
);
select public.fail_club_finance_receipt_upload('00000000-0000-0000-0000-000000000606');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
select is(
  public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000607',
    current_setting('test.receipt_transaction_id')::uuid,
    'backup.jpg', 'image/jpeg', 8
  ),
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000607.jpg',
  'a Backup Admin can reserve an allowlisted image receipt'
);
select public.fail_club_finance_receipt_upload('00000000-0000-0000-0000-000000000607');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
select is(
  public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000608',
    current_setting('test.receipt_transaction_id')::uuid,
    'admin.png', 'image/png', 8
  ),
  current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000608.png',
  'the primary Admin can reserve an allowlisted image receipt'
);
select public.fail_club_finance_receipt_upload('00000000-0000-0000-0000-000000000608');
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000609',
    current_setting('test.receipt_transaction_id')::uuid,
    '../wrong.pdf', 'application/pdf', 8
  )$$,
  '23514', 'The receipt file details are invalid.',
  'database rejects path-traversal filenames even when the caller has an officer role'
);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000610',
    current_setting('test.receipt_transaction_id')::uuid,
    'spoofed.pdf', 'image/jpeg', 8
  )$$,
  '23514', 'The receipt file details are invalid.',
  'database rejects mismatched filename extensions and MIME types'
);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000611',
    current_setting('test.receipt_transaction_id')::uuid,
    'oversized.pdf', 'application/pdf', 4194305
  )$$,
  '23514', 'The receipt file details are invalid.',
  'database rejects receipt sizes above the enforced cap'
);
select throws_ok(
  $$select public.reserve_club_finance_receipt(
    '00000000-0000-0000-0000-000000000612',
    '00000000-0000-0000-0000-000000000699',
    'missing.pdf', 'application/pdf', 8
  )$$,
  'P0002', 'The financial record is unavailable for receipt upload.',
  'officers cannot attach receipts to another or nonexistent finance record'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'club-finance-receipts'
     and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf'),
  1::bigint,
  'the active primary Admin can read an available receipt object for backup'
);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'club-finance-receipts'
     and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000613.pdf'),
  0::bigint,
  'the primary Admin cannot read a pending receipt object'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('club-finance-receipts', 'unauthorized/new.pdf', '{}'::jsonb)$$,
  '42501', null,
  'the primary Admin cannot upload directly to the private receipt bucket'
);
select lives_ok(
  $sql$do $body$
    declare
      changed_rows bigint;
    begin
      update storage.objects set metadata = '{}'::jsonb
       where bucket_id = 'club-finance-receipts'
         and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf';
      get diagnostics changed_rows = row_count;
      if changed_rows <> 0 then
        raise exception using errcode = 'P0001', message = 'RLS unexpectedly changed Storage metadata.';
      end if;
    end
  $body$$sql$,
  'the primary Admin cannot change a stored receipt directly'
);
select throws_ok(
  $$delete from storage.objects
    where bucket_id = 'club-finance-receipts'
      and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf'$$,
  '42501', null,
  'the primary Admin cannot delete a stored receipt directly'
);
reset role;
select is(
  (select metadata ->> 'mimetype' from storage.objects
   where bucket_id = 'club-finance-receipts'
     and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf'),
  'application/pdf',
  'the denied direct update leaves receipt metadata unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
select is(
  (select count(*) from storage.objects
   where bucket_id = 'club-finance-receipts'
     and name = current_setting('test.receipt_transaction_id') || '/00000000-0000-0000-0000-000000000601.pdf'),
  1::bigint,
  'the active Backup Admin can read an available receipt object for backup'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
select is(
  (select count(*) from storage.objects where bucket_id = 'club-finance-receipts'),
  0::bigint,
  'an Executive cannot use direct Storage access reserved for backup operators'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000404', true);
select is(
  (select count(*) from storage.objects where bucket_id = 'club-finance-receipts'),
  0::bigint,
  'an ordinary member cannot use direct Storage access reserved for backup operators'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000405', true);
select is(
  (select count(*) from storage.objects where bucket_id = 'club-finance-receipts'),
  0::bigint,
  'a deactivated Admin session cannot read receipt objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000406', true);
select is(
  (select count(*) from storage.objects where bucket_id = 'club-finance-receipts'),
  0::bigint,
  'a pending applicant cannot read receipt objects'
);
reset role;

set local role anon;
select is(
  (select count(*) from storage.objects where bucket_id = 'club-finance-receipts'),
  0::bigint,
  'an unauthenticated visitor cannot read receipt objects'
);
reset role;

select * from finish();
rollback;
