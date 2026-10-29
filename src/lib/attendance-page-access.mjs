export function getAttendancePageAccess({ roles, eventRoles }) {
  const canControl =
    roles.has("admin") || roles.has("executive") || roles.has("president");
  const canReviewAttendance =
    canControl || eventRoles.has("lead") || eventRoles.has("assistant");

  return {
    canControl,
    canWriteMinutes: canControl,
    canReviewAttendance,
    isOfficer: canControl,
  };
}
