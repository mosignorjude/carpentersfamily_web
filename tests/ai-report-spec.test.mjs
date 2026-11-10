import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let tempDir = null;

async function loadReportSpecModule() {
  if (!tempDir) {
    const cacheParent = path.join(projectRoot, "node_modules");
    await mkdir(cacheParent, { recursive: true });
    tempDir = await mkdtemp(path.join(cacheParent, ".tmp-ai-spec-"));
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    for (const file of ["facts.ts", "report-spec.ts"]) {
      const raw = await readFile(
        path.join(projectRoot, "src", "lib", "ai", file),
        "utf8",
      );
      const compiled = ts
        .transpileModule(raw, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        })
        .outputText.replace(/from\s+["']\.\/facts["']/g, 'from "./facts.js"');
      await writeFile(
        path.join(tempDir, file.replace(/\.ts$/, ".js")),
        compiled,
        "utf8",
      );
    }
  }
  return import(pathToFileURL(path.join(tempDir, "report-spec.js")).href);
}

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

const SAMPLE_METADATA = {
  clubCategories: ["Welfare", "Operations", "Equipment"],
  eventCategories: ["Venue Hire", "Catering", "Entertainment", "Gate Sales"],
  events: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Founders Gala Night",
      eventType: "party",
      startsAt: "2026-10-18",
    },
  ],
};

describe("Phase 2 Zod ReportSpec validation and prompt builder", () => {
  it("parses valid specs across datasets and normalizes nullish LLM fields", async () => {
    const mod = await loadReportSpecModule();

    const parsed = mod.parseAndNormalizeReportSpec(
      {
        dataset: "event_transactions",
        period: { from: "2026-07-01", to: "2026-09-30" },
        eventId: null,
        filters: { kind: "expense", category: "catering", status: null },
        groupBy: "category",
        metric: "sum_amount",
        chart: "bar",
      },
      SAMPLE_METADATA,
    );

    assert.equal(parsed.ok, true);
    assert.equal(parsed.spec.dataset, "event_transactions");
    assert.equal(parsed.spec.eventId, undefined);
    assert.equal(parsed.spec.filters.category, "Catering");
    assert.equal(parsed.spec.filters.status, undefined);
    assert.equal(parsed.spec.groupBy, "category");
    assert.equal(parsed.spec.chart, "bar");

    const chips = mod.buildUnderstoodSummary(parsed.spec, SAMPLE_METADATA);
    assert.ok(
      chips.some(
        (c) => c.label === "Dataset" && /Event Transactions/i.test(c.value),
      ),
    );
    assert.ok(
      chips.some((c) => c.label === "Filter" && /Catering/i.test(c.value)),
    );
  });

  it("rejects unknown datasets, SQL-like table names, bad dates, and oversized filters", async () => {
    const mod = await loadReportSpecModule();

    const badDataset = mod.parseAndNormalizeReportSpec({
      dataset: "member_profiles",
      period: { from: "2026-01-01", to: "2026-10-31" },
      metric: "count",
    });
    assert.equal(badDataset.ok, false);

    const badCalendar = mod.parseAndNormalizeReportSpec({
      dataset: "club_transactions",
      period: { from: "2026-02-30", to: "2026-03-10" },
      metric: "sum_amount",
    });
    assert.equal(badCalendar.ok, false);

    const reversedRange = mod.parseAndNormalizeReportSpec({
      dataset: "club_transactions",
      period: { from: "2026-11-01", to: "2026-10-01" },
      metric: "sum_amount",
    });
    assert.equal(reversedRange.ok, false);

    const pre1900 = mod.parseAndNormalizeReportSpec({
      dataset: "club_transactions",
      period: { from: "1890-01-01", to: "2026-10-01" },
      metric: "sum_amount",
    });
    assert.equal(pre1900.ok, false);

    const oversizedFilter = mod.parseAndNormalizeReportSpec({
      dataset: "club_transactions",
      period: { from: "2026-01-01", to: "2026-10-01" },
      filters: { category: "X".repeat(85) },
      metric: "sum_amount",
    });
    assert.equal(oversizedFilter.ok, false);

    const sqlInjectionCat = mod.parseAndNormalizeReportSpec(
      {
        dataset: "club_transactions",
        period: { from: "2026-01-01", to: "2026-10-01" },
        filters: { category: "Welfare'; DROP TABLE member_profiles;--" },
        metric: "sum_amount",
      },
      SAMPLE_METADATA,
    );
    assert.equal(sqlInjectionCat.ok, false);

    const badEventUuid = mod.parseAndNormalizeReportSpec({
      dataset: "event_transactions",
      period: { from: "2026-01-01", to: "2026-10-01" },
      eventId: "not-a-uuid",
      metric: "sum_amount",
    });
    assert.equal(badEventUuid.ok, false);
  });

  it("enforces per-dataset privacy and metric constraints (dues never by member, attendance count only)", async () => {
    const mod = await loadReportSpecModule();

    const duesByMember = mod.parseAndNormalizeReportSpec({
      dataset: "dues",
      period: { from: "2026-01-01", to: "2026-10-31" },
      groupBy: "member",
      metric: "sum_amount",
    });
    assert.equal(duesByMember.ok, false);

    const duesByCategory = mod.parseAndNormalizeReportSpec({
      dataset: "dues",
      period: { from: "2026-01-01", to: "2026-10-31" },
      groupBy: "category",
      metric: "sum_amount",
    });
    assert.equal(duesByCategory.ok, false);

    const validDues = mod.parseAndNormalizeReportSpec({
      dataset: "dues",
      period: { from: "2026-01-01", to: "2026-10-31" },
      groupBy: "status",
      metric: "sum_amount",
    });
    assert.equal(validDues.ok, true);

    const attendanceMoney = mod.parseAndNormalizeReportSpec({
      dataset: "attendance",
      period: { from: "2026-01-01", to: "2026-10-31" },
      groupBy: "event",
      metric: "sum_amount",
    });
    assert.equal(attendanceMoney.ok, false);

    const validAttendance = mod.parseAndNormalizeReportSpec({
      dataset: "attendance",
      period: { from: "2026-01-01", to: "2026-10-31" },
      groupBy: "status",
      metric: "count",
    });
    assert.equal(validAttendance.ok, true);
  });

  it("sanitizes officer questions and builds PII-free schema translation prompts", async () => {
    const mod = await loadReportSpecModule();

    assert.equal(mod.sanitizeQuestionInput("hi").ok, false);
    assert.equal(mod.sanitizeQuestionInput("a".repeat(320)).ok, false);

    const okQ = mod.sanitizeQuestionInput(
      "  Q3 event \u0007spending by category? ",
    );
    assert.equal(okQ.ok, true);
    assert.equal(okQ.question, "Q3 event spending by category?");

    const prompt = mod.buildSpecTranslatorPrompt(
      okQ.question,
      SAMPLE_METADATA,
      "2026-11-11",
    );
    assert.match(prompt.system, /club_transactions/);
    assert.match(prompt.system, /Catering/);
    assert.match(prompt.system, /Founders Gala Night/);
    assert.match(prompt.user, /Q3 event spending by category\?/);
  });
});
