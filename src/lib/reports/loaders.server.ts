import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AiReportType,
  buildClubFinanceFacts,
  buildClubOverviewFacts,
  buildDuesFacts,
  buildEventFinanceFacts,
  type ClubOverviewRpcInput,
  factsFingerprint,
} from "@/lib/ai/facts";
import type { AiNarrativeContent } from "@/lib/ai/grounding";
import type { ReportSpec } from "@/lib/ai/report-spec";
import type { PdfNarrativeSummary } from "@/lib/pdf/components";
import { getWATDate, MAX_REPORT_ROWS, wholeNgn } from "@/lib/report-export";
import {
  currentMonthPeriodWAT,
  formatWatDate,
  type OverviewPeriod,
  parseOverviewPeriod,
} from "./period";
import { executeCustomReportSpec } from "./spec-executor.server";

export type ClubFinanceTxnRow = {
  id: string;
  kind: string;
  amount_ngn: string | number;
  transaction_date: string;
  description: string | null;
  category_name_snapshot: string | null;
  payer_payee: string | null;
  source_note: string | null;
  is_opening_balance: boolean;
  voided_at: string | null;
  void_reason: string | null;
  payment_method?: string | null;
};

export type DuesReportRow = {
  member_id: string;
  full_name: string;
  username: string;
  covered_month: string;
  amount_ngn: string | number | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

export type MemberProfileMini = {
  id: string;
  full_name: string;
  username: string;
};

export type EventTxnRow = {
  id: string;
  kind: "income" | "expense";
  amount_ngn: number | string;
  transaction_date: string;
  description: string | null;
  source_note: string | null;
  payer_payee: string | null;
  payment_method: string | null;
  category_name_snapshot: string | null;
  budget_allocation_name_snapshot: string | null;
  payment_status: string;
};

export type EventSaleRow = {
  id: string;
  tier_id: string;
  buyer_name: string | null;
  quantity: number;
  unit_price_ngn: number | string;
  amount_ngn: number | string;
  payment_method: string | null;
  created_at: string;
  refunded_at: string | null;
  verification_status: "recorded" | "approved" | "rejected" | "cancelled";
};

export type EventReportSummaryRow = {
  paid_income_ngn: number | string;
  pending_income_ngn: number | string;
  unpaid_income_ngn: number | string;
  actual_expense_ngn: number | string;
  committed_expense_ngn: number | string;
  ticket_income_ngn: number | string;
  tickets_sold: number | string;
  net_result_ngn: number | string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportRowCount(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,18}$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export async function loadClubFinanceSnapshot(
  supabase: SupabaseClient,
  year: number,
) {
  const reportResult = await supabase.rpc("club_finance_report_data");
  if (reportResult.error || !isRecord(reportResult.data)) {
    return { kind: "unavailable" as const };
  }
  const rowCount = reportRowCount(reportResult.data.row_count);
  const reportAsOf = reportResult.data.as_of;
  const summary = reportResult.data.summary;
  const transactionData = reportResult.data.transactions;

  if (
    reportResult.data.year !== year ||
    rowCount === null ||
    typeof reportAsOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(reportAsOf) ||
    reportAsOf.slice(0, 4) !== String(year) ||
    !isRecord(summary) ||
    !Array.isArray(transactionData)
  ) {
    return { kind: "unavailable" as const };
  }
  if (rowCount > BigInt(MAX_REPORT_ROWS)) {
    return { kind: "too-large" as const };
  }
  if (transactionData.some((txn) => !isRecord(txn))) {
    return { kind: "unavailable" as const };
  }
  const transactions = transactionData as ClubFinanceTxnRow[];
  if (transactions.length !== Number(rowCount)) {
    return { kind: "unavailable" as const };
  }

  for (const field of [
    "dues_income",
    "other_income",
    "expenses",
    "event_inflow",
    "event_outflow",
    "balance",
  ] as const) {
    if (wholeNgn(summary[field] as string | number) === null) {
      return { kind: "unavailable" as const };
    }
  }

  if (
    transactions.some((txn) => {
      const amount = wholeNgn(txn.amount_ngn);
      return (
        typeof txn.id !== "string" ||
        typeof txn.kind !== "string" ||
        typeof txn.is_opening_balance !== "boolean" ||
        typeof txn.transaction_date !== "string" ||
        !["income", "expense"].includes(txn.kind) ||
        amount === null ||
        amount <= BigInt(0) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(txn.transaction_date) ||
        txn.transaction_date.slice(0, 4) !== String(year) ||
        [
          txn.description,
          txn.category_name_snapshot,
          txn.payer_payee,
          txn.source_note,
          txn.voided_at,
          txn.void_reason,
        ].some((value) => value !== null && typeof value !== "string")
      );
    })
  ) {
    return { kind: "unavailable" as const };
  }

  const receiptsByTransaction = new Map<string, string[]>();
  if (transactions.length > 0) {
    const receiptResult = await supabase
      .from("finance_receipts")
      .select("club_transaction_id, original_filename", { count: "exact" })
      .in(
        "club_transaction_id",
        transactions.map((txn) => txn.id),
      )
      .order("created_at", { ascending: true })
      .limit(MAX_REPORT_ROWS);
    if (receiptResult.error) return { kind: "unavailable" as const };
    if ((receiptResult.count ?? 0) > MAX_REPORT_ROWS) {
      return { kind: "too-large" as const };
    }
    for (const receipt of receiptResult.data ?? []) {
      if (!receipt.club_transaction_id) continue;
      const current =
        receiptsByTransaction.get(receipt.club_transaction_id) ?? [];
      current.push(receipt.original_filename);
      receiptsByTransaction.set(receipt.club_transaction_id, current);
    }
  }

  const typedSummary = summary as {
    dues_income: string | number;
    other_income: string | number;
    expenses: string | number;
    event_inflow: string | number;
    event_outflow: string | number;
    balance: string | number;
  };
  const facts = buildClubFinanceFacts({
    year,
    asOf: reportAsOf,
    summary: typedSummary,
    transactions,
  });

  return {
    kind: "ok" as const,
    year,
    asOf: reportAsOf,
    periodStart: `${year}-01-01`,
    periodEnd: reportAsOf,
    summary: typedSummary,
    transactions,
    receiptsByTransaction,
    facts,
    fingerprint: factsFingerprint(facts),
  };
}

export async function loadDuesSnapshot(supabase: SupabaseClient, year: number) {
  const reportResult = await supabase.rpc("dues_report_data");
  if (reportResult.error || !isRecord(reportResult.data)) {
    return { kind: "unavailable" as const };
  }
  const rowCount = reportRowCount(reportResult.data.row_count);
  const reportAsOf = reportResult.data.as_of;
  const rowData = reportResult.data.rows;

  if (
    reportResult.data.year !== year ||
    rowCount === null ||
    typeof reportAsOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(reportAsOf) ||
    reportAsOf.slice(0, 4) !== String(year) ||
    !Array.isArray(rowData)
  ) {
    return { kind: "unavailable" as const };
  }
  if (rowCount > BigInt(MAX_REPORT_ROWS)) {
    return { kind: "too-large" as const };
  }
  if (rowData.length !== Number(rowCount)) {
    return { kind: "unavailable" as const };
  }
  if (rowData.some((row) => !isRecord(row))) {
    return { kind: "unavailable" as const };
  }

  const rawDuesRows = rowData as DuesReportRow[];
  const fallbackDuesAmount =
    rawDuesRows
      .map((row) => wholeNgn(row.amount_ngn))
      .find((amt): amt is bigint => amt !== null && amt > BigInt(0)) ??
    BigInt(5000);

  const duesRows: DuesReportRow[] = rawDuesRows.map((row) => {
    const parsedAmount = wholeNgn(row.amount_ngn);
    if (parsedAmount !== null && parsedAmount > BigInt(0)) {
      return row;
    }
    return { ...row, amount_ngn: fallbackDuesAmount.toString() };
  });

  if (
    duesRows.some((row) => {
      const amount = wholeNgn(row.amount_ngn);
      return (
        typeof row.member_id !== "string" ||
        typeof row.full_name !== "string" ||
        typeof row.username !== "string" ||
        amount === null ||
        amount <= BigInt(0) ||
        !["paid", "unpaid", "written_off"].includes(row.status) ||
        typeof row.is_overdue !== "boolean" ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(row.covered_month) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(row.due_date) ||
        row.covered_month.slice(0, 4) !== String(year)
      );
    })
  ) {
    return { kind: "unavailable" as const };
  }

  const profilesById = new Map<string, MemberProfileMini>();
  for (const row of duesRows) {
    const profile = {
      id: row.member_id,
      full_name: row.full_name,
      username: row.username,
    };
    const previous = profilesById.get(profile.id);
    if (
      previous &&
      (previous.full_name !== profile.full_name ||
        previous.username !== profile.username)
    ) {
      return { kind: "unavailable" as const };
    }
    profilesById.set(profile.id, profile);
  }

  const facts = buildDuesFacts({
    year,
    asOf: reportAsOf,
    rows: duesRows,
  });

  return {
    kind: "ok" as const,
    year,
    asOf: reportAsOf,
    periodStart: `${year}-01-01`,
    periodEnd: reportAsOf,
    duesRows,
    profilesById,
    facts,
    fingerprint: factsFingerprint(facts),
  };
}

function watDateBoundary(value: string, addDay = false) {
  const timestamp = new Date(`${value}T00:00:00+01:00`).getTime();
  return new Date(timestamp + (addDay ? 86_400_000 : 0)).toISOString();
}

export async function loadEventFinanceSnapshot(
  supabase: SupabaseClient,
  eventId: string,
  start: string | null,
  end: string | null,
) {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,title")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return { kind: "unavailable" as const };
  if (!event) return { kind: "not-found" as const };

  let transactionQuery = supabase
    .from("event_financial_transactions")
    .select(
      "id,kind,amount_ngn,transaction_date,description,source_note,payer_payee,payment_method,category_name_snapshot,budget_allocation_name_snapshot,payment_status",
    )
    .eq("event_id", eventId)
    .is("voided_at", null)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_REPORT_ROWS);
  if (start) transactionQuery = transactionQuery.gte("transaction_date", start);
  if (end) transactionQuery = transactionQuery.lte("transaction_date", end);

  let salesQuery = supabase
    .from("event_ticket_sales")
    .select(
      "id,tier_id,buyer_name,quantity,unit_price_ngn,amount_ngn,payment_method,created_at,refunded_at,verification_status",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(MAX_REPORT_ROWS);
  if (!start && !end) {
    salesQuery = salesQuery.is("refunded_at", null);
  } else {
    const startIso = start ? watDateBoundary(start) : null;
    const endIso = end ? watDateBoundary(end, true) : null;
    const clauses = ["created_at", "refunded_at"].map((column) => {
      const filters = [
        ...(startIso ? [`${column}.gte.${startIso}`] : []),
        ...(endIso ? [`${column}.lt.${endIso}`] : []),
      ];
      return `and(${filters.join(",")})`;
    });
    salesQuery = salesQuery.or(clauses.join(","));
  }

  const [transactionResult, saleResult, summaryResult, tierResult] =
    await Promise.all([
      transactionQuery,
      salesQuery,
      supabase.rpc("event_finance_report_summary", {
        p_event_id: eventId,
        p_start_date: start,
        p_end_date: end,
      }),
      supabase
        .from("event_ticket_tiers")
        .select("id,name")
        .eq("event_id", eventId)
        .limit(100),
    ]);

  if (
    transactionResult.error ||
    saleResult.error ||
    summaryResult.error ||
    tierResult.error
  ) {
    return { kind: "unavailable" as const };
  }

  const transactions = (transactionResult.data ?? []) as EventTxnRow[];
  const sales = (saleResult.data ?? []) as EventSaleRow[];
  if (
    transactions.length >= MAX_REPORT_ROWS ||
    sales.length >= MAX_REPORT_ROWS
  ) {
    return { kind: "too-large" as const };
  }

  const summaryData = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  if (!summaryData) return { kind: "unavailable" as const };

  const reportSummary = summaryData as EventReportSummaryRow;
  const tierNames = new Map(
    ((tierResult.data ?? []) as Array<{ id: string; name: string }>).map(
      (tier) => [tier.id, tier.name],
    ),
  );

  const facts = buildEventFinanceFacts({
    eventTitle: event.title,
    from: start,
    to: end,
    summary: reportSummary,
    transactions,
    sales: sales.map((s) => ({
      tier_name: tierNames.get(s.tier_id) ?? "Ticket Tier",
      quantity: s.quantity,
      amount_ngn: s.amount_ngn,
      refunded_at: s.refunded_at,
      verification_status: s.verification_status,
    })),
  });

  return {
    kind: "ok" as const,
    event,
    summary: reportSummary,
    transactions,
    sales,
    tierNames,
    periodStart: start ?? "1900-01-01",
    periodEnd: end ?? "9999-12-31",
    facts,
    fingerprint: factsFingerprint(facts),
  };
}

export async function loadClubOverviewSnapshot(
  supabase: SupabaseClient,
  period: OverviewPeriod,
) {
  const { data, error } = await supabase.rpc("club_overview_report_data", {
    p_start: period.periodStart,
    p_end: period.periodEnd,
  });
  if (error || !data) {
    return { kind: "unavailable" as const };
  }
  const facts = buildClubOverviewFacts(data as ClubOverviewRpcInput);
  return {
    kind: "ok" as const,
    period,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    facts,
    fingerprint: factsFingerprint(facts),
  };
}

export async function loadApprovedNarrativeForReport(
  supabase: SupabaseClient,
  reportType: AiReportType,
  scopeId: string | null,
  fingerprint: string,
): Promise<(PdfNarrativeSummary & { id: string }) | null> {
  const { data, error } = await supabase.rpc("get_approved_report_narrative", {
    p_report_type: reportType,
    p_scope_id: scopeId,
    p_fingerprint: fingerprint,
  });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as {
    id?: string;
    content?: AiNarrativeContent;
    approved_by_name?: string;
    approved_at?: string;
  };
  if (!row.id || !row.content || !row.approved_at) return null;

  return {
    id: row.id,
    content: row.content,
    reviewedBy: row.approved_by_name || "Club Officer",
    reviewedAt: formatWatDate(new Date(row.approved_at)),
  };
}

export async function loadFactsContextForScope(
  supabase: SupabaseClient,
  params: {
    reportType: AiReportType;
    eventId?: string | null;
    from?: string | null;
    to?: string | null;
    period?: string | null;
    customSpec?: ReportSpec | null;
  },
) {
  const year = Number(getWATDate().slice(0, 4));
  if (params.reportType === "custom") {
    if (!params.customSpec) return { kind: "unavailable" as const };
    const execRes = await executeCustomReportSpec(supabase, params.customSpec);
    if (execRes.kind !== "ok") {
      return execRes.kind === "too-large"
        ? { kind: "too-large" as const }
        : { kind: "unavailable" as const };
    }
    return {
      kind: "ok" as const,
      reportType: "custom" as const,
      scopeId: execRes.result.scopeId,
      periodStart: execRes.result.periodStart,
      periodEnd: execRes.result.periodEnd,
      facts: execRes.result.facts,
      fingerprint: execRes.result.fingerprint,
    };
  }
  if (params.reportType === "club_finance") {
    const snap = await loadClubFinanceSnapshot(supabase, year);
    if (snap.kind !== "ok") return snap;
    return {
      kind: "ok" as const,
      reportType: "club_finance" as const,
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      facts: snap.facts,
      fingerprint: snap.fingerprint,
    };
  }
  if (params.reportType === "dues") {
    const snap = await loadDuesSnapshot(supabase, year);
    if (snap.kind !== "ok") return snap;
    return {
      kind: "ok" as const,
      reportType: "dues" as const,
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      facts: snap.facts,
      fingerprint: snap.fingerprint,
    };
  }
  if (params.reportType === "event_finance") {
    if (!params.eventId) return { kind: "unavailable" as const };
    const snap = await loadEventFinanceSnapshot(
      supabase,
      params.eventId,
      params.from ?? null,
      params.to ?? null,
    );
    if (snap.kind !== "ok") return { kind: "unavailable" as const };
    return {
      kind: "ok" as const,
      reportType: "event_finance" as const,
      scopeId: params.eventId,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      facts: snap.facts,
      fingerprint: snap.fingerprint,
    };
  }

  const parsedPeriod = params.period
    ? parseOverviewPeriod(params.period)
    : currentMonthPeriodWAT();
  if (!parsedPeriod) return { kind: "unavailable" as const };
  const snap = await loadClubOverviewSnapshot(supabase, parsedPeriod);
  if (snap.kind !== "ok") return snap;
  return {
    kind: "ok" as const,
    reportType: "club_overview" as const,
    scopeId: null,
    periodStart: snap.periodStart,
    periodEnd: snap.periodEnd,
    facts: snap.facts,
    fingerprint: snap.fingerprint,
  };
}

export interface OfficerNarrativeDto {
  id: string;
  reportType: string;
  scopeId: string | null;
  periodStart: string;
  periodEnd: string;
  factsFingerprint: string;
  provider: string;
  model: string;
  content: AiNarrativeContent;
  status: "draft" | "approved" | "discarded";
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export async function loadActiveOfficerNarrative(
  supabase: SupabaseClient,
  params: {
    reportType: AiReportType;
    scopeId: string | null;
    periodStart: string;
    periodEnd: string;
    fingerprint: string;
  },
): Promise<OfficerNarrativeDto | null> {
  let query = supabase
    .from("ai_report_narratives")
    .select(
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, provider, model, content, status, approved_by, approved_at, updated_at",
    )
    .eq("report_type", params.reportType)
    .eq("period_start", params.periodStart)
    .eq("period_end", params.periodEnd)
    .eq("facts_fingerprint", params.fingerprint)
    .neq("status", "discarded")
    .limit(1);

  query = params.scopeId
    ? query.eq("scope_id", params.scopeId)
    : query.is("scope_id", null);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  let approvedByName: string | null = null;
  if (data.approved_by) {
    const { data: approver } = await supabase
      .from("member_profiles")
      .select("full_name")
      .eq("id", data.approved_by)
      .maybeSingle();
    approvedByName = approver?.full_name || "Club Officer";
  }

  return {
    id: data.id,
    reportType: data.report_type,
    scopeId: data.scope_id,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    factsFingerprint: data.facts_fingerprint,
    provider: data.provider,
    model: data.model,
    content: data.content as AiNarrativeContent,
    status: data.status as "draft" | "approved" | "discarded",
    approvedByName,
    approvedAt: data.approved_at
      ? formatWatDate(new Date(data.approved_at))
      : null,
    updatedAt: data.updated_at,
  };
}
