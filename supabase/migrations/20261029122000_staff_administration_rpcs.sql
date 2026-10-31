-- Staff administration. Lifecycle changes split into role-check-free cores so
-- the member and staff entry points share one state machine and audit shape.
create or replace function private.approve_member_core(
  p_member_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
  v_profile_completed_at timestamptz;
begin
  if p_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and 1 to 500 character reason are required.';
  end if;

  -- Serialize lifecycle changes with administrator and role changes, and take
  -- the target row lock only after acquiring this lock.
  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

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
    p_actor_id,
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

create or replace function private.reject_member_core(
  p_member_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if p_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500
     or pg_catalog.translate(
       p_reason,
       pg_catalog.chr(10) || pg_catalog.chr(13),
       ''
     ) ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character rejection reason are required.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  select mp.status
  into v_before_status
  from public.member_profiles as mp
  where mp.id = p_member_id
  for update;

  if not found or v_before_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only a pending membership request can be rejected.';
  end if;

  update public.member_profiles
  set status = 'rejected'
  where id = p_member_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    p_actor_id,
    'member_request_rejected',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('status', v_before_status),
    pg_catalog.jsonb_build_object('status', 'rejected'),
    v_reason
  );
end;
$function$;

create or replace function private.deactivate_member_core(
  p_member_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
  v_president_assignment record;
begin
  if p_actor_id is null then
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

  if p_member_id = p_actor_id then
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

  -- A deactivated president cannot keep the club administrator role.
  for v_president_assignment in
    select mra.id
    from public.member_role_assignments as mra
    where mra.member_id = p_member_id
      and mra.role = 'president'
      and mra.revoked_at is null
    for update
  loop
    update public.member_role_assignments
    set revoked_at = pg_catalog.clock_timestamp(),
        revoked_by = p_actor_id,
        revoke_reason = v_reason
    where id = v_president_assignment.id;

    insert into public.audit_log (
      actor_id, action, entity_type, entity_id, target_member_id,
      before_data, after_data, reason
    ) values (
      p_actor_id,
      'club_role_revoked',
      'member_role_assignment',
      v_president_assignment.id,
      p_member_id,
      pg_catalog.jsonb_build_object('role', 'president', 'active', true),
      pg_catalog.jsonb_build_object('role', 'president', 'active', false),
      v_reason
    );
  end loop;

  update public.member_profiles
  set status = 'deactivated'
  where id = p_member_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    p_actor_id,
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

create or replace function private.reactivate_member_core(
  p_member_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if p_actor_id is null then
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
    p_actor_id,
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

-- Member entry points keep their authorization and delegate the transition.
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('president'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or President may approve members.';
  end if;

  perform private.approve_member_core(p_member_id, p_reason, v_actor_id);
end;
$function$;

create or replace function private.reject_member(
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('president'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or President may reject membership requests.';
  end if;

  perform private.reject_member_core(p_member_id, p_reason, v_actor_id);
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('president'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or President may deactivate members.';
  end if;

  perform private.deactivate_member_core(p_member_id, p_reason, v_actor_id);
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('admin'))
       or (select private.has_club_role('president'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Admin or President may reactivate members.';
  end if;

  perform private.reactivate_member_core(p_member_id, p_reason, v_actor_id);
end;
$function$;

-- Staff entry points do not require membership; they require staff status.
create or replace function private.staff_approve_member(
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform private.approve_member_core(p_member_id, v_reason, v_actor_id);
end;
$function$;

create or replace function private.staff_reject_member(
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform private.reject_member_core(p_member_id, v_reason, v_actor_id);
end;
$function$;

create or replace function private.staff_deactivate_member(
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform private.deactivate_member_core(p_member_id, v_reason, v_actor_id);
end;
$function$;

create or replace function private.staff_reactivate_member(
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform private.reactivate_member_core(p_member_id, v_reason, v_actor_id);
end;
$function$;

create or replace function public.staff_approve_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_approve_member(p_member_id, p_reason);
$function$;

create or replace function public.staff_reject_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_reject_member(p_member_id, p_reason);
$function$;

create or replace function public.staff_deactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_deactivate_member(p_member_id, p_reason);
$function$;

create or replace function public.staff_reactivate_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_reactivate_member(p_member_id, p_reason);
$function$;

-- Staff appoint and revoke the club president; members never can.
create or replace function private.staff_appoint_president(
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
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  if not exists (
    select 1 from public.member_profiles as mp
    where mp.id = p_member_id and mp.status = 'active'
  ) then
    raise exception using errcode = '23514', message = 'The president must be an active member.';
  end if;

  for v_existing in
    select mra.id, mra.member_id
    from public.member_role_assignments as mra
    where mra.role = 'president' and mra.revoked_at is null
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
      pg_catalog.jsonb_build_object('role', 'president', 'active', true),
      pg_catalog.jsonb_build_object('role', 'president', 'active', false),
      v_reason
    );
  end loop;

  insert into public.member_role_assignments (
    member_id, role, assigned_by, grant_reason
  ) values (
    p_member_id, 'president', v_actor_id, v_reason
  ) returning id into v_assignment_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_granted', 'member_role_assignment',
    v_assignment_id, p_member_id, null,
    pg_catalog.jsonb_build_object('role', 'president', 'active', true),
    v_reason
  );
end;
$function$;

create or replace function private.staff_revoke_president(
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
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  update public.member_role_assignments as mra
  set revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_actor_id,
      revoke_reason = v_reason
  where mra.member_id = p_member_id
    and mra.role = 'president'
    and mra.revoked_at is null
  returning mra.id into v_assignment_id;

  if v_assignment_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'No current president assignment exists for that member.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id, 'club_role_revoked', 'member_role_assignment',
    v_assignment_id, p_member_id,
    pg_catalog.jsonb_build_object('role', 'president', 'active', true),
    pg_catalog.jsonb_build_object('role', 'president', 'active', false),
    v_reason
  );
end;
$function$;

create or replace function public.staff_appoint_president(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_appoint_president(p_member_id, p_reason);
$function$;

create or replace function public.staff_revoke_president(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_revoke_president(p_member_id, p_reason);
$function$;

-- Staff disable and enable each other without changing membership status.
create or replace function private.staff_set_disabled(
  p_staff_id uuid,
  p_disabled boolean,
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
  v_before_disabled timestamptz;
  v_remaining bigint;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using errcode = '42501', message = 'An active staff administrator account is required.';
  end if;

  if p_staff_id is null or p_disabled is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'A staff ID, disabled flag, and a valid 1 to 500 character reason are required.';
  end if;

  if p_staff_id = v_actor_id then
    raise exception using errcode = '42501', message = 'Staff cannot disable their own account.';
  end if;

  perform 1 from private.administration_guard where singleton_id = true for update;

  select mp.staff_disabled_at
  into v_before_disabled
  from public.member_profiles as mp
  where mp.id = p_staff_id
    and mp.status = 'staff'
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Only a staff administrator account can be enabled or disabled.';
  end if;

  if p_disabled then
    select pg_catalog.count(*)
    into v_remaining
    from public.member_profiles as mp
    where mp.status = 'staff'
      and mp.staff_disabled_at is null
      and mp.id <> p_staff_id;

    if v_remaining = 0 then
      raise exception using
        errcode = '23514',
        message = 'At least one active staff administrator must remain active.';
    end if;
  end if;

  update public.member_profiles
  set staff_disabled_at = case
    when p_disabled then pg_catalog.clock_timestamp()
    else null
  end
  where id = p_staff_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    case when p_disabled then 'staff_disabled' else 'staff_enabled' end,
    'member_profile',
    p_staff_id,
    p_staff_id,
    pg_catalog.jsonb_build_object('disabled', v_before_disabled is not null),
    pg_catalog.jsonb_build_object('disabled', p_disabled),
    v_reason
  );
end;
$function$;

create or replace function public.staff_set_disabled(
  p_staff_id uuid,
  p_disabled boolean,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_set_disabled(p_staff_id, p_disabled, p_reason);
$function$;

-- Provisioning runs from the staff-admin edge function with the service role.
create or replace function private.provision_staff_profile(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_actor_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_full_name text := pg_catalog.btrim(p_full_name);
  v_username text := pg_catalog.btrim(p_username);
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if p_user_id is null or p_actor_id is null then
    raise exception using errcode = '22023', message = 'A user ID and provisioning actor are required.';
  end if;

  if v_full_name is null
     or pg_catalog.char_length(v_full_name) not between 1 and 120
     or v_full_name ~ '[[:cntrl:]]'
     or v_username is null
     or v_username !~ '^[A-Za-z0-9_]{3,30}$' then
    raise exception using
      errcode = '22023',
      message = 'A valid staff name and username are required.';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A role-change reason of 1 to 500 characters is required.';
  end if;

  if not exists (
    select 1
    from public.member_profiles as mp
    where mp.id = p_actor_id
      and mp.status = 'staff'
      and mp.staff_disabled_at is null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  perform 1
  from private.administration_guard
  where singleton_id = true
  for update;

  select mp.status
  into v_before_status
  from public.member_profiles as mp
  where mp.id = p_user_id
  for update;

  if not found or v_before_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only a pending membership request can be provisioned as a staff administrator.';
  end if;

  update public.member_profiles
  set full_name = v_full_name,
      username = v_username,
      profile_completed_at = pg_catalog.clock_timestamp(),
      status = 'staff',
      staff_disabled_at = null
  where id = p_user_id;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    p_actor_id,
    'staff_provisioned',
    'member_profile',
    p_user_id,
    p_user_id,
    pg_catalog.jsonb_build_object('status', v_before_status),
    pg_catalog.jsonb_build_object('status', 'staff'),
    v_reason
  );
exception when unique_violation then
  raise exception using
    errcode = '23505',
    message = 'That username is already in use.';
end;
$function$;

create or replace function public.provision_staff_profile(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_actor_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.provision_staff_profile(
    p_user_id, p_full_name, p_username, p_actor_id, p_reason
  );
$function$;

-- Member-facing role changes now stop at Executive; staff own the president role.
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
     or p_role not in ('member', 'executive') then
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
       or (select private.has_club_role('president'))
     ) then
    raise exception using errcode = '42501', message = 'Only an active Admin or President may change club roles.';
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

  v_target_has_primary_role := v_current_roles && array['admin', 'president']::text[];
  v_target_has_admin := 'admin' = any(v_current_roles);

  if (p_role in ('admin', 'president') or v_target_has_primary_role)
     and not (select private.has_club_role('admin')) then
    raise exception using errcode = '42501', message = 'Only a primary Admin may change Admin or President assignments.';
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
     or p_role not in ('executive') then
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

  if not (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('president'))
  ) then
    raise exception using errcode = '42501', message = 'Only Admin or President may grant or remove Executive status.';
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
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'Inactive accounts cannot perform privileged operations.';
  end if;

  if p_member_id is null or p_role is null
     or p_role not in ('executive') then
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

  if not (
    (select private.has_club_role('admin'))
    or (select private.has_club_role('president'))
  ) then
    raise exception using errcode = '42501', message = 'Only Admin or President may grant or remove Executive status.';
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

revoke all on function private.approve_member_core(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.reject_member_core(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.deactivate_member_core(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.reactivate_member_core(uuid, text, uuid) from public, anon, authenticated, service_role;

revoke all on function private.staff_approve_member(uuid, text) from public, anon, service_role;
revoke all on function private.staff_reject_member(uuid, text) from public, anon, service_role;
revoke all on function private.staff_deactivate_member(uuid, text) from public, anon, service_role;
revoke all on function private.staff_reactivate_member(uuid, text) from public, anon, service_role;
revoke all on function private.staff_appoint_president(uuid, text) from public, anon, service_role;
revoke all on function private.staff_revoke_president(uuid, text) from public, anon, service_role;
revoke all on function private.staff_set_disabled(uuid, boolean, text) from public, anon, service_role;

revoke all on function public.staff_approve_member(uuid, text) from public, anon, service_role;
revoke all on function public.staff_reject_member(uuid, text) from public, anon, service_role;
revoke all on function public.staff_deactivate_member(uuid, text) from public, anon, service_role;
revoke all on function public.staff_reactivate_member(uuid, text) from public, anon, service_role;
revoke all on function public.staff_appoint_president(uuid, text) from public, anon, service_role;
revoke all on function public.staff_revoke_president(uuid, text) from public, anon, service_role;
revoke all on function public.staff_set_disabled(uuid, boolean, text) from public, anon, service_role;

grant execute on function private.staff_approve_member(uuid, text) to authenticated;
grant execute on function private.staff_reject_member(uuid, text) to authenticated;
grant execute on function private.staff_deactivate_member(uuid, text) to authenticated;
grant execute on function private.staff_reactivate_member(uuid, text) to authenticated;
grant execute on function private.staff_appoint_president(uuid, text) to authenticated;
grant execute on function private.staff_revoke_president(uuid, text) to authenticated;
grant execute on function private.staff_set_disabled(uuid, boolean, text) to authenticated;

grant execute on function public.staff_approve_member(uuid, text) to authenticated;
grant execute on function public.staff_reject_member(uuid, text) to authenticated;
grant execute on function public.staff_deactivate_member(uuid, text) to authenticated;
grant execute on function public.staff_reactivate_member(uuid, text) to authenticated;
grant execute on function public.staff_appoint_president(uuid, text) to authenticated;
grant execute on function public.staff_revoke_president(uuid, text) to authenticated;
grant execute on function public.staff_set_disabled(uuid, boolean, text) to authenticated;

revoke all on function private.provision_staff_profile(uuid, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.provision_staff_profile(uuid, text, text, uuid, text) from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.provision_staff_profile(uuid, text, text, uuid, text) to service_role;
grant execute on function public.provision_staff_profile(uuid, text, text, uuid, text) to service_role;
