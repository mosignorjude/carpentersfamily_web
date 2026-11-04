begin;

select no_plan();

-- Schema shape.
select has_column('public', 'events', 'duration_days', 'an event carries a whole-day duration');
select has_column('public', 'events', 'ends_at', 'an event carries the instant it stops being live');
select col_type_is('public', 'events', 'duration_days', 'integer', 'the day count is a number of days');
select col_not_null('public', 'events', 'duration_days', 'a missing day count is not allowed');
select col_has_check('public', 'events', 'duration_days', 'the day count is bounded by a database constraint');

select is(
  (select a.attgenerated from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.events'::regclass and a.attname = 'ends_at'),
  's',
  'ends_at is stored-generated, so no caller can drift it away from duration_days'
);

-- Who may read it. Members read both columns; anon reads neither, because anon
-- has no SELECT on events at all (20261003101500_events_roles_budgets_lifecycle.sql:179).
select is(
  has_column_privilege('authenticated', 'public.events', 'duration_days', 'SELECT'),
  true,
  'members may read the duration'
);
select is(
  has_column_privilege('authenticated', 'public.events', 'ends_at', 'SELECT'),
  true,
  'members may read the live-window upper bound'
);
select is(
  has_column_privilege('anon', 'public.events', 'ends_at', 'SELECT'),
  false,
  'anonymous requests may not read the live-window upper bound'
);

-- Existing rows became one-day events, which is what makes the change additive.
select is(
  (select count(*) from public.events
    where duration_days <> 1 or ends_at is distinct from starts_at),
  0::bigint,
  'every event that existed before this migration is a one-day event'
);

-- Behaviour through the create procedure, which still takes eleven arguments here.
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at
) values (
  '00000000-0000-0000-0000-000000000c01', 'authenticated', 'authenticated',
  'duration-admin@example.test', '', '{}'::jsonb,
  '{"full_name":"Duration Admin","username":"duration_admin"}'::jsonb, now()
);
update public.member_profiles set status = 'active'
  where id = '00000000-0000-0000-0000-000000000c01';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values (
  '00000000-0000-0000-0000-000000000c01', 'admin',
  '00000000-0000-0000-0000-000000000c01', 'Duration test Admin'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c01', true);

select set_config(
  'test.one_day_vigil_id',
  public.create_event(
    'One Day Vigil', 'other', '2026-11-12 18:00:00+01', 'Club Hall', null,
    false, true, false, false, false, false
  )::text,
  true
);

select is(
  (select duration_days from public.events
    where id = current_setting('test.one_day_vigil_id')::uuid),
  1,
  'an event created without a duration is one day long'
);
select is(
  (select ends_at = starts_at from public.events
    where id = current_setting('test.one_day_vigil_id')::uuid),
  true,
  'a one-day event ends at its own start instant'
);

select set_config(
  'test.convention_id',
  public.create_event(
    'Convention', 'party', '2026-11-12 18:00:00+01', 'Community Centre', null,
    false, false, true, true, true, true, 3
  )::text,
  true
);

select is(
  (select ends_at from public.events
    where id = current_setting('test.convention_id')::uuid),
  timestamptz '2026-11-14 18:00:00+01',
  'a three-day event ends at the same wall clock two days later'
);

select throws_ok(
  $$select public.create_event(
    'Too Long', 'other', '2026-11-20 18:00:00+01', 'Club Hall', null,
    false, true, false, false, false, false, 31
  )$$,
  '23514',
  'The event details or fixed feature selection is invalid.',
  'a duration beyond the maximum is refused by the procedure'
);

select throws_ok(
  $$select public.create_event(
    'Zero Days', 'other', '2026-11-20 18:00:00+01', 'Club Hall', null,
    false, true, false, false, false, false, 0
  )$$,
  '23514',
  'The event details or fixed feature selection is invalid.',
  'a duration below the minimum is refused by the procedure'
);

-- The row carries the count, and ends_at was generated from it by the database, not the caller.
select is(
  (select duration_days from public.events where title = 'Convention'),
  3,
  'the explicit duration reached the row'
);

select lives_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Extend the convention by one day', 4
  )$$,
  'an authorized editor may change the day count with a reason'
);
select is(
  (select ends_at from public.events where title = 'Convention'),
  timestamptz '2026-11-15 18:00:00+01',
  'the generated end instant follows the edited duration'
);
select is(
  (select after_data ->> 'duration_days' from public.audit_log
    where action = 'event_details_updated' and entity_id =
      (select id from public.events where title = 'Convention')
    order by occurred_at desc limit 1),
  '4',
  'the audit trail records the new day count'
);
select is(
  (select before_data ->> 'duration_days' from public.audit_log
    where action = 'event_details_updated' and entity_id =
      (select id from public.events where title = 'Convention')
    order by occurred_at desc limit 1),
  '3',
  'the audit trail records the day count it replaced'
);

-- An edit that changes only the day count must not be swallowed by the no-op return.
select lives_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Shorten the convention', 2
  )$$,
  'a duration-only edit is recognised as a real change'
);
select is(
  (select count(*) from public.audit_log
    where action = 'event_details_updated'
      and entity_id = (select id from public.events where title = 'Convention')),
  2::bigint,
  'a duration-only edit is audited'
);

select throws_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Missing the day count'
  )$$,
  '42883',
  'function public.update_event_details(uuid, unknown, unknown, unknown, unknown, unknown) does not exist',
  'an editor cannot omit the day count and silently reset the event to one day'
);

select * from finish();
rollback;
