"use client";

import {
  AlertCircle,
  BarChart3,
  FileSpreadsheet,
  FileText,
  Play,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CfButton } from "@/components/ui";
import {
  buildUnderstoodSummary,
  type CustomReportMetadata,
  DATASET_CONFIG,
  REPORT_CHARTS,
  REPORT_DATASETS,
  type ReportChartType,
  type ReportDataset,
  type ReportGroupBy,
  type ReportMetric,
  type ReportSpec,
} from "@/lib/ai/report-spec";
import { formatNaira } from "@/lib/format";
import type { CustomReportResult } from "@/lib/reports/spec-executor-core";
import { AiSummaryPanel, type ClientNarrativeDto } from "./ai-summary-panel";

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

const CHART_LABELS: Record<ReportChartType, string> = {
  none: "Table only",
  bar: "Bar chart",
  line: "Line chart",
};

const QUICK_PROMPTS = [
  "Club expenses by category this year",
  "Dues collection by status this year",
  "Approved ticket sales by payment method",
  "Event attendance breakdown by status",
] as const;

function CustomReportChart({ result }: { result: CustomReportResult }) {
  const { spec, rows, summary } = result;
  if (spec.chart === "none" || rows.length === 0) return null;

  const displayRows = rows.slice(0, 12);
  const maxVal = Math.max(
    1,
    ...displayRows.map((row) => Math.max(0, row.metricValue)),
  );

  const formatMetric = (value: number) =>
    summary.isMonetary && spec.metric !== "count"
      ? formatNaira(value)
      : value.toLocaleString("en-US");

  if (spec.chart === "bar") {
    return (
      <div className="bg-[#FAF6F0]/70 border border-[#E5DDD3] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#3D291F] flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>
              {summary.metricLabel} ({displayRows.length}
              {rows.length > 12 ? ` of ${rows.length}` : ""} groups)
            </span>
          </span>
        </div>
        <div className="space-y-2.5">
          {displayRows.map((row) => {
            const pct = Math.max(
              2,
              Math.round((Math.max(0, row.metricValue) / maxVal) * 100),
            );
            return (
              <div key={row.groupKey} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#3D291F] truncate">
                    {row.groupLabel}
                  </span>
                  <span className="font-mono text-[#5C4638] tabular-nums shrink-0">
                    {formatMetric(row.metricValue)} ({row.sharePct}%)
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[#E5DDD3]/80 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#174C37]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Responsive SVG line chart
  const width = 640;
  const height = 210;
  const padX = 40;
  const padY = 24;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const stepX =
    displayRows.length > 1 ? plotW / (displayRows.length - 1) : plotW / 2;

  const points = displayRows.map((row, idx) => {
    const x = displayRows.length > 1 ? padX + idx * stepX : padX + plotW / 2;
    const y = padY + plotH - (Math.max(0, row.metricValue) / maxVal) * plotH;
    return { row, x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="bg-[#FAF6F0]/70 border border-[#E5DDD3] rounded-xl p-4 space-y-2">
      <div className="text-xs font-bold text-[#3D291F]">
        Trend · {summary.metricLabel}
      </div>
      <div className="overflow-x-auto">
        <svg
          aria-label={`Line chart of ${summary.metricLabel}`}
          className="w-full min-w-[420px] h-52"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line
            stroke="#E5DDD3"
            strokeWidth="1"
            x1={padX}
            x2={width - padX}
            y1={height - padY}
            y2={height - padY}
          />
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#174C37"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              points={polylinePoints}
            />
          )}
          {points.map((pt) => (
            <g key={pt.row.groupKey}>
              <circle
                cx={pt.x}
                cy={pt.y}
                fill="#D6A23A"
                r="5"
                stroke="#0C3325"
                strokeWidth="1.5"
              />
              <text
                fill="#5C4638"
                fontSize="10"
                textAnchor="middle"
                x={pt.x}
                y={height - 6}
              >
                {pt.row.groupLabel.slice(0, 10)}
              </text>
              <text
                fill="#3D291F"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
                x={pt.x}
                y={Math.max(12, pt.y - 10)}
              >
                {formatMetric(pt.row.metricValue)}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export function CustomReportBuilder({
  aiEnabled,
  defaultFrom,
  defaultTo,
  initialMetadata,
}: {
  aiEnabled: boolean;
  defaultFrom: string;
  defaultTo: string;
  initialMetadata: CustomReportMetadata;
}) {
  const [metadata, setMetadata] =
    useState<CustomReportMetadata>(initialMetadata);
  const [question, setQuestion] = useState("");
  const [draftSpec, setDraftSpec] = useState<ReportSpec>({
    dataset: "club_transactions",
    period: { from: defaultFrom, to: defaultTo },
    filters: { kind: "expense" },
    groupBy: "category",
    metric: "sum_amount",
    chart: "bar",
  });

  const [translating, setTranslating] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasTranslated, setHasTranslated] = useState(false);
  const [executedResult, setExecutedResult] =
    useState<CustomReportResult | null>(null);
  const [customNarrative, setCustomNarrative] =
    useState<ClientNarrativeDto | null>(null);
  const [includeAiInPdf, setIncludeAiInPdf] = useState(true);

  const activeConfig = DATASET_CONFIG[draftSpec.dataset];
  const understoodChips = useMemo(
    () => buildUnderstoodSummary(draftSpec, metadata),
    [draftSpec, metadata],
  );

  const categoryPool =
    draftSpec.dataset === "club_transactions"
      ? metadata.clubCategories
      : metadata.eventCategories;

  const updateDataset = (nextDataset: ReportDataset) => {
    const cfg = DATASET_CONFIG[nextDataset];
    const nextGroupBy =
      draftSpec.groupBy && cfg.allowedGroupBys.includes(draftSpec.groupBy)
        ? draftSpec.groupBy
        : cfg.allowedGroupBys[0];
    const nextMetric = cfg.allowedMetrics.includes(draftSpec.metric)
      ? draftSpec.metric
      : cfg.allowedMetrics[0];

    setDraftSpec({
      dataset: nextDataset,
      period: draftSpec.period,
      eventId: cfg.supportsEventId ? draftSpec.eventId : undefined,
      filters: {},
      groupBy: nextGroupBy,
      metric: nextMetric,
      chart: draftSpec.chart,
    });
  };

  const handleTranslate = async (customPrompt?: string) => {
    const q = (customPrompt ?? question).trim();
    if (q.length < 5) {
      setErrorMsg("Enter a question of at least 5 characters.");
      return;
    }
    setErrorMsg(null);
    setTranslating(true);
    try {
      const response = await fetch("/api/ai-reports/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "translate", question: q }),
      });
      const payload = (await response.json()) as {
        spec?: ReportSpec;
        metadata?: CustomReportMetadata;
        error?: string;
      };
      if (!response.ok || !payload.spec) {
        setErrorMsg(
          payload.error ||
            "Could not translate that question. Adjust filters below and run directly.",
        );
        return;
      }
      if (payload.metadata) setMetadata(payload.metadata);
      setDraftSpec(payload.spec);
      setHasTranslated(true);
    } catch {
      setErrorMsg(
        "AI translation is unavailable right now. Choose filters below and click Run Report.",
      );
    } finally {
      setTranslating(false);
    }
  };

  const handleRunReport = async () => {
    setErrorMsg(null);
    setRunning(true);
    try {
      const response = await fetch("/api/ai-reports/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", spec: draftSpec }),
      });
      const payload = (await response.json()) as {
        result?: CustomReportResult;
        metadata?: CustomReportMetadata;
        narrative?: ClientNarrativeDto | null;
        error?: string;
      };
      if (!response.ok || !payload.result) {
        setErrorMsg(payload.error || "Could not run custom report.");
        return;
      }
      if (payload.metadata) setMetadata(payload.metadata);
      setExecutedResult(payload.result);
      setCustomNarrative(payload.narrative ?? null);
    } catch {
      setErrorMsg("Could not execute custom report right now.");
    } finally {
      setRunning(false);
    }
  };

  const exportQuery = executedResult
    ? `spec=${encodeURIComponent(JSON.stringify(executedResult.spec))}`
    : "";
  const pdfHref = executedResult
    ? `/api/ai-reports/custom?${exportQuery}&format=pdf&includeAi=${
        includeAiInPdf ? "true" : "false"
      }`
    : "#";
  const csvHref = executedResult
    ? `/api/ai-reports/custom?${exportQuery}&format=csv`
    : "#";

  return (
    <section
      aria-label="Custom Plain-English Reports"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-5"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#174C37] shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#174C37]">
            Custom Query Builder
          </span>
        </div>
        <h2 className="text-lg sm:text-xl font-extrabold text-[#3D291F]">
          Plain-English Custom Reports
        </h2>
        <p className="text-xs text-[#5C4638]">
          Ask a question in plain English or adjust the structured filters
          below. All queries run strictly against verified club datasets with
          Dues and Attendance anonymised.
        </p>
      </div>

      {/* Natural language prompt + quick suggestions */}
      {aiEnabled && (
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="custom-report-question">
              Ask a plain-English report question
            </label>
            <input
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/60 text-sm text-[#3D291F] placeholder:text-[#7A685D] focus:outline-none focus:ring-2 focus:ring-[#174C37]/30"
              id="custom-report-question"
              maxLength={300}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleTranslate();
                }
              }}
              placeholder="e.g. Q3 club expenses by category or ticket sales by payment method"
              type="text"
              value={question}
            />
            <CfButton
              disabled={translating || running}
              onClick={() => void handleTranslate()}
              size="default"
              variant="primary"
            >
              <Sparkles className="w-4 h-4 text-[#D6A23A] shrink-0" />
              <span>
                {translating ? "Translating..." : "Ask AI → Build Spec"}
              </span>
            </CfButton>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((sample) => (
              <button
                key={sample}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F3ECE2] border border-[#E5DDD3] text-xs font-medium text-[#5C4638] transition-colors cursor-pointer"
                onClick={() => {
                  setQuestion(sample);
                  void handleTranslate(sample);
                }}
                type="button"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation / Spec editor */}
      <div className="rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/50 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#3D291F]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#174C37]" />
            <span>
              {hasTranslated
                ? "Here's what I understood — review or tweak before running"
                : "Report Specification"}
            </span>
          </div>
          <CfButton
            disabled={running || translating}
            onClick={() => void handleRunReport()}
            size="default"
            variant="primary"
          >
            <Play className="w-3.5 h-3.5 shrink-0" />
            <span>{running ? "Running..." : "Run Report"}</span>
          </CfButton>
        </div>

        {/* Understood confirmation chips */}
        <div className="flex flex-wrap gap-1.5">
          {understoodChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#E5DDD3] text-[11px] text-[#3D291F]"
            >
              <strong className="font-bold text-[#174C37]">
                {chip.label}:
              </strong>
              <span>{chip.value}</span>
            </span>
          ))}
        </div>

        {/* Editable specification controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">Dataset</span>
            <select
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) => updateDataset(e.target.value as ReportDataset)}
              value={draftSpec.dataset}
            >
              {REPORT_DATASETS.map((ds) => (
                <option key={ds} value={ds}>
                  {DATASET_CONFIG[ds].label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">From</span>
            <input
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) =>
                setDraftSpec({
                  ...draftSpec,
                  period: { ...draftSpec.period, from: e.target.value },
                })
              }
              type="date"
              value={draftSpec.period.from}
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">To</span>
            <input
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) =>
                setDraftSpec({
                  ...draftSpec,
                  period: { ...draftSpec.period, to: e.target.value },
                })
              }
              type="date"
              value={draftSpec.period.to}
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">Group by</span>
            <select
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) =>
                setDraftSpec({
                  ...draftSpec,
                  groupBy: e.target.value
                    ? (e.target.value as ReportGroupBy)
                    : undefined,
                })
              }
              value={draftSpec.groupBy ?? ""}
            >
              <option value="">Overall total</option>
              {activeConfig.allowedGroupBys.map((gb) => (
                <option key={gb} value={gb}>
                  {GROUP_LABELS[gb]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">Metric</span>
            <select
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) =>
                setDraftSpec({
                  ...draftSpec,
                  metric: e.target.value as ReportMetric,
                })
              }
              value={draftSpec.metric}
            >
              {activeConfig.allowedMetrics.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs">
            <span className="font-semibold text-[#5C4638] block">Chart</span>
            <select
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
              onChange={(e) =>
                setDraftSpec({
                  ...draftSpec,
                  chart: e.target.value as ReportChartType,
                })
              }
              value={draftSpec.chart}
            >
              {REPORT_CHARTS.map((c) => (
                <option key={c} value={c}>
                  {CHART_LABELS[c]}
                </option>
              ))}
            </select>
          </label>

          {activeConfig.supportsEventId && (
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-[#5C4638] block">Event</span>
              <select
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
                onChange={(e) =>
                  setDraftSpec({
                    ...draftSpec,
                    eventId: e.target.value || undefined,
                  })
                }
                value={draftSpec.eventId ?? ""}
              >
                <option value="">All events</option>
                {metadata.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {activeConfig.supportsKindFilter && (
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-[#5C4638] block">Kind</span>
              <select
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
                onChange={(e) =>
                  setDraftSpec({
                    ...draftSpec,
                    filters: {
                      ...draftSpec.filters,
                      kind: e.target.value
                        ? (e.target.value as "income" | "expense")
                        : undefined,
                    },
                  })
                }
                value={draftSpec.filters.kind ?? ""}
              >
                <option value="">All income &amp; expenses</option>
                <option value="income">Income only</option>
                <option value="expense">Expense only</option>
              </select>
            </label>
          )}

          {activeConfig.supportsCategoryFilter && categoryPool.length > 0 && (
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-[#5C4638] block">
                Category
              </span>
              <select
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
                onChange={(e) =>
                  setDraftSpec({
                    ...draftSpec,
                    filters: {
                      ...draftSpec.filters,
                      category: e.target.value || undefined,
                    },
                  })
                }
                value={draftSpec.filters.category ?? ""}
              >
                <option value="">All categories</option>
                {categoryPool.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
          )}

          {activeConfig.allowedStatuses.length > 0 && (
            <label className="space-y-1 text-xs">
              <span className="font-semibold text-[#5C4638] block">Status</span>
              <select
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F]"
                onChange={(e) =>
                  setDraftSpec({
                    ...draftSpec,
                    filters: {
                      ...draftSpec.filters,
                      status: e.target.value || undefined,
                    },
                  })
                }
                value={draftSpec.filters.status ?? ""}
              >
                <option value="">Default status</option>
                {activeConfig.allowedStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          className="p-3 rounded-xl bg-[#FDF2F0] border border-[#F5C6CB] text-xs text-[#8E2A1E] flex items-center gap-2"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Results section */}
      {executedResult && (
        <div className="space-y-4 pt-2 border-t border-[#E5DDD3]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                {executedResult.summary.datasetLabel} Results
              </h3>
              <p className="text-xs text-[#5C4638]">
                {executedResult.summary.totalCount.toLocaleString("en-US")}{" "}
                records matched
                {executedResult.summary.isMonetary &&
                executedResult.summary.totalAmountNgn !== null
                  ? ` · Total: ${formatNaira(executedResult.summary.totalAmountNgn)}`
                  : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {aiEnabled && (
                <label className="inline-flex items-center gap-2 min-h-[44px] px-2 text-xs text-[#5C4638] cursor-pointer select-none">
                  <input
                    checked={includeAiInPdf}
                    className="w-4 h-4 accent-[#174C37]"
                    onChange={(e) => setIncludeAiInPdf(e.target.checked)}
                    type="checkbox"
                  />
                  <span>Include approved AI summary</span>
                </label>
              )}
              <a
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors"
                href={pdfHref}
                rel="noopener"
                target="_blank"
              >
                <FileText className="w-4 h-4 text-[#D6A23A] shrink-0" />
                <span>Download PDF</span>
              </a>
              <a
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors"
                href={csvHref}
                rel="noopener"
                target="_blank"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#174C37] shrink-0" />
                <span>Export CSV</span>
              </a>
            </div>
          </div>

          <CustomReportChart result={executedResult} />

          <div className="overflow-x-auto rounded-xl border border-[#E5DDD3]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF6F0] border-b border-[#E5DDD3] text-[#5C4638] uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 font-bold">Group</th>
                  <th className="py-2.5 px-3 font-bold text-right">Count</th>
                  {executedResult.summary.isMonetary && (
                    <>
                      <th className="py-2.5 px-3 font-bold text-right">
                        Total (NGN)
                      </th>
                      <th className="py-2.5 px-3 font-bold text-right">
                        Average (NGN)
                      </th>
                    </>
                  )}
                  <th className="py-2.5 px-3 font-bold text-right">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD3]">
                {executedResult.rows.length === 0 ? (
                  <tr>
                    <td
                      className="py-5 px-3 text-center text-[#7A685D]"
                      colSpan={executedResult.summary.isMonetary ? 5 : 3}
                    >
                      No matching records found for the chosen period and
                      filters.
                    </td>
                  </tr>
                ) : (
                  executedResult.rows.map((row) => (
                    <tr
                      key={row.groupKey}
                      className="hover:bg-[#FAF6F0]/50 text-[#3D291F]"
                    >
                      <td className="py-2.5 px-3 font-semibold">
                        {row.groupLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono">
                        {row.count.toLocaleString("en-US")}
                      </td>
                      {executedResult.summary.isMonetary && (
                        <>
                          <td className="py-2.5 px-3 text-right tabular-nums font-mono font-bold text-[#174C37]">
                            {formatNaira(row.totalAmountNgn ?? 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums font-mono">
                            {formatNaira(row.averageAmountNgn ?? 0)}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-right tabular-nums font-mono">
                        {row.sharePct}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <AiSummaryPanel
            key={executedResult.fingerprint}
            aiEnabled={aiEnabled}
            customSpec={executedResult.spec}
            initialNarrative={customNarrative}
            onNarrativeChange={setCustomNarrative}
            reportType="custom"
            title="Custom Report AI Summary"
          />
        </div>
      )}
    </section>
  );
}
