-- Replace a member's global club role atomically and preserve an audit record.
create or replace function private.set_club_role(
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
  v_reason text := pg_catalog.btrim(p_reason);
  v_target_status text;
  v_current_roles text[] := array[]::text[];
  v_target_has_primary_role boolean;
  v_target_has_admin boolean;
  v_active_primary_admins bigint;
  v_assignment record;
  v_assignment_id uuid;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null or p_role is null
     or p_role not in ('member', 'executive', 'admin', 'backup_admin') then
    raise exception using errcode = '22023', message = 'Invalid member or club role.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A role-change reason of 1 to 500 characters is required.';
  end if;

  if p_member_id = v_actor_id then
    raise exception using errcode = '42501', message = 'Administrators cannot change their own club role.';
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
    raise exception using errcode = '42501', message = 'Only an active Admin or Backup Admin may change club roles.';
  end if;

  select mp.status
  into v_target_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found or v_target_status <> 'active' then
    raise exception using errcode = '23514', message = 'Club roles may only be changed for active members.';
  end if;

  select coalesce(pg_catalog.array_agg(mra.role order by mra.role), array[]::text[])
  into v_current_roles
  from public.member_role_assignments as mra
  where mra.member_id = p_member_id
    and mra.revoked_at is null;

  v_target_has_primary_role := v_current_roles && array['admin', 'backup_admin']::text[];
  v_target_has_admin := 'admin' = any(v_current_roles);

  if (p_role in ('admin', 'backup_admin') or v_target_has_primary_role)
     and not (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Only a primary Admin may change Admin or Backup Admin assignments.';
  end if;

  if (p_role = 'member' and pg_catalog.cardinality(v_current_roles) = 0)
     or (p_role <> 'member'
         and pg_catalog.cardinality(v_current_roles) = 1
         and v_current_roles[1] = p_role) then
    return;
  end if;

  if v_target_has_admin and p_role <> 'admin' then
    select pg_catalog.count(*)
    into v_active_primary_admins
    from public.member_role_assignments as mra
    join public.member_profiles as mp on mp.id = mra.member_id
    where mra.role = 'admin'
      and mra.revoked_at is null
      and mp.status = 'active';

    if v_active_primary_admins <= 1 then
      raise exception using
        errcode = '23514',
        message = 'At least one active primary Admin must remain active.';
    end if;
  end if;

  for v_assignment in
    select mra.id, mra.role
    from public.member_role_assignments as mra
    where mra.member_id = p_member_id
      and mra.revoked_at is null
      and (p_role = 'member' or mra.role <> p_role)
    order by mra.role
    for update
  loop
    update public.member_role_assignments as mra
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = v_actor_id,
        revoke_reason = v_reason
    where mra.id = v_assignment.id
    returning mra.id into v_assignment_id;

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
      pg_catalog.jsonb_build_object('role', v_assignment.role, 'active', true),
      pg_catalog.jsonb_build_object('role', v_assignment.role, 'active', false),
      v_reason
    );
  end loop;

  if p_role <> 'member' and not (p_role = any(v_current_roles)) then
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
  end if;
end;
$function$;

create or replace function public.set_club_role(
  p_member_id uuid,
  p_role text,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.set_club_role(p_member_id, p_role, p_reason);
$function$;

revoke all on function private.set_club_role(uuid, text, text) from public, anon, service_role;
revoke all on function public.set_club_role(uuid, text, text) from public, anon, service_role;

grant execute on function private.set_club_role(uuid, text, text) to authenticated;
grant execute on function public.set_club_role(uuid, text, text) to authenticated;
