import { z } from "zod";
import { sanitizeLabel } from "./facts";

export const REPORT_DATASETS = [
  "club_transactions",
  "event_transactions",
  "ticket_sales",
  "dues",
  "attendance",
] as const;

export const REPORT_GROUP_BYS = [
  "month",
  "category",
  "event",
  "payment_method",
  "status",
] as const;

export const REPORT_METRICS = [
  "sum_amount",
  "count",
  "average_amount",
] as const;

export const REPORT_CHARTS = ["none", "bar", "line"] as const;

export type ReportDataset = (typeof REPORT_DATASETS)[number];
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];
export type ReportMetric = (typeof REPORT_METRICS)[number];
export type ReportChartType = (typeof REPORT_CHARTS)[number];

export interface CustomReportEventOption {
  id: string;
  title: string;
  eventType: string;
  startsAt: string;
}

export interface CustomReportMetadata {
  clubCategories: string[];
  eventCategories: string[];
  events: CustomReportEventOption[];
}

export interface DatasetRuleConfig {
  label: string;
  description: string;
  allowedGroupBys: readonly ReportGroupBy[];
  allowedMetrics: readonly ReportMetric[];
  allowedStatuses: readonly string[];
  supportsEventId: boolean;
  supportsKindFilter: boolean;
  supportsCategoryFilter: boolean;
  isMonetary: boolean;
}

export const DATASET_CONFIG: Record<ReportDataset, DatasetRuleConfig> = {
  club_transactions: {
    label: "Club Transactions",
    description:
      "Club operating income and expense ledger (voided entries and opening balance excluded).",
    allowedGroupBys: ["month", "category", "payment_method"],
    allowedMetrics: ["sum_amount", "count", "average_amount"],
    allowedStatuses: [],
    supportsEventId: false,
    supportsKindFilter: true,
    supportsCategoryFilter: true,
    isMonetary: true,
  },
  event_transactions: {
    label: "Event Transactions",
    description:
      "Event income and expense records across events (voided entries excluded).",
    allowedGroupBys: ["month", "category", "event", "payment_method", "status"],
    allowedMetrics: ["sum_amount", "count", "average_amount"],
    allowedStatuses: ["paid", "deposit", "pending", "unpaid"],
    supportsEventId: true,
    supportsKindFilter: true,
    supportsCategoryFilter: true,
    isMonetary: true,
  },
  ticket_sales: {
    label: "Ticket Sales",
    description:
      "Ticket orders across events (filters or groups by verification status, event, month, payment method).",
    allowedGroupBys: ["month", "event", "payment_method", "status"],
    allowedMetrics: ["sum_amount", "count", "average_amount"],
    allowedStatuses: ["approved", "recorded", "rejected", "cancelled"],
    supportsEventId: true,
    supportsKindFilter: false,
    supportsCategoryFilter: false,
    isMonetary: true,
  },
  dues: {
    label: "Member Dues (Aggregate Only)",
    description:
      "Monthly club dues obligations and collection status aggregated by month or status (never by individual member).",
    allowedGroupBys: ["month", "status"],
    allowedMetrics: ["sum_amount", "count", "average_amount"],
    allowedStatuses: ["paid", "unpaid", "overdue", "written_off"],
    supportsEventId: false,
    supportsKindFilter: false,
    supportsCategoryFilter: false,
    isMonetary: true,
  },
  attendance: {
    label: "Event Attendance (Counts Only)",
    description:
      "Event and meeting check-in attendance counts by status, event, or month.",
    allowedGroupBys: ["month", "event", "status"],
    allowedMetrics: ["count"],
    allowedStatuses: ["present", "late", "absent", "rejected"],
    supportsEventId: true,
    supportsKindFilter: false,
    supportsCategoryFilter: false,
    isMonetary: false,
  },
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value) || value < "1900-01-01") return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === null || val === "" ? undefined : val), schema);

export const ReportSpecSchema = z.object({
  dataset: z.enum(REPORT_DATASETS),
  period: z.object({
    from: z.string().refine(isCalendarDate, "Invalid start date."),
    to: z.string().refine(isCalendarDate, "Invalid end date."),
  }),
  eventId: nullToUndefined(
    z.string().regex(UUID_REGEX, "Invalid event identifier.").optional(),
  ),
  filters: z
    .object({
      kind: nullToUndefined(z.enum(["income", "expense"]).optional()),
      category: nullToUndefined(z.string().trim().min(1).max(80).optional()),
      status: nullToUndefined(z.string().trim().min(1).max(40).optional()),
    })
    .default({}),
  groupBy: nullToUndefined(z.enum(REPORT_GROUP_BYS).optional()),
  metric: nullToUndefined(z.enum(REPORT_METRICS).optional()).default(
    "sum_amount",
  ),
  chart: nullToUndefined(z.enum(REPORT_CHARTS).optional()).default("none"),
});

export type ReportSpec = z.infer<typeof ReportSpecSchema>;

export const SPEC_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    dataset: {
      type: "string",
      enum: [...REPORT_DATASETS],
    },
    period: {
      type: "object",
      additionalProperties: false,
      properties: {
        from: { type: "string", description: "ISO YYYY-MM-DD start date" },
        to: { type: "string", description: "ISO YYYY-MM-DD end date" },
      },
      required: ["from", "to"],
    },
    eventId: {
      type: ["string", "null"],
      description: "Optional event UUID from the provided event list, or null",
    },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: ["string", "null"],
          enum: ["income", "expense", null],
        },
        category: {
          type: ["string", "null"],
          description: "Exact category name from allowed list, or null",
        },
        status: {
          type: ["string", "null"],
          description: "Allowed status filter for chosen dataset, or null",
        },
      },
    },
    groupBy: {
      type: ["string", "null"],
      enum: [...REPORT_GROUP_BYS, null],
    },
    metric: {
      type: "string",
      enum: [...REPORT_METRICS],
    },
    chart: {
      type: "string",
      enum: [...REPORT_CHARTS],
    },
  },
  required: ["dataset", "period", "filters", "metric", "chart"],
} as const;

export function parseAndNormalizeReportSpec(
  raw: unknown,
  metadata?: CustomReportMetadata,
): { ok: true; spec: ReportSpec } | { ok: false; error: string } {
  const normalizedInput =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? {
          ...(raw as Record<string, unknown>),
          filters:
            (raw as Record<string, unknown>).filters ??
            ({} as Record<string, unknown>),
        }
      : raw;

  const parsed = ReportSpecSchema.safeParse(normalizedInput);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      error: firstIssue?.message || "Invalid custom report specification.",
    };
  }

  const spec = parsed.data;
  if (spec.period.from > spec.period.to) {
    return { ok: false, error: "Start date must be on or before end date." };
  }

  const fromMs = Date.parse(`${spec.period.from}T00:00:00Z`);
  const toMs = Date.parse(`${spec.period.to}T00:00:00Z`);
  const diffDays = Math.round((toMs - fromMs) / 86_400_000);
  if (diffDays > 3660) {
    return { ok: false, error: "Date range cannot exceed 10 years." };
  }

  const cfg = DATASET_CONFIG[spec.dataset];

  if (!cfg.allowedMetrics.includes(spec.metric)) {
    return {
      ok: false,
      error: `${cfg.label} only supports: ${cfg.allowedMetrics.join(", ")}.`,
    };
  }

  if (spec.groupBy && !cfg.allowedGroupBys.includes(spec.groupBy)) {
    return {
      ok: false,
      error: `${cfg.label} cannot be grouped by ${spec.groupBy}.`,
    };
  }

  if (spec.eventId && !cfg.supportsEventId) {
    return {
      ok: false,
      error: `${cfg.label} cannot filter by a single event.`,
    };
  }

  if (spec.filters.kind && !cfg.supportsKindFilter) {
    return {
      ok: false,
      error: `${cfg.label} does not support income/expense kind filtering.`,
    };
  }

  if (spec.filters.category && !cfg.supportsCategoryFilter) {
    return {
      ok: false,
      error: `${cfg.label} does not support category filtering.`,
    };
  }

  let normalizedStatus = spec.filters.status?.toLowerCase();
  if (normalizedStatus) {
    if (
      cfg.allowedStatuses.length === 0 ||
      !cfg.allowedStatuses.includes(normalizedStatus)
    ) {
      return {
        ok: false,
        error: `Unsupported status filter "${spec.filters.status}" for ${cfg.label}.`,
      };
    }
  } else {
    normalizedStatus = undefined;
  }

  let normalizedCategory = spec.filters.category;
  if (normalizedCategory) {
    const cleanCat = sanitizeLabel(normalizedCategory, "", 80);
    if (!cleanCat || cleanCat !== normalizedCategory) {
      return { ok: false, error: "Invalid category filter characters." };
    }
    if (metadata) {
      const pool =
        spec.dataset === "club_transactions"
          ? metadata.clubCategories
          : metadata.eventCategories;
      const matched = pool.find(
        (item) => item.toLowerCase() === cleanCat.toLowerCase(),
      );
      if (!matched) {
        return {
          ok: false,
          error: `Unknown category filter "${cleanCat}".`,
        };
      }
      normalizedCategory = matched;
    } else {
      normalizedCategory = cleanCat;
    }
  }

  let normalizedEventId = spec.eventId;
  if (normalizedEventId && metadata) {
    const matchedEvent = metadata.events.find(
      (ev) => ev.id.toLowerCase() === normalizedEventId?.toLowerCase(),
    );
    if (!matchedEvent) {
      return { ok: false, error: "Selected event could not be found." };
    }
    normalizedEventId = matchedEvent.id;
  }

  return {
    ok: true,
    spec: {
      dataset: spec.dataset,
      period: spec.period,
      eventId: normalizedEventId,
      filters: {
        ...(spec.filters.kind ? { kind: spec.filters.kind } : {}),
        ...(normalizedCategory ? { category: normalizedCategory } : {}),
        ...(normalizedStatus ? { status: normalizedStatus } : {}),
      },
      groupBy: spec.groupBy,
      metric: spec.metric,
      chart: spec.chart,
    },
  };
}

export function sanitizeQuestionInput(
  raw: unknown,
): { ok: true; question: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Enter a plain-English report question." };
  }
  const trimmed = raw.trim();
  if (trimmed.length > 300) {
    return {
      ok: false,
      error: "Question must be 300 characters or fewer.",
    };
  }
  const clean = sanitizeLabel(trimmed, "", 300);
  if (clean.length < 5) {
    return {
      ok: false,
      error: "Question must be at least 5 characters.",
    };
  }
  return { ok: true, question: clean };
}

export function buildSpecTranslatorPrompt(
  question: string,
  metadata: CustomReportMetadata,
  todayWAT: string,
): { system: string; user: string; schema: Record<string, unknown> } {
  const clubCats =
    metadata.clubCategories.length > 0
      ? metadata.clubCategories.map((c) => sanitizeLabel(c, c, 80)).join(", ")
      : "None recorded";
  const eventCats =
    metadata.eventCategories.length > 0
      ? metadata.eventCategories.map((c) => sanitizeLabel(c, c, 80)).join(", ")
      : "None recorded";
  const eventList =
    metadata.events.length > 0
      ? metadata.events
          .slice(0, 60)
          .map(
            (ev) =>
              `- ${ev.id} | ${sanitizeLabel(ev.title, "Event", 100)} (${ev.eventType}, ${ev.startsAt.slice(0, 10)})`,
          )
          .join("\n")
      : "No events listed";

  const datasetLines = REPORT_DATASETS.map((key) => {
    const cfg = DATASET_CONFIG[key];
    return `- ${key}: ${cfg.description} | groupBy: [${cfg.allowedGroupBys.join(", ")}] | metric: [${cfg.allowedMetrics.join(", ")}]${cfg.allowedStatuses.length ? ` | status: [${cfg.allowedStatuses.join(", ")}]` : ""}`;
  }).join("\n");

  const system = [
    "You translate an officer's report question for Carpenters Family Social Club into a strictly validated JSON ReportSpec.",
    `Today's date (WAT, Africa/Lagos) is ${todayWAT}.`,
    "Return ONLY valid JSON matching the schema. Never output SQL, explanations, or invented field names.",
    "DATASETS AND CONSTRAINTS:",
    datasetLines,
    `CLUB TRANSACTION CATEGORIES: ${clubCats}`,
    `EVENT TRANSACTION CATEGORIES: ${eventCats}`,
    "EVENTS (id | title (type, date)):",
    eventList,
    "RULES:",
    "1. Resolve relative ranges (e.g., 'Q3', 'last month', 'this year', 'October') relative to Today's date.",
    "2. Use chart='bar' for category/event/status breakdowns and chart='line' for monthly trends; otherwise chart='none'.",
    "3. For attendance, metric MUST be 'count'. For dues, groupBy can only be 'month', 'status', or null.",
    "4. Only set filters.category to an exact string from the matching category list above (or null).",
    "5. Only set eventId to an exact UUID from EVENTS above (or null).",
  ].join("\n");

  return {
    system,
    user: `QUESTION: ${question}`,
    schema: SPEC_JSON_SCHEMA as unknown as Record<string, unknown>,
  };
}

const METRIC_LABELS: Record<ReportMetric, string> = {
  sum_amount: "Total Amount (NGN)",
  count: "Record Count",
  average_amount: "Average Amount (NGN)",
};

const GROUP_LABELS: Record<ReportGroupBy, string> = {
  month: "Month",
  category: "Category",
  event: "Event",
  payment_method: "Payment Method",
  status: "Status",
};

export function buildUnderstoodSummary(
  spec: ReportSpec,
  metadata?: CustomReportMetadata,
): Array<{ label: string; value: string }> {
  const cfg = DATASET_CONFIG[spec.dataset];
  const chips: Array<{ label: string; value: string }> = [
    { label: "Dataset", value: cfg.label },
    { label: "Period", value: `${spec.period.from} to ${spec.period.to}` },
    { label: "Metric", value: METRIC_LABELS[spec.metric] },
    {
      label: "Group by",
      value: spec.groupBy ? GROUP_LABELS[spec.groupBy] : "Overall total",
    },
  ];

  if (spec.eventId) {
    const ev = metadata?.events.find((item) => item.id === spec.eventId);
    chips.push({
      label: "Event",
      value: ev ? sanitizeLabel(ev.title, spec.eventId, 80) : spec.eventId,
    });
  }

  const filterParts = [
    spec.filters.kind ? `kind=${spec.filters.kind}` : null,
    spec.filters.category ? `category=${spec.filters.category}` : null,
    spec.filters.status ? `status=${spec.filters.status}` : null,
  ].filter(Boolean);

  if (filterParts.length > 0) {
    chips.push({ label: "Filter", value: filterParts.join(", ") });
  }

  if (spec.chart !== "none") {
    chips.push({
      label: "Chart",
      value: spec.chart === "bar" ? "Bar chart" : "Line chart",
    });
  }

  return chips;
}
