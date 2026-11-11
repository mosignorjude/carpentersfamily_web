import { isUuid } from "@/lib/ai/api-schemas";
import {
  validateFormalDraftContent,
  validateMinutesDraftContent,
} from "@/lib/ai/grounding";
import { requireOfficer } from "@/lib/ai/officer.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import {
  loadActiveDraftRecord,
  loadAgmStatementSnapshot,
  loadDraftByIdForOfficer,
  loadTreasurerReportSnapshot,
  resolveApprovedTreasurerPeriod,
} from "@/lib/reports/drafts.server";
import { parseDraftPatchBody } from "@/lib/reports/drafts-core";
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

const MAX_EDIT_BYTES = 32_768;

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
    return jsonError(400, "Invalid draft identifier.");
  }

  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI document service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The edit request could not be verified.");
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_EDIT_BYTES);
  if (bodyResult.kind === "too-large") {
    return jsonError(413, "Edited document exceeds the size limit.");
  }
  if (bodyResult.kind !== "ok") {
    return jsonError(400, "Invalid JSON payload.");
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

  const loaded = await loadDraftByIdForOfficer(supabase, id);
  if (loaded.kind === "unavailable") {
    return jsonError(503, "Could not load document draft.");
  }
  if (loaded.kind === "not-found") {
    return jsonError(404, "Document draft was not found.");
  }

  const { row } = loaded;
  const parsedBody = parseDraftPatchBody(row.report_type, bodyResult.data);
  if (!parsedBody.ok) {
    return jsonError(400, parsedBody.error);
  }

  let contentToSave = parsedBody.draft;

  if (row.report_type === "agm_statement") {
    const fiscalYear = Number(row.period_start.slice(0, 4));
    const snap = await loadAgmStatementSnapshot(supabase, fiscalYear);
    if (snap.kind !== "ok") {
      return jsonError(503, "AGM financial data could not be verified.");
    }
    if (snap.fingerprint !== row.facts_fingerprint) {
      return jsonError(
        409,
        "AGM financial figures changed since this draft was created. Regenerate to update.",
      );
    }
    const checked = validateFormalDraftContent(
      "agm_statement",
      contentToSave,
      snap.facts,
    );
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] ||
          "Edited text contains unverified numbers or disallowed content.",
      );
    }
    contentToSave = checked.content;
  } else if (row.report_type === "treasurer_report") {
    const period = resolveApprovedTreasurerPeriod(
      row.period_start,
      row.period_end,
    );
    if (!period) {
      return jsonError(503, "Treasurer report period could not be verified.");
    }
    const snap = await loadTreasurerReportSnapshot(supabase, period);
    if (snap.kind !== "ok") {
      return jsonError(503, "Treasurer report data could not be verified.");
    }
    if (snap.fingerprint !== row.facts_fingerprint) {
      return jsonError(
        409,
        "Treasury figures changed since this draft was created. Regenerate to update.",
      );
    }
    const checked = validateFormalDraftContent(
      "treasurer_report",
      contentToSave,
      snap.facts,
    );
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] ||
          "Edited text contains unverified numbers or disallowed content.",
      );
    }
    contentToSave = checked.content;
  } else {
    const checked = validateMinutesDraftContent(contentToSave);
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] || "Edited minutes failed safety validation.",
      );
    }
    contentToSave = checked.content;
  }

  const { error: updateError } = await supabase
    .from("ai_report_narratives")
    .update({
      content: contentToSave,
      status: "draft",
      approved_by: null,
      approved_at: null,
    })
    .eq("id", id);

  if (updateError) {
    return jsonError(503, "Could not save edited document draft.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_updated",
    p_report_type: row.report_type,
    p_narrative_id: id,
  });

  const updated = await loadActiveDraftRecord(supabase, {
    reportType: row.report_type,
    scopeId: row.scope_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    fingerprint: row.facts_fingerprint,
  });

  return Response.json(
    { draft: updated },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
