-- Count plain-English NL-to-Spec custom report translations toward the officer daily AI quota.

create or replace function public.log_ai_custom_translation()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not (select public.is_club_officer()) then
    raise exception using
      errcode = '42501',
      message = 'Only club officers may record AI query translations.';
  end if;

  insert into public.audit_log (
    actor_id,
    action,
    entity_type,
    entity_id,
    reason
  ) values (
    v_actor_id,
    'ai_report_custom_translated',
    'ai_custom_translation',
    pg_catalog.gen_random_uuid(),
    'Officer translated natural-language custom report query.'
  );
end;
$function$;

revoke all on function public.log_ai_custom_translation()
  from public, anon, service_role;
grant execute on function public.log_ai_custom_translation()
  to authenticated;

create or replace function public.ai_generation_quota_ok(p_limit integer default 20)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_today_wat date := (pg_catalog.clock_timestamp() at time zone 'Africa/Lagos')::date;
  v_effective_limit integer := greatest(1, least(coalesce(p_limit, 20), 200));
  v_used_narratives integer;
  v_used_translations integer;
begin
  if v_actor_id is null or not (select public.is_club_officer()) then
    raise exception using
      errcode = '42501',
      message = 'Only club officers may generate AI report summaries.';
  end if;

  select pg_catalog.count(*)::integer
  into v_used_narratives
  from public.ai_report_narratives as arn
  where arn.created_by = v_actor_id
    and (arn.created_at at time zone 'Africa/Lagos')::date = v_today_wat;

  select pg_catalog.count(*)::integer
  into v_used_translations
  from public.audit_log as al
  where al.actor_id = v_actor_id
    and al.action = 'ai_report_custom_translated'
    and (al.occurred_at at time zone 'Africa/Lagos')::date = v_today_wat;

  return coalesce(v_used_narratives, 0) + coalesce(v_used_translations, 0) < v_effective_limit;
end;
$function$;
