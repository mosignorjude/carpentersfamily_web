export const ATTENDANCE_TABS = ["session", "minutes", "history", "audit"];

/**
 * @param {string | null | undefined} value
 * @returns {"session" | "minutes" | "history" | "audit"}
 */
export function parseAttendanceTab(value) {
  if (typeof value !== "string") return "session";
  const normalized = value.trim().toLowerCase();
  return ATTENDANCE_TABS.includes(normalized)
    ? /** @type {"session" | "minutes" | "history" | "audit"} */ (normalized)
    : "session";
}

/**
 * @param {boolean} reducedMotion
 * @returns {"auto" | "smooth"}
 */
export function getScrollBehavior(reducedMotion) {
  return reducedMotion ? "auto" : "smooth";
}
