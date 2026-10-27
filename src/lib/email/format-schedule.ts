export function formatSchedule(
  isoString: string,
  timezone = "Africa/Lagos",
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    const display = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
    const timeZoneName = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;

    return timeZoneName ? `${display} ${timeZoneName}` : display;
  } catch {
    return isoString;
  }
}
