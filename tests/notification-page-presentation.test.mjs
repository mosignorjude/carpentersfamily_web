import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getNotificationCategoryLabel,
  getNotificationHref,
  getNotificationReadLabel,
  getNotificationTimestamp,
  routinePreferenceCategories,
} from "../src/lib/notification-page-presentation.mjs";

const page = readFileSync(
  new URL("../src/app/(member)/notifications/page.tsx", import.meta.url),
  "utf8",
);

test("routine preferences expose only the five approved muteable categories", () => {
  assert.deepEqual(
    routinePreferenceCategories.map(([category]) => category),
    [
      "announcement",
      "new_poll",
      "poll_closing",
      "attendance_open",
      "event_activity",
    ],
  );
  assert.equal(
    routinePreferenceCategories.some(([category]) =>
      [
        "dues_reminder",
        "officer_money",
        "officer_member",
        "officer_event",
      ].includes(category),
    ),
    false,
  );
});

test("notification categories use fixed labels and unknown values reveal no raw category", () => {
  assert.equal(getNotificationCategoryLabel("dues_reminder"), "Dues reminder");
  assert.equal(getNotificationCategoryLabel("officer_money"), "Finance alert");
  assert.equal(
    getNotificationCategoryLabel("unrecognized_private_category"),
    "Member update",
  );
  assert.equal(getNotificationCategoryLabel("toString"), "Member update");
  assert.equal(getNotificationCategoryLabel("__proto__"), "Member update");
});

test("read state is explicit and does not include member identity", () => {
  assert.equal(getNotificationReadLabel(null), "Unread");
  assert.equal(getNotificationReadLabel("2026-10-01T10:00:00.000Z"), "Read");
});

test("valid timestamps are localized to Lagos and malformed dates fail softly", () => {
  const timestamp = getNotificationTimestamp("2026-10-01T10:00:00.000Z");
  assert.match(timestamp.label, /2026/);
  assert.equal(timestamp.dateTime, "2026-10-01T10:00:00.000Z");

  assert.deepEqual(getNotificationTimestamp("not-a-date"), {
    label: "Date unavailable",
    dateTime: undefined,
  });
});

test("notification href routes accurately to domain areas and section anchors", () => {
  assert.equal(
    getNotificationHref({ category: "dues_reminder" }),
    "/dues#dues-schedule",
  );
  assert.equal(
    getNotificationHref({ category: "officer_money", event_id: "evt-123" }),
    "/events/evt-123/dashboard?tab=overview#event-finance-overview",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Event budget updated",
    }),
    "/events/evt-123/dashboard?tab=budget#event-finance-budget",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Event expense recorded",
    }),
    "/events/evt-123/dashboard?tab=expenses#event-finance-expenses",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Ticket sale recorded",
    }),
    "/events/evt-123/dashboard?tab=tickets#event-finance-tickets",
  );
  assert.equal(
    getNotificationHref({ category: "officer_money", event_id: null }),
    "/finances#finance-ledger",
  );
  assert.equal(
    getNotificationHref({ category: "officer_member" }),
    "/admin/members#member-roster",
  );
  assert.equal(getNotificationHref({ category: "officer_event" }), "/events");
  assert.equal(
    getNotificationHref({ category: "officer_event", event_id: "evt-123" }),
    "/events#event-evt-123",
  );
  assert.equal(
    getNotificationHref({ category: "attendance_open", event_id: "evt-123" }),
    "/attendance?event=evt-123&tab=session#attendance-session",
  );
  assert.equal(
    getNotificationHref({ category: "attendance_open", event_id: null }),
    "/attendance",
  );
  assert.equal(
    getNotificationHref({ category: "announcement" }),
    "/announcements",
  );
  assert.equal(
    getNotificationHref({ category: "announcement", source_id: "ann-456" }),
    "/announcements#announcement-ann-456",
  );
  assert.equal(getNotificationHref({ category: "new_poll" }), "/polls");
  assert.equal(
    getNotificationHref({ category: "new_poll", source_id: "poll-789" }),
    "/polls#poll-poll-789",
  );
  assert.equal(
    getNotificationHref({ category: "poll_closing", source_id: "poll-789" }),
    "/polls#poll-poll-789",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "../admin/members?notice=spoof",
    }),
    "/finances#finance-ledger",
  );
  assert.equal(
    getNotificationHref({
      category: "attendance_open",
      event_id: "evt/123?bad=1",
    }),
    "/attendance",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_member",
      body: "Your role changed to Executive.",
    }),
    "/admin/members#member-roster",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_member",
      body: "Your role changed to Member (was Executive).",
    }),
    "/",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      body: "Your dues payment of ₦5,000 (1 month) was approved.",
    }),
    "/dues#dues-requests",
  );
  assert.equal(
    getNotificationHref({
      category: "dues_reminder",
      body: "Your dues payment of ₦5,000 (1 month) was recorded.",
    }),
    "/dues#dues-payments",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      title: "Dues payment request",
      body: "Member submitted a dues request",
    }),
    "/dues#dues-approvals",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      title: "Monthly dues rate updated",
    }),
    "/dues#dues-rates",
  );
});

test("officer dues lifecycle alerts land on the relevant dues section", () => {
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      title: "Dues request declined",
      body: "Jane's dues payment request was declined by Admin.",
    }),
    "/dues#dues-approvals",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      title: "Dues payment updated",
      body: "Jane's dues payment was updated to ₦5,000 (1 month).",
    }),
    "/dues#dues-payments",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      title: "Dues month written off",
      body: "Jane's dues for 2026-09 (₦5,000) were written off.",
    }),
    "/dues#dues-audit",
  );
});

test("event income alerts open the revenue tab, not ticketing", () => {
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Event income recorded",
      body: "Event income of ₦50,000 (donation) for Annual Dinner was recorded.",
    }),
    "/events/evt-123/dashboard?tab=revenue#event-finance-revenue",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Event income updated",
      body: "Event income of ₦50,000 for Annual Dinner was updated.",
    }),
    "/events/evt-123/dashboard?tab=revenue#event-finance-revenue",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Event income recorded",
      body: "Event income of ₦15,000 (Merchandise) for Local QA ticketed event was recorded.",
    }),
    "/events/evt-123/dashboard?tab=revenue#event-finance-revenue",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_money",
      event_id: "evt-123",
      title: "Ticket sale recorded",
      body: "2 ticket(s) (₦20,000) recorded for Annual Dinner.",
    }),
    "/events/evt-123/dashboard?tab=tickets#event-finance-tickets",
  );
});

test("notifications page route redirects to home since notifications are in the header drawer", () => {
  assert.match(page, /redirect\("\/"\)/);
});
