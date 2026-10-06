-- Step 10: release aggregate poll results only after closure and a privacy threshold.
-- Ballots remain anonymous; exact counts are unavailable while a poll is open,
-- and closed polls with fewer than five votes never release exact counts.

drop function public.get_announcement_poll_results(uuid);
drop function private.get_announcement_poll_results(uuid);
drop function public.get_announcement_poll_summary();
drop function private.get_announcement_poll_summary();

create function private.get_announcement_poll_results(p_poll_id uuid)
returns table (
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  results_visible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_total_votes bigint;
begin
  if not (select private.is_active_club_member()) then
    raise exception using errcode = '42501', message = 'An active member account is required.';
  end if;

  select count(*)::bigint into v_total_votes
  from private.poll_ballots as b
  where b.poll_id = p_poll_id;

  if not exists (
    select 1 from public.announcement_polls as p where p.id = p_poll_id
  ) then
    raise exception using errcode = '42501', message = 'Poll is unavailable.';
  end if;

  if exists (
    select 1 from public.announcement_polls as p
    where p.id = p_poll_id and p.closes_at > pg_catalog.statement_timestamp()
  ) or v_total_votes < 5 then
    return;
  end if;

  return query
    select o.id, o.position, o.label, count(b.id)::bigint, true
    from public.announcement_poll_options as o
    left join private.poll_ballots as b
      on b.poll_id = o.poll_id and b.option_id = o.id
    where o.poll_id = p_poll_id
    group by o.id, o.position, o.label
    order by o.position;
end;
$function$;

create function public.get_announcement_poll_results(p_poll_id uuid)
returns table (
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  results_visible boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.get_announcement_poll_results(p_poll_id);
$function$;

create function private.get_announcement_poll_summary()
returns table (
  poll_id uuid,
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  has_voted boolean,
  results_visible boolean
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
      select p.id, p.closes_at
      from public.announcement_polls as p
      order by p.created_at desc, p.id desc
      limit 50
    ),
    vote_totals as (
      select b.poll_id, count(*)::bigint as total_votes
      from private.poll_ballots as b
      join latest_polls as latest on latest.id = b.poll_id
      group by b.poll_id
    ),
    option_totals as (
      select o.poll_id, o.id, o.position, o.label, count(b.id)::bigint as option_votes
      from public.announcement_poll_options as o
      join latest_polls as latest on latest.id = o.poll_id
      left join private.poll_ballots as b
        on b.poll_id = o.poll_id and b.option_id = o.id
      group by o.poll_id, o.id, o.position, o.label
    )
    select p.id,
      ot.id,
      ot.position,
      ot.label,
      case
        when p.closes_at <= pg_catalog.statement_timestamp()
          and coalesce(vt.total_votes, 0) >= 5
          then ot.option_votes
        else null::bigint
      end,
      exists (
        select 1 from private.poll_voter_eligibility as v
        where v.poll_id = p.id and v.member_id = v_actor
      ),
      (p.closes_at <= pg_catalog.statement_timestamp()
        and coalesce(vt.total_votes, 0) >= 5)
    from latest_polls as p
    join option_totals as ot on ot.poll_id = p.id
    left join vote_totals as vt on vt.poll_id = p.id
    order by p.id, ot.position;
end;
$function$;

create function public.get_announcement_poll_summary()
returns table (
  poll_id uuid,
  option_id uuid,
  option_position smallint,
  label text,
  votes bigint,
  has_voted boolean,
  results_visible boolean
)
language sql
security invoker
set search_path = ''
as $function$
  select * from private.get_announcement_poll_summary();
$function$;

revoke execute on function private.get_announcement_poll_results(uuid)
  from public, anon, service_role;
grant execute on function private.get_announcement_poll_results(uuid) to authenticated;
revoke execute on function public.get_announcement_poll_results(uuid)
  from public, anon, service_role;
grant execute on function public.get_announcement_poll_results(uuid) to authenticated;
revoke execute on function private.get_announcement_poll_summary()
  from public, anon, service_role;
grant execute on function private.get_announcement_poll_summary() to authenticated;
revoke execute on function public.get_announcement_poll_summary()
  from public, anon, service_role;
grant execute on function public.get_announcement_poll_summary() to authenticated;
