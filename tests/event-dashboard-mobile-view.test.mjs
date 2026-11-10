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

  it("renders unified spotlight header actions without duplicating mobile quick actions", () => {
    assert.match(
      viewSource,
      /Download Report/,
      "Header must render Download Report action",
    );
    assert.match(
      viewSource,
      /Record Entry/,
      "Header must render + Record Entry action",
    );
    assert.doesNotMatch(
      viewSource,
      />\s*Quick Actions\s*</,
      "Header must not duplicate a separate Quick Actions heading",
    );
  });

  it("renders a single sticky 5-tab bar inside TableScroll with Swipe for more sections cue", () => {
    assert.match(viewSource, /<TableScroll[^>]*label="Dashboard sections"/);
    assert.match(viewSource, /id=\{`tab-btn-\$\{tab\.id\}`\}/);
    assert.match(viewSource, /"overview"/);
    assert.match(viewSource, /"tickets"/);
    assert.match(viewSource, /"budget"/);
    assert.match(viewSource, /"ledger"/);
    assert.match(viewSource, /"statement"/);
    assert.match(viewSource, /Swipe right for more sections/);
    assert.doesNotMatch(
      viewSource,
      /sm:hidden[\s\S]*tab-btn-overview/,
      "Dashboard must not render a duplicate sm:hidden tab bar",
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
