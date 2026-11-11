import {
  DOCUMENT_SECTION_TEMPLATES,
  type DocumentDraftType,
} from "./document-drafts";
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
  custom:
    "Summarize the custom report results strictly from FACTS: highlight total count, total or average amounts (if monetary), the leading groups or categories, and any notable anomalies or zeros.",
  agm_statement:
    "Prepare a formal Annual General Meeting financial statement commentary comparing current and prior fiscal years strictly from FACTS.",
  treasurer_report:
    "Prepare a first-person Treasurer's formal report commentary covering club treasury cash flows, dues collection health, events, and practical recommendations strictly from FACTS.",
  minutes:
    "Structure the pseudonymised meeting notes and non-PII meeting metadata into formal Attendance, Agenda, Discussion, Resolutions, and Action Items sections while preserving all [Member N] and placeholder tokens verbatim.",
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

export function buildDocumentDraftJsonSchema(docType: DocumentDraftType) {
  const sectionKeys = DOCUMENT_SECTION_TEMPLATES[docType].map((s) => s.key);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description: "Formal document title (10-140 characters), plain text.",
      },
      summary: {
        type: "string",
        description:
          "1-2 sentence formal executive opening summary (20-500 characters).",
      },
      sections: {
        type: "array",
        minItems: sectionKeys.length,
        maxItems: sectionKeys.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: {
              type: "string",
              enum: sectionKeys,
            },
            heading: {
              type: "string",
            },
            body: {
              type: "string",
              description:
                "Plain text section body (paragraphs or plain '-' bullets). No HTML or markdown bold/headers.",
            },
          },
          required: ["key", "heading", "body"],
        },
      },
      recommendations: {
        type: "array",
        minItems: 0,
        maxItems: 5,
        items: { type: "string" },
        description:
          "0 to 5 concise, plain-text recommendations or governance follow-ups.",
      },
    },
    required: ["title", "summary", "sections", "recommendations"],
  } as const;
}

export function buildFormalDraftPrompt(
  docType: "agm_statement" | "treasurer_report",
  strictRetry = false,
): { system: string; schema: Record<string, unknown> } {
  const templates = DOCUMENT_SECTION_TEMPLATES[docType];
  const sectionSpec = templates
    .map((s, i) => `${i + 1}. key="${s.key}" (${s.heading}): ${s.guidance}`)
    .join("\n");

  const lines = [
    "You are the formal financial drafting assistant for Carpenters Family Social Club (Asaba, Delta State, Nigeria).",
    "Return ONLY valid JSON matching the schema with keys: title, summary, sections, recommendations.",
    `Voice & Purpose: ${REPORT_INSTRUCTIONS[docType]}`,
    docType === "treasurer_report"
      ? "Write in clear, dignified first-person Treasurer voice (using 'I' or 'As Treasurer, I report...')."
      : "Write in formal Annual General Meeting audit/financial reporting prose.",
    "Include EVERY required section in exact order:",
    sectionSpec,
    "STRICT GROUNDING RULES:",
    "1. Every number, NGN amount, count, or percentage MUST come directly from the provided FACTS JSON (or exact sums, differences, or percentages rounded to at most 1 decimal place derived from FACTS).",
    "2. Format currency with NGN and full digits (example: NGN 1,450,000). Never use shorthand like 1.45M or 320k.",
    "3. Output plain text only inside JSON strings. No markdown (**bold**, # headings), no HTML tags, no URLs, no email addresses, no @handles, and no phone numbers.",
    "4. Do not invent names, causes, or external benchmarks not present in FACTS.",
  ];

  if (strictRetry) {
    lines.push(
      "CRITICAL RETRY NOTE: Your previous draft contained unverified numbers, missing sections, or disallowed tokens. Double-check every key and only cite exact numbers visible in FACTS.",
    );
  }

  return {
    system: lines.join("\n"),
    schema: buildDocumentDraftJsonSchema(docType) as unknown as Record<
      string,
      unknown
    >,
  };
}

export function buildMinutesDraftPrompt(): {
  system: string;
  schema: Record<string, unknown>;
} {
  const templates = DOCUMENT_SECTION_TEMPLATES.minutes;
  const sectionSpec = templates
    .map((s, i) => `${i + 1}. key="${s.key}" (${s.heading}): ${s.guidance}`)
    .join("\n");

  const lines = [
    "You are the Secretariat minutes assistant for Carpenters Family Social Club (Asaba, Delta State, Nigeria).",
    "Your task is to organize the provided PSEUDONYMISED NOTES and MEETING METADATA into clean, formal structured minutes.",
    "Return ONLY valid JSON matching the schema with keys: title, summary, sections, recommendations.",
    "Include EVERY required section in exact order:",
    sectionSpec,
    "PRIVACY & FIDELITY RULES:",
    "1. Preserve every placeholder token such as [Member 7], [Name 1], [Email 1], [Phone 1], [Handle 1], or [Guest 1] EXACTLY character-for-character wherever that person or contact appears.",
    "2. NEVER invent new [Member N] numbers, member names, dates, decisions, or monetary figures not present in the notes or MEETING METADATA.",
    "3. If a section (such as Resolutions or Action Items) has nothing mentioned in the notes, write 'None recorded in the meeting notes.' rather than inventing items.",
    "4. Output plain text only (clear sentences and '- ' bullet lines if helpful). No HTML tags or markdown headings.",
  ];

  return {
    system: lines.join("\n"),
    schema: buildDocumentDraftJsonSchema("minutes") as unknown as Record<
      string,
      unknown
    >,
  };
}
