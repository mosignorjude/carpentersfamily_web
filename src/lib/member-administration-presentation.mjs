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
    !roleLookupFailed && (roleSet.has("admin") || roleSet.has("president"));

  return {
    canApprove:
      !roleLookupFailed && (canManageStatus || roleSet.has("executive")),
    canManageStatus,
    canManageExecutiveRole: canManageStatus,
  };
}

/** @typedef {"approve" | "deactivate" | "reactivate" | null} LifecycleOperation */

const profileStateLabels = {
  complete: "Complete",
  incomplete_email: "Email unconfirmed",
  incomplete_guarantor: "Incomplete",
  incomplete_bio: "Incomplete",
  verification_unknown: "Verification unavailable",
};

/** @param {string} profileState */
export function getMemberProfileStateLabel(profileState) {
  return Object.hasOwn(profileStateLabels, profileState)
    ? profileStateLabels[profileState]
    : "Status unavailable";
}

/**
 * Eligibility shown to officers and staff. The database independently refuses to
 * activate a member whose profile is unfinished or whose email is unconfirmed, so
 * this only decides what the roster says before anyone clicks Approve.
 *
 * @param {{profileComplete: boolean, emailConfirmed: boolean, lookupFailed?: boolean}} state
 * @returns {{profileState: "complete" | "incomplete_email" | "incomplete_guarantor" | "incomplete_bio" | "verification_unknown", profileStateDescription: string}}
 */
export function getMemberProfileReadiness({
  profileComplete,
  emailConfirmed,
  lookupFailed = false,
}) {
  if (lookupFailed) {
    return {
      profileState: "verification_unknown",
      profileStateDescription:
        "Email confirmation status is unavailable right now. Refresh before approving.",
    };
  }

  if (!profileComplete) {
    return {
      profileState: "incomplete_bio",
      profileStateDescription: "Profile incomplete.",
    };
  }

  if (!emailConfirmed) {
    return {
      profileState: "incomplete_email",
      profileStateDescription:
        "Email not yet confirmed. Approval unlocks once the applicant opens their confirmation link.",
    };
  }

  return {
    profileState: "complete",
    profileStateDescription: "Email verified and profile complete.",
  };
}

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
    rejected: "Rejected",
  };

  return Object.hasOwn(labels, status) ? labels[status] : "Status unavailable";
}
