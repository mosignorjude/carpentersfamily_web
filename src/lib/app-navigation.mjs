const clubOfficerRoles = new Set(["executive", "admin", "president"]);

/**
 * Build navigation from roles read on the server. The shared finance ledger is available to active members; administrative areas remain role-specific.
 * These links do not grant access; routes and mutations enforce permissions.
 *
 * @param {readonly string[]} roles
 * @returns {{ href: string, label: string }[]}
 */
export function getNavigationItems(roles) {
  const canSeeOfficerAreas = roles.some((role) => clubOfficerRoles.has(role));

  return [
    { href: "/", label: "Home" },
    { href: "/events", label: "Events" },
    { href: "/attendance", label: "Minutes & attendance" },
    { href: "/dues", label: "Dues" },
    { href: "/finances", label: "Finances" },
    { href: "/announcements", label: "Announcements" },
    { href: "/polls", label: "Polls" },
    ...(canSeeOfficerAreas
      ? [{ href: "/admin/members", label: "Member administration" }]
      : []),
  ];
}

/**
 * Do not build a private shell for users whose membership is not active.
 * If the role query fails, keep member links and omit officer-only areas.
 *
 * @param {string | null | undefined} status
 * @param {readonly string[]} roles
 * @param {boolean} roleLookupFailed
 * @returns {{ href: string, label: string }[] | null}
 */
export function getActiveMemberNavigationItems(
  status,
  roles,
  roleLookupFailed = false,
) {
  if (status !== "active") return null;
  return getNavigationItems(roleLookupFailed ? [] : roles);
}
