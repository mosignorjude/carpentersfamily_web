const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EVENT_LIMIT = 3;
const ANNOUNCEMENT_LIMIT = 3;

function validText(value, maximumLength) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !hasUnsupportedControlCharacter(value)
  );
}

function hasUnsupportedControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 8) ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        codePoint === 127)
    ) {
      return true;
    }
  }

  return false;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function currentMonthInWAT(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit",
    timeZone: "Africa/Lagos",
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}-01` : null;
}

function makeSection(result, mapRow) {
  if (!result || result.error || !Array.isArray(result.data)) {
    return { unavailable: true, rows: [] };
  }

  const rows = result.data.map(mapRow);
  if (rows.some((row) => row === null)) {
    return { unavailable: true, rows: [] };
  }

  return { unavailable: false, rows };
}

async function settleSection(query, mapRow) {
  try {
    return makeSection(await query, mapRow);
  } catch {
    return { unavailable: true, rows: [] };
  }
}

function mapDuesRow(row, memberId, currentMonth) {
  const amount = Number(row?.amount_ngn);
  if (
    !row ||
    typeof row.member_id !== "string" ||
    row.member_id.toLowerCase() !== memberId.toLowerCase() ||
    row.covered_month !== currentMonth ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    !["paid", "unpaid", "written_off"].includes(row.status) ||
    !validDateOnly(row.due_date) ||
    typeof row.is_overdue !== "boolean"
  ) {
    return null;
  }

  return {
    amountNgn: amount,
    status: row.status,
    dueDate: row.due_date,
    isOverdue: row.is_overdue,
  };
}

function mapEventRow(row, nowTimestamp) {
  const startsAt = Date.parse(row?.starts_at);
  if (
    !row ||
    !UUID_PATTERN.test(row.id) ||
    !validText(row.title, 120) ||
    !["meeting", "party", "other"].includes(row.event_type) ||
    !validTimestamp(row.starts_at) ||
    startsAt < nowTimestamp ||
    !validText(row.location, 200) ||
    row.status !== "scheduled" ||
    row.archived_at !== null
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    startsAt: row.starts_at,
    location: row.location,
  };
}

function mapAnnouncementRow(row) {
  if (
    !row ||
    !UUID_PATTERN.test(row.id) ||
    !validText(row.title, 160) ||
    !validText(row.message, 10_000) ||
    !validTimestamp(row.created_at)
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
  };
}

/**
 * Server-only dashboard read using the caller-scoped Supabase client.
 * RLS remains authoritative; the dues identity predicate is an additional
 * boundary and must be the verified auth user's ID, never a request parameter.
 */
export async function getHomeDashboardData(
  supabase,
  memberId,
  now = new Date(),
) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowTimestamp = nowDate.getTime();
  const currentMonth = Number.isFinite(nowTimestamp)
    ? currentMonthInWAT(nowDate)
    : null;

  if (
    typeof memberId !== "string" ||
    !UUID_PATTERN.test(memberId) ||
    !currentMonth ||
    !Number.isFinite(nowTimestamp)
  ) {
    return {
      currentMonth: null,
      dues: { unavailable: true, rows: [] },
      events: { unavailable: true, rows: [] },
      announcements: { unavailable: true, rows: [] },
    };
  }

  const nowIso = nowDate.toISOString();
  const duesQuery = supabase
    .from("dues_month_status")
    .select("member_id,covered_month,amount_ngn,status,due_date,is_overdue")
    .eq("member_id", memberId)
    .eq("covered_month", currentMonth)
    .limit(1);
  const eventsQuery = supabase
    .from("events")
    .select("id,title,event_type,starts_at,location,status,archived_at")
    .eq("status", "scheduled")
    .is("archived_at", null)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EVENT_LIMIT);
  const announcementsQuery = supabase
    .from("announcements")
    .select("id,title,message,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ANNOUNCEMENT_LIMIT);

  const [dues, eventResult, announcementResult] = await Promise.all([
    settleSection(duesQuery, (row) => mapDuesRow(row, memberId, currentMonth)),
    settleSection(eventsQuery, (row) => mapEventRow(row, nowTimestamp)),
    settleSection(announcementsQuery, mapAnnouncementRow),
  ]);

  if (dues.rows.length > 1) {
    dues.unavailable = true;
    dues.rows = [];
  }

  return {
    currentMonth,
    dues,
    events: eventResult,
    announcements: announcementResult,
  };
}

export function announcementPreview(message, maximumLength = 240) {
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength).trimEnd()}…`;
}
