-- Authentication-owned profile creation and checked member lifecycle actions.
-- No financial, event, or storage features are introduced in this migration.

alter table public.member_profiles
  add column profile_completed_at timestamptz;

alter table public.member_profiles
  add constraint member_profiles_active_requires_completed_profile_check
  check (status <> 'active' or profile_completed_at is not null);

create or replace function private.create_member_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_full_name text := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), '');
  v_username text := nullif(new.raw_user_meta_data ->> 'username', '');
  v_name_valid boolean;
  v_username_valid boolean;
  v_profile_completed_at timestamptz;
begin
  v_name_valid := v_full_name is not null
    and pg_catalog.char_length(v_full_name) between 1 and 120
    and v_full_name !~ '[[:cntrl:]]';
  v_username_valid := v_username is not null
    and v_username ~ '^[A-Za-z0-9_]{3,30}$';

  if not v_name_valid then
    v_full_name := 'Pending member';
  end if;

  if not v_username_valid then
    v_username := 'member_' || pg_catalog.substr(
      pg_catalog.replace(new.id::text, '-', ''),
      1,
      23
    );
  end if;

  if v_name_valid and v_username_valid then
    v_profile_completed_at := pg_catalog.clock_timestamp();
  end if;

  begin
    insert into public.member_profiles (
      id,
      full_name,
      username,
      status,
      profile_completed_at
    ) values (
      new.id,
      v_full_name,
      v_username,
      'pending',
      v_profile_completed_at
    );
  exception when unique_violation then
    -- A duplicate chosen username must not prevent Auth from creating the
    -- pending account. The member must choose a unique username to complete it.
    insert into public.member_profiles (
      id,
      full_name,
      username,
      status,
      profile_completed_at
    ) values (
      new.id,
      v_full_name,
      'member_' || pg_catalog.substr(
        pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        1,
        23
      ),
      'pending',
      null
    );
  end;

  return new;
end;
$function$;

create trigger on_auth_user_created_member_profile
after insert on auth.users
for each row execute function private.create_member_profile_for_auth_user();

-- Backfill any Auth users created before this trigger. Never infer a role or
-- account status from Auth metadata.
insert into public.member_profiles (id, full_name, username, status)
select
  au.id,
  'Pending member',
  'member_' || pg_catalog.substr(pg_catalog.replace(au.id::text, '-', ''), 1, 23),
  'pending'
from auth.users as au
where not exists (
  select 1 from public.member_profiles as mp where mp.id = au.id
)
on conflict (id) do nothing;

create or replace function private.enforce_member_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'active' then
    if new.profile_completed_at is null then
      raise exception using
        errcode = '23514',
        message = 'A completed profile is required before membership approval.';
    end if;

    if not exists (
      select 1
      from auth.users as au
      where au.id = new.id
        and au.email_confirmed_at is not null
    ) then
      raise exception using
        errcode = '23514',
        message = 'A confirmed email address is required before membership approval.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger member_profiles_require_verified_approval
before update of status on public.member_profiles
for each row execute function private.enforce_member_profile_activation();

create or replace function private.prevent_completed_profile_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.profile_completed_at is not null
     and (
       new.full_name is distinct from old.full_name
       or new.username is distinct from old.username
       or new.profile_completed_at is distinct from old.profile_completed_at
     ) then
    raise exception using
      errcode = '42501',
      message = 'A completed member profile is immutable.';
  end if;
  return new;
end;
$function$;

create trigger member_profiles_keep_completed_identity
before update of full_name, username, profile_completed_at on public.member_profiles
for each row execute function private.prevent_completed_profile_identity_change();

create or replace function private.complete_member_profile(
  p_full_name text,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_member_id uuid := (select auth.uid());
  v_full_name text := pg_catalog.btrim(p_full_name);
  v_username text := p_username;
begin
  if v_member_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if v_full_name is null
     or pg_catalog.char_length(v_full_name) not between 1 and 120
     or v_full_name ~ '[[:cntrl:]]'
     or v_username is null
     or v_username !~ '^[A-Za-z0-9_]{3,30}$' then
    raise exception using
      errcode = '22023',
      message = 'A valid name and username are required.';
  end if;

  update public.member_profiles as mp
  set full_name = v_full_name,
      username = v_username,
      profile_completed_at = pg_catalog.clock_timestamp()
  where mp.id = v_member_id
    and mp.status = 'pending'
    and mp.profile_completed_at is null;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only a pending member with an incomplete profile can complete their own profile.';
  end if;
exception when unique_violation then
  raise exception using
    errcode = '23505',
    message = 'That username is already in use.';
end;
$function$;

create or replace function private.approve_member(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
  v_profile_completed_at timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and 1 to 500 character reason are required.';
  end if;

  -- Serialize approval/deactivation/reactivation with administrator and role
  -- changes, and take the target row lock only after acquiring this lock.
  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or Backup Admin may approve members.';
  end if;

  select mp.status, mp.profile_completed_at
  into v_before_status, v_profile_completed_at
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found or v_before_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only a pending member can be approved.';
  end if;

  if v_profile_completed_at is null then
    raise exception using
      errcode = '23514',
      message = 'The member must complete their profile before approval.';
  end if;

  if not exists (
    select 1
    from auth.users as au
    where au.id = p_member_id
      and au.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'The member must confirm their email before approval.';
  end if;

  update public.member_profiles
  set status = 'active'
  where id = p_member_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    'member_approved',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_before_status),
    pg_catalog.jsonb_build_object('status', 'active'),
    v_reason
  );
end;
$function$;

create or replace function private.deactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and 1 to 500 character reason are required.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may deactivate members.';
  end if;

  if p_member_id = v_actor_id then
    raise exception using
      errcode = '42501',
      message = 'Administrators cannot deactivate their own account.';
  end if;

  select mp.status
  into v_before_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found or v_before_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'Only an active member can be deactivated.';
  end if;

  update public.member_profiles
  set status = 'deactivated'
  where id = p_member_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    'member_deactivated',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_before_status),
    pg_catalog.jsonb_build_object('status', 'deactivated'),
    v_reason
  );
end;
$function$;

create or replace function private.reactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and 1 to 500 character reason are required.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or Backup Admin may reactivate members.';
  end if;

  select mp.status
  into v_before_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found or v_before_status <> 'deactivated' then
    raise exception using
      errcode = '23514',
      message = 'Only a deactivated member can be reactivated.';
  end if;

  update public.member_profiles
  set status = 'active'
  where id = p_member_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    'member_reactivated',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_before_status),
    pg_catalog.jsonb_build_object('status', 'active'),
    v_reason
  );
end;
$function$;

create or replace function public.complete_member_profile(
  p_full_name text,
  p_username text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.complete_member_profile(p_full_name, p_username);
$function$;

create or replace function public.approve_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.approve_member(p_member_id, p_reason);
$function$;

create or replace function public.deactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.deactivate_member(p_member_id, p_reason);
$function$;

create or replace function public.reactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.reactivate_member(p_member_id, p_reason);
$function$;

revoke all on function private.create_member_profile_for_auth_user() from public, anon, authenticated, service_role;
revoke all on function private.enforce_member_profile_activation() from public, anon, authenticated, service_role;
revoke all on function private.prevent_completed_profile_identity_change() from public, anon, authenticated, service_role;
revoke all on function private.complete_member_profile(text, text) from public, anon, service_role;
revoke all on function private.approve_member(uuid, text) from public, anon, service_role;
revoke all on function private.deactivate_member(uuid, text) from public, anon, service_role;
revoke all on function private.reactivate_member(uuid, text) from public, anon, service_role;
revoke all on function public.complete_member_profile(text, text) from public, anon, service_role;
revoke all on function public.approve_member(uuid, text) from public, anon, service_role;
revoke all on function public.deactivate_member(uuid, text) from public, anon, service_role;
revoke all on function public.reactivate_member(uuid, text) from public, anon, service_role;

grant usage on schema private to authenticated;
grant execute on function private.complete_member_profile(text, text) to authenticated;
grant execute on function private.approve_member(uuid, text) to authenticated;
grant execute on function private.deactivate_member(uuid, text) to authenticated;
grant execute on function private.reactivate_member(uuid, text) to authenticated;
grant execute on function public.complete_member_profile(text, text) to authenticated;
grant execute on function public.approve_member(uuid, text) to authenticated;
grant execute on function public.deactivate_member(uuid, text) to authenticated;
grant execute on function public.reactivate_member(uuid, text) to authenticated;

-- The trigger executes as its owner when Supabase Auth creates an Auth user.
-- Keep the function unreachable from client roles.
revoke all on function private.create_member_profile_for_auth_user() from public, anon, authenticated, service_role;

-- Profiles remain read-only to client table operations. Lifecycle changes use
-- the checked RPCs above; role/audit writes remain restricted as in Step 2.
revoke insert, update, delete on table public.member_profiles from authenticated;

