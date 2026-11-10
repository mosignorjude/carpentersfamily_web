import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const domainLedger = readFileSync(
  new URL("../src/components/events/dashboard/event-domain-ledger.tsx", import.meta.url),
  "utf8"
);
const tabTickets = readFileSync(
  new URL("../src/components/events/dashboard/tab-tickets.tsx", import.meta.url),
  "utf8"
);
const tabRevenue = readFileSync(
  new URL("../src/components/events/dashboard/tab-revenue.tsx", import.meta.url),
  "utf8"
);
const tabExpenses = readFileSync(
  new URL("../src/components/events/dashboard/tab-expenses.tsx", import.meta.url),
  "utf8"
);
const tabAuditLog = readFileSync(
  new URL("../src/components/events/dashboard/tab-audit-log.tsx", import.meta.url),
  "utf8"
);
const clubLedger = readFileSync(
  new URL("../src/components/finances/club-transaction-ledger.tsx", import.meta.url),
  "utf8"
);
const attendanceRoster = readFileSync(
  new URL("../src/components/events/attendance/attendance-roster-table.tsx", import.meta.url),
  "utf8"
);

describe("Phase 3: Table-to-Card Responsive Transformation & Tap Floors", () => {
  it("event-domain-ledger uses shared 2-line LedgerTransactionCard across mobile and desktop with >=44px tap targets", () => {
    assert.match(domainLedger, /LedgerTransactionCard/);
    assert.doesNotMatch(domainLedger, /hidden\s+md:block/);
    assert.doesNotMatch(domainLedger, /<table\b/);
    assert.match(domainLedger, /min-h-\[44px\]/);
  });

  it("tab-tickets renders responsive tier cards and 2-line ledger records without tables", () => {
    assert.match(tabTickets, /grid-cols-1\s+md:grid-cols-2\s+lg:grid-cols-3/);
    assert.doesNotMatch(tabTickets, /<table\b/);
    assert.match(tabTickets, /<EventDomainLedger[\s\S]*domain="tickets"/);
    assert.match(tabTickets, /btn-edit-tier-/);
  });

  it("tab-revenue implements mobile stream cards and desktop table", () => {
    assert.match(tabRevenue, /sm:hidden\s+space-y-3/);
    assert.match(tabRevenue, /hidden\s+sm:block/);
    assert.match(tabRevenue, /<TableScroll[^>]*label="Revenue streams by source"/);
  });

  it("tab-expenses renders Expenses by Category before Expenses Ledger with mobile helper text", () => {
    const ledgerIdx = tabExpenses.indexOf('title="Expenses Ledger"');
    const matrixIdx = tabExpenses.indexOf("Expenses by Category");
    assert.ok(ledgerIdx !== -1 && matrixIdx !== -1);
    assert.ok(
      matrixIdx < ledgerIdx,
      "Expenses by Category must appear before Expenses Ledger"
    );
    assert.doesNotMatch(tabExpenses, /hidden\s+sm:block/);
    assert.match(
      tabExpenses,
      /Swipe left or right to scroll the cost center table/
    );
    assert.match(tabExpenses, /<TableScroll[^>]*label="Expenses by cost center"/);
  });

  it("tab-audit-log implements mobile journal cards and desktop table", () => {
    assert.match(tabAuditLog, /md:hidden\s+divide-y/);
    assert.match(tabAuditLog, /hidden\s+md:block/);
    assert.match(tabAuditLog, /<TableScroll[^>]*label="Audit log entries"/);
    assert.match(tabAuditLog, /min-h-\[38px\]/);
  });

  it("club-transaction-ledger implements mobile transaction cards and desktop table", () => {
    assert.match(clubLedger, /md:hidden\s+divide-y/);
    assert.match(clubLedger, /hidden\s+md:block/);
    assert.match(clubLedger, /<table[^>]*w-full/);
    assert.match(clubLedger, /min-h-\[38px\]/);
  });

  it("attendance-roster-table implements mobile attendance cards and desktop table", () => {
    assert.match(attendanceRoster, /sm:hidden\s+divide-y/);
    assert.match(attendanceRoster, /hidden\s+sm:block/);
    assert.match(attendanceRoster, /min-h-\[38px\]/);
  });
});
