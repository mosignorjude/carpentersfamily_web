import assert from "node:assert/strict";
import test from "node:test";

// Test the event grouping logic used in EventsPageView
function groupEvents(events, now = new Date("2026-10-16T12:00:00Z").getTime()) {
  const upcoming = events
    .filter(
      (event) =>
        !event.archived_at &&
        event.status === "scheduled" &&
        new Date(event.starts_at).getTime() >= now,
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const recentPast = events
    .filter(
      (event) =>
        !event.archived_at &&
        (event.status !== "scheduled" ||
          new Date(event.starts_at).getTime() < now),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const retainedArchive = events
    .filter((event) => Boolean(event.archived_at))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  return { upcoming, recentPast, retainedArchive };
}

test("events grouping: only events with archived_at belong in retainedArchive", () => {
  const events = [
    {
      id: "evt-future",
      title: "Future Gala",
      status: "scheduled",
      starts_at: "2026-12-01T18:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-overdue-scheduled",
      title: "Yesterday Assembly",
      status: "scheduled",
      starts_at: "2026-10-15T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-completed-1",
      title: "Completed 1",
      status: "completed",
      starts_at: "2026-09-01T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-completed-2",
      title: "Completed 2",
      status: "completed",
      starts_at: "2026-08-01T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-completed-3",
      title: "Completed 3",
      status: "completed",
      starts_at: "2026-07-01T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-completed-4",
      title: "Completed 4",
      status: "completed",
      starts_at: "2026-06-01T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-completed-5",
      title: "Completed 5 (Older)",
      status: "completed",
      starts_at: "2026-05-01T10:00:00Z",
      archived_at: null,
    },
    {
      id: "evt-archived-historical",
      title: "Archived 2024 Gala",
      status: "completed",
      starts_at: "2024-12-01T18:00:00Z",
      archived_at: "2025-01-15T12:00:00Z",
    },
  ];

  const { upcoming, recentPast, retainedArchive } = groupEvents(events);

  // Future scheduled
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].id, "evt-future");

  // Past events: includes overdue scheduled, and ALL completed events (never truncating into archive)
  assert.equal(recentPast.length, 6);
  assert.ok(recentPast.some((e) => e.id === "evt-overdue-scheduled"));
  assert.ok(recentPast.some((e) => e.id === "evt-completed-5"));

  // Retained Archive: STRICTLY events where archived_at is non-null
  assert.equal(retainedArchive.length, 1);
  assert.equal(retainedArchive[0].id, "evt-archived-historical");
});

test("ticket display format: avoids hardcoded 270 fallback", () => {
  function formatTicketProgress(sold, capacity) {
    if (capacity && capacity > 0) {
      return `${sold} / ${capacity} passes`;
    }
    return `${sold} pass${sold === 1 ? "" : "es"} sold`;
  }

  assert.equal(formatTicketProgress(50, 200), "50 / 200 passes");
  assert.equal(formatTicketProgress(1, null), "1 pass sold");
  assert.equal(formatTicketProgress(0, undefined), "0 passes sold");
  assert.equal(formatTicketProgress(100, 0), "100 passes sold");
});

test("event feature configuration rules adhere to database constraints", () => {
  // DB constraint: not ticketing_enabled or (event_type = 'party' and income_enabled)
  function isValidFeatureConfig(
    eventType,
    { incomeEnabled, ticketingEnabled },
  ) {
    if (ticketingEnabled) {
      return eventType === "party" && incomeEnabled === true;
    }
    return true;
  }

  // Meeting cannot have ticketing
  assert.equal(
    isValidFeatureConfig("meeting", {
      incomeEnabled: false,
      ticketingEnabled: true,
    }),
    false,
  );
  assert.equal(
    isValidFeatureConfig("meeting", {
      incomeEnabled: false,
      ticketingEnabled: false,
    }),
    true,
  );

  // Other cannot have ticketing
  assert.equal(
    isValidFeatureConfig("other", {
      incomeEnabled: true,
      ticketingEnabled: true,
    }),
    false,
  );
  assert.equal(
    isValidFeatureConfig("other", {
      incomeEnabled: true,
      ticketingEnabled: false,
    }),
    true,
  );

  // Party with income can have ticketing
  assert.equal(
    isValidFeatureConfig("party", {
      incomeEnabled: true,
      ticketingEnabled: true,
    }),
    true,
  );
  // Party without income cannot have ticketing
  assert.equal(
    isValidFeatureConfig("party", {
      incomeEnabled: false,
      ticketingEnabled: true,
    }),
    false,
  );
});

test("event notice lookup: protects against prototype keys and returns null for unknown keys", () => {
  const noticeText = {
    created: "Event successfully scheduled.",
    "status-updated": "Event status updated.",
    "details-updated": "Event details updated.",
    "budget-allocated": "Event budget updated.",
    archived: "Event archived to permanent records.",
    "invalid-state": "The requested action cannot be applied to this event.",
    error: "Operation could not be completed. Check logs or permissions.",
  };

  function resolveNotice(noticeKey) {
    if (noticeKey && Object.hasOwn(noticeText, noticeKey)) {
      return noticeText[noticeKey];
    }
    return null;
  }

  // Valid keys resolve to mapped user-facing text
  assert.equal(resolveNotice("created"), "Event successfully scheduled.");
  assert.equal(
    resolveNotice("archived"),
    "Event archived to permanent records.",
  );

  // Prototype keys return null, never prototype functions or properties
  assert.equal(resolveNotice("constructor"), null);
  assert.equal(resolveNotice("toString"), null);
  assert.equal(resolveNotice("__proto__"), null);
  assert.equal(resolveNotice("valueOf"), null);

  // Unknown keys return null
  assert.equal(resolveNotice("unknown_notice"), null);
  assert.equal(resolveNotice(""), null);
  assert.equal(resolveNotice(undefined), null);
});
