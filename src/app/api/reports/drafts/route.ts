import { createElement } from "react";
import { requireOfficer } from "@/lib/ai/officer.server";
import { clubBrand } from "@/lib/brand";
import {
  AgmStatementPdfDocument,
  MeetingMinutesPdfDocument,
  TreasurerReportPdfDocument,
} from "@/lib/pdf/documents";
import { renderReportPdf } from "@/lib/pdf/render.server";
import {
  createSimplePdf,
  formatNgn,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
} from "@/lib/report-export";
import {
  loadActiveDraftRecord,
  loadAgmStatementSnapshot,
  loadMeetingMinutesContext,
  loadTreasurerReportSnapshot,
} from "@/lib/reports/drafts.server";
import { parseDraftScopeQuery } from "@/lib/reports/drafts-core";
import { currentMonthPeriodWAT, formatWatDate } from "@/lib/reports/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

function pdfResponse(bytes: Uint8Array, filename: string) {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new Response(buf, {
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentMonth = currentMonthPeriodWAT();
  const currentYear = Number(getWATDate().slice(0, 4));
  const includeAi =
    url.searchParams.get("includeAi") !== "false" &&
    url.searchParams.get("includeAi") !== "0";

  const parsed = parseDraftScopeQuery({
    reportType: url.searchParams.get("reportType"),
    year: url.searchParams.get("year"),
    period: url.searchParams.get("period"),
    eventId: url.searchParams.get("eventId"),
    defaultYear: currentYear,
    defaultPeriodParam: currentMonth.periodParam,
  });
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Document PDF service is unavailable.");
  }

  const generatedDate = getWATDate();

  if (parsed.reportType === "agm_statement") {
    const officer = await requireOfficer(supabase);
    if (!officer.ok) {
      return jsonError(officer.status, officer.error);
    }

    const snap = await loadAgmStatementSnapshot(supabase, parsed.fiscalYear);
    if (snap.kind !== "ok") {
      return jsonError(503, "AGM financial data could not be loaded.");
    }

    const activeDraft = includeAi
      ? await loadActiveDraftRecord(supabase, {
          reportType: "agm_statement",
          scopeId: null,
          periodStart: snap.periodStart,
          periodEnd: snap.periodEnd,
          fingerprint: snap.fingerprint,
        })
      : null;
    const approvedDraft =
      activeDraft && activeDraft.status === "approved" ? activeDraft : null;

    let pdfBytes: Uint8Array | null;
    try {
      pdfBytes = await renderReportPdf(
        createElement(AgmStatementPdfDocument, {
          fiscalYear: parsed.fiscalYear,
          generatedDate,
          facts: snap.facts,
          comparisonRows: snap.comparisonRows,
          draft: approvedDraft?.content ?? null,
          approvedByName: approvedDraft?.approvedByName ?? null,
          approvedAt: approvedDraft?.approvedAt ?? null,
        }),
      );
    } catch (err) {
      console.error("[AGM PDF] Branded render failed, falling back:", err);
      const { current, prior } = snap.facts;
      const lines = [
        `Fiscal Year: ${parsed.fiscalYear} vs ${parsed.fiscalYear - 1}`,
        `Closing Club Balance: NGN ${formatNgn(BigInt(current.closing_club_balance_ngn))}`,
        `FY ${parsed.fiscalYear} Total Inflows: NGN ${formatNgn(BigInt(current.total_inflows_ngn))}`,
        `FY ${parsed.fiscalYear} Total Outflows: NGN ${formatNgn(BigInt(current.total_outflows_ngn))}`,
        `FY ${parsed.fiscalYear} Net Surplus / (Deficit): NGN ${formatNgn(BigInt(current.net_surplus_ngn))}`,
        `Prior FY Net Surplus / (Deficit): NGN ${formatNgn(BigInt(prior.net_surplus_ngn))}`,
        ...(approvedDraft
          ? [
              "",
              approvedDraft.content.title,
              approvedDraft.content.summary,
              ...approvedDraft.content.sections.flatMap((s) => [
                "",
                s.heading,
                s.body,
              ]),
            ]
          : []),
      ];
      pdfBytes = createSimplePdf(
        `${clubBrand.name} | AGM Statement`,
        `FY ${parsed.fiscalYear}`,
        lines,
      );
    }

    if (!pdfBytes || pdfBytes.byteLength > MAX_REPORT_EXPORT_BYTES) {
      return jsonError(413, "This PDF exceeds the safe export limit.");
    }

    if (approvedDraft) {
      await supabase.rpc("log_ai_report_event", {
        p_action: "ai_report_pdf_exported",
        p_report_type: "agm_statement",
        p_narrative_id: approvedDraft.id,
      });
    }

    return pdfResponse(pdfBytes, `agm-statement-${parsed.fiscalYear}.pdf`);
  }

  if (parsed.reportType === "treasurer_report") {
    const officer = await requireOfficer(supabase);
    if (!officer.ok) {
      return jsonError(officer.status, officer.error);
    }

    const snap = await loadTreasurerReportSnapshot(supabase, {
      periodParam: parsed.periodParam,
      periodLabel: parsed.periodLabel,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
    });
    if (snap.kind !== "ok") {
      return jsonError(503, "Treasurer report data could not be loaded.");
    }

    const activeDraft = includeAi
      ? await loadActiveDraftRecord(supabase, {
          reportType: "treasurer_report",
          scopeId: null,
          periodStart: snap.periodStart,
          periodEnd: snap.periodEnd,
          fingerprint: snap.fingerprint,
        })
      : null;
    const approvedDraft =
      activeDraft && activeDraft.status === "approved" ? activeDraft : null;

    let pdfBytes: Uint8Array | null;
    try {
      pdfBytes = await renderReportPdf(
        createElement(TreasurerReportPdfDocument, {
          periodLabel: parsed.periodLabel,
          periodStart: parsed.periodStart,
          periodEnd: parsed.periodEnd,
          generatedDate,
          facts: snap.facts,
          draft: approvedDraft?.content ?? null,
          approvedByName: approvedDraft?.approvedByName ?? null,
          approvedAt: approvedDraft?.approvedAt ?? null,
        }),
      );
    } catch (err) {
      console.error(
        "[Treasurer PDF] Branded render failed, falling back:",
        err,
      );
      const { treasury_totals, dues } = snap.facts;
      const lines = [
        `Period: ${parsed.periodStart} to ${parsed.periodEnd}`,
        `Closing Club Balance: NGN ${formatNgn(BigInt(treasury_totals.closing_club_balance_ngn))}`,
        `Total Inflows: NGN ${formatNgn(BigInt(treasury_totals.total_inflows_ngn))}`,
        `Total Outflows: NGN ${formatNgn(BigInt(treasury_totals.total_outflows_ngn))}`,
        `Net Cash Flow: NGN ${formatNgn(BigInt(treasury_totals.net_period_cash_flow_ngn))}`,
        `Dues Collection Rate: ${dues.collection_rate_pct}%`,
        ...(approvedDraft
          ? [
              "",
              approvedDraft.content.title,
              approvedDraft.content.summary,
              ...approvedDraft.content.sections.flatMap((s) => [
                "",
                s.heading,
                s.body,
              ]),
            ]
          : []),
      ];
      pdfBytes = createSimplePdf(
        `${clubBrand.name} | Treasurer's Report`,
        parsed.periodLabel,
        lines,
      );
    }

    if (!pdfBytes || pdfBytes.byteLength > MAX_REPORT_EXPORT_BYTES) {
      return jsonError(413, "This PDF exceeds the safe export limit.");
    }

    if (approvedDraft) {
      await supabase.rpc("log_ai_report_event", {
        p_action: "ai_report_pdf_exported",
        p_report_type: "treasurer_report",
        p_narrative_id: approvedDraft.id,
      });
    }

    return pdfResponse(pdfBytes, `treasurer-report-${parsed.periodLabel}.pdf`);
  }

  // Meeting minutes PDF export: active club member for published minutes,
  // or officer when exporting an approved draft.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonError(401, "Sign in to download meeting minutes.");
  }
  const { data: profile, error: profileErr } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileErr || profile?.status !== "active") {
    return jsonError(403, "Active membership is required.");
  }

  const ctx = await loadMeetingMinutesContext(supabase, parsed.eventId, true);
  if (ctx.kind === "not-found") {
    return jsonError(404, "Meeting was not found or minutes are disabled.");
  }
  if (ctx.kind !== "ok") {
    return jsonError(503, "Could not load meeting minutes.");
  }

  const { data: isOfficer } = await supabase.rpc("is_club_officer");
  const officerDraft =
    isOfficer === true && includeAi
      ? await loadActiveDraftRecord(supabase, {
          reportType: "minutes",
          scopeId: parsed.eventId,
        })
      : null;
  const approvedDraft =
    officerDraft && officerDraft.status === "approved" ? officerDraft : null;

  const publishedText = ctx.meeting.publishedContent;
  const publishedNewerThanDraft =
    Boolean(publishedText) &&
    Boolean(approvedDraft) &&
    Boolean(ctx.meeting.publishedUpdatedAt) &&
    new Date(ctx.meeting.publishedUpdatedAt ?? 0).getTime() >
      new Date(approvedDraft?.updatedAt ?? 0).getTime() + 5000;

  const useStructuredDraft = Boolean(approvedDraft) && !publishedNewerThanDraft;

  if (!useStructuredDraft && !publishedText) {
    return jsonError(
      404,
      "No approved or published minutes are available for PDF export yet.",
    );
  }

  const revisionLabel = ctx.meeting.publishedRevision
    ? `Revision ${ctx.meeting.publishedRevision}`
    : approvedDraft
      ? "Approved Draft"
      : "Unpublished";

  const { present, late, absent, excused, total } =
    ctx.meeting.attendanceCounts;
  const attendanceSummaryLabel =
    total > 0
      ? `${present} present · ${late} late · ${absent + excused} absent/excused`
      : "No roster check-ins recorded";

  const meetingDateLabel = `${formatWatDate(new Date(ctx.meeting.startsAt))} WAT`;
  const locationLabel = ctx.meeting.location || "Club Venue";

  let pdfBytes: Uint8Array | null;
  try {
    pdfBytes = await renderReportPdf(
      createElement(MeetingMinutesPdfDocument, {
        meetingTitle: ctx.meeting.title,
        meetingDateLabel,
        location: locationLabel,
        generatedDate,
        revisionLabel,
        attendanceSummaryLabel,
        draft: useStructuredDraft ? (approvedDraft?.content ?? null) : null,
        plainPublishedText: useStructuredDraft ? null : publishedText,
        approvedByName: useStructuredDraft
          ? (approvedDraft?.approvedByName ?? null)
          : null,
        approvedAt: useStructuredDraft
          ? (approvedDraft?.approvedAt ?? null)
          : null,
      }),
    );
  } catch (err) {
    console.error("[Minutes PDF] Branded render failed, falling back:", err);
    const bodyLines =
      useStructuredDraft && approvedDraft
        ? [
            approvedDraft.content.title,
            approvedDraft.content.summary,
            ...approvedDraft.content.sections.flatMap((s) => [
              "",
              s.heading,
              s.body,
            ]),
          ]
        : (publishedText ?? "").split(/\r?\n/);

    pdfBytes = createSimplePdf(
      `${clubBrand.name} | Meeting Minutes`,
      ctx.meeting.title,
      bodyLines,
    );
  }

  if (!pdfBytes || pdfBytes.byteLength > MAX_REPORT_EXPORT_BYTES) {
    return jsonError(413, "This PDF exceeds the safe export limit.");
  }

  if (approvedDraft && isOfficer === true) {
    await supabase.rpc("log_ai_report_event", {
      p_action: "ai_report_pdf_exported",
      p_report_type: "minutes",
      p_narrative_id: approvedDraft.id,
    });
  }

  return pdfResponse(pdfBytes, `meeting-minutes-${ctx.meetingDateYmd}.pdf`);
}
