-- Track rejected applications distinctly from members who were later deactivated.
alter table public.member_profiles
  drop constraint member_profiles_status_check;

alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending', 'active', 'deactivated', 'rejected'));

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
  v_reason text := pg_catalog.btrim(p_reason);
  v_before_status text;
begin
  if v_actor_id is null then
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

  if not (select private.is_active_club_member())
     or not (
       (select private.has_club_role('executive'))
       or (select private.has_club_role('admin'))
       or (select private.has_club_role('backup_admin'))
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active Executive, Admin, or Backup Admin may reject membership requests.';
  end if;

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
    v_actor_id,
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

create or replace function public.reject_member(
  p_member_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.reject_member(p_member_id, p_reason);
$function$;

revoke all on function private.reject_member(uuid, text) from public, anon, service_role;
revoke all on function public.reject_member(uuid, text) from public, anon, service_role;

grant usage on schema private to authenticated;
grant execute on function private.reject_member(uuid, text) to authenticated;
grant execute on function public.reject_member(uuid, text) to authenticated;
