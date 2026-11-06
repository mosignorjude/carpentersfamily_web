import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { selectLandingEvents, selectNextEvent } from "../src/lib/landing-events.mjs";

test("selectLandingEvents provides startsAt ISO timestamp", () => {
  const events = [
    {
      id: "e-1",
      title: "Gala Night",
      starts_at: "2026-12-25T18:00:00+00:00",
      location: "Asaba",
      tiers: []
    }
  ];
  const [card] = selectLandingEvents(events);
  assert.equal(card.startsAt, "2026-12-25T18:00:00.000Z");
  const next = selectNextEvent(events);
  assert.equal(next.startsAt, "2026-12-25T18:00:00.000Z");
});

test("landing-ribbon renders LandingCountdownBadge instead of Season badge", () => {
  const ribbon = fs.readFileSync("src/components/landing/landing-ribbon.tsx", "utf8");
  assert.match(ribbon, /LandingCountdownBadge/);
  assert.doesNotMatch(ribbon, /Season/);
});
