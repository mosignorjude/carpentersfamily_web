-- Notification server actions read the event timezone before queueing change
-- and cancellation emails. The original column grant block on public.events
-- predates the timezone column added with the reminder scheduler.

grant select (timezone) on public.events to authenticated;
