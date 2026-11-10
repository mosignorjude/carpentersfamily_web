import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-tickets.tsx", import.meta.url),
  "utf8",
);

describe("TabTickets Prototype Tier Cards & 2-Line Ledger Integration", () => {
  it("renders responsive 3-column tier cards across viewports with no desktop table", () => {
    assert.match(source, /grid\s+grid-cols-1\s+md:grid-cols-2\s+lg:grid-cols-3/);
    assert.doesNotMatch(source, /<table\b/);
    assert.match(source, /Ticket Tiers &amp; Capacity Mix|Ticket Tiers & Capacity Mix/i);
  });

  it("features single primary Record Ticket Sale button and omits per-tier Sales (N) buttons", () => {
    assert.match(source, /id="btn-record-ticket-sale"/);
    assert.match(source, /Record Ticket Sale/);
    assert.doesNotMatch(source, />\s*Sales\s*\(/i);
    assert.doesNotMatch(source, /<button[^>]*>Record Sale<\/button>/i);
  });

  it("preserves Add, Edit, and Retire tier modal triggers and button IDs", () => {
    assert.match(source, /id="btn-add-ticket-tier"/);
    assert.match(source, /id="btn-create-tier-empty"/);
    assert.match(source, /btn-edit-tier-/);
    assert.match(source, /btn-retire-tier-/);
    assert.match(source, /onOpenEditTierModal/);
    assert.match(source, /onOpenRetireTierModal/);
  });

  it("embeds EventDomainLedger for ticket sales 2-line cards", () => {
    assert.match(source, /<EventDomainLedger/);
    assert.match(source, /domain="tickets"/);
  });
});
