import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const DASHBOARD_DIR = "src/components/events/dashboard";

function getFiles(dir, filter = (f) => f.endsWith(".tsx")) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getFiles(fullPath, filter));
    } else if (filter(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

test("CSP Invariant: Zero inline style attributes in any event dashboard TSX file", () => {
  const tsxFiles = getFiles(DASHBOARD_DIR);
  assert.ok(tsxFiles.length > 5, "Expected dashboard TSX files to be found");

  const filesWithInlineStyle = [];
  for (const filePath of tsxFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    // Look for style={{...}}
    if (content.includes("style={{")) {
      filesWithInlineStyle.push(filePath);
    }
  }

  assert.deepEqual(
    filesWithInlineStyle,
    [],
    `Found CSP-violating style={{...}} in: ${filesWithInlineStyle.join(", ")}`,
  );
});

test("Color Contrast Invariant: Gold #D6A23A is never used as text on white/cream surfaces", () => {
  const checkFiles = [
    "src/components/events/dashboard/tab-expenses.tsx",
    "src/components/events/dashboard/tab-budget-allocations.tsx",
    "src/components/events/dashboard/tab-revenue.tsx",
    "src/components/events/dashboard/tab-reports.tsx",
  ];

  for (const file of checkFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      content,
      /text-\[#D6A23A\]/,
      `File ${file} must not use low-contrast text-[#D6A23A] on light surfaces`,
    );
  }
});

test("Modal Hygiene & Dialog Semantics: All active modals declare role=dialog and aria-modal=true", () => {
  const modalFiles = [
    "src/components/events/dashboard/modals/download-report-modal.tsx",
    "src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx",
    "src/components/events/dashboard/modals/event-category-management-modal.tsx",
    "src/components/events/dashboard/modals/event-ticket-tier-modal.tsx",
    "src/components/events/dashboard/modals/record-transaction-modal.tsx",
    "src/components/events/dashboard/modals/transaction-detail-modal.tsx",
    "src/components/events/dashboard/modals/void-transaction-modal.tsx",
    "src/components/events/dashboard/voucher-inspection-drawer.tsx",
  ];

  for (const file of modalFiles) {
    const content = fs.readFileSync(file, "utf8");
    assert.match(
      content,
      /role="dialog"/,
      `Modal ${file} must declare role="dialog"`,
    );
    assert.match(
      content,
      /aria-modal="true"/,
      `Modal ${file} must declare aria-modal="true"`,
    );
    assert.match(
      content,
      /aria-labelledby=/,
      `Modal ${file} must declare aria-labelledby for screen readers`,
    );
    assert.match(
      content,
      /max-h-/,
      `Modal ${file} must declare max-h constraint for responsive viewports`,
    );
  }
});

test("Mobile Shell Semantics: Mobile tab buttons include role=tab, aria-selected, and focus-visible rings", () => {
  const content = fs.readFileSync(
    "src/components/events/dashboard/event-dashboard-view.tsx",
    "utf8",
  );

  const overviewBtnIdx = content.indexOf('id="tab-btn-overview"');
  assert.ok(overviewBtnIdx !== -1, "Overview tab button must exist");
  const buttonChunk = content.slice(
    Math.max(0, overviewBtnIdx - 500),
    overviewBtnIdx + 500,
  );

  assert.match(
    buttonChunk,
    /role="tab"/,
    "Overview tab button must have role=tab",
  );
  assert.match(
    buttonChunk,
    /aria-selected=\{activeTab === "overview"\}/,
    "Overview tab button must declare aria-selected",
  );
  assert.match(
    content,
    /focus-visible:ring-2/,
    "Mobile tab buttons must provide focus-visible rings for accessibility",
  );
  assert.match(
    content,
    /aria-haspopup="menu"/,
    "Mobile more tab must declare aria-haspopup=menu",
  );
  assert.match(
    content,
    /aria-expanded=\{isMoreOpen\}/,
    "Mobile more tab must declare aria-expanded state",
  );
});

test("Dead Code Invariant: Obsolete mock data file is removed", () => {
  assert.equal(
    fs.existsSync("src/components/events/dashboard/dashboard-mock-data.ts"),
    false,
    "dashboard/dashboard-mock-data.ts must be deleted",
  );
});
