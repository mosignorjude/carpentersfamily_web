import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  selectLandingEvents,
  selectNextGathering,
} from "../src/lib/landing-events.mjs";

const TIER = (price, capacity, sold) => ({
  id: "t-1",
  name: "Regular",
  price_ngn: price,
  capacity,
  sold,
});

const EVENTS = [
  {
    id: "e-2",
    title: "Harvest Night",
    starts_at: "2026-12-14T10:00:00+00:00",
    location: "Asaba",
    description: "Dinner, awards and live sets.",
    tiers: [TIER(5_000, 100, 4), TIER(2_500, 50, 50)],
  },
  {
    id: "e-1",
    title: "Opening Rave",
    starts_at: "2026-11-30T18:00:00+00:00",
    location: "Delta State",
    description: null,
    tiers: [TIER(1_500, null, 12)],
  },
];

test("selectLandingEvents maps real rows and adds nothing invented", () => {
  const cards = selectLandingEvents(EVENTS);
  assert.equal(cards.length, 2);

  const harvest = cards[0];
  assert.equal(harvest.id, "e-2");
  assert.equal(harvest.title, "Harvest Night");
  // Africa/Lagos is UTC+1, so 10:00Z is 11:00 AM on the 14th.
  assert.equal(harvest.whenLabel, "Mon, 14 Dec 2026");
  assert.equal(harvest.timeLabel, "11:00 AM");
  assert.equal(harvest.location, "Asaba");
  assert.equal(harvest.blurb, "Dinner, awards and live sets.");
  assert.equal(harvest.cheapestPrice, 2_500);
  assert.equal(harvest.soldOut, false);

  const rave = cards[1];
  assert.equal(rave.location, "Delta State");
  assert.equal(
    rave.blurb,
    null,
    "a null description must stay absent, not be filled in",
  );
  assert.equal(rave.cheapestPrice, 1_500);
});

test("selectLandingEvents reports an event whose every capped tier is sold out", () => {
  const [card] = selectLandingEvents([
    { ...EVENTS[0], tiers: [TIER(2_500, 50, 50), TIER(5_000, 10, 10)] },
  ]);
  assert.equal(card.soldOut, true);
});

test("selectLandingEvents has no cheapest price when a row carries no tiers", () => {
  const [card] = selectLandingEvents([{ ...EVENTS[0], tiers: [] }]);
  assert.equal(card.cheapestPrice, null);
});

test("selectLandingEvents tolerates junk from the database", () => {
  assert.deepEqual(selectLandingEvents(null), []);
  assert.deepEqual(selectLandingEvents(undefined), []);
  const [card] = selectLandingEvents([
    {
      id: "x",
      title: "Broken",
      starts_at: "not-a-date",
      location: "",
      tiers: null,
    },
  ]);
  assert.equal(card.whenLabel, "");
  assert.equal(card.location, null);
  assert.equal(card.cheapestPrice, null);
});

test("selectNextGathering returns the earliest row, or null", () => {
  assert.equal(selectNextGathering(EVENTS)?.id, "e-1");
  assert.equal(selectNextGathering([]), null);
  assert.equal(selectNextGathering(null), null);
});

test("landing surfaces carry no invented event schedule", () => {
  const banned = [
    "End-of-Year Gala",
    "SLK Rave",
    "Monthly General Assembly",
    "Black Tie",
    "Smart / Traditional",
    "Vibrant & Colourful",
    "Last Sunday",
    "2026 Season",
    "Dec 2026",
    "Members Only",
  ];
  const files = [
    ...fs
      .readdirSync("src/components/landing")
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `src/components/landing/${f}`),
    "src/app/page.tsx",
  ];
  const hits = [];
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const phrase of banned) {
      if (src.includes(phrase)) hits.push(`${file}: "${phrase}"`);
    }
  }
  assert.deepEqual(
    hits,
    [],
    "Only rows from get_public_ticketed_events may name an event",
  );
});
