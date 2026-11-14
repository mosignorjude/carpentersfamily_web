import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReportLibraryItems,
  type RawReportLibraryRow,
  type ReportLibraryItem,
} from "./library-core";

export async function loadOfficerReportLibrary(
  supabase: SupabaseClient,
  activeFingerprints: Record<string, string> = {},
): Promise<ReportLibraryItem[]> {
  const { data, error } = await supabase
    .from("ai_report_narratives")
    .select(
      "id, report_type, scope_id, period_start, period_end, facts_fingerprint, provider, model, content, status, approved_by, approved_at, created_at, updated_at",
    )
    .neq("status", "discarded")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const rows = data as RawReportLibraryRow[];
  const eventIds = Array.from(
    new Set(
      rows
        .filter(
          (row) =>
            Boolean(row.scope_id) &&
            (row.report_type === "event_finance" ||
              row.report_type === "minutes"),
        )
        .map((row) => row.scope_id as string),
    ),
  );
  const approverIds = Array.from(
    new Set(
      rows
        .filter((row) => Boolean(row.approved_by))
        .map((row) => row.approved_by as string),
    ),
  );

  const [eventsRes, approversRes] = await Promise.all([
    eventIds.length > 0
      ? supabase.from("events").select("id, title").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    approverIds.length > 0
      ? supabase
          .from("member_profiles")
          .select("id, full_name")
          .in("id", approverIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const eventTitles = new Map<string, string>();
  for (const row of eventsRes.data ?? []) {
    if (row && typeof row.id === "string" && typeof row.title === "string") {
      eventTitles.set(row.id, row.title);
    }
  }

  const approverNames = new Map<string, string>();
  for (const row of approversRes.data ?? []) {
    if (row && typeof row.id === "string") {
      approverNames.set(
        row.id,
        typeof row.full_name === "string" && row.full_name.trim()
          ? row.full_name.trim()
          : "Club Officer",
      );
    }
  }

  return buildReportLibraryItems(rows, {
    activeFingerprints,
    approverNames,
    eventTitles,
  });
}
