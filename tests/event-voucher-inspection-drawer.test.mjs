import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/voucher-inspection-drawer.tsx", import.meta.url),
  "utf8"
);
const voidModal = readFileSync(
  new URL("../src/components/common/void-record-modal.tsx", import.meta.url),
  "utf8"
);

describe("VoucherInspectionDrawer Component", () => {
  it("renders split-view layout with transaction metadata and voucher document preview", () => {
    assert.match(source, /grid\s+grid-cols-1\s+lg:grid-cols-2/);
    assert.match(source, /Transaction Details/i);
    assert.match(source, /Receipt/i);
  });

  it("requires mandatory void audit reason before submitting void", () => {
    assert.match(source, /VoidRecordModal/);
    assert.match(source, /handleInitiateVoid/);
    assert.match(voidModal, /reason\.trim\(\)/);
    assert.match(voidModal, /reason\.trim\(\)\.length < 5/);
    assert.match(voidModal, /Confirm Void/);
  });

  it("enforces segregation of duties only while pending and refreshes + notifies on approval", () => {
    assert.match(source, /isExecutiveSelfReview\s*=\s*isPending\s*&&/i);
    assert.match(source, /Needs Another Officer's Review/i);
    assert.match(source, /useRouter\(\)/);
    assert.match(source, /router\.refresh\(\)/);
    assert.match(source, /dispatchFlashCard\(\{[\s\S]*Record Approved/);
  });

  it("renders inline PDF and image receipt preview via shared ReceiptPreview and displays Recorded By", () => {
    assert.match(source, /<ReceiptPreview/);
    assert.doesNotMatch(source, /Open PDF in New Tab/);
    assert.doesNotMatch(source, /<img[\s\S]*src=\{receiptUrl\}/);
    assert.match(source, /Recorded By/);
    assert.match(source, /authorizedBy/);
  });
});
