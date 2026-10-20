import {
  MAX_REPORT_EXPORT_BYTES,
  MAX_REPORT_ROWS,
  toCsvRows,
} from "@/lib/report-export";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

type TransactionRow = {
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

type SaleRow = {
  id: string;
  tier_id: string;
  buyer_name: string | null;
  quantity: number;
  unit_price_ngn: number | string;
  amount_ngn: number | string;
  payment_method: string | null;
  created_at: string;
  refunded_at: string | null;
};

type TierRow = { id: string; name: string };
type ReportSummary = {
  paid_income_ngn: number | string;
  pending_income_ngn: number | string;
  unpaid_income_ngn: number | string;
  actual_expense_ngn: number | string;
  committed_expense_ngn: number | string;
  ticket_income_ngn: number | string;
  tickets_sold: number | string;
  net_result_ngn: number | string;
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

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,title")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return errorResponse(503, "The event could not be verified.");
  if (!event) return errorResponse(404, "The event is unavailable.");

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
      "id,tier_id,buyer_name,quantity,unit_price_ngn,amount_ngn,payment_method,created_at,refunded_at",
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
    return errorResponse(503, "Event report data could not be verified.");
  }

  const transactions = (transactionResult.data ?? []) as TransactionRow[];
  const sales = (saleResult.data ?? []) as SaleRow[];
  if (
    transactions.length >= MAX_REPORT_ROWS ||
    sales.length >= MAX_REPORT_ROWS
  ) {
    return errorResponse(
      413,
      "This report contains too many rows. Select a narrower date range.",
    );
  }

  const summaryData = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  if (!summaryData) {
    return errorResponse(503, "Event report totals could not be verified.");
  }
  const reportSummary = summaryData as ReportSummary;
  const tierNames = new Map(
    ((tierResult.data ?? []) as TierRow[]).map((tier) => [tier.id, tier.name]),
  );
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
    if (saleWithinRange) {
      ticketRows.push([
        saleDate,
        "Ticket sale",
        "Ticket Sales",
        "",
        tierNames.get(sale.tier_id) ?? "Retained ticket tier",
        sale.refunded_at ? "Sold; refund recorded" : "Paid",
        saleAmount,
        sale.quantity,
        unitPrice,
        sale.payment_method?.replaceAll("_", " ") ?? "",
        sale.buyer_name ?? "",
      ]);
    }
    if (refundWithinRange && sale.refunded_at) {
      ticketRows.push([
        timestampDay(sale.refunded_at),
        "Ticket refund",
        "Ticket Sales",
        "",
        tierNames.get(sale.tier_id) ?? "Retained ticket tier",
        "Refunded",
        -saleAmount,
        -sale.quantity,
        unitPrice,
        sale.payment_method?.replaceAll("_", " ") ?? "",
        sale.buyer_name ?? "",
      ]);
    }
  }

  const transactionRows = transactions.map((transaction) => {
    const transactionAmount = amount(transaction.amount_ngn);
    if (transactionAmount === null) return null;
    return [
      transaction.transaction_date,
      transaction.kind === "income" ? "Other income" : "Expense",
      transaction.category_name_snapshot ?? "Uncategorized legacy entry",
      transaction.budget_allocation_name_snapshot ?? "",
      transaction.kind === "income"
        ? (transaction.source_note ?? "")
        : (transaction.description ?? ""),
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
