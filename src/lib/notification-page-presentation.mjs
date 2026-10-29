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

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function sanitizeId(id) {
  return typeof id === "string" && SAFE_ID_PATTERN.test(id) ? id : null;
}

/**
 * Route target for a notification record with section deep-linking.
 * @param {{
 *   category?: string | null,
 *   event_id?: string | null,
 *   source_id?: string | null,
 *   title?: string | null,
 *   body?: string | null
 * }} notification
 * @returns {string}
 */
export function getNotificationHref(notification) {
  if (!notification || typeof notification !== "object") {
    return "/";
  }

  const validEventId = sanitizeId(notification.event_id);
  const validSourceId = sanitizeId(notification.source_id);
  const title =
    typeof notification.title === "string" ? notification.title : "";
  const body = typeof notification.body === "string" ? notification.body : "";
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();

  switch (notification.category) {
    case "announcement":
      return validSourceId
        ? `/announcements#announcement-${validSourceId}`
        : "/announcements";

    case "new_poll":
    case "poll_closing":
      return validSourceId ? `/polls#poll-${validSourceId}` : "/polls";

    case "event_activity":
    case "officer_event":
      return validEventId ? `/events#event-${validEventId}` : "/events";

    case "attendance_open":
      return validEventId
        ? `/attendance?event=${encodeURIComponent(validEventId)}&tab=session#attendance-session`
        : "/attendance";

    case "dues_reminder":
      if (
        titleLower.includes("approved") ||
        titleLower.includes("declined") ||
        titleLower.includes("request") ||
        bodyLower.includes("was approved") ||
        bodyLower.includes("was declined")
      ) {
        return "/dues#dues-requests";
      }
      if (
        titleLower.includes("recorded") ||
        titleLower.includes("updated") ||
        bodyLower.includes("was recorded") ||
        bodyLower.includes("was updated")
      ) {
        return "/dues#dues-payments";
      }
      if (titleLower.includes("rate") || bodyLower.includes("rate")) {
        return "/dues#dues-rates";
      }
      return "/dues#dues-schedule";

    case "officer_money":
      if (body.startsWith("Your dues")) {
        if (
          bodyLower.includes("was recorded") ||
          titleLower.includes("recorded")
        ) {
          return "/dues#dues-payments";
        }
        return "/dues#dues-requests";
      }
      if (
        titleLower.includes("rate") ||
        bodyLower.includes("monthly dues rate")
      ) {
        return "/dues#dues-rates";
      }
      if (
        titleLower.includes("dues payment request") ||
        titleLower.includes("dues request") ||
        bodyLower.includes("submitted a dues request") ||
        bodyLower.includes("dues payment request")
      ) {
        return "/dues#dues-approvals";
      }
      if (
        titleLower.includes("written off") ||
        bodyLower.includes("written off")
      ) {
        return "/dues#dues-audit";
      }
      if (
        bodyLower.includes("paid dues of") ||
        titleLower.includes("dues payment recorded") ||
        titleLower.includes("dues payment updated") ||
        bodyLower.includes("dues payment was updated")
      ) {
        return "/dues#dues-payments";
      }

      if (validEventId) {
        let tab = "overview";
        if (titleLower.includes("budget") || bodyLower.includes("budget")) {
          tab = "budget";
        } else if (
          titleLower.includes("expense") ||
          bodyLower.includes("expense")
        ) {
          tab = "expenses";
        } else if (
          titleLower.includes("revenue") ||
          titleLower.includes("income") ||
          bodyLower.includes("revenue") ||
          bodyLower.includes("income")
        ) {
          tab = "revenue";
        } else if (
          titleLower.includes("ticket") ||
          bodyLower.includes("ticket")
        ) {
          tab = "tickets";
        }
        return `/events/${validEventId}/dashboard?tab=${tab}#event-finance-${tab}`;
      }

      return "/finances#finance-ledger";

    case "officer_member":
      if (
        body.startsWith("Your ") &&
        !body.startsWith("Your role changed to Executive") &&
        !body.startsWith("Your role changed to Admin") &&
        !body.startsWith("Your role changed to President")
      ) {
        return "/";
      }
      if (
        titleLower.includes("request") ||
        bodyLower.includes("membership request") ||
        bodyLower.includes("applicant")
      ) {
        return "/officers/members#pending-requests";
      }
      return "/officers/members#member-roster";

    default:
      return "/announcements";
  }
}
