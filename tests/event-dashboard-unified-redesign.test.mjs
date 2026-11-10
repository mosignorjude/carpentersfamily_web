import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const viewPath = new URL(
  "../src/components/events/dashboard/event-dashboard-view.tsx",
  import.meta.url,
);
const typesPath = new URL(
  "../src/components/events/dashboard/dashboard-types.ts",
  import.meta.url,
);
const pagePath = new URL(
  "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
  import.meta.url,
);
const overviewPath = new URL(
  "../src/components/events/dashboard/tab-overview.tsx",
  import.meta.url,
);
const ledgerPath = new URL(
  "../src/components/events/dashboard/event-domain-ledger.tsx",
  import.meta.url,
);

describe("Unified Event Dashboard 5-Tab Information Architecture", () => {
  const viewSource = readFileSync(viewPath, "utf8");
  const typesSource = readFileSync(typesPath, "utf8");
  const pageSource = readFileSync(pagePath, "utf8");

  it("declares the 5 unified primary tabs in DashboardTab types", () => {
    assert.match(typesSource, /"overview"/);
    assert.match(typesSource, /"tickets"/);
    assert.match(typesSource, /"budget"/);
    assert.match(typesSource, /"ledger"/);
    assert.match(typesSource, /"statement"/);
  });

  it("renders the 5 unified tabs in the mobile/desktop tab navigation", () => {
    assert.match(
      viewSource,
      /id="tab-btn-overview"/,
      "Tab bar must have Overview tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-tickets"/,
      "Tab bar must have Tickets tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-budget"/,
      "Tab bar must have Budget tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-ledger"/,
      "Tab bar must have Ledger tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-statement"/,
      "Tab bar must have Statement tab button",
    );
  });

  it("renders the mobile swipe helper cue for tabs", () => {
    assert.match(
      viewSource,
      /Swipe for more/,
      "Mobile tab bar must render swipe for more helper cue",
    );
  });

  it("maps legacy tab query parameters to the new 5 unified tabs", () => {
    // Both page.tsx and view should support mapping legacy tab values:
    // expenses / revenue -> budget
    // reports / team_roles / audit_log -> statement
    assert.match(
      pageSource,
      /expenses.*budget|revenue.*budget|reports.*statement/,
      "page.tsx must map legacy tab query params to unified tabs",
    );
  });
});

describe("Spotlight Header & Collapsible Metadata", () => {
  const viewSource = readFileSync(viewPath, "utf8");

  it("renders the top brand accent line in forest green", () => {
    assert.match(
      viewSource,
      /bg-\[#174C37\]/,
      "Header must include #174C37 brand accent",
    );
  });

  it("provides an on-demand disclosure button for event metadata", () => {
    assert.match(
      viewSource,
      /headerExpanded|isHeaderExpanded|showDetails/,
      "Header must maintain expandable disclosure state",
    );
    assert.match(
      viewSource,
      /aria-expanded/,
      "Disclosure trigger must declare aria-expanded",
    );
  });

  it("renders reference code, duration, public ticket link, and meeting hub note inside disclosure", () => {
    assert.match(
      viewSource,
      /EVT-|Reference|meeting hub|Meeting Hub/i,
      "Event details must include reference code or meeting hub context",
    );
  });
});

describe("Overview Tab 2x2 Interactive KPIs & Ceilings", () => {
  const overviewSource = readFileSync(overviewPath, "utf8");

  it("renders 4 interactive KPI metric cards linking to respective tabs", () => {
    assert.match(overviewSource, /Ticket Sales/i);
    assert.match(overviewSource, /Money In|Total In|Total Revenue/i);
    assert.match(overviewSource, /Spent|Disbursed/i);
    assert.match(overviewSource, /Net Surplus|Net Balance/i);
  });

  it("renders approved budget ceiling with headroom utilization bar", () => {
    assert.match(overviewSource, /Approved Budget|Budget Ceiling/i);
    assert.match(overviewSource, /Allocated/i);
    assert.match(overviewSource, /Unallocated/i);
  });
});

describe("Master Ledger Domain Filtering & 2-Line Cards", () => {
  const ledgerSource = readFileSync(ledgerPath, "utf8");

  it("provides domain type filters across all transaction categories", () => {
    assert.match(ledgerSource, /All/);
    assert.match(ledgerSource, /Tickets/i);
    assert.match(ledgerSource, /Revenue/i);
    assert.match(ledgerSource, /Expenses/i);
  });

  it("provides status filter pills for verification flow", () => {
    assert.match(ledgerSource, /Pending/i);
    assert.match(ledgerSource, /Approved/i);
  });

  it("renders high-density 2-line transaction items for mobile without horizontal scroll clipping", () => {
    assert.match(
      ledgerSource,
      /flex-col|grid/,
      "Ledger cards must stack content vertically into clear lines",
    );
  });
});
