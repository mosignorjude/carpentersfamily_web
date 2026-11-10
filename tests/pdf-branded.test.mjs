import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const artifactsRoot = path.join(projectRoot, "tests", "artifacts");

let tempBuildDir = null;

async function buildPdfModules() {
  if (tempBuildDir) return tempBuildDir;
  await mkdir(artifactsRoot, { recursive: true });
  tempBuildDir = await mkdtemp(path.join(artifactsRoot, "pdf-build-"));

  // Package.json with type module so compiled ESNext .js imports resolve cleanly
  await writeFile(
    path.join(tempBuildDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  const files = ["fonts.ts", "components.tsx", "documents.tsx", "render.server.ts"];
  for (const file of files) {
    const srcPath = path.join(projectRoot, "src", "lib", "pdf", file);
    const source = await readFile(srcPath, "utf8");
    const rewrittenSource = source
      .replaceAll('import "server-only";', "")
      .replaceAll("@/lib/brand", pathToFileURL(path.join(projectRoot, "src", "lib", "brand.ts")).href)
      .replaceAll("@/lib/report-export", pathToFileURL(path.join(projectRoot, "src", "lib", "report-export.ts")).href);

    // First transpile brand.ts / report-export.ts if needed, or simpler: rewrite relative imports
    const transpiled = ts.transpileModule(rewrittenSource, {
      fileName: srcPath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    }).outputText;

    const jsWithExtensions = transpiled
      .replace(/from\s+["']\.\/fonts["']/g, 'from "./fonts.js"')
      .replace(/from\s+["']\.\/components["']/g, 'from "./components.js"')
      .replace(/from\s+["']\.\/documents["']/g, 'from "./documents.js"')
      .replace(
        new RegExp(escapeRegExp(pathToFileURL(path.join(projectRoot, "src", "lib", "brand.ts")).href), "g"),
        "./brand.js",
      )
      .replace(
        new RegExp(escapeRegExp(pathToFileURL(path.join(projectRoot, "src", "lib", "report-export.ts")).href), "g"),
        "./report-export.js",
      );

    const outName = file.replace(/\.tsx?$/, ".js");
    await writeFile(path.join(tempBuildDir, outName), jsWithExtensions, "utf8");
  }

  for (const [sub, out] of [
    ["brand.ts", "brand.js"],
    ["report-export.ts", "report-export.js"],
  ]) {
    const srcPath = path.join(projectRoot, "src", "lib", sub);
    const code = ts.transpileModule(await readFile(srcPath, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    await writeFile(path.join(tempBuildDir, out), code, "utf8");
  }

  return tempBuildDir;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

after(async () => {
  if (tempBuildDir) {
    await rm(tempBuildDir, { recursive: true, force: true });
  }
});

async function extractPdfText(pdfBytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: pdfBytes, verbosity: 0 }).promise;
  let combined = "";
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    combined += `${content.items.map((item) => item.str ?? "").join(" ")}\n`;
  }
  return { numPages: doc.numPages, text: combined };
}

describe("branded PDF generation and security", () => {
  it("renders branded club finance PDF with Unicode text, AI summary, and no dangerous PDF actions", async () => {
    const dir = await buildPdfModules();
    const [{ ClubFinancePdfDocument }, { renderReportPdf }] = await Promise.all([
      import(pathToFileURL(path.join(dir, "documents.js")).href),
      import(pathToFileURL(path.join(dir, "render.server.js")).href),
    ]);
    const React = await import("react");

    const element = React.createElement(ClubFinancePdfDocument, {
      year: 2026,
      asOf: "2026-11-10",
      generatedDate: "2026-11-10",
      summary: {
        dues_income: "1450000",
        other_income: "320000",
        expenses: "910000",
        event_inflow: "500000",
        event_outflow: "200000",
        balance: "2140000",
      },
      transactions: [
        {
          id: "t1",
          kind: "expense",
          is_opening_balance: false,
          amount_ngn: "120000",
          transaction_date: "2026-10-15",
          description: "Catering paid to Ọlámidé Adeyemi <script>alert(1)</script>",
          category_name_snapshot: "Catering",
          payer_payee: "Ọlámidé Adeyemi",
          source_note: "x) Tj\n/JavaScript /OpenAction",
          voided_at: null,
          void_reason: null,
          payment_method: "bank_transfer",
        },
      ],
      receiptsByTransaction: new Map([["t1", ["receipt-1.pdf"]]]),
      narrative: {
        content: {
          headline: "Club reserve stands at NGN 2,140,000 through 2026-11-10.",
          highlights: ["Dues income reached NGN 1,450,000."],
          risks: ["Operating expenses totalled NGN 910,000."],
          recommendations: ["Maintain current reserve buffers."],
        },
        reviewedBy: "Ọlámidé Adeyemi",
        reviewedAt: "2026-11-10",
      },
    });

    const pdf = await renderReportPdf(element);
    assert.ok(pdf instanceof Uint8Array);
    assert.ok(pdf.byteLength > 1000);

    const rawAscii = Buffer.from(pdf).toString("latin1");
    assert.match(rawAscii, /^%PDF-1\./);
    assert.doesNotMatch(
      rawAscii,
      /\/JavaScript|\/OpenAction|\/Launch|\/Annots|\/URI\b|<script>/u,
    );

    const parsed = await extractPdfText(pdf);
    assert.ok(parsed.numPages >= 1);
    assert.match(parsed.text, /Carpenters Family Social Club/);
    assert.match(parsed.text, /Ọlámidé Adeyemi/);
    assert.match(parsed.text, /AI-assisted/);
    assert.match(parsed.text, /NGN 2,140,000/);
  });

  it("enforces MAX_REPORT_EXPORT_BYTES limit without returning oversized buffers", async () => {
    const dir = await buildPdfModules();
    const [{ ClubFinancePdfDocument }, { renderReportPdf }] = await Promise.all([
      import(pathToFileURL(path.join(dir, "documents.js")).href),
      import(pathToFileURL(path.join(dir, "render.server.js")).href),
    ]);
    const React = await import("react");

    const element = React.createElement(ClubFinancePdfDocument, {
      year: 2026,
      asOf: "2026-11-10",
      generatedDate: "2026-11-10",
      summary: {
        dues_income: "0",
        other_income: "0",
        expenses: "0",
        event_inflow: "0",
        event_outflow: "0",
        balance: "0",
      },
      transactions: [],
      receiptsByTransaction: new Map(),
      narrative: null,
    });

    const oversizedRejected = await renderReportPdf(element, 100);
    assert.equal(oversizedRejected, null);
  });

  it("renders Dues, Event Finance, and Club Overview branded PDFs cleanly", async () => {
    const dir = await buildPdfModules();
    const [
      { DuesPdfDocument, EventFinancePdfDocument, ClubOverviewPdfDocument },
      { renderReportPdf },
    ] = await Promise.all([
      import(pathToFileURL(path.join(dir, "documents.js")).href),
      import(pathToFileURL(path.join(dir, "render.server.js")).href),
    ]);
    const React = await import("react");

    const duesPdf = await renderReportPdf(
      React.createElement(DuesPdfDocument, {
        year: 2026,
        asOf: "2026-11-10",
        generatedDate: "2026-11-10",
        duesRows: [
          {
            member_id: "m1",
            full_name: "Ọlámidé Adeyemi",
            username: "olamide",
            covered_month: "2026-10-01",
            amount_ngn: "5000",
            status: "unpaid",
            due_date: "2026-10-31",
            is_overdue: true,
          },
        ],
        profilesById: new Map([
          ["m1", { id: "m1", full_name: "Ọlámidé Adeyemi", username: "olamide" }],
        ]),
        narrative: null,
      }),
    );
    assert.ok(duesPdf instanceof Uint8Array);
    const duesParsed = await extractPdfText(duesPdf);
    assert.match(duesParsed.text, /Member Dues Report/);
    assert.match(duesParsed.text, /Ọlámidé Adeyemi/);

    const eventPdf = await renderReportPdf(
      React.createElement(EventFinancePdfDocument, {
        eventTitle: "Annual Dinner",
        from: "2026-10-01",
        to: "2026-10-31",
        generatedDate: "2026-11-10",
        summary: {
          paid_income_ngn: 100000,
          pending_income_ngn: 0,
          unpaid_income_ngn: 0,
          actual_expense_ngn: 40000,
          committed_expense_ngn: 0,
          ticket_income_ngn: 50000,
          tickets_sold: 5,
          net_result_ngn: 110000,
        },
        ledgerRows: [
          {
            date: "2026-10-12",
            type: "Expense",
            category: "Hall",
            description: "Deposit",
            status: "paid",
            counterparty: "Venue Co",
            amount: "NGN 40,000",
          },
        ],
        narrative: null,
      }),
    );
    assert.ok(eventPdf instanceof Uint8Array);
    const eventParsed = await extractPdfText(eventPdf);
    assert.match(eventParsed.text, /Event Finance Report/);
    assert.match(eventParsed.text, /Annual Dinner/);

    const overviewPdf = await renderReportPdf(
      React.createElement(ClubOverviewPdfDocument, {
        periodLabel: "2026-10",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        generatedDate: "2026-11-10",
        facts: {
          club_finance: {
            period_dues_collected_ngn: 100000,
            period_other_income_ngn: 50000,
            period_expenses_ngn: 40000,
            current_club_balance_ngn: 500000,
            expense_by_category: [{ category: "Admin", amount: 40000, share_pct: 100 }],
          },
          dues: {
            active_members: 20,
            paid_rows_in_period: 18,
            unpaid_rows_in_period: 2,
            overdue_rows_as_of_end: 2,
            overdue_three_plus_members: 1,
            paid_amount_ngn: 90000,
            owed_through_end_ngn: 10000,
            collection_rate_pct: 90,
          },
          events: {
            events_count: 1,
            completed_count: 1,
            scheduled_count: 0,
            cancelled_count: 0,
            event_cash_in_ngn: 150000,
            event_cash_out_ngn: 40000,
            net_event_cash_ngn: 110000,
            ticket_revenue_ngn: 50000,
            tickets_sold: 5,
            top_events: [{ title: "Annual Dinner", net_result_ngn: 110000 }],
          },
          attendance: { sessions_count: 1, total_checkins: 22 },
        },
        narrative: null,
      }),
    );
    assert.ok(overviewPdf instanceof Uint8Array);
    const overviewParsed = await extractPdfText(overviewPdf);
    assert.match(overviewParsed.text, /Club Overview Report/);
  });
});
