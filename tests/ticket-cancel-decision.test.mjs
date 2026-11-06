import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DRAWER = readFileSync(
  "src/components/events/dashboard/voucher-inspection-drawer.tsx",
  "utf8",
);
const LEDGER = readFileSync(
  "src/components/events/dashboard/event-domain-ledger.tsx",
  "utf8",
);
const ACTIONS = readFileSync(
  "src/app/(member)/events/[eventId]/dashboard/actions.ts",
  "utf8",
);
const TYPES = readFileSync(
  "src/components/events/dashboard/dashboard-types.ts",
  "utf8",
);

test("an officer can cancel a guest order with a reason", () => {
  assert.match(ACTIONS, /"approved" \| "rejected" \| "cancelled"/);
  assert.match(
    ACTIONS,
    /params.decision === "rejected" \|\| params.decision === "cancelled"/,
  );
  assert.match(DRAWER, /decision: "cancelled"/);
  assert.match(DRAWER, /handleCancel/);
});

test("cancel is offered for ticket sales only, and only before review", () => {
  assert.match(DRAWER, /isTicketSale && isPending/);
  assert.doesNotMatch(
    DRAWER,
    /verifyEventFinancialTransactionAction\(\{[^}]*decision: "cancelled"/,
  );
});

test("the ledger counts a cancelled row as not counted", () => {
  assert.match(TYPES, /"recorded" \| "approved" \| "rejected" \| "cancelled"/);
  assert.match(LEDGER, /const isNotCounted = isRejected \|\| isCancelled/);
  assert.match(LEDGER, /statusFilter === "cancelled"/);
  assert.match(LEDGER, /cancelledCount/);
});

test("the dashboard no longer maps every refunded sale to voided by reflex", () => {
  const dashboard = readFileSync(
    "src/app/(member)/events/[eventId]/dashboard/page.tsx",
    "utf8",
  );
  assert.match(dashboard, /"cancelled"/);
  assert.doesNotMatch(
    dashboard,
    /verificationStatus: s\.refunded_at\n\s*\?\s*"rejected"/,
  );
});
