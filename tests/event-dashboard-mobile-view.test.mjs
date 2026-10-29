import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const viewPath = new URL(
  "../src/components/events/dashboard/event-dashboard-view.tsx",
  import.meta.url,
);
const modalPath = new URL(
  "../src/components/events/dashboard/modals/download-report-modal.tsx",
  import.meta.url,
);
const apiRoutePath = new URL(
  "../src/app/api/events/[eventId]/finance-report/route.ts",
  import.meta.url,
);

describe("Event Dashboard Mobile & Desktop Layout", () => {
  const viewSource = readFileSync(viewPath, "utf8");

  it("renders a 2-column Quick Action grid on mobile with Download Report and Record Transaction", () => {
    assert.match(
      viewSource,
      /id="btn-download-report-mobile"/,
      "Mobile view must render Download Report quick action button",
    );
    assert.match(
      viewSource,
      /id="btn-record-transaction-mobile"/,
      "Mobile view must render Record Transaction quick action button",
    );
  });

  it("renders the 5-item mobile tab bar joined at the top of the content card", () => {
    assert.match(
      viewSource,
      /id="tab-btn-overview"/,
      "Mobile tab bar must have Overview tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-tickets"/,
      "Mobile tab bar must have Tickets tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-expenses"/,
      "Mobile tab bar must have Expense tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-revenue"/,
      "Mobile tab bar must have Revenue tab button",
    );
    assert.match(
      viewSource,
      /id="tab-btn-more"/,
      "Mobile tab bar must have 'more' tab dropdown button",
    );
  });

  it("renders the 'more' dropdown menu containing the remaining 4 sections", () => {
    assert.match(
      viewSource,
      /id="moreDropdown"/,
      "Mobile view must contain moreDropdown menu",
    );
    assert.match(
      viewSource,
      /\["budget",\s*"reports",\s*"team_roles",\s*"audit_log"\]/,
      "moreTabs must include budget, reports, team_roles, and audit_log",
    );
  });

  it("places both mobile and desktop tab bars directly inside the top of the content card, separated by a divider", () => {
    assert.match(
      viewSource,
      /<section className="[^"]*bg-white[^"]*rounded-\[20px\][^"]*relative">\s*<nav aria-label="Event Sections"/,
      "Content card must wrap tab nav at its top",
    );
    assert.match(
      viewSource,
      /border-b border-\[#E5DDD3\]"\s*\/>\s*<\/nav>/,
      "Tab nav must have a subtle horizontal divider before closing",
    );
  });
});

describe("DownloadReportModal Component", () => {
  it("exists and exports DownloadReportModal", () => {
    assert.ok(existsSync(modalPath), "download-report-modal.tsx must exist");
    const modalSource = readFileSync(modalPath, "utf8");
    assert.match(
      modalSource,
      /export function DownloadReportModal/,
      "Must export DownloadReportModal",
    );
  });

  it("provides options for both Full Audit Report (PDF) and Transaction Ledger (CSV)", () => {
    const modalSource = readFileSync(modalPath, "utf8");
    assert.match(
      modalSource,
      /Full Audit Report \(PDF\)/,
      "Modal must provide Full Audit Report (PDF) option",
    );
    assert.match(
      modalSource,
      /Transaction Ledger \(CSV\)/,
      "Modal must provide Transaction Ledger (CSV) option",
    );
    assert.match(
      modalSource,
      /format=pdf/,
      "Modal must trigger PDF download with format=pdf",
    );
  });
});

describe("Event Finance Report API Route", () => {
  it("supports format=pdf via createSimplePdf", () => {
    const routeSource = readFileSync(apiRoutePath, "utf8");
    assert.match(
      routeSource,
      /createSimplePdf/,
      "Route must import and use createSimplePdf",
    );
    assert.match(
      routeSource,
      /format === "pdf"/,
      "Route must check for format === 'pdf'",
    );
    assert.match(
      routeSource,
      /application\/pdf/,
      "Route must return Content-Type: application/pdf for PDF export",
    );
  });
});
