export function getAttendancePageAccess({ roles, eventRoles }) {
  const canControl = roles.has("admin") || roles.has("executive");
  const canReviewAttendance =
    canControl ||
    roles.has("backup_admin") ||
    eventRoles.has("lead") ||
    eventRoles.has("assistant");

  return {
    canControl,
    canWriteMinutes: canControl,
    canReviewAttendance,
    isOfficer: canControl || roles.has("backup_admin"),
  };
}
