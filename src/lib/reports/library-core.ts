export type ReportsStudioMode = "brief" | "drafts" | "custom" | "library";

export interface RawReportLibraryRow {
  id: string;
  report_type: string;
  scope_id: string | null;
  period_start: string;
  period_end: string;
  facts_fingerprint: string;
  provider: string;
  model: string;
  content: unknown;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportLibraryItem {
  id: string;
  reportType: string;
  scopeId: string | null;
  scopeTitle: string | null;
  periodStart: string;
  periodEnd: string;
  factsFingerprint: string;
  provider: string;
  model: string;
  status: "draft" | "approved";
  headline: string;
  summaryExcerpt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isStale: boolean;
  pdfHref: string | null;
}

export function reportLibraryScopeKey(
  reportType: string,
  scopeId: string | null,
  periodStart: string,
  periodEnd: string,
): string | null {
  if (reportType === "club_finance") return "club_finance";
  if (reportType === "dues") return `dues:${periodStart.slice(0, 4)}`;
  if (reportType === "event_finance") return `event_finance:${scopeId ?? ""}`;
  if (reportType === "club_overview") {
    return `club_overview:${periodStart}:${periodEnd}`;
  }
  if (reportType === "agm_statement") {
    return `agm_statement:${periodStart.slice(0, 4)}`;
  }
  if (reportType === "treasurer_report") {
    return `treasurer_report:${periodStart.slice(0, 7)}`;
  }
  return null;
}

function asContentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickFirstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

function defaultHeadlineForType(
  reportType: string,
  scopeTitle: string | null,
  periodStart: string,
): string {
  switch (reportType) {
    case "club_overview":
      return `Executive Overview (${periodStart.slice(0, 7)})`;
    case "club_finance":
      return "Club Finance Narrative";
    case "dues":
      return `Member Dues Summary (${periodStart.slice(0, 4)})`;
    case "event_finance":
      return scopeTitle ? `${scopeTitle} — Event Finance` : "Event Finance Report";
    case "agm_statement":
      return `AGM Financial Statement (${periodStart.slice(0, 4)})`;
    case "treasurer_report":
      return `Treasurer's Report (${periodStart.slice(0, 7)})`;
    case "minutes":
      return scopeTitle ? `${scopeTitle} — Meeting Minutes` : "Meeting Minutes";
    case "custom":
      return "Custom Query Report";
    default:
      return reportType.replace(/_/g, " ");
  }
}

function buildLibraryPdfHref(
  reportType: string,
  scopeId: string | null,
  periodStart: string,
  periodEnd: string,
): string | null {
  if (reportType === "club_overview") {
    const isWholeYear =
      periodStart.endsWith("-01-01") && periodEnd.endsWith("-12-31");
    const periodParam = isWholeYear
      ? `year:${periodStart.slice(0, 4)}`
      : periodStart.slice(0, 7);
    return `/api/reports/overview?period=${encodeURIComponent(periodParam)}&format=pdf&includeAi=true`;
  }
  if (reportType === "agm_statement") {
    return `/api/reports/drafts?reportType=agm_statement&year=${encodeURIComponent(periodStart.slice(0, 4))}`;
  }
  if (reportType === "treasurer_report") {
    return `/api/reports/drafts?reportType=treasurer_report&period=${encodeURIComponent(periodStart.slice(0, 7))}`;
  }
  if (reportType === "minutes" && scopeId) {
    return `/api/reports/drafts?reportType=minutes&eventId=${encodeURIComponent(scopeId)}`;
  }
  return null;
}

export function buildReportLibraryItems(
  rows: RawReportLibraryRow[],
  options: {
    activeFingerprints?: Record<string, string>;
    approverNames?: Map<string, string>;
    eventTitles?: Map<string, string>;
  } = {},
): ReportLibraryItem[] {
  const activeFingerprints = options.activeFingerprints ?? {};
  const approverNames = options.approverNames ?? new Map<string, string>();
  const eventTitles = options.eventTitles ?? new Map<string, string>();

  return rows
    .filter(
      (row) => row.status === "draft" || row.status === "approved",
    )
    .map((row) => {
      const content = asContentRecord(row.content);
      const scopeTitle = row.scope_id
        ? (eventTitles.get(row.scope_id) ?? null)
        : null;
      const headline =
        pickFirstString(content, ["headline", "title"]) ??
        defaultHeadlineForType(row.report_type, scopeTitle, row.period_start);
      const summaryExcerpt =
        pickFirstString(content, [
          "summary",
          "executiveSummary",
          "narrative",
        ]) ??
        (Array.isArray(content.highlights) &&
        typeof content.highlights[0] === "string"
          ? content.highlights[0]
          : "");

      const scopeKey = reportLibraryScopeKey(
        row.report_type,
        row.scope_id,
        row.period_start,
        row.period_end,
      );
      const liveFingerprint = scopeKey ? activeFingerprints[scopeKey] : undefined;
      const isStale = Boolean(
        liveFingerprint && liveFingerprint !== row.facts_fingerprint,
      );

      return {
        id: row.id,
        reportType: row.report_type,
        scopeId: row.scope_id,
        scopeTitle,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        factsFingerprint: row.facts_fingerprint,
        provider: row.provider,
        model: row.model,
        status: row.status === "approved" ? "approved" : "draft",
        headline,
        summaryExcerpt,
        approvedByName: row.approved_by
          ? (approverNames.get(row.approved_by) ?? "Club Officer")
          : null,
        approvedAt: row.approved_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isStale,
        pdfHref: buildLibraryPdfHref(
          row.report_type,
          row.scope_id,
          row.period_start,
          row.period_end,
        ),
      } satisfies ReportLibraryItem;
    })
    .sort((a, b) => {
      const diff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      if (Number.isFinite(diff) && diff !== 0) return diff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}
