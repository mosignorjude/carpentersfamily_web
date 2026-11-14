-- Allow authenticated members reading event team assignments to select row id
-- alongside (event_id, member_id, role, assigned_at, revoked_at) while keeping
-- private metadata (assigned_by, grant_reason, revoked_by, revoke_reason) hidden.
grant select (id) on table public.event_role_assignments to authenticated;
