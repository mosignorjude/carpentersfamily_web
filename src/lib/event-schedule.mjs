/**
 * @fileoverview Translates the event schedule form (separate date, 12-hour
 * clock and duration controls) to and from the instants stored on public.events.
 * Africa/Lagos is UTC+01:00 year-round, so the offset is a constant.
 */

export const MINUTE_STEPS = Array.from(
  { length: 12 },
  (_unused, index) => index * 5,
);
export const MAX_DURATION_DAYS = 30;

const WAT_OFFSET_MINUTES = 60;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {number} value
 */
function padTwo(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {{ eventDate?: unknown, startHour?: unknown, startMinute?: unknown, meridiem?: unknown }} parts
 * @returns {{ ok: true, startsAt: string } | { ok: false, field: string, message: string }}
 */
export function parseEventSchedule(parts) {
  const source = parts ?? {};
  const eventDate =
    typeof source.eventDate === "string" ? source.eventDate : "";
  const dateMatch = DATE_PATTERN.exec(eventDate);
  if (!dateMatch) {
    return {
      ok: false,
      field: "event_date",
      message: "Choose the day the event starts.",
    };
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    month > 12 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day
  ) {
    return {
      ok: false,
      field: "event_date",
      message: "That date does not exist.",
    };
  }

  const hour = Number(source.startHour);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
    return {
      ok: false,
      field: "start_hour",
      message: "Choose an hour between 1 and 12.",
    };
  }
  const minute = Number(source.startMinute);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return {
      ok: false,
      field: "start_minute",
      message: "Choose a minute between 00 and 59.",
    };
  }
  const meridiem = typeof source.meridiem === "string" ? source.meridiem : "";
  if (meridiem !== "AM" && meridiem !== "PM") {
    return { ok: false, field: "meridiem", message: "Choose AM or PM." };
  }

  const hour24 =
    meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  const wallClock = `${eventDate}T${padTwo(hour24)}:${padTwo(minute)}`;
  if (new Date(`${wallClock}:00Z`).toISOString().slice(0, 16) !== wallClock) {
    return {
      ok: false,
      field: "event_date",
      message: "That date does not exist.",
    };
  }
  return {
    ok: true,
    startsAt: new Date(`${wallClock}:00+01:00`).toISOString(),
  };
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseDurationDays(value) {
  const days =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;
  if (!Number.isInteger(days) || days < 1 || days > MAX_DURATION_DAYS)
    return null;
  return days;
}

/**
 * The minute control offers a five-minute grid, but a legacy event can sit on an
 * off-grid minute typed into the old datetime-local field. Keeping that minute
 * selectable is what stops an unrelated edit from silently moving the start.
 *
 * @param {unknown} selectedMinute
 * @param {readonly number[]} [steps]
 * @returns {{ value: string, label: string }[]}
 */
export function minuteSelectOptions(selectedMinute, steps = MINUTE_STEPS) {
  const options = steps.map((step) => {
    const value = padTwo(step);
    return { value, label: value };
  });
  const selected = typeof selectedMinute === "string" ? selectedMinute : "";
  if (
    /^\d{2}$/.test(selected) &&
    !options.some((option) => option.value === selected)
  ) {
    options.push({ value: selected, label: selected });
    options.sort((left, right) => Number(left.value) - Number(right.value));
  }
  return options;
}

/**
 * @param {unknown} iso
 * @returns {{ eventDate: string, startHour: string, startMinute: string, meridiem: "AM" | "PM" } | null}
 */
export function splitInstantForForm(iso) {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const lagos = new Date(instant.getTime() + WAT_OFFSET_MINUTES * 60 * 1000);
  const hour24 = lagos.getUTCHours();
  const meridiem = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    eventDate: lagos.toISOString().slice(0, 10),
    startHour: String(hour12),
    startMinute: padTwo(lagos.getUTCMinutes()),
    meridiem,
  };
}

const DAY_MS = 86_400_000;

/**
 * Reproduces public.events.ends_at, which Postgres computes as
 * starts_at + ((duration_days - 1) * interval '1 day'). Lagos has no DST, so a
 * fixed 24-hour step is exact.
 *
 * @param {unknown} startsAt
 * @param {unknown} durationDays
 * @returns {string} the instant, or an empty string when either input is unusable
 */
export function endsAtFromStart(startsAt, durationDays) {
  if (typeof startsAt !== "string" || startsAt.length === 0) return "";
  const milliseconds = new Date(startsAt).getTime();
  if (Number.isNaN(milliseconds)) return "";
  const days = parseDurationDays(durationDays);
  if (days === null) return "";
  return new Date(milliseconds + (days - 1) * DAY_MS).toISOString();
}
