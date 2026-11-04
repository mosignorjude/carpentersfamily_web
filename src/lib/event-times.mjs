/**
 * @fileoverview The one place an event time is rendered or an event's live
 * window is decided. Every consumer imports these instead of building an
 * Intl.DateTimeFormat, so "6:00 PM WAT" cannot drift between pages.
 */

import { MAX_DURATION_DAYS } from "./event-schedule.mjs";

const LAGOS = "Africa/Lagos";
const DAY_MS = 86_400_000;

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: LAGOS,
});
const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  timeZone: LAGOS,
});
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: LAGOS,
});
const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: LAGOS,
});
const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: LAGOS,
});
const yearFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: LAGOS,
});

/**
 * "2026-11" for a Lagos calendar month. en-CA is used only because its output is
 * ISO-ordered and therefore safe to slice; the value never reaches the user.
 * @param {Date} instant
 */
function monthKey(instant) {
  return instant.toLocaleDateString("en-CA", { timeZone: LAGOS }).slice(0, 7);
}

/** en-GB prints "06" for the hour; the app has always shown the unpadded form. */
function unpadded(hour12) {
  return hour12.replace(/^0/, "");
}

function parse(iso) {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * ICU gives en-GB a lower-case "pm", so filtering letters would keep only the
 * "p". The first letter is the whole signal: AM or PM, or nothing at all.
 * @param {string} dayPeriod
 */
function meridiemFromDayPeriod(dayPeriod) {
  const first = (dayPeriod ?? "").trim().charAt(0).toLowerCase();
  if (first === "a") return "AM";
  if (first === "p") return "PM";
  return "";
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
export function formatEventTime(iso) {
  const instant = parse(iso);
  if (!instant) return "";
  const parts = timeFormatter.formatToParts(instant);
  const hour = unpadded(
    parts.find((part) => part.type === "hour")?.value ?? "",
  );
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod =
    parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const meridiem = meridiemFromDayPeriod(dayPeriod);
  return meridiem ? `${hour}:${minute} ${meridiem}` : `${hour}:${minute}`;
}

/**
 * Reads a bare "HH:MM"/"HH:MM:SS" clock, or any string a Date accepts.
 * Meeting minutes store the machine value "18:00:00"; this is the display half.
 * @param {unknown} clock
 * @returns {string}
 */
export function formatMeridiemFromClock(clock) {
  if (typeof clock !== "string" || clock.length === 0) return "";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(clock);
  if (match) {
    const hour24 = Number(match[1]);
    if (hour24 > 23) return "";
    const meridiem = hour24 < 12 ? "AM" : "PM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${match[2]} ${meridiem}`;
  }
  const instant = parse(clock);
  if (!instant) return "";
  const parts = timeFormatter.formatToParts(instant);
  const hour = unpadded(
    parts.find((part) => part.type === "hour")?.value ?? "",
  );
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const meridiem = meridiemFromDayPeriod(
    parts.find((part) => part.type === "dayPeriod")?.value ?? "",
  );
  return meridiem ? `${hour}:${minute} ${meridiem}` : "";
}

/**
 * @param {unknown} startsAt
 * @param {unknown} durationDays
 * @returns {string}
 */
export function formatEventDateSpan(startsAt, durationDays) {
  const instant = parse(startsAt);
  if (!instant) return "";
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 2)
    return longDateFormatter.format(instant);
  const last = new Date(instant.getTime() + (days - 1) * DAY_MS);
  // U+2013 with spaces either side, never a hyphen: the display tests pin it.
  const span = " – ";
  const head = `${weekdayFormatter.format(instant)}, ${dayFormatter.format(instant)}`;
  const tail = `${weekdayFormatter.format(last)}, ${dayFormatter.format(last)} ${monthFormatter.format(last)}`;
  if (monthKey(instant) === monthKey(last)) {
    // "Thursday, 12 – Saturday, 14 November 2026"
    return `${head}${span}${tail} ${yearFormatter.format(last)}`;
  }
  // "Friday, 30 October – Monday, 2 November 2026"
  return `${head} ${monthFormatter.format(instant)}${span}${tail} ${yearFormatter.format(last)}`;
}

/**
 * @param {unknown} durationDays
 * @returns {string}
 */
export function formatEventDurationLabel(durationDays) {
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 1) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * An event is live or upcoming from its start until the end of its last day.
 * ends_at is the generated column; when a query did not select it we degrade to
 * the old single-instant rule rather than invent a window.
 * @param {{ starts_at?: string | null, ends_at?: string | null }} event
 * @param {number} [now]
 */
export function isEventLiveOrUpcoming(event, now = Date.now()) {
  const upper = event?.ends_at ?? event?.starts_at;
  if (typeof upper !== "string") return false;
  const bound = parse(upper);
  if (!bound) return false;
  return bound.getTime() >= now;
}

/**
 * The earliest starts_at that can still be live: a max-length event that began
 * today and ends now. Callers filter on starts_at with this so Postgres can use
 * the index instead of computing ends_at per row.
 * @param {string} nowIso
 * @param {number} [maxDays]
 * @returns {string}
 */
export function eventLiveWindowLowerBound(nowIso, maxDays = MAX_DURATION_DAYS) {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return nowIso;
  return new Date(now.getTime() - (maxDays - 1) * DAY_MS).toISOString();
}
