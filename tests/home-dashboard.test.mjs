import assert from "node:assert/strict";
import test from "node:test";
import {
  announcementPreview,
  getHomeDashboardData,
} from "../src/lib/home-dashboard.mjs";

const memberId = "d5d0ea41-f8f1-4d12-b841-47c79cf4ac01";
const otherMemberId = "71883f4e-58a3-4a8e-8dca-15bb783db201";
const eventId = "bb3b5f20-25a0-44d7-998e-f74b7574e40f";
const announcementId = "2167d77d-1cb4-4bd3-b40a-aec92f66af16";
const now = new Date("2026-10-31T23:30:00.000Z");

function createSupabase(results = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      const call = {
        table,
        selected: null,
        filters: [],
        orders: [],
        limit: null,
      };
      calls.push(call);

      const builder = {
        select(columns) {
          call.selected = columns;
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
        order(column, options) {
          call.orders.push({ column, ...options });
          return builder;
        },
        limit(value) {
          call.limit = value;
          return builder;
        },
        then(resolve, reject) {
          const result = results[table] ?? { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

test("dues are filtered to the authenticated member and WAT current month", async () => {
  const supabase = createSupabase({
    dues_month_status: {
      data: [
        {
          member_id: memberId,
          covered_month: "2026-11-01",
          amount_ngn: "75000",
          status: "unpaid",
          due_date: "2026-11-30",
          is_overdue: false,
          internal_note: "must not leave this mapper",
        },
      ],
      error: null,
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  const duesQuery = supabase.calls.find(
    (call) => call.table === "dues_month_status",
  );

  assert.equal(dashboard.currentMonth, "2026-11-01");
  assert.deepEqual(dashboard.dues.rows, [
    {
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
    { method: "eq", column: "covered_month", value: "2026-11-01" },
  ]);
  assert.equal(duesQuery.limit, 1);
});

test("events are bounded to scheduled, unarchived dates and a minimal DTO", async () => {
  const supabase = createSupabase({
    events: {
      data: [
        {
          id: eventId,
          title: "November gathering",
          event_type: "meeting",
          starts_at: "2026-11-15T12:00:00+01:00",
          location: "Community hall",
          status: "scheduled",
          archived_at: null,
          budget_ngn: 999999,
        },
      ],
      error: null,
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  const eventsQuery = supabase.calls.find((call) => call.table === "events");

  assert.deepEqual(dashboard.events.rows, [
    {
      id: eventId,
      title: "November gathering",
      eventType: "meeting",
      startsAt: "2026-11-15T12:00:00+01:00",
      location: "Community hall",
    },
  ]);
  assert.deepEqual(eventsQuery.filters, [
    { method: "eq", column: "status", value: "scheduled" },
    { method: "is", column: "archived_at", value: null },
    { method: "gte", column: "starts_at", value: now.toISOString() },
  ]);
  assert.deepEqual(eventsQuery.orders, [
    { column: "starts_at", ascending: true },
    { column: "id", ascending: true },
  ]);
  assert.equal(eventsQuery.limit, 3);
});

test("only a bounded latest announcement preview is requested", async () => {
  const supabase = createSupabase({
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
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);
  const announcementsQuery = supabase.calls.find(
    (call) => call.table === "announcements",
  );

  assert.deepEqual(dashboard.announcements.rows, [
    {
      id: announcementId,
      title: "A club update",
      message: "<img src=x onerror=alert(1)> Bring a plate to share.",
      createdAt: "2026-10-25T14:00:00.000Z",
    },
  ]);
  assert.equal(announcementsQuery.selected, "id,title,message,created_at");
  assert.deepEqual(announcementsQuery.orders, [
    { column: "created_at", ascending: false },
    { column: "id", ascending: false },
  ]);
  assert.equal(announcementsQuery.limit, 3);
  assert.equal(
    announcementPreview(`${"A ".repeat(130)}club note`).length,
    240,
  );
});

test("data returned for another member or malformed financial rows fails closed", async () => {
  const supabase = createSupabase({
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
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);

  assert.deepEqual(dashboard.dues, { unavailable: true, rows: [] });
});

test("query errors and invalid identities do not return dashboard records", async () => {
  const supabase = createSupabase({
    dues_month_status: { data: null, error: new Error("private db detail") },
    events: { data: null, error: new Error("private db detail") },
    announcements: { data: null, error: new Error("private db detail") },
  });

  const failed = await getHomeDashboardData(supabase, memberId, now);
  const beforeInvalidIdentity = supabase.calls.length;
  const invalid = await getHomeDashboardData(supabase, "member-id-from-url", now);

  assert.deepEqual(failed.dues, { unavailable: true, rows: [] });
  assert.deepEqual(failed.events, { unavailable: true, rows: [] });
  assert.deepEqual(failed.announcements, { unavailable: true, rows: [] });
  assert.equal(invalid.dues.unavailable, true);
  assert.equal(invalid.events.unavailable, true);
  assert.equal(invalid.announcements.unavailable, true);
  assert.equal(supabase.calls.length, beforeInvalidIdentity);
});

test("cancelled, archived, and past event rows do not enter the dashboard", async () => {
  const supabase = createSupabase({
    events: {
      data: [
        {
          id: eventId,
          title: "Old gathering",
          event_type: "meeting",
          starts_at: "2026-10-01T12:00:00+01:00",
          location: "Community hall",
          status: "scheduled",
          archived_at: null,
        },
      ],
      error: null,
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);

  assert.deepEqual(dashboard.events, { unavailable: true, rows: [] });
});
