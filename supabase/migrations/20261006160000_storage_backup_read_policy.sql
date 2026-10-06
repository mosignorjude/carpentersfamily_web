-- Step 15: let active Admins and Backup Admins back up available receipt bytes
-- through Storage while retaining RLS and denying ordinary direct reads/writes.
create or replace function private.can_read_finance_receipt_storage_object(
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_object_path is not null
    and (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    )
    and (
      exists (
        select 1
        from public.club_financial_receipts as receipt
        where receipt.object_path = p_object_path
          and receipt.status = 'available'
      )
      or exists (
        select 1
        from public.event_financial_receipts as receipt
        where receipt.object_path = p_object_path
          and receipt.status = 'available'
      )
    );
$function$;

revoke all on function private.can_read_finance_receipt_storage_object(text)
  from public, anon, authenticated, service_role;
grant execute on function private.can_read_finance_receipt_storage_object(text)
  to authenticated;

drop policy if exists club_finance_receipts_deny_direct_select
  on storage.objects;
create policy club_finance_receipts_deny_direct_select
  on storage.objects as restrictive
  for select to authenticated
  using (
    bucket_id <> 'club-finance-receipts'
    or (select private.can_read_finance_receipt_storage_object(name))
  );

drop policy if exists club_finance_receipts_deny_direct_select_anon
  on storage.objects;
create policy club_finance_receipts_deny_direct_select_anon
  on storage.objects as restrictive
  for select to anon
  using (bucket_id <> 'club-finance-receipts');

drop policy if exists club_finance_receipts_backup_admin_read
  on storage.objects;
create policy club_finance_receipts_backup_admin_read
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'club-finance-receipts'
    and (select private.can_read_finance_receipt_storage_object(name))
  );