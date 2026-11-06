import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const surfaces = [
  "../src/components/events/event-card.tsx",
  "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
  "../src/components/attendance/attendance-hub-view.tsx",
  "../src/components/events/attendance/attendance-page-view.tsx",
  "../src/components/home/next-up-events-card.tsx",
  "../src/app/(member)/officers/members/page.tsx",
  "../src/components/tickets/tickets-storefront-view.tsx",
];

describe("event clock surfaces", () => {
  for (const path of surfaces) {
    it(`${path} prints event times through the shared 12-hour helper`, () => {
      const text = source(path);
      assert.match(text, /formatEventTime\(/);
      assert.equal(text.includes("hour12: false"), false);
    });
  }

  it("spans the last day wherever the duration is selected", () => {
    for (const path of [
      "../src/components/events/event-card.tsx",
      "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
      "../src/components/attendance/attendance-hub-view.tsx",
      "../src/components/events/attendance/attendance-page-view.tsx",
    ]) {
      assert.match(source(path), /formatEventDateSpan\(/, path);
    }
  });

  it("keeps the officer's check-in clock out of the sweep", () => {
    const hub = source("../src/components/attendance/attendance-hub-view.tsx");
    assert.match(hub, /watShortDate\.format\(new Date\(row\.checkedInAt\)\)/);
  });

  it("feeds the dashboard header the columns the span needs", () => {
    assert.match(
      source("../src/app/(member)/events/[eventId]/dashboard/page.tsx"),
      /select\(\s*"id, title, event_type, starts_at, duration_days,/,
    );
    assert.match(
      source("../src/app/(member)/meeting-hub/page.tsx"),
      /"id, title, event_type, starts_at, duration_days, location, status, minutes_enabled, attendance_enabled, archived_at",/,
    );
  });
});

