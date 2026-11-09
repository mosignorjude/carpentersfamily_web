export const ATTENDANCE_TABS = [
  "session",
  "minutes",
  "history",
  "audit",
  "roster",
  "desk",
];

/**
 * @param {string | null | undefined} value
 * @returns {"session" | "minutes" | "history" | "audit" | "roster" | "desk"}
 */
export function parseAttendanceTab(value) {
  if (typeof value !== "string") return "session";
  const normalized = value.trim().toLowerCase();
  if (normalized === "desk") return "audit";
  return ATTENDANCE_TABS.includes(normalized)
    ? /** @type {"session" | "minutes" | "history" | "audit" | "roster" | "desk"} */ (
        normalized
      )
    : "session";
}

/**
 * @param {boolean} reducedMotion
 * @returns {"auto" | "smooth"}
 */
export function getScrollBehavior(reducedMotion) {
  return reducedMotion ? "auto" : "smooth";
}
