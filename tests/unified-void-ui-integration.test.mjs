import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("ledger and inspection drawer wire to unified VoidRecordModal and action", () => {
  const ledger = readFileSync(
    "src/components/events/dashboard/event-domain-ledger.tsx",
    "utf8"
  );
  const drawer = readFileSync(
    "src/components/events/dashboard/voucher-inspection-drawer.tsx",
    "utf8"
  );
  const view = readFileSync(
    "src/components/events/dashboard/event-dashboard-view.tsx",
    "utf8"
  );

  assert.match(view, /VoidRecordModal/);
  assert.match(view, /voidRecordAction/);
  assert.match(drawer, /onVoidRecord|onVoid/);
  assert.doesNotMatch(drawer, /Reject \/ Reverse|Reverse\s*\/\s*Void/i);
  assert.match(ledger, /Void/);
  assert.doesNotMatch(ledger, /Reversed\s*\/\s*Voided/i);
  const tabTickets = readFileSync(
    "src/components/events/dashboard/tab-tickets.tsx",
    "utf8"
  );
  assert.doesNotMatch(tabTickets, /reverse\/void/i);
});
