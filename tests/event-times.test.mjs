import assert from "node:assert/strict";
import test from "node:test";
import {
  eventLiveWindowLowerBound,
  formatEventDateSpan,
  formatEventDurationLabel,
  formatEventTime,
  formatMeridiemFromClock,
  isEventLiveOrUpcoming,
} from "../src/lib/event-times.mjs";

test("formatEventTime renders a Lagos 12-hour clock", () => {
  assert.equal(formatEventTime("2026-11-12T17:00:00.000Z"), "6:00 PM");
  assert.equal(formatEventTime("2026-11-12T11:30:00.000Z"), "12:30 PM");
  assert.equal(formatEventTime("2026-11-12T23:30:00.000Z"), "12:30 AM");
  assert.equal(formatEventTime("2026-11-12T08:05:00.000Z"), "9:05 AM");
});

test("formatEventTime returns an empty string instead of Invalid Date", () => {
  for (const value of [null, undefined, "", "nope"]) {
    assert.equal(formatEventTime(value), "", String(value));
  }
});

test("formatMeridiemFromClock converts a bare HH:MM or HH:MM:SS clock", () => {
  assert.equal(formatMeridiemFromClock("18:00"), "6:00 PM");
  assert.equal(formatMeridiemFromClock("18:00:00"), "6:00 PM");
  assert.equal(formatMeridiemFromClock("00:30"), "12:30 AM");
  assert.equal(formatMeridiemFromClock("12:15"), "12:15 PM");
  assert.equal(formatMeridiemFromClock("2026-11-12T17:00:00.000Z"), "6:00 PM");
});

test("formatMeridiemFromClock returns an empty string for a clock it cannot read", () => {
  for (const value of [null, undefined, "", "18:00 PM", "24:00", "abc"]) {
    assert.equal(formatMeridiemFromClock(value), "", String(value));
  }
});

test("formatEventDateSpan names one day exactly as the old formatter did", () => {
  assert.equal(
    formatEventDateSpan("2026-11-12T17:00:00.000Z", 1),
    "Thursday, 12 November 2026",
  );
  assert.equal(
    formatEventDateSpan("2026-11-12T17:00:00.000Z", undefined),
    "Thursday, 12 November 2026",
  );
});

test("formatEventDateSpan spans the last day of a multi-day event", () => {
  assert.equal(
    formatEventDateSpan("2026-11-12T17:00:00.000Z", 3),
    "Thursday, 12 – Saturday, 14 November 2026",
  );
  assert.equal(
    formatEventDateSpan("2026-10-30T17:00:00.000Z", 4),
    "Friday, 30 October – Monday, 2 November 2026",
  );
});

test("formatEventDateSpan ignores a duration that is not a usable day count", () => {
  for (const days of [0, -3, "abc", 1.5, null]) {
    assert.equal(
      formatEventDateSpan("2026-11-12T17:00:00.000Z", days),
      "Thursday, 12 November 2026",
      String(days),
    );
  }
});

test("formatEventDurationLabel counts days pluralised", () => {
  assert.equal(formatEventDurationLabel(1), "1 day");
  assert.equal(formatEventDurationLabel("5"), "5 days");
  assert.equal(formatEventDurationLabel(null), "");
  assert.equal(formatEventDurationLabel(0), "");
});

test("isEventLiveOrUpcoming keeps a one-day event until its own start passes", () => {
  const startsAt = "2026-11-12T17:00:00.000Z";
  const endsAt = "2026-11-12T17:00:00.000Z";
  const at = Date.parse;
  assert.equal(
    isEventLiveOrUpcoming(
      { starts_at: startsAt, ends_at: endsAt },
      at("2026-11-12T16:59:59.999Z"),
    ),
    true,
  );
  assert.equal(
    isEventLiveOrUpcoming(
      { starts_at: startsAt, ends_at: endsAt },
      at("2026-11-12T17:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isEventLiveOrUpcoming(
      { starts_at: startsAt, ends_at: endsAt },
      at("2026-11-12T17:00:00.001Z"),
    ),
    false,
  );
});

test("isEventLiveOrUpcoming keeps a multi-day event live on its final day", () => {
  const event = {
    starts_at: "2026-11-12T17:00:00.000Z",
    ends_at: "2026-11-14T17:00:00.000Z",
  };
  assert.equal(
    isEventLiveOrUpcoming(event, Date.parse("2026-11-14T12:00:00.000Z")),
    true,
  );
  assert.equal(
    isEventLiveOrUpcoming(event, Date.parse("2026-11-14T17:00:00.001Z")),
    false,
  );
});

test("isEventLiveOrUpcoming falls back to starts_at when ends_at was not selected", () => {
  const startsAt = "2026-11-12T17:00:00.000Z";
  assert.equal(
    isEventLiveOrUpcoming(
      { starts_at: startsAt },
      Date.parse("2026-11-12T10:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isEventLiveOrUpcoming(
      { starts_at: startsAt },
      Date.parse("2026-11-12T18:00:00.000Z"),
    ),
    false,
  );
  assert.equal(isEventLiveOrUpcoming({ starts_at: null }), false);
});

test("eventLiveWindowLowerBound reaches back by the maximum duration minus one day", () => {
  assert.equal(
    eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z"),
    "2026-10-14T17:00:00.000Z",
  );
  assert.equal(
    eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z", 1),
    "2026-11-12T17:00:00.000Z",
  );
  assert.equal(
    eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z", 3),
    "2026-11-10T17:00:00.000Z",
  );
});

test("eventLiveWindowLowerBound leaves an unusable input untouched", () => {
  assert.equal(eventLiveWindowLowerBound("not-a-date"), "not-a-date");
});
