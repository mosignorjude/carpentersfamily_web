-- Enforce the self-role restriction for every authenticated role-change path,
-- including the older grant/revoke RPCs that remain available for integrations.
create or replace function private.prevent_self_club_role_assignment_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is not null
     and (
       (tg_op = 'INSERT' and new.member_id = v_actor_id)
       or (tg_op = 'UPDATE' and old.member_id = v_actor_id)
     ) then
    raise exception using
      errcode = '42501',
      message = 'Administrators cannot change their own club role.';
  end if;

  return new;
end;
$function$;

revoke all on function private.prevent_self_club_role_assignment_change()
  from public, anon, authenticated, service_role;

create trigger member_role_assignments_prevent_self_change
before insert or update on public.member_role_assignments
for each row
execute function private.prevent_self_club_role_assignment_change();
