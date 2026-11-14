import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectDraftStrings,
  type FormalDocumentDraftContent,
  normalizeFormalDocumentDraft,
  transformDraftStrings,
} from "@/lib/ai/document-drafts";
import {
  buildAgmStatementFacts,
  buildMeetingMinutesFacts,
  buildTreasurerReportFacts,
  type ClubOverviewRpcInput,
  factsFingerprint,
} from "@/lib/ai/facts";
import {
  validateFormalDraftContent,
  validateMinutesDraftContent,
} from "@/lib/ai/grounding";
import {
  buildFormalDraftPrompt,
  buildMinutesDraftPrompt,
} from "@/lib/ai/prompts";
import {
  generateNarrativeJson,
  TOTAL_AI_BUDGET_MS,
} from "@/lib/ai/provider.server";
import { createRequestPseudonymSession } from "@/lib/ai/pseudonymise.server";
import { getWATDate } from "@/lib/report-export";
import {
  type AgmComparisonRow,
  buildAgmComparisonRows,
  parseStoredDraftContent,
} from "@/lib/reports/drafts-core";
import { AiGroundingError } from "@/lib/reports/narrative-service.server";
import {
  formatWatDate,
  type OverviewPeriod,
  parseOverviewPeriod,
} from "@/lib/reports/period";

export interface FormalDraftDto {
  id: string;
  reportType: "agm_statement" | "treasurer_report" | "minutes";
  scopeId: string | null;
  periodStart: string;
  periodEnd: string;
  factsFingerprint: string;
  provider: string;
  model: string;
  content: FormalDocumentDraftContent;
  status: "draft" | "approved" | "discarded";
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface MeetingMinutesOption {
  id: string;
  title: string;
  startsAt: string;
  durationDays: number;
  location: string | null;
  minutesEnabled: boolean;
  publishedRevision: number | null;
  publishedUpdatedAt: string | null;
  publishedContent: string | null;
  attendanceCounts: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    total: number;
  };
}

export async function loadAgmStatementSnapshot(
  supabase: SupabaseClient,
  fiscalYear: number,
) {
  const [currentRes, priorRes] = await Promise.all([
    supabase.rpc("club_overview_report_data", {
      p_start: `${fiscalYear}-01-01`,
      p_end: `${fiscalYear}-12-31`,
    }),
    supabase.rpc("club_overview_report_data", {
      p_start: `${fiscalYear - 1}-01-01`,
      p_end: `${fiscalYear - 1}-12-31`,
    }),
  ]);

  if (
    currentRes.error ||
    !currentRes.data ||
    priorRes.error ||
    !priorRes.data
  ) {
    return { kind: "unavailable" as const };
  }

  const facts = buildAgmStatementFacts({
    fiscalYear,
    currentOverview: currentRes.data as ClubOverviewRpcInput,
    priorOverview: priorRes.data as ClubOverviewRpcInput,
  });

  return {
    kind: "ok" as const,
    fiscalYear,
    periodStart: `${fiscalYear}-01-01`,
    periodEnd: `${fiscalYear}-12-31`,
    facts,
    comparisonRows: buildAgmComparisonRows(facts) satisfies AgmComparisonRow[],
    fingerprint: factsFingerprint(facts),
  };
}

export async function loadTreasurerReportSnapshot(
  supabase: SupabaseClient,
  period: OverviewPeriod,
) {
  const { data, error } = await supabase.rpc("club_overview_report_data", {
    p_start: period.periodStart,
    p_end: period.periodEnd,
  });
  if (error || !data) {
    return { kind: "unavailable" as const };
  }

  const facts = buildTreasurerReportFacts({
    overview: data as ClubOverviewRpcInput,
  });

  return {
    kind: "ok" as const,
    period,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    facts,
    fingerprint: factsFingerprint(facts),
  };
}

export async function loadMeetingMinutesContext(
  supabase: SupabaseClient,
  eventId: string,
  requireMinutesEnabled = true,
): Promise<
  | { kind: "ok"; meeting: MeetingMinutesOption; meetingDateYmd: string }
  | { kind: "not-found" | "unavailable" }
> {
  const { data: eventRow, error: eventErr } = await supabase
    .from("events")
    .select(
      "id, title, event_type, starts_at, duration_days, location, minutes_enabled, archived_at",
    )
    .eq("id", eventId)
    .eq("event_type", "meeting")
    .maybeSingle();

  if (eventErr) return { kind: "unavailable" };
  if (!eventRow || (requireMinutesEnabled && !eventRow.minutes_enabled)) {
    return { kind: "not-found" };
  }

  const [minutesRes, attendanceRes] = await Promise.all([
    supabase
      .from("event_minutes")
      .select("content, revision_number, updated_at")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("event_attendance")
      .select("attendance_status")
      .eq("event_id", eventId),
  ]);

  if (minutesRes.error || attendanceRes.error) {
    return { kind: "unavailable" };
  }

  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    total: 0,
  };
  for (const row of attendanceRes.data ?? []) {
    counts.total += 1;
    if (row.attendance_status === "present") counts.present += 1;
    else if (row.attendance_status === "late") counts.late += 1;
    else if (row.attendance_status === "absent") counts.absent += 1;
    else if (row.attendance_status === "excused") counts.excused += 1;
  }

  const startsAt = String(eventRow.starts_at);
  const meetingDateYmd = formatWatDate(new Date(startsAt));

  return {
    kind: "ok",
    meetingDateYmd,
    meeting: {
      id: String(eventRow.id),
      title: String(eventRow.title || "Club Meeting"),
      startsAt,
      durationDays: Number(eventRow.duration_days ?? 1),
      location:
        typeof eventRow.location === "string" ? eventRow.location : null,
      minutesEnabled: Boolean(eventRow.minutes_enabled),
      publishedRevision: minutesRes.data?.revision_number ?? null,
      publishedUpdatedAt: minutesRes.data?.updated_at ?? null,
      publishedContent:
        typeof minutesRes.data?.content === "string"
          ? minutesRes.data.content
          : null,
      attendanceCounts: counts,
    },
  };
}

export async function listMeetingsForDrafting(
  supabase: SupabaseClient,
): Promise<
  Array<{
    id: string;
    title: string;
    startsAt: string;
    location: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, starts_at, location, minutes_enabled, archived_at")
    .eq("event_type", "meeting")
    .eq("minutes_enabled", true)
    .order("starts_at", { ascending: false })
    .limit(40);

  if (error || !Array.isArray(data)) return [];
  return data
    .filter((row) => row.archived_at === null)
    .map((row) => ({
      id: String(row.id),
      title: String(row.title || "Club Meeting"),
      startsAt: String(row.starts_at),
      location: typeof row.location === "string" ? row.location : null,
    }));
}

export async function loadActiveDraftRecord(
  supabase: SupabaseClient,
  params: {
    reportType: "agm_statement" | "treasurer_report" | "minutes";
    scopeId: string | null;
    periodStart?: string;
    periodEnd?: string;
    fingerprint?: string;
  },
): Promise<FormalDraftDto | null> {
  let query = supabase
    .from("ai_report_narratives")
    .select(
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, provider, model, content, status, approved_by, approved_at, updated_at",
    )
    .eq("report_type", params.reportType)
    .neq("status", "discarded")
    .order("updated_at", { ascending: false })
    .limit(1);

  query = params.scopeId
    ? query.eq("scope_id", params.scopeId)
    : query.is("scope_id", null);

  if (params.periodStart) {
    query = query.eq("period_start", params.periodStart);
  }
  if (params.periodEnd) {
    query = query.eq("period_end", params.periodEnd);
  }
  if (params.fingerprint) {
    query = query.eq("facts_fingerprint", params.fingerprint);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  const parsedContent = parseStoredDraftContent(
    params.reportType,
    data.content,
  );
  if (!parsedContent) return null;

  let approvedByName: string | null = null;
  if (data.approved_by) {
    const { data: approver } = await supabase
      .from("member_profiles")
      .select("full_name")
      .eq("id", data.approved_by)
      .maybeSingle();
    approvedByName = approver?.full_name || "Club Officer";
  }

  return {
    id: data.id,
    reportType: params.reportType,
    scopeId: data.scope_id,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    factsFingerprint: data.facts_fingerprint,
    provider: data.provider,
    model: data.model,
    content: parsedContent,
    status: data.status as "draft" | "approved" | "discarded",
    approvedByName,
    approvedAt: data.approved_at
      ? formatWatDate(new Date(data.approved_at))
      : null,
    updatedAt: data.updated_at,
  };
}

export async function generateGroundedFormalDraft(
  docType: "agm_statement" | "treasurer_report",
  facts: unknown,
): Promise<{
  provider: string;
  model: string;
  content: FormalDocumentDraftContent;
}> {
  const deadlineAt = Date.now() + TOTAL_AI_BUDGET_MS;
  let lastReasons: string[] = [];

  for (const strictRetry of [false, true]) {
    if (strictRetry && deadlineAt - Date.now() < 3_500) {
      break;
    }
    const prompt = buildFormalDraftPrompt(docType, strictRetry);
    const result = await generateNarrativeJson({
      system: prompt.system,
      facts,
      schema: prompt.schema,
      maxOutputTokens: 2000,
      deadlineAt,
    });
    const validated = validateFormalDraftContent(docType, result.data, facts);
    if (validated.ok) {
      return {
        provider: result.provider,
        model: result.model,
        content: validated.content,
      };
    }
    console.warn(
      `[AI Draft Grounding] Rejected ${docType} (strictRetry=${strictRetry}):`,
      validated.reasons,
    );
    lastReasons = validated.reasons;
  }

  throw new AiGroundingError(lastReasons);
}

export async function previewMinutesPseudonymisation(
  supabase: SupabaseClient,
  rawNotes: string,
) {
  const session = await createRequestPseudonymSession(supabase, [rawNotes]);
  if (!session) return { kind: "unavailable" as const };
  const masked = session.maskText(rawNotes);
  return {
    kind: "ok" as const,
    maskedText: masked.maskedText,
    stats: masked.stats,
  };
}

export async function generatePseudonymisedMinutesDraft(
  supabase: SupabaseClient,
  params: {
    meeting: MeetingMinutesOption;
    meetingDateYmd: string;
    rawNotes: string;
    preparedMaskedNotes?: string;
  },
): Promise<{
  provider: string;
  model: string;
  content: FormalDocumentDraftContent;
  fingerprint: string;
}> {
  // In-memory request-only session (never stored or logged)
  const session = await createRequestPseudonymSession(supabase, [
    params.rawNotes,
    params.preparedMaskedNotes ?? "",
  ]);
  if (!session) {
    throw new Error(
      "Unable to load active member directory for privacy masking.",
    );
  }

  const noteInputForAi = params.preparedMaskedNotes ?? params.rawNotes;
  const maskedPass = session.maskText(noteInputForAi);
  const notesHash = createHash("sha256")
    .update(maskedPass.maskedText, "utf8")
    .digest("hex");

  const nonPiiFacts = buildMeetingMinutesFacts({
    eventId: params.meeting.id,
    eventTitle: params.meeting.title,
    startsAt: params.meetingDateYmd,
    durationDays: params.meeting.durationDays,
    location: params.meeting.location,
    attendanceCounts: params.meeting.attendanceCounts,
    notesHash,
  });

  const prompt = buildMinutesDraftPrompt();
  const result = await generateNarrativeJson({
    system: prompt.system,
    facts: {
      MEETING_METADATA: nonPiiFacts,
      PSEUDONYMISED_NOTES: maskedPass.maskedText,
    },
    schema: prompt.schema,
    maxOutputTokens: 2000,
  });

  const preUnmaskShape = normalizeFormalDocumentDraft("minutes", result.data);
  if (!preUnmaskShape.ok) {
    throw new AiGroundingError(preUnmaskShape.reasons);
  }

  // Restore [Member N], [Name N], [Email N], [Phone N], [Handle N] strictly in server memory
  const restoredDraft = transformDraftStrings(preUnmaskShape.draft, (text) =>
    session.unmaskText(text),
  );

  const safetyChecked = validateMinutesDraftContent(restoredDraft);
  if (!safetyChecked.ok) {
    throw new AiGroundingError(safetyChecked.reasons);
  }

  return {
    provider: result.provider,
    model: result.model,
    content: safetyChecked.content,
    fingerprint: factsFingerprint(nonPiiFacts),
  };
}

export function resolveApprovedTreasurerPeriod(
  periodStart: string,
  periodEnd: string,
): OverviewPeriod | null {
  if (
    periodStart.slice(0, 7) === periodEnd.slice(0, 7) &&
    periodStart.endsWith("-01")
  ) {
    const candidate = parseOverviewPeriod(`month:${periodStart.slice(0, 7)}`);
    if (
      candidate &&
      candidate.periodStart === periodStart &&
      candidate.periodEnd === periodEnd
    ) {
      return candidate;
    }
  }
  if (
    periodStart.endsWith("-01-01") &&
    periodEnd.endsWith("-12-31") &&
    periodStart.slice(0, 4) === periodEnd.slice(0, 4)
  ) {
    return parseOverviewPeriod(`year:${periodStart.slice(0, 4)}`);
  }
  return null;
}

export async function loadDraftByIdForOfficer(
  supabase: SupabaseClient,
  id: string,
) {
  const { data, error } = await supabase
    .from("ai_report_narratives")
    .select(
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, provider, model, content, status, approved_by, approved_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return { kind: "unavailable" as const };
  if (
    !data ||
    data.status === "discarded" ||
    (data.report_type !== "agm_statement" &&
      data.report_type !== "treasurer_report" &&
      data.report_type !== "minutes")
  ) {
    return { kind: "not-found" as const };
  }

  return { kind: "ok" as const, row: data };
}

export async function insertDraftRecordWithAudit(
  supabase: SupabaseClient,
  params: {
    reportType: "agm_statement" | "treasurer_report" | "minutes";
    scopeId: string | null;
    periodStart: string;
    periodEnd: string;
    fingerprint: string;
    provider: string;
    model: string;
    content: FormalDocumentDraftContent;
    officerId: string;
  },
) {
  const { data: inserted, error: insertError } = await supabase
    .from("ai_report_narratives")
    .insert({
      report_type: params.reportType,
      scope_id: params.scopeId,
      period_start: params.periodStart,
      period_end: params.periodEnd,
      facts_fingerprint: params.fingerprint,
      provider: params.provider,
      model: params.model,
      content: params.content,
      status: "draft",
      created_by: params.officerId,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return { kind: "insert-failed" as const, id: null };
  }

  await supabase.rpc("log_ai_report_event", {
    p_action: "ai_report_generated",
    p_report_type: params.reportType,
    p_narrative_id: inserted.id,
  });

  return { kind: "ok" as const, id: inserted.id as string };
}

export async function discardPriorDraftsForScope(
  supabase: SupabaseClient,
  params: {
    reportType: "agm_statement" | "treasurer_report" | "minutes";
    scopeId: string | null;
    periodStart?: string;
    periodEnd?: string;
  },
) {
  let query = supabase
    .from("ai_report_narratives")
    .select("id")
    .eq("report_type", params.reportType)
    .neq("status", "discarded");

  query = params.scopeId
    ? query.eq("scope_id", params.scopeId)
    : query.is("scope_id", null);

  if (params.periodStart) query = query.eq("period_start", params.periodStart);
  if (params.periodEnd) query = query.eq("period_end", params.periodEnd);

  const { data: priorRows } = await query;
  for (const prior of priorRows ?? []) {
    await supabase
      .from("ai_report_narratives")
      .update({
        status: "discarded",
        approved_by: null,
        approved_at: null,
      })
      .eq("id", prior.id);

    await supabase.rpc("log_ai_report_event", {
      p_action: "ai_report_discarded",
      p_report_type: params.reportType,
      p_narrative_id: prior.id,
    });
  }
}

export { collectDraftStrings, getWATDate };
