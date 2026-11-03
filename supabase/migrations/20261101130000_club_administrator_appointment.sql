-- Club Admin: a staff-appointed, dues-exempt money authority.
-- This migration adds one cardinality index, one grant/revoke RPC pair and a
-- display label. It changes no existing authorisation gate: every money, dues,
-- event and attendance check already calls private.has_club_role('admin'), and
-- that predicate already requires member_profiles.status = 'active', so an
-- active member holding a live admin assignment passes those gates unchanged.

-- At most one live Club Admin assignment may exist at a time. The index counts
-- rows, not member status: an unrevoked assignment belonging to a deactivated
-- member would occupy the slot, which is why the existing status trigger
-- (member_profiles_preserve_last_primary_admin) forces revoke-before-deactivate.
create unique index member_role_assignments_one_current_admin_uidx
  on public.member_role_assignments (role)
  where role = 'admin' and revoked_at is null;

comment on index public.member_role_assignments_one_current_admin_uidx is
  'At most one live Club Admin assignment exists; staff appoint and revoke it.';

-- Staff grant the Club Admin role. Members have no path that accepts
-- p_role = 'admin', so this is the only way the role can be created.
create or replace function private.staff_grant_admin(
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
  v_existing record;
  v_assignment_id uuid;
begin
  if v_actor_id is null or not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  if exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status <> 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'The club administrator must be an active member.';
  end if;

  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23514',
      message = 'That account does not exist.';
  end if;

  if exists (
    select 1 from public.member_role_assignments
    where member_id = p_member_id and role = 'president' and revoked_at is null
  ) then
    raise exception using errcode = '23514',
      message = 'Revoke the president role before granting Club Admin.';
  end if;

  for v_existing in
    select mra.id, mra.member_id
    from public.member_role_assignments as mra
    where mra.role = 'admin' and mra.revoked_at is null
    for update
  loop
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = v_actor_id,
        revoke_reason = v_reason
    where id = v_existing.id;

    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      v_actor_id, 'club_role_revoked', 'member_role_assignment',
      v_existing.id, v_existing.member_id,
      pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
      pg_catalog.jsonb_build_object('role', 'admin', 'active', false),
      v_reason
    );
  end loop;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    p_member_id, 'admin', v_actor_id, v_reason
  ) returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_granted', 'member_role_assignment',
    v_assignment_id, p_member_id, null,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    v_reason
  );
end;
$function$;

create or replace function public.staff_grant_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_grant_admin(p_member_id, p_reason);
$function$;

revoke all on function private.staff_grant_admin(uuid, text) from public, anon, service_role;
revoke all on function public.staff_grant_admin(uuid, text) from public, anon, service_role;
grant execute on function private.staff_grant_admin(uuid, text) to authenticated;
grant execute on function public.staff_grant_admin(uuid, text) to authenticated;

-- Staff withdraw the Club Admin role. There is no "at least one admin must
-- remain" floor guard here, unlike the legacy officer paths: staff are the only
-- granters and must always be able to pull authority back, and a club with zero
-- club admins is still governed by its president through backup_admin.
create or replace function private.staff_revoke_admin(
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
  v_assignment_id uuid;
begin
  if v_actor_id is null or not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  update public.member_role_assignments as mra
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id,
      revoke_reason = v_reason
  where mra.member_id = p_member_id
    and mra.role = 'admin'
    and mra.revoked_at is null
  returning mra.id into v_assignment_id;

  if v_assignment_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No active club administrator assignment exists.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_revoked', 'member_role_assignment',
    v_assignment_id, p_member_id,
    pg_catalog.jsonb_build_object('role', 'admin', 'active', true),
    pg_catalog.jsonb_build_object('role', 'admin', 'active', false),
    v_reason
  );
end;
$function$;

create or replace function public.staff_revoke_admin(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_revoke_admin(p_member_id, p_reason);
$function$;

revoke all on function private.staff_revoke_admin(uuid, text) from public, anon, service_role;
revoke all on function public.staff_revoke_admin(uuid, text) from public, anon, service_role;
grant execute on function private.staff_revoke_admin(uuid, text) to authenticated;
grant execute on function public.staff_revoke_admin(uuid, text) to authenticated;

-- Display label only. The technical role value stays 'admin' everywhere; the
-- word "superuser" describes staff and must never appear in member-facing text.
-- Restating the whole function keeps every other branch identical to
-- 20261029121000_president_role_and_alias.sql, and create or replace preserves
-- the existing ACL: this is reached only from inside other definer functions.
create or replace function private.format_role_label(p_role text)
returns text
language sql
immutable
security definer
set search_path = ''
as $function$
  select case pg_catalog.lower(coalesce(p_role, ''))
    when 'admin' then 'Club Admin'
    when 'backup_admin' then 'Backup Admin'
    when 'president' then 'President'
    when 'executive' then 'Executive'
    when 'member' then 'Member'
    when 'lead' then 'Event Lead'
    when 'assistant' then 'Event Assistant'
    when 'committee' then 'Committee Member'
    else initcap(pg_catalog.replace(coalesce(p_role, 'Member'), '_', ' '))
  end;
$function$;
