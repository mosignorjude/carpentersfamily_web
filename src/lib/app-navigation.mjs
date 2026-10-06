const clubOfficerRoles = new Set(["executive", "admin", "backup_admin"]);

/**
 * Build presentation links from roles that were read on the server.
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
    { href: "/dues", label: "Dues" },
    ...(canSeeOfficerAreas ? [{ href: "/finances", label: "Finances" }] : []),
    { href: "/announcements", label: "Announcements" },
    { href: "/notifications", label: "Notifications" },
    ...(canSeeOfficerAreas
      ? [{ href: "/admin/members", label: "Member administration" }]
      : []),
  ];
}

/**
 * Do not build a private shell for users whose membership is not active.
 * If the role query fails, keep only the standard member navigation.
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
