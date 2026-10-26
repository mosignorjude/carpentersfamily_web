import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/meaningful-change.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const detector = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const meeting = {
  meetingDate: "2026-11-12",
  startTime: "18:00",
  endTime: "20:00",
  venue: "Main Hall",
  agenda: "Budget review",
};

const event = {
  startsAt: "2026-11-12T18:00:00.000Z",
  endsAt: "2026-11-12T21:00:00.000Z",
  timezone: "Africa/Lagos",
  location: "Main Hall",
  title: "Annual General Meeting",
};

describe("meaningful change fingerprints", () => {
  it("produces stable lowercase SHA-256 meeting fingerprints", () => {
    const fingerprint = detector.createMeetingFingerprint(meeting);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(detector.createMeetingFingerprint({ ...meeting }), fingerprint);
  });

  it("ignores meeting whitespace noise but reacts to schedule changes", () => {
    const fingerprint = detector.createMeetingFingerprint(meeting);
    assert.equal(
      detector.createMeetingFingerprint({
        ...meeting,
        venue: "  Main Hall  ",
        agenda: "  Budget review  ",
      }),
      fingerprint,
    );

    for (const change of [
      { meetingDate: "2026-11-19" },
      { startTime: "19:00" },
      { endTime: "21:00" },
      { venue: "Main Hall Annex" },
      { agenda: "Budget review and elections" },
    ]) {
      assert.notEqual(
        detector.createMeetingFingerprint({ ...meeting, ...change }),
        fingerprint,
      );
    }
  });

  it("produces stable lowercase SHA-256 event fingerprints", () => {
    const fingerprint = detector.createEventFingerprint(event);
    assert.match(fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(
      detector.createEventFingerprint({
        ...event,
        location: "  Main Hall  ",
        title: "  Annual General Meeting  ",
      }),
      fingerprint,
    );

    for (const change of [
      { startsAt: "2026-11-19T18:00:00.000Z" },
      { endsAt: "2026-11-12T22:00:00.000Z" },
      { timezone: "Africa/Accra" },
      { location: "Annex" },
      { title: "Annual General Meeting (Rescheduled)" },
    ]) {
      assert.notEqual(
        detector.createEventFingerprint({ ...event, ...change }),
        fingerprint,
      );
    }
  });

  it("treats equivalent timestamp formats as the same instant", () => {
    const canonical = { ...event, startsAt: "2026-11-12T18:00:00.000Z" };
    const fingerprint = detector.createEventFingerprint(canonical);

    for (const startsAt of [
      "2026-11-12T18:00:00+00:00",
      "2026-11-12T19:00:00+01:00",
      "2026-11-12T18:00:00.000+00:00",
    ]) {
      assert.equal(
        detector.createEventFingerprint({ ...canonical, startsAt }),
        fingerprint,
        startsAt,
      );
      assert.equal(
        detector.describeEventChanges(canonical, { ...canonical, startsAt }),
        "",
        startsAt,
      );
    }
  });

  it("derives meeting date and time in the club timezone", () => {
    assert.deepEqual(
      detector.meetingScheduleFromInstant("2026-11-12T17:00:00.000Z"),
      { meetingDate: "2026-11-12", startTime: "18:00:00" },
    );
    assert.deepEqual(
      detector.meetingScheduleFromInstant("2026-11-12T23:30:00.000Z"),
      { meetingDate: "2026-11-13", startTime: "00:30:00" },
    );
    assert.equal(
      detector.meetingScheduleFromInstant("2026-11-12T18:00:00+01:00")
        .startTime,
      "18:00:00",
    );
  });

  it("describes only the meeting fields that changed", () => {
    assert.equal(detector.describeMeetingChanges(meeting, meeting), "");

    const summary = detector.describeMeetingChanges(meeting, {
      ...meeting,
      meetingDate: "2026-11-19",
      venue: "Main Hall Annex",
    });
    assert.match(summary, /Date changed from 2026-11-12 to 2026-11-19/);
    assert.match(summary, /Venue changed from Main Hall to Main Hall Annex/);
    assert.doesNotMatch(summary, /Agenda/);
  });

  it("describes only the event fields that changed", () => {
    assert.equal(detector.describeEventChanges(event, event), "");

    const summary = detector.describeEventChanges(event, {
      ...event,
      startsAt: "2026-11-19T18:00:00.000Z",
      location: "Grand Hall",
    });
    assert.match(summary, /Start changed from/);
    assert.match(summary, /Location changed from Main Hall to Grand Hall/);
    assert.doesNotMatch(summary, /Title/);
  });
});
