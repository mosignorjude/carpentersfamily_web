import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const eventsPageViewSource = readFileSync(
  new URL("../src/components/events/events-page-view.tsx", import.meta.url),
  "utf8",
);
const eventsPageSource = readFileSync(
  new URL("../src/app/(member)/events/page.tsx", import.meta.url),
  "utf8",
);
const createEventFormSource = readFileSync(
  new URL("../src/components/events/create-event-form.tsx", import.meta.url),
  "utf8",
);
const createEventPageSource = readFileSync(
  new URL("../src/app/(member)/create-event/page.tsx", import.meta.url),
  "utf8",
);

describe("Events Page & /create-event Route (Stage 3)", () => {
  describe("Events Page View — Naming & Removals", () => {
    it("changes 'Events and planning' to 'Events & Activities'", () => {
      assert.match(eventsPageViewSource, /Events & Activities/);
      assert.doesNotMatch(eventsPageViewSource, /Events and planning/);
    });

    it("changes 'general assemblies' to 'General House'", () => {
      assert.match(eventsPageViewSource, /General\s+House/);
      assert.doesNotMatch(eventsPageViewSource, /general assemblies/);
    });

    it("removes the Official Calendar capsule", () => {
      assert.doesNotMatch(eventsPageViewSource, /Official Calendar/);
    });

    it("removes the search bar and its query state", () => {
      assert.doesNotMatch(eventsPageViewSource, /placeholder="Search event title/);
      assert.doesNotMatch(eventsPageViewSource, /setSearchQuery/);
    });

    it("removes Meetings from the segmented event type filters", () => {
      assert.doesNotMatch(
        eventsPageViewSource,
        /\{ id: "meeting", label: "Meetings" \}/,
      );
    });
  });

  describe("Event Creation Navigation & Separation", () => {
    it("renders 'New Event' button linking to /create-event without an explanatory subtitle", () => {
      assert.match(
        eventsPageViewSource,
        /<Link[\s\S]*?href="\/create-event"[\s\S]*?>[\s\S]*?<span>New Event<\/span>[\s\S]*?<\/Link>/,
      );
      assert.doesNotMatch(
        eventsPageViewSource,
        /Authorized for the Executive Council, the Club Admin and the President/,
      );
    });

    it("filters meeting events out of the Events page query", () => {
      assert.match(eventsPageSource, /\.neq\("event_type",\s*"meeting"\)/);
    });
  });

  describe("Dedicated /create-event Page & Form", () => {
    it("creates dedicated /create-event route guarded for managers", () => {
      assert.ok(
        existsSync("src/app/(member)/create-event/page.tsx"),
        "Page route file must exist",
      );
      assert.match(createEventPageSource, /redirect\("\/events\?notice=denied"\)/);
      assert.match(createEventPageSource, /<CreateEventForm/);
    });

    it("supports only 'party' and 'other' classifications in CreateEventForm", () => {
      assert.match(createEventFormSource, /value="party"/);
      assert.match(createEventFormSource, /value="other"/);
      assert.doesNotMatch(
        createEventFormSource,
        /<option[^>]*value="meeting"/,
        "Meeting option must not exist in this creation workflow",
      );
    });

    it("retains all split schedule fields and validation in CreateEventForm", () => {
      for (const field of [
        "title",
        "event_type",
        "event_date",
        "start_hour",
        "start_minute",
        "meridiem",
        "duration_days",
        "location",
      ]) {
        assert.match(
          createEventFormSource,
          new RegExp(`name="${field}"`),
          `Expected input with name="${field}"`,
        );
      }
    });

    it("includes Cancel action linking back to /events and Submit action", () => {
      assert.match(
        createEventFormSource,
        /<Link[\s\S]*?href="\/events"[\s\S]*?>[\s\S]*?Cancel[\s\S]*?<\/Link>/,
      );
      assert.match(createEventFormSource, /<FormSubmitButton/);
      assert.match(createEventFormSource, /action=\{createEventAction\}/);
    });
  });
});
