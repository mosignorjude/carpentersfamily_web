import type { AiReportType } from "./facts";
import type { AiNarrativeContent } from "./grounding";
import { parseAndNormalizeReportSpec, type ReportSpec } from "./report-spec";
import { readBoundedJsonBody } from "./request-guard";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_REGEX = /^(?:month:\d{4}-\d{2}|year:\d{4})$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function isCalendarDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01"
  );
}

export type ParsedGenerateRequest =
  | {
      ok: true;
      reportType: AiReportType;
      eventId: string | null;
      from: string | null;
      to: string | null;
      period: string | null;
      customSpec: ReportSpec | null;
    }
  | { ok: false; error: string };

export function parseGenerateRequest(raw: unknown): ParsedGenerateRequest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Invalid request payload." };
  }
  const obj = raw as Record<string, unknown>;
  const reportType = obj.reportType;

  if (
    reportType !== "club_finance" &&
    reportType !== "dues" &&
    reportType !== "event_finance" &&
    reportType !== "club_overview" &&
    reportType !== "custom"
  ) {
    return { ok: false, error: "Unsupported report type." };
  }

  let eventId: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let period: string | null = null;
  let customSpec: ReportSpec | null = null;

  if (reportType === "event_finance") {
    if (!isUuid(obj.eventId)) {
      return { ok: false, error: "Valid eventId is required." };
    }
    eventId = obj.eventId;

    if (obj.from !== undefined && obj.from !== null && obj.from !== "") {
      if (!isCalendarDateString(obj.from)) {
        return { ok: false, error: "Invalid start date." };
      }
      from = obj.from;
    }
    if (obj.to !== undefined && obj.to !== null && obj.to !== "") {
      if (!isCalendarDateString(obj.to)) {
        return { ok: false, error: "Invalid end date." };
      }
      to = obj.to;
    }
    if (from && to && from > to) {
      return { ok: false, error: "Start date must precede end date." };
    }
  } else if (reportType === "club_overview") {
    if (obj.period !== undefined && obj.period !== null && obj.period !== "") {
      if (typeof obj.period !== "string" || !PERIOD_REGEX.test(obj.period)) {
        return { ok: false, error: "Invalid overview period." };
      }
      if (obj.period.startsWith("month:")) {
        const monthNum = Number(obj.period.slice(11));
        if (monthNum < 1 || monthNum > 12) {
          return { ok: false, error: "Invalid overview month." };
        }
      }
      period = obj.period;
    }
  } else if (reportType === "custom") {
    const specRes = parseAndNormalizeReportSpec(obj.customSpec);
    if (!specRes.ok) {
      return { ok: false, error: specRes.error };
    }
    customSpec = specRes.spec;
    eventId = specRes.spec.eventId ?? null;
    from = specRes.spec.period.from;
    to = specRes.spec.period.to;
  }

  return { ok: true, reportType, eventId, from, to, period, customSpec };
}

export function parsePatchNarrativeBody(raw: unknown):
  | {
      ok: true;
      content: AiNarrativeContent;
      customSpec: ReportSpec | null;
    }
  | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Invalid narrative payload." };
  }
  const obj = raw as Record<string, unknown>;
  const content = obj.content;
  if (
    typeof content !== "object" ||
    content === null ||
    Array.isArray(content)
  ) {
    return { ok: false, error: "Narrative content must be an object." };
  }
  const c = content as Record<string, unknown>;
  if (
    typeof c.headline !== "string" ||
    !Array.isArray(c.highlights) ||
    !Array.isArray(c.risks) ||
    !Array.isArray(c.recommendations)
  ) {
    return {
      ok: false,
      error:
        "Narrative content requires headline, highlights, risks, and recommendations.",
    };
  }
  let customSpec: ReportSpec | null = null;
  if (obj.customSpec !== undefined && obj.customSpec !== null) {
    const parsedSpec = parseAndNormalizeReportSpec(obj.customSpec);
    if (!parsedSpec.ok) {
      return { ok: false, error: parsedSpec.error };
    }
    customSpec = parsedSpec.spec;
  }
  return {
    ok: true,
    content: {
      headline: c.headline.trim(),
      highlights: c.highlights.filter(
        (x): x is string => typeof x === "string",
      ),
      risks: c.risks.filter((x): x is string => typeof x === "string"),
      recommendations: c.recommendations.filter(
        (x): x is string => typeof x === "string",
      ),
    },
    customSpec,
  };
}

export function parseCustomSpecBody(
  raw: unknown,
): { ok: true; customSpec: ReportSpec } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Custom report spec body is required." };
  }
  const obj = raw as Record<string, unknown>;
  const spec = parseAndNormalizeReportSpec(obj.customSpec ?? obj.spec);
  if (!spec.ok) return spec;
  return { ok: true, customSpec: spec.spec };
}

export async function resolveCustomSpecFromRequest(
  request: Request,
  reportType: string,
): Promise<
  | { ok: true; customSpec: ReportSpec | null }
  | { ok: false; status: 400 | 413; error: string }
> {
  if (reportType !== "custom") {
    return { ok: true, customSpec: null };
  }
  const bodyRes = await readBoundedJsonBody(request, 4096);
  if (bodyRes.kind === "too-large") {
    return { ok: false, status: 413, error: "Request payload is too large." };
  }
  if (bodyRes.kind !== "ok") {
    return {
      ok: false,
      status: 400,
      error: "Custom report specification is required.",
    };
  }
  const specParsed = parseCustomSpecBody(bodyRes.data);
  if (!specParsed.ok) {
    return { ok: false, status: 400, error: specParsed.error };
  }
  return { ok: true, customSpec: specParsed.customSpec };
}
