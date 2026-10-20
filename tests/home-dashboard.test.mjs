import assert from "node:assert/strict";
import test from "node:test";
import {
  announcementPreview,
  getHomeDashboardData,
} from "../src/lib/home-dashboard.mjs";

const memberId = "d5d0ea41-f8f1-4d12-b841-47c79cf4ac01";
const otherMemberId = "71883f4e-58a3-4a8e-8dca-15bb783db201";
const eventId = "bb3b5f20-25a0-44d7-998e-f74b7574e40f";
const tierId = "a7d38ca5-d0ef-42f7-b067-8bf64ad6c8ee";
const announcementId = "2167d77d-1cb4-4bd3-b40a-aec92f66af16";
const notificationId = "47e7ca15-f80d-4a67-a967-1a34d4506d15";
const now = new Date("2026-10-31T23:30:00.000Z");

function createSupabase({ tables = {}, rpcs = {} } = {}) {
  const calls = [];
  const rpcCalls = [];

  return {
    calls,
    rpcCalls,
    from(table) {
      const call = {
        table,
        selected: null,
        options: null,
        filters: [],
        orders: [],
        limit: null,
        range: null,
        single: false,
      };
      calls.push(call);
      const builder = {
        select(columns, options) {
          call.selected = columns;
          call.options = options ?? null;
          return builder;
        },
        eq(column, value) {
          call.filters.push({ method: "eq", column, value });
          return builder;
        },
        is(column, value) {
          call.filters.push({ method: "is", column, value });
          return builder;
        },
        gte(column, value) {
          call.filters.push({ method: "gte", column, value });
          return builder;
        },
        lt(column, value) {
          call.filters.push({ method: "lt", column, value });
          return builder;
        },
        order(column, options) {
          call.orders.push({ column, ...options });
          return builder;
        },
        limit(value) {
          call.limit = value;
          return builder;
        },
        range(start, end) {
          call.range = { start, end };
          return builder;
        },
        maybeSingle() {
          call.single = true;
          const result = tables[table] ?? { data: null, error: null };
          const data = Array.isArray(result.data)
            ? (result.data[0] ?? null)
            : result.data;
          return Promise.resolve({ ...result, data });
        },
        // Supabase query builders are thenable; mirror that interface in tests.
        // biome-ignore lint/suspicious/noThenProperty: This mock intentionally mirrors Supabase's thenable query builder.
        then(resolve, reject) {
          const result = tables[table] ?? { data: [], error: null };
          const count =
            result.count ??
            (Array.isArray(result.data) ? result.data.length : null);
          const data =
            Array.isArray(result.data) && call.range
              ? result.data.slice(call.range.start, call.range.end + 1)
              : result.data;
          const queryResult = call.options?.head
            ? { ...result, data: null, count }
            : { ...result, data, count };
          return Promise.resolve(queryResult).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      return Promise.resolve(rpcs[name] ?? { data: null, error: null });
    },
  };
}

function baseEvent(overrides = {}) {
  return {
    id: eventId,
    title: "November gathering",
    event_type: "meeting",
    starts_at: "2026-11-15T12:00:00+01:00",
    location: "Community hall",
    status: "scheduled",
    archived_at: null,
    budget_enabled: false,
    income_enabled: false,
    expenses_enabled: false,
    ticketing_enabled: false,
    ...overrides,
  };
}

test("dashboard dues stay scoped to the verified member and WAT calendar year", async () => {
  const supabase = createSupabase({
    tables: {
      dues_month_status: {
        data: [
          {
            member_id: memberId,
            covered_month: "2026-01-01",
            amount_ngn: "75000",
            status: "paid",
            due_date: "2026-01-31",
            is_overdue: false,
            internal_note: "must not leave this mapper",
          },
          {
            member_id: memberId,
            covered_month: "2026-11-01",
            amount_ngn: 75000,
            status: "unpaid",
            due_date: "2026-11-30",
            is_overdue: false,
          },
        ],
        error: null,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  const duesQuery = supabase.calls.find(
    (call) => call.table === "dues_month_status",
  );

  assert.equal(dashboard.currentMonth, "2026-11-01");
  assert.equal(dashboard.currentYear, "2026");
  assert.deepEqual(dashboard.dues.rows, [
    {
      coveredMonth: "2026-01-01",
      amountNgn: 75000,
      status: "paid",
      dueDate: "2026-01-31",
      isOverdue: false,
    },
    {
      coveredMonth: "2026-11-01",
      amountNgn: 75000,
      status: "unpaid",
      dueDate: "2026-11-30",
      isOverdue: false,
    },
  ]);
  assert.equal(
    duesQuery.selected,
    "member_id,covered_month,amount_ngn,status,due_date,is_overdue",
  );
  assert.deepEqual(duesQuery.filters, [
    { method: "eq", column: "member_id", value: memberId },
    { method: "gte", column: "covered_month", value: "2026-01-01" },
    { method: "lt", column: "covered_month", value: "2027-01-01" },
  ]);
});

test("event overview uses existing budget, finance, and ticket-tier records", async () => {
  const supabase = createSupabase({
    tables: {
      events: {
        data: [
          baseEvent({
            budget_enabled: true,
            income_enabled: true,
            expenses_enabled: true,
            ticketing_enabled: true,
          }),
        ],
        error: null,
        count: 1,
      },
      event_budgets: {
        data: { event_id: eventId, total_ngn: "5000000" },
        error: null,
      },
      event_ticket_tiers: {
        data: [
          {
            id: tierId,
            event_id: eventId,
            name: "General",
            capacity: 100,
            retired_at: null,
          },
        ],
        error: null,
      },
    },
    rpcs: {
      event_finance_summary: {
        data: [
          {
            income_ngn: "80000",
            expense_ngn: "20000",
            ticket_income_ngn: "150000",
            tickets_sold: 30,
            net_result_ngn: "210000",
          },
        ],
        error: null,
      },
      event_ticket_tier_status: {
        data: [{ tier_id: tierId, sold_quantity: 30 }],
        error: null,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);

  assert.deepEqual(dashboard.eventOverview, {
    unavailable: false,
    event: {
      id: eventId,
      title: "November gathering",
      eventType: "meeting",
      startsAt: "2026-11-15T12:00:00+01:00",
      location: "Community hall",
      budgetEnabled: true,
      incomeEnabled: true,
      expensesEnabled: true,
      ticketingEnabled: true,
    },
    budgetNgn: 5000000,
    budgetUnavailable: false,
    financeUnavailable: false,
    ticketingUnavailable: false,
    capacity: 100,
    ticketsSold: 30,
    ticketIncomeNgn: 150000,
    eventIncomeNgn: 230000,
    expensesNgn: 20000,
    netResultNgn: 210000,
    tiers: [
      { id: tierId, name: "General", capacity: 100, sold: 30, retired: false },
    ],
  });
  assert.deepEqual(
    supabase.rpcCalls.map(({ name }) => name).sort(),
    [
      "club_finance_summary",
      "event_finance_summary",
      "event_ticket_tier_status",
    ].sort(),
  );
});

test("event capacity excludes retired ticket tiers", async () => {
  const retiredTierId = "ca3d98aa-75dd-4a67-9d63-1c8ad015a7ce";
  const supabase = createSupabase({
    tables: {
      events: { data: [baseEvent({ ticketing_enabled: true })], error: null },
      event_ticket_tiers: {
        data: [
          {
            id: tierId,
            event_id: eventId,
            name: "Current",
            capacity: 20,
            retired_at: null,
          },
          {
            id: retiredTierId,
            event_id: eventId,
            name: "Retired",
            capacity: 80,
            retired_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    },
    rpcs: {
      event_finance_summary: {
        data: [
          {
            income_ngn: 0,
            expense_ngn: 0,
            ticket_income_ngn: 0,
            tickets_sold: 15,
            net_result_ngn: 0,
          },
        ],
        error: null,
      },
      event_ticket_tier_status: {
        data: [
          { tier_id: tierId, sold_quantity: 5 },
          { tier_id: retiredTierId, sold_quantity: 10 },
        ],
        error: null,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  assert.equal(dashboard.eventOverview.capacity, 20);
  assert.equal(dashboard.eventOverview.ticketsSold, 5);
  assert.equal(dashboard.eventOverview.tiers.length, 2);
});

test("ticket sales and upcoming-event totals preserve returned counts", async () => {
  const supabase = createSupabase({
    tables: {
      events: { data: [], error: null, count: 7 },
      event_ticket_sales: {
        data: [{ quantity: 3 }, { quantity: 2 }],
        error: null,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);

  assert.deepEqual(dashboard.ticketSales, { unavailable: false, count: 5 });
  assert.deepEqual(dashboard.upcomingEventCount, {
    unavailable: false,
    count: 7,
  });
  const eventCountQuery = supabase.calls.find(
    (call) => call.table === "events" && call.options?.head,
  );
  assert.deepEqual(eventCountQuery.filters, [
    { method: "eq", column: "status", value: "scheduled" },
    { method: "is", column: "archived_at", value: null },
    { method: "gte", column: "starts_at", value: now.toISOString() },
  ]);
});

test("announcements are bounded and private notifications are recipient-scoped", async () => {
  const supabase = createSupabase({
    tables: {
      announcements: {
        data: [
          {
            id: announcementId,
            title: "A club update",
            message: "<img src=x onerror=alert(1)> Bring a plate to share.",
            created_at: "2026-10-25T14:00:00.000Z",
            editor_id: otherMemberId,
          },
        ],
        error: null,
      },
      notifications: {
        data: [
          {
            id: notificationId,
            category: "dues_reminder",
            title: "Dues are due",
            body: "Check your dues.",
            event_id: null,
            created_at: "2026-10-25T14:00:00.000Z",
            read_at: null,
          },
        ],
        count: 3,
        error: null,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  const announcementsQuery = supabase.calls.find(
    (call) => call.table === "announcements",
  );
  const notificationsQuery = supabase.calls.find(
    (call) => call.table === "notifications",
  );

  assert.deepEqual(dashboard.announcements.rows, [
    {
      id: announcementId,
      title: "A club update",
      message: "<img src=x onerror=alert(1)> Bring a plate to share.",
      createdAt: "2026-10-25T14:00:00.000Z",
    },
  ]);
  assert.equal(announcementsQuery.limit, 4);
  assert.deepEqual(notificationsQuery.filters, [
    { method: "eq", column: "recipient_id", value: memberId },
  ]);
  assert.equal(dashboard.activity.unreadCount, 3);
  assert.equal(dashboard.activity.rows[0].href, "/dues");
  assert.equal(announcementPreview(`${"A ".repeat(130)}club note`).length, 240);
});

test("malformed records, duplicate dues months, and returned foreign dues fail closed", async () => {
  const foreign = createSupabase({
    tables: {
      dues_month_status: {
        data: [
          {
            member_id: otherMemberId,
            covered_month: "2026-11-01",
            amount_ngn: 75000,
            status: "unpaid",
            due_date: "2026-11-30",
            is_overdue: false,
          },
        ],
        error: null,
      },
    },
  });
  const foreignDashboard = await getHomeDashboardData(foreign, memberId, now);
  assert.deepEqual(foreignDashboard.dues, { unavailable: true, rows: [] });

  const duplicate = createSupabase({
    tables: {
      dues_month_status: {
        data: [
          {
            member_id: memberId,
            covered_month: "2026-11-01",
            amount_ngn: 75000,
            status: "paid",
            due_date: "2026-11-30",
            is_overdue: false,
          },
          {
            member_id: memberId,
            covered_month: "2026-11-01",
            amount_ngn: 75000,
            status: "paid",
            due_date: "2026-11-30",
            is_overdue: false,
          },
        ],
        error: null,
      },
      events: { data: [baseEvent({ title: " bad" })], error: null },
    },
  });
  const duplicateDashboard = await getHomeDashboardData(
    duplicate,
    memberId,
    now,
  );
  assert.deepEqual(duplicateDashboard.dues, { unavailable: true, rows: [] });
  assert.deepEqual(duplicateDashboard.events, { unavailable: true, rows: [] });
});

test("query failures fail closed and invalid identities make no queries", async () => {
  const supabase = createSupabase({
    tables: {
      dues_month_status: { data: null, error: new Error("private db detail") },
      events: { data: null, error: new Error("private db detail") },
      announcements: { data: null, error: new Error("private db detail") },
      notifications: { data: null, error: new Error("private db detail") },
    },
  });

  const failed = await getHomeDashboardData(supabase, memberId, now);
  const beforeInvalidIdentity = supabase.calls.length;
  const invalid = await getHomeDashboardData(
    supabase,
    "member-id-from-url",
    now,
  );

  assert.deepEqual(failed.dues, { unavailable: true, rows: [] });
  assert.deepEqual(failed.events, { unavailable: true, rows: [] });
  assert.deepEqual(failed.announcements, { unavailable: true, rows: [] });
  assert.deepEqual(failed.activity.rows, []);
  assert.equal(invalid.dues.unavailable, true);
  assert.equal(invalid.events.unavailable, true);
  assert.equal(invalid.announcements.unavailable, true);
  assert.equal(supabase.calls.length, beforeInvalidIdentity);
});

test("invalid event rows never enter the dashboard", async () => {
  const supabase = createSupabase({
    tables: {
      events: {
        data: [
          baseEvent({
            starts_at: "2026-10-01T12:00:00+01:00",
          }),
        ],
        error: null,
      },
    },
  });
  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  assert.deepEqual(dashboard.events, { unavailable: true, rows: [] });
});

test("activity correctly reports unread count unavailable when notifications query fails", async () => {
  const supabase = createSupabase({
    tables: {
      notifications: {
        data: null,
        error: new Error("notification read failure"),
      },
    },
  });
  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  assert.equal(dashboard.activity.unreadCountUnavailable, true);
  assert.deepEqual(dashboard.activity.rows, []);
});

test("dues reports empty schedule when member has no scheduled dues months in the calendar year", async () => {
  const supabase = createSupabase({
    tables: {
      dues_month_status: { data: [], error: null },
    },
  });
  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  assert.equal(dashboard.dues.unavailable, false);
  assert.deepEqual(dashboard.dues.rows, []);
});
