-- Staff are a non-member population. They never satisfy the member gates; they
-- get their own predicate and five additive read policies.
alter table public.member_profiles
  drop constraint member_profiles_status_check;

alter table public.member_profiles
  add constraint member_profiles_status_check
  check (status in ('pending', 'active', 'deactivated', 'rejected', 'staff'));

alter table public.member_profiles
  add column staff_disabled_at timestamptz;

alter table public.member_profiles
  add constraint member_profiles_staff_disabled_check
  check (staff_disabled_at is null or status = 'staff');

create or replace function private.is_staff_administrator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (
      select mp.status = 'staff' and mp.staff_disabled_at is null
      from public.member_profiles as mp
      where mp.id = (select auth.uid())
    ),
    false
  );
$function$;

revoke all on function private.is_staff_administrator()
  from public, anon, authenticated, service_role;
grant execute on function private.is_staff_administrator() to authenticated;

create or replace function private.guard_last_active_staff_administrator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.status = 'staff'
     and old.staff_disabled_at is null
     and (new.status <> 'staff' or new.staff_disabled_at is not null) then
    -- Serialize with the role RPCs and the last-primary-admin check.
    perform 1
    from private.administration_guard
    where singleton_id = true
    for update;

    if not exists (
      select 1
      from public.member_profiles as mp
      where mp.status = 'staff'
        and mp.staff_disabled_at is null
        and mp.id <> old.id
    ) then
      raise exception using
        errcode = '23514',
        message = 'At least one active staff administrator must remain active.';
    end if;
  end if;

  return new;
end;
$function$;

create trigger member_profiles_preserve_last_active_staff
before update of status, staff_disabled_at on public.member_profiles
for each row execute function private.guard_last_active_staff_administrator();

create policy member_profiles_select_staff
  on public.member_profiles
  for select
  to authenticated
  using ((select private.is_staff_administrator()));

create policy member_role_assignments_select_staff
  on public.member_role_assignments
  for select
  to authenticated
  using ((select private.is_staff_administrator()));

create policy audit_log_select_staff
  on public.audit_log
  for select
  to authenticated
  using ((select private.is_staff_administrator()));

create policy club_payment_settings_select_staff
  on public.club_payment_settings
  for select
  to authenticated
  using ((select private.is_staff_administrator()));

create policy club_attendance_settings_select_staff
  on public.club_attendance_settings
  for select
  to authenticated
  using ((select private.is_staff_administrator()));
