import { isUuid, parsePatchNarrativeBody } from "@/lib/ai/api-schemas";
import type { AiReportType } from "@/lib/ai/facts";
import { validateNarrativeContent } from "@/lib/ai/grounding";
import { requireOfficer } from "@/lib/ai/officer.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
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

const MAX_EDIT_BYTES = 8192;

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function PATCH(
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
    return jsonError(403, "The edit request could not be verified.");
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_EDIT_BYTES);
  if (bodyResult.kind === "too-large") {
    return jsonError(413, "Edited summary exceeds the size limit.");
  }
  if (bodyResult.kind !== "ok") {
    return jsonError(400, "Invalid JSON payload.");
  }

  const parsed = parsePatchNarrativeBody(bodyResult.data);
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
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
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, status",
    )
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return jsonError(503, "Could not load narrative draft.");
  }
  if (!row || row.status === "discarded") {
    return jsonError(404, "AI narrative draft was not found.");
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
    customSpec: parsed.customSpec,
  });

  if (factsCtx.kind !== "ok") {
    return jsonError(503, "Report data could not be verified.");
  }
  if (factsCtx.fingerprint !== row.facts_fingerprint) {
    return jsonError(
      409,
      "Report data changed since this draft was created. Regenerate to update.",
    );
  }

  const grounded = validateNarrativeContent(parsed.content, factsCtx.facts);
  if (!grounded.ok) {
    return jsonError(
      422,
      grounded.reasons[0] ||
        "Edited text contains unverified numbers or disallowed content.",
    );
  }

  const { error: updateError } = await supabase
    .from("ai_report_narratives")
    .update({
      content: grounded.content,
      status: "draft",
      approved_by: null,
      approved_at: null,
    })
    .eq("id", id);

  if (updateError) {
    return jsonError(503, "Could not save edited AI narrative.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_updated",
    p_report_type: row.report_type,
    p_narrative_id: id,
  });

  const updated = await loadActiveOfficerNarrative(supabase, {
    reportType: factsCtx.reportType,
    scopeId: factsCtx.scopeId,
    periodStart: factsCtx.periodStart,
    periodEnd: factsCtx.periodEnd,
    fingerprint: factsCtx.fingerprint,
  });

  return Response.json(
    { narrative: updated },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
