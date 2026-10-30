const LAGOS_TZ = "Africa/Lagos";

const knownActions = {
  member_approved: "Member approved",
  member_rejected: "Membership request rejected",
  member_deactivated: "Member deactivated",
  member_reactivated: "Member reactivated",
  club_role_granted: "Club role granted",
  club_role_revoked: "Club role revoked",
  staff_provisioned: "Staff account created",
  staff_disabled: "Staff account disabled",
  staff_enabled: "Staff account enabled",
  legacy_admin_converted_to_staff: "Legacy admin converted to staff",
  club_payment_settings_updated: "Club payment details updated",
  club_opening_balance_classified: "Opening balance classified",
};

export function formatStaffTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${day} · ${time}`;
}

export function humanizeAuditAction(action) {
  if (!action) return "Governance action";
  const known = knownActions[action];
  if (known) return known;
  const words = action.replaceAll("_", " ").replaceAll(".", " ").trim();
  if (!words) return "Governance action";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
