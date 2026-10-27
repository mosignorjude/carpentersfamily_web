begin;

select no_plan();

-- Notification server actions read event rows before queueing change and
-- cancellation emails. These assertions guard the column grants those reads
-- depend on.

select ok(
  has_column_privilege('authenticated', 'public.events', 'timezone', 'select'),
  'authenticated can read events.timezone for change and cancellation notifications'
);

select ok(
  has_column_privilege('authenticated', 'public.events', 'starts_at', 'select'),
  'authenticated can read events.starts_at for change notifications'
);

select * from finish();
rollback;
