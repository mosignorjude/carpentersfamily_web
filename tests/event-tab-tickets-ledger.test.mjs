import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-tickets.tsx", import.meta.url),
  "utf8"
);

describe("TabTickets Single-Card Matrix & Ledger Integration", () => {
  it("consolidates tiers into a single table matrix card instead of multi-card grid", () => {
    assert.doesNotMatch(source, /grid\s+grid-cols-1\s+sm:grid-cols-2\s+lg:grid-cols-\[repeat\(auto-fit,minmax\(280px,1fr\)\)\]/);
    assert.match(source, /Admission Tiers & Inventory Matrix/i);
    assert.match(source, /<table/);
  });

  it("features single primary Record Ticket Sale button in header and no row-level record sale buttons", () => {
    assert.match(source, /Record Ticket Sale/);
    assert.doesNotMatch(source, /<button[^>]*>Record Sale<\/button>/i);
  });

  it("limits tier row actions to Edit and Retire", () => {
    assert.match(source, /onOpenEditTierModal/);
    assert.match(source, /onOpenRetireTierModal/);
  });

  it("embeds EventDomainLedger for ticket sales", () => {
    assert.match(source, /<EventDomainLedger/);
    assert.match(source, /domain="tickets"/);
  });
});
