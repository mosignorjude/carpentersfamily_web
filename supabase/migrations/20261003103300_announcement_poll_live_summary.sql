-- Step 10: bounded, batched live aggregate poll data for active members.
-- Voter identity and ballot rows remain behind the private schema boundary.

create or replace function private.get_announcement_poll_summary()
returns table (
  poll_id uuid,
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  has_voted boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  return query
    with latest_polls as (
      select p.id
      from public.announcement_polls as p
      order by p.created_at desc, p.id desc
      limit 50
    )
    select p.id, o.id, o.position, o.label,
      count(b.id)::bigint,
      exists (
        select 1 from private.poll_voter_eligibility as v
        where v.poll_id = p.id and v.member_id = v_actor
      )
    from latest_polls as latest
    join public.announcement_polls as p on p.id = latest.id
    join public.announcement_poll_options as o on o.poll_id = p.id
    left join private.poll_ballots as b
      on b.poll_id = o.poll_id and b.option_id = o.id
    group by p.id, o.id, o.position, o.label
    order by p.id, o.position;
end;
$function$;

create or replace function public.get_announcement_poll_summary()
returns table (
  poll_id uuid,
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  has_voted boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.get_announcement_poll_summary();
$function$;

revoke execute on function private.get_announcement_poll_summary()
  from public, anon, service_role;
grant execute on function private.get_announcement_poll_summary() to authenticated;
revoke execute on function public.get_announcement_poll_summary()
  from public, anon, service_role;
grant execute on function public.get_announcement_poll_summary() to authenticated;
