-- Events occupy a whole number of days instead of a single instant.
-- duration_days counts the start day, so every existing row is a one-day event
-- and ends_at equals starts_at: the change is additive and reversible in data terms.
alter table public.events
  add column duration_days integer not null default 1;

comment on column public.events.duration_days is
  'Whole calendar days the event occupies, including its start day (1-30). Africa/Lagos wall clock.';

-- Separate statement: ends_at references duration_days, and a generated column may not
-- depend on a column introduced by the same ALTER command list.
alter table public.events
  add column ends_at timestamptz
    generated always as (
      timezone('Africa/Lagos', timezone('Africa/Lagos', starts_at) + ((duration_days - 1) * interval '1 day'))
    ) stored;

comment on column public.events.ends_at is
  'Instant the event stops being live: the same wall-clock time duration_days - 1 days later. Derived, never written.';

alter table public.events
  add constraint events_duration_days_range check (duration_days between 1 and 30);

-- Column-level SELECT grants on public.events are load-bearing: an ungranted column
-- silently empties whole dashboard reads. Precedent: 20261027140610_grant_event_timezone.sql.
grant select (duration_days, ends_at) on table public.events to authenticated;

notify pgrst, 'reload schema';
