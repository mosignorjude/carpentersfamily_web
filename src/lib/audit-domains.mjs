export const AUDIT_DOMAINS = [
  { id: "all", label: "All" },
  {
    id: "membership",
    label: "Member lifecycle",
    test: (action) => action.startsWith("member_"),
  },
  {
    id: "roles",
    label: "Role and president changes",
    test: (action) => action.startsWith("club_role_"),
  },
  {
    id: "staff",
    label: "Staff accounts",
    test: (action) =>
      action.startsWith("staff_") ||
      action === "legacy_admin_converted_to_staff",
  },
  {
    id: "settings",
    label: "Club settings and finance",
    test: (action) =>
      action.startsWith("club_payment_settings_") ||
      action.startsWith("club_attendance_settings_") ||
      action.startsWith("finance_") ||
      action.startsWith("opening_balance_"),
  },
];

export function matchesAuditDomain(action, domainId) {
  const domain = AUDIT_DOMAINS.find((entry) => entry.id === domainId);
  return !domain?.test || domain.test(action);
}
