import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveReceiptCellState } from "../src/lib/receipt-cell-state.mjs";

describe("receipt cell state", () => {
  it("reports missing bank-transfer metadata as unavailable when the query failed", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "bank_transfer",
        status: "pending",
        hasReceipt: false,
        receiptUnavailable: true,
      }),
      "receipt_unavailable",
    );
  });

  it("keeps the pending bank-transfer state when receipt metadata loaded successfully", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "bank_transfer",
        status: "pending",
        hasReceipt: false,
        receiptUnavailable: false,
      }),
      "pending_commitment",
    );
  });

  it("prefers visible receipt metadata when some unrelated query error was returned", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "bank_transfer",
        status: "pending",
        hasReceipt: true,
        receiptUnavailable: true,
      }),
      "view_download",
    );
  });
});
