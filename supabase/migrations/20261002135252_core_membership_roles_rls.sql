-- Core membership and club-role security foundation.
-- This migration intentionally contains no financial/event feature tables.

create schema if not exists private;

revoke all on schema private from public, anon, service_role;
grant usage on schema private to authenticated;

create table private.administration_guard (
  singleton_id boolean primary key default true check (singleton_id),
  created_at timestamptz not null default now()
);

insert into private.administration_guard (singleton_id)
values (true);

revoke all on table private.administration_guard from public, anon, authenticated, service_role;

create table public.member_profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null,
  username text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_profiles_full_name_check check (
    pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 120
    and full_name = pg_catalog.btrim(full_name)
  ),
  constraint member_profiles_username_check check (
    username ~ '^[A-Za-z0-9_]{3,30}$'
  ),
  constraint member_profiles_status_check check (
    status in ('pending', 'active', 'deactivated')
  )
);

create unique index member_profiles_username_lower_uidx
  on public.member_profiles (pg_catalog.lower(username));

create table public.member_role_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.member_profiles (id) on delete restrict,
  role text not null,
  assigned_by uuid not null references public.member_profiles (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  grant_reason text not null,
  revoked_at timestamptz,
  revoked_by uuid references public.member_profiles (id) on delete restrict,
  revoke_reason text,
  constraint member_role_assignments_role_check check (
    role in ('executive', 'admin', 'backup_admin')
  ),
  constraint member_role_assignments_grant_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(grant_reason)) between 1 and 500
    and grant_reason = pg_catalog.btrim(grant_reason)
  ),
  constraint member_role_assignments_revocation_fields_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (
      revoked_at is not null
      and revoked_by is not null
      and revoke_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(revoke_reason)) between 1 and 500
      and revoke_reason = pg_catalog.btrim(revoke_reason)
    )
  )
);

create unique index member_role_assignments_one_current_role_uidx
  on public.member_role_assignments (member_id, role)
  where revoked_at is null;

create index member_role_assignments_current_role_member_idx
  on public.member_role_assignments (role, member_id)
  where revoked_at is null;

create unique index member_role_assignments_one_current_backup_admin_uidx
  on public.member_role_assignments (role)
  where role = 'backup_admin' and revoked_at is null;

create unique index member_role_assignments_one_admin_identity_per_member_uidx
  on public.member_role_assignments (member_id)
  where role in ('admin', 'backup_admin') and revoked_at is null;

create index member_role_assignments_assigned_by_idx
  on public.member_role_assignments (assigned_by);

create index member_role_assignments_revoked_by_idx
  on public.member_role_assignments (revoked_by)
  where revoked_by is not null;

create table public.audit_log (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  actor_id uuid not null references public.member_profiles (id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  target_member_id uuid references public.member_profiles (id) on delete restrict,
  before_data jsonb,
  after_data jsonb,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint audit_log_action_check check (action ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  constraint audit_log_entity_type_check check (entity_type ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  constraint audit_log_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 500
    and reason = pg_catalog.btrim(reason)
  ),
  constraint audit_log_before_data_object_check check (
    before_data is null or pg_catalog.jsonb_typeof(before_data) = 'object'
  ),
  constraint audit_log_after_data_object_check check (
    after_data is null or pg_catalog.jsonb_typeof(after_data) = 'object'
  )
);

create index audit_log_actor_occurred_idx
  on public.audit_log (actor_id, occurred_at desc);

create index audit_log_target_occurred_idx
  on public.audit_log (target_member_id, occurred_at desc)
  where target_member_id is not null;

create index audit_log_entity_occurred_idx
  on public.audit_log (entity_type, entity_id, occurred_at desc);

create or replace function private.is_active_club_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select mp.status = 'active'
      from public.member_profiles as mp
      where mp.id = (select auth.uid())
    ),
    false
  );
$function$;

create or replace function private.has_club_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    p_role in ('executive', 'admin', 'backup_admin')
    and (select private.is_active_club_member())
    and exists (
      select 1
      from public.member_role_assignments as mra
      where mra.member_id = (select auth.uid())
        and mra.role = p_role
        and mra.revoked_at is null
    ),
    false
  );
$function$;

create or replace function private.has_officer_history_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.has_club_role('admin'))
    or (select private.has_club_role('backup_admin'))
    or (select private.has_club_role('executive'));
$function$;

create or replace function private.set_member_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

create trigger member_profiles_set_updated_at
before update on public.member_profiles
for each row execute function private.set_member_profile_updated_at();

create or replace function private.guard_last_active_primary_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'active'
     and new.status <> 'active'
     and exists (
       select 1
       from public.member_role_assignments as mra
       where mra.member_id = old.id
         and mra.role = 'admin'
         and mra.revoked_at is null
     ) then
    -- Serialize account-status changes with role assignment/revocation functions.
    perform 1
    from private.administration_guard
    where singleton_id = true
    for update;

    if not exists (
      select 1
      from public.member_role_assignments as mra
      join public.member_profiles as mp on mp.id = mra.member_id
      where mra.role = 'admin'
        and mra.revoked_at is null
        and mra.member_id <> old.id
        and mp.status = 'active'
    ) then
      raise exception using
        errcode = '23514',
        message = 'At least one active primary Admin must remain active.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger member_profiles_preserve_last_primary_admin
before update of status on public.member_profiles
for each row execute function private.guard_last_active_primary_admin();

create or replace function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'Audit history is append-only.';
end;
$function$;

create trigger audit_log_append_only
before update or delete on public.audit_log
for each row execute function private.prevent_audit_log_mutation();

create or replace function private.grant_club_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment_id uuid;
  v_reason text := pg_catalog.btrim(p_reason);
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Inactive accounts cannot perform privileged operations.';
  end if;

  if p_member_id is null or p_role is null
     or p_role not in ('executive', 'admin', 'backup_admin') then
    raise exception using errcode = '22023', message = 'Invalid member or club role.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A role-change reason of 1 to 500 characters is required.';
  end if;

  -- One lock serializes role changes and the last-primary-admin check.
  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if p_role = 'executive' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) then
      raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may grant or remove Executive status.';
    end if;
  elsif not (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Only a primary Admin may grant or replace Admin or Backup Admin roles.';
  end if;

  if not exists (
    select 1
    from public.member_profiles as mp
    where mp.id = p_member_id
      and mp.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'Club roles may only be granted to active members.';
  end if;

  insert into public.member_role_assignments (
    member_id,
    role,
    assigned_by,
    grant_reason
  ) values (
    p_member_id,
    p_role,
    v_actor_id,
    v_reason
  )
  returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'club_role_granted',
    'member_role_assignment',
    v_assignment_id,
    p_member_id,
    null,
    pg_catalog.jsonb_build_object('role', p_role, 'active', true),
    v_reason
  );
end;
$function$;

create or replace function private.revoke_club_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_assignment_id uuid;
  v_reason text := pg_catalog.btrim(p_reason);
  v_active_primary_admins bigint;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Inactive accounts cannot perform privileged operations.';
  end if;

  if p_member_id is null or p_role is null
     or p_role not in ('executive', 'admin', 'backup_admin') then
    raise exception using errcode = '22023', message = 'Invalid member or club role.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A role-change reason of 1 to 500 characters is required.';
  end if;

  -- One lock serializes role changes and the last-primary-admin check.
  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if p_role = 'executive' then
    if not (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('backup_admin'))
    ) then
      raise exception using errcode = '42501', message = 'Only Admin or Backup Admin may grant or remove Executive status.';
    end if;
  elsif not (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Only a primary Admin may grant or replace Admin or Backup Admin roles.';
  end if;

  if p_role = 'admin' then
    select pg_catalog.count(*)
    into v_active_primary_admins
    from public.member_role_assignments as mra
    join public.member_profiles as mp on mp.id = mra.member_id
    where mra.role = 'admin'
      and mra.revoked_at is null
      and mp.status = 'active';

    if exists (
      select 1
      from public.member_profiles as mp
      where mp.id = p_member_id
        and mp.status = 'active'
    ) and v_active_primary_admins <= 1 then
      raise exception using
        errcode = '23514',
        message = 'At least one active primary Admin must remain active.';
    end if;
  end if;

  update public.member_role_assignments as mra
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id,
      revoke_reason = v_reason
  where mra.member_id = p_member_id
    and mra.role = p_role
    and mra.revoked_at is null
  returning mra.id into v_assignment_id;

  if v_assignment_id is null then
    raise exception using errcode = 'P0002', message = 'No current assignment exists for that member and role.';
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_member_id,
    before_data,
    after_data,
    reason
  ) values (
    v_actor_id,
    'club_role_revoked',
    'member_role_assignment',
    v_assignment_id,
    p_member_id,
    pg_catalog.jsonb_build_object('role', p_role, 'active', true),
    pg_catalog.jsonb_build_object('role', p_role, 'active', false),
    v_reason
  );
end;
$function$;

create or replace function public.grant_club_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.grant_club_role(p_member_id, p_role, p_reason);
$function$;

create or replace function public.revoke_club_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.revoke_club_role(p_member_id, p_role, p_reason);
$function$;

revoke all on function private.is_active_club_member() from public, anon, service_role;
revoke all on function private.has_club_role(text) from public, anon, service_role;
revoke all on function private.has_officer_history_access() from public, anon, service_role;
revoke all on function private.set_member_profile_updated_at() from public, anon, authenticated, service_role;
revoke all on function private.guard_last_active_primary_admin() from public, anon, authenticated, service_role;
revoke all on function private.prevent_audit_log_mutation() from public, anon, authenticated, service_role;
revoke all on function private.grant_club_role(uuid, text, text) from public, anon, service_role;
revoke all on function private.revoke_club_role(uuid, text, text) from public, anon, service_role;
revoke all on function public.grant_club_role(uuid, text, text) from public, anon, service_role;
revoke all on function public.revoke_club_role(uuid, text, text) from public, anon, service_role;

grant execute on function private.is_active_club_member() to authenticated;
grant execute on function private.has_club_role(text) to authenticated;
grant execute on function private.has_officer_history_access() to authenticated;
grant execute on function private.grant_club_role(uuid, text, text) to authenticated;
grant execute on function private.revoke_club_role(uuid, text, text) to authenticated;
grant execute on function public.grant_club_role(uuid, text, text) to authenticated;
grant execute on function public.revoke_club_role(uuid, text, text) to authenticated;

alter table public.member_profiles enable row level security;
alter table public.member_profiles force row level security;

alter table public.member_role_assignments enable row level security;
alter table public.member_role_assignments force row level security;

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy member_profiles_select_self_or_active_directory_or_officer
  on public.member_profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (
      status = 'active'
      and (select private.is_active_club_member())
    )
    or (select private.has_officer_history_access())
  );

create policy member_role_assignments_select_self_or_officer
  on public.member_role_assignments
  for select
  to authenticated
  using (
    member_id = (select auth.uid())
    or (select private.has_officer_history_access())
  );

create policy audit_log_select_officer_history
  on public.audit_log
  for select
  to authenticated
  using ((select private.has_officer_history_access()));

-- Authenticated clients may read only what RLS allows. All writes are through
-- the checked role RPCs; profile lifecycle writes are added with Step 3.
revoke all on table public.member_profiles from public, anon, authenticated, service_role;
revoke all on table public.member_role_assignments from public, anon, authenticated, service_role;
revoke all on table public.audit_log from public, anon, authenticated, service_role;
grant select on table public.member_profiles to authenticated;
grant select on table public.member_role_assignments to authenticated;
grant select on table public.audit_log to authenticated;

-- Explicit opt-in access for future public-schema objects created by migrations.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

revoke all on schema public from public, anon, service_role;
revoke create on schema public from public, anon, authenticated, service_role;
grant usage on schema public to authenticated;
