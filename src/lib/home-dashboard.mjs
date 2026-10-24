import { getNotificationHref } from "./notification-page-presentation.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const EVENT_LIMIT = 3;
const ANNOUNCEMENT_LIMIT = 4;
const PRIORITY_ANNOUNCEMENT_LIMIT = 25;
const PRIORITY_EVENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PRIORITY_UPDATE_LIMIT = 4;
const ACTIVITY_LIMIT = 5;
const TICKET_PAGE_SIZE = 1_000;
const MAX_TICKET_ROWS = 10_000;

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

function currentYearInWAT(now) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
  }).format(now);
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

function mapDuesRow(row, memberId, currentYear) {
  const amount = Number(row?.amount_ngn);
  if (
    !row ||
    typeof row.member_id !== "string" ||
    row.member_id.toLowerCase() !== memberId.toLowerCase() ||
    !validDateOnly(row.covered_month) ||
    !row.covered_month.endsWith("-01") ||
    row.covered_month.slice(0, 4) !== currentYear ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    !["paid", "unpaid", "written_off"].includes(row.status) ||
    !validDateOnly(row.due_date) ||
    typeof row.is_overdue !== "boolean"
  ) {
    return null;
  }

  return {
    coveredMonth: row.covered_month,
    amountNgn: amount,
    status: row.status,
    dueDate: row.due_date,
    isOverdue: row.is_overdue,
  };
}

async function getMemberDuesReceipts(supabase, memberId, currentYear) {
  const result = await safeQuery(
    supabase
      .from("dues_month_dispositions")
      .select("member_id,covered_month,disposition,payment_id")
      .eq("member_id", memberId)
      .is("is_current", true)
      .gte("covered_month", `${currentYear}-01-01`)
      .lt("covered_month", `${Number(currentYear) + 1}-01-01`),
  );

  if (result.error || !Array.isArray(result.data)) {
    return { unavailable: true, byMonth: new Map() };
  }

  const paymentByMonth = new Map();
  for (const row of result.data) {
    if (
      typeof row?.member_id === "string" &&
      row.member_id.toLowerCase() === memberId.toLowerCase() &&
      validDateOnly(row.covered_month) &&
      row.covered_month.endsWith("-01") &&
      row.covered_month.startsWith(`${currentYear}-`) &&
      row.disposition === "paid" &&
      typeof row.payment_id === "string" &&
      UUID_PATTERN.test(row.payment_id)
    ) {
      paymentByMonth.set(row.covered_month, row.payment_id);
    }
  }

  const paymentIds = [...new Set(paymentByMonth.values())];
  if (paymentIds.length === 0) {
    return { unavailable: false, byMonth: new Map() };
  }

  const paymentResult = await safeQuery(
    supabase
      .from("dues_payments")
      .select("id,member_id,amount_ngn,payment_date,recorded_at,corrected_at")
      .eq("member_id", memberId)
      .in("id", paymentIds),
  );
  if (paymentResult.error || !Array.isArray(paymentResult.data)) {
    return { unavailable: true, byMonth: new Map() };
  }

  const payments = new Map();
  for (const row of paymentResult.data) {
    const amount = Number(row?.amount_ngn);
    if (
      !row ||
      typeof row.id !== "string" ||
      !paymentIds.includes(row.id) ||
      typeof row.member_id !== "string" ||
      row.member_id.toLowerCase() !== memberId.toLowerCase() ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      !validDateOnly(row.payment_date) ||
      !validTimestamp(row.recorded_at) ||
      (row.corrected_at !== null && !validTimestamp(row.corrected_at))
    ) {
      continue;
    }

    payments.set(row.id, {
      paymentId: row.id,
      amountNgn: amount,
      paymentDate: row.payment_date,
      recordedAt: row.recorded_at,
      correctedAt: row.corrected_at,
    });
  }

  const byMonth = new Map();
  for (const [month, paymentId] of paymentByMonth) {
    const payment = payments.get(paymentId);
    if (payment) byMonth.set(month, payment);
  }
  return { unavailable: false, byMonth };
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
    row.archived_at !== null ||
    typeof row.budget_enabled !== "boolean" ||
    typeof row.income_enabled !== "boolean" ||
    typeof row.expenses_enabled !== "boolean" ||
    typeof row.ticketing_enabled !== "boolean"
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    startsAt: row.starts_at,
    location: row.location,
    budgetEnabled: row.budget_enabled,
    incomeEnabled: row.income_enabled,
    expensesEnabled: row.expenses_enabled,
    ticketingEnabled: row.ticketing_enabled,
    ...(row.attendance_enabled === true ? { attendanceEnabled: true } : {}),
  };
}

async function getMemberEventAttendance(supabase, memberId, events) {
  const attendanceEvents = events.rows.filter(
    (event) => event.attendanceEnabled,
  );
  if (events.unavailable || attendanceEvents.length === 0) return events;

  const result = await safeQuery(
    supabase
      .from("event_attendance")
      .select("event_id,member_id,attendance_status")
      .eq("member_id", memberId)
      .in(
        "event_id",
        attendanceEvents.map((event) => event.id),
      ),
  );

  if (result.error || !Array.isArray(result.data)) {
    return {
      ...events,
      rows: events.rows.map((event) =>
        event.attendanceEnabled
          ? { ...event, attendanceStatus: "unavailable" }
          : event,
      ),
    };
  }

  const statuses = new Map(
    result.data
      .filter(
        (row) =>
          typeof row?.event_id === "string" &&
          UUID_PATTERN.test(row.event_id) &&
          attendanceEvents.some((event) => event.id === row.event_id) &&
          typeof row.member_id === "string" &&
          row.member_id.toLowerCase() === memberId.toLowerCase() &&
          ["present", "late", "absent", "rejected"].includes(
            row.attendance_status,
          ),
      )
      .map((row) => [row.event_id, row.attendance_status]),
  );

  return {
    ...events,
    rows: events.rows.map((event) =>
      event.attendanceEnabled
        ? {
            ...event,
            attendanceStatus: statuses.get(event.id) ?? null,
          }
        : event,
    ),
  };
}

function mapAnnouncementRow(row) {
  const hasPriority = row && Object.hasOwn(row, "priority");
  const hasExpiry = row && Object.hasOwn(row, "expires_at");
  const hasPriorityMetadata = hasPriority && hasExpiry;
  const priority = hasPriorityMetadata ? row.priority : "standard";
  const expiresAt = hasPriorityMetadata ? row.expires_at : null;
  if (
    !row ||
    hasPriority !== hasExpiry ||
    !UUID_PATTERN.test(row.id) ||
    !validText(row.title, 160) ||
    !validText(row.message, 10_000) ||
    !validTimestamp(row.created_at) ||
    !["standard", "important", "urgent"].includes(priority) ||
    (expiresAt !== null && !validTimestamp(expiresAt)) ||
    (priority === "standard" && expiresAt !== null) ||
    (priority === "urgent" && expiresAt === null)
  ) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    ...(hasPriorityMetadata ? { priority, expiresAt } : {}),
  };
}

function makePriorityUpdates(
  events,
  importantAnnouncements,
  urgentAnnouncements,
  nowTimestamp,
) {
  const announcements = [...urgentAnnouncements, ...importantAnnouncements]
    .filter(
      (announcement) =>
        announcement.expiresAt === null ||
        Date.parse(announcement.expiresAt) > nowTimestamp,
    )
    .map((announcement) => ({
      kind: "announcement",
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      priority: announcement.priority,
      createdAt: announcement.createdAt,
      expiresAt: announcement.expiresAt,
    }));
  const imminentEvents = events
    .filter((event) => {
      const startsAt = Date.parse(event.startsAt);
      return startsAt - nowTimestamp <= PRIORITY_EVENT_WINDOW_MS;
    })
    .map((event) => ({
      kind: "event",
      id: event.id,
      title: event.title,
      eventType: event.eventType,
      startsAt: event.startsAt,
      location: event.location,
      priority: "upcoming",
    }));
  const priorityOrder = { urgent: 0, important: 1, upcoming: 2 };

  return [...announcements, ...imminentEvents]
    .sort((left, right) => {
      const priorityDifference =
        priorityOrder[left.priority] - priorityOrder[right.priority];
      if (priorityDifference !== 0) return priorityDifference;
      if (left.priority === "urgent") {
        return Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
      }
      if (left.priority === "important") {
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      }
      return Date.parse(left.startsAt) - Date.parse(right.startsAt);
    })
    .slice(0, PRIORITY_UPDATE_LIMIT);
}

function mapNotificationRow(row) {
  if (
    !row ||
    !UUID_PATTERN.test(row.id) ||
    !validText(row.category, 40) ||
    !validText(row.title, 120) ||
    !validText(row.body, 300) ||
    !validTimestamp(row.created_at) ||
    (row.read_at !== null && !validTimestamp(row.read_at))
  ) {
    return null;
  }

  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
    href: getNotificationHref(row),
  };
}

function safeNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapClubFinanceSummary(result) {
  if (!result || result.error) return { unavailable: true };
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const duesIncomeNgn = safeNonNegativeInteger(row?.dues_income);
  const otherIncomeNgn = safeNonNegativeInteger(row?.other_income);
  const expensesNgn = safeNonNegativeInteger(row?.expenses);
  const balanceNgn = Number(row?.balance);
  const revenueNgn = duesIncomeNgn + otherIncomeNgn;
  if (
    !row ||
    duesIncomeNgn === null ||
    otherIncomeNgn === null ||
    expensesNgn === null ||
    !Number.isSafeInteger(balanceNgn) ||
    !Number.isSafeInteger(revenueNgn)
  ) {
    return { unavailable: true };
  }

  return {
    unavailable: false,
    duesIncomeNgn,
    otherIncomeNgn,
    revenueNgn,
    expensesNgn,
    balanceNgn,
  };
}

async function safeQuery(query) {
  try {
    const result = await query;
    return result ?? { data: null, error: true };
  } catch {
    return { data: null, error: true };
  }
}

async function countUpcomingEvents(supabase, nowIso) {
  const result = await safeQuery(
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .is("archived_at", null)
      .gte("starts_at", nowIso),
  );
  const count = safeNonNegativeInteger(result.count);
  return result.error || count === null
    ? { unavailable: true, count: null }
    : { unavailable: false, count };
}

async function countTicketsSold(supabase) {
  const firstResult = await safeQuery(
    supabase
      .from("event_ticket_sales")
      .select("quantity", { count: "exact" })
      .is("refunded_at", null)
      .order("id", { ascending: true })
      .range(0, TICKET_PAGE_SIZE - 1),
  );
  const rowCount = safeNonNegativeInteger(firstResult.count);
  if (
    firstResult.error ||
    !Array.isArray(firstResult.data) ||
    rowCount === null ||
    rowCount > MAX_TICKET_ROWS ||
    firstResult.data.length !== Math.min(rowCount, TICKET_PAGE_SIZE)
  ) {
    return { unavailable: true, count: null };
  }

  const pageCount = Math.ceil(rowCount / TICKET_PAGE_SIZE);
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, pageIndex) => {
      const start = (pageIndex + 1) * TICKET_PAGE_SIZE;
      const end = Math.min(start + TICKET_PAGE_SIZE, rowCount) - 1;
      return safeQuery(
        supabase
          .from("event_ticket_sales")
          .select("quantity")
          .is("refunded_at", null)
          .order("id", { ascending: true })
          .range(start, end),
      );
    }),
  );
  const pages = [firstResult, ...remainingPages];
  if (
    pages.some(
      (page, index) =>
        page.error ||
        !Array.isArray(page.data) ||
        page.data.length !==
          Math.min(TICKET_PAGE_SIZE, rowCount - index * TICKET_PAGE_SIZE),
    )
  ) {
    return { unavailable: true, count: null };
  }

  let total = 0;
  for (const row of pages.flatMap((page) => page.data)) {
    const quantity = safeNonNegativeInteger(row?.quantity);
    if (quantity === null || quantity < 1) {
      return { unavailable: true, count: null };
    }
    total += quantity;
    if (!Number.isSafeInteger(total)) {
      return { unavailable: true, count: null };
    }
  }
  return { unavailable: false, count: total };
}

function mapEventFinanceSummary(result) {
  if (!result || result.error) return null;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  const incomeNgn = safeNonNegativeInteger(row?.income_ngn);
  const expensesNgn = safeNonNegativeInteger(row?.expense_ngn);
  const ticketIncomeNgn = safeNonNegativeInteger(row?.ticket_income_ngn);
  const ticketsSold = safeNonNegativeInteger(row?.tickets_sold);
  const netResultNgn = Number(row?.net_result_ngn);
  if (
    !row ||
    incomeNgn === null ||
    expensesNgn === null ||
    ticketIncomeNgn === null ||
    ticketsSold === null ||
    !Number.isSafeInteger(netResultNgn)
  ) {
    return null;
  }

  return {
    incomeNgn,
    expensesNgn,
    ticketIncomeNgn,
    ticketsSold,
    netResultNgn,
  };
}

async function getEventOverview(supabase, event) {
  const overview = {
    unavailable: false,
    event,
    budgetNgn: null,
    budgetUnavailable: false,
    financeUnavailable: false,
    ticketingUnavailable: false,
    capacity: null,
    ticketsSold: null,
    ticketIncomeNgn: null,
    eventIncomeNgn: null,
    expensesNgn: null,
    netResultNgn: null,
    tiers: [],
  };
  if (!event) return overview;

  const budgetQuery = event.budgetEnabled
    ? safeQuery(
        supabase
          .from("event_budgets")
          .select("event_id,total_ngn")
          .eq("event_id", event.id)
          .maybeSingle(),
      )
    : Promise.resolve({ data: null, error: null });
  const financeQuery =
    event.incomeEnabled || event.expensesEnabled || event.ticketingEnabled
      ? safeQuery(
          supabase.rpc("event_finance_summary", { p_event_id: event.id }),
        )
      : Promise.resolve({ data: null, error: null });
  const tiersQuery = event.ticketingEnabled
    ? safeQuery(
        supabase
          .from("event_ticket_tiers")
          .select("id,event_id,name,capacity,retired_at")
          .eq("event_id", event.id)
          .order("created_at", { ascending: true })
          .limit(50),
      )
    : Promise.resolve({ data: [], error: null });
  const tierStatusQuery = event.ticketingEnabled
    ? safeQuery(
        supabase.rpc("event_ticket_tier_status", { p_event_id: event.id }),
      )
    : Promise.resolve({ data: [], error: null });

  const [budgetResult, financeResult, tierResult, tierStatusResult] =
    await Promise.all([budgetQuery, financeQuery, tiersQuery, tierStatusQuery]);
  if (event.budgetEnabled) {
    const budget = budgetResult.data?.total_ngn;
    const budgetNgn = safeNonNegativeInteger(budget);
    if (budgetResult.error || (budget !== null && budgetNgn === null)) {
      overview.budgetUnavailable = true;
    } else if (budget !== null && budget !== undefined) {
      overview.budgetNgn = budgetNgn;
    }
  }

  const finance = mapEventFinanceSummary(financeResult);
  if (financeResult.error || (!finance && financeResult.data !== null)) {
    overview.financeUnavailable = true;
  }
  if (finance) {
    if (event.incomeEnabled) {
      overview.eventIncomeNgn = finance.incomeNgn + finance.ticketIncomeNgn;
      if (!Number.isSafeInteger(overview.eventIncomeNgn)) {
        overview.eventIncomeNgn = null;
        overview.financeUnavailable = true;
      }
    }
    if (event.expensesEnabled) overview.expensesNgn = finance.expensesNgn;
    if (event.incomeEnabled && event.expensesEnabled) {
      overview.netResultNgn = finance.netResultNgn;
    }
    if (event.ticketingEnabled) {
      overview.ticketsSold = finance.ticketsSold;
      overview.ticketIncomeNgn = finance.ticketIncomeNgn;
    }
  } else if (
    event.incomeEnabled ||
    event.expensesEnabled ||
    event.ticketingEnabled
  ) {
    overview.financeUnavailable = true;
  }

  if (event.ticketingEnabled) {
    const tiers = tierResult.data;
    const statuses = tierStatusResult.data;
    if (
      tierResult.error ||
      tierStatusResult.error ||
      !Array.isArray(tiers) ||
      !Array.isArray(statuses)
    ) {
      overview.ticketingUnavailable = true;
    } else {
      const statusByTier = new Map();
      let invalidStatus = false;
      for (const status of statuses) {
        const sold = safeNonNegativeInteger(status?.sold_quantity);
        if (
          !UUID_PATTERN.test(status?.tier_id ?? "") ||
          sold === null ||
          statusByTier.has(status.tier_id)
        ) {
          invalidStatus = true;
          break;
        }
        statusByTier.set(status.tier_id, sold);
      }

      let capacity = 0;
      let activeTicketsSold = 0;
      const mappedTiers = [];
      for (const tier of tiers) {
        const tierCapacity = safeNonNegativeInteger(tier?.capacity);
        const sold = statusByTier.get(tier?.id);
        if (
          !UUID_PATTERN.test(tier?.id ?? "") ||
          tier?.event_id !== event.id ||
          !validText(tier?.name, 80) ||
          tierCapacity === null ||
          sold === undefined
        ) {
          invalidStatus = true;
          break;
        }
        const retired = tier.retired_at !== null;
        if (!retired) {
          capacity += tierCapacity;
          activeTicketsSold += sold;
          if (
            !Number.isSafeInteger(capacity) ||
            !Number.isSafeInteger(activeTicketsSold)
          ) {
            invalidStatus = true;
            break;
          }
        }
        mappedTiers.push({
          id: tier.id,
          name: tier.name,
          capacity: tierCapacity,
          sold,
          retired,
        });
      }
      if (invalidStatus || statusByTier.size !== mappedTiers.length) {
        overview.ticketingUnavailable = true;
      } else {
        overview.tiers = mappedTiers;
        overview.capacity = capacity;
        overview.ticketsSold = activeTicketsSold;
      }
    }
  }

  return overview;
}

function unavailableEventOverview() {
  return {
    unavailable: true,
    event: null,
    budgetNgn: null,
    budgetUnavailable: true,
    financeUnavailable: true,
    ticketingUnavailable: true,
    capacity: null,
    ticketsSold: null,
    ticketIncomeNgn: null,
    eventIncomeNgn: null,
    expensesNgn: null,
    netResultNgn: null,
    tiers: [],
  };
}

async function getMemberActivity(supabase, memberId) {
  const [result, unreadResult] = await Promise.all([
    safeQuery(
      supabase
        .from("notifications")
        .select(
          "id,category,title,body,event_id,source_type,source_id,created_at,read_at",
        )
        .eq("recipient_id", memberId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(ACTIVITY_LIMIT),
    ),
    safeQuery(
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", memberId)
        .is("read_at", null),
    ),
  ]);
  const section = makeSection(result, mapNotificationRow);
  const rawUnreadCount = unreadResult.error
    ? null
    : safeNonNegativeInteger(unreadResult.count);
  const unreadRowsCount = section.unavailable
    ? null
    : section.rows.filter((r) => r.readAt === null).length;
  const unreadCount = rawUnreadCount ?? unreadRowsCount;
  return {
    ...section,
    unreadCount,
    unreadCountUnavailable:
      Boolean(result.error) ||
      Boolean(unreadResult.error) ||
      unreadCount === null,
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
  const currentYear = Number.isFinite(nowTimestamp)
    ? currentYearInWAT(nowDate)
    : null;

  if (
    typeof memberId !== "string" ||
    !UUID_PATTERN.test(memberId) ||
    !currentMonth ||
    !currentYear ||
    !Number.isFinite(nowTimestamp)
  ) {
    return {
      currentMonth: null,
      currentYear: null,
      dues: { unavailable: true, rows: [] },
      events: { unavailable: true, rows: [] },
      upcomingEventCount: { unavailable: true, count: null },
      announcements: { unavailable: true, rows: [] },
      priorityUpdates: { unavailable: true, rows: [] },
      ticketSales: { unavailable: true, count: null },
      clubFinance: { unavailable: true },
      eventOverview: unavailableEventOverview(),
      activity: {
        unavailable: true,
        rows: [],
        unreadCount: null,
        unreadCountUnavailable: true,
      },
    };
  }

  const nowIso = nowDate.toISOString();
  const yearStart = `${currentYear}-01-01`;
  const nextYearStart = `${Number(currentYear) + 1}-01-01`;
  const duesQuery = supabase
    .from("dues_month_status")
    .select("member_id,covered_month,amount_ngn,status,due_date,is_overdue")
    .eq("member_id", memberId)
    .gte("covered_month", yearStart)
    .lt("covered_month", nextYearStart)
    .order("covered_month", { ascending: true });
  const eventsQuery = supabase
    .from("events")
    .select(
      "id,title,event_type,starts_at,location,status,archived_at,budget_enabled,income_enabled,expenses_enabled,ticketing_enabled,attendance_enabled",
    )
    .eq("status", "scheduled")
    .is("archived_at", null)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(EVENT_LIMIT);
  const announcementsQuery = supabase
    .from("announcements")
    .select("id,title,message,created_at,priority,expires_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ANNOUNCEMENT_LIMIT);
  const importantAnnouncementsQuery = supabase
    .from("announcements")
    .select("id,title,message,created_at,priority,expires_at")
    .eq("priority", "important")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PRIORITY_ANNOUNCEMENT_LIMIT);
  const urgentAnnouncementsQuery = supabase
    .from("announcements")
    .select("id,title,message,created_at,priority,expires_at")
    .eq("priority", "urgent")
    .gte("expires_at", nowIso)
    .order("expires_at", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(PRIORITY_ANNOUNCEMENT_LIMIT);

  const [
    dues,
    eventResult,
    announcementResult,
    importantAnnouncementResult,
    urgentAnnouncementResult,
    upcomingEventCount,
    ticketSales,
    clubFinanceResult,
    activity,
    duesReceipts,
  ] = await Promise.all([
    settleSection(duesQuery, (row) => mapDuesRow(row, memberId, currentYear)),
    settleSection(eventsQuery, (row) => mapEventRow(row, nowTimestamp)),
    settleSection(announcementsQuery, mapAnnouncementRow),
    settleSection(importantAnnouncementsQuery, mapAnnouncementRow),
    settleSection(urgentAnnouncementsQuery, mapAnnouncementRow),
    countUpcomingEvents(supabase, nowIso),
    countTicketsSold(supabase),
    safeQuery(supabase.rpc("club_finance_summary")),
    getMemberActivity(supabase, memberId),
    getMemberDuesReceipts(supabase, memberId, currentYear),
  ]);

  dues.rows = dues.rows.map((row) => {
    const receipt = duesReceipts.byMonth.get(row.coveredMonth);
    return row.status === "paid" && receipt ? { ...row, receipt } : row;
  });

  if (
    new Set(dues.rows.map((row) => row.coveredMonth)).size !== dues.rows.length
  ) {
    dues.unavailable = true;
    dues.rows = [];
  }

  const [events, eventOverview] = await Promise.all([
    getMemberEventAttendance(supabase, memberId, eventResult),
    eventResult.unavailable
      ? Promise.resolve(unavailableEventOverview())
      : getEventOverview(supabase, eventResult.rows[0] ?? null),
  ]);
  const priorityAnnouncementsUnavailable =
    importantAnnouncementResult.unavailable ||
    urgentAnnouncementResult.unavailable;
  const priorityUpdates = makePriorityUpdates(
    events.rows,
    importantAnnouncementResult.rows.filter(
      (announcement) => announcement.priority === "important",
    ),
    urgentAnnouncementResult.rows.filter(
      (announcement) => announcement.priority === "urgent",
    ),
    nowTimestamp,
  );

  return {
    currentMonth,
    currentYear,
    dues,
    events,
    upcomingEventCount,
    announcements: announcementResult,
    priorityUpdates: {
      unavailable: priorityAnnouncementsUnavailable,
      rows: priorityUpdates,
    },
    ticketSales,
    clubFinance: mapClubFinanceSummary(clubFinanceResult),
    eventOverview,
    activity,
  };
}

export function announcementPreview(message, maximumLength = 240) {
  const normalized = message.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maximumLength) return normalized;
  return `${normalized.slice(0, maximumLength).trimEnd()}…`;
}
