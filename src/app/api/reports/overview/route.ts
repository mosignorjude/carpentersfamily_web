import { createElement } from "react";
import { requireOfficer } from "@/lib/ai/officer.server";
import { ClubOverviewPdfDocument } from "@/lib/pdf/documents";
import { renderReportPdf } from "@/lib/pdf/render.server";
import {
  createSimplePdf,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
  toCsvRows,
} from "@/lib/report-export";
import {
  loadApprovedNarrativeForReport,
  loadClubOverviewSnapshot,
} from "@/lib/reports/loaders.server";
import {
  currentMonthPeriodWAT,
  parseOverviewPeriod,
} from "@/lib/reports/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function errorResponse(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get("period");
  const period = rawPeriod
    ? parseOverviewPeriod(rawPeriod)
    : currentMonthPeriodWAT();
  if (!period) {
    return errorResponse(400, "Choose a valid month or year period.");
  }

  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const includeAiParam = url.searchParams.get("includeAi");
  const includeAi = includeAiParam !== "false" && includeAiParam !== "0";

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return errorResponse(503, "Overview reports are unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return errorResponse(officer.status, officer.error);
  }

  const snap = await loadClubOverviewSnapshot(supabase, period);
  if (snap.kind !== "ok") {
    return errorResponse(503, "Overview report data could not be loaded.");
  }

  if (format === "csv") {
    const { facts } = snap;
    const rows: Array<Array<string | number | null>> = [
      ["Report", "Club overview"],
      ["Period", period.periodLabel],
      ["Period start", period.periodStart],
      ["Period end", period.periodEnd],
      [
        "Current club balance (NGN)",
        facts.club_finance.current_club_balance_ngn,
      ],
      [
        "Period dues collected (NGN)",
        facts.club_finance.period_dues_collected_ngn,
      ],
      ["Period other income (NGN)", facts.club_finance.period_other_income_ngn],
      ["Period expenses (NGN)", facts.club_finance.period_expenses_ngn],
      ["Active members", facts.dues.active_members],
      ["Dues collection rate (%)", facts.dues.collection_rate_pct],
      ["Members 3+ months overdue", facts.dues.overdue_three_plus_members],
      ["Events in period", facts.events.events_count],
      ["Net event cash (NGN)", facts.events.net_event_cash_ngn],
      ["Tickets sold", facts.events.tickets_sold],
      ["Attendance sessions", facts.attendance.sessions_count],
      ["Attendance check-ins", facts.attendance.total_checkins],
      [],
      ["Expense category", "Amount (NGN)", "Share (%)"],
      ...facts.club_finance.expense_by_category.map((cat) => [
        cat.category,
        cat.amount,
        cat.share_pct,
      ]),
      [],
      ["Top event", "Net cash result (NGN)"],
      ...facts.events.top_events.map((ev) => [ev.title, ev.net_result_ngn]),
    ];

    const csv = toCsvRows(rows);
    if (Buffer.byteLength(csv, "utf8") > MAX_REPORT_EXPORT_BYTES) {
      return errorResponse(413, "This report exceeds the safe export limit.");
    }
    return new Response(csv, {
      headers: {
        ...RESPONSE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="club-overview-${period.periodLabel}.csv"`,
      },
    });
  }

  const narrative = includeAi
    ? await loadApprovedNarrativeForReport(
        supabase,
        "club_overview",
        null,
        snap.fingerprint,
      )
    : null;

  let pdfBytes: Uint8Array | null;
  try {
    pdfBytes = await renderReportPdf(
      createElement(ClubOverviewPdfDocument, {
        periodLabel: period.periodLabel,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        generatedDate: getWATDate(),
        facts: snap.facts,
        narrative,
      }),
    );
  } catch (err) {
    console.error(
      "[Club Overview PDF] Branded render failed, falling back:",
      err,
    );
    const { facts } = snap;
    pdfBytes = createSimplePdf(
      "Carpenters Family Social Club | Club Overview",
      `Period ${period.periodLabel} (${period.periodStart} to ${period.periodEnd})`,
      [
        `Club Balance: NGN ${facts.club_finance.current_club_balance_ngn}`,
        `Period Dues Collected: NGN ${facts.club_finance.period_dues_collected_ngn}`,
        `Period Expenses: NGN ${facts.club_finance.period_expenses_ngn}`,
        `Dues Collection Rate: ${facts.dues.collection_rate_pct}%`,
        `Net Event Cash: NGN ${facts.events.net_event_cash_ngn}`,
        `Attendance Check-ins: ${facts.attendance.total_checkins}`,
      ],
    );
  }

  if (!pdfBytes) {
    return errorResponse(413, "This report exceeds the safe export limit.");
  }

  if (narrative) {
    await supabase.rpc("log_ai_report_event", {
      p_action: "ai_report_pdf_exported",
      p_report_type: "club_overview",
      p_narrative_id: narrative.id,
    });
  }

  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Response(pdfBuffer, {
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="club-overview-${period.periodLabel}.pdf"`,
    },
  });
}
