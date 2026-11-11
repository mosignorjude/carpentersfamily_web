import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/ai/api-schemas";
import { formatMinutesForEventRecord } from "@/lib/ai/document-drafts";
import { validateMinutesDraftContent } from "@/lib/ai/grounding";
import { requireOfficer } from "@/lib/ai/officer.server";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import {
  loadDraftByIdForOfficer,
  loadMeetingMinutesContext,
} from "@/lib/reports/drafts.server";
import { parsePublishMinutesBody } from "@/lib/reports/drafts-core";
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
    return jsonError(400, "Invalid minutes draft identifier.");
  }

  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "Minutes publish service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The publish request could not be verified.");
  }

  let parsedJson: unknown = null;
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== "0") {
    const bodyResult = await readBoundedJsonBody(request, 2048);
    if (bodyResult.kind === "too-large") {
      return jsonError(413, "Publish payload exceeds the size limit.");
    }
    if (bodyResult.kind === "ok") {
      parsedJson = bodyResult.data;
    } else if (
      contentLengthHeader !== null &&
      Number(contentLengthHeader) > 0
    ) {
      return jsonError(400, "Invalid JSON payload.");
    }
  }

  const parsedReason = parsePublishMinutesBody(parsedJson);
  if (!parsedReason.ok) {
    return jsonError(400, parsedReason.error);
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Minutes publish service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  const loaded = await loadDraftByIdForOfficer(supabase, id);
  if (loaded.kind === "unavailable") {
    return jsonError(503, "Could not load minutes draft.");
  }
  if (loaded.kind === "not-found" || loaded.row.report_type !== "minutes") {
    return jsonError(404, "Minutes draft was not found.");
  }

  const { row } = loaded;
  if (!row.scope_id) {
    return jsonError(400, "Minutes draft is missing its target meeting.");
  }
  if (row.status !== "approved") {
    return jsonError(
      409,
      "Approve the minutes draft before publishing it to the Meeting Hub.",
    );
  }

  const checked = validateMinutesDraftContent(row.content);
  if (!checked.ok) {
    return jsonError(
      422,
      checked.reasons[0] || "Minutes content failed validation checks.",
    );
  }
  if (checked.unresolvedTokens.length > 0) {
    return jsonError(
      422,
      `Replace unresolved placeholder tokens before publishing: ${checked.unresolvedTokens.join(", ")}`,
    );
  }

  const meetingCtx = await loadMeetingMinutesContext(
    supabase,
    row.scope_id,
    true,
  );
  if (meetingCtx.kind === "not-found") {
    return jsonError(404, "Meeting was not found or minutes are disabled.");
  }
  if (meetingCtx.kind !== "ok") {
    return jsonError(503, "Could not load meeting details.");
  }

  const formattedText = formatMinutesForEventRecord(checked.content, {
    title: meetingCtx.meeting.title,
    dateLabel: meetingCtx.meetingDateYmd,
    location: meetingCtx.meeting.location ?? undefined,
  });

  if (formattedText.length === 0 || formattedText.length > 20_000) {
    return jsonError(
      422,
      "Formatted minutes exceed the 20,000 character club record limit.",
    );
  }

  const { data: revisionNumber, error: saveError } = await supabase.rpc(
    "save_event_minutes",
    {
      p_event_id: row.scope_id,
      p_content: formattedText,
      p_reason: parsedReason.reason,
    },
  );

  if (saveError) {
    return jsonError(
      403,
      saveError.message || "Could not save minutes to Meeting Hub.",
    );
  }

  revalidatePath("/meeting-hub");
  revalidatePath("/events");
  revalidatePath(`/events/${row.scope_id}/attendance`);

  return Response.json(
    {
      revisionNumber: Number(revisionNumber ?? 1),
      eventId: row.scope_id,
      redirectUrl: `/meeting-hub?event=${encodeURIComponent(row.scope_id)}&tab=minutes`,
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}
