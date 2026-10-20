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

test("notification href routes accurately to domain areas", () => {
  assert.equal(getNotificationHref({ category: "dues_reminder" }), "/dues");
  assert.equal(
    getNotificationHref({ category: "officer_money", event_id: "evt-123" }),
    "/events/evt-123/finance",
  );
  assert.equal(
    getNotificationHref({ category: "officer_money", event_id: null }),
    "/finances",
  );
  assert.equal(
    getNotificationHref({ category: "officer_member" }),
    "/admin/members",
  );
  assert.equal(getNotificationHref({ category: "officer_event" }), "/events");
  assert.equal(
    getNotificationHref({ category: "attendance_open", event_id: "evt-123" }),
    "/attendance?event=evt-123",
  );
  assert.equal(
    getNotificationHref({ category: "attendance_open", event_id: null }),
    "/attendance",
  );
  assert.equal(
    getNotificationHref({ category: "announcement" }),
    "/announcements",
  );
  assert.equal(getNotificationHref({ category: "new_poll" }), "/polls");
  assert.equal(getNotificationHref({ category: "poll_closing" }), "/polls");
});

test("notifications page route redirects to home since notifications are in the header drawer", () => {
  assert.match(page, /redirect\("\/"\)/);
});
