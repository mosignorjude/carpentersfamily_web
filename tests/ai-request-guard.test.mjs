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

    // Supports www <-> apex siblings for the configured HTTPS domain
    const wwwReq = new Request("https://www.carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { origin: "https://www.carpentersfamily.com.ng" },
    });
    assert.equal(guard.isSameSiteOrigin(wwwReq, "https://carpentersfamily.com.ng"), true);
    assert.equal(guard.isSameSiteOrigin(okReq, "https://www.carpentersfamily.com.ng"), true);

    // Supports local dev localhost <-> 127.0.0.1 loopback aliasing
    const localhostReq = new Request("http://localhost:3000/api/ai-reports", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(guard.isSameSiteOrigin(localhostReq, "http://127.0.0.1:3000"), true);

    // Never permits loopback against production HTTPS expectedOrigin
    assert.equal(guard.isSameSiteOrigin(localhostReq, "https://www.carpentersfamily.com.ng"), false);

    // Rejects opaque/null Origin
    const nullOriginReq = new Request("https://www.carpentersfamily.com.ng/api/ai-reports", {
      method: "POST",
      headers: { origin: "null" },
    });
    assert.equal(guard.isSameSiteOrigin(nullOriginReq, "https://www.carpentersfamily.com.ng"), false);
  });

  it("supports Vercel preview deployment origins cleanly when VERCEL_URL is set", async () => {
    const guard = await loadRequestGuard();
    const prevVercelUrl = process.env.VERCEL_URL;
    process.env.VERCEL_URL = "carpentersfamily-git-main-team.vercel.app";
    try {
      const previewReq = new Request(
        "https://carpentersfamily-git-main-team.vercel.app/api/ai-reports",
        {
          method: "POST",
          headers: { origin: "https://carpentersfamily-git-main-team.vercel.app" },
        },
      );
      const evilVercelReq = new Request(
        "https://carpentersfamily-git-main-team.vercel.app/api/ai-reports",
        {
          method: "POST",
          headers: { origin: "https://attacker-preview.vercel.app" },
        },
      );
      assert.equal(
        guard.isSameSiteOrigin(previewReq, "https://www.carpentersfamily.com.ng"),
        true,
      );
      assert.equal(
        guard.isSameSiteOrigin(evilVercelReq, "https://www.carpentersfamily.com.ng"),
        false,
      );
    } finally {
      if (prevVercelUrl === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = prevVercelUrl;
    }
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
