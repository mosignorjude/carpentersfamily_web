-- The President is the club administrator, so attendance session control and
-- the club-wide late cutoff move with that role. The Admin role belongs to
-- non-member staff and can no longer satisfy an active club-member gate.
create or replace function private.can_control_attendance_sessions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('president'))
      or (select private.has_club_role('executive'))
    ), false
  );
$function$;

revoke all on function private.can_control_attendance_sessions()
  from public, anon, authenticated, service_role;
grant execute on function private.can_control_attendance_sessions() to authenticated;
