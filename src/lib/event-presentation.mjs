/**
 * @fileoverview The one place that decides which list an event belongs to.
 * The events page and its tests both read these rules, so "upcoming" cannot
 * drift between the two.
 */

import { isEventLiveOrUpcoming } from "./event-times.mjs";

/**
 * @template {{ starts_at: string, ends_at?: string | null, status: string, archived_at: string | null }} T
 * @param {T[]} events
 * @param {number} [now]
 * @returns {{ upcoming: T[], recentPast: T[], retainedArchive: T[], scheduledUpcoming: T[] }}
 */
export function groupEventRows(events, now = Date.now()) {
  const rows = Array.isArray(events) ? events : [];
  const unarchived = (event) => !event.archived_at;

  const upcoming = rows
    .filter(
      (event) =>
        unarchived(event) &&
        event.status === "scheduled" &&
        isEventLiveOrUpcoming(event, now),
    )
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  const recentPast = rows
    .filter(
      (event) =>
        unarchived(event) &&
        (event.status !== "scheduled" || !isEventLiveOrUpcoming(event, now)),
    )
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

  const retainedArchive = rows
    .filter((event) => Boolean(event.archived_at))
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

  return { upcoming, recentPast, retainedArchive, scheduledUpcoming: upcoming };
}
