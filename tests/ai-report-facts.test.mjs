import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

async function loadFactsModule() {
  const source = await readFile(
    new URL("../src/lib/ai/facts.ts", import.meta.url),
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

describe("anonymised AI report facts builders", () => {
  it("strips all free-text fields, names, and receipt details from club finance facts", async () => {
    const factsMod = await loadFactsModule();
    const facts = factsMod.buildClubFinanceFacts({
      year: 2026,
      asOf: "2026-11-10",
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
          id: "txn-secret-1",
          kind: "income",
          is_opening_balance: true,
          amount_ngn: "1000000",
          transaction_date: "2026-10-01",
          description: "Opening balance from Chief Adaobi Nnamdi",
          category_name_snapshot: "Reserve",
          payer_payee: "Chief Adaobi Nnamdi",
          source_note: "Bank statement ref 998877",
          voided_at: null,
          void_reason: null,
        },
        {
          id: "txn-2",
          kind: "expense",
          is_opening_balance: false,
          amount_ngn: "400000",
          transaction_date: "2026-10-15",
          description: "Hall rental paid to Ọlámidé <script>alert(1)</script>",
          category_name_snapshot: "Venue\t\nHire",
          payer_payee: "@olamide_vendor",
          source_note: "Transfer to 08012345678",
          voided_at: null,
          void_reason: null,
        },
        {
          id: "txn-3",
          kind: "expense",
          is_opening_balance: false,
          amount_ngn: "100000",
          transaction_date: "2026-10-18",
          description: "Mistaken entry",
          category_name_snapshot: "Catering",
          payer_payee: "Tunde Bakare",
          source_note: "Oops",
          voided_at: "2026-10-19T10:00:00Z",
          void_reason: "Duplicate receipt #42",
        },
      ],
    });

    const serialized = JSON.stringify(facts);
    for (const forbidden of [
      "Adaobi",
      "Nnamdi",
      "Ọlámidé",
      "olamide_vendor",
      "08012345678",
      "998877",
      "Tunde",
      "Bakare",
      "Duplicate receipt",
      "<script>",
      "txn-secret-1",
    ]) {
      assert.ok(!serialized.includes(forbidden), `Leaked forbidden value: ${forbidden}`);
    }

    assert.equal(facts.report, "club_finance");
    assert.equal(facts.totals.dues_income, 1450000);
    assert.equal(facts.totals.balance, 2140000);
    assert.equal(facts.totals.opening_balance_total, 1000000);
    assert.equal(facts.totals.voided_count, 1);
    assert.deepEqual(facts.expense_by_category, [
      { category: "Venue Hire", amount: 400000, share_pct: 100 },
    ]);
    assert.deepEqual(facts.monthly, [
      { month: "2026-10", income: 0, expenses: 400000 },
    ]);
  });

  it("aggregates dues facts strictly without member IDs, names, or usernames", async () => {
    const factsMod = await loadFactsModule();
    const clubRows = [
      {
        member_id: "m-1",
        full_name: "Ọlámidé Adeyemi",
        username: "olamide_a",
        covered_month: "2026-08-01",
        amount_ngn: "5000",
        status: "unpaid",
        due_date: "2026-08-31",
        is_overdue: true,
      },
      {
        member_id: "m-1",
        full_name: "Ọlámidé Adeyemi",
        username: "olamide_a",
        covered_month: "2026-09-01",
        amount_ngn: "5000",
        status: "unpaid",
        due_date: "2026-09-30",
        is_overdue: true,
      },
      {
        member_id: "m-1",
        full_name: "Ọlámidé Adeyemi",
        username: "olamide_a",
        covered_month: "2026-10-01",
        amount_ngn: "5000",
        status: "unpaid",
        due_date: "2026-10-31",
        is_overdue: true,
      },
      {
        member_id: "m-2",
        full_name: "Chinedu Okafor",
        username: "chinedu",
        covered_month: "2026-10-01",
        amount_ngn: "5000",
        status: "paid",
        due_date: "2026-10-31",
        is_overdue: false,
      },
      {
        member_id: "m-2",
        full_name: "Chinedu Okafor",
        username: "chinedu",
        covered_month: "2026-11-01",
        amount_ngn: "5000",
        status: "unpaid",
        due_date: "2026-11-30",
        is_overdue: false,
      },
    ];

    const facts = factsMod.buildDuesFacts({
      year: 2026,
      asOf: "2026-11-10",
      rows: clubRows,
    });

    const serialized = JSON.stringify(facts);
    for (const forbidden of [
      "m-1",
      "m-2",
      "Ọlámidé",
      "Adeyemi",
      "olamide_a",
      "Chinedu",
      "Okafor",
      "chinedu",
    ]) {
      assert.ok(!serialized.includes(forbidden), `Leaked PII: ${forbidden}`);
    }

    assert.equal(facts.totals.distinct_members, 2);
    assert.equal(facts.totals.paid_rows, 1);
    assert.equal(facts.totals.overdue_rows, 3);
    assert.equal(facts.totals.upcoming_rows, 0);
    assert.equal(facts.totals.paid_amount_ngn, 5000);
    assert.equal(facts.totals.owed_through_as_of_ngn, 15000);
    assert.equal(facts.totals.collection_rate_pct, 25);
    assert.deepEqual(facts.overdue_member_buckets, {
      zero_months: 1,
      one_month: 0,
      two_months: 0,
      three_plus_months: 1,
    });

    // Fingerprint isolation: single-member rows produce a distinct fingerprint
    const selfFacts = factsMod.buildDuesFacts({
      year: 2026,
      asOf: "2026-11-10",
      rows: clubRows.filter((r) => r.member_id === "m-2"),
    });
    assert.notEqual(
      factsMod.factsFingerprint(facts),
      factsMod.factsFingerprint(selfFacts),
    );
  });

  it("strips buyer names and unapproved ticket noise from event finance facts", async () => {
    const factsMod = await loadFactsModule();
    const facts = factsMod.buildEventFinanceFacts({
      eventTitle: "Founders Gala 2026",
      from: null,
      to: null,
      summary: {
        paid_income_ngn: 100000,
        pending_income_ngn: 20000,
        unpaid_income_ngn: 0,
        actual_expense_ngn: 60000,
        committed_expense_ngn: 15000,
        ticket_income_ngn: 50000,
        tickets_sold: 2,
        net_result_ngn: 90000,
      },
      transactions: [
        {
          kind: "expense",
          amount_ngn: 60000,
          transaction_date: "2026-11-01",
          category_name_snapshot: "Sound & Lighting",
          payment_status: "paid",
          description: "DJ Emeka",
          payer_payee: "Emeka Obi",
          source_note: "Cash to DJ",
        },
      ],
      sales: [
        {
          tier_name: "VIP Table",
          quantity: 2,
          amount_ngn: 50000,
          refunded_at: null,
          verification_status: "approved",
          buyer_name: "Ngozi Eze",
        },
        {
          tier_name: "VIP Table",
          quantity: 1,
          amount_ngn: 25000,
          refunded_at: null,
          verification_status: "recorded",
          buyer_name: "Unverified Guest",
        },
      ],
    });

    const serialized = JSON.stringify(facts);
    for (const forbidden of [
      "DJ Emeka",
      "Emeka Obi",
      "Cash to DJ",
      "Ngozi Eze",
      "Unverified Guest",
    ]) {
      assert.ok(!serialized.includes(forbidden), `Leaked PII: ${forbidden}`);
    }

    assert.equal(facts.summary.net_result_ngn, 90000);
    assert.equal(facts.pending_ticket_orders_count, 1);
    assert.deepEqual(facts.ticket_tiers, [
      {
        tier: "VIP Table",
        approved_qty: 2,
        approved_amount: 50000,
        refunded_qty: 0,
      },
    ]);
  });

  it("computes deterministic canonical SHA-256 fingerprints", async () => {
    const factsMod = await loadFactsModule();
    const fpA = factsMod.factsFingerprint({ b: 2, a: { y: 20, x: 10 } });
    const fpB = factsMod.factsFingerprint({ a: { x: 10, y: 20 }, b: 2 });
    const fpC = factsMod.factsFingerprint({ a: { x: 10, y: 21 }, b: 2 });
    assert.match(fpA, /^[a-f0-9]{64}$/);
    assert.equal(fpA, fpB);
    assert.notEqual(fpA, fpC);
  });

  it("sanitizes labels and computes collection/net metrics in club overview facts", async () => {
    const factsMod = await loadFactsModule();
    const facts = factsMod.buildClubOverviewFacts({
      period_label: "2026-10",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      club_finance: {
        period_dues_collected_ngn: "150000",
        period_other_income_ngn: "50000",
        period_expenses_ngn: "80000",
        current_club_balance_ngn: "1200000",
        expense_by_category: [{ category: "Hall <script>", amount: "40000" }],
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
        events_count: "2",
        completed_count: "1",
        scheduled_count: "1",
        cancelled_count: "0",
        event_cash_in_ngn: "100000",
        event_cash_out_ngn: "40000",
        ticket_revenue_ngn: "60000",
        tickets_sold: "12",
        top_events: [{ title: "Gala\n<Night>", net_result_ngn: "60000" }],
      },
      attendance: {
        sessions_count: "2",
        total_checkins: "48",
      },
    });

    assert.equal(facts.dues.collection_rate_pct, 80);
    assert.equal(facts.events.net_event_cash_ngn, 60000);
    assert.equal(facts.club_finance.expense_by_category[0].share_pct, 50);
    assert.ok(!JSON.stringify(facts).includes("<script>"));
    assert.ok(!JSON.stringify(facts).includes("<Night>"));
  });
});
