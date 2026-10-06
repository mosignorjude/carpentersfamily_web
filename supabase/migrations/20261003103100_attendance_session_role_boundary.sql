-- Keep session lifecycle authority distinct from Backup Admin's event review
-- and correction authority. The approved brief grants open/close to Admin and
-- Executives; Backup Admin remains a reviewer/corrector, not a session issuer.
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
      or (select private.has_club_role('executive'))
    ), false
  );
$function$;
