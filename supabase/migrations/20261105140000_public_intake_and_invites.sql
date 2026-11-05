-- 20261105140000_public_intake_and_invites.sql
-- Schema for public intake (membership requests, partnership enquiries) and invitation tokens

-- 1. Membership Requests
create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone text not null check (char_length(trim(phone)) between 7 and 25),
  profession text not null check (char_length(trim(profession)) between 2 and 120),
  reason_for_joining text not null check (char_length(trim(reason_for_joining)) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.membership_requests enable row level security;
revoke all on public.membership_requests from public, anon, authenticated;

-- 2. Partnership Enquiries
create table if not exists public.partnership_enquiries (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 120),
  organization_name text not null check (char_length(trim(organization_name)) between 2 and 160),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  phone text not null check (char_length(trim(phone)) between 7 and 25),
  enquiry_type text not null check (enquiry_type in ('brand_activation', 'sponsorship', 'corporate_booking', 'general')),
  message text not null check (char_length(trim(message)) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'closed')),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.partnership_enquiries enable row level security;
revoke all on public.partnership_enquiries from public, anon, authenticated;

-- 3. Member Invites (Single-use Cryptographic Tokens)
create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  token text not null unique check (token ~* '^[a-f0-9]{32,64}$'),
  role text not null default 'member' check (role in ('member', 'executive', 'admin')),
  request_id uuid references public.membership_requests(id) on delete set null,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.member_invites enable row level security;
revoke all on public.member_invites from public, anon, authenticated;

-- Explicit grants for authenticated officers to read records
grant select on public.membership_requests to authenticated;
grant select on public.partnership_enquiries to authenticated;
grant select on public.member_invites to authenticated;

-- RLS policies: only active club officers can read intake and invite tables
create policy membership_requests_officer_read on public.membership_requests
  for select to authenticated
  using (
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('president'))
    )
  );

create policy partnership_enquiries_officer_read on public.partnership_enquiries
  for select to authenticated
  using (
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('president'))
    )
  );

create policy member_invites_officer_read on public.member_invites
  for select to authenticated
  using (
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('executive'))
      or (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
      or (select private.has_club_role('president'))
    )
  );

-- Ensure anon has usage on schema public to execute public RPCs
grant usage on schema public to anon;

-- Indexes for status queues and email lookups
create index if not exists membership_requests_status_idx on public.membership_requests(status, created_at desc);
create index if not exists membership_requests_email_idx on public.membership_requests(email);
create index if not exists partnership_enquiries_status_idx on public.partnership_enquiries(status, created_at desc);
create index if not exists member_invites_token_idx on public.member_invites(token) where consumed_at is null;
create index if not exists member_invites_email_idx on public.member_invites(email);

-- 4. Public Intake & Invite Lifecycle RPCs

-- 4.1 submit_membership_request
create or replace function public.submit_membership_request(
  p_full_name text,
  p_email text,
  p_phone text,
  p_profession text,
  p_reason_for_joining text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_full_name text := pg_catalog.btrim(p_full_name);
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_phone text := pg_catalog.btrim(p_phone);
  v_profession text := pg_catalog.btrim(p_profession);
  v_reason text := pg_catalog.btrim(p_reason_for_joining);
  v_new_id uuid;
begin
  if v_full_name is null or pg_catalog.char_length(v_full_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Full name must be between 2 and 120 characters.';
  end if;

  if v_email is null or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception using errcode = '22023', message = 'A valid email address is required.';
  end if;

  if v_phone is null or pg_catalog.char_length(v_phone) not between 7 and 25 then
    raise exception using errcode = '22023', message = 'Phone number must be between 7 and 25 characters.';
  end if;

  if v_profession is null or pg_catalog.char_length(v_profession) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Profession must be between 2 and 120 characters.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 10 and 2000 then
    raise exception using errcode = '22023', message = 'Reason for joining must be between 10 and 2000 characters.';
  end if;

  -- Deduplication check: check if a pending request exists for the same normalized email
  if exists (
    select 1 from public.membership_requests
    where email = v_email and status = 'pending' and created_at > (pg_catalog.now() - interval '30 days')
  ) then
    raise exception using errcode = '23505', message = 'A pending membership request already exists for this email.';
  end if;

  insert into public.membership_requests (
    full_name, email, phone, profession, reason_for_joining, status
  ) values (
    v_full_name, v_email, v_phone, v_profession, v_reason, 'pending'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.submit_membership_request(text, text, text, text, text) from public;
grant execute on function public.submit_membership_request(text, text, text, text, text) to anon, authenticated, service_role;

-- 4.2 submit_partnership_enquiry
create or replace function public.submit_partnership_enquiry(
  p_contact_name text,
  p_organization_name text,
  p_email text,
  p_phone text,
  p_enquiry_type text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_contact_name text := pg_catalog.btrim(p_contact_name);
  v_organization_name text := pg_catalog.btrim(p_organization_name);
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_phone text := pg_catalog.btrim(p_phone);
  v_enquiry_type text := pg_catalog.btrim(p_enquiry_type);
  v_message text := pg_catalog.btrim(p_message);
  v_new_id uuid;
begin
  if v_contact_name is null or pg_catalog.char_length(v_contact_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Contact name must be between 2 and 120 characters.';
  end if;

  if v_organization_name is null or pg_catalog.char_length(v_organization_name) not between 2 and 160 then
    raise exception using errcode = '22023', message = 'Organization name must be between 2 and 160 characters.';
  end if;

  if v_email is null or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception using errcode = '22023', message = 'A valid email address is required.';
  end if;

  if v_phone is null or pg_catalog.char_length(v_phone) not between 7 and 25 then
    raise exception using errcode = '22023', message = 'Phone number must be between 7 and 25 characters.';
  end if;

  if v_enquiry_type not in ('brand_activation', 'sponsorship', 'corporate_booking', 'general') then
    raise exception using errcode = '22023', message = 'Invalid enquiry type.';
  end if;

  if v_message is null or pg_catalog.char_length(v_message) not between 10 and 3000 then
    raise exception using errcode = '22023', message = 'Message must be between 10 and 3000 characters.';
  end if;

  insert into public.partnership_enquiries (
    contact_name, organization_name, email, phone, enquiry_type, message, status
  ) values (
    v_contact_name, v_organization_name, v_email, v_phone, v_enquiry_type, v_message, 'pending'
  )
  returning id into v_new_id;

  return v_new_id;
end;
$function$;

revoke all on function public.submit_partnership_enquiry(text, text, text, text, text, text) from public;
grant execute on function public.submit_partnership_enquiry(text, text, text, text, text, text) to anon, authenticated, service_role;

-- 4.3 create_member_invite
create or replace function public.create_member_invite(
  p_email text,
  p_role text default 'member',
  p_request_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
  v_role text := coalesce(nullif(pg_catalog.btrim(p_role), ''), 'member');
  v_token text;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    if v_actor_id is null then
      raise exception using errcode = '28000', message = 'Authentication is required.';
    end if;

    if exists (
      select 1 from public.member_profiles as mp
      where mp.id = v_actor_id and mp.status = 'staff'
    ) then
      raise exception using errcode = '42501', message = 'Staff accounts cannot issue membership invites.';
    end if;

    if not (select private.is_active_club_member())
       or not (
         (select private.has_club_role('executive'))
         or (select private.has_club_role('admin'))
         or (select private.has_club_role('backup_admin'))
         or (select private.has_club_role('president'))
       ) then
      raise exception using errcode = '42501', message = 'Only club officers may create invites.';
    end if;
  else
    if v_actor_id is null then
      select id into v_actor_id from auth.users order by created_at asc limit 1;
    end if;
  end if;

  if v_email is null or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception using errcode = '22023', message = 'A valid email address is required.';
  end if;

  if v_role not in ('member', 'executive', 'admin') then
    raise exception using errcode = '22023', message = 'Role must be member, executive, or admin.';
  end if;

  -- Generate 64-character hex token from 32 random bytes
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.member_invites (
    email, token, role, request_id, created_by, expires_at
  ) values (
    v_email, v_token, v_role, p_request_id, v_actor_id, pg_catalog.now() + interval '7 days'
  );

  return v_token;
end;
$function$;

revoke all on function public.create_member_invite(text, text, uuid) from public;
grant execute on function public.create_member_invite(text, text, uuid) to authenticated, service_role;

-- 4.4 review_membership_request
create or replace function public.review_membership_request(
  p_request_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_decision text := pg_catalog.lower(pg_catalog.btrim(p_decision));
  v_req record;
  v_token text;
begin
  if current_user not in ('postgres', 'supabase_admin') then
    if v_actor_id is null then
      raise exception using errcode = '28000', message = 'Authentication is required.';
    end if;

    if exists (
      select 1 from public.member_profiles as mp
      where mp.id = v_actor_id and mp.status = 'staff'
    ) then
      raise exception using errcode = '42501', message = 'Staff accounts cannot review membership requests.';
    end if;

    if not (select private.is_active_club_member())
       or not (
         (select private.has_club_role('executive'))
         or (select private.has_club_role('admin'))
         or (select private.has_club_role('backup_admin'))
         or (select private.has_club_role('president'))
       ) then
      raise exception using errcode = '42501', message = 'Only club officers may review membership requests.';
    end if;
  else
    if v_actor_id is null then
      select id into v_actor_id from auth.users order by created_at asc limit 1;
    end if;
  end if;

  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A request ID is required.';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Decision must be approved or rejected.';
  end if;

  select * into v_req from public.membership_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Membership request not found.';
  end if;

  if v_req.status <> 'pending' then
    raise exception using errcode = '23514', message = 'Only pending requests can be reviewed.';
  end if;

  if v_decision = 'approved' then
    v_token := public.create_member_invite(v_req.email, 'member', p_request_id);

    update public.membership_requests
    set status = 'approved',
        reviewed_by = v_actor_id,
        reviewed_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_request_id;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'status', 'approved',
      'token', v_token
    );
  else
    if p_rejection_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_rejection_reason)) < 5 then
      raise exception using errcode = '22023', message = 'A rejection reason of at least 5 characters is required.';
    end if;

    update public.membership_requests
    set status = 'rejected',
        reviewed_by = v_actor_id,
        reviewed_at = pg_catalog.now(),
        rejection_reason = pg_catalog.btrim(p_rejection_reason),
        updated_at = pg_catalog.now()
    where id = p_request_id;

    return pg_catalog.jsonb_build_object(
      'success', true,
      'status', 'rejected'
    );
  end if;
end;
$function$;

revoke all on function public.review_membership_request(uuid, text, text) from public;
grant execute on function public.review_membership_request(uuid, text, text) to authenticated, service_role;

-- 4.5 validate_invite_token
create or replace function public.validate_invite_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_clean_token text := pg_catalog.lower(pg_catalog.btrim(p_token));
  v_invite record;
begin
  if v_clean_token is null or v_clean_token = '' then
    return pg_catalog.jsonb_build_object('valid', false, 'reason', 'missing');
  end if;

  select * into v_invite
  from public.member_invites
  where token = v_clean_token;

  if not found then
    return pg_catalog.jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_invite.consumed_at is not null then
    return pg_catalog.jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  if v_invite.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('valid', false, 'reason', 'expired');
  end if;

  return pg_catalog.jsonb_build_object(
    'valid', true,
    'email', v_invite.email,
    'role', v_invite.role,
    'expires_at', v_invite.expires_at
  );
end;
$function$;

revoke all on function public.validate_invite_token(text) from public;
grant execute on function public.validate_invite_token(text) to anon, authenticated, service_role;

-- 4.6 consume_invite_token
create or replace function public.consume_invite_token(
  p_token text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_clean_token text := pg_catalog.lower(pg_catalog.btrim(p_token));
  v_invite record;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A user ID is required.';
  end if;

  select * into v_invite
  from public.member_invites
  where token = v_clean_token
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Invite token not found.';
  end if;

  if v_invite.consumed_at is not null then
    raise exception using errcode = '23514', message = 'Invite token has already been consumed.';
  end if;

  if v_invite.expires_at <= pg_catalog.now() then
    raise exception using errcode = '23514', message = 'Invite token has expired.';
  end if;

  update public.member_invites
  set consumed_at = pg_catalog.now(),
      consumed_by = p_user_id
  where id = v_invite.id;

  return true;
end;
$function$;

revoke all on function public.consume_invite_token(text, uuid) from public;
grant execute on function public.consume_invite_token(text, uuid) to authenticated, service_role;
