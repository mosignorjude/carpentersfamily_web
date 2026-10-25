import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runReceiptEntry } from "../src/lib/receipt-entry.mjs";

const targetId = "11111111-1111-4111-8111-111111111111";
const receiptId = "22222222-2222-4222-8222-222222222222";

const valid = {
  contentType: "application/pdf",
  filename: "receipt.pdf",
  extension: "pdf",
};

function pdfFile() {
  return new File([new TextEncoder().encode("%PDF-1.7 receipt")], "receipt.pdf", {
    type: "application/pdf",
  });
}

function fakeStorage(overrides = {}) {
  const calls = { puts: [], deletes: [] };
  return {
    calls,
    storage: {
      async putObject(key, bytes, contentType) {
        calls.puts.push({ key, bytes, contentType });
      },
      async getObject() {
        return null;
      },
      async deleteObject(key) {
        calls.deletes.push(key);
      },
      ...overrides,
    },
  };
}

const baseInput = {
  scope: "club",
  targetId,
  paymentMethod: "bank_transfer",
  paymentStatus: "paid",
  file: pdfFile(),
};

const deps = (storage) => ({
  storage,
  validateReceipt: () => valid,
  newId: () => receiptId,
});

describe("receipt entry orchestration", () => {
  it("uploads then commits a paid bank transfer", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(baseInput, deps(storage), async (receipt) => {
      assert.equal(receipt.objectKey, `receipts/club/${targetId}/${receiptId}.pdf`);
      assert.equal(receipt.sha256.length, 64);
      return { kind: "ok", id: targetId, deduplicated: false };
    });
    assert.deepEqual(result, { kind: "ok", id: targetId, deduplicated: false });
    assert.equal(calls.puts.length, 1);
    assert.equal(calls.deletes.length, 0);
  });

  it("rejects a missing file before touching storage", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(
      { ...baseInput, file: null },
      deps(storage),
      async () => assert.fail("commit must not run"),
    );
    assert.equal(result.notice, "receipt-required");
    assert.equal(calls.puts.length, 0);
  });

  it("rejects a file for cash and for unpaid bank transfers", async () => {
    const { storage } = fakeStorage();
    for (const input of [
      { ...baseInput, paymentMethod: "cash" },
      { ...baseInput, paymentStatus: "pending" },
    ]) {
      const result = await runReceiptEntry(
        input,
        deps(storage),
        async () => assert.fail("commit must not run"),
      );
      assert.equal(result.notice, "receipt-not-allowed");
    }
  });

  it("blocks a paid bank transfer when storage is not configured", async () => {
    const result = await runReceiptEntry(
      baseInput,
      { storage: null, validateReceipt: () => valid, newId: () => receiptId },
      async () => assert.fail("commit must not run"),
    );
    assert.equal(result.notice, "receipt-storage-unavailable");
  });

  it("rejects invalid bytes through the injected validator", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(
      baseInput,
      { ...deps(storage), validateReceipt: () => null },
      async () => assert.fail("commit must not run"),
    );
    assert.equal(result.notice, "receipt-invalid");
    assert.equal(calls.puts.length, 0);
  });

  it("deletes the object when the commit fails", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(baseInput, deps(storage), async () => ({
      kind: "error",
      error: { code: "42501", message: "denied" },
    }));
    assert.equal(result.kind, "error");
    assert.equal(result.notice, "operation-failed");
    assert.equal(calls.deletes.length, 1);
  });

  it("deletes the new object when the RPC reports a replay", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(baseInput, deps(storage), async () => ({
      kind: "ok",
      id: targetId,
      deduplicated: true,
    }));
    assert.equal(result.kind, "ok");
    assert.equal(result.deduplicated, true);
    assert.equal(calls.deletes.length, 1);
  });

  it("does not upload for a correction that already has a receipt", async () => {
    const { storage, calls } = fakeStorage();
    const result = await runReceiptEntry(
      { ...baseInput, file: null, hasReceipt: true },
      deps(storage),
      async (receipt) => {
        assert.equal(receipt, null);
        return { kind: "ok", id: targetId, deduplicated: false };
      },
    );
    assert.equal(result.kind, "ok");
    assert.equal(calls.puts.length, 0);
  });
});
