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

-- Indexes for status queues and email lookups
create index if not exists membership_requests_status_idx on public.membership_requests(status, created_at desc);
create index if not exists membership_requests_email_idx on public.membership_requests(email);
create index if not exists partnership_enquiries_status_idx on public.partnership_enquiries(status, created_at desc);
create index if not exists member_invites_token_idx on public.member_invites(token) where consumed_at is null;
create index if not exists member_invites_email_idx on public.member_invites(email);
