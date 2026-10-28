import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const css = readFileSync(
  new URL("../src/app/globals.css", import.meta.url),
  "utf8",
);
const revenue = readFileSync(
  new URL("../src/components/events/dashboard/tab-revenue.tsx", import.meta.url),
  "utf8",
);
const ledger = readFileSync(
  new URL("../src/components/ui/table-scroll.tsx", import.meta.url),
  "utf8",
);

function offendingSelectors(source) {
  const found = [];
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/overflow-x:\s*clip/.test(match[2])) {
      found.push(match[1].trim().replace(/\s+/g, " "));
    }
  }
  return found;
}

describe("event finance horizontal overflow", () => {
  it("never clips overflow on an event-finance selector", () => {
    const offenders = offendingSelectors(css).filter((selector) =>
      selector.includes("event-finance"),
    );
    assert.deepEqual(offenders, [], `overflow-x: clip hides table columns: ${offenders.join(" | ")}`);
  });

  it("declares a focusable table scroll region class", () => {
    assert.match(css, /\.table-scroll-region\s*\{[^}]*overflow-x:\s*auto/);
    assert.match(css, /\.table-scroll-region\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.table-scroll-region:focus-visible/);
  });

  it("gives the region a role and a keyboard stop", () => {
    assert.match(ledger, /role="region"/);
    assert.match(ledger, /tabIndex=\{0\}/);
    assert.match(ledger, /aria-label=\{label\}/);
  });

  it("routes the revenue table through TableScroll", () => {
    assert.match(revenue, /<TableScroll[^>]*label="Revenue streams by source"/);
  });
});
