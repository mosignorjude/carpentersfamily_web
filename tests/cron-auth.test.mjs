import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/cron-token.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { isValidCronToken } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

describe("internal cron authentication", () => {
  it("accepts only a matching bearer token", () => {
    assert.equal(isValidCronToken("Bearer s3cret-token", "s3cret-token"), true);
    assert.equal(isValidCronToken("Bearer wrong", "s3cret-token"), false);
    assert.equal(isValidCronToken("s3cret-token", "s3cret-token"), false);
    assert.equal(isValidCronToken("Basic s3cret-token", "s3cret-token"), false);
    assert.equal(isValidCronToken(null, "s3cret-token"), false);
  });

  it("refuses every request when the secret is not configured", () => {
    assert.equal(isValidCronToken("Bearer anything", ""), false);
    assert.equal(isValidCronToken("Bearer anything", undefined), false);
    assert.equal(isValidCronToken("Bearer anything", null), false);
  });

  it("rejects empty provided tokens and tolerates length differences", () => {
    assert.equal(isValidCronToken("Bearer ", "s3cret-token"), false);
    assert.equal(isValidCronToken("Bearer a", "a-much-longer-secret"), false);
    assert.equal(isValidCronToken(`Bearer ${"x".repeat(500)}`, "short"), false);
  });
});
