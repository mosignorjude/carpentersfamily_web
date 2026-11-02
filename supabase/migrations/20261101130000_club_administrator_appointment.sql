-- Club Admin: a staff-appointed, dues-exempt money authority.
-- This migration adds one cardinality index, one grant/revoke RPC pair and a
-- display label. It changes no existing authorisation gate: every money, dues,
-- event and attendance check already calls private.has_club_role('admin'), and
-- that predicate already requires member_profiles.status = 'active', so an
-- active member holding a live admin assignment passes those gates unchanged.

-- At most one live Club Admin assignment may exist at a time. The index counts
-- rows, not member status: an unrevoked assignment belonging to a deactivated
-- member would occupy the slot, which is why the existing status trigger
-- (member_profiles_preserve_last_primary_admin) forces revoke-before-deactivate.
create unique index member_role_assignments_one_current_admin_uidx
  on public.member_role_assignments (role)
  where role = 'admin' and revoked_at is null;

comment on index public.member_role_assignments_one_current_admin_uidx is
  'At most one live Club Admin assignment exists; staff appoint and revoke it.';
