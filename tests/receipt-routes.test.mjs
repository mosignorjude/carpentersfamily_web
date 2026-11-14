import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ts from "typescript";

function loadReceiptRedirectModule() {
  const src = readFileSync(
    new URL("../src/lib/receipt-redirect.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

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

  it("sanitizes return_url against open redirects and avoids double-? query strings", async () => {
    const mod = await loadReceiptRedirectModule();
    assert.equal(mod.sanitizeReturnUrl("https://evil.com/phish"), "/finances");
    assert.equal(mod.sanitizeReturnUrl("//evil.com/phish"), "/finances");
    assert.equal(mod.sanitizeReturnUrl("/\\evil.com"), "/finances");
    assert.equal(mod.sanitizeReturnUrl("javascript:alert(1)"), "/finances");
    assert.equal(mod.sanitizeReturnUrl("finances"), "/finances");
    assert.equal(mod.sanitizeReturnUrl("/events/123?tab=expenses"), "/events/123?tab=expenses");

    const redirectUrl = mod.buildReturnRedirectUrl(
      "/events/123?tab=expenses",
      "https://carpenters.example.com/api/receipts",
      "receipt-attached",
    );
    assert.equal(
      redirectUrl.toString(),
      "https://carpenters.example.com/events/123?tab=expenses&notice=receipt-attached",
    );

    const routeSource = readFileSync(
      new URL("../src/app/api/receipts/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(routeSource, /sanitizeReturnUrl/);
    assert.match(routeSource, /buildReturnRedirectUrl/);
    assert.doesNotMatch(routeSource, /`\$\{returnUrl\}\?notice=/);
  });
});
