import { isUuid, resolveCustomSpecFromRequest } from "@/lib/ai/api-schemas";
import type { AiReportType } from "@/lib/ai/facts";
import { requireOfficer } from "@/lib/ai/officer.server";
import {
  AiUnavailableError,
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
} from "@/lib/ai/provider.server";
import { isSameSiteOrigin } from "@/lib/ai/request-guard";
import {
  loadActiveOfficerNarrative,
  loadFactsContextForScope,
} from "@/lib/reports/loaders.server";
import {
  AiGroundingError,
  generateGroundedNarrative,
} from "@/lib/reports/narrative-service.server";
import { periodParamForRow } from "@/lib/reports/period";
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
    return jsonError(400, "Invalid AI narrative identifier.");
  }

  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI report service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The regeneration request could not be verified.");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "AI report service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  if (!isAiReportsEnabled()) {
    return jsonError(503, "AI report summaries are currently disabled.");
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

  const { data: row, error: fetchError } = await supabase
    .from("ai_report_narratives")
    .select("id, report_type, scope_id, period_start, period_end, status")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return jsonError(503, "Could not load existing narrative.");
  }
  if (!row || row.status === "discarded") {
    return jsonError(404, "AI narrative was not found.");
  }

  const customSpecRes = await resolveCustomSpecFromRequest(
    request,
    row.report_type,
  );
  if (!customSpecRes.ok) {
    return jsonError(customSpecRes.status, customSpecRes.error);
  }

  const scopePeriod = periodParamForRow(
    row.report_type,
    row.period_start,
    row.period_end,
  );
  const factsCtx = await loadFactsContextForScope(supabase, {
    reportType: row.report_type as AiReportType,
    eventId: row.scope_id,
    from: row.period_start === "1900-01-01" ? null : row.period_start,
    to: row.period_end === "9999-12-31" ? null : row.period_end,
    period: scopePeriod,
    customSpec: customSpecRes.customSpec,
  });

  if (factsCtx.kind !== "ok") {
    return jsonError(503, "Report data could not be loaded.");
  }

  let generated: Awaited<ReturnType<typeof generateGroundedNarrative>>;
  try {
    generated = await generateGroundedNarrative(
      factsCtx.reportType,
      factsCtx.facts,
    );
  } catch (error) {
    if (error instanceof AiGroundingError) {
      return jsonError(
        422,
        "AI draft did not pass numeric verification. Existing draft kept.",
      );
    }
    if (error instanceof AiUnavailableError) {
      return jsonError(
        503,
        "AI summary unavailable right now. Existing draft kept.",
      );
    }
    return jsonError(503, "AI summary could not be regenerated.");
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

  const { data: inserted, error: insertError } = await supabase
    .from("ai_report_narratives")
    .insert({
      report_type: factsCtx.reportType,
      scope_id: factsCtx.scopeId,
      period_start: factsCtx.periodStart,
      period_end: factsCtx.periodEnd,
      facts_fingerprint: factsCtx.fingerprint,
      provider: generated.provider,
      model: generated.model,
      content: generated.content,
      status: "draft",
      created_by: officer.userId,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return jsonError(503, "Could not store regenerated AI summary.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_generated",
    p_report_type: factsCtx.reportType,
    p_narrative_id: inserted.id,
  });

  const fresh = await loadActiveOfficerNarrative(supabase, {
    reportType: factsCtx.reportType,
    scopeId: factsCtx.scopeId,
    periodStart: factsCtx.periodStart,
    periodEnd: factsCtx.periodEnd,
    fingerprint: factsCtx.fingerprint,
  });

  return Response.json(
    { narrative: fresh },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
