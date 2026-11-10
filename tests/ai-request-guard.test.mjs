import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadRequestGuard() {
  const source = await readFile(
    new URL("../src/lib/ai/request-guard.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

describe("AI report request guard", () => {
  it("verifies same-site Origin strictly against expected origin", async () => {
    const guard = await loadRequestGuard();
    const okReq = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { origin: "https://carpentersfamily.com.ng" },
    });
    const crossReq = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const noOriginReq = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
    });

    assert.equal(guard.isSameSiteOrigin(okReq, "https://carpentersfamily.com.ng"), true);
    assert.equal(guard.isSameSiteOrigin(crossReq, "https://carpentersfamily.com.ng"), false);
    assert.equal(guard.isSameSiteOrigin(noOriginReq, "https://carpentersfamily.com.ng"), false);
  });

  it("enforces byte limits before JSON parsing", async () => {
    const guard = await loadRequestGuard();
    const small = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportType: "club_finance" }),
    });
    assert.deepEqual(await guard.readBoundedJsonBody(small, 1024), {
      kind: "ok",
      data: { reportType: "club_finance" },
    });

    const large = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pad: "x".repeat(500) }),
    });
    assert.deepEqual(await guard.readBoundedJsonBody(large, 100), {
      kind: "too-large",
    });

    const badJson = new Request("https://carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      body: "{not-json",
    });
    assert.deepEqual(await guard.readBoundedJsonBody(badJson, 1024), {
      kind: "invalid",
    });
  });
});
