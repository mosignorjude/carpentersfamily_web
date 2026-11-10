import type { AiReportType } from "./facts";
import type { AiNarrativeContent } from "./grounding";

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
    reportType !== "club_overview"
  ) {
    return { ok: false, error: "Unsupported report type." };
  }

  let eventId: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let period: string | null = null;

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
  }

  return { ok: true, reportType, eventId, from, to, period };
}

export function parsePatchNarrativeBody(
  raw: unknown,
): { ok: true; content: AiNarrativeContent } | { ok: false; error: string } {
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
  };
}
