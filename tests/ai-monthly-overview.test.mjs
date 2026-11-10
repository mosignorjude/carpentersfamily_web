import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadPeriodModule() {
  const source = await readFile(
    new URL("../src/lib/reports/period.ts", import.meta.url),
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

async function loadMonthlyCoreModule() {
  const periodSrc = await readFile(
    new URL("../src/lib/reports/period.ts", import.meta.url),
    "utf8",
  );
  const factsSrc = await readFile(
    new URL("../src/lib/ai/facts.ts", import.meta.url),
    "utf8",
  );
  const groundingSrc = await readFile(
    new URL("../src/lib/ai/grounding.ts", import.meta.url),
    "utf8",
  );
  const promptsSrc = await readFile(
    new URL("../src/lib/ai/prompts.ts", import.meta.url),
    "utf8",
  );
  const coreSrc = await readFile(
    new URL("../src/lib/reports/monthly-overview-core.ts", import.meta.url),
    "utf8",
  );

  const compile = (src) =>
    `data:text/javascript;base64,${Buffer.from(
      ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ).toString("base64")}`;

  const factsUrl = compile(factsSrc);
  const groundingUrl = compile(groundingSrc);
  const promptsUrl = compile(promptsSrc.replace("./facts", factsUrl));
  const periodUrl = compile(periodSrc);
  const rewrittenCore = coreSrc
    .replaceAll("@/lib/ai/facts", factsUrl)
    .replaceAll("@/lib/ai/grounding", groundingUrl)
    .replaceAll("@/lib/ai/prompts", promptsUrl)
    .replaceAll("./period", periodUrl);

  return import(compile(rewrittenCore));
}

const sampleOverviewRpc = {
  period_label: "2026-10",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  club_finance: {
    period_dues_collected_ngn: "150000",
    period_other_income_ngn: "50000",
    period_expenses_ngn: "80000",
    current_club_balance_ngn: "1200000",
    expense_by_category: [{ category: "Venue", amount: "80000" }],
  },
  dues: {
    active_members: "30",
    paid_rows_in_period: "24",
    unpaid_rows_in_period: "6",
    overdue_rows_as_of_end: "4",
    overdue_three_plus_members: "2",
    paid_amount_ngn: "120000",
    owed_through_end_ngn: "30000",
  },
  events: {
    events_count: "1",
    completed_count: "1",
    scheduled_count: "0",
    cancelled_count: "0",
    event_cash_in_ngn: "100000",
    event_cash_out_ngn: "40000",
    ticket_revenue_ngn: "60000",
    tickets_sold: "12",
    top_events: [{ title: "October Dinner", net_result_ngn: "60000" }],
  },
  attendance: {
    sessions_count: "1",
    total_checkins: "24",
  },
};

describe("monthly overview period and job orchestration", () => {
  it("computes previous WAT month ranges including Jan wrap and leap Feb", async () => {
    const period = await loadPeriodModule();
    assert.deepEqual(
      period.previousMonthPeriodWAT(new Date("2026-01-01T06:00:00Z")),
      {
        periodParam: "month:2025-12",
        periodLabel: "2025-12",
        periodStart: "2025-12-01",
        periodEnd: "2025-12-31",
      },
    );
    assert.deepEqual(
      period.previousMonthPeriodWAT(new Date("2024-03-01T06:00:00Z")),
      {
        periodParam: "month:2024-02",
        periodLabel: "2024-02",
        periodStart: "2024-02-01",
        periodEnd: "2024-02-29",
      },
    );
    assert.equal(period.parseOverviewPeriod("month:2026-13"), null);
    assert.deepEqual(period.parseOverviewPeriod("year:2026"), {
      periodParam: "year:2026",
      periodLabel: "2026",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
  });

  it("publishes draft and queues officer emails with review link and deterministic idempotency", async () => {
    const mod = await loadMonthlyCoreModule();
    const publishedCalls = [];
    const queuedEmails = [];

    const summary = await mod.runMonthlyOverviewJob(
      {
        loadOverviewData: async () => sampleOverviewRpc,
        generateNarrative: async () => ({
          provider: "gemini",
          model: "gemini-3.5-flash-lite",
          data: {
            headline:
              "October closed with NGN 1,200,000 club balance and 80% dues collection.",
            highlights: [
              "Dues collected totalled NGN 150,000 across 24 paid rows.",
            ],
            risks: ["2 members are 3+ months overdue."],
            recommendations: [
              "Review overdue reminders before November close.",
            ],
          },
        }),
        publishMonthlyOverview: async (args) => {
          publishedCalls.push(args);
          return "narr-1";
        },
        resolveOfficers: async () => [
          { email: "pres@club.test", userId: "u1", name: "President" },
          { email: "exec@club.test", userId: "u2", name: "Treasurer" },
        ],
        enqueueEmail: async (email) => {
          queuedEmails.push(email);
          return "outbox-1";
        },
      },
      new Date("2026-11-01T06:00:00Z"),
    );

    assert.equal(summary.aiIncluded, true);
    assert.equal(publishedCalls.length, 1);
    assert.equal(publishedCalls[0].periodLabel, "2026-10");
    assert.equal(queuedEmails.length, 2);
    assert.equal(
      queuedEmails[0].ctaPath,
      "/officers/reports?period=month:2026-10",
    );
    assert.match(queuedEmails[0].idempotencyKey, /^monthly_overview:2026-10:/);
    assert.equal(queuedEmails[0].attachments, undefined);
  });

  it("still notifies and emails deterministic totals when AI provider fails", async () => {
    const mod = await loadMonthlyCoreModule();
    const publishedCalls = [];
    const queuedEmails = [];

    const summary = await mod.runMonthlyOverviewJob(
      {
        loadOverviewData: async () => sampleOverviewRpc,
        generateNarrative: async () => {
          throw new Error("429 Too Many Requests");
        },
        publishMonthlyOverview: async (args) => {
          publishedCalls.push(args);
          return null;
        },
        resolveOfficers: async () => [
          { email: "pres@club.test", userId: "u1", name: "President" },
        ],
        enqueueEmail: async (email) => {
          queuedEmails.push(email);
          return "outbox-2";
        },
      },
      new Date("2026-11-01T06:00:00Z"),
    );

    assert.equal(summary.aiIncluded, false);
    assert.equal(publishedCalls.length, 1);
    assert.equal(publishedCalls[0].content, null);
    assert.equal(queuedEmails.length, 1);
    assert.match(queuedEmails[0].aiStatusNote, /AI summary unavailable/i);
  });

  it("guards the internal route with authorizeCronRequest and links monthly overview notifications", async () => {
    const routeSource = await readFile(
      new URL(
        "../src/app/api/internal/reports/monthly-overview/route.ts",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(routeSource, /authorizeCronRequest\(request\.headers\)/);
    assert.match(routeSource, /export const maxDuration = 30/);

    const { getNotificationHref } = await import(
      "../src/lib/notification-page-presentation.mjs"
    );
    assert.equal(
      getNotificationHref({
        category: "officer_money",
        title: "Monthly overview ready (2026-10)",
        body: "The AI-assisted monthly club overview draft for 2026-10 is ready for officer review.",
      }),
      "/officers/reports",
    );
  });
});
