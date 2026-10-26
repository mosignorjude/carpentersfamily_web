-- The core hardening migration revoked public-schema usage and contact-table
-- reads from service_role. The notification outbox worker authenticates as
-- service_role: it invokes the SECURITY DEFINER notification RPCs and resolves
-- recipient contacts directly, so restore only that minimum access.
--
-- Direct outbox/reminder table access stays revoked; those rows are reachable
-- only through the RPCs.
grant usage on schema public to service_role;

grant select on table public.member_profiles to service_role;
grant select on table public.member_role_assignments to service_role;
