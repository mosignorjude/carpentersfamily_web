/**
 * Dues Payment Request & Approval Governance Rules (Phase 4):
 * 1. Admins do NOT pay dues.
 * 2. Active members/officers (Executive, Backup Admin, Member) can submit dues payment requests.
 * 3. Approvers must be active club officers: Admin, Executive, or Backup Admin.
 * 4. Self-approval rule: Officers (Executive, Backup Admin) CANNOT approve their own dues.
 * 5. Admin can approve all users' dues (including Backup Admin).
 * 6. Executive CAN approve Backup Admin dues.
 * 7. Executive CAN approve regular members and other Executives.
 * 8. Backup Admin CAN approve regular members and Executives.
 * 9. Backup Admin CANNOT approve Backup Admin dues (only Admin and Executive can approve Backup Admin).
 * 10. Regular members cannot approve any dues.
 */

/**
 * Checks whether an actor is eligible to pay/submit statutory dues.
 * @param {string[] | Set<string>} actorRoles
 * @returns {boolean}
 */
export function canSubmitDues(actorRoles) {
  const roles = new Set(actorRoles || []);
  // Admins do not pay dues
  if (roles.has("admin")) return false;
  return true;
}

/**
 * Evaluates whether an officer can review (approve or reject) a specific member's dues payment request.
 * @param {Object} params
 * @param {string} [params.approverId]
 * @param {string[] | Set<string>} params.approverRoles
 * @param {string} [params.targetMemberId]
 * @param {string[] | Set<string>} params.targetRoles
 * @returns {{ allowed: boolean, reason: string | null }}
 */
export function canReviewDuesRequest({
  approverId,
  approverRoles,
  targetMemberId,
  targetRoles,
}) {
  const approverRoleSet = new Set(approverRoles || []);
  const targetRoleSet = new Set(targetRoles || []);

  const isApproverAdmin = approverRoleSet.has("admin");
  const isApproverBackupAdmin = approverRoleSet.has("backup_admin");
  const isApproverExecutive = approverRoleSet.has("executive");

  // Must be an active officer
  if (!isApproverAdmin && !isApproverBackupAdmin && !isApproverExecutive) {
    return {
      allowed: false,
      reason: "Only an Executive, Admin, or Backup Admin may review dues.",
    };
  }

  // Admins do not pay dues
  if (targetRoleSet.has("admin")) {
    return {
      allowed: false,
      reason: "Admins are exempt from paying dues.",
    };
  }

  // Officers cannot approve their own dues payments
  if (approverId && targetMemberId && approverId === targetMemberId) {
    return {
      allowed: false,
      reason: "Officers cannot approve their own dues payments.",
    };
  }

  // Backup Admin dues payments can only be approved by an Admin or Executive
  if (targetRoleSet.has("backup_admin")) {
    if (!isApproverAdmin && !isApproverExecutive) {
      return {
        allowed: false,
        reason:
          "Backup Admin dues payments can only be approved by an Admin or Executive.",
      };
    }
  }

  return { allowed: true, reason: null };
}

/**
 * Formats covered months array for human-readable display.
 * @param {string[]} months
 * @returns {string}
 */
export function formatCoveredMonthsDisplay(months) {
  if (!months || months.length === 0) return "No months specified";
  const sorted = [...months].sort();
  const formatted = sorted.map((m) => {
    try {
      const date = new Date(`${m.slice(0, 7)}-01T00:00:00.000Z`);
      return new Intl.DateTimeFormat("en-NG", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    } catch {
      return m;
    }
  });

  if (formatted.length <= 3) return formatted.join(", ");
  return `${formatted[0]} – ${formatted[formatted.length - 1]} (${formatted.length} months)`;
}
