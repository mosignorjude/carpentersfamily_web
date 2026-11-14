import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const viewSource = readFileSync(
  new URL("../src/components/finances/finances-page-view.tsx", import.meta.url),
  "utf8"
);
const ledgerSource = readFileSync(
  new URL("../src/components/finances/club-transaction-ledger.tsx", import.meta.url),
  "utf8"
);
const eventLedgerSource = readFileSync(
  new URL("../src/components/finances/event-ledger-section.tsx", import.meta.url),
  "utf8"
);

describe("Task 5: /finances 3-tab workspace, hero actions, mobile EventLedgerSection & payment_method", () => {
  it("renders accessible 3-tab workspace with Club Ledger, Event Cash Posts, and officer Treasury Setup & Audit", () => {
    assert.match(viewSource, /role="tablist"/);
    assert.match(viewSource, /role="tab"/);
    assert.match(viewSource, /Club Ledger/);
    assert.match(viewSource, /Event Cash Posts/);
    assert.match(viewSource, /Treasury Setup &amp; Audit|Treasury Setup & Audit/);
    assert.match(viewSource, /activeTab === "ledger"/);
    assert.match(viewSource, /activeTab === "events"/);
    assert.match(viewSource, /activeTab === "setup"/);
  });

  it("places officer quick actions directly in the hero action bar", () => {
    const heroEnd = viewSource.indexOf("{isDownloadReportOpen &&");
    assert.ok(heroEnd !== -1, "hero section boundary must exist");
    const heroSection = viewSource.slice(0, heroEnd);
    assert.match(heroSection, /id="officer-record-income-btn"/);
    assert.match(heroSection, /id="officer-record-expense-btn"/);
    assert.match(heroSection, /id="officer-manage-categories-btn"/);
    assert.match(heroSection, /Record Income/);
    assert.match(heroSection, /Record Expense/);
    assert.match(heroSection, /Manage Categories/);
  });

  it("houses Treasury Setup, AiSummaryPanel, Open AI Reports Centre link, and OfficerAuditHistory in Tab 3 (setup)", () => {
    const setupStart = viewSource.indexOf('activeTab === "setup"');
    assert.ok(setupStart !== -1, "setup tab block must exist");
    const setupSection = viewSource.slice(setupStart);
    assert.match(setupSection, /<ClubBankSettingsCard/);
    assert.match(setupSection, /<OpeningBalanceEntryCard/);
    assert.match(setupSection, /<AiSummaryPanel/);
    assert.match(setupSection, /Open AI Reports Centre/);
    assert.match(setupSection, /href="\/officers\/reports"/);
    assert.match(setupSection, /<OfficerAuditHistory/);
  });

  it("renders payment_method badges and 44px filter pills in ClubTransactionLedger", () => {
    assert.match(ledgerSource, /payment_method/);
    assert.match(ledgerSource, /Bank Transfer/);
    assert.match(ledgerSource, /Cash/);
    assert.match(ledgerSource, /filterType === "all"[\s\S]*min-h-\[44px\]/);
  });

  it("adds responsive mobile cards alongside desktop table in EventLedgerSection", () => {
    assert.match(eventLedgerSource, /md:hidden\s+divide-y/);
    assert.match(eventLedgerSource, /hidden\s+md:block/);
    assert.match(eventLedgerSource, /<table[^>]*w-full/);
  });
});
