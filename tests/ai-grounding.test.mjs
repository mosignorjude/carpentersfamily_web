import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadGroundingModule() {
  const compile = (src) =>
    `data:text/javascript;base64,${Buffer.from(
      ts.transpileModule(src, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    ).toString("base64")}`;

  const [pseudoSrc, docDraftsSrc, source] = await Promise.all([
    readFile(new URL("../src/lib/ai/pseudonymise.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/lib/ai/document-drafts.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/lib/ai/grounding.ts", import.meta.url), "utf8"),
  ]);

  const pseudoUrl = compile(pseudoSrc);
  const docDraftsUrl = compile(docDraftsSrc.replace("./pseudonymise", pseudoUrl));
  return import(compile(source.replace("./document-drafts", docDraftsUrl)));
}

const sampleFacts = {
  report: "club_finance",
  period: "2026-01-01..2026-11-10",
  currency: "NGN",
  totals: {
    dues_income: 1450000,
    other_income: 320000,
    expenses: 910000,
    event_inflow: 500000,
    event_outflow: 200000,
    balance: 2140000,
    voided_count: 2,
  },
  monthly: [
    { month: "2026-10", income: 210000, expenses: 95000 },
    { month: "2026-11", income: 110000, expenses: 50000 },
  ],
  expense_by_category: [
    { category: "Venue", amount: 400000, share_pct: 44 },
    { category: "Catering", amount: 300000, share_pct: 33 },
  ],
};

describe("AI narrative grounding & safety checks", () => {
  it("accepts narrative grounded in exact and derived fact numbers and valid dates", async () => {
    const mod = await loadGroundingModule();
    const result = mod.validateNarrativeContent(
      {
        headline: "Club reserve stands at NGN 2,140,000 through November 10, 2026.",
        highlights: [
          "Dues income (NGN 1,450,000) and other income (NGN 320,000) totalled NGN 1,770,000.",
          "Venue costs accounted for 44% of operating expenses at NGN 400,000.",
          "October 2026 recorded a monthly surplus of NGN 115,000.",
        ],
        risks: ["2 voided transactions were logged in the period."],
        recommendations: ["Continue tracking Venue commitments alongside Catering (NGN 300,000)."],
      },
      sampleFacts,
    );

    assert.equal(result.ok, true);
    assert.equal(result.content.highlights.length, 3);
  });

  it("rejects invented numbers not present in or derivable from facts", async () => {
    const mod = await loadGroundingModule();
    const result = mod.validateNarrativeContent(
      {
        headline: "Club reserve grew to NGN 3,500,000 this year.",
        highlights: ["Dues jumped by 78.4% over last month."],
        risks: ["9 voided transactions need review."],
        recommendations: [],
      },
      sampleFacts,
    );

    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes("3500000") || r.includes("3,500,000")));
    assert.ok(result.reasons.some((r) => r.includes("78.4")));
    assert.ok(result.reasons.some((r) => r.includes("9")));
  });

  it("rejects emails, @handles, phone numbers, URLs, and HTML markup", async () => {
    const mod = await loadGroundingModule();
    const cases = [
      {
        label: "email",
        headline: "Contact treasurer@club.example about NGN 2,140,000 balance.",
      },
      {
        label: "handle",
        headline: "Follow @olamide_a regarding NGN 2,140,000 balance.",
      },
      {
        label: "phone",
        headline: "Call +2348012345678 about NGN 2,140,000 balance.",
      },
      {
        label: "url",
        headline: "See https://evil.invalid for NGN 2,140,000 balance.",
      },
      {
        label: "html",
        headline: "Balance is <b>NGN 2,140,000</b> <script>alert(1)</script>.",
      },
    ];

    for (const c of cases) {
      const res = mod.validateNarrativeContent(
        {
          headline: c.headline,
          highlights: ["Dues income is NGN 1,450,000."],
          risks: [],
          recommendations: [],
        },
        sampleFacts,
      );
      assert.equal(res.ok, false, `Expected rejection for ${c.label}`);
    }
  });

  it("allows 3+ months phrasing when dues overdue_three_plus_members or three_plus_months is in facts", async () => {
    const mod = await loadGroundingModule();
    const duesFacts = {
      report: "dues",
      period: "2026-01-01..2026-11-10",
      currency: "NGN",
      totals: {
        distinct_members: 20,
        paid_amount_ngn: 400000,
        owed_through_as_of_ngn: 100000,
        collection_rate_pct: 80,
      },
      overdue_member_buckets: {
        zero_months: 12,
        one_month: 3,
        two_months: 1,
        three_plus_months: 4,
      },
    };

    const res = mod.validateNarrativeContent(
      {
        headline: "Dues collection rate is 80% across 20 members.",
        highlights: ["4 members are 3+ months overdue, while 12 members are fully current."],
        risks: ["NGN 100,000 remains owed through 2026-11-10."],
        recommendations: ["Follow up on the 1 member at 2 months overdue before hitting 3+ months."],
      },
      duesFacts,
    );
    assert.equal(res.ok, true);
  });
});
