/**
 * Presentation capabilities only. Server Actions and PostgreSQL independently
 * authorize every member lifecycle operation.
 *
 * @param {string[]} roles
 * @param {boolean} [roleLookupFailed]
 */
export function getMemberAdministrationCapabilities(
  roles = [],
  roleLookupFailed = false,
) {
  const roleSet = new Set(roleLookupFailed ? [] : roles);
  const canManageStatus =
    !roleLookupFailed && (roleSet.has("admin") || roleSet.has("backup_admin"));

  return {
    canApprove:
      !roleLookupFailed && (canManageStatus || roleSet.has("executive")),
    canManageStatus,
    canManageExecutiveRole: canManageStatus,
  };
}

/** @typedef {"approve" | "deactivate" | "reactivate" | null} LifecycleOperation */

/**
 * @param {string} status
 * @param {boolean} profileComplete
 * @param {{canApprove: boolean, canManageStatus: boolean}} capabilities
 * @param {boolean} [isSelf]
 * @returns {{operation: LifecycleOperation, profileCompletionRequired: boolean, selfDeactivationBlocked: boolean}}
 */
export function getMemberLifecyclePresentation(
  status,
  profileComplete,
  capabilities,
  isSelf = false,
) {
  if (status === "pending") {
    return {
      operation: capabilities.canApprove && profileComplete ? "approve" : null,
      profileCompletionRequired: capabilities.canApprove && !profileComplete,
      selfDeactivationBlocked: false,
    };
  }

  if (status === "active" && capabilities.canManageStatus) {
    return {
      operation: isSelf ? null : "deactivate",
      profileCompletionRequired: false,
      selfDeactivationBlocked: isSelf,
    };
  }

  if (status === "deactivated" && capabilities.canManageStatus) {
    return {
      operation: "reactivate",
      profileCompletionRequired: false,
      selfDeactivationBlocked: false,
    };
  }

  return {
    operation: null,
    profileCompletionRequired: false,
    selfDeactivationBlocked: false,
  };
}

/**
 * UI presentation only; the Server Action and PostgreSQL recheck permission.
 * @param {string} status
 * @param {boolean} isExecutive
 * @param {{canManageExecutiveRole: boolean}} capabilities
 * @param {boolean} [roleLookupFailed]
 * @returns {"grant" | "revoke" | null}
 */
export function getExecutiveRolePresentation(
  status,
  isExecutive,
  capabilities,
  roleLookupFailed = false,
) {
  if (
    status !== "active" ||
    !capabilities.canManageExecutiveRole ||
    roleLookupFailed
  ) {
    return null;
  }

  return isExecutive ? "revoke" : "grant";
}

/** @param {string} status */
export function getMemberStatusLabel(status) {
  const labels = {
    pending: "Pending",
    active: "Active",
    deactivated: "Deactivated",
  };

  return Object.hasOwn(labels, status) ? labels[status] : "Status unavailable";
}
