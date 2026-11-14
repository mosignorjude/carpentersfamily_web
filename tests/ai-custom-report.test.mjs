import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createElement } from "react";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let tempDir = null;

function compileTs(source, fileName, jsx = false) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      ...(jsx
        ? {
            jsx: ts.JsxEmit.ReactJSX,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
          }
        : {}),
    },
  }).outputText;
}

async function buildModules() {
  if (tempDir) return tempDir;
  const cacheParent = path.join(projectRoot, "node_modules");
  await mkdir(cacheParent, { recursive: true });
  tempDir = await mkdtemp(path.join(cacheParent, ".tmp-ai-custom-"));
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  const sources = [
    ["src/lib/brand.ts", "brand.js", false],
    ["src/lib/report-export.ts", "report-export.js", false],
    ["src/lib/ai/pseudonymise.ts", "pseudonymise.js", false],
    ["src/lib/ai/document-drafts.ts", "document-drafts.js", false],
    ["src/lib/ai/facts.ts", "facts.js", false],
    ["src/lib/ai/grounding.ts", "grounding.js", false],
    ["src/lib/ai/report-spec.ts", "report-spec.js", false],
    ["src/lib/reports/spec-executor-core.ts", "spec-executor-core.js", false],
    ["src/lib/pdf/fonts.ts", "fonts.js", false],
    ["src/lib/pdf/components.tsx", "components.js", true],
    ["src/lib/pdf/documents.tsx", "documents.js", true],
  ];

  for (const [srcRel, outName, isJsx] of sources) {
    const srcPath = path.join(projectRoot, srcRel);
    const raw = (await readFile(srcPath, "utf8")).replace(
      /^import "server-only";\r?\n/m,
      "",
    );
    const out = compileTs(raw, srcPath, isJsx)
      .replace(/from\s+["']\.\/facts["']/g, 'from "./facts.js"')
      .replace(/from\s+["']\.\/pseudonymise["']/g, 'from "./pseudonymise.js"')
      .replace(
        /from\s+["']\.\/document-drafts["']/g,
        'from "./document-drafts.js"',
      )
      .replace(/from\s+["']\.\/fonts["']/g, 'from "./fonts.js"')
      .replace(/from\s+["']\.\/components["']/g, 'from "./components.js"')
      .replace(/from\s+["']@\/lib\/ai\/facts["']/g, 'from "./facts.js"')
      .replace(
        /from\s+["']@\/lib\/ai\/report-spec["']/g,
        'from "./report-spec.js"',
      )
      .replace(/from\s+["']@\/lib\/brand["']/g, 'from "./brand.js"')
      .replace(
        /from\s+["']@\/lib\/report-export["']/g,
        'from "./report-export.js"',
      );

    await writeFile(path.join(tempDir, outName), out, "utf8");
  }

  return tempDir;
}

after(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

describe("Phase 2 custom report executor core, branded PDF, API & UI", () => {
  it("aggregates club and event transactions cleanly without PII and strips hostile labels", async () => {
    const dir = await buildModules();
    const [core, grounding] = await Promise.all([
      import(pathToFileURL(path.join(dir, "spec-executor-core.js")).href),
      import(pathToFileURL(path.join(dir, "grounding.js")).href),
    ]);

    const res = core.aggregateCustomReport(
      {
        dataset: "club_transactions",
        period: { from: "2026-07-01", to: "2026-09-30" },
        filters: { kind: "expense" },
        groupBy: "category",
        metric: "sum_amount",
        chart: "bar",
      },
      [
        {
          kind: "expense",
          amount_ngn: 200000,
          transaction_date: "2026-07-10",
          category_name_snapshot: "Welfare\n<script>alert(1)</script>",
          payment_method: "bank_transfer",
          is_opening_balance: false,
        },
        {
          kind: "expense",
          amount_ngn: 100000,
          transaction_date: "2026-08-12",
          category_name_snapshot: "Operations",
          payment_method: "cash",
          is_opening_balance: false,
        },
        {
          kind: "income",
          amount_ngn: 5000000,
          transaction_date: "2026-07-01",
          category_name_snapshot: "Opening",
          payment_method: "bank_transfer",
          is_opening_balance: true,
        },
      ],
      {},
    );

    assert.equal(res.summary.totalCount, 2);
    assert.equal(res.summary.totalAmountNgn, 300000);
    assert.equal(res.summary.averageAmountNgn, 150000);
    assert.equal(res.rows.length, 2);
    assert.equal(res.rows[0].groupLabel, "Welfare script alert(1) /script");
    assert.equal(res.rows[0].totalAmountNgn, 200000);
    assert.equal(res.rows[0].sharePct, 66.7);

    const serialized = JSON.stringify(res.facts);
    assert.doesNotMatch(serialized, /member_id|full_name|payer_payee/i);

    const grounded = grounding.validateNarrativeContent(
      {
        headline:
          "Club operating expenses reached NGN 300,000 across 2 entries from July 1, 2026 to September 30, 2026.",
        highlights: [
          "Total welfare category expenses were NGN 200,000 (66.7%).",
        ],
        risks: [],
        recommendations: [
          "Continue tracking Operations expenses (NGN 100,000).",
        ],
      },
      res.facts,
    );
    assert.equal(grounded.ok, true, JSON.stringify(grounded));
  });

  it("aggregates dues strictly by status or month and attendance strictly by count", async () => {
    const dir = await buildModules();
    const core = await import(
      pathToFileURL(path.join(dir, "spec-executor-core.js")).href
    );

    const duesRes = core.aggregateCustomReport(
      {
        dataset: "dues",
        period: { from: "2026-01-01", to: "2026-10-31" },
        filters: {},
        groupBy: "status",
        metric: "sum_amount",
        chart: "bar",
      },
      [
        {
          covered_month: "2026-01-01",
          status: "paid",
          amount_ngn: 5000,
          due_date: "2026-01-31",
          is_overdue: false,
        },
        {
          covered_month: "2026-02-01",
          status: "unpaid",
          amount_ngn: 5000,
          due_date: "2026-02-28",
          is_overdue: true,
        },
        {
          covered_month: "2026-12-01",
          status: "unpaid",
          amount_ngn: 5000,
          due_date: "2026-12-31",
          is_overdue: false,
        },
      ],
      {},
    );
    assert.equal(duesRes.summary.totalCount, 3);
    assert.equal(duesRes.summary.totalAmountNgn, 15000);
    assert.ok(
      duesRes.rows.some(
        (r) => r.groupKey === "overdue" && r.totalAmountNgn === 5000,
      ),
    );
    assert.ok(
      duesRes.rows.some(
        (r) => r.groupKey === "paid" && r.totalAmountNgn === 5000,
      ),
    );

    const attRes = core.aggregateCustomReport(
      {
        dataset: "attendance",
        period: { from: "2026-01-01", to: "2026-10-31" },
        filters: {},
        groupBy: "status",
        metric: "count",
        chart: "none",
      },
      [
        {
          attendance_status: "present",
          event_id: "e1",
          recorded_at: "2026-05-01T10:00:00Z",
        },
        {
          attendance_status: "late",
          event_id: "e1",
          recorded_at: "2026-05-01T10:30:00Z",
        },
        {
          attendance_status: "present",
          event_id: "e2",
          recorded_at: "2026-06-01T10:00:00Z",
        },
      ],
      {},
    );
    assert.equal(attRes.summary.isMonetary, false);
    assert.equal(attRes.summary.totalCount, 3);
    assert.equal(attRes.rows[0].groupKey, "present");
    assert.equal(attRes.rows[0].count, 2);
  });

  it("renders CustomReportPdfDocument cleanly with Unicode, AI summary, and zero dangerous PDF actions", async () => {
    const dir = await buildModules();
    const [{ renderToBuffer }, docs] = await Promise.all([
      import("@react-pdf/renderer"),
      import(pathToFileURL(path.join(dir, "documents.js")).href),
    ]);

    assert.equal(typeof docs.CustomReportPdfDocument, "function");

    const buffer = await renderToBuffer(
      createElement(docs.CustomReportPdfDocument, {
        title: "Custom Report: Event Transactions",
        subtitle: "2026-07-01 to 2026-09-30 · Grouped by Category",
        periodLabel: "2026-07-01 to 2026-09-30",
        generatedDate: "2026-11-11",
        isMonetary: true,
        metricLabel: "Total (NGN)",
        totalCount: 5,
        totalAmountNgn: 450000,
        averageAmountNgn: 90000,
        rows: [
          {
            groupLabel: "Ọlámidé Catering",
            count: 3,
            totalAmountNgn: 300000,
            averageAmountNgn: 100000,
            sharePct: 66.7,
          },
          {
            groupLabel: "Venue Hire",
            count: 2,
            totalAmountNgn: 150000,
            averageAmountNgn: 75000,
            sharePct: 33.3,
          },
        ],
        narrative: {
          content: {
            headline: "Event expenses totaled NGN 450,000 across 5 entries.",
            highlights: ["Ọlámidé Catering accounted for NGN 300,000 (66.7%)."],
            risks: [],
            recommendations: [],
          },
          reviewedBy: "Executive Officer",
          reviewedAt: "2026-11-11",
        },
      }),
    );

    const rawPdf = Buffer.from(buffer).toString("latin1");
    assert.ok(rawPdf.startsWith("%PDF-"));
    assert.doesNotMatch(rawPdf, /\/JavaScript|\/JS|\/OpenAction|\/Launch/);

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
    }).promise;
    let extracted = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      extracted += tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    }
    assert.match(extracted, /Ọlámidé Catering/);
    assert.match(extracted, /NGN 450,000/);
    assert.match(extracted, /AI-assisted · Reviewed by Executive Officer/);
  });

  it("enforces officer auth, same-origin checks, and PDF fallback on /api/ai-reports/custom and wires UI", async () => {
    const route = await readFile(
      new URL("../src/app/api/ai-reports/custom/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /requireOfficer/);
    assert.match(route, /isSameSiteOrigin/);
    assert.match(route, /readBoundedJsonBody/);
    assert.match(route, /export const maxDuration = 30;/);
    assert.match(route, /renderReportPdf/);
    assert.match(route, /createSimplePdf/);

    const ui = await readFile(
      new URL(
        "../src/components/reports/custom-report-builder.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(ui, /what I understood/i);
    assert.match(ui, /AiSummaryPanel/);
    assert.match(ui, /\/api\/ai-reports\/custom/);
    assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);

    const overviewClient = await readFile(
      new URL(
        "../src/components/reports/club-overview-client.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(overviewClient, /CustomReportBuilder/);
  });

  it("strips member PII keys and blocks dues member grouping before AI narrative generation", async () => {
    const dir = await buildModules();
    const core = await import(
      pathToFileURL(path.join(dir, "spec-executor-core.js")).href
    );

    assert.equal(typeof core.sanitizeCustomFactsForAi, "function");

    assert.throws(
      () =>
        core.sanitizeCustomFactsForAi({
          report: "custom",
          dataset: "dues",
          group_by: "member",
          groups: [{ label: "Ada Obi", count: 2 }],
        }),
      /member/i,
    );

    const sanitized = core.sanitizeCustomFactsForAi({
      report: "custom",
      dataset: "club_transactions",
      group_by: "category",
      groups: [
        {
          label: "Venue Rent — contact ada@example.com or +2348012345678",
          member_id: "uuid-123",
          full_name: "Ada Obi",
          email: "ada@example.com",
          phone: "+2348012345678",
          username: "@ada",
          count: 1,
          total_amount_ngn: 50000,
        },
      ],
    });

    assert.equal(sanitized.groups[0].member_id, undefined);
    assert.equal(sanitized.groups[0].full_name, undefined);
    assert.equal(sanitized.groups[0].email, undefined);
    assert.equal(sanitized.groups[0].phone, undefined);
    assert.equal(sanitized.groups[0].username, undefined);
    assert.doesNotMatch(sanitized.groups[0].label, /ada@example\.com/);
    assert.doesNotMatch(sanitized.groups[0].label, /\+2348012345678/);
  });
});
