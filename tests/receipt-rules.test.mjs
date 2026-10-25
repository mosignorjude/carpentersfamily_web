import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RECEIPT_SCOPES,
  buildReceiptObjectKey,
  receiptExtensionFor,
  receiptRequirement,
} from "../src/lib/receipt-rules.mjs";

const targetId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";

describe("receipt requirement", () => {
  it("requires a receipt only for a paid bank transfer", () => {
    assert.equal(receiptRequirement("bank_transfer", "paid"), "required");
  });

  it("forbids a receipt for cash and for unpaid bank transfers", () => {
    for (const status of ["pending", "unpaid", "deposit"]) {
      assert.equal(receiptRequirement("bank_transfer", status), "forbidden");
    }
    assert.equal(receiptRequirement("cash", "paid"), "forbidden");
  });

  it("treats a bank transfer that already has a receipt as satisfied", () => {
    assert.equal(
      receiptRequirement("bank_transfer", "paid", { hasReceipt: true }),
      "forbidden",
    );
  });

  it("rejects unsupported methods unless legacy methods are allowed", () => {
    assert.equal(receiptRequirement("card", "paid"), "unsupported");
    assert.equal(
      receiptRequirement("card", "paid", { allowLegacyMethod: true }),
      "forbidden",
    );
  });
});

describe("object keys", () => {
  it("uses the content type extension, never the filename", () => {
    assert.equal(receiptExtensionFor("application/pdf"), "pdf");
    assert.equal(receiptExtensionFor("image/jpeg"), "jpg");
    assert.equal(receiptExtensionFor("image/png"), "png");
    assert.equal(receiptExtensionFor("text/html"), null);
  });

  it("builds a scoped key", () => {
    assert.equal(
      buildReceiptObjectKey({
        scope: "dues",
        targetId,
        receiptId,
        contentType: "image/jpeg",
      }),
      `receipts/dues/${targetId}/${receiptId}.jpg`,
    );
  });

  it("rejects unknown scopes and malformed UUIDs", () => {
    assert.equal(RECEIPT_SCOPES.length, 4);
    assert.throws(() =>
      buildReceiptObjectKey({
        scope: "other",
        targetId,
        receiptId,
        contentType: "application/pdf",
      }),
    );
    assert.throws(() =>
      buildReceiptObjectKey({
        scope: "club",
        targetId: "../escape",
        receiptId,
        contentType: "application/pdf",
      }),
    );
  });
});
