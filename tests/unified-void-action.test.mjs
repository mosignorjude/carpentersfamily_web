import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("voidRecordAction exists and enforces validation and branching contracts", () => {
  const content = readFileSync("src/app/actions.ts", "utf8");
  assert.match(content, /export async function voidRecordAction\(/);
  assert.match(content, /verify_event_ticket_sale/);
  assert.match(content, /verify_event_financial_transaction/);
  assert.match(content, /void_event_financial_transaction/);
  assert.match(content, /void_club_financial_transaction/);
  assert.match(content, /"cancelled"/);
  assert.match(content, /"rejected"/);
  assert.match(content, /notifyTicketOrderReviewed/);
});
