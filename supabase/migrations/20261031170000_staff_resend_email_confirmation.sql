-- Staff-only resend of the email-confirmation link.
--
-- approve_member_core refuses an applicant whose email is unconfirmed, so when
-- the Auth confirmation email is lost the club is stuck. This records the staff
-- decision (audit_log) and returns the recipient details the app needs to mint
-- a single-use confirmation link through the Supabase Auth admin API. The
-- cooldown is measured from the audit row itself, so no new table is required
-- and every resend is already traceable.

create or replace function private.staff_resend_member_email_confirmation(
  p_member_id uuid,
  p_reason text
)
returns table (member_id uuid, email text, full_name text, username text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_reason text := pg_catalog.btrim(p_reason);
  v_status text;
  v_full_name text;
  v_username text;
  v_email text;
  v_confirmed_at timestamptz;
  v_last_sent timestamptz;
begin
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;

  if not (select private.is_staff_administrator()) then
    raise exception using
      errcode = '42501',
      message = 'An active staff administrator account is required.';
  end if;

  if p_member_id is null
     or v_reason is null
     or pg_catalog.char_length(v_reason) not between 1 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A member ID and a valid 1 to 500 character reason are required.';
  end if;

  select mp.status, mp.full_name, mp.username, au.email, au.email_confirmed_at
  into v_status, v_full_name, v_username, v_email, v_confirmed_at
  from public.member_profiles as mp
  join auth.users as au on au.id = mp.id
  where mp.id = p_member_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'That applicant account was not found.';
  end if;

  if v_confirmed_at is not null then
    raise exception using
      errcode = '23514',
      message = 'This applicant has already confirmed their email address.';
  end if;

  if v_status <> 'pending' then
    raise exception using
      errcode = '23514',
      message = 'Only a pending applicant can be sent a confirmation email.';
  end if;

  -- A rejected applicant who is later re-invited must be able to confirm again,
  -- so the window is measured per target, not per account status.
  select pg_catalog.max(al.occurred_at)
  into v_last_sent
  from public.audit_log as al
  where al.target_member_id = p_member_id
    and al.action = 'member_email_confirmation_resent';

  if v_last_sent is not null
     and v_last_sent > pg_catalog.now() - interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'A confirmation email was sent to this applicant less than 15 minutes ago. Try again later.';
  end if;

  insert into public.audit_log (
    actor_id, action, entity_type, entity_id, target_member_id,
    before_data, after_data, reason
  ) values (
    v_actor_id,
    'member_email_confirmation_resent',
    'member_profile',
    p_member_id,
    p_member_id,
    pg_catalog.jsonb_build_object('email_confirmed', false),
    pg_catalog.jsonb_build_object('confirmation_link_queued', true),
    v_reason
  );

  return query
  select p_member_id, v_email, v_full_name, v_username;
end;
$function$;

create or replace function public.staff_resend_member_email_confirmation(
  p_member_id uuid,
  p_reason text
)
returns table (member_id uuid, email text, full_name text, username text)
language sql
security invoker
set search_path = ''
as $function$
  select private.staff_resend_member_email_confirmation(p_member_id, p_reason);
$function$;

alter function public.staff_resend_member_email_confirmation(uuid, text) owner to postgres;

comment on function private.staff_resend_member_email_confirmation(uuid, text) is
  'Internal: gate a confirmation resend to staff administrators, record it, and return the recipient.';
comment on function public.staff_resend_member_email_confirmation(uuid, text) is
  'Record a staff resend of an applicant email-confirmation link and return the recipient details.';

revoke all on function private.staff_resend_member_email_confirmation(uuid, text)
  from public, anon, service_role;
revoke all on function public.staff_resend_member_email_confirmation(uuid, text)
  from public, anon, service_role;

-- The public wrapper is security invoker, so the caller must also be able to
-- execute the gated write it forwards to. PostgREST exposes only the public
-- schema, so this grant never makes the private function callable over REST.
grant execute on function private.staff_resend_member_email_confirmation(uuid, text) to authenticated;
grant execute on function public.staff_resend_member_email_confirmation(uuid, text) to authenticated;
