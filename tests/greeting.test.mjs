import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  formatGreetingUsername,
  getTimeOfDayGreeting,
} from "../src/lib/greeting.ts";

test("getTimeOfDayGreeting: correctly categorizes 24-hour day in Africa/Lagos", () => {
  // Morning: 05:00 to 11:59
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T05:00:00+01:00")),
    "Good Morning",
  );
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T11:59:59+01:00")),
    "Good Morning",
  );

  // Afternoon: 12:00 to 16:59
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T12:00:00+01:00")),
    "Good Afternoon",
  );
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T16:59:59+01:00")),
    "Good Afternoon",
  );

  // Evening: 17:00 to 21:59
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T17:00:00+01:00")),
    "Good Evening",
  );
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T21:59:59+01:00")),
    "Good Evening",
  );

  // Night: 22:00 to 04:59
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T22:00:00+01:00")),
    "Good Night",
  );
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T02:30:00+01:00")),
    "Good Night",
  );
  assert.equal(
    getTimeOfDayGreeting(new Date("2026-10-25T04:59:59+01:00")),
    "Good Night",
  );
});

test("formatGreetingUsername: cleans leading @ and capitalizes username", () => {
  assert.equal(formatGreetingUsername("jude"), "Jude");
  assert.equal(formatGreetingUsername("@jude"), "Jude");
  assert.equal(formatGreetingUsername("Jude"), "Jude");
  assert.equal(formatGreetingUsername("admin_cf"), "Admin_cf");
  assert.equal(formatGreetingUsername("", "John Doe"), "John Doe");
  assert.equal(formatGreetingUsername(null, "mary"), "Mary");
  assert.equal(formatGreetingUsername(null, null), "Member");
});

test("HomeDashboardView: renders greeting and updated family overview copy", () => {
  const viewSource = fs.readFileSync(
    "src/components/home-dashboard-view.tsx",
    "utf8",
  );
  const pageSource = fs.readFileSync("src/app/page.tsx", "utf8");

  // View template check
  assert.ok(
    viewSource.includes("{effectiveGreeting}, {greetingName}"),
    "HomeDashboardView must render the time-of-day greeting and capitalized username",
  );
  assert.match(
    viewSource,
    /Welcome back\.\s+Here is an overview of what is happening in the\s+family today\./,
    "HomeDashboardView must render the updated family overview subtitle copy",
  );

  // Page pass-through check
  assert.ok(
    pageSource.includes("const greeting = getTimeOfDayGreeting();") &&
      pageSource.includes("greeting={greeting}") &&
      pageSource.includes(
        "username={profile.username || userProfile.username}",
      ),
    "src/app/page.tsx must compute time-of-day greeting and pass username to HomeDashboardView",
  );
});
