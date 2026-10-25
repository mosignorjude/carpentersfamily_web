-- 1. Verify storage bucket is empty and drop legacy storage policies
do $$
begin
  if exists (
    select 1 from storage.objects where bucket_id = 'club-finance-receipts'
  ) then
    raise exception 'Cannot retire club-finance-receipts bucket: bucket is not empty.';
  end if;
end $$;

drop policy if exists club_finance_receipts_deny_direct_select on storage.objects;
drop policy if exists club_finance_receipts_deny_direct_select_anon on storage.objects;
drop policy if exists club_finance_receipts_deny_direct_insert on storage.objects;
drop policy if exists club_finance_receipts_deny_direct_update on storage.objects;
drop policy if exists club_finance_receipts_deny_direct_delete on storage.objects;
drop policy if exists club_finance_receipts_backup_admin_read on storage.objects;

drop function if exists private.can_read_finance_receipt_storage_object(text);

set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'club-finance-receipts';

-- 2. Drop legacy tables and legacy receipt functions
drop table if exists public.club_financial_receipts cascade;
drop table if exists public.event_financial_receipts cascade;

drop function if exists public.reserve_club_financial_receipt(uuid, text, text, bigint, text);
drop function if exists public.finalize_club_financial_receipt(uuid, uuid);
drop function if exists public.fail_club_financial_receipt(uuid, text);
drop function if exists public.reserve_event_financial_receipt(uuid, text, text, bigint, text);
drop function if exists public.finalize_event_financial_receipt(uuid, uuid);
drop function if exists public.fail_event_financial_receipt(uuid, text);

-- 3. Create unified finance_receipts table
create table public.finance_receipts (
  id uuid primary key,
  scope text not null check (scope in ('club', 'event', 'event_ticket', 'dues')),
  club_transaction_id uuid references public.club_financial_transactions(id) on delete restrict,
  event_transaction_id uuid references public.event_financial_transactions(id) on delete restrict,
  event_ticket_sale_id uuid references public.event_ticket_sales(id) on delete restrict,
  dues_request_id uuid references public.dues_payment_requests(id) on delete restrict,
  dues_payment_id uuid references public.dues_payments(id) on delete restrict,
  object_key text not null unique check (
    object_key ~ '^receipts/(club|event|event_ticket|dues)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'
  ),
  original_filename text not null check (
    pg_catalog.char_length(original_filename) between 5 and 120
    and original_filename !~ '[\x00-\x1f/\\\\]'
  ),
  content_type text not null check (
    content_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid not null references public.member_profiles(id),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),

  constraint finance_receipts_target_alignment check (
    case scope
      when 'club' then
        club_transaction_id is not null
        and event_transaction_id is null
        and event_ticket_sale_id is null
        and dues_request_id is null
        and dues_payment_id is null
      when 'event' then
        club_transaction_id is null
        and event_transaction_id is not null
        and event_ticket_sale_id is null
        and dues_request_id is null
        and dues_payment_id is null
      when 'event_ticket' then
        club_transaction_id is null
        and event_transaction_id is null
        and event_ticket_sale_id is not null
        and dues_request_id is null
        and dues_payment_id is null
      when 'dues' then
        club_transaction_id is null
        and event_transaction_id is null
        and event_ticket_sale_id is null
        and (
          (dues_request_id is not null and dues_payment_id is null)
          or (dues_request_id is null and dues_payment_id is not null)
        )
    end
  ),

  constraint finance_receipts_extension_matches_type check (
    case content_type
      when 'application/pdf' then object_key like '%.pdf'
      when 'image/jpeg' then object_key like '%.jpg'
      when 'image/png' then object_key like '%.png'
    end
  )
);

create index finance_receipts_club_idx on public.finance_receipts(club_transaction_id) where club_transaction_id is not null;
create index finance_receipts_event_idx on public.finance_receipts(event_transaction_id) where event_transaction_id is not null;
create index finance_receipts_ticket_idx on public.finance_receipts(event_ticket_sale_id) where event_ticket_sale_id is not null;
create index finance_receipts_dues_req_idx on public.finance_receipts(dues_request_id) where dues_request_id is not null;
create index finance_receipts_dues_pmt_idx on public.finance_receipts(dues_payment_id) where dues_payment_id is not null;

create unique index finance_receipts_no_duplicate_evidence on public.finance_receipts (
  scope,
  coalesce(club_transaction_id, event_transaction_id, event_ticket_sale_id, dues_request_id, dues_payment_id),
  sha256
);

-- 4. Access helper and RLS
create or replace function private.can_read_finance_receipt(p_receipt_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_receipt public.finance_receipts;
  v_dues_payer_id uuid;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    return false;
  end if;

  select * into v_receipt
  from public.finance_receipts
  where id = p_receipt_id;

  if not found then
    return false;
  end if;

  if v_receipt.scope in ('club', 'event', 'event_ticket') then
    return true;
  end if;

  -- Dues receipts: accessible by payer or officers (admin, backup_admin, executive)
  if (select private.has_club_role('admin'))
     or (select private.has_club_role('backup_admin'))
     or (select private.has_club_role('executive')) then
    return true;
  end if;

  if v_receipt.dues_request_id is not null then
    select member_id into v_dues_payer_id
    from public.dues_payment_requests
    where id = v_receipt.dues_request_id;
  elsif v_receipt.dues_payment_id is not null then
    select member_id into v_dues_payer_id
    from public.dues_payments
    where id = v_receipt.dues_payment_id;
  end if;

  return v_dues_payer_id = v_actor_id;
end;
$$;

alter table public.finance_receipts enable row level security;
alter table public.finance_receipts force row level security;

create policy finance_receipts_select_authorized
  on public.finance_receipts for select to authenticated
  using (private.can_read_finance_receipt(id));

grant select on public.finance_receipts to authenticated;

-- 5. Download RPC
create or replace function public.get_finance_receipt_download(p_receipt_id uuid)
returns table (
  object_key text,
  original_filename text,
  content_type text,
  size_bytes integer,
  sha256 text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not (select private.can_read_finance_receipt(p_receipt_id)) then
    return;
  end if;

  return query
  select fr.object_key, fr.original_filename, fr.content_type, fr.size_bytes, fr.sha256
  from public.finance_receipts as fr
  where fr.id = p_receipt_id;
end;
$$;

revoke all on function private.can_read_finance_receipt(uuid) from public, anon, service_role;
revoke all on function public.get_finance_receipt_download(uuid) from public, anon, service_role;
grant execute on function public.get_finance_receipt_download(uuid) to authenticated;
