-- Private, member-visible receipts for shared club finance records.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'club-finance-receipts', 'Club finance receipts', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.club_financial_receipts (
  id uuid primary key,
  transaction_id uuid not null references public.club_financial_transactions (id) on delete restrict,
  object_path text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes integer not null,
  sha256 text,
  uploaded_by uuid not null references public.member_profiles (id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  uploaded_at timestamptz,
  constraint club_financial_receipts_path_check check (
    object_path = transaction_id::text || '/' || id::text || '.' ||
      case content_type
        when 'application/pdf' then 'pdf'
        when 'image/jpeg' then 'jpg'
        when 'image/png' then 'png'
      end
  ),
  constraint club_financial_receipts_filename_check check (
    original_filename = pg_catalog.btrim(original_filename)
    and pg_catalog.char_length(original_filename) between 5 and 120
    and original_filename !~ '[[:cntrl:]]'
    and pg_catalog.strpos(original_filename, '/') = 0
    and pg_catalog.strpos(original_filename, pg_catalog.chr(92)) = 0
    and (
      (content_type = 'application/pdf' and original_filename ~* '\.pdf$')
      or (content_type = 'image/jpeg' and original_filename ~* '\.(jpg|jpeg)$')
      or (content_type = 'image/png' and original_filename ~* '\.png$')
    )
  ),
  constraint club_financial_receipts_content_type_check check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint club_financial_receipts_size_check check (
    size_bytes between 1 and 4194304
  ),
  constraint club_financial_receipts_status_check check (
    status in ('pending', 'available', 'failed')
  ),
  constraint club_financial_receipts_hash_check check (
    sha256 is null or sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint club_financial_receipts_state_check check (
    (status in ('pending', 'failed') and sha256 is null and uploaded_at is null)
    or (status = 'available' and sha256 is not null and uploaded_at is not null)
  )
);

alter table public.club_financial_receipts enable row level security;
alter table public.club_financial_receipts force row level security;

create policy club_financial_receipts_active_member_read
  on public.club_financial_receipts for select to authenticated
  using (
    status = 'available'
    and (select private.is_active_club_member())
  );

revoke all on table public.club_financial_receipts from public, anon, authenticated, service_role;
grant select (
  id, transaction_id, original_filename, content_type, size_bytes, uploaded_at
) on public.club_financial_receipts to authenticated;

create index club_financial_receipts_transaction_idx
  on public.club_financial_receipts (transaction_id, uploaded_at desc)
  where status = 'available';
create unique index club_financial_receipts_transaction_hash_uidx
  on public.club_financial_receipts (transaction_id, sha256)
  where status = 'available';
create unique index club_financial_receipts_one_pending_per_uploader_uidx
  on public.club_financial_receipts (uploaded_by)
  where status = 'pending';

create or replace function private.reserve_club_finance_receipt(
  p_receipt_id uuid,
  p_transaction_id uuid,
  p_original_filename text,
  p_content_type text,
  p_size_bytes integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_filename text := pg_catalog.btrim(p_original_filename);
  v_path text;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not ((select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only a finance officer may attach a receipt.';
  end if;
  if p_receipt_id is null or p_transaction_id is null or p_original_filename is null
      or pg_catalog.char_length(v_filename) not between 5 and 120
      or v_filename ~ '[[:cntrl:]]'
      or pg_catalog.strpos(v_filename, '/') > 0
      or pg_catalog.strpos(v_filename, pg_catalog.chr(92)) > 0
      or p_content_type not in ('application/pdf', 'image/jpeg', 'image/png')
      or p_size_bytes not between 1 and 4194304
      or not (
        (p_content_type = 'application/pdf' and v_filename ~* '\.pdf$')
        or (p_content_type = 'image/jpeg' and v_filename ~* '\.(jpg|jpeg)$')
        or (p_content_type = 'image/png' and v_filename ~* '\.png$')
      ) then
    raise exception using errcode = '23514', message = 'The receipt file details are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
      or not ((select private.has_club_role('executive'))
        or (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Current finance officer access is required.';
  end if;

  perform 1 from public.club_financial_transactions as t
    where t.id = p_transaction_id and t.voided_at is null for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'The financial record is unavailable for receipt upload.';
  end if;

  v_path := p_transaction_id::text || '/' || p_receipt_id::text || '.' ||
    case p_content_type
      when 'application/pdf' then 'pdf'
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
    end;

  insert into public.club_financial_receipts (
    id, transaction_id, object_path, original_filename, content_type,
    size_bytes, uploaded_by
  ) values (
    p_receipt_id, p_transaction_id, v_path, v_filename, p_content_type,
    p_size_bytes, v_actor_id
  );

  return v_path;
end;
$function$;

create or replace function private.finalize_club_finance_receipt(
  p_receipt_id uuid,
  p_sha256 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.club_financial_receipts%rowtype;
  v_uploaded_at timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Active membership is required.';
  end if;
  if not ((select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Only a finance officer may attach a receipt.';
  end if;
  if p_receipt_id is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'Receipt verification details are invalid.';
  end if;

  perform 1 from private.administration_guard where singleton_id for update;
  if not (select private.is_active_club_member())
      or not ((select private.has_club_role('executive'))
        or (select private.has_club_role('admin'))
        or (select private.has_club_role('backup_admin'))) then
    raise exception using errcode = '42501', message = 'Current finance officer access is required.';
  end if;

  select r.* into v_receipt from public.club_financial_receipts as r
    where r.id = p_receipt_id and r.uploaded_by = v_actor_id and r.status = 'pending'
    for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The pending receipt upload is unavailable.';
  end if;
  if not exists (
    select 1 from storage.objects as o
    where o.bucket_id = 'club-finance-receipts' and o.name = v_receipt.object_path
  ) then
    raise exception using errcode = 'P0002', message = 'The receipt upload could not be verified.';
  end if;

  update public.club_financial_receipts
    set status = 'available', sha256 = p_sha256, uploaded_at = v_uploaded_at
    where id = v_receipt.id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, after_data, reason
  ) values (
    v_actor_id, 'club_finance_receipt_attached', 'club_finance_receipt',
    v_receipt.id,
    pg_catalog.jsonb_build_object(
      'transaction_id', v_receipt.transaction_id,
      'content_type', v_receipt.content_type,
      'size_bytes', v_receipt.size_bytes
    ),
    'Receipt attached to shared club finance record.'
  );
end;
$function$;

create or replace function private.fail_club_finance_receipt_upload(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  update public.club_financial_receipts
    set status = 'failed'
    where id = p_receipt_id and uploaded_by = auth.uid() and status = 'pending';
end;
$function$;

create or replace function private.get_club_finance_receipt_download(p_receipt_id uuid)
returns table (
  id uuid,
  transaction_id uuid,
  object_path text,
  original_filename text,
  content_type text,
  size_bytes integer,
  sha256 text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select r.id, r.transaction_id, r.object_path, r.original_filename,
    r.content_type, r.size_bytes, r.sha256
  from public.club_financial_receipts as r
  where r.id = p_receipt_id
    and r.status = 'available'
    and (select private.is_active_club_member());
$function$;

create or replace function public.reserve_club_finance_receipt(
  p_receipt_id uuid,
  p_transaction_id uuid,
  p_original_filename text,
  p_content_type text,
  p_size_bytes integer
)
returns text
language sql
security invoker
set search_path = ''
as $function$
  select private.reserve_club_finance_receipt(
    p_receipt_id, p_transaction_id, p_original_filename, p_content_type, p_size_bytes
  );
$function$;

create or replace function public.finalize_club_finance_receipt(
  p_receipt_id uuid,
  p_sha256 text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.finalize_club_finance_receipt(p_receipt_id, p_sha256);
$function$;

create or replace function public.fail_club_finance_receipt_upload(p_receipt_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.fail_club_finance_receipt_upload(p_receipt_id);
$function$;

create or replace function public.get_club_finance_receipt_download(p_receipt_id uuid)
returns table (
  id uuid,
  transaction_id uuid,
  object_path text,
  original_filename text,
  content_type text,
  size_bytes integer,
  sha256 text
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.get_club_finance_receipt_download(p_receipt_id);
$function$;

-- All reads and writes for this bucket go through the authenticated Next.js
-- receipt routes. Restrictive policies prevent future broad Storage policies
-- from accidentally enabling direct access for anon/authenticated clients.
create policy club_finance_receipts_deny_direct_select
  on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'club-finance-receipts');
create policy club_finance_receipts_deny_direct_insert
  on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'club-finance-receipts');
create policy club_finance_receipts_deny_direct_update
  on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'club-finance-receipts')
  with check (bucket_id <> 'club-finance-receipts');
create policy club_finance_receipts_deny_direct_delete
  on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'club-finance-receipts');

revoke all on function private.reserve_club_finance_receipt(uuid, uuid, text, text, integer) from public, anon, service_role;
revoke all on function private.finalize_club_finance_receipt(uuid, text) from public, anon, service_role;
revoke all on function private.fail_club_finance_receipt_upload(uuid) from public, anon, service_role;
revoke all on function private.get_club_finance_receipt_download(uuid) from public, anon, service_role;
revoke all on function public.reserve_club_finance_receipt(uuid, uuid, text, text, integer) from public, anon, service_role;
revoke all on function public.finalize_club_finance_receipt(uuid, text) from public, anon, service_role;
revoke all on function public.fail_club_finance_receipt_upload(uuid) from public, anon, service_role;
revoke all on function public.get_club_finance_receipt_download(uuid) from public, anon, service_role;
grant execute on function private.reserve_club_finance_receipt(uuid, uuid, text, text, integer) to authenticated;
grant execute on function private.finalize_club_finance_receipt(uuid, text) to authenticated;
grant execute on function private.fail_club_finance_receipt_upload(uuid) to authenticated;
grant execute on function private.get_club_finance_receipt_download(uuid) to authenticated;
grant execute on function public.reserve_club_finance_receipt(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.finalize_club_finance_receipt(uuid, text) to authenticated;
grant execute on function public.fail_club_finance_receipt_upload(uuid) to authenticated;
grant execute on function public.get_club_finance_receipt_download(uuid) to authenticated;
