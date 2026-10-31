-- Approval eligibility read path. approve_member_core refuses an applicant whose
-- email is not confirmed, but auth.users is not readable by the app roles, so the
-- officer and staff rosters cannot explain why Approve would fail. This exposes
-- exactly one fact — which members still have to confirm their email address.

create or replace function private.unconfirmed_member_email_ids()
returns table (member_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_staff_administrator())
     and not (
       (select private.is_active_club_member())
       and (
         (select private.has_club_role('executive'))
         or (select private.has_club_role('admin'))
         or (select private.has_club_role('president'))
       )
     ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club officer or a staff administrator may read email confirmation states.';
  end if;

  return query
  select mp.id
  from public.member_profiles as mp
  join auth.users as au on au.id = mp.id
  where au.email_confirmed_at is null
    and mp.status <> 'staff';
end;
$function$;

create or replace function public.unconfirmed_member_email_ids()
returns table (member_id uuid)
language sql
security invoker
set search_path = ''
as $function$
  select private.unconfirmed_member_email_ids();
$function$;

alter function public.unconfirmed_member_email_ids() owner to postgres;

comment on function private.unconfirmed_member_email_ids() is
  'Internal: member ids awaiting email confirmation, gated to club officers and staff administrators.';
comment on function public.unconfirmed_member_email_ids() is
  'Member ids awaiting email confirmation, for the approval eligibility columns of the officer and staff rosters.';

revoke all on function private.unconfirmed_member_email_ids()
  from public, anon, service_role;
revoke all on function public.unconfirmed_member_email_ids()
  from public, anon, service_role;

-- The public wrapper is security invoker, so the caller must also be able to
-- execute the gated read it forwards to. PostgREST exposes only the public
-- schema, so this grant never makes the private function callable over REST.
grant execute on function private.unconfirmed_member_email_ids() to authenticated;
grant execute on function public.unconfirmed_member_email_ids() to authenticated;
