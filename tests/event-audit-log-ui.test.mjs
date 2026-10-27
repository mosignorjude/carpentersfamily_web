import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/components/events/dashboard/tab-audit-log.tsx", import.meta.url),
  "utf8"
);

describe("TabAuditLog layout and reference cell formatting", () => {
  it("truncates transaction id in Ref / Date cell using paymentRef or short 8-char slice", () => {
    assert.match(
      source,
      /txn\.paymentRef\s*\|\|\s*txn\.id\.slice\(0,\s*8\)/,
      "Ref / Date cell must display short reference to prevent table blowout"
    );
  });

  it("preserves full transaction ID in tooltip title", () => {
    assert.match(
      source,
      /title=\{`Full Transaction ID: \$\{txn\.id\}`\}/,
      "Ref / Date cell must include full transaction ID in title tooltip for auditing"
    );
  });

  it("does not render raw untruncated txn.id as cell text block", () => {
    assert.doesNotMatch(
      source,
      /<span className="font-mono font-bold text-\[#3D291F\] block">\s*\{txn\.id\}\s*<\/span>/,
      "Ref / Date cell must not render raw 36-char UUID directly without truncation"
    );
  });
});
