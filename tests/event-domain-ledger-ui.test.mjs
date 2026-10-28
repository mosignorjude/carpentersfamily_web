import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/event-domain-ledger.tsx", import.meta.url),
  "utf8"
);

describe("EventDomainLedger UI Component", () => {
  it("enforces 20 items per page pagination constant", () => {
    assert.match(source, /PAGE_SIZE\s*=\s*20/);
    assert.match(source, /slice\(\s*startIndex,\s*endIndex\s*\)/);
  });

  it("renders status filter pills including Pending Review, Approved, and Rejected", () => {
    assert.match(source, /Pending Review/);
    assert.match(source, /Approved/);
    assert.match(source, /Rejected/);
  });

  it("formats reference cell using #REF badge pattern with tooltip", () => {
    assert.match(source, /paymentRef\s*\|\|\s*.*id\.slice\(0,\s*8\)/);
    assert.match(source, /title=\{.*id.*\}/);
  });

  it("restricts self-verification for executives by checking createdBy against currentUserId", () => {
    assert.match(source, /txn\.createdBy\s*===\s*currentUserId/);
    assert.match(source, /Awaiting Independent Officer Review/i);
  });
});
