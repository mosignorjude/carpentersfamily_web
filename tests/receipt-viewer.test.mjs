import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Receipt cell display state resolver", () => {
  function resolveReceiptCellState({ method, status, hasReceipt, isLegacy }) {
    if (method === "bank_transfer" && hasReceipt) return "view_download";
    if (
      method === "bank_transfer" &&
      status === "paid" &&
      !hasReceipt &&
      isLegacy
    ) {
      return "legacy_missing";
    }
    if (method === "bank_transfer" && status !== "paid")
      return "pending_commitment";
    if (method === "cash") return "cash";
    if (!method) return "not_recorded";
    return "other";
  }

  it("resolves view_download for bank transfer with receipt", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "bank_transfer",
        status: "paid",
        hasReceipt: true,
      }),
      "view_download",
    );
  });

  it("resolves legacy_missing for grandfathered paid bank transfer without receipt", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "bank_transfer",
        status: "paid",
        hasReceipt: false,
        isLegacy: true,
      }),
      "legacy_missing",
    );
  });

  it("resolves cash with no receipt expected", () => {
    assert.equal(
      resolveReceiptCellState({
        method: "cash",
        status: "paid",
        hasReceipt: false,
      }),
      "cash",
    );
  });
});
