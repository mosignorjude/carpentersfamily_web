import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEventFinanceNoticeUrl,
  normalizeEventFinanceTab,
} from "../src/lib/event-finance-tab.mjs";

const actionsSource = readFileSync(
  new URL("../src/app/actions.ts", import.meta.url),
  "utf8",
);
const dashboardSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/event-dashboard-view.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("normalizeEventFinanceTab accepts only the dashboard tab allowlist", () => {
  for (const tab of [
    "overview",
    "tickets",
    "expenses",
    "budget",
    "revenue",
    "reports",
    "team_roles",
    "audit_log",
  ]) {
    assert.equal(normalizeEventFinanceTab(tab), tab);
  }

  assert.equal(normalizeEventFinanceTab(" EXPENSES "), "expenses");
  assert.equal(normalizeEventFinanceTab("Audit_Log"), "audit_log");

  for (const value of [
    null,
    undefined,
    "",
    "   ",
    "settings",
    "expenses;drop",
    "<script>",
    "../../admin",
    42,
  ]) {
    assert.equal(
      normalizeEventFinanceTab(value),
      null,
      `${String(value)} must not be accepted as a tab`,
    );
  }
});

test("finance notice URL keeps a valid return tab and omits unknown ones", () => {
  assert.equal(
    buildEventFinanceNoticeUrl("evt-1", "transaction-recorded", "expenses"),
    "/events/evt-1/dashboard?notice=transaction-recorded&tab=expenses",
  );
  assert.equal(
    buildEventFinanceNoticeUrl("evt-1", "transaction-recorded"),
    "/events/evt-1/dashboard?notice=transaction-recorded",
  );
  assert.equal(
    buildEventFinanceNoticeUrl("evt-1", "denied", "bogus"),
    "/events/evt-1/dashboard?notice=denied",
  );
  assert.equal(
    buildEventFinanceNoticeUrl("evt/../1", "denied", "tickets"),
    "/events/evt%2F..%2F1/dashboard?notice=denied&tab=tickets",
  );
});

test("finance actions read return_tab and forward it to every dashboard redirect", () => {
  const actionNames = [
    "recordEventFinancialTransactionAction",
    "voidEventFinancialTransactionAction",
    "recordEventTicketSaleAction",
    "refundEventTicketSaleAction",
  ];

  for (const name of actionNames) {
    const start = actionsSource.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);

    const nextAction = actionsSource.indexOf(
      "export async function",
      start + 1,
    );
    const body = actionsSource.slice(
      start,
      nextAction === -1 ? undefined : nextAction,
    );

    assert.match(
      body,
      /const returnTab = normalizeEventFinanceTab\(formData\.get\("return_tab"\)\);/,
      `${name} must normalize the submitted return_tab`,
    );

    const redirectCalls = body.match(/eventFinanceNoticeUrl\(/g) ?? [];
    const forwardedCalls =
      body.match(
        /eventFinanceNoticeUrl\((?:[^()]|\([^()]*\))*,\s*returnTab\)/g,
      ) ?? [];

    assert.ok(redirectCalls.length > 0, `${name} must redirect with a notice`);
    assert.equal(
      forwardedCalls.length,
      redirectCalls.length,
      `${name} must forward returnTab on every finance notice redirect`,
    );
  }
});

test("dashboard finance forms submit the active tab as return_tab", () => {
  const submissions = dashboardSource.match(
    /fd\.set\("return_tab", activeTab\);/g,
  );

  assert.equal(
    submissions?.length ?? 0,
    3,
    "ticket sale, transaction, and void/refund forms must each submit the active tab",
  );
});
