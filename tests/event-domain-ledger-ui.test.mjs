import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const ledgerSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/event-domain-ledger.tsx",
    import.meta.url,
  ),
  "utf8",
);

const cardPath = new URL(
  "../src/components/events/dashboard/ledger-transaction-card.tsx",
  import.meta.url,
);

describe("EventDomainLedger & LedgerTransactionCard UI Components", () => {
  it("enforces 20 items per page pagination constant", () => {
    assert.match(ledgerSource, /PAGE_SIZE\s*=\s*20/);
    assert.match(ledgerSource, /slice\(\s*startIndex,\s*endIndex\s*\)/);
  });

  it("renders status filter pills including All, Approved, Pending, and Reversed / Voided", () => {
    assert.match(ledgerSource, /Pending\s*\(/);
    assert.match(ledgerSource, /Approved\s*\(/);
    assert.match(ledgerSource, /Voided|Reversed/);
    assert.doesNotMatch(ledgerSource, /Pending Review/);
  });

  it("provides grouped category select filter and Reset action without desktop tables", () => {
    assert.match(ledgerSource, /<select[\s\S]*aria-label="Filter by category"/i);
    assert.match(ledgerSource, /All Categories & Tiers/);
    assert.match(ledgerSource, />\s*Reset\s*</);
    assert.doesNotMatch(ledgerSource, /<table\b/);
    assert.match(ledgerSource, /<LedgerTransactionCard/);
  });

  it("renders 2-line card structure with wrapped self-review notice and no Inspect label", () => {
    const cardSource = readFileSync(cardPath, "utf8");
    assert.match(cardSource, /export function LedgerTransactionCard/);
    assert.match(cardSource, /<button[\s\S]*min-h-\[44px\]/);
    assert.match(cardSource, /createdBy\s*===\s*currentUserId/);
    assert.match(cardSource, /Needs Another Officer's Review/i);
    assert.match(cardSource, /whitespace-normal/);
    assert.doesNotMatch(cardSource, />Inspect</);
    assert.match(cardSource, /"Pending"/);
    assert.doesNotMatch(cardSource, /Pending Review/);
  });
});
