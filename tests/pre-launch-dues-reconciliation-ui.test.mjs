import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PRE_LAUNCH_MONTH_SHORT_LABELS,
  STATUTORY_MONTHLY_DUES_NGN,
  VALID_PRE_LAUNCH_MONTHS,
  formatReconciliationTally,
  selectAllUnclearedMonths,
  toggleReconciliationMonth,
} from "../src/lib/pre-launch-reconciliation.mjs";

const reconciliationCardPath = new URL(
  "../src/components/dues/pre-launch-dues-reconciliation-card.tsx",
  import.meta.url,
);
const duesPagePath = new URL(
  "../src/app/(member)/dues/page.tsx",
  import.meta.url,
);
const duesViewPath = new URL(
  "../src/components/dues/dues-page-view.tsx",
  import.meta.url,
);

describe("Pre-Launch Dues Reconciliation State and Helper Logic", () => {
  it("defines short labels for all 8 pre-launch months from Feb to Sep", () => {
    assert.deepEqual(PRE_LAUNCH_MONTH_SHORT_LABELS, {
      "2026-02-01": "Feb",
      "2026-03-01": "Mar",
      "2026-04-01": "Apr",
      "2026-05-01": "May",
      "2026-06-01": "Jun",
      "2026-07-01": "Jul",
      "2026-08-01": "Aug",
      "2026-09-01": "Sep",
    });
  });

  it("toggles unselected month to selected and keeps chronological ordering", () => {
    let selected = [];
    selected = toggleReconciliationMonth(selected, "2026-05-01", []);
    assert.deepEqual(selected, ["2026-05-01"]);

    selected = toggleReconciliationMonth(selected, "2026-02-01", []);
    assert.deepEqual(selected, ["2026-02-01", "2026-05-01"]);

    selected = toggleReconciliationMonth(selected, "2026-09-01", []);
    assert.deepEqual(selected, ["2026-02-01", "2026-05-01", "2026-09-01"]);
  });

  it("toggles selected month to unselected", () => {
    let selected = ["2026-02-01", "2026-05-01", "2026-09-01"];
    selected = toggleReconciliationMonth(selected, "2026-05-01", []);
    assert.deepEqual(selected, ["2026-02-01", "2026-09-01"]);

    selected = toggleReconciliationMonth(selected, "2026-02-01", []);
    assert.deepEqual(selected, ["2026-09-01"]);

    selected = toggleReconciliationMonth(selected, "2026-09-01", []);
    assert.deepEqual(selected, []);
  });

  it("refuses to toggle already cleared months", () => {
    const cleared = ["2026-02-01", "2026-03-01"];
    let selected = ["2026-04-01"];

    // Attempting to toggle an already cleared month returns unchanged selection
    selected = toggleReconciliationMonth(selected, "2026-02-01", cleared);
    assert.deepEqual(selected, ["2026-04-01"]);

    selected = toggleReconciliationMonth(selected, "2026-03-01", cleared);
    assert.deepEqual(selected, ["2026-04-01"]);
  });

  it("selectAllUnclearedMonths returns all pre-launch months not in cleared list", () => {
    // When none are cleared, returns all 8 months
    assert.deepEqual(selectAllUnclearedMonths([]), [...VALID_PRE_LAUNCH_MONTHS]);

    // When Feb and Mar are cleared, returns Apr through Sep
    const cleared = ["2026-02-01", "2026-03-01"];
    const uncleared = selectAllUnclearedMonths(cleared);
    assert.deepEqual(uncleared, [
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);

    // When all are cleared, returns empty array
    assert.deepEqual(selectAllUnclearedMonths(VALID_PRE_LAUNCH_MONTHS), []);
  });

  it("formatReconciliationTally computes accurate count, total, and formatted label", () => {
    const zero = formatReconciliationTally(0);
    assert.equal(zero.count, 0);
    assert.equal(zero.amount, 0);
    assert.equal(zero.label, "0 months selected · ₦0");

    const one = formatReconciliationTally(1);
    assert.equal(one.count, 1);
    assert.equal(one.amount, 5000);
    assert.equal(one.label, "1 month selected · ₦5,000");

    const two = formatReconciliationTally(2);
    assert.equal(two.count, 2);
    assert.equal(two.amount, 10000);
    assert.equal(two.label, "2 months selected · ₦10,000");

    const eight = formatReconciliationTally(8);
    assert.equal(eight.count, 8);
    assert.equal(eight.amount, 40000);
    assert.equal(eight.label, "8 months selected · ₦40,000");
  });
});

describe("PreLaunchDuesReconciliationCard component requirements", () => {
  it("file exists at src/components/dues/pre-launch-dues-reconciliation-card.tsx", () => {
    assert.ok(
      existsSync(reconciliationCardPath),
      "src/components/dues/pre-launch-dues-reconciliation-card.tsx must exist",
    );
  });

  it("is marked as a client component with use client directive", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(source, /^"use client";/, "Must start with 'use client'");
  });

  it("exports ReconciliationMember and PreLaunchDuesReconciliationCardProps types", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(source, /export\s+(?:type|interface)\s+ReconciliationMember/);
    assert.match(
      source,
      /export\s+(?:type|interface)\s+PreLaunchDuesReconciliationCardProps/,
    );
    assert.match(
      source,
      /export\s+function\s+PreLaunchDuesReconciliationCard/,
    );
  });

  it("displays governance header with title and pre-launch non-double-counting explanation", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /Pre-Launch Dues Reconciliation Workspace \(Feb[–-]Sep 2026\)/,
      "Must have the exact governance title",
    );
    assert.match(
      source,
      /Reconcile\s+historical\s+dues\s+collected\s+before\s+October\s+2026\s+launch/i,
      "Must contain pre-launch scope explanation",
    );
    assert.match(
      source,
      /without\s+inflating\s+verified\s+bank\s+cash\s+balance/i,
      "Must emphasize non-double-counting with cash balance",
    );
  });

  it("renders read-only advisory when isAdmin is false", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /if\s*\(\s*!isAdmin\s*\)/,
      "Must check !isAdmin to restrict management",
    );
    assert.match(
      source,
      /restricted to Club Administrators|only authorized administrators/i,
      "Must display administrative restriction advisory",
    );
  });

  it("renders empty state message when members array is empty", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /No active members requiring pre-launch reconciliation\./,
      "Must render the designated empty state message",
    );
  });

  it("renders monthly rate indicator (₦5,000 / month)", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /₦5,000\s*\/\s*month/i,
      "Must indicate ₦5,000 / month statutory rate",
    );
  });

  it("renders 8 distinct month badges per member", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /VALID_PRE_LAUNCH_MONTHS/,
      "Must iterate over VALID_PRE_LAUNCH_MONTHS",
    );
    assert.match(
      source,
      /Feb|Mar|Apr|May|Jun|Jul|Aug|Sep/,
      "Must display month labels",
    );
  });

  it("renders disabled/locked badges with tooltip for already cleared months", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /clearedMonths(?:\.includes|\.has)/,
      "Must check if month is in clearedMonths",
    );
    assert.match(
      source,
      /Already reconciled\/cleared/,
      "Must provide 'Already reconciled/cleared' tooltip or title",
    );
  });

  it("provides row helper buttons: 'Select All Unpaid' and 'Clear'", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /Select All Unpaid/i,
      "Must provide 'Select All Unpaid' helper button",
    );
    assert.match(
      source,
      /Clear|Reset/i,
      "Must provide 'Clear' or 'Reset' helper button",
    );
  });

  it("submits to backfillMemberHistoricalDuesAction with required hidden fields", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /backfillMemberHistoricalDuesAction/,
      "Form must submit to backfillMemberHistoricalDuesAction",
    );
    assert.match(
      source,
      /<input[^>]*name=["']member_id["']/i,
      "Must include hidden input for member_id",
    );
    assert.match(
      source,
      /<input[^>]*name=["']covered_months["']/i,
      "Must include input(s) for covered_months",
    );
    assert.match(
      source,
      /<input[^>]*name=["']notes["']/i,
      "Must include input for notes",
    );
    assert.match(
      source,
      /Pre-launch dues reconciliation \(Feb-Sep 2026\)/,
      "Must set default notes for pre-launch dues reconciliation",
    );
  });

  it("renders submit button 'Reconcile Dues' disabled when 0 months are selected", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(
      source,
      /Reconcile Dues/,
      "Submit button must read 'Reconcile Dues'",
    );
    assert.match(
      source,
      /disabled=\{[^{}]*selectedMonths\.length === 0[^{}]*\}/,
      "Submit button must be disabled when 0 months are selected",
    );
  });

  it("uses Warm Editorial styling tokens", () => {
    const source = readFileSync(reconciliationCardPath, "utf8");
    assert.match(source, /#174C37/, "Must include forest green #174C37");
    assert.match(source, /#FAF6F0/, "Must include warm canvas #FAF6F0");
    assert.match(source, /#3D291F/, "Must include bronze text #3D291F");
    assert.match(source, /#D6A23A/, "Must include gold accent #D6A23A");
    assert.match(source, /#E5DDD3/, "Must include dark bronze border #E5DDD3");
  });
});

describe("Page and View Wiring verification for /dues", () => {
  it("src/app/(member)/dues/page.tsx queries active members, admin exclusions, and pre-launch dispositions", () => {
    const source = readFileSync(duesPagePath, "utf8");
    assert.match(
      source,
      /\.from\(["']dues_month_dispositions["']\)/,
      "dues/page.tsx must query dues_month_dispositions",
    );
    assert.match(
      source,
      /2026-02-01[\s\S]*?2026-09-01/,
      "dues/page.tsx must bound pre-launch disposition query to 2026-02-01 through 2026-09-01",
    );
    assert.match(
      source,
      /reconciliationMembers/,
      "dues/page.tsx must compute reconciliationMembers",
    );
    assert.match(
      source,
      /<DuesPageView[\s\S]*?reconciliationMembers=\{reconciliationMembers\}/,
      "DuesPageView must receive reconciliationMembers prop",
    );
  });

  it("src/components/dues/dues-page-view.tsx imports and renders PreLaunchDuesReconciliationCard", () => {
    const source = readFileSync(duesViewPath, "utf8");
    assert.match(
      source,
      /PreLaunchDuesReconciliationCard/,
      "dues-page-view.tsx must import and render PreLaunchDuesReconciliationCard",
    );
    assert.match(
      source,
      /<PreLaunchDuesReconciliationCard[\s\S]*?members=\{reconciliationMembers/,
      "PreLaunchDuesReconciliationCard must receive members prop",
    );
  });
});
