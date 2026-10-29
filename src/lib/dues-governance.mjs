/**
 * Dues Payment Request & Approval Governance Rules (Phase 4):
 * 1. System administrators do NOT pay dues.
 * 2. Active members/officers (Executive, President, Member) can submit dues payment requests.
 * 3. Approvers must be active club officers: Executive or President.
 * 4. Self-approval rule: Officers (Executive, President) CANNOT approve their own dues.
 * 5. Executive CAN approve regular members, other Executives, and the President.
 * 6. President CAN approve regular members and Executives.
 * 7. A President's dues can only be reviewed by an Executive.
 * 8. Regular members cannot approve any dues.
 */

/**
 * Checks whether an actor is eligible to pay/submit statutory dues.
 * @param {string[] | Set<string>} actorRoles
 * @returns {boolean}
 */
export function canSubmitDues(actorRoles) {
  const roles = new Set(actorRoles || []);
  // System administrators do not pay dues
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

  const isApproverPresident = approverRoleSet.has("president");
  const isApproverExecutive = approverRoleSet.has("executive");

  // Must be an active officer
  if (!isApproverPresident && !isApproverExecutive) {
    return {
      allowed: false,
      reason: "Only an Executive or President may review dues.",
    };
  }

  // Officers cannot approve their own dues payments
  if (approverId && targetMemberId && approverId === targetMemberId) {
    return {
      allowed: false,
      reason: "Officers cannot approve their own dues payments.",
    };
  }

  // A President's dues can only be reviewed by an Executive
  if (targetRoleSet.has("president") && !isApproverExecutive) {
    return {
      allowed: false,
      reason: "President dues payments can only be approved by an Executive.",
    };
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
