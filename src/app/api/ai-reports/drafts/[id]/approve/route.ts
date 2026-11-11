import { isUuid } from "@/lib/ai/api-schemas";
import {
  validateFormalDraftContent,
  validateMinutesDraftContent,
} from "@/lib/ai/grounding";
import { requireOfficer } from "@/lib/ai/officer.server";
import { isSameSiteOrigin } from "@/lib/ai/request-guard";
import {
  loadActiveDraftRecord,
  loadAgmStatementSnapshot,
  loadDraftByIdForOfficer,
  loadTreasurerReportSnapshot,
  resolveApprovedTreasurerPeriod,
} from "@/lib/reports/drafts.server";
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
    return jsonError(400, "Invalid draft identifier.");
  }

  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI document service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The approval request could not be verified.");
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

  if (row.report_type === "agm_statement") {
    const fiscalYear = Number(row.period_start.slice(0, 4));
    const snap = await loadAgmStatementSnapshot(supabase, fiscalYear);
    if (snap.kind !== "ok") {
      return jsonError(503, "AGM financial data could not be verified.");
    }
    if (snap.fingerprint !== row.facts_fingerprint) {
      return jsonError(
        409,
        "Financial data changed since this draft was created. Regenerate before approving.",
      );
    }
    const checked = validateFormalDraftContent(
      "agm_statement",
      row.content,
      snap.facts,
    );
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] || "Draft failed numeric verification.",
      );
    }
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
      return jsonError(503, "Treasurer data could not be verified.");
    }
    if (snap.fingerprint !== row.facts_fingerprint) {
      return jsonError(
        409,
        "Treasury figures changed since this draft was created. Regenerate before approving.",
      );
    }
    const checked = validateFormalDraftContent(
      "treasurer_report",
      row.content,
      snap.facts,
    );
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] || "Draft failed numeric verification.",
      );
    }
  } else {
    const checked = validateMinutesDraftContent(row.content);
    if (!checked.ok) {
      return jsonError(
        422,
        checked.reasons[0] || "Minutes draft failed verification checks.",
      );
    }
    if (checked.unresolvedTokens.length > 0) {
      return jsonError(
        422,
        `Replace unresolved placeholder tokens before approving: ${checked.unresolvedTokens.join(", ")}`,
      );
    }
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
    return jsonError(503, "Could not approve document draft.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_approved",
    p_report_type: row.report_type,
    p_narrative_id: id,
  });

  const approved = await loadActiveDraftRecord(supabase, {
    reportType: row.report_type,
    scopeId: row.scope_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    fingerprint: row.facts_fingerprint,
  });

  return Response.json(
    { draft: approved },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
