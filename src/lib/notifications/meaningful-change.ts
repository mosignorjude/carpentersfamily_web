import { createHash } from "node:crypto";

export interface MeetingSchedule {
  meetingDate: string;
  startTime: string;
  endTime?: string | null;
  venue: string;
  agenda: string;
}

export interface EventSchedule {
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  location: string;
  title: string;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function instant(value: string | null | undefined): string {
  const cleaned = clean(value);
  if (!cleaned) return "";
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? cleaned : parsed.toISOString();
}

/**
 * The change summary is read by a member, so it shows "12 Nov 2026, 7:00 PM"
 * rather than an ISO instant. Reassembled from parts, not imported from
 * src/lib/event-times.mjs, because this module's test transpiles it standalone
 * into a data-URL import where a relative specifier cannot resolve.
 */
function scheduleLabel(
  value: string | null | undefined,
  timezone: string | null | undefined,
): string {
  const cleaned = clean(value);
  if (!cleaned) return "";
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return cleaned;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: clean(timezone) || "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(parsed);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const hour = read("hour").replace(/^0/, "");
    const minute = read("minute").replace(/\D/g, "").slice(0, 2) || "00";
    const meridiem = read("dayPeriod")
      .replace(/[^APapMm]/g, "")
      .toUpperCase();
    return `${read("day")} ${read("month")} ${read("year")}, ${hour}:${minute}${
      meridiem ? ` ${meridiem}` : ""
    }`;
  } catch {
    return cleaned;
  }
}

function fingerprint(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export function meetingScheduleFromInstant(
  startsAt: string,
  timeZone = "Africa/Lagos",
): Pick<MeetingSchedule, "meetingDate" | "startTime"> {
  const parsed = new Date(clean(startsAt));
  if (Number.isNaN(parsed.getTime())) {
    return {
      meetingDate: clean(startsAt).slice(0, 10),
      startTime: clean(startsAt).slice(11, 19),
    };
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return {
    meetingDate: `${part("year")}-${part("month")}-${part("day")}`,
    startTime: `${part("hour")}:${part("minute")}:${part("second")}`,
  };
}

export function createMeetingFingerprint(input: MeetingSchedule): string {
  return fingerprint([
    clean(input.meetingDate),
    clean(input.startTime),
    clean(input.endTime),
    clean(input.venue),
    clean(input.agenda),
  ]);
}

export function createEventFingerprint(input: EventSchedule): string {
  return fingerprint([
    instant(input.startsAt),
    instant(input.endsAt),
    clean(input.timezone),
    clean(input.location),
    clean(input.title),
  ]);
}

export function describeMeetingChanges(
  before: MeetingSchedule,
  after: MeetingSchedule,
): string {
  const changes: string[] = [];

  if (clean(before.meetingDate) !== clean(after.meetingDate)) {
    changes.push(
      `Date changed from ${clean(before.meetingDate)} to ${clean(after.meetingDate)}`,
    );
  }
  if (clean(before.startTime) !== clean(after.startTime)) {
    changes.push(
      `Start time changed from ${clean(before.startTime)} to ${clean(after.startTime)}`,
    );
  }
  if (clean(before.endTime) !== clean(after.endTime)) {
    changes.push(
      `End time changed from ${clean(before.endTime) || "not set"} to ${clean(after.endTime) || "not set"}`,
    );
  }
  if (clean(before.venue) !== clean(after.venue)) {
    changes.push(
      `Venue changed from ${clean(before.venue)} to ${clean(after.venue)}`,
    );
  }
  if (clean(before.agenda) !== clean(after.agenda)) {
    changes.push("Agenda updated");
  }

  return changes.join("; ");
}

export function describeEventChanges(
  before: EventSchedule,
  after: EventSchedule,
): string {
  const changes: string[] = [];

  if (instant(before.startsAt) !== instant(after.startsAt)) {
    changes.push(
      `Start changed from ${
        scheduleLabel(before.startsAt, before.timezone) || "not set"
      } to ${scheduleLabel(after.startsAt, after.timezone) || "not set"}`,
    );
  }
  if (instant(before.endsAt) !== instant(after.endsAt)) {
    changes.push(
      `End changed from ${
        scheduleLabel(before.endsAt, before.timezone) || "not set"
      } to ${scheduleLabel(after.endsAt, after.timezone) || "not set"}`,
    );
  }
  if (clean(before.timezone) !== clean(after.timezone)) {
    changes.push(
      `Timezone changed from ${clean(before.timezone)} to ${clean(after.timezone)}`,
    );
  }
  if (clean(before.location) !== clean(after.location)) {
    changes.push(
      `Location changed from ${clean(before.location)} to ${clean(after.location)}`,
    );
  }
  if (clean(before.title) !== clean(after.title)) {
    changes.push("Title updated");
  }

  return changes.join("; ");
}
