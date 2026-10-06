import { readBoundedFormData } from "@/lib/bounded-form-data";
import { clubBrand } from "@/lib/brand";
import {
  createSimplePdf,
  formatNgn,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
  MAX_REPORT_ROWS,
  owedByMember,
  type ReportFormat,
  toCsvRows,
  wholeNgn,
} from "@/lib/report-export";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FinanceTransaction = {
  id: string;
  kind: string;
  amount_ngn: string | number;
  transaction_date: string;
  description: string | null;
  category_name_snapshot: string | null;
  payer_payee: string | null;
  source_note: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

type DuesStatus = {
  member_id: string;
  full_name: string;
  username: string;
  covered_month: string;
  amount_ngn: string | number | null;
  status: string;
  due_date: string;
  is_overdue: boolean;
};

type MemberProfile = {
  id: string;
  full_name: string;
  username: string;
};

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
const MAX_EXPORT_REQUEST_BYTES = 128;

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

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

function isReportFormat(value: string | null): value is ReportFormat {
  return value === "csv" || value === "pdf";
}

function reportStatus(row: DuesStatus, currentMonth: string) {
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
  transactions: FinanceTransaction[],
  receiptsByTransaction: Map<string, string[]>,
) {
  const columns = [
    "Transaction date",
    "Type",
    "Amount (NGN)",
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
    ["As of (Africa/Lagos)", asOf, ...emptyColumns],
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
    ["Current club balance (NGN)", String(summary.balance), ...emptyColumns],
    columns,
    ...transactions.map((transaction) => [
      transaction.transaction_date,
      transaction.kind,
      String(transaction.amount_ngn),
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
  transactions: FinanceTransaction[],
  receiptsByTransaction: Map<string, string[]>,
) {
  const lines = [
    `Report year: ${year}`,
    `As of (Africa/Lagos): ${asOf}`,
    `All-time dues income: ${formatPdfAmount(summary.dues_income)}`,
    `All-time other income: ${formatPdfAmount(summary.other_income)}`,
    `All-time expenses: ${formatPdfAmount(summary.expenses)}`,
    `Current club balance: ${formatPdfAmount(summary.balance)}`,
    "Text-only PDF. Unsupported glyphs are transliterated; CSV preserves original Unicode.",
    "",
    `Transactions from ${year}-01-01 through ${year}-12-31 (${transactions.length})`,
    "",
  ];
  for (const transaction of transactions) {
    const amount = formatPdfAmount(transaction.amount_ngn);
    if (!amount) return null;
    const receipts = receiptsByTransaction.get(transaction.id) ?? [];
    lines.push(
      `${transaction.transaction_date} | ${transaction.kind.toUpperCase()} | ${amount} | ${transaction.voided_at ? "Voided" : "Posted"}`,
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
  duesRows: DuesStatus[],
  profilesById: Map<string, MemberProfile>,
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
    ["As of (Africa/Lagos)", asOf, "", "", "", "", "", ""],
    columns,
    ...rows,
  ]);
}

function duesRowsToPdf(
  year: number,
  asOf: string,
  duesRows: DuesStatus[],
  profilesById: Map<string, MemberProfile>,
) {
  const totalsByMember = owedByMember(duesRows, asOf);
  if (totalsByMember === null) return null;
  const currentMonth = asOf.slice(0, 7);
  const lines = [
    `Report year: ${year}`,
    `As of (Africa/Lagos): ${asOf}`,
    `Individual dues rows returned under your current access: ${duesRows.length}`,
    "Total owed includes unpaid months in this report year with a due date on or before the report date.",
    "Text-only PDF. Unsupported glyphs are transliterated; CSV preserves original Unicode.",
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
) {
  const reportResult = await supabase.rpc("club_finance_report_data");
  if (reportResult.error || !isRecord(reportResult.data))
    return { kind: "unavailable" as const };
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
  if (rowCount > BigInt(MAX_REPORT_ROWS)) return { kind: "too-large" as const };
  if (transactionData.some((transaction) => !isRecord(transaction)))
    return { kind: "unavailable" as const };
  const transactions = transactionData as FinanceTransaction[];
  if (transactions.length !== Number(rowCount))
    return { kind: "unavailable" as const };
  for (const field of [
    "dues_income",
    "other_income",
    "expenses",
    "balance",
  ] as const) {
    if (wholeNgn(summary[field] as string | number) === null)
      return { kind: "unavailable" as const };
  }
  if (
    transactions.some((transaction) => {
      const amount = wholeNgn(transaction.amount_ngn);
      return (
        typeof transaction.id !== "string" ||
        typeof transaction.kind !== "string" ||
        typeof transaction.transaction_date !== "string" ||
        !["income", "expense"].includes(transaction.kind) ||
        amount === null ||
        amount <= BigInt(0) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(transaction.transaction_date) ||
        transaction.transaction_date.slice(0, 4) !== String(year) ||
        [
          transaction.description,
          transaction.category_name_snapshot,
          transaction.payer_payee,
          transaction.source_note,
          transaction.voided_at,
          transaction.void_reason,
        ].some((value) => value !== null && typeof value !== "string")
      );
    })
  ) {
    return { kind: "unavailable" as const };
  }

  const receiptsByTransaction = new Map<string, string[]>();
  if (transactions.length > 0) {
    const receiptResult = await supabase
      .from("club_financial_receipts")
      .select("transaction_id, original_filename", { count: "exact" })
      .in(
        "transaction_id",
        transactions.map((transaction) => transaction.id),
      )
      .order("uploaded_at", { ascending: true })
      .limit(MAX_REPORT_ROWS);
    if (receiptResult.error) return { kind: "unavailable" as const };
    if ((receiptResult.count ?? 0) > MAX_REPORT_ROWS)
      return { kind: "too-large" as const };
    for (const receipt of receiptResult.data ?? []) {
      const current = receiptsByTransaction.get(receipt.transaction_id) ?? [];
      current.push(receipt.original_filename);
      receiptsByTransaction.set(receipt.transaction_id, current);
    }
  }

  const body =
    format === "csv"
      ? financeRowsToCsv(
          year,
          reportAsOf,
          summary as Record<string, string | number>,
          transactions,
          receiptsByTransaction,
        )
      : financeRowsToPdf(
          year,
          reportAsOf,
          summary as Record<string, string | number>,
          transactions,
          receiptsByTransaction,
        );
  if (body === null) return { kind: "too-large" as const };
  const bytes =
    typeof body === "string"
      ? Buffer.byteLength(body, "utf8")
      : body.byteLength;
  if (bytes > MAX_REPORT_EXPORT_BYTES) return { kind: "too-large" as const };
  return { kind: "ok" as const, body };
}

async function createDuesExport(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  year: number,
  format: ReportFormat,
) {
  const reportResult = await supabase.rpc("dues_report_data");
  if (reportResult.error || !isRecord(reportResult.data))
    return { kind: "unavailable" as const };
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
  if (rowCount > BigInt(MAX_REPORT_ROWS)) return { kind: "too-large" as const };
  if (rowData.length !== Number(rowCount))
    return { kind: "unavailable" as const };
  if (rowData.some((row) => !isRecord(row)))
    return { kind: "unavailable" as const };
  const duesRows = rowData as DuesStatus[];
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
  const profilesById = new Map<string, MemberProfile>();
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

  let body: string | Uint8Array | null;
  try {
    body =
      format === "csv"
        ? duesRowsToCsv(year, reportAsOf, duesRows, profilesById)
        : duesRowsToPdf(year, reportAsOf, duesRows, profilesById);
  } catch {
    return { kind: "unavailable" as const };
  }
  if (body === null) return { kind: "unavailable" as const };
  const bytes =
    typeof body === "string"
      ? Buffer.byteLength(body, "utf8")
      : body.byteLength;
  if (bytes > MAX_REPORT_EXPORT_BYTES) return { kind: "too-large" as const };
  return { kind: "ok" as const, body };
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
  if (
    formEntries.length !== 1 ||
    formEntries[0]?.[0] !== "format" ||
    formatValues.length !== 1 ||
    typeof formatValues[0] !== "string" ||
    !isReportFormat(formatValues[0])
  )
    return errorResponse(400, "Choose a supported report format.");
  const format = formatValues[0];

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
      ? await createFinanceExport(supabase, year, format)
      : await createDuesExport(supabase, year, format);
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
