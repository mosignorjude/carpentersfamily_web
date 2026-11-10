import { isUuid, parseGenerateRequest } from "@/lib/ai/api-schemas";
import { requireOfficer } from "@/lib/ai/officer.server";
import {
  AiUnavailableError,
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
} from "@/lib/ai/provider.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import {
  loadActiveOfficerNarrative,
  loadFactsContextForScope,
} from "@/lib/reports/loaders.server";
import {
  AiGroundingError,
  generateGroundedNarrative,
} from "@/lib/reports/narrative-service.server";
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

const MAX_REQUEST_BYTES = 2048;

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reportType = url.searchParams.get("reportType");
  const eventId = url.searchParams.get("eventId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const period = url.searchParams.get("period");

  const parsed = parseGenerateRequest({
    reportType,
    ...(eventId ? { eventId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(period ? { period } : {}),
  });
  if (!parsed.ok) {
    return jsonError(400, parsed.error);
  }
  if (parsed.eventId && !isUuid(parsed.eventId)) {
    return jsonError(400, "Invalid event identifier.");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Report service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  const context = await loadFactsContextForScope(supabase, parsed);
  if (context.kind !== "ok") {
    return jsonError(
      context.kind === "too-large" ? 413 : 503,
      "Report data is currently unavailable.",
    );
  }

  const narrative = await loadActiveOfficerNarrative(supabase, {
    reportType: context.reportType,
    scopeId: context.scopeId,
    periodStart: context.periodStart,
    periodEnd: context.periodEnd,
    fingerprint: context.fingerprint,
  });

  return Response.json(
    {
      enabled: isAiReportsEnabled(),
      narrative,
      fingerprint: context.fingerprint,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}

export async function POST(request: Request) {
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "AI report service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The AI report request could not be verified.");
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_REQUEST_BYTES);
  if (bodyResult.kind === "too-large") {
    return jsonError(413, "Request payload is too large.");
  }
  if (bodyResult.kind !== "ok") {
    return jsonError(400, "Invalid JSON request payload.");
  }

  const parsed = parseGenerateRequest(bodyResult.data);
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

  if (!isAiReportsEnabled()) {
    return jsonError(503, "AI report summaries are currently disabled.");
  }

  const context = await loadFactsContextForScope(supabase, parsed);
  if (context.kind === "too-large") {
    return jsonError(413, "This report exceeds the safe summary limit.");
  }
  if (context.kind !== "ok") {
    return jsonError(503, "Report data could not be loaded.");
  }

  // Return cached active draft/approved narrative if fingerprint already matches.
  const existing = await loadActiveOfficerNarrative(supabase, {
    reportType: context.reportType,
    scopeId: context.scopeId,
    periodStart: context.periodStart,
    periodEnd: context.periodEnd,
    fingerprint: context.fingerprint,
  });
  if (existing) {
    return Response.json(
      { narrative: existing, cached: true },
      { status: 200, headers: RESPONSE_HEADERS },
    );
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

  let generated: Awaited<ReturnType<typeof generateGroundedNarrative>>;
  try {
    generated = await generateGroundedNarrative(
      context.reportType,
      context.facts,
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
        "AI summary unavailable right now. You can still download the PDF.",
      );
    }
    return jsonError(503, "AI summary could not be generated.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ai_report_narratives")
    .insert({
      report_type: context.reportType,
      scope_id: context.scopeId,
      period_start: context.periodStart,
      period_end: context.periodEnd,
      facts_fingerprint: context.fingerprint,
      provider: generated.provider,
      model: generated.model,
      content: generated.content,
      status: "draft",
      created_by: officer.userId,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    // Handle concurrent request inserting the same fingerprint cleanly
    const concurrent = await loadActiveOfficerNarrative(supabase, {
      reportType: context.reportType,
      scopeId: context.scopeId,
      periodStart: context.periodStart,
      periodEnd: context.periodEnd,
      fingerprint: context.fingerprint,
    });
    if (concurrent) {
      return Response.json(
        { narrative: concurrent, cached: true },
        { status: 200, headers: RESPONSE_HEADERS },
      );
    }
    return jsonError(503, "Could not save AI report draft.");
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_generated",
    p_report_type: context.reportType,
    p_narrative_id: inserted.id,
  });

  const saved = await loadActiveOfficerNarrative(supabase, {
    reportType: context.reportType,
    scopeId: context.scopeId,
    periodStart: context.periodStart,
    periodEnd: context.periodEnd,
    fingerprint: context.fingerprint,
  });

  return Response.json(
    { narrative: saved, cached: false },
    { status: 201, headers: RESPONSE_HEADERS },
  );
}
