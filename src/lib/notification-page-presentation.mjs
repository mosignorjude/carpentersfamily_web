/** @type {Readonly<Record<string, string>>} */
const categoryLabels = Object.freeze({
  announcement: "Announcement",
  new_poll: "New poll",
  poll_closing: "Poll closing soon",
  attendance_open: "Attendance opening",
  event_activity: "Event update",
  dues_reminder: "Dues reminder",
  officer_money: "Finance alert",
  officer_member: "Member alert",
  officer_event: "Event alert",
});

const notificationDateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

/** @type {ReadonlyArray<readonly [string, string]>} */
export const routinePreferenceCategories = Object.freeze([
  Object.freeze(["announcement", "Announcements"]),
  Object.freeze(["new_poll", "New polls"]),
  Object.freeze(["poll_closing", "Polls closing soon"]),
  Object.freeze(["attendance_open", "Attendance opening"]),
  Object.freeze(["event_activity", "Event updates"]),
]);

/** @param {string} category */
export function getNotificationCategoryLabel(category) {
  return Object.hasOwn(categoryLabels, category)
    ? categoryLabels[category]
    : "Member update";
}

/** @param {string | null} readAt */
export function getNotificationReadLabel(readAt) {
  return readAt === null ? "Unread" : "Read";
}

/** @param {string} timestamp */
export function getNotificationTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return { label: "Date unavailable", dateTime: undefined };
  }

  return {
    label: notificationDateFormatter.format(date),
    dateTime: date.toISOString(),
  };
}
