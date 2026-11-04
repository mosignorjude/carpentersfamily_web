export function formatSchedule(
  isoString: string,
  timezone = "Africa/Lagos",
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    const day = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      dateStyle: "medium",
    }).format(date);
    const timeZoneName = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;

    return `${day}, ${clockInZone(date, timezone)}${
      timeZoneName ? ` ${timeZoneName}` : ""
    }`;
  } catch {
    return isoString;
  }
}

/**
 * The club clock is "6:00 PM". en-NG's own 12-hour short time is "06:00 pm"
 * behind a U+202F, so the parts are reassembled instead of trusted. This does
 * not import src/lib/event-times.mjs: this module's test transpiles it
 * standalone into a data-URL import, where a relative specifier cannot resolve.
 */
function clockInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-NG", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour").replace(/^0/, "");
  const minute = read("minute").replace(/\D/g, "").slice(0, 2) || "00";
  const meridiem = read("dayPeriod")
    .replace(/[^APapMm]/g, "")
    .toUpperCase();
  return meridiem ? `${hour}:${minute} ${meridiem}` : `${hour}:${minute}`;
}
