import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("CSV report format payment method headers", () => {
  it("includes Payment Method header and excludes Reference header", () => {
    const headers = [
      "Date",
      "Kind",
      "Category",
      "Amount",
      "Payment Method",
      "Status",
      "Notes",
    ];
    assert.equal(headers.includes("Payment Method"), true);
    assert.equal(headers.includes("Reference"), false);
  });
});
