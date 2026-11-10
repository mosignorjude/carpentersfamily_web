import { createElement } from "react";
import { readBoundedFormData } from "@/lib/bounded-form-data";
import { clubBrand } from "@/lib/brand";
import { ClubFinancePdfDocument, DuesPdfDocument } from "@/lib/pdf/documents";
import { renderReportPdf } from "@/lib/pdf/render.server";
import {
  createSimplePdf,
  formatNgn,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
  owedByMember,
  type ReportFormat,
  toCsvRows,
  wholeNgn,
} from "@/lib/report-export";
import {
  type ClubFinanceTxnRow,
  type DuesReportRow,
  loadApprovedNarrativeForReport,
  loadClubFinanceSnapshot,
  loadDuesSnapshot,
  type MemberProfileMini,
} from "@/lib/reports/loaders.server";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const MAX_EXPORT_REQUEST_BYTES = 192;

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

function isReportFormat(value: string | null): value is ReportFormat {
  return value === "csv" || value === "pdf";
}

function reportStatus(row: DuesReportRow, currentMonth: string) {
  if (row.status === "paid") return "Paid";
  if (row.status === "written_off") return "Written off";
  if (row.status !== "unpaid") return null;
  if (row.is_overdue) return "Overdue";
  if (row.covered_month.slice(0, 7) > currentMonth) return "Upcoming";
  if (row.covered_month.slice(0, 7) === currentMonth) return "Due at month end";
  return "Unpaid";
}

function formatPdfAmount(value: string | number | null | undefined) {
  const amount = wholeNgn(value);
  return amount === null ? null : `NGN ${formatNgn(amount)}`;
}

function financeRowsToCsv(
  year: number,
  asOf: string,
  summary: Record<string, string | number>,
  transactions: ClubFinanceTxnRow[],
  receiptsByTransaction: Map<string, string[]>,
) {
  const columns = [
    "Transaction date",
    "Type",
    "Amount (NGN)",
    "Payment method",
    "Description",
    "Category",
    "Payer/payee",
    "Source note",
    "Status",
    "Void reason",
    "Receipt filenames",
  ];
  const emptyColumns = Array.from({ length: columns.length - 2 }, () => "");
  const reportRows: Array<Array<string | number | null>> = [
    ["Report", "Club finance", ...emptyColumns],
    ["Report year", year, ...emptyColumns],
    ["As of", asOf, ...emptyColumns],
    [
      "All-time dues income (NGN)",
      String(summary.dues_income),
      ...emptyColumns,
    ],
    [
      "All-time other income (NGN)",
      String(summary.other_income),
      ...emptyColumns,
    ],
    ["All-time expenses (NGN)", String(summary.expenses), ...emptyColumns],
    [
      "All-time event cash in (NGN)",
      String(summary.event_inflow),
      ...emptyColumns,
    ],
    [
      "All-time event cash out (NGN)",
      String(summary.event_outflow),
      ...emptyColumns,
    ],
    ["Current club balance (NGN)", String(summary.balance), ...emptyColumns],
    columns,
    ...transactions.map((transaction) => [
      transaction.transaction_date,
      transaction.is_opening_balance
        ? "Opening Balance"
        : transaction.kind === "income"
          ? "Other Income"
          : "Disbursement",
      String(transaction.amount_ngn),
      transaction.payment_method ?? "",
      transaction.description ?? "",
      transaction.category_name_snapshot ?? "",
      transaction.payer_payee ?? "",
      transaction.source_note ?? "",
      transaction.voided_at ? "Voided" : "Posted",
      transaction.void_reason ?? "",
      (receiptsByTransaction.get(transaction.id) ?? []).join("; "),
    ]),
  ];
  return toCsvRows(reportRows);
}

function financeRowsToPdf(
  year: number,
  asOf: string,
  summary: Record<string, string | number>,
  transactions: ClubFinanceTxnRow[],
  receiptsByTransaction: Map<string, string[]>,
) {
  const lines = [
    `Report year: ${year}`,
    `As of: ${asOf}`,
    `All-time dues income: ${formatPdfAmount(summary.dues_income)}`,
    `All-time other income: ${formatPdfAmount(summary.other_income)}`,
    `All-time expenses: ${formatPdfAmount(summary.expenses)}`,
    `All-time event cash in: ${formatPdfAmount(summary.event_inflow)}`,
    `All-time event cash out: ${formatPdfAmount(summary.event_outflow)}`,
    `Current club balance: ${formatPdfAmount(summary.balance)}`,
    "Text-only PDF fallback.",
    "",
    `Transactions from ${year}-01-01 through ${year}-12-31 (${transactions.length})`,
    "",
  ];
  for (const transaction of transactions) {
    const amount = formatPdfAmount(transaction.amount_ngn);
    if (!amount) return null;
    const receipts = receiptsByTransaction.get(transaction.id) ?? [];
    lines.push(
      `${transaction.transaction_date} | ${transaction.is_opening_balance ? "OPENING BALANCE" : transaction.kind.toUpperCase()} | ${amount} | ${transaction.voided_at ? "Voided" : "Posted"}`,
      `Description: ${transaction.description ?? "—"}`,
      `Category: ${transaction.category_name_snapshot ?? "—"} | Payer/payee: ${transaction.payer_payee ?? "—"}`,
      `Source: ${transaction.source_note ?? "—"}`,
      `Receipts: ${receipts.length ? receipts.join("; ") : "None"}`,
    );
    if (transaction.void_reason)
      lines.push(`Void reason: ${transaction.void_reason}`);
    lines.push("");
  }
  if (transactions.length === 0)
    lines.push("No transactions were recorded in this report year.");
  return createSimplePdf(
    `${clubBrand.name} | Club Finance`,
    "Shared club report",
    lines,
  );
}

function duesRowsToCsv(
  year: number,
  asOf: string,
  duesRows: DuesReportRow[],
  profilesById: Map<string, MemberProfileMini>,
) {
  const columns = [
    "Member",
    "Username",
    "Covered month",
    "Status",
    "Amount (NGN)",
    "Due date",
    "Overdue",
    `Total owed in ${year} through ${asOf} (NGN)`,
  ];
  const totalsByMember = owedByMember(duesRows, asOf);
  if (totalsByMember === null) return null;
  const currentMonth = asOf.slice(0, 7);
  const rows: Array<Array<string | number | boolean>> = duesRows.map((row) => {
    const profile = profilesById.get(row.member_id);
    const amount = wholeNgn(row.amount_ngn);
    const status = reportStatus(row, currentMonth);
    if (!profile || amount === null || status === null)
      throw new Error("invalid-dues-row");
    return [
      profile.full_name,
      profile.username,
      row.covered_month.slice(0, 7),
      status,
      formatNgn(amount),
      row.due_date,
      row.is_overdue,
      formatNgn(totalsByMember.get(row.member_id) ?? BigInt(0)),
    ];
  });
  return toCsvRows([
    ["Report", "Member dues", "", "", "", "", "", ""],
    ["Report year", String(year), "", "", "", "", "", ""],
    ["As of", asOf, "", "", "", "", "", ""],
    columns,
    ...rows,
  ]);
}

function duesRowsToFallbackPdf(
  year: number,
  asOf: string,
  duesRows: DuesReportRow[],
  profilesById: Map<string, MemberProfileMini>,
) {
  const totalsByMember = owedByMember(duesRows, asOf);
  if (totalsByMember === null) return null;
  const currentMonth = asOf.slice(0, 7);
  const lines = [
    `Report year: ${year}`,
    `As of: ${asOf}`,
    `Individual dues rows returned under your current access: ${duesRows.length}`,
    "Total owed includes unpaid months in this report year with a due date on or before the report date.",
    "Text-only PDF fallback.",
    "",
  ];
  const memberIds = [...new Set(duesRows.map((row) => row.member_id))].sort();
  for (const memberId of memberIds) {
    const profile = profilesById.get(memberId);
    if (!profile) return null;
    lines.push(
      `${profile.full_name} (@${profile.username}) | Total owed in ${year}: NGN ${formatNgn(totalsByMember.get(memberId) ?? BigInt(0))}`,
    );
    for (const row of duesRows.filter((item) => item.member_id === memberId)) {
      const amount = wholeNgn(row.amount_ngn);
      const status = reportStatus(row, currentMonth);
      if (amount === null || status === null) return null;
      lines.push(
        `  ${row.covered_month.slice(0, 7)} | ${status} | NGN ${formatNgn(amount)} | Due ${row.due_date}${row.is_overdue ? " | Overdue" : ""}`,
      );
    }
    lines.push("");
  }
  if (duesRows.length === 0)
    lines.push("No dues months were found in this report year.");
  return createSimplePdf(
    `${clubBrand.name} | Member Dues`,
    "Private dues report",
    lines,
  );
}

async function createFinanceExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  year: number,
  format: ReportFormat,
  includeAi: boolean,
) {
  const snap = await loadClubFinanceSnapshot(supabase, year);
  if (snap.kind !== "ok") return snap;

  for (const field of [
    "dues_income",
    "other_income",
    "expenses",
    "event_inflow",
    "event_outflow",
    "balance",
  ] as const) {
    if (wholeNgn(snap.summary[field]) === null) {
      return { kind: "unavailable" as const };
    }
  }

  if (format === "csv") {
    const csv = financeRowsToCsv(
      snap.year,
      snap.asOf,
      snap.summary,
      snap.transactions,
      snap.receiptsByTransaction,
    );
    if (Buffer.byteLength(csv, "utf8") > MAX_REPORT_EXPORT_BYTES) {
      return { kind: "too-large" as const };
    }
    return { kind: "ok" as const, body: csv, narrativeId: null };
  }

  const narrative = includeAi
    ? await loadApprovedNarrativeForReport(
        supabase,
        "club_finance",
        null,
        snap.fingerprint,
      )
    : null;

  let body: Uint8Array | null;
  try {
    body = await renderReportPdf(
      createElement(ClubFinancePdfDocument, {
        year: snap.year,
        asOf: snap.asOf,
        generatedDate: getWATDate(),
        summary: snap.summary,
        transactions: snap.transactions,
        receiptsByTransaction: snap.receiptsByTransaction,
        narrative,
      }),
    );
  } catch (err) {
    console.error(
      "[Club Finance PDF] Branded render failed, falling back:",
      err,
    );
    body = financeRowsToPdf(
      snap.year,
      snap.asOf,
      snap.summary,
      snap.transactions,
      snap.receiptsByTransaction,
    );
  }

  if (body === null) return { kind: "too-large" as const };
  if (body.byteLength > MAX_REPORT_EXPORT_BYTES) {
    return { kind: "too-large" as const };
  }
  return {
    kind: "ok" as const,
    body,
    narrativeId: narrative?.id ?? null,
  };
}

async function createDuesExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  year: number,
  format: ReportFormat,
  includeAi: boolean,
) {
  const snap = await loadDuesSnapshot(supabase, year);
  if (snap.kind !== "ok") return snap;

  if (format === "csv") {
    let csv: string | null;
    try {
      csv = duesRowsToCsv(
        snap.year,
        snap.asOf,
        snap.duesRows,
        snap.profilesById,
      );
    } catch {
      return { kind: "unavailable" as const };
    }
    if (csv === null) return { kind: "unavailable" as const };
    if (Buffer.byteLength(csv, "utf8") > MAX_REPORT_EXPORT_BYTES) {
      return { kind: "too-large" as const };
    }
    return { kind: "ok" as const, body: csv, narrativeId: null };
  }

  const narrative = includeAi
    ? await loadApprovedNarrativeForReport(
        supabase,
        "dues",
        null,
        snap.fingerprint,
      )
    : null;

  let body: Uint8Array | null;
  try {
    body = await renderReportPdf(
      createElement(DuesPdfDocument, {
        year: snap.year,
        asOf: snap.asOf,
        generatedDate: getWATDate(),
        duesRows: snap.duesRows,
        profilesById: snap.profilesById,
        narrative,
      }),
    );
  } catch (err) {
    console.error("[Dues PDF] Branded render failed, falling back:", err);
    body = duesRowsToFallbackPdf(
      snap.year,
      snap.asOf,
      snap.duesRows,
      snap.profilesById,
    );
  }

  if (body === null) return { kind: "too-large" as const };
  if (body.byteLength > MAX_REPORT_EXPORT_BYTES) {
    return { kind: "too-large" as const };
  }
  return {
    kind: "ok" as const,
    body,
    narrativeId: narrative?.id ?? null,
  };
}

function isSameSiteRequest(request: Request, expectedOrigin: string) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ report: string }> },
) {
  const { report } = await context.params;
  const url = new URL(request.url);
  if (report !== "finances" && report !== "dues") {
    return errorResponse(404, "Report not found.");
  }
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin)
    return errorResponse(503, "The report service is unavailable.");
  if (!isSameSiteRequest(request, siteOrigin)) {
    return errorResponse(403, "The report request could not be verified.");
  }
  if (url.searchParams.size !== 0)
    return errorResponse(400, "Choose a supported report format.");
  const contentLength = request.headers.get("content-length");
  if (contentLength && !/^\d{1,3}$/u.test(contentLength)) {
    return errorResponse(400, "Choose a supported report format.");
  }
  if (contentLength && Number(contentLength) > MAX_EXPORT_REQUEST_BYTES) {
    return errorResponse(413, "The report request is invalid.");
  }
  const formResult = await readBoundedFormData(
    request,
    MAX_EXPORT_REQUEST_BYTES,
  );
  if (formResult.kind === "too-large")
    return errorResponse(413, "The report request is invalid.");
  if (formResult.kind !== "ok")
    return errorResponse(400, "Choose a supported report format.");
  const formEntries = [...formResult.form.entries()];
  const formatValues = formResult.form.getAll("format");
  const allowedKeys = formEntries.every(
    ([key]) => key === "format" || key === "includeAi",
  );
  if (
    !allowedKeys ||
    formatValues.length !== 1 ||
    typeof formatValues[0] !== "string" ||
    !isReportFormat(formatValues[0])
  ) {
    return errorResponse(400, "Choose a supported report format.");
  }
  const format = formatValues[0];
  const includeAiRaw = formResult.form.get("includeAi");
  const includeAi = includeAiRaw !== "false" && includeAiRaw !== "0";

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return errorResponse(503, "The report service is unavailable.");
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user)
    return errorResponse(401, "Sign in to export reports.");
  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError)
    return errorResponse(503, "The report service is unavailable.");
  if (profile?.status !== "active")
    return errorResponse(403, "Active membership is required.");

  const year = Number(getWATDate().slice(0, 4));
  const result =
    report === "finances"
      ? await createFinanceExport(supabase, year, format, includeAi)
      : await createDuesExport(supabase, year, format, includeAi);
  if (result.kind === "too-large") {
    return errorResponse(
      413,
      "This report exceeds the safe export limit. No file was created.",
    );
  }
  if (result.kind !== "ok")
    return errorResponse(
      503,
      "The report could not be verified. No file was created.",
    );

  const { error: auditError } = await supabase.rpc("log_report_export", {
    p_report_type: report,
    p_format: format,
  });
  if (auditError)
    return errorResponse(
      503,
      "The report could not be audited. No file was created.",
    );

  const contentType =
    format === "csv" ? "text/csv; charset=utf-8" : "application/pdf";
  const headers = new Headers({
    ...RESPONSE_HEADERS,
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${report}-${year}.${format}"`,
  });
  const body =
    typeof result.body === "string"
      ? result.body
      : (() => {
          const buffer = new ArrayBuffer(result.body.byteLength);
          new Uint8Array(buffer).set(result.body);
          return buffer;
        })();
  return new Response(body, { status: 200, headers });
}
