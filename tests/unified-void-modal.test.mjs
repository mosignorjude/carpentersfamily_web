import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("VoidRecordModal exists and implements dynamic consequence copy", () => {
  assert.ok(existsSync("src/components/common/void-record-modal.tsx"));
  const content = readFileSync(
    "src/components/common/void-record-modal.tsx",
    "utf8"
  );
  assert.match(content, /export function VoidRecordModal\(/);
  assert.match(content, /Cancels this order\. No payment was received/);
  assert.match(content, /owed back to the buyer/);
  assert.match(content, /Excludes this record from all balances/);
  assert.match(content, /min-h-\[44px\]/);
});
