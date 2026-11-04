import assert from "node:assert/strict";
import test from "node:test";
import { groupEventRows } from "../src/lib/event-presentation.mjs";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");

// Every fixture row is a one-day event unless it says otherwise: ends_at
// defaults to starts_at, which is exactly the invariant the generated column
// enforces in the database.
const row = (id, overrides = {}) => ({
  id,
  title: id,
  status: "scheduled",
  archived_at: null,
  starts_at: "2026-11-15T17:00:00.000Z",
  ...overrides,
  ends_at:
    overrides.ends_at ?? overrides.starts_at ?? "2026-11-15T17:00:00.000Z",
});

test("a scheduled event inside its last day stays upcoming", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("multi", {
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-16T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["multi"],
  );
  assert.equal(recentPast.length, 0);
});

test("a scheduled event past its last day is past", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("finished-window", {
        starts_at: "2026-11-10T17:00:00.000Z",
        ends_at: "2026-11-12T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["finished-window"],
  );
});

test("the instant exactly equal to ends_at is still upcoming", () => {
  const { upcoming } = groupEventRows(
    [
      row("boundary", {
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-16T17:00:00.000Z",
      }),
    ],
    Date.parse("2026-11-16T17:00:00.000Z"),
  );
  assert.equal(upcoming.length, 1);
});

test("a row without ends_at keeps the old start-only rule", () => {
  const legacy = row("legacy", { starts_at: "2026-11-20T17:00:00.000Z" });
  delete legacy.ends_at;
  const { upcoming } = groupEventRows([legacy], NOW);
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["legacy"],
  );
});

test("completed events leave upcoming even inside their window", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("done", {
        status: "completed",
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-20T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["done"],
  );
});

test("archived rows are only ever in retainedArchive", () => {
  const { upcoming, recentPast, retainedArchive } = groupEventRows(
    [
      row("archived", {
        status: "completed",
        archived_at: "2026-11-15T10:00:00.000Z",
        starts_at: "2026-12-01T17:00:00.000Z",
        ends_at: "2026-12-03T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.equal(recentPast.length, 0);
  assert.deepEqual(
    retainedArchive.map((event) => event.id),
    ["archived"],
  );
});

test("upcoming sorts soonest first and past sorts newest first", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("later", { starts_at: "2026-11-30T17:00:00.000Z" }),
      row("sooner", { starts_at: "2026-11-20T17:00:00.000Z" }),
      row("old", {
        status: "completed",
        starts_at: "2026-01-01T17:00:00.000Z",
      }),
      row("newer", {
        status: "completed",
        starts_at: "2026-02-01T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["sooner", "later"],
  );
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["newer", "old"],
  );
});

