/**
 * Dues Payment Request & Approval Governance Rules (Phase 4):
 * 1. Club administrators do NOT pay dues.
 * 2. Active members/officers (Executive, President, Member) can submit dues payment requests.
 * 3. Reviewers must be active club officers: Executive, Club Admin, or President.
 * 4. Self-review rule: no officer may review their own dues.
 * 5. Executive CAN approve regular members, other Executives, and the President.
 * 6. President CAN approve regular members and Executives.
 * 7. A President's dues are reviewed by an Executive or the Club Admin, never by a President.
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
 * Roles allowed to write another member's dues: record a payment, approve a
 * payment request, or reject a payment request.
 * @param {string[] | Set<string>} actorRoles
 * @returns {boolean}
 */
export function canManageDues(actorRoles) {
  const roles = new Set(actorRoles || []);
  return roles.has("executive") || roles.has("admin") || roles.has("president");
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

  if (!canManageDues(approverRoleSet)) {
    return {
      allowed: false,
      reason: "Only an Executive, Club Admin, or President may review dues.",
    };
  }

  // Officers cannot approve their own dues payments
  if (approverId && targetMemberId && approverId === targetMemberId) {
    return {
      allowed: false,
      reason: "Officers cannot approve their own dues payments.",
    };
  }

  // A President's dues need a reviewer who is not a President. The club
  // administrator can never hold both hats: one_admin_identity_per_member_uidx
  // forbids a live admin and president assignment on the same member.
  if (
    targetRoleSet.has("president") &&
    !approverRoleSet.has("executive") &&
    !approverRoleSet.has("admin")
  ) {
    return {
      allowed: false,
      reason:
        "President dues payments can only be approved by an Executive or Club Admin.",
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
