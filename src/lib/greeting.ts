export type TimeOfDayGreeting =
  | "Good Morning"
  | "Good Afternoon"
  | "Good Evening"
  | "Good Night";

/**
 * Returns a time-of-day greeting (Title Case) based on the specified timezone (defaults to Africa/Lagos).
 * - 05:00 - 11:59: Good Morning
 * - 12:00 - 16:59: Good Afternoon
 * - 17:00 - 21:59: Good Evening
 * - 22:00 - 04:59: Good Night
 */
export function getTimeOfDayGreeting(
  date: Date = new Date(),
  timeZone = "Africa/Lagos",
): TimeOfDayGreeting {
  const hourString = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  const hour = Number.parseInt(hourString, 10);

  if (hour >= 5 && hour < 12) {
    return "Good Morning";
  }
  if (hour >= 12 && hour < 17) {
    return "Good Afternoon";
  }
  if (hour >= 17 && hour < 22) {
    return "Good Evening";
  }
  return "Good Night";
}

/**
 * Formats a username for greetings by trimming leading '@' and capitalizing the first letter.
 * Falls back to memberName or "Member".
 */
export function formatGreetingUsername(
  username?: string | null,
  fallbackName?: string | null,
): string {
  const cleanUser = (username ?? "").replace(/^@+/u, "").trim();
  if (cleanUser.length > 0) {
    return cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1);
  }
  const cleanFallback = (fallbackName ?? "").trim();
  if (cleanFallback.length > 0) {
    return cleanFallback.charAt(0).toUpperCase() + cleanFallback.slice(1);
  }
  return "Member";
}
