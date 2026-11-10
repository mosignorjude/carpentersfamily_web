import { isUuid, resolveCustomSpecFromRequest } from "@/lib/ai/api-schemas";
import type { AiReportType } from "@/lib/ai/facts";
import { validateNarrativeContent } from "@/lib/ai/grounding";
import { requireOfficer } from "@/lib/ai/officer.server";
import { isSameSiteOrigin } from "@/lib/ai/request-guard";
import {
  loadActiveOfficerNarrative,
  loadFactsContextForScope,
} from "@/lib/reports/loaders.server";
import { periodParamForRow } from "@/lib/reports/period";
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
    return jsonError(403, "The approval request could not be verified.");
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

  const { data: row, error: fetchError } = await supabase
    .from("ai_report_narratives")
    .select(
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, content, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return jsonError(503, "Could not load narrative draft.");
  }
  if (!row || row.status === "discarded") {
    return jsonError(404, "AI narrative draft was not found.");
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
    return jsonError(503, "Report data could not be verified.");
  }
  if (factsCtx.fingerprint !== row.facts_fingerprint) {
    return jsonError(
      409,
      "Report data changed since this draft was created. Regenerate before approving.",
    );
  }

  const grounded = validateNarrativeContent(row.content, factsCtx.facts);
  if (!grounded.ok) {
    return jsonError(
      422,
      grounded.reasons[0] || "Draft failed verification checks.",
    );
  }

  const { error: approveError } = await supabase
    .from("ai_report_narratives")
    .update({
      status: "approved",
      approved_by: officer.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (approveError) {
    return jsonError(503, "Could not approve AI narrative.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_approved",
    p_report_type: row.report_type,
    p_narrative_id: id,
  });

  const approved = await loadActiveOfficerNarrative(supabase, {
    reportType: factsCtx.reportType,
    scopeId: factsCtx.scopeId,
    periodStart: factsCtx.periodStart,
    periodEnd: factsCtx.periodEnd,
    fingerprint: factsCtx.fingerprint,
  });

  return Response.json(
    { narrative: approved },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
