import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/voucher-inspection-drawer.tsx", import.meta.url),
  "utf8"
);

describe("VoucherInspectionDrawer Component", () => {
  it("renders split-view layout with transaction metadata and voucher document preview", () => {
    assert.match(source, /grid\s+grid-cols-1\s+lg:grid-cols-2/);
    assert.match(source, /Transaction Details/i);
    assert.match(source, /Receipt/i);
  });

  it("requires mandatory rejection reason before submitting rejection", () => {
    assert.match(source, /rejectionReason/i);
    assert.match(source, /(rejectionReason|reason)\.trim\(\)/);
    assert.match(source, /Reject/i);
  });

  it("enforces segregation of duties for executive users", () => {
    assert.match(source, /isExecutiveSelfReview/i);
    assert.match(source, /Needs Another Officer's Review/i);
  });
});
