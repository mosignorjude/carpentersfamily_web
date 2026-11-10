import { createElement } from "react";
import { requireOfficer } from "@/lib/ai/officer.server";
import {
  getAiDailyLimitPerOfficer,
  isAiReportsEnabled,
} from "@/lib/ai/provider.server";
import type { ReportSpec } from "@/lib/ai/report-spec";
import { isSameSiteOrigin, readBoundedJsonBody } from "@/lib/ai/request-guard";
import { clubBrand } from "@/lib/brand";
import { CustomReportPdfDocument } from "@/lib/pdf/documents";
import { renderReportPdf } from "@/lib/pdf/render.server";
import {
  createSimplePdf,
  formatNgn,
  getWATDate,
  MAX_REPORT_EXPORT_BYTES,
  toCsvRows,
} from "@/lib/report-export";
import {
  loadActiveOfficerNarrative,
  loadApprovedNarrativeForReport,
} from "@/lib/reports/loaders.server";
import {
  executeCustomReportSpec,
  translateQuestionToSpec,
} from "@/lib/reports/spec-executor.server";
import { getSiteOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

const MAX_REQUEST_BYTES = 4096;

function jsonError(status: number, message: string) {
  return Response.json(
    { error: message },
    { status, headers: RESPONSE_HEADERS },
  );
}

function buildSubtitle(spec: ReportSpec, eventTitle: string | null): string {
  const parts: string[] = [
    `${spec.period.from} to ${spec.period.to}`,
    spec.groupBy ? `Grouped by ${spec.groupBy.replace("_", " ")}` : "Overall",
  ];
  if (eventTitle) parts.push(eventTitle);
  if (spec.filters.kind) parts.push(`Kind: ${spec.filters.kind}`);
  if (spec.filters.category) parts.push(`Category: ${spec.filters.category}`);
  if (spec.filters.status) parts.push(`Status: ${spec.filters.status}`);
  return parts.join(" · ");
}

export async function POST(request: Request) {
  const siteOrigin = getSiteOrigin();
  if (!siteOrigin) {
    return jsonError(503, "Custom report service is unavailable.");
  }
  if (!isSameSiteOrigin(request, siteOrigin)) {
    return jsonError(403, "The custom report request could not be verified.");
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_REQUEST_BYTES);
  if (bodyResult.kind === "too-large") {
    return jsonError(413, "Request payload is too large.");
  }
  if (bodyResult.kind !== "ok" || typeof bodyResult.data !== "object") {
    return jsonError(400, "Invalid JSON payload.");
  }

  const payload = bodyResult.data as Record<string, unknown>;
  const action = payload.action;
  if (action !== "translate" && action !== "run") {
    return jsonError(400, "Choose a valid custom report action.");
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Custom report service is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  if (action === "translate") {
    if (!isAiReportsEnabled()) {
      return jsonError(503, "AI report translation is currently disabled.");
    }

    const dailyLimit = getAiDailyLimitPerOfficer();
    const { data: quotaOk, error: quotaError } = await supabase.rpc(
      "ai_generation_quota_ok",
      { p_limit: dailyLimit },
    );
    if (quotaError) {
      return jsonError(503, "Unable to verify daily AI quota.");
    }
    if (quotaOk !== true) {
      return jsonError(
        429,
        `Daily limit of ${dailyLimit} AI actions reached. Choose filters manually below.`,
      );
    }

    const translated = await translateQuestionToSpec(
      supabase,
      payload.question,
    );
    if (!translated.ok) {
      return jsonError(translated.status, translated.error);
    }

    return Response.json(
      {
        spec: translated.spec,
        understood: translated.understood,
        metadata: translated.metadata,
        provider: translated.provider,
        model: translated.model,
      },
      { status: 200, headers: RESPONSE_HEADERS },
    );
  }

  const execRes = await executeCustomReportSpec(supabase, payload.spec);
  if (execRes.kind === "invalid") {
    return jsonError(400, execRes.error);
  }
  if (execRes.kind === "too-large") {
    return jsonError(
      413,
      "This query matched too many rows. Narrow the date range or select an event.",
    );
  }
  if (execRes.kind !== "ok") {
    return jsonError(503, "Custom report data could not be loaded.");
  }

  const narrative = await loadActiveOfficerNarrative(supabase, {
    reportType: "custom",
    scopeId: execRes.result.scopeId,
    periodStart: execRes.result.periodStart,
    periodEnd: execRes.result.periodEnd,
    fingerprint: execRes.result.fingerprint,
  });

  return Response.json(
    {
      result: execRes.result,
      understood: execRes.understood,
      metadata: execRes.metadata,
      narrative,
    },
    { status: 200, headers: RESPONSE_HEADERS },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSpecParam = url.searchParams.get("spec");
  if (!rawSpecParam || rawSpecParam.length > 2048) {
    return jsonError(400, "Valid custom report spec query is required.");
  }

  let parsedSpecInput: unknown;
  try {
    parsedSpecInput = JSON.parse(rawSpecParam);
  } catch {
    return jsonError(400, "Malformed custom report spec JSON.");
  }

  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const includeAiParam = url.searchParams.get("includeAi");
  const includeAi = includeAiParam !== "false" && includeAiParam !== "0";

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return jsonError(503, "Custom report export is unavailable.");
  }

  const officer = await requireOfficer(supabase);
  if (!officer.ok) {
    return jsonError(officer.status, officer.error);
  }

  const execRes = await executeCustomReportSpec(supabase, parsedSpecInput);
  if (execRes.kind === "invalid") {
    return jsonError(400, execRes.error);
  }
  if (execRes.kind === "too-large") {
    return jsonError(
      413,
      "This query matched too many rows. Narrow the date range.",
    );
  }
  if (execRes.kind !== "ok") {
    return jsonError(503, "Custom report data could not be loaded.");
  }

  const { result } = execRes;
  const { spec, summary, rows, eventTitle } = result;
  const subtitle = buildSubtitle(spec, eventTitle);

  if (format === "csv") {
    const csvRows: Array<Array<string | number | null>> = [
      ["Report", `Custom Report - ${summary.datasetLabel}`],
      ["Period", `${spec.period.from} to ${spec.period.to}`],
      ["Metric", summary.metricLabel],
      ...(eventTitle ? [["Event", eventTitle]] : []),
      ["Matched records", summary.totalCount],
      ...(summary.isMonetary
        ? [
            ["Total amount (NGN)", summary.totalAmountNgn ?? 0],
            ["Average amount (NGN)", summary.averageAmountNgn ?? 0],
          ]
        : []),
      [],
      summary.isMonetary
        ? ["Group", "Count", "Total (NGN)", "Average (NGN)", "Share (%)"]
        : ["Group", "Count", "Share (%)"],
      ...rows.map((r) =>
        summary.isMonetary
          ? [
              r.groupLabel,
              r.count,
              r.totalAmountNgn ?? 0,
              r.averageAmountNgn ?? 0,
              r.sharePct,
            ]
          : [r.groupLabel, r.count, r.sharePct],
      ),
    ];

    const csv = toCsvRows(csvRows);
    if (Buffer.byteLength(csv, "utf8") > MAX_REPORT_EXPORT_BYTES) {
      return jsonError(413, "This report exceeds the safe export limit.");
    }

    return new Response(csv, {
      headers: {
        ...RESPONSE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="custom-${spec.dataset}-${spec.period.from}.csv"`,
      },
    });
  }

  const narrative = includeAi
    ? await loadApprovedNarrativeForReport(
        supabase,
        "custom",
        result.scopeId,
        result.fingerprint,
      )
    : null;

  let pdfBytes: Uint8Array | null;
  try {
    pdfBytes = await renderReportPdf(
      createElement(CustomReportPdfDocument, {
        title: `Custom Report: ${summary.datasetLabel}`,
        subtitle,
        periodLabel: `${spec.period.from} to ${spec.period.to}`,
        generatedDate: getWATDate(),
        isMonetary: summary.isMonetary,
        metricLabel: summary.metricLabel,
        totalCount: summary.totalCount,
        totalAmountNgn: summary.totalAmountNgn,
        averageAmountNgn: summary.averageAmountNgn,
        rows,
        narrative,
      }),
    );
  } catch (err) {
    console.error(
      "[Custom Report PDF] Branded render failed, falling back:",
      err,
    );
    const lines = [
      `Dataset: ${summary.datasetLabel}`,
      `Period: ${spec.period.from} to ${spec.period.to}`,
      `Records matched: ${summary.totalCount}`,
      ...(summary.isMonetary
        ? [
            `Total Amount: NGN ${formatNgn(BigInt(summary.totalAmountNgn ?? 0))}`,
            `Average Amount: NGN ${formatNgn(BigInt(summary.averageAmountNgn ?? 0))}`,
          ]
        : []),
      "",
      ...rows.map((r) =>
        summary.isMonetary
          ? `${r.groupLabel} | Count: ${r.count} | Total: NGN ${formatNgn(BigInt(r.totalAmountNgn ?? 0))} (${r.sharePct}%)`
          : `${r.groupLabel} | Count: ${r.count} (${r.sharePct}%)`,
      ),
    ];
    pdfBytes = createSimplePdf(
      `${clubBrand.name} | Custom Report`,
      summary.datasetLabel,
      lines,
    );
  }

  if (!pdfBytes) {
    return jsonError(413, "This report exceeds the safe export limit.");
  }

  if (narrative) {
    await supabase.rpc("log_ai_report_event", {
      p_action: "ai_report_pdf_exported",
      p_report_type: "custom",
      p_narrative_id: narrative.id,
    });
  }

  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Response(pdfBuffer, {
    headers: {
      ...RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="custom-${spec.dataset}-${spec.period.from}.pdf"`,
    },
  });
}
