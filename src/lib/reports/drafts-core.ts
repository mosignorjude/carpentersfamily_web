import { isCalendarDateString, isUuid } from "@/lib/ai/api-schemas";
import {
  DOCUMENT_SECTION_TEMPLATES,
  type DocumentDraftType,
  type FormalDocumentDraftContent,
  isDocumentDraftType,
  normalizeFormalDocumentDraft,
} from "@/lib/ai/document-drafts";
import type { buildAgmStatementFacts } from "@/lib/ai/facts";
import { parseOverviewPeriod } from "@/lib/reports/period";

export interface AgmComparisonRow {
  lineItem: string;
  currentValue: number;
  priorValue: number;
  varianceValue: number;
  variancePct: number | null;
  unit: "NGN" | "PCT" | "COUNT";
}

export type AgmStatementFacts = ReturnType<typeof buildAgmStatementFacts>;

function safePctChange(currentVal: number, priorVal: number): number | null {
  if (priorVal <= 0) return null;
  return Math.round(((currentVal - priorVal) / priorVal) * 1000) / 10;
}

export function buildAgmComparisonRows(
  facts: AgmStatementFacts,
): AgmComparisonRow[] {
  const { current, prior } = facts;
  const rows: Array<{
    lineItem: string;
    currentValue: number;
    priorValue: number;
    unit: "NGN" | "PCT" | "COUNT";
    variancePct: number | null;
  }> = [
    {
      lineItem: "Member Dues Collected",
      currentValue: current.dues_collected_ngn,
      priorValue: prior.dues_collected_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.dues_collected_ngn,
        prior.dues_collected_ngn,
      ),
    },
    {
      lineItem: "Other Club Income",
      currentValue: current.other_income_ngn,
      priorValue: prior.other_income_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.other_income_ngn,
        prior.other_income_ngn,
      ),
    },
    {
      lineItem: "Event Cash Inflows",
      currentValue: current.event_cash_in_ngn,
      priorValue: prior.event_cash_in_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.event_cash_in_ngn,
        prior.event_cash_in_ngn,
      ),
    },
    {
      lineItem: "Total Combined Inflows",
      currentValue: current.total_inflows_ngn,
      priorValue: prior.total_inflows_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.total_inflows_ngn,
        prior.total_inflows_ngn,
      ),
    },
    {
      lineItem: "Club Operating Expenses",
      currentValue: current.operating_expenses_ngn,
      priorValue: prior.operating_expenses_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.operating_expenses_ngn,
        prior.operating_expenses_ngn,
      ),
    },
    {
      lineItem: "Event Cash Outflows",
      currentValue: current.event_cash_out_ngn,
      priorValue: prior.event_cash_out_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.event_cash_out_ngn,
        prior.event_cash_out_ngn,
      ),
    },
    {
      lineItem: "Total Combined Outflows",
      currentValue: current.total_outflows_ngn,
      priorValue: prior.total_outflows_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.total_outflows_ngn,
        prior.total_outflows_ngn,
      ),
    },
    {
      lineItem: "Net Surplus / (Deficit)",
      currentValue: current.net_surplus_ngn,
      priorValue: prior.net_surplus_ngn,
      unit: "NGN",
      variancePct: safePctChange(
        current.net_surplus_ngn,
        prior.net_surplus_ngn,
      ),
    },
    {
      lineItem: "Dues Collection Rate",
      currentValue: current.dues_collection_rate_pct,
      priorValue: prior.dues_collection_rate_pct,
      unit: "PCT",
      variancePct: null,
    },
    {
      lineItem: "Attendance Check-ins",
      currentValue: current.attendance_checkins,
      priorValue: prior.attendance_checkins,
      unit: "COUNT",
      variancePct: safePctChange(
        current.attendance_checkins,
        prior.attendance_checkins,
      ),
    },
  ];

  return rows.map((row) => ({
    ...row,
    varianceValue:
      row.unit === "PCT"
        ? Math.round((row.currentValue - row.priorValue) * 10) / 10
        : row.currentValue - row.priorValue,
  }));
}

export type ParsedDraftQuery =
  | {
      ok: true;
      reportType: "agm_statement";
      fiscalYear: number;
      scopeId: null;
      periodStart: string;
      periodEnd: string;
    }
  | {
      ok: true;
      reportType: "treasurer_report";
      periodParam: string;
      periodLabel: string;
      scopeId: null;
      periodStart: string;
      periodEnd: string;
    }
  | {
      ok: true;
      reportType: "minutes";
      eventId: string;
      scopeId: string;
    }
  | { ok: false; error: string };

export function parseDraftScopeQuery(input: {
  reportType?: unknown;
  year?: unknown;
  period?: unknown;
  eventId?: unknown;
  defaultYear?: number;
  defaultPeriodParam?: string;
}): ParsedDraftQuery {
  if (!isDocumentDraftType(input.reportType)) {
    return {
      ok: false,
      error: "Choose AGM statement, Treasurer report, or Meeting minutes.",
    };
  }

  if (input.reportType === "agm_statement") {
    const rawYear = input.year;
    const year =
      rawYear === undefined || rawYear === null || rawYear === ""
        ? (input.defaultYear ?? new Date().getUTCFullYear())
        : Number(rawYear);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      return {
        ok: false,
        error: "Choose a valid financial year between 2020 and 2100.",
      };
    }
    return {
      ok: true,
      reportType: "agm_statement",
      fiscalYear: year,
      scopeId: null,
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
    };
  }

  if (input.reportType === "treasurer_report") {
    const rawPeriod =
      typeof input.period === "string" && input.period.trim().length > 0
        ? input.period
        : input.defaultPeriodParam;
    const parsed = parseOverviewPeriod(rawPeriod);
    if (!parsed) {
      return {
        ok: false,
        error:
          "Choose a valid month or year period for the Treasurer's report.",
      };
    }
    return {
      ok: true,
      reportType: "treasurer_report",
      periodParam: parsed.periodParam,
      periodLabel: parsed.periodLabel,
      scopeId: null,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
    };
  }

  if (!isUuid(input.eventId)) {
    return { ok: false, error: "Choose a valid meeting to draft minutes." };
  }
  return {
    ok: true,
    reportType: "minutes",
    eventId: input.eventId,
    scopeId: input.eventId,
  };
}

export type ParsedDraftPostBody =
  | {
      ok: true;
      action: "preview_minutes";
      eventId: string;
      rawNotes: string;
    }
  | {
      ok: true;
      action: "generate";
      scope: ParsedDraftQuery & { ok: true };
      rawNotes?: string;
      preparedMaskedNotes?: string;
    }
  | { ok: false; error: string };

export const MAX_MINUTES_NOTES_LENGTH = 15_000;

export function parseDraftPostBody(
  raw: unknown,
  defaults: { defaultYear: number; defaultPeriodParam: string },
): ParsedDraftPostBody {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Invalid request payload." };
  }
  const obj = raw as Record<string, unknown>;
  const action =
    obj.action === "preview_minutes" ? "preview_minutes" : "generate";

  if (action === "preview_minutes") {
    if (!isUuid(obj.eventId)) {
      return { ok: false, error: "Valid meeting ID is required." };
    }
    if (typeof obj.rawNotes !== "string") {
      return { ok: false, error: "Enter meeting notes to preview masking." };
    }
    const trimmed = obj.rawNotes.trim();
    if (trimmed.length < 10) {
      return {
        ok: false,
        error:
          "Enter at least 10 characters of meeting notes before previewing.",
      };
    }
    if (trimmed.length > MAX_MINUTES_NOTES_LENGTH) {
      return {
        ok: false,
        error: `Meeting notes cannot exceed ${MAX_MINUTES_NOTES_LENGTH.toLocaleString("en-US")} characters.`,
      };
    }
    return {
      ok: true,
      action: "preview_minutes",
      eventId: obj.eventId,
      rawNotes: trimmed,
    };
  }

  const scope = parseDraftScopeQuery({
    reportType: obj.reportType,
    year: obj.year,
    period: obj.period,
    eventId: obj.eventId,
    defaultYear: defaults.defaultYear,
    defaultPeriodParam: defaults.defaultPeriodParam,
  });
  if (!scope.ok) return scope;

  if (scope.reportType === "minutes") {
    if (typeof obj.rawNotes !== "string") {
      return {
        ok: false,
        error: "Meeting notes are required to draft minutes.",
      };
    }
    const trimmedNotes = obj.rawNotes.trim();
    if (trimmedNotes.length < 10) {
      return {
        ok: false,
        error:
          "Enter at least 10 characters of meeting notes to generate minutes.",
      };
    }
    if (trimmedNotes.length > MAX_MINUTES_NOTES_LENGTH) {
      return {
        ok: false,
        error: `Meeting notes cannot exceed ${MAX_MINUTES_NOTES_LENGTH.toLocaleString("en-US")} characters.`,
      };
    }
    let preparedMaskedNotes: string | undefined;
    if (
      typeof obj.preparedMaskedNotes === "string" &&
      obj.preparedMaskedNotes.trim().length > 0
    ) {
      const cleaned = obj.preparedMaskedNotes.trim();
      if (cleaned.length > MAX_MINUTES_NOTES_LENGTH) {
        return {
          ok: false,
          error: "Masked preview text exceeds the maximum length.",
        };
      }
      preparedMaskedNotes = cleaned;
    }
    return {
      ok: true,
      action: "generate",
      scope,
      rawNotes: trimmedNotes,
      preparedMaskedNotes,
    };
  }

  return {
    ok: true,
    action: "generate",
    scope,
  };
}

export function parseDraftPatchBody(
  docType: DocumentDraftType,
  raw: unknown,
):
  | { ok: true; draft: FormalDocumentDraftContent }
  | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Invalid draft payload." };
  }
  const obj = raw as Record<string, unknown>;
  const candidate = obj.content ?? obj;
  const parsed = normalizeFormalDocumentDraft(docType, candidate);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reasons[0] || "Invalid draft sections." };
  }
  return { ok: true, draft: parsed.draft };
}

export function parsePublishMinutesBody(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, reason: "Published from AI Minutes Assistant." };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid publish payload." };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.reason === undefined || obj.reason === null || obj.reason === "") {
    return { ok: true, reason: "Published from AI Minutes Assistant." };
  }
  if (typeof obj.reason !== "string") {
    return { ok: false, error: "Revision reason must be plain text." };
  }
  const trimmed = obj.reason.trim();
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return {
        ok: false,
        error: "Revision reason contains invalid control characters.",
      };
    }
  }
  if (trimmed.length === 0) {
    return { ok: true, reason: "Published from AI Minutes Assistant." };
  }
  if (trimmed.length > 500) {
    return {
      ok: false,
      error: "Revision reason cannot exceed 500 characters.",
    };
  }
  return { ok: true, reason: trimmed };
}

export function parseStoredDraftContent(
  docType: DocumentDraftType,
  raw: unknown,
): FormalDocumentDraftContent | null {
  const res = normalizeFormalDocumentDraft(docType, raw);
  if (!res.ok) return null;
  if (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    Array.isArray((raw as Record<string, unknown>).unresolvedTokens)
  ) {
    const tokens = (raw as Record<string, unknown>).unresolvedTokens;
    if (
      Array.isArray(tokens) &&
      tokens.every((t) => typeof t === "string") &&
      tokens.length > 0
    ) {
      return {
        ...res.draft,
        unresolvedTokens: tokens as string[],
      };
    }
  }
  return res.draft;
}

export function defaultDraftTitle(
  docType: DocumentDraftType,
  label: string,
): string {
  if (docType === "agm_statement") {
    return `AGM Financial Statement — FY ${label}`;
  }
  if (docType === "treasurer_report") {
    return `Treasurer's Report — ${label}`;
  }
  return `Official Minutes — ${label}`;
}

export function isIsoDateLiteral(val: unknown): val is string {
  return isCalendarDateString(val);
}

export { DOCUMENT_SECTION_TEMPLATES };
