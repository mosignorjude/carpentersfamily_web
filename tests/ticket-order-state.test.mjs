import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCheckoutQuery,
  buildSubmitFailureUrl,
  CHECKOUT_PARAM_KEYS,
  checkoutHref,
  clampQuantity,
  MAX_ONLINE_QUANTITY,
  maxQuantityForTier,
  parseCheckoutState,
  tierRemaining,
} from "../src/lib/ticket-order-state.mjs";

const events = [
  {
    id: "evt-rave",
    tiers: [
      { id: "tpr-standard", capacity: 100, sold: 96 },
      { id: "tpr-vip", capacity: null, sold: 4 },
    ],
  },
  { id: "evt-gala", tiers: [{ id: "tpr-table", capacity: 40, sold: 0 }] },
];

test("a missing or unknown event id restores no overlay", () => {
  assert.equal(parseCheckoutState("", events), null);
  assert.equal(parseCheckoutState("?tier=tpr-vip&qty=3", events), null);
  assert.equal(
    parseCheckoutState("?event=evt-from-an-old-bookmark", events),
    null,
  );
});

test("restores by id, not by position", () => {
  const reordered = [events[1], events[0]];
  const state = parseCheckoutState(
    "?event=evt-rave&tier=tpr-vip&qty=2&step=2",
    reordered,
  );
  assert.equal(state.eventId, "evt-rave");
  assert.equal(state.tierId, "tpr-vip");
  assert.equal(state.quantity, 2);
  assert.equal(state.step, 2);
});

test("an unknown tier id falls back to the event's first tier", () => {
  const state = parseCheckoutState("?event=evt-rave&tier=tpr-retired", events);
  assert.equal(state.tierId, "tpr-standard");
});

test("step is 1 or 2 and nothing else", () => {
  for (const raw of ["", "3", "0", "two", "2"]) {
    const step = parseCheckoutState(`?event=evt-gala&step=${raw}`, events).step;
    assert.ok(step === 1 || step === 2, `step=${raw} produced ${step}`);
  }
  assert.equal(parseCheckoutState("?event=evt-gala&step=2", events).step, 2);
});

test("quantity clamps to the online ceiling and to what the tier has left", () => {
  assert.equal(MAX_ONLINE_QUANTITY, 10);
  assert.equal(clampQuantity("500", 40), 10);
  assert.equal(clampQuantity("500", 3), 3);
  assert.equal(clampQuantity("0", null), 1);
  assert.equal(clampQuantity("-4", null), 1);
  assert.equal(clampQuantity("abc", null), 1);
  assert.equal(clampQuantity(null, null), 1);
  assert.equal(maxQuantityForTier(null), MAX_ONLINE_QUANTITY);
  assert.equal(maxQuantityForTier(0), 1);
});

test("tier remaining is null when the tier is open-ended and never negative", () => {
  assert.equal(tierRemaining({ capacity: null, sold: 4 }), null);
  assert.equal(tierRemaining({ capacity: 100, sold: 96 }), 4);
  assert.equal(tierRemaining({ capacity: 40, sold: 55 }), 0);
});

test("the checkout writes over the state and clears exactly its four keys", () => {
  const state = parseCheckoutState(
    "?event=evt-rave&tier=tpr-standard&qty=4&step=1",
    events,
  );
  assert.equal(
    buildCheckoutQuery("?notice=box-office-closed", state),
    "notice=box-office-closed&event=evt-rave&tier=tpr-standard&qty=4&step=1",
  );
  assert.equal(checkoutHref("/tickets", "?event=evt-rave", null), "/tickets");
  assert.equal(
    buildCheckoutQuery(
      "?ref=CF-K7M2QX9B&event=evt-rave&tier=tpr-standard",
      null,
    ),
    "ref=CF-K7M2QX9B",
  );
  for (const key of CHECKOUT_PARAM_KEYS)
    assert.ok(["event", "tier", "qty", "step"].includes(key));
});

test("a rejected submit returns the buyer to the overlay with one allowlisted notice", () => {
  const url = buildSubmitFailureUrl({
    eventId: "evt-rave",
    tierId: "tpr-standard",
    quantity: 3,
    notice: "box-office-at-capacity",
  });
  assert.equal(
    url,
    "/tickets?notice=box-office-at-capacity&event=evt-rave&tier=tpr-standard&qty=3&step=2",
  );
});

test("no buyer PII ever enters a checkout URL", () => {
  const urls = [
    checkoutHref(
      "/tickets",
      "",
      parseCheckoutState("?event=evt-rave&qty=2", events),
    ),
    buildSubmitFailureUrl({
      eventId: "evt-rave",
      tierId: "tpr-standard",
      quantity: 2,
      notice: "invalid-request",
    }),
  ];
  for (const url of urls) {
    assert.doesNotMatch(url, /email|phone|name|@/i, url);
  }
});
