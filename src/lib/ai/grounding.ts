export interface AiNarrativeContent {
  headline: string;
  highlights: string[];
  risks: string[];
  recommendations: string[];
}

export type GroundingValidationResult =
  | { ok: true; content: AiNarrativeContent }
  | { ok: false; reasons: string[] };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_ABBRS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateStringList(
  value: unknown,
  field: string,
  minItems: number,
  maxItems: number,
  reasons: string[],
): string[] {
  if (!Array.isArray(value)) {
    reasons.push(`${field} must be an array of strings.`);
    return [];
  }
  if (value.length < minItems || value.length > maxItems) {
    reasons.push(
      `${field} must contain between ${minItems} and ${maxItems} items.`,
    );
  }
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      reasons.push(`${field} items must be strings.`);
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length < 5 || trimmed.length > 320) {
      reasons.push(`${field} item length must be 5..320 characters.`);
      continue;
    }
    cleaned.push(trimmed);
  }
  return cleaned;
}

function validateNarrativeShape(
  raw: unknown,
):
  | { ok: true; content: AiNarrativeContent }
  | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!isPlainRecord(raw)) {
    return { ok: false, reasons: ["Narrative must be a JSON object."] };
  }

  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  if (headline.length < 10 || headline.length > 220) {
    reasons.push("headline must be a string between 10 and 220 characters.");
  }

  const highlights = validateStringList(
    raw.highlights,
    "highlights",
    1,
    5,
    reasons,
  );
  const risks = validateStringList(raw.risks, "risks", 0, 4, reasons);
  const recommendations = validateStringList(
    raw.recommendations,
    "recommendations",
    0,
    3,
    reasons,
  );

  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    content: { headline, highlights, risks, recommendations },
  };
}

function hasDisallowedControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

function checkTextSafety(text: string, reasons: string[]): void {
  if (hasDisallowedControlChar(text)) {
    reasons.push("Control characters are not allowed in narrative text.");
  }
  if (/<script|<iframe|javascript:|<[a-z!/][^>]*>/i.test(text)) {
    reasons.push("HTML or script markup is not allowed in narrative text.");
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
    reasons.push("Email addresses are not allowed in narrative text.");
  }
  if (/(?:^|\s)@[a-zA-Z0-9_.-]{2,}/.test(text)) {
    reasons.push("@handles are not allowed in narrative text.");
  }
  if (/https?:\/\/|www\./i.test(text)) {
    reasons.push("URLs are not allowed in narrative text.");
  }
  if (/(?:\+234|0[789][01]\d{8}|\+\d{8,15})/.test(text)) {
    reasons.push("Phone numbers are not allowed in narrative text.");
  }
}

interface FactGroundContext {
  exactNumbers: Set<number>;
  roundedPercents: Set<number>;
  allowedDates: Set<string>;
  allowedMonths: Set<string>;
  allowedLiterals: Set<string>;
  hasMonthBucketPhrases: boolean;
}

function collectContext(facts: unknown): FactGroundContext {
  const exactNumbers = new Set<number>([0, 100]);
  const roundedPercents = new Set<number>([0, 100]);
  const allowedDates = new Set<string>();
  const allowedMonths = new Set<string>();
  const allowedLiterals = new Set<string>();
  let hasMonthBucketPhrases = false;

  const addNumber = (value: number) => {
    if (!Number.isFinite(value)) return;
    exactNumbers.add(value);
    exactNumbers.add(Math.abs(value));
  };

  const addNumericGroup = (nums: number[]) => {
    let total = 0;
    for (const n of nums) total += n;
    addNumber(total);

    for (let i = 0; i < nums.length; i += 1) {
      for (let j = i; j < nums.length; j += 1) {
        const a = nums[i];
        const b = nums[j];
        addNumber(a + b);
        addNumber(Math.abs(a - b));
        addNumber(a - b);
        if (b > 0 && a >= 0 && a <= b * 10) {
          const pct1 = Math.round((a / b) * 1000) / 10;
          const pct0 = Math.round((a / b) * 100);
          roundedPercents.add(pct1);
          roundedPercents.add(pct0);
        }
        if (a > 0 && b >= 0 && b <= a * 10) {
          const pct1 = Math.round((b / a) * 1000) / 10;
          const pct0 = Math.round((b / a) * 100);
          roundedPercents.add(pct1);
          roundedPercents.add(pct0);
        }
      }
    }
  };

  const walk = (node: unknown, keyHint = "") => {
    if (typeof node === "number") {
      addNumber(node);
      return;
    }
    if (typeof node === "string") {
      for (const dateMatch of node.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
        allowedDates.add(dateMatch[0]);
        allowedMonths.add(`${dateMatch[1]}-${dateMatch[2]}`);
        exactNumbers.add(Number(dateMatch[1]));
      }
      for (const monthMatch of node.matchAll(/\b(\d{4})-(\d{2})\b/g)) {
        allowedMonths.add(monthMatch[0]);
        exactNumbers.add(Number(monthMatch[1]));
      }
      if (
        (keyHint === "category" ||
          keyHint === "event_title" ||
          keyHint === "title" ||
          keyHint === "tier" ||
          keyHint === "period_label") &&
        node.trim().length > 0
      ) {
        allowedLiterals.add(node.trim());
      }
      return;
    }
    if (Array.isArray(node)) {
      const columnSums = new Map<string, number>();
      for (const item of node) {
        walk(item, keyHint);
        if (isPlainRecord(item)) {
          for (const [k, v] of Object.entries(item)) {
            if (typeof v === "number" && Number.isFinite(v)) {
              columnSums.set(k, (columnSums.get(k) ?? 0) + v);
            }
          }
        }
      }
      for (const sum of columnSums.values()) {
        addNumber(sum);
      }
      return;
    }
    if (isPlainRecord(node)) {
      const siblingNums: number[] = [];
      for (const [k, v] of Object.entries(node)) {
        if (
          k === "three_plus_months" ||
          k === "overdue_three_plus_members" ||
          k === "one_month" ||
          k === "two_months"
        ) {
          hasMonthBucketPhrases = true;
        }
        walk(v, k);
        if (typeof v === "number" && Number.isFinite(v)) {
          siblingNums.push(v);
        }
      }
      if (siblingNums.length >= 2) {
        addNumericGroup(siblingNums);
      }
    }
  };

  walk(facts);

  // Also allow cross-comparisons across top-level numeric fields in nested report sections
  if (isPlainRecord(facts)) {
    const flatNums: number[] = [];
    for (const val of Object.values(facts)) {
      if (isPlainRecord(val)) {
        for (const inner of Object.values(val)) {
          if (typeof inner === "number" && Number.isFinite(inner)) {
            flatNums.push(inner);
          }
        }
      }
    }
    if (flatNums.length >= 2 && flatNums.length <= 32) {
      addNumericGroup(flatNums);
    }
  }

  return {
    exactNumbers,
    roundedPercents,
    allowedDates,
    allowedMonths,
    allowedLiterals,
    hasMonthBucketPhrases,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskAllowedPhrases(text: string, ctx: FactGroundContext): string {
  let masked = text;

  for (const literal of ctx.allowedLiterals) {
    if (literal.length >= 2) {
      masked = masked.replace(new RegExp(escapeRegExp(literal), "gi"), " ");
    }
  }

  for (const isoDate of ctx.allowedDates) {
    const [yearStr, monthStr, dayStr] = isoDate.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const day = Number(dayStr);
    const monthFull = MONTH_NAMES[monthIdx];
    const monthAbbr = MONTH_ABBRS[monthIdx];

    masked = masked.replace(
      new RegExp(`\\b${escapeRegExp(isoDate)}\\b`, "g"),
      " ",
    );
    if (monthFull && monthAbbr) {
      const patterns = [
        `\\b${monthFull}\\s+0?${day}(?:st|nd|rd|th)?,?\\s+${year}\\b`,
        `\\b${monthAbbr}\\.?\\s+0?${day}(?:st|nd|rd|th)?,?\\s+${year}\\b`,
        `\\b0?${day}(?:st|nd|rd|th)?\\s+${monthFull},?\\s+${year}\\b`,
        `\\b0?${day}(?:st|nd|rd|th)?\\s+${monthAbbr}\\.?,?\\s+${year}\\b`,
        `\\b${monthFull}\\s+0?${day}(?:st|nd|rd|th)?\\b`,
        `\\b${monthAbbr}\\.?\\s+0?${day}(?:st|nd|rd|th)?\\b`,
      ];
      for (const pat of patterns) {
        masked = masked.replace(new RegExp(pat, "gi"), " ");
      }
    }
  }

  for (const isoMonth of ctx.allowedMonths) {
    const [yearStr, monthStr] = isoMonth.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const monthFull = MONTH_NAMES[monthIdx];
    const monthAbbr = MONTH_ABBRS[monthIdx];

    masked = masked.replace(
      new RegExp(`\\b${escapeRegExp(isoMonth)}\\b`, "g"),
      " ",
    );
    if (monthFull && monthAbbr) {
      masked = masked.replace(
        new RegExp(`\\b(?:${monthFull}|${monthAbbr}\\.?)\\s+${year}\\b`, "gi"),
        " ",
      );
    }
  }

  if (ctx.hasMonthBucketPhrases) {
    masked = masked.replace(/\b3\+\s*months?\b/gi, " ");
    masked = masked.replace(/\b[12]\s*months?\b/gi, " ");
  }

  return masked;
}

function isGroundedNumber(
  value: number,
  isPercent: boolean,
  ctx: FactGroundContext,
): boolean {
  if (!Number.isFinite(value)) return false;
  if (isPercent) {
    for (const allowed of ctx.roundedPercents) {
      if (Math.abs(value - allowed) <= 0.15) return true;
    }
    for (const allowed of ctx.exactNumbers) {
      if (Math.abs(value - allowed) <= 0.15) return true;
    }
    return false;
  }

  if (ctx.exactNumbers.has(value) || ctx.exactNumbers.has(Math.abs(value))) {
    return true;
  }
  if (!Number.isInteger(value)) {
    for (const allowed of ctx.exactNumbers) {
      if (Math.abs(value - allowed) <= 0.15) return true;
    }
    for (const allowed of ctx.roundedPercents) {
      if (Math.abs(value - allowed) <= 0.15) return true;
    }
  }
  return false;
}

export function validateNarrativeContent(
  raw: unknown,
  facts: unknown,
): GroundingValidationResult {
  const shapeResult = validateNarrativeShape(raw);
  if (!shapeResult.ok) return shapeResult;

  const { content } = shapeResult;
  const allStrings = [
    content.headline,
    ...content.highlights,
    ...content.risks,
    ...content.recommendations,
  ];
  const reasons: string[] = [];

  for (const segment of allStrings) {
    checkTextSafety(segment, reasons);
  }

  const ctx = collectContext(facts);
  const combinedMasked = maskAllowedPhrases(allStrings.join(" \n "), ctx);
  const numberMatches = combinedMasked.matchAll(
    /(?<![A-Za-z0-9_])(-?\d[\d,]*(?:\.\d+)?)(%?)/g,
  );

  for (const match of numberMatches) {
    const rawToken = match[1];
    const isPercent = match[2] === "%";
    const parsed = Number(rawToken.replaceAll(",", ""));
    if (!isGroundedNumber(parsed, isPercent, ctx)) {
      reasons.push(`Ungrounded number in AI output: ${rawToken}${match[2]}`);
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }
  return { ok: true, content };
}
