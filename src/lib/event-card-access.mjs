export function getEventCardAccess({
  roles,
  eventRoles,
  status,
  archivedAt,
  archivedGroup = false,
  budgetReadError = false,
}) {
  const isManager =
    roles.has("executive") || roles.has("admin") || roles.has("backup_admin");
  const canEdit =
    isManager || eventRoles.has("lead") || eventRoles.has("assistant");
  const canSetStatus = isManager || eventRoles.has("lead");
  const canSetBudget =
    isManager || eventRoles.has("lead") || eventRoles.has("assistant");
  const canReopen = roles.has("admin") || roles.has("backup_admin");
  const mutable = status === "scheduled" && !archivedAt && !archivedGroup;

  return {
    isManager,
    canEdit,
    canSetStatus,
    canSetBudget,
    canReopen,
    mutable,
    showBudgetEditor: canSetBudget && mutable && !budgetReadError,
  };
}
