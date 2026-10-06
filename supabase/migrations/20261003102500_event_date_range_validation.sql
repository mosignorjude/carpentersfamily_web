alter table public.events
  add constraint events_starts_at_range_check check (
    starts_at >= timestamptz '1900-01-01 00:00:00+00'
    and starts_at < timestamptz '2200-01-01 00:00:00+00'
  );
