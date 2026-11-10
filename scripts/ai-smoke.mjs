import { readFileSync } from "node:fs";
import ts from "typescript";

async function loadTsModule(relPath) {
  const raw = readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
  const stripped = raw.replace(/^import "server-only";\r?\n/m, "");
  const compiled = ts.transpileModule(stripped, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  // Rewrite relative TS imports so Node resolves sibling TypeScript sources cleanly.
  return { raw: stripped, compiled };
}

async function main() {
  const { GoogleGenAI } = await import("@google/genai");
  const promptsMod = await loadTsModule("src/lib/ai/prompts.ts");
  const prompts = await import(
    `data:text/javascript;base64,${Buffer.from(promptsMod.compiled).toString("base64")}`
  );
  const groundingMod = await loadTsModule("src/lib/ai/grounding.ts");
  const grounding = await import(
    `data:text/javascript;base64,${Buffer.from(groundingMod.compiled).toString("base64")}`
  );

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in .env.local");
    process.exitCode = 1;
    return;
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  const facts = {
    report_type: "club_finance",
    year: 2026,
    as_of: "2026-10-31",
    totals_ngn: {
      dues_income: 1200000,
      other_income: 300000,
      expenses: 450000,
      event_inflow: 200000,
      event_outflow: 150000,
      club_balance: 1100000,
    },
    tx_count: 14,
    posted_count: 13,
    voided_count: 1,
    top_expense_categories: [
      { category: "Welfare", total_ngn: 300000, count: 4 },
      { category: "Operations", total_ngn: 150000, count: 3 },
    ],
    monthly_totals: [
      { month: "2026-10", income_ngn: 400000, expense_ngn: 120000 },
    ],
  };

  console.log(`Testing Gemini Interactions API with model: ${model}`);
  const prompt = prompts.buildNarrativePrompt("club_finance");
  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create(
    {
      model,
      input: JSON.stringify({ FACTS: facts }),
      system_instruction: prompt.system,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: prompt.schema,
      },
      generation_config: {
        max_output_tokens: 900,
      },
      store: false,
    },
    {
      timeout_ms: 20_000,
      retries: { strategy: "none" },
    },
  );

  const text = interaction.output_text;
  if (!text) {
    throw new Error("Gemini returned no output text.");
  }

  const parsed = JSON.parse(text);
  const check = grounding.validateNarrativeContent(parsed, facts);
  console.log("Generated narrative headline:", parsed.headline);
  console.log("Grounding check passed:", check.ok, check.reasons ?? []);
  if (!check.ok) {
    process.exitCode = 1;
  }
}

await main();
