import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-budget-allocations.tsx", import.meta.url),
  "utf8"
);

describe("TabBudgetAllocations Single Matrix Consolidation", () => {
  it("consolidates allocation tiles and comparative bars into a single matrix card", () => {
    assert.doesNotMatch(source, /grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-4\s+gap-4/);
    assert.match(source, /Capital Allocation & Burn Rate Matrix/i);
    assert.match(source, /<table/);
  });

  it("displays allocation ceiling, disbursed spend, committed POs, and burn rate bar in one view", () => {
    assert.match(source, /Allocated/i);
    assert.match(source, /Disbursed/i);
    assert.match(source, /Committed/i);
    assert.match(source, /Burn Rate/i);
  });
});
