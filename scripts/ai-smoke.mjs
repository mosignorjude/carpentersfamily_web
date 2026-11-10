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

  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

async function main() {
  const { GoogleGenAI } = await import("@google/genai");
  const prompts = await loadTsModule("src/lib/ai/prompts.ts");
  const grounding = await loadTsModule("src/lib/ai/grounding.ts");

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

  const prompt = prompts.buildNarrativePrompt("club_finance");
  let testedAny = false;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    testedAny = true;
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
    console.log(`Testing Gemini Interactions API with model: ${model}`);
    const client = new GoogleGenAI({ apiKey: geminiKey });
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
    console.log("Gemini headline:", parsed.headline);
    console.log("Gemini grounding passed:", check.ok, check.reasons ?? []);
    if (!check.ok) {
      process.exitCode = 1;
    }
  } else {
    console.log("GEMINI_API_KEY not set; skipping Gemini smoke check.");
  }

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    testedAny = true;
    const groqModel = process.env.GROQ_MODEL?.trim() || "qwen/qwen3.8-27b";
    console.log(`Testing Groq fallback API with model: ${groqModel}`);
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          temperature: 0.2,
          max_tokens: 1500,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${prompt.system}\nJSON Schema: ${JSON.stringify(prompt.schema)}`,
            },
            {
              role: "user",
              content: JSON.stringify({ FACTS: facts }),
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${detail}`);
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned empty completion content.");
    }
    const parsed = JSON.parse(content);
    const check = grounding.validateNarrativeContent(parsed, facts);
    console.log("Groq headline:", parsed.headline);
    console.log("Groq grounding passed:", check.ok, check.reasons ?? []);
    if (!check.ok) {
      process.exitCode = 1;
    }
  } else {
    console.log("GROQ_API_KEY not set; skipping Groq smoke check.");
  }

  if (!testedAny) {
    console.error("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured.");
    process.exitCode = 1;
  }
}

await main();
