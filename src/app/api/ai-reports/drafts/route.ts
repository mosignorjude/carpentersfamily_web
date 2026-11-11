import { requireOfficer } from "@/lib/ai/officer.server";
import {
  AiUnavailableError,
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
} from "@/lib/ai/provider.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import { getWATDate } from "@/lib/report-export";
import {
  discardPriorDraftsForScope,
  generateGroundedFormalDraft,
  generatePseudonymisedMinutesDraft,
  insertDraftRecordWithAudit,
  loadActiveDraftRecord,
  loadAgmStatementSnapshot,
  loadMeetingMinutesContext,
  loadTreasurerReportSnapshot,
  previewMinutesPseudonymisation,
} from "@/lib/reports/drafts.server";
import {
  parseDraftPostBody,
  parseDraftScopeQuery,
} from "@/lib/reports/drafts-core";
import { AiGroundingError } from "@/lib/reports/narrative-service.server";
import { currentMonthPeriodWAT } from "@/lib/reports/period";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

const MAX_DRAFT_BODY_BYTES = 32_768;

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const currentMonth = currentMonthPeriodWAT();
  const currentYear = Number(getWATDate().slice(0, 4));

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
    return jsonError(503, "Document drafting service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  if (parsed.reportType === "agm_statement") {
    const snap = await loadAgmStatementSnapshot(supabase, parsed.fiscalYear);
    if (snap.kind !== "ok") {
      return jsonError(503, "AGM financial data could not be loaded.");
    }
    const draft = await loadActiveDraftRecord(supabase, {
      reportType: "agm_statement",
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      fingerprint: snap.fingerprint,
    });
    return Response.json(
      {
        enabled: isAiReportsEnabled(),
        reportType: "agm_statement",
        fiscalYear: parsed.fiscalYear,
        facts: snap.facts,
        comparisonRows: snap.comparisonRows,
        fingerprint: snap.fingerprint,
        draft,
      },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  if (parsed.reportType === "treasurer_report") {
    const snap = await loadTreasurerReportSnapshot(supabase, {
      periodParam: parsed.periodParam,
      periodLabel: parsed.periodLabel,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
    });
    if (snap.kind !== "ok") {
      return jsonError(503, "Treasurer report data could not be loaded.");
    }
    const draft = await loadActiveDraftRecord(supabase, {
      reportType: "treasurer_report",
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      fingerprint: snap.fingerprint,
    });
    return Response.json(
      {
        enabled: isAiReportsEnabled(),
        reportType: "treasurer_report",
        periodParam: parsed.periodParam,
        periodLabel: parsed.periodLabel,
        facts: snap.facts,
        fingerprint: snap.fingerprint,
        draft,
      },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  const ctx = await loadMeetingMinutesContext(supabase, parsed.eventId, true);
  if (ctx.kind === "not-found") {
    return jsonError(404, "Meeting was not found or minutes are disabled.");
  }
  if (ctx.kind !== "ok") {
    return jsonError(503, "Meeting context could not be loaded.");
  }

  const draft = await loadActiveDraftRecord(supabase, {
    reportType: "minutes",
    scopeId: parsed.eventId,
  });

  return Response.json(
    {
      enabled: isAiReportsEnabled(),
      reportType: "minutes",
      meeting: ctx.meeting,
      meetingDateYmd: ctx.meetingDateYmd,
      draft,
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}

export async function POST(request: Request) {
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI document service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The AI draft request could not be verified.");
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_DRAFT_BODY_BYTES);
  if (bodyResult.kind === "too-large") {
    return jsonError(413, "Request payload exceeds the size limit.");
  }
  if (bodyResult.kind !== "ok") {
    return jsonError(400, "Invalid JSON request payload.");
  }

  const currentMonth = currentMonthPeriodWAT();
  const currentYear = Number(getWATDate().slice(0, 4));
  const parsed = parseDraftPostBody(bodyResult.data, {
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
    return jsonError(503, "AI document service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  if (parsed.action === "preview_minutes") {
    const ctx = await loadMeetingMinutesContext(supabase, parsed.eventId, true);
    if (ctx.kind === "not-found") {
      return jsonError(404, "Meeting was not found or minutes are disabled.");
    }
    if (ctx.kind !== "ok") {
      return jsonError(503, "Meeting context could not be loaded.");
    }

    const preview = await previewMinutesPseudonymisation(
      supabase,
      parsed.rawNotes,
    );
    if (preview.kind !== "ok") {
      return jsonError(503, "Could not load active member directory.");
    }

    return Response.json(
      {
        maskedText: preview.maskedText,
        stats: preview.stats,
      },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  if (!isAiReportsEnabled()) {
    return jsonError(503, "AI document drafting is currently disabled.");
  }

  const dailyLimit = getAiDailyLimitPerOfficer();
  const { data: quotaOk, error: quotaError } = await supabase.rpc(
    "ai_generation_quota_ok",
    { p_limit: dailyLimit },
  );
  if (quotaError) {
    return jsonError(503, "Unable to verify daily AI quota.");
  }
  if (quotaOk !== true) {
    return jsonError(
      429,
      `Daily limit of ${dailyLimit} AI summaries reached. Try again tomorrow.`,
    );
  }

  const { scope } = parsed;

  if (scope.reportType === "agm_statement") {
    const snap = await loadAgmStatementSnapshot(supabase, scope.fiscalYear);
    if (snap.kind !== "ok") {
      return jsonError(503, "AGM financial data could not be loaded.");
    }

    const existing = await loadActiveDraftRecord(supabase, {
      reportType: "agm_statement",
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      fingerprint: snap.fingerprint,
    });
    if (existing) {
      return Response.json(
        { draft: existing, cached: true },
        { status: 200, headers: RESPONSE_HEADERS },
      );
    }

    try {
      const generated = await generateGroundedFormalDraft(
        "agm_statement",
        snap.facts,
      );
      await discardPriorDraftsForScope(supabase, {
        reportType: "agm_statement",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
      });
      const inserted = await insertDraftRecordWithAudit(supabase, {
        reportType: "agm_statement",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        fingerprint: snap.fingerprint,
        provider: generated.provider,
        model: generated.model,
        content: generated.content,
        officerId: officer.userId,
      });
      if (inserted.kind !== "ok") {
        return jsonError(503, "Could not save AGM statement draft.");
      }
      const saved = await loadActiveDraftRecord(supabase, {
        reportType: "agm_statement",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        fingerprint: snap.fingerprint,
      });
      return Response.json(
        { draft: saved, cached: false },
        { status: 201, headers: RESPONSE_HEADERS },
      );
    } catch (error) {
      if (error instanceof AiGroundingError) {
        return jsonError(
          422,
          "AI draft did not pass numeric verification. Please try again.",
        );
      }
      if (error instanceof AiUnavailableError) {
        return jsonError(
          503,
          "AI drafting unavailable right now. You can still download the deterministic PDF.",
        );
      }
      return jsonError(503, "AGM draft could not be generated.");
    }
  }

  if (scope.reportType === "treasurer_report") {
    const snap = await loadTreasurerReportSnapshot(supabase, {
      periodParam: scope.periodParam,
      periodLabel: scope.periodLabel,
      periodStart: scope.periodStart,
      periodEnd: scope.periodEnd,
    });
    if (snap.kind !== "ok") {
      return jsonError(503, "Treasurer report data could not be loaded.");
    }

    const existing = await loadActiveDraftRecord(supabase, {
      reportType: "treasurer_report",
      scopeId: null,
      periodStart: snap.periodStart,
      periodEnd: snap.periodEnd,
      fingerprint: snap.fingerprint,
    });
    if (existing) {
      return Response.json(
        { draft: existing, cached: true },
        { status: 200, headers: RESPONSE_HEADERS },
      );
    }

    try {
      const generated = await generateGroundedFormalDraft(
        "treasurer_report",
        snap.facts,
      );
      await discardPriorDraftsForScope(supabase, {
        reportType: "treasurer_report",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
      });
      const inserted = await insertDraftRecordWithAudit(supabase, {
        reportType: "treasurer_report",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        fingerprint: snap.fingerprint,
        provider: generated.provider,
        model: generated.model,
        content: generated.content,
        officerId: officer.userId,
      });
      if (inserted.kind !== "ok") {
        return jsonError(503, "Could not save Treasurer's report draft.");
      }
      const saved = await loadActiveDraftRecord(supabase, {
        reportType: "treasurer_report",
        scopeId: null,
        periodStart: snap.periodStart,
        periodEnd: snap.periodEnd,
        fingerprint: snap.fingerprint,
      });
      return Response.json(
        { draft: saved, cached: false },
        { status: 201, headers: RESPONSE_HEADERS },
      );
    } catch (error) {
      if (error instanceof AiGroundingError) {
        return jsonError(
          422,
          "AI draft did not pass numeric verification. Please try again.",
        );
      }
      if (error instanceof AiUnavailableError) {
        return jsonError(
          503,
          "AI drafting unavailable right now. You can still download the deterministic PDF.",
        );
      }
      return jsonError(503, "Treasurer draft could not be generated.");
    }
  }

  // Meeting minutes drafting with pseudonymisation
  const ctx = await loadMeetingMinutesContext(supabase, scope.eventId, true);
  if (ctx.kind === "not-found") {
    return jsonError(404, "Meeting was not found or minutes are disabled.");
  }
  if (ctx.kind !== "ok") {
    return jsonError(503, "Meeting context could not be loaded.");
  }

  try {
    const generated = await generatePseudonymisedMinutesDraft(supabase, {
      meeting: ctx.meeting,
      meetingDateYmd: ctx.meetingDateYmd,
      rawNotes: parsed.rawNotes ?? "",
      preparedMaskedNotes: parsed.preparedMaskedNotes,
    });

    await discardPriorDraftsForScope(supabase, {
      reportType: "minutes",
      scopeId: scope.eventId,
    });

    const inserted = await insertDraftRecordWithAudit(supabase, {
      reportType: "minutes",
      scopeId: scope.eventId,
      periodStart: ctx.meetingDateYmd,
      periodEnd: ctx.meetingDateYmd,
      fingerprint: generated.fingerprint,
      provider: generated.provider,
      model: generated.model,
      content: generated.content,
      officerId: officer.userId,
    });
    if (inserted.kind !== "ok") {
      return jsonError(503, "Could not save structured minutes draft.");
    }

    const saved = await loadActiveDraftRecord(supabase, {
      reportType: "minutes",
      scopeId: scope.eventId,
      fingerprint: generated.fingerprint,
    });
    return Response.json(
      { draft: saved, cached: false },
      { status: 201, headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    if (error instanceof AiGroundingError) {
      return jsonError(
        422,
        error.reasons[0] || "AI minutes output failed safety verification.",
      );
    }
    if (error instanceof AiUnavailableError) {
      return jsonError(
        503,
        "AI minutes assistant unavailable right now. You can still edit minutes manually in Meeting Hub.",
      );
    }
    return jsonError(503, "Meeting minutes draft could not be structured.");
  }
}
