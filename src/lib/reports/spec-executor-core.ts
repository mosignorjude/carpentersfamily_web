import { factsFingerprint, sanitizeLabel } from "@/lib/ai/facts";
import {
  DATASET_CONFIG,
  type ReportDataset,
  type ReportSpec,
} from "@/lib/ai/report-spec";

export interface CustomReportRow {
  groupKey: string;
  groupLabel: string;
  count: number;
  totalAmountNgn: number | null;
  averageAmountNgn: number | null;
  metricValue: number;
  sharePct: number;
}

export interface CustomReportSummary {
  datasetLabel: string;
  metricLabel: string;
  isMonetary: boolean;
  totalCount: number;
  totalAmountNgn: number | null;
  averageAmountNgn: number | null;
}

export interface CustomReportResult {
  spec: ReportSpec;
  periodStart: string;
  periodEnd: string;
  scopeId: string | null;
  eventTitle: string | null;
  summary: CustomReportSummary;
  rows: CustomReportRow[];
  facts: Record<string, unknown>;
  fingerprint: string;
}

export interface CustomAggregationContext {
  eventTitlesById?: Record<string, string>;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
};

const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  written_off: "Written off",
  deposit: "Deposit",
  pending: "Pending",
  approved: "Approved",
  recorded: "Pending verification",
  rejected: "Rejected",
  cancelled: "Cancelled",
  present: "Present",
  late: "Late",
  absent: "Absent",
};

function toWholeAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

export function formatWatMonth(timestampOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestampOrDate)) {
    return timestampOrDate.slice(0, 7);
  }
  const date = new Date(timestampOrDate);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return year && month ? `${year}-${month}` : "Unknown";
}

function formatPaymentMethod(raw: unknown): { key: string; label: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { key: "unspecified", label: "Unspecified" };
  }
  const key = raw.trim().toLowerCase();
  return {
    key,
    label: PAYMENT_METHOD_LABELS[key] ?? sanitizeLabel(raw, "Other", 40),
  };
}

function formatStatusLabel(rawKey: string): string {
  return STATUS_LABELS[rawKey] ?? sanitizeLabel(rawKey, "Other", 40);
}

interface NormalizedRow {
  amountNgn: number | null;
  groupKey: string;
  groupLabel: string;
}

function extractGroupForRow(
  dataset: ReportDataset,
  row: Record<string, unknown>,
  spec: ReportSpec,
  ctx: CustomAggregationContext,
): { key: string; label: string } {
  if (!spec.groupBy) {
    return { key: "all", label: DATASET_CONFIG[dataset].label };
  }

  switch (spec.groupBy) {
    case "month": {
      if (dataset === "club_transactions" || dataset === "event_transactions") {
        const d = String(row.transaction_date ?? "");
        const month = d.length >= 7 ? d.slice(0, 7) : "Unknown";
        return { key: month, label: month };
      }
      if (dataset === "dues") {
        const d = String(row.covered_month ?? "");
        const month = d.length >= 7 ? d.slice(0, 7) : "Unknown";
        return { key: month, label: month };
      }
      if (dataset === "ticket_sales") {
        const month = formatWatMonth(String(row.created_at ?? ""));
        return { key: month, label: month };
      }
      const ts = String(row.checked_in_at ?? row.recorded_at ?? "");
      const month = formatWatMonth(ts);
      return { key: month, label: month };
    }

    case "category": {
      const cat = sanitizeLabel(
        row.category_name_snapshot as string | null | undefined,
        dataset === "club_transactions" && row.kind === "income"
          ? "Club Income"
          : "Uncategorized",
        80,
      );
      return { key: cat.toLowerCase(), label: cat };
    }

    case "event": {
      const eventId = String(row.event_id ?? "");
      const title = eventId
        ? sanitizeLabel(ctx.eventTitlesById?.[eventId], "Club Event", 80)
        : "Club Event";
      return { key: eventId || title, label: title };
    }

    case "payment_method":
      return formatPaymentMethod(row.payment_method);

    case "status": {
      if (dataset === "dues") {
        const rawStatus = String(row.status ?? "unpaid").toLowerCase();
        const key =
          rawStatus === "unpaid" && row.is_overdue === true
            ? "overdue"
            : rawStatus;
        return { key, label: formatStatusLabel(key) };
      }
      if (dataset === "event_transactions") {
        const key = String(row.payment_status ?? "paid").toLowerCase();
        return { key, label: formatStatusLabel(key) };
      }
      if (dataset === "ticket_sales") {
        const key = String(row.verification_status ?? "recorded").toLowerCase();
        return { key, label: formatStatusLabel(key) };
      }
      const key = String(row.attendance_status ?? "present").toLowerCase();
      return { key, label: formatStatusLabel(key) };
    }
  }
}

function normalizeDatasetRows(
  spec: ReportSpec,
  rawRows: readonly Record<string, unknown>[],
  ctx: CustomAggregationContext,
): NormalizedRow[] {
  const isMonetary = DATASET_CONFIG[spec.dataset].isMonetary;
  const out: NormalizedRow[] = [];

  for (const row of rawRows) {
    if (
      spec.dataset === "club_transactions" &&
      row.is_opening_balance === true
    ) {
      continue;
    }

    if (spec.dataset === "dues" && spec.filters.status) {
      const rawStatus = String(row.status ?? "").toLowerCase();
      if (spec.filters.status === "overdue") {
        if (rawStatus !== "unpaid" || row.is_overdue !== true) continue;
      } else if (spec.filters.status === "unpaid") {
        if (rawStatus !== "unpaid" || row.is_overdue === true) continue;
      } else if (rawStatus !== spec.filters.status) {
        continue;
      }
    }

    if (
      spec.filters.category &&
      (spec.dataset === "club_transactions" ||
        spec.dataset === "event_transactions")
    ) {
      const rowCat = sanitizeLabel(
        row.category_name_snapshot as string | null | undefined,
        "",
        80,
      );
      if (rowCat.toLowerCase() !== spec.filters.category.toLowerCase()) {
        continue;
      }
    }

    const group = extractGroupForRow(spec.dataset, row, spec, ctx);
    out.push({
      amountNgn: isMonetary ? toWholeAmount(row.amount_ngn) : null,
      groupKey: group.key,
      groupLabel: group.label,
    });
  }

  return out;
}

export function aggregateCustomReport(
  spec: ReportSpec,
  rawRows: readonly Record<string, unknown>[],
  ctx: CustomAggregationContext = {},
): CustomReportResult {
  const cfg = DATASET_CONFIG[spec.dataset];
  const normalized = normalizeDatasetRows(spec, rawRows, ctx);

  const buckets = new Map<
    string,
    { label: string; count: number; totalAmountNgn: number }
  >();

  let totalCount = 0;
  let totalAmountNgn = 0;

  for (const item of normalized) {
    totalCount += 1;
    totalAmountNgn += item.amountNgn ?? 0;

    const current = buckets.get(item.groupKey) ?? {
      label: item.groupLabel,
      count: 0,
      totalAmountNgn: 0,
    };
    current.count += 1;
    current.totalAmountNgn += item.amountNgn ?? 0;
    buckets.set(item.groupKey, current);
  }

  const metricBasisTotal =
    spec.metric === "count" ? totalCount : totalAmountNgn;

  const rows: CustomReportRow[] = [...buckets.entries()].map(
    ([groupKey, bucket]) => {
      const avg = cfg.isMonetary
        ? Math.round(bucket.totalAmountNgn / Math.max(1, bucket.count))
        : null;
      const metricValue =
        spec.metric === "count"
          ? bucket.count
          : spec.metric === "average_amount"
            ? (avg ?? 0)
            : bucket.totalAmountNgn;
      const numerator =
        spec.metric === "count" ? bucket.count : bucket.totalAmountNgn;
      const sharePct =
        metricBasisTotal > 0
          ? Math.round((numerator / metricBasisTotal) * 1000) / 10
          : 0;

      return {
        groupKey,
        groupLabel: bucket.label,
        count: bucket.count,
        totalAmountNgn: cfg.isMonetary ? bucket.totalAmountNgn : null,
        averageAmountNgn: avg,
        metricValue,
        sharePct,
      };
    },
  );

  rows.sort((a, b) => {
    if (spec.groupBy === "month") {
      return a.groupKey.localeCompare(b.groupKey);
    }
    return (
      b.metricValue - a.metricValue || a.groupLabel.localeCompare(b.groupLabel)
    );
  });

  const metricLabel =
    spec.metric === "count"
      ? "Count"
      : spec.metric === "average_amount"
        ? "Average (NGN)"
        : "Total (NGN)";

  const eventTitle = spec.eventId
    ? sanitizeLabel(ctx.eventTitlesById?.[spec.eventId], "Selected Event", 80)
    : null;

  const summary: CustomReportSummary = {
    datasetLabel: cfg.label,
    metricLabel,
    isMonetary: cfg.isMonetary,
    totalCount,
    totalAmountNgn: cfg.isMonetary ? totalAmountNgn : null,
    averageAmountNgn: cfg.isMonetary
      ? totalCount > 0
        ? Math.round(totalAmountNgn / totalCount)
        : 0
      : null,
  };

  const facts: Record<string, unknown> = {
    report: "custom",
    dataset: spec.dataset,
    dataset_label: cfg.label,
    period: `${spec.period.from}..${spec.period.to}`,
    ...(eventTitle ? { event_title: eventTitle } : {}),
    filters: spec.filters,
    group_by: spec.groupBy ?? "overall",
    metric: spec.metric,
    totals: {
      record_count: totalCount,
      ...(cfg.isMonetary
        ? {
            total_amount_ngn: totalAmountNgn,
            average_amount_ngn: summary.averageAmountNgn ?? 0,
          }
        : {}),
    },
    groups: rows.slice(0, 50).map((row) => ({
      label: row.groupLabel,
      count: row.count,
      ...(cfg.isMonetary
        ? {
            total_amount_ngn: row.totalAmountNgn ?? 0,
            average_amount_ngn: row.averageAmountNgn ?? 0,
          }
        : {}),
      share_pct: row.sharePct,
    })),
  };

  const fingerprint = factsFingerprint({
    spec,
    summary,
    rows,
  });

  return {
    spec,
    periodStart: spec.period.from,
    periodEnd: spec.period.to,
    scopeId: spec.eventId ?? null,
    eventTitle,
    summary,
    rows,
    facts,
    fingerprint,
  };
}

const DISALLOWED_PII_KEYS = new Set([
  "member",
  "members",
  "member_id",
  "memberid",
  "full_name",
  "fullname",
  "username",
  "email",
  "phone",
  "phone_number",
  "payer_payee",
  "buyer_name",
]);

function scrubPiiText(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/(?:\+234|0[789][01]\d{8}|\+\d{8,15})/g, "[redacted]")
    .replace(/(^|\s)@[a-zA-Z0-9_.-]{2,}/g, "$1[redacted]");
}

function scrubCustomNode(node: unknown): unknown {
  if (typeof node === "string") {
    return sanitizeLabel(scrubPiiText(node), "Redacted", 120);
  }
  if (Array.isArray(node)) {
    return node.map((item) => scrubCustomNode(item));
  }
  if (typeof node === "object" && node !== null) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (DISALLOWED_PII_KEYS.has(key.toLowerCase())) continue;
      cleaned[key] = scrubCustomNode(val);
    }
    return cleaned;
  }
  return node;
}

/**
 * Strips any accidental member/PII attributes from custom report facts
 * and blocks member-level dues grouping before sending payloads to an AI provider.
 */
export function sanitizeCustomFactsForAi<T extends Record<string, unknown>>(
  facts: T,
): T {
  const dataset = typeof facts.dataset === "string" ? facts.dataset : "";
  const groupBy = typeof facts.group_by === "string" ? facts.group_by : "";
  if (dataset === "dues" && groupBy === "member") {
    throw new Error(
      "Member-level dues breakdowns cannot be sent for AI narrative generation.",
    );
  }
  return scrubCustomNode(facts) as T;
}
