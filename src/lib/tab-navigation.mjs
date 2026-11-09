export const ATTENDANCE_TABS = [
  "session",
  "checkin",
  "minutes",
  "history",
  "audit",
  "roster",
  "desk",
];

/**
 * @param {string | null | undefined} value
 * @returns {"session" | "checkin" | "minutes" | "history" | "audit" | "roster" | "desk"}
 */
export function parseAttendanceTab(value) {
  if (typeof value !== "string") return "session";
  const normalized = value.trim().toLowerCase();
  if (normalized === "desk") return "audit";
  if (normalized === "checkin" || normalized === "check-in") return "session";
  return ATTENDANCE_TABS.includes(normalized)
    ? /** @type {"session" | "checkin" | "minutes" | "history" | "audit" | "roster" | "desk"} */ (
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
