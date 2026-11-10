import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-budget-allocations.tsx", import.meta.url),
  "utf8"
);

describe("TabBudgetAllocations Cost Center Matrix & Responsive Cards", () => {
  it("renders responsive mobile cost center cards alongside desktop matrix table", () => {
    assert.doesNotMatch(source, /grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-4\s+gap-4/);
    assert.match(source, /Cost Center Spending vs Allocation|Budget Allocations/i);
    assert.match(source, /<table/);
  });

  it("displays allocation, disbursed spend, committed, and utilization indicators", () => {
    assert.match(source, /Allocated/i);
    assert.match(source, /Spent/i);
    assert.match(source, /Committed|Pending/i);
    assert.match(source, /Used/i);
  });

  it("uses CfButton for budget CTAs and CfFilterPill for chart sub-tabs", () => {
    assert.match(source, /<CfButton[\s\S]*btn-set-budget-total/);
    assert.match(source, /<CfButton[\s\S]*btn-manage-budget-categories/);
    assert.match(source, /<CfFilterPill[\s\S]*Spending/);
  });
});
