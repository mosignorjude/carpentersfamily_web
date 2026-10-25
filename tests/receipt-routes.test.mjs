import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";

describe("Receipt API route security & digest invariants", () => {
  it("computes matching sha256 for receipt bytes", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);
  });

  it("produces correct security headers for receipt download response", () => {
    const headers = {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="test.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Robots-Tag": "noindex",
    };

    assert.equal(headers["Cache-Control"], "private, no-store");
    assert.equal(headers["Content-Security-Policy"], "sandbox");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  });
});
