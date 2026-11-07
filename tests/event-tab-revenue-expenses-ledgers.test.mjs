import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const revSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-revenue.tsx", import.meta.url),
  "utf8"
);
const expSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);

describe("TabRevenue & TabExpenses Single-Card Matrices & Ledgers", () => {
  it("consolidates revenue streams into a single matrix card with single header record button", () => {
    assert.doesNotMatch(revSource, /grid\s+grid-cols-1\s+lg:grid-cols-2\s+gap-5/);
    assert.match(revSource, /Revenue Streams/i);
    assert.match(revSource, /Record Revenue/);
    assert.match(revSource, /<EventDomainLedger/);
    assert.match(revSource, /domain="revenue"/);
  });

  it("consolidates cost centers into a single matrix card with single header disburse button", () => {
    assert.doesNotMatch(expSource, /grid\s+grid-cols-1\s+lg:grid-cols-2\s+gap-5/);
    assert.match(expSource, /Expenses by Category/i);
    assert.match(expSource, /Record Expense/);
    assert.match(expSource, /<EventDomainLedger/);
    assert.match(expSource, /domain="expenses"/);
  });

  it("does not render per-row recording buttons in revenue or expense matrices", () => {
    assert.doesNotMatch(revSource, /<button[^>]*>Record<\/button>/i);
    assert.doesNotMatch(expSource, /<button[^>]*>Disburse<\/button>/i);
  });
});
