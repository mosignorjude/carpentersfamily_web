-- The President replaces the legacy Admin as the club's communications
-- administrator. Staff administrators are not club members and cannot publish.
create or replace function private.can_publish_communications(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select private.is_active_club_member())
    and (
      (select private.has_club_role('admin'))
      or (select private.has_club_role('president'))
      or (select private.has_club_role('executive'))
      or (
        p_event_id is not null
        and (select private.has_event_role(p_event_id, 'lead'))
      )
    );
$function$;

revoke all on function private.can_publish_communications(uuid)
  from public, anon, service_role;
grant execute on function private.can_publish_communications(uuid) to authenticated;
