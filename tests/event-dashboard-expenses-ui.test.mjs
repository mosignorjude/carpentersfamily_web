import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);

describe("TabExpenses layout and overflow protection", () => {
  it("wraps the expenses table in the TableScroll region component", () => {
    assert.match(
      source,
      /<TableScroll[^>]*label="Expenses by cost center"/,
      "Expenses table must be wrapped in TableScroll, which supplies the table-scroll-region treatment"
    );
  });

  it("applies responsive wrapping to header action and stat cards", () => {
    assert.match(
      source,
      /flex-col lg:flex-row/,
      "Header must wrap gracefully on tablet viewports using lg:flex-row instead of md:flex-row"
    );
  });

  it("places Expenses by Category before Expenses Ledger and keeps the matrix tabular on mobile with helper text", () => {
    const ledgerIdx = source.indexOf('title="Expenses Ledger"');
    const matrixIdx = source.indexOf("Expenses by Category");
    assert.ok(ledgerIdx > -1 && matrixIdx > -1);
    assert.ok(
      matrixIdx < ledgerIdx,
      "Expenses by Category must come before Expenses Ledger"
    );
    assert.match(
      source,
      /Swipe left or right to scroll the cost center table/,
      "Must display horizontal scroll helper text on mobile"
    );
    assert.match(
      source,
      /<table[^>]*min-w-\[680px\]/,
      "Cost centers table must specify min-w-[680px] for horizontal scrolling on mobile"
    );
  });
});
