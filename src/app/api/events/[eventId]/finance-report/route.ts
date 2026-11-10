import { createElement } from "react";
import { EventFinancePdfDocument } from "@/lib/pdf/documents";
import { renderReportPdf } from "@/lib/pdf/render.server";
import {
  createSimplePdf,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
  MAX_REPORT_ROWS,
  toCsvRows,
} from "@/lib/report-export";
import {
  loadApprovedNarrativeForReport,
  loadEventFinanceSnapshot,
} from "@/lib/reports/loaders.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function errorResponse(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01"
  );
}

function watDateBoundary(value: string, addDay = false) {
  const timestamp = new Date(`${value}T00:00:00+01:00`).getTime();
  return new Date(timestamp + (addDay ? 86_400_000 : 0)).toISOString();
}

function dateInRange(value: string, start: string | null, end: string | null) {
  const date = new Date(value);
  const startTime = start ? new Date(watDateBoundary(start)).getTime() : null;
  const endTime = end ? new Date(watDateBoundary(end, true)).getTime() : null;
  return (
    (startTime === null || date.getTime() >= startTime) &&
    (endTime === null || date.getTime() < endTime)
  );
}

function timestampDay(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function amount(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function formatMoneyText(value: number): string {
  const abs = Math.trunc(Math.abs(value)).toLocaleString("en-US");
  return value < 0 ? `-NGN ${abs}` : `NGN ${abs}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    return errorResponse(400, "The event identifier is invalid.");
  }

  const url = new URL(request.url);
  const rawStart = url.searchParams.get("from");
  const rawEnd = url.searchParams.get("to");
  const start = rawStart ? (isCalendarDate(rawStart) ? rawStart : null) : null;
  const end = rawEnd ? (isCalendarDate(rawEnd) ? rawEnd : null) : null;
  if (
    (rawStart && !start) ||
    (rawEnd && !end) ||
    (start && end && start > end)
  ) {
    return errorResponse(400, "Choose a valid report date range.");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return errorResponse(503, "Event reports are unavailable.");
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return errorResponse(401, "Sign in to download this event report.");
  }
  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || profile?.status !== "active") {
    return errorResponse(403, "Active membership is required.");
  }

  const snap = await loadEventFinanceSnapshot(supabase, eventId, start, end);
  if (snap.kind === "not-found") {
    return errorResponse(404, "The event is unavailable.");
  }
  if (snap.kind === "too-large") {
    return errorResponse(
      413,
      "This report contains too many rows. Select a narrower date range.",
    );
  }
  if (snap.kind !== "ok") {
    return errorResponse(503, "Event report data could not be verified.");
  }

  const {
    event,
    summary: reportSummary,
    transactions,
    sales,
    tierNames,
  } = snap;
  const columns = [
    "Date",
    "Record type",
    "Category",
    "Budget allocation",
    "Description or ticket tier",
    "Payment status",
    "Amount (NGN)",
    "Quantity",
    "Unit price (NGN)",
    "Payment method",
    "Payer, payee, or buyer",
  ];
  const ticketRows: Array<Array<string | number | null>> = [];
  const ledgerPdfRows: Array<{
    date: string;
    type: string;
    category: string;
    description: string;
    status: string;
    counterparty: string;
    amount: string;
  }> = [];

  for (const sale of sales) {
    const saleDate = timestampDay(sale.created_at);
    const saleAmount = amount(sale.amount_ngn);
    const unitPrice = amount(sale.unit_price_ngn);
    if (saleAmount === null || unitPrice === null) {
      return errorResponse(503, "A ticket sale contains an invalid amount.");
    }
    const saleWithinRange = dateInRange(sale.created_at, start, end);
    const refundWithinRange = sale.refunded_at
      ? dateInRange(sale.refunded_at, start, end)
      : false;
    const tierName = tierNames.get(sale.tier_id) ?? "Retained ticket tier";
    const statusLabel = sale.refunded_at
      ? "Sold; refund recorded"
      : sale.verification_status === "approved"
        ? "Paid"
        : sale.verification_status === "recorded"
          ? "Paid — awaiting officer confirmation"
          : `${sale.verification_status} — not counted`;

    if (saleWithinRange) {
      ticketRows.push([
        saleDate,
        "Ticket sale",
        "Ticket Sales",
        "",
        tierName,
        statusLabel,
        saleAmount,
        sale.quantity,
        unitPrice,
        sale.payment_method?.replaceAll("_", " ") ?? "",
        sale.buyer_name ?? "",
      ]);
      ledgerPdfRows.push({
        date: saleDate,
        type: "Ticket sale",
        category: "Ticket Sales",
        description: `${tierName} (${sale.quantity}x)`,
        status: statusLabel,
        counterparty: sale.buyer_name || "Anonymous",
        amount: formatMoneyText(saleAmount),
      });
    }
    if (refundWithinRange && sale.refunded_at) {
      const refundDay = timestampDay(sale.refunded_at);
      ticketRows.push([
        refundDay,
        "Ticket refund",
        "Ticket Sales",
        "",
        tierName,
        "Refunded",
        -saleAmount,
        -sale.quantity,
        unitPrice,
        sale.payment_method?.replaceAll("_", " ") ?? "",
        sale.buyer_name ?? "",
      ]);
      ledgerPdfRows.push({
        date: refundDay,
        type: "Ticket refund",
        category: "Ticket Sales",
        description: `${tierName} (${sale.quantity}x)`,
        status: "Refunded",
        counterparty: sale.buyer_name || "Anonymous",
        amount: formatMoneyText(-saleAmount),
      });
    }
  }

  const transactionRows = transactions.map((transaction) => {
    const transactionAmount = amount(transaction.amount_ngn);
    if (transactionAmount === null) return null;
    const typeLabel =
      transaction.kind === "income" ? "Other income" : "Expense";
    const categoryLabel =
      transaction.category_name_snapshot ?? "Uncategorized legacy entry";
    const descLabel =
      transaction.kind === "income"
        ? (transaction.source_note ?? "")
        : (transaction.description ?? "");

    ledgerPdfRows.push({
      date: transaction.transaction_date,
      type: typeLabel,
      category: categoryLabel,
      description: descLabel || "—",
      status: transaction.payment_status,
      counterparty: transaction.payer_payee || "—",
      amount: formatMoneyText(transactionAmount),
    });

    return [
      transaction.transaction_date,
      typeLabel,
      categoryLabel,
      transaction.budget_allocation_name_snapshot ?? "",
      descLabel,
      transaction.payment_status,
      transactionAmount,
      "",
      "",
      transaction.payment_method?.replaceAll("_", " ") ?? "",
      transaction.payer_payee ?? "",
    ];
  });
  if (transactionRows.some((row) => row === null)) {
    return errorResponse(
      503,
      "An event transaction contains an invalid amount.",
    );
  }

  const rows: Array<Array<string | number | null>> = [
    ["Event finance report", event.title],
    ["Period from", start ?? "All dates"],
    ["Period to", end ?? "All dates"],
    ["Paid other income (NGN)", String(reportSummary.paid_income_ngn)],
    ["Pending other income (NGN)", String(reportSummary.pending_income_ngn)],
    ["Unpaid other income (NGN)", String(reportSummary.unpaid_income_ngn)],
    [
      "Paid and deposit expenses (NGN)",
      String(reportSummary.actual_expense_ngn),
    ],
    ["Expense commitments (NGN)", String(reportSummary.committed_expense_ngn)],
    [
      "Ticket income net of refunds (NGN)",
      String(reportSummary.ticket_income_ngn),
    ],
    ["Net ticket quantity", String(reportSummary.tickets_sold)],
    ["Net event result (NGN)", String(reportSummary.net_result_ngn)],
    [],
    columns,
    ...(transactionRows as Array<Array<string | number | null>>),
    ...ticketRows,
  ];
  if (transactionRows.length + ticketRows.length > MAX_REPORT_ROWS) {
    return errorResponse(
      413,
      "This report contains too many rows. Select a narrower date range.",
    );
  }

  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const includeAiParam = url.searchParams.get("includeAi");
  const includeAi = includeAiParam !== "false" && includeAiParam !== "0";

  if (format === "pdf") {
    const narrative = includeAi
      ? await loadApprovedNarrativeForReport(
          supabase,
          "event_finance",
          eventId,
          snap.fingerprint,
        )
      : null;

    let pdfData: Uint8Array | null;
    try {
      pdfData = await renderReportPdf(
        createElement(EventFinancePdfDocument, {
          eventTitle: event.title,
          from: start,
          to: end,
          generatedDate: getWATDate(),
          summary: reportSummary,
          ledgerRows: ledgerPdfRows.sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
          narrative,
        }),
      );
    } catch (err) {
      console.error(
        "[Event Finance PDF] Branded render failed, falling back:",
        err,
      );
      const lines: string[] = [
        `Event Title: ${event.title}`,
        `Period: ${start ?? "All dates"} to ${end ?? "All dates"}`,
        `Generated: ${getWATDate()}`,
        "",
        "--- FINANCIAL SUMMARY ---",
        `Paid other income: NGN ${reportSummary.paid_income_ngn}`,
        `Pending other income: NGN ${reportSummary.pending_income_ngn}`,
        `Unpaid other income: NGN ${reportSummary.unpaid_income_ngn}`,
        `Paid & deposit expenses: NGN ${reportSummary.actual_expense_ngn}`,
        `Expense commitments: NGN ${reportSummary.committed_expense_ngn}`,
        `Ticket income net of refunds: NGN ${reportSummary.ticket_income_ngn}`,
        `Net ticket quantity: ${reportSummary.tickets_sold}`,
        `Net event result: NGN ${reportSummary.net_result_ngn}`,
        "",
        "--- TRANSACTIONS & TICKET RELEASES ---",
      ];
      for (const row of transactionRows) {
        if (!row) continue;
        lines.push(
          `${row[0]} | ${row[1]} | NGN ${row[6]} | ${row[5]} | ${row[4] || "No description"} | ${row[10] || "No counterparty"}`,
        );
      }
      for (const row of ticketRows) {
        lines.push(
          `${row[0]} | ${row[1]} (${row[4]}) | Qty: ${row[7]} | NGN ${row[6]} | ${row[9]} | ${row[10] || "Anonymous"}`,
        );
      }
      pdfData = createSimplePdf(
        "Carpenters Family Social Club | Event Finance Report",
        event.title,
        lines,
      );
    }

    if (!pdfData) {
      return errorResponse(
        413,
        "This report is too large. Select a narrower date range.",
      );
    }
    const pdfBuffer = new ArrayBuffer(pdfData.byteLength);
    new Uint8Array(pdfBuffer).set(pdfData);
    return new Response(pdfBuffer, {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="event-finance-${eventId}.pdf"`,
      },
    });
  }

  const csv = toCsvRows(rows);
  if (new TextEncoder().encode(csv).byteLength > MAX_REPORT_EXPORT_BYTES) {
    return errorResponse(
      413,
      "This report is too large. Select a narrower date range.",
    );
  }
  return new Response(csv, {
    headers: {
      ...privateHeaders,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-finance-${eventId}.csv"`,
    },
  });
}
