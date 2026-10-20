-- Step 18: batch mark all notifications read
create or replace function private.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_count integer;
begin
  if v_actor_id is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  perform pg_catalog.set_config('app.notification_read_write', 'on', true);
  update public.notifications
  set read_at = pg_catalog.clock_timestamp()
  where recipient_id = v_actor_id
    and read_at is null;
  get diagnostics v_count = row_count;
  perform pg_catalog.set_config('app.notification_read_write', 'off', true);
  return v_count;
end;
$function$;

create or replace function public.mark_all_notifications_read()
returns integer
language sql
security invoker
set search_path = ''
as $function$
  select private.mark_all_notifications_read();
$function$;

revoke all on function private.mark_all_notifications_read() from public, anon, authenticated, service_role;
grant execute on function private.mark_all_notifications_read() to authenticated;

revoke all on function public.mark_all_notifications_read() from public, anon, authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated;
