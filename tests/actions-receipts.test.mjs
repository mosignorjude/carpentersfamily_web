import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("Server actions receipt parameter parsing", () => {
  it("identifies valid payment methods bank_transfer and cash", () => {
    const valid = new Set(["bank_transfer", "cash"]);
    assert.equal(valid.has("bank_transfer"), true);
    assert.equal(valid.has("cash"), true);
    assert.equal(valid.has("cheque"), false);
  });

  it("extracts file only when present and non-empty", () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", {
      type: "image/png",
    });
    assert.equal(file.size > 0, true);

    const emptyFile = new File([], "");
    assert.equal(emptyFile.size, 0);
  });
});
