import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard types export VoidEntityType and VoidableRecord contracts", () => {
  const content = readFileSync(
    "src/components/events/dashboard/dashboard-types.ts",
    "utf8"
  );
  assert.match(content, /export type VoidEntityType =/);
  assert.match(content, /"ticket_sale"/);
  assert.match(content, /"event_transaction"/);
  assert.match(content, /"club_transaction"/);
  assert.match(content, /export interface VoidableRecord/);
  assert.match(content, /entityType:\s*VoidEntityType/);
  assert.match(content, /verificationStatus\?:/);
});
