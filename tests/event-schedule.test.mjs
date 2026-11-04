import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DURATION_DAYS,
  MINUTE_STEPS,
  endsAtFromStart,
  parseDurationDays,
  parseEventSchedule,
  splitInstantForForm,
} from "../src/lib/event-schedule.mjs";

test("parseEventSchedule builds a WAT instant from separate date and 12-hour parts", () => {
  assert.deepEqual(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "6",
      startMinute: "0",
      meridiem: "PM",
    }),
    { ok: true, startsAt: "2026-11-12T17:00:00.000Z" },
  );
});

test("parseEventSchedule maps the two twelve-hour edge hours onto the 24-hour clock", () => {
  // 12:30 AM Lagos is 2026-11-11T23:30Z — the UTC calendar day moves backwards.
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "12",
      startMinute: "30",
      meridiem: "AM",
    }).startsAt,
    "2026-11-11T23:30:00.000Z",
  );
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "12",
      startMinute: "30",
      meridiem: "PM",
    }).startsAt,
    "2026-11-12T11:30:00.000Z",
  );
});

test("parseEventSchedule accepts every minute, not only the five-minute grid", () => {
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "9",
      startMinute: "37",
      meridiem: "AM",
    }).startsAt,
    "2026-11-12T08:37:00.000Z",
  );
});

test("parseEventSchedule rejects each missing or malformed part with its own field", () => {
  const cases = [
    [
      { eventDate: "", startHour: "6", startMinute: "0", meridiem: "PM" },
      "event_date",
    ],
    [
      {
        eventDate: "2026-11-1",
        startHour: "6",
        startMinute: "0",
        meridiem: "PM",
      },
      "event_date",
    ],
    [
      {
        eventDate: "2026-02-31",
        startHour: "6",
        startMinute: "0",
        meridiem: "PM",
      },
      "event_date",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "13",
        startMinute: "0",
        meridiem: "PM",
      },
      "start_hour",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "0",
        startMinute: "0",
        meridiem: "AM",
      },
      "start_hour",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "6",
        startMinute: "60",
        meridiem: "PM",
      },
      "start_minute",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "6",
        startMinute: "x",
        meridiem: "PM",
      },
      "start_minute",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "6",
        startMinute: "0",
        meridiem: "pm ",
      },
      "meridiem",
    ],
    [
      {
        eventDate: "2026-11-12",
        startHour: "6",
        startMinute: "0",
        meridiem: "",
      },
      "meridiem",
    ],
  ];
  for (const [parts, field] of cases) {
    const result = parseEventSchedule(parts);
    assert.equal(result.ok, false, JSON.stringify(parts));
    assert.equal(result.field, field, JSON.stringify(parts));
    assert.ok(result.message.length > 0, JSON.stringify(parts));
  }
});

test("parseEventSchedule tolerates nullish input instead of throwing", () => {
  assert.equal(parseEventSchedule({}).ok, false);
  assert.equal(parseEventSchedule(undefined).ok, false);
  assert.equal(parseEventSchedule({}).field, "event_date");
});

test("parseDurationDays accepts a whole number of days up to the maximum", () => {
  assert.equal(parseDurationDays("1"), 1);
  assert.equal(parseDurationDays("30"), MAX_DURATION_DAYS);
  assert.equal(parseDurationDays(7), 7);
});

test("parseDurationDays rejects zero, out-of-range, fractional and non-numeric input", () => {
  for (const value of [
    "0",
    "31",
    "-1",
    "1.5",
    "",
    "abc",
    null,
    undefined,
    {},
    NaN,
  ]) {
    assert.equal(parseDurationDays(value), null, String(value));
  }
});

test("splitInstantForForm is the inverse of parseEventSchedule", () => {
  assert.deepEqual(splitInstantForForm("2026-11-12T17:00:00.000Z"), {
    eventDate: "2026-11-12",
    startHour: "6",
    startMinute: "00",
    meridiem: "PM",
  });
  assert.deepEqual(splitInstantForForm("2026-11-12T11:30:00.000Z"), {
    eventDate: "2026-11-12",
    startHour: "12",
    startMinute: "30",
    meridiem: "PM",
  });
});

test("splitInstantForForm recovers a date that crossed midnight in Lagos", () => {
  // 2026-11-12T23:30Z is 2026-11-13 00:30 in WAT: the day moves, so a naive
  // iso.slice(0, 10) would pre-fill the form with the previous evening.
  assert.deepEqual(splitInstantForForm("2026-11-12T23:30:00.000Z"), {
    eventDate: "2026-11-13",
    startHour: "12",
    startMinute: "30",
    meridiem: "AM",
  });
});

test("splitInstantForForm returns null for absent or unparseable instants", () => {
  assert.equal(splitInstantForForm(null), null);
  assert.equal(splitInstantForForm(undefined), null);
  assert.equal(splitInstantForForm(""), null);
  assert.equal(splitInstantForForm("not-a-date"), null);
});

test("MINUTE_STEPS is the documented five-minute grid", () => {
  assert.equal(MINUTE_STEPS.length, 12);
  assert.deepEqual(MINUTE_STEPS.slice(0, 3), [0, 5, 10]);
  assert.equal(MINUTE_STEPS.at(-1), 55);
});

test("endsAtFromStart reproduces the generated ends_at column", () => {
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 1), "2026-11-12T17:00:00.000Z");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 3), "2026-11-14T17:00:00.000Z");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 30), "2026-12-11T17:00:00.000Z");
});

test("endsAtFromStart refuses nonsense instead of inventing an instant", () => {
  assert.equal(endsAtFromStart("not-a-date", 3), "");
  assert.equal(endsAtFromStart("", 3), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 0), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 2.5), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 31), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", null), "");
});

test("endsAtFromStart crosses daylight-saving-free Lagos midnight on whole days", () => {
  // 23:30 WAT on 12 November, three days: the last day starts 23:30 WAT on 14 November.
  assert.equal(endsAtFromStart("2026-11-12T22:30:00.000Z", 3), "2026-11-14T22:30:00.000Z");
});
