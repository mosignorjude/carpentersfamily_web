import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);

describe("TabExpenses layout and overflow protection", () => {
  it("constrains the segmented button scroll container with min-w-0 and flex-1", () => {
    assert.match(
      source,
      /overflow-x-auto[^"]*min-w-0|min-w-0[^"]*overflow-x-auto/,
      "Segmented filter buttons container must include min-w-0 to prevent flex blowout"
    );
  });

  it("applies responsive wrapping to header action and stat cards", () => {
    assert.match(
      source,
      /flex-col lg:flex-row/,
      "Header must wrap gracefully on tablet viewports using lg:flex-row instead of md:flex-row"
    );
  });
});
