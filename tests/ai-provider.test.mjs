import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadProviderCore() {
  const source = await readFile(
    new URL("../src/lib/ai/provider-core.ts", import.meta.url),
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

describe("AI provider configuration & fallback", () => {
  it("evaluates AI_REPORTS_ENABLED and key presence safely", async () => {
    const core = await loadProviderCore();
    assert.equal(core.isAiReportsEnabled({}), false);
    assert.equal(
      core.isAiReportsEnabled({ GEMINI_API_KEY: "test-key" }),
      true,
    );
    assert.equal(
      core.isAiReportsEnabled({
        GEMINI_API_KEY: "test-key",
        AI_REPORTS_ENABLED: "false",
      }),
      false,
    );
    assert.equal(
      core.isAiReportsEnabled({ GROQ_API_KEY: "groq-key", AI_REPORTS_ENABLED: "true" }),
      true,
    );
    assert.equal(core.getAiDailyLimitPerOfficer({}), 20);
    assert.equal(
      core.getAiDailyLimitPerOfficer({ AI_DAILY_LIMIT_PER_OFFICER: "50" }),
      50,
    );
    assert.equal(
      core.getAiDailyLimitPerOfficer({ AI_DAILY_LIMIT_PER_OFFICER: "-5" }),
      20,
    );
  });

  it("falls back to secondary provider when primary returns 429 or times out", async () => {
    const core = await loadProviderCore();
    const calls = [];
    const primary = {
      name: "gemini",
      model: "gemini-3.5-flash-lite",
      async generateJson() {
        calls.push("gemini");
        const err = new Error("Rate limited");
        err.status = 429;
        throw err;
      },
    };
    const fallback = {
      name: "groq",
      model: "llama-3.3-70b-versatile",
      async generateJson() {
        calls.push("groq");
        return { headline: "Fallback result", highlights: ["One highlight"], risks: [], recommendations: [] };
      },
    };

    const result = await core.runProvidersWithFallback(
      [primary, fallback],
      { system: "sys", facts: { a: 1 }, schema: {} },
    );

    assert.deepEqual(calls, ["gemini", "groq"]);
    assert.equal(result.provider, "groq");
    assert.equal(result.model, "llama-3.3-70b-versatile");
    assert.equal(result.data.headline, "Fallback result");
  });

  it("throws AiUnavailableError when all configured providers fail", async () => {
    const core = await loadProviderCore();
    const failing = {
      name: "gemini",
      model: "gemini-3.5-flash-lite",
      async generateJson() {
        throw new Error("503 Unavailable");
      },
    };

    await assert.rejects(
      () =>
        core.runProvidersWithFallback([failing], {
          system: "sys",
          facts: { a: 1 },
          schema: {},
        }),
      (err) => err instanceof core.AiUnavailableError,
    );
  });

  it("extracts JSON cleanly from plain text or fenced markdown", async () => {
    const core = await loadProviderCore();
    assert.deepEqual(core.parseJsonResponse('{"a": 1}'), { a: 1 });
    assert.deepEqual(
      core.parseJsonResponse('```json\n{"headline":"Hello"}\n```'),
      { headline: "Hello" },
    );
    assert.throws(() => core.parseJsonResponse("not json at all"));
  });
});
