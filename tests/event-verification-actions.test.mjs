import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const actionsSource = readFileSync(
  new URL("../src/app/(member)/events/[eventId]/dashboard/actions.ts", import.meta.url),
  "utf8"
);
const typesSource = readFileSync(
  new URL("../src/components/events/dashboard/dashboard-types.ts", import.meta.url),
  "utf8"
);
const pageSource = readFileSync(
  new URL("../src/app/(member)/events/[eventId]/dashboard/page.tsx", import.meta.url),
  "utf8"
);

describe("Event Verification Server Actions & Types", () => {
  it("defines verificationStatus in DashboardTransaction", () => {
    assert.match(typesSource, /verificationStatus\??:\s*"recorded"\s*\|\s*"approved"\s*\|\s*"rejected"/);
    assert.match(typesSource, /createdBy\??:\s*string/);
  });

  it("exports verifyEventFinancialTransactionAction", () => {
    assert.match(actionsSource, /export\s+async\s+function\s+verifyEventFinancialTransactionAction/);
    assert.match(actionsSource, /rpc\("verify_event_financial_transaction"/);
    assert.match(actionsSource, /revalidatePath/);
  });

  it("exports verifyEventTicketSaleAction", () => {
    assert.match(actionsSource, /export\s+async\s+function\s+verifyEventTicketSaleAction/);
    assert.match(actionsSource, /rpc\("verify_event_ticket_sale"/);
    assert.match(actionsSource, /revalidatePath/);
  });

  it("maps verificationStatus and createdBy in page.tsx transactions", () => {
    assert.match(pageSource, /verificationStatus:[\s\S]*?t\.verification_status/);
    assert.match(pageSource, /verificationStatus:[\s\S]*?s\.verification_status/);
    assert.match(pageSource, /createdBy:\s*t\.created_by/);
  });
});
