import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getNotificationCategoryLabel,
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

test("active account and caller-scoped queries remain required before showing data", () => {
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /profile\?\.status !== "active"/);
  assert.match(page, /\.eq\("id", authData\.user\.id\)/);
  assert.match(page, /supabase\s*\.from\("notifications"\)/);
  assert.match(page, /supabase\.from\("notification_preferences"\)/);
  assert.match(page, /notificationResult\.error \|\| preferenceResult\.error/);
  assert.ok(
    page.indexOf("notificationResult.error || preferenceResult.error") <
      page.indexOf("const notifications ="),
    "failed reads must return before notification rows are rendered",
  );
});

test("empty inbox has a clear empty state without invented sample notices", () => {
  assert.match(page, /notifications\.length === 0/);
  assert.match(page, /You have no notifications yet\./);
  assert.doesNotMatch(page, /Jane Doe|₦[\d,]+|pending dues/i);
});

test("read and preference actions are presented only through the intended controls", () => {
  assert.match(page, /notification\.read_at === null\s*\?\s*\(/);
  assert.match(page, /action=\{markNotificationReadAction\}/);
  assert.match(page, /routinePreferenceCategories\.map/);
  assert.match(page, /action=\{setNotificationPreferenceAction\}/);
  assert.match(page, /Dues reminders and\s*officer alerts stay enabled/);
});

test("member-authored notification text stays escaped React text", () => {
  assert.match(page, /\{notification\.title\}/);
  assert.match(page, /\{notification\.body\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|\binnerHTML\s*=/i);
});

test("only allowlisted query notices are reflected and error state hides data", () => {
  assert.match(page, /const notices: Record<string, string>/);
  assert.match(
    page,
    /const notice = params\.notice \? notices\[params\.notice\] : undefined/,
  );
  assert.match(
    page,
    /Notification data could not be loaded\. Your notifications and\s*preferences are hidden/,
  );
  assert.match(page, /role="alert"/);
  assert.match(page, /href="\/notifications"/);
});
