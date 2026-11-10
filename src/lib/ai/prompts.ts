import type { AiReportType } from "./facts";

export const NARRATIVE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description:
        "One plain-text summary sentence (15-200 characters) capturing the main financial or operational takeaway.",
    },
    highlights: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
      description:
        "1 to 5 factual plain-text bullets citing exact figures from FACTS.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 4,
      description:
        "0 to 4 factual plain-text watchpoints, deficits, or arrears from FACTS.",
    },
    recommendations: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 3,
      description:
        "0 to 3 concise, grounded operational next steps for club officers.",
    },
  },
  required: ["headline", "highlights", "risks", "recommendations"],
} as const;

const REPORT_INSTRUCTIONS: Record<AiReportType, string> = {
  club_finance:
    "Focus on current club balance, dues income vs other income, operating expense concentration across categories, event cash inflows/outflows, and voided entries if any.",
  dues: "Focus on overall dues collection rate, paid vs owed amounts through the report date, and the distribution of overdue members across 1 month, 2 months, and 3+ months buckets. Never speculate on individual identities.",
  event_finance:
    "Focus on net event result, verified revenue vs actual and committed expenses, ticket tier performance, and any pending ticket orders awaiting officer confirmation.",
  club_overview:
    "Focus on the club's period-wide summary across club treasury cashflows, dues collection health, event financial results, and meeting attendance.",
};

export function buildNarrativePrompt(
  reportType: AiReportType,
  strictRetry = false,
): { system: string; schema: Record<string, unknown> } {
  const lines = [
    "You are the financial reporting assistant for Carpenters Family Social Club (Asaba, Delta State, Nigeria).",
    "Return ONLY valid JSON matching the schema with keys: headline, highlights, risks, recommendations.",
    "STRICT GROUNDING RULES:",
    "1. Every number, NGN amount, count, or percentage MUST come directly from the provided FACTS JSON (or exact sums, differences, or percentages rounded to at most 1 decimal place derived from FACTS).",
    "2. Format currency with NGN and full digits (example: NGN 1,450,000). Never use shorthand like 1.45M or 320k.",
    "3. Output plain text only inside JSON strings. No markdown formatting, no HTML tags, no URLs, no email addresses, no @handles, and no phone numbers.",
    "4. Do not invent names, causes, or external benchmarks not present in FACTS.",
    `REPORT FOCUS: ${REPORT_INSTRUCTIONS[reportType]}`,
  ];

  if (strictRetry) {
    lines.push(
      "CRITICAL RETRY NOTE: Your previous draft contained unverified numbers or disallowed tokens. Only quote exact numbers visible in FACTS.",
    );
  }

  return {
    system: lines.join("\n"),
    schema: NARRATIVE_JSON_SCHEMA as unknown as Record<string, unknown>,
  };
}
