import { findUnresolvedTokens } from "./pseudonymise";

export const DOCUMENT_DRAFT_TYPES = [
  "agm_statement",
  "treasurer_report",
  "minutes",
] as const;

export type DocumentDraftType = (typeof DOCUMENT_DRAFT_TYPES)[number];

export interface DocumentSectionTemplate {
  key: string;
  heading: string;
  guidance: string;
}

export const DOCUMENT_SECTION_TEMPLATES: Record<
  DocumentDraftType,
  readonly DocumentSectionTemplate[]
> = {
  agm_statement: [
    {
      key: "executive_overview",
      heading: "Executive Overview",
      guidance:
        "Concise summary of the club's financial position and key year-on-year movements.",
    },
    {
      key: "income_analysis",
      heading: "Income & Revenue Performance (Year-on-Year)",
      guidance:
        "Commentary on dues collection, other club income, event cash inflows, and ticket sales compared to the prior year.",
    },
    {
      key: "expenditure_analysis",
      heading: "Expenditure & Event Operations",
      guidance:
        "Commentary on operating expenditure categories, event cash outflows, and net event results vs the prior year.",
    },
    {
      key: "surplus_and_position",
      heading: "Surplus / (Deficit), Reserve & Governance Outlook",
      guidance:
        "Summary of net surplus or deficit, closing club reserve balance, dues collection rate, and arrears watchpoints.",
    },
  ],
  treasurer_report: [
    {
      key: "opening_remarks",
      heading: "Treasurer's Opening Remarks",
      guidance:
        "First-person opening presentation by the Treasurer covering the selected period and current treasury balance.",
    },
    {
      key: "dues_and_treasury",
      heading: "Club Treasury & Dues Collection Review",
      guidance:
        "First-person review of member dues collected, collection rate, outstanding dues, and 3+ months arrears watchpoints.",
    },
    {
      key: "events_and_spending",
      heading: "Operating Expenditure & Event Performance",
      guidance:
        "First-person review of club expenses across categories, event inflows/outflows, and ticket revenue.",
    },
    {
      key: "forward_outlook",
      heading: "Stewardship Outlook & Priorities",
      guidance:
        "Treasurer's closing stewardship notes grounded strictly in the period facts.",
    },
  ],
  minutes: [
    {
      key: "attendance",
      heading: "Attendance",
      guidance:
        "Presiding and attending members, attendance headcount/status from metadata, and apologies/guests if noted.",
    },
    {
      key: "agenda",
      heading: "Agenda",
      guidance:
        "Numbered or plain-text items tabled for the meeting based strictly on the provided notes.",
    },
    {
      key: "discussion",
      heading: "Discussion",
      guidance:
        "Key points raised and deliberations recorded in the notes, preserving all [Member N] and placeholder tokens exactly.",
    },
    {
      key: "resolutions",
      heading: "Resolutions",
      guidance:
        "Formal decisions, motions adopted, or outcomes noted (write 'None recorded in notes.' if none appeared).",
    },
    {
      key: "action_items",
      heading: "Action Items",
      guidance:
        "Follow-up tasks, owners, and due dates mentioned in the notes, preserving [Member N] tokens verbatim.",
    },
  ],
};

export interface DocumentDraftSection {
  key: string;
  heading: string;
  body: string;
}

export interface FormalDocumentDraftContent {
  title: string;
  summary: string;
  sections: DocumentDraftSection[];
  recommendations: string[];
  unresolvedTokens?: string[];
}

export function isDocumentDraftType(
  value: unknown,
): value is DocumentDraftType {
  return (
    value === "agm_statement" ||
    value === "treasurer_report" ||
    value === "minutes"
  );
}

export function collectDraftStrings(
  draft: FormalDocumentDraftContent,
): string[] {
  return [
    draft.title,
    draft.summary,
    ...draft.sections.map((s) => s.heading),
    ...draft.sections.map((s) => s.body),
    ...draft.recommendations,
  ];
}

export function transformDraftStrings(
  draft: FormalDocumentDraftContent,
  fn: (text: string) => string,
): FormalDocumentDraftContent {
  const transformed: FormalDocumentDraftContent = {
    title: fn(draft.title),
    summary: fn(draft.summary),
    sections: draft.sections.map((section) => ({
      key: section.key,
      heading: section.heading,
      body: fn(section.body),
    })),
    recommendations: draft.recommendations.map((item) => fn(item)),
  };
  const unresolved = findDraftUnresolvedTokens(transformed);
  if (unresolved.length > 0) {
    transformed.unresolvedTokens = unresolved;
  }
  return transformed;
}

export function findDraftUnresolvedTokens(
  draft: FormalDocumentDraftContent,
): string[] {
  const set = new Set<string>();
  for (const str of collectDraftStrings(draft)) {
    for (const token of findUnresolvedTokens(str)) {
      set.add(token);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function normalizeFormalDocumentDraft(
  docType: DocumentDraftType,
  raw: unknown,
):
  | { ok: true; draft: FormalDocumentDraftContent }
  | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reasons: ["Draft content must be a JSON object."] };
  }

  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (title.length < 5 || title.length > 160) {
    reasons.push("Document title must be between 5 and 160 characters.");
  }

  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";
  if (summary.length < 10 || summary.length > 800) {
    reasons.push("Executive summary must be between 10 and 800 characters.");
  }

  const templates = DOCUMENT_SECTION_TEMPLATES[docType];
  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const sectionByKey = new Map<string, string>();

  for (const item of rawSections) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.key === "string" && typeof rec.body === "string") {
      sectionByKey.set(rec.key.trim(), rec.body.trim());
    }
  }

  const sections: DocumentDraftSection[] = [];
  for (const tmpl of templates) {
    const body = sectionByKey.get(tmpl.key) ?? "";
    if (body.length < 5 || body.length > 3500) {
      reasons.push(
        `Section "${tmpl.heading}" must be between 5 and 3,500 characters.`,
      );
    }
    sections.push({
      key: tmpl.key,
      heading: tmpl.heading,
      body,
    });
  }

  const recommendations: string[] = [];
  if (obj.recommendations !== undefined) {
    if (!Array.isArray(obj.recommendations)) {
      reasons.push("recommendations must be an array of strings.");
    } else {
      if (obj.recommendations.length > 5) {
        reasons.push("recommendations may contain at most 5 items.");
      }
      for (const rec of obj.recommendations) {
        if (typeof rec !== "string") {
          reasons.push("Recommendation items must be plain strings.");
          continue;
        }
        const trimmed = rec.trim();
        if (trimmed.length < 5 || trimmed.length > 360) {
          reasons.push("Recommendation items must be 5..360 characters.");
          continue;
        }
        recommendations.push(trimmed);
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const draft: FormalDocumentDraftContent = {
    title,
    summary,
    sections,
    recommendations,
  };
  if (docType === "minutes") {
    const unresolved = findDraftUnresolvedTokens(draft);
    if (unresolved.length > 0) {
      draft.unresolvedTokens = unresolved;
    }
  }
  return { ok: true, draft };
}

export function formatMinutesForEventRecord(
  draft: FormalDocumentDraftContent,
  meta?: { title?: string; dateLabel?: string; location?: string },
): string {
  const lines: string[] = [];
  const headerTitle =
    draft.title.trim() || meta?.title?.trim() || "Meeting Minutes";
  lines.push(headerTitle);
  if (meta?.dateLabel || meta?.location) {
    const parts = [meta.dateLabel, meta.location].filter(Boolean);
    if (parts.length > 0) {
      lines.push(parts.join(" · "));
    }
  }
  lines.push("");
  lines.push(`Summary: ${draft.summary.trim()}`);

  draft.sections.forEach((section, index) => {
    lines.push("");
    lines.push(`${index + 1}. ${section.heading}`);
    lines.push(section.body.trim());
  });

  if (draft.recommendations.length > 0) {
    lines.push("");
    lines.push("Notes & Follow-up Priorities");
    for (const item of draft.recommendations) {
      lines.push(`- ${item.trim()}`);
    }
  }

  return lines.join("\n").replace(/\r\n/g, "\n").trim();
}
