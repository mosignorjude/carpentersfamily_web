import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToBuffer } from "@react-pdf/renderer";
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
  tempDir = await mkdtemp(path.join(cacheParent, ".tmp-ai-drafts-"));
  await writeFile(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  const sources = [
    ["src/lib/brand.ts", "brand.js", false],
    ["src/lib/report-export.ts", "report-export.js", false],
    ["src/lib/reports/period.ts", "period.js", false],
    ["src/lib/ai/pseudonymise.ts", "pseudonymise.js", false],
    ["src/lib/ai/facts.ts", "facts.js", false],
    ["src/lib/ai/report-spec.ts", "report-spec.js", false],
    ["src/lib/ai/request-guard.ts", "request-guard.js", false],
    ["src/lib/ai/api-schemas.ts", "api-schemas.js", false],
    ["src/lib/ai/document-drafts.ts", "document-drafts.js", false],
    ["src/lib/ai/grounding.ts", "grounding.js", false],
    ["src/lib/ai/prompts.ts", "prompts.js", false],
    ["src/lib/reports/drafts-core.ts", "drafts-core.js", false],
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
      .replace(/from\s+["']\.\/report-spec["']/g, 'from "./report-spec.js"')
      .replace(/from\s+["']\.\/request-guard["']/g, 'from "./request-guard.js"')
      .replace(/from\s+["']\.\/fonts["']/g, 'from "./fonts.js"')
      .replace(/from\s+["']\.\/components["']/g, 'from "./components.js"')
      .replace(
        /from\s+["']@\/lib\/ai\/api-schemas["']/g,
        'from "./api-schemas.js"',
      )
      .replace(
        /from\s+["']@\/lib\/ai\/document-drafts["']/g,
        'from "./document-drafts.js"',
      )
      .replace(/from\s+["']@\/lib\/ai\/facts["']/g, 'from "./facts.js"')
      .replace(
        /from\s+["']@\/lib\/reports\/period["']/g,
        'from "./period.js"',
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

describe("Phase 3 formal document drafting, grounding, PDFs & Meeting Hub integration", () => {
  it("computes YoY AGM comparative statement facts cleanly without PII", async () => {
    const dir = await buildModules();
    const [factsMod, draftsCore] = await Promise.all([
      import(pathToFileURL(path.join(dir, "facts.js")).href),
      import(pathToFileURL(path.join(dir, "drafts-core.js")).href),
    ]);

    const agmFacts = factsMod.buildAgmStatementFacts({
      fiscalYear: 2026,
      currentOverview: {
        period_label: "2026",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        club_finance: {
          period_dues_collected_ngn: "1200000",
          period_other_income_ngn: "300000",
          period_expenses_ngn: "600000",
          current_club_balance_ngn: "2400000",
          expense_by_category: [{ category: "Venue\n<img src=x>", amount: "600000" }],
        },
        dues: {
          active_members: 40,
          paid_rows_in_period: 360,
          unpaid_rows_in_period: 120,
          overdue_rows_as_of_end: 20,
          overdue_three_plus_members: 4,
          paid_amount_ngn: "1200000",
          owed_through_end_ngn: "300000",
        },
        events: {
          events_count: 3,
          completed_count: 2,
          scheduled_count: 1,
          cancelled_count: 0,
          event_cash_in_ngn: "900000",
          event_cash_out_ngn: "500000",
          ticket_revenue_ngn: "750000",
          tickets_sold: 75,
          top_events: [{ title: "Founders Gala", net_result_ngn: "400000" }],
        },
        attendance: { sessions_count: 10, total_checkins: 280 },
      },
      priorOverview: {
        period_label: "2025",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        club_finance: {
          period_dues_collected_ngn: "1000000",
          period_other_income_ngn: "200000",
          period_expenses_ngn: "500000",
          current_club_balance_ngn: "1500000",
          expense_by_category: [{ category: "Venue", amount: "500000" }],
        },
        dues: {
          active_members: 35,
          paid_rows_in_period: 300,
          unpaid_rows_in_period: 120,
          overdue_rows_as_of_end: 30,
          overdue_three_plus_members: 6,
          paid_amount_ngn: "1000000",
          owed_through_end_ngn: "250000",
        },
        events: {
          events_count: 2,
          completed_count: 2,
          scheduled_count: 0,
          cancelled_count: 0,
          event_cash_in_ngn: "600000",
          event_cash_out_ngn: "400000",
          ticket_revenue_ngn: "500000",
          tickets_sold: 50,
          top_events: [],
        },
        attendance: { sessions_count: 9, total_checkins: 220 },
      },
    });

    assert.equal(agmFacts.current.total_inflows_ngn, 2_400_000);
    assert.equal(agmFacts.current.total_outflows_ngn, 1_100_000);
    assert.equal(agmFacts.current.net_surplus_ngn, 1_300_000);
    assert.equal(agmFacts.prior.total_inflows_ngn, 1_800_000);
    assert.equal(agmFacts.yoy_change.dues_collected_delta_ngn, 200_000);
    assert.equal(agmFacts.yoy_change.dues_collected_delta_pct, 20);
    assert.equal(
      agmFacts.current.expense_by_category[0].category,
      "Venue img src=x",
    );

    const rows = draftsCore.buildAgmComparisonRows(agmFacts);
    assert.equal(rows.length, 10);
    assert.equal(rows[0].varianceValue, 200_000);
    assert.equal(rows[0].variancePct, 20);
  });

  it("validates AGM/Treasurer numeric grounding and structured Meeting Minutes safety", async () => {
    const dir = await buildModules();
    const [factsMod, grounding, docDrafts] = await Promise.all([
      import(pathToFileURL(path.join(dir, "facts.js")).href),
      import(pathToFileURL(path.join(dir, "grounding.js")).href),
      import(pathToFileURL(path.join(dir, "document-drafts.js")).href),
    ]);

    const treasurerFacts = factsMod.buildTreasurerReportFacts({
      overview: {
        period_label: "2026-10",
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        club_finance: {
          period_dues_collected_ngn: "450000",
          period_other_income_ngn: "50000",
          period_expenses_ngn: "180000",
          current_club_balance_ngn: "2400000",
          expense_by_category: [{ category: "Refreshments", amount: "180000" }],
        },
        dues: {
          active_members: 40,
          paid_rows_in_period: 36,
          unpaid_rows_in_period: 4,
          overdue_rows_as_of_end: 5,
          overdue_three_plus_members: 2,
          paid_amount_ngn: "450000",
          owed_through_end_ngn: "50000",
        },
        events: {
          events_count: 1,
          completed_count: 1,
          scheduled_count: 0,
          cancelled_count: 0,
          event_cash_in_ngn: "200000",
          event_cash_out_ngn: "120000",
          ticket_revenue_ngn: "150000",
          tickets_sold: 15,
          top_events: [{ title: "October Fellowship", net_result_ngn: "80000" }],
        },
        attendance: { sessions_count: 1, total_checkins: 32 },
      },
    });

    const validTreasurerDraft = {
      title: "Treasurer's Report for 2026-10",
      summary:
        "I present the treasury position for 2026-10 showing total inflows of NGN 700,000 and a closing reserve of NGN 2,400,000.",
      sections: [
        {
          key: "opening_remarks",
          heading: "Treasurer's Opening Remarks",
          body: "During 2026-10 total inflows reached NGN 700,000 against outflows of NGN 300,000, leaving a net cash flow of NGN 400,000.",
        },
        {
          key: "dues_and_treasury",
          heading: "Club Treasury & Dues Collection Review",
          body: "Dues collected totalled NGN 450,000 (90% collection rate across 40 active members), with 2 members at 3+ months arrears.",
        },
        {
          key: "events_and_spending",
          heading: "Operating Expenditure & Event Performance",
          body: "Operating expenses in Refreshments stood at NGN 180,000 while October Fellowship posted a net cash result of NGN 80,000.",
        },
        {
          key: "forward_outlook",
          heading: "Stewardship Outlook & Priorities",
          body: "Our priority remains clearing the NGN 50,000 owed through period end while preserving our NGN 2,400,000 balance.",
        },
      ],
      recommendations: [
        "Follow up with the 2 members 3+ months in arrears to recover NGN 50,000.",
      ],
    };

    const okRes = grounding.validateFormalDraftContent(
      "treasurer_report",
      validTreasurerDraft,
      treasurerFacts,
    );
    assert.equal(okRes.ok, true);

    const hallucinated = structuredClone(validTreasurerDraft);
    hallucinated.sections[0].body =
      "Total reserves magically jumped to NGN 9,999,999 during 2026-10.";
    const badRes = grounding.validateFormalDraftContent(
      "treasurer_report",
      hallucinated,
      treasurerFacts,
    );
    assert.equal(badRes.ok, false);

    // Minutes safety + unresolved token detection + formatting under 20,000 chars
    const minutesWithHallucinatedToken = {
      title: "Official Minutes — Monthly General Meeting",
      summary: "Called to order at 5:00 PM WAT with 32 members checked in.",
      sections: [
        { key: "attendance", heading: "Attendance", body: "Ọlámidé Adeyemi and 31 other members present." },
        { key: "agenda", heading: "Agenda", body: "1. Treasury update\n2. Welfare pledge NGN 25,000" },
        { key: "discussion", heading: "Discussion", body: "Discussed logistics with [Member 99]." },
        { key: "resolutions", heading: "Resolutions", body: "Adopted the logistics budget unanimously." },
        { key: "action_items", heading: "Action Items", body: "Secretariat to send reminder email." },
      ],
      recommendations: [],
    };

    const minChecked = grounding.validateMinutesDraftContent(
      minutesWithHallucinatedToken,
    );
    assert.equal(minChecked.ok, true);
    assert.deepEqual(minChecked.unresolvedTokens, ["[Member 99]"]);

    const formatted = docDrafts.formatMinutesForEventRecord(minChecked.content, {
      title: "Monthly General Meeting",
      dateLabel: "2026-11-11",
      location: "Asaba Clubhouse",
    });
    assert.ok(formatted.includes("1. Attendance"));
    assert.ok(formatted.includes("5. Action Items"));
    assert.ok(formatted.length < 20_000);
  });

  it("renders AGM, Treasurer, and Meeting Minutes branded PDFs with Unicode & zero dangerous actions", async () => {
    const dir = await buildModules();
    const [factsMod, draftsCore, docsMod] = await Promise.all([
      import(pathToFileURL(path.join(dir, "facts.js")).href),
      import(pathToFileURL(path.join(dir, "drafts-core.js")).href),
      import(pathToFileURL(path.join(dir, "documents.js")).href),
    ]);

    const agmFacts = factsMod.buildAgmStatementFacts({
      fiscalYear: 2026,
      currentOverview: {
        period_label: "2026",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        club_finance: {
          period_dues_collected_ngn: "1200000",
          period_other_income_ngn: "100000",
          period_expenses_ngn: "400000",
          current_club_balance_ngn: "1900000",
          expense_by_category: [{ category: "Welfare", amount: "400000" }],
        },
        dues: {
          active_members: 25,
          paid_rows_in_period: 250,
          unpaid_rows_in_period: 50,
          overdue_rows_as_of_end: 10,
          overdue_three_plus_members: 1,
          paid_amount_ngn: "1200000",
          owed_through_end_ngn: "200000",
        },
        events: {
          events_count: 1,
          completed_count: 1,
          scheduled_count: 0,
          cancelled_count: 0,
          event_cash_in_ngn: "500000",
          event_cash_out_ngn: "300000",
          ticket_revenue_ngn: "500000",
          tickets_sold: 50,
          top_events: [{ title: "Gala", net_result_ngn: "200000" }],
        },
        attendance: { sessions_count: 4, total_checkins: 90 },
      },
      priorOverview: {
        period_label: "2025",
        period_start: "2025-01-01",
        period_end: "2025-12-31",
        club_finance: {
          period_dues_collected_ngn: "900000",
          period_other_income_ngn: "0",
          period_expenses_ngn: "350000",
          current_club_balance_ngn: "1000000",
          expense_by_category: [],
        },
        dues: {
          active_members: 20,
          paid_rows_in_period: 200,
          unpaid_rows_in_period: 40,
          overdue_rows_as_of_end: 8,
          overdue_three_plus_members: 2,
          paid_amount_ngn: "900000",
          owed_through_end_ngn: "150000",
        },
        events: {
          events_count: 1,
          completed_count: 1,
          scheduled_count: 0,
          cancelled_count: 0,
          event_cash_in_ngn: "200000",
          event_cash_out_ngn: "150000",
          ticket_revenue_ngn: "200000",
          tickets_sold: 20,
          top_events: [],
        },
        attendance: { sessions_count: 3, total_checkins: 60 },
      },
    });

    const agmBuf = await renderToBuffer(
      createElement(docsMod.AgmStatementPdfDocument, {
        fiscalYear: 2026,
        generatedDate: "2026-11-11",
        facts: agmFacts,
        comparisonRows: draftsCore.buildAgmComparisonRows(agmFacts),
        draft: {
          title: "AGM Financial Statement FY 2026",
          summary: "Overview prepared for FY 2026 AGM.",
          sections: [
            { key: "executive_overview", heading: "Executive Overview", body: "Inflows rose strongly." },
            { key: "income_analysis", heading: "Income & Revenue", body: "Dues reached NGN 1,200,000." },
            { key: "expenditure_analysis", heading: "Expenditure", body: "Welfare totalled NGN 400,000." },
            { key: "surplus_and_position", heading: "Surplus & Position", body: "Closing balance NGN 1,900,000." },
          ],
          recommendations: ["Collect NGN 200,000 arrears."],
        },
        approvedByName: "Ọlámidé Adeyemi",
        approvedAt: "2026-11-11",
      }),
    );

    const minBuf = await renderToBuffer(
      createElement(docsMod.MeetingMinutesPdfDocument, {
        meetingTitle: "November General Meeting",
        meetingDateLabel: "2026-11-11 WAT",
        location: "Asaba Clubhouse",
        generatedDate: "2026-11-11",
        revisionLabel: "Revision 1",
        attendanceSummaryLabel: "24 present · 2 late · 0 absent/excused",
        draft: {
          title: "Official Minutes — November General Meeting",
          summary: "Regular monthly meeting convened at 5pm.",
          sections: [
            { key: "attendance", heading: "Attendance", body: "Chaired by Ọlámidé Adeyemi." },
            { key: "agenda", heading: "Agenda", body: "Financial review and Gala prep." },
            { key: "discussion", heading: "Discussion", body: "Budget approved cleanly." },
            { key: "resolutions", heading: "Resolutions", body: "Motion adopted." },
            { key: "action_items", heading: "Action Items", body: "Ọlámidé Adeyemi to circulate circular." },
          ],
          recommendations: [],
        },
        approvedByName: "Ọlámidé Adeyemi",
        approvedAt: "2026-11-11",
      }),
    );

    for (const buf of [agmBuf, minBuf]) {
      const latin = Buffer.from(buf).toString("latin1");
      assert.doesNotMatch(latin, /\/JavaScript|\/JS|\/OpenAction/);

      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += `${content.items.map((item) => item.str).join(" ")}\n`;
      }
      assert.match(text, /Ọlámidé Adeyemi/);
    }
  });

  it("enforces officer auth, same-origin checks, Meeting Hub RPC publishing, and UI wiring", async () => {
    const readText = (relPath) =>
      readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

    const [
      draftsRoute,
      patchRoute,
      approveRoute,
      regenRoute,
      publishRoute,
      pdfDraftsRoute,
      editorUi,
      overviewClient,
      hubView,
    ] = await Promise.all([
      readText("src/app/api/ai-reports/drafts/route.ts"),
      readText("src/app/api/ai-reports/drafts/[id]/route.ts"),
      readText("src/app/api/ai-reports/drafts/[id]/approve/route.ts"),
      readText("src/app/api/ai-reports/drafts/[id]/regenerate/route.ts"),
      readText("src/app/api/ai-reports/drafts/[id]/publish-minutes/route.ts"),
      readText("src/app/api/reports/drafts/route.ts"),
      readText("src/components/reports/document-draft-editor.tsx"),
      readText("src/components/reports/club-overview-client.tsx"),
      readText("src/components/attendance/attendance-hub-view.tsx"),
    ]);

    for (const r of [
      draftsRoute,
      patchRoute,
      approveRoute,
      regenRoute,
      publishRoute,
    ]) {
      assert.match(r, /requireOfficer/);
      assert.match(r, /isSameSiteOrigin/);
    }

    assert.match(publishRoute, /save_event_minutes/);
    assert.match(publishRoute, /revalidatePath\("\/meeting-hub"\)/);
    assert.match(pdfDraftsRoute, /createSimplePdf/);
    assert.match(pdfDraftsRoute, /log_ai_report_event/);
    assert.match(editorUi, /What the AI Will See/);
    assert.match(overviewClient, /DocumentDraftEditor/);
    assert.match(hubView, /\/api\/reports\/drafts\?reportType=minutes/);
  });
});
