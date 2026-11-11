import { isUuid } from "@/lib/ai/api-schemas";
import { requireOfficer } from "@/lib/ai/officer.server";
import {
  AiUnavailableError,
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
} from "@/lib/ai/provider.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import {
  generateGroundedFormalDraft,
  generatePseudonymisedMinutesDraft,
  insertDraftRecordWithAudit,
  loadActiveDraftRecord,
  loadAgmStatementSnapshot,
  loadDraftByIdForOfficer,
  loadMeetingMinutesContext,
  loadTreasurerReportSnapshot,
  resolveApprovedTreasurerPeriod,
} from "@/lib/reports/drafts.server";
import { MAX_MINUTES_NOTES_LENGTH } from "@/lib/reports/drafts-core";
import { AiGroundingError } from "@/lib/reports/narrative-service.server";
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

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuid(id)) {
    return jsonError(400, "Invalid draft identifier.");
  }

  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI document service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The regeneration request could not be verified.");
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

  const loaded = await loadDraftByIdForOfficer(supabase, id);
  if (loaded.kind === "unavailable") {
    return jsonError(503, "Could not load existing draft.");
  }
  if (loaded.kind === "not-found") {
    return jsonError(404, "Document draft was not found.");
  }

  const { row } = loaded;
  let newFingerprint: string;
  let newPeriodStart = row.period_start;
  let newPeriodEnd = row.period_end;
  let generatedProvider: string;
  let generatedModel: string;
  let generatedContent: Awaited<
    ReturnType<typeof generateGroundedFormalDraft>
  >["content"];

  try {
    if (row.report_type === "agm_statement") {
      const fiscalYear = Number(row.period_start.slice(0, 4));
      const snap = await loadAgmStatementSnapshot(supabase, fiscalYear);
      if (snap.kind !== "ok") {
        return jsonError(503, "AGM financial data could not be loaded.");
      }
      const gen = await generateGroundedFormalDraft(
        "agm_statement",
        snap.facts,
      );
      newFingerprint = snap.fingerprint;
      newPeriodStart = snap.periodStart;
      newPeriodEnd = snap.periodEnd;
      generatedProvider = gen.provider;
      generatedModel = gen.model;
      generatedContent = gen.content;
    } else if (row.report_type === "treasurer_report") {
      const period = resolveApprovedTreasurerPeriod(
        row.period_start,
        row.period_end,
      );
      if (!period) {
        return jsonError(503, "Treasurer report period could not be resolved.");
      }
      const snap = await loadTreasurerReportSnapshot(supabase, period);
      if (snap.kind !== "ok") {
        return jsonError(503, "Treasurer report data could not be loaded.");
      }
      const gen = await generateGroundedFormalDraft(
        "treasurer_report",
        snap.facts,
      );
      newFingerprint = snap.fingerprint;
      newPeriodStart = snap.periodStart;
      newPeriodEnd = snap.periodEnd;
      generatedProvider = gen.provider;
      generatedModel = gen.model;
      generatedContent = gen.content;
    } else {
      if (!row.scope_id) {
        return jsonError(400, "Minutes draft is missing its meeting link.");
      }
      const bodyResult = await readBoundedJsonBody(request, 32_768);
      if (bodyResult.kind === "too-large") {
        return jsonError(413, "Request payload exceeds the size limit.");
      }
      const bodyObj =
        bodyResult.kind === "ok" &&
        typeof bodyResult.data === "object" &&
        bodyResult.data !== null &&
        !Array.isArray(bodyResult.data)
          ? (bodyResult.data as Record<string, unknown>)
          : {};
      const rawNotes =
        typeof bodyObj.rawNotes === "string" ? bodyObj.rawNotes.trim() : "";
      if (rawNotes.length < 10 || rawNotes.length > MAX_MINUTES_NOTES_LENGTH) {
        return jsonError(
          400,
          "Provide the meeting notes (10-15,000 characters) to regenerate structured minutes.",
        );
      }
      const preparedMaskedNotes =
        typeof bodyObj.preparedMaskedNotes === "string" &&
        bodyObj.preparedMaskedNotes.trim().length > 0
          ? bodyObj.preparedMaskedNotes
              .trim()
              .slice(0, MAX_MINUTES_NOTES_LENGTH)
          : undefined;

      const ctx = await loadMeetingMinutesContext(supabase, row.scope_id, true);
      if (ctx.kind !== "ok") {
        return jsonError(404, "Meeting was not found or minutes are disabled.");
      }
      const gen = await generatePseudonymisedMinutesDraft(supabase, {
        meeting: ctx.meeting,
        meetingDateYmd: ctx.meetingDateYmd,
        rawNotes,
        preparedMaskedNotes,
      });
      newFingerprint = gen.fingerprint;
      newPeriodStart = ctx.meetingDateYmd;
      newPeriodEnd = ctx.meetingDateYmd;
      generatedProvider = gen.provider;
      generatedModel = gen.model;
      generatedContent = gen.content;
    }
  } catch (error) {
    if (error instanceof AiGroundingError) {
      return jsonError(
        422,
        "AI draft did not pass verification. Existing draft kept.",
      );
    }
    if (error instanceof AiUnavailableError) {
      return jsonError(
        503,
        "AI drafting unavailable right now. Existing draft kept.",
      );
    }
    return jsonError(503, "Draft could not be regenerated.");
  }

  const { error: discardError } = await supabase
    .from("ai_report_narratives")
    .update({
      status: "discarded",
      approved_by: null,
      approved_at: null,
    })
    .eq("id", id);

  if (discardError) {
    return jsonError(503, "Could not replace previous draft.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_discarded",
    p_report_type: row.report_type,
    p_narrative_id: id,
  });

  const inserted = await insertDraftRecordWithAudit(supabase, {
    reportType: row.report_type,
    scopeId: row.scope_id,
    periodStart: newPeriodStart,
    periodEnd: newPeriodEnd,
    fingerprint: newFingerprint,
    provider: generatedProvider,
    model: generatedModel,
    content: generatedContent,
    officerId: officer.userId,
  });
  if (inserted.kind !== "ok") {
    return jsonError(503, "Could not store regenerated document draft.");
  }

  const fresh = await loadActiveDraftRecord(supabase, {
    reportType: row.report_type,
    scopeId: row.scope_id,
    periodStart: newPeriodStart,
    periodEnd: newPeriodEnd,
    fingerprint: newFingerprint,
  });

  return Response.json(
    { draft: fresh },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
