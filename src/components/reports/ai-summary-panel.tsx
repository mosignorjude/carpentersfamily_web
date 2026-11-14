"use client";

import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CfButton } from "@/components/ui";
import type { AiReportType } from "@/lib/ai/facts";
import type { AiNarrativeContent } from "@/lib/ai/grounding";
import type { ReportSpec } from "@/lib/ai/report-spec";

export interface ClientNarrativeDto {
  id: string;
  reportType: string;
  scopeId: string | null;
  periodStart: string;
  periodEnd: string;
  factsFingerprint: string;
  provider: string;
  model: string;
  content: AiNarrativeContent;
  status: "draft" | "approved" | "discarded";
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

export interface AiSummaryPanelProps {
  reportType: AiReportType;
  eventId?: string;
  period?: string;
  from?: string;
  to?: string;
  customSpec?: ReportSpec;
  aiEnabled: boolean;
  initialNarrative?: ClientNarrativeDto | null;
  title?: string;
  onNarrativeChange?: (narrative: ClientNarrativeDto | null) => void;
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-*]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function buildQueryParams(props: {
  reportType: AiReportType;
  eventId?: string;
  period?: string;
  from?: string;
  to?: string;
}) {
  const params = new URLSearchParams();
  params.set("reportType", props.reportType);
  if (props.eventId) params.set("eventId", props.eventId);
  if (props.period) params.set("period", props.period);
  if (props.from) params.set("from", props.from);
  if (props.to) params.set("to", props.to);
  return params.toString();
}

export function AiSummaryPanel({
  reportType,
  eventId,
  period,
  from,
  to,
  customSpec,
  aiEnabled,
  initialNarrative = null,
  title = "AI Report Summary",
  onNarrativeChange,
}: AiSummaryPanelProps) {
  const [narrative, setNarrative] = useState<ClientNarrativeDto | null>(
    initialNarrative,
  );
  const [loadingInitial, setLoadingInitial] = useState(
    initialNarrative === null && aiEnabled,
  );
  const [busyAction, setBusyAction] = useState<
    "generate" | "approve" | "regenerate" | "save" | null
  >(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [editHeadline, setEditHeadline] = useState("");
  const [editHighlights, setEditHighlights] = useState("");
  const [editRisks, setEditRisks] = useState("");
  const [editRecommendations, setEditRecommendations] = useState("");

  const syncEditFields = useCallback((item: ClientNarrativeDto | null) => {
    if (!item) return;
    setEditHeadline(item.content.headline);
    setEditHighlights(item.content.highlights.join("\n"));
    setEditRisks(item.content.risks.join("\n"));
    setEditRecommendations(item.content.recommendations.join("\n"));
  }, []);

  useEffect(() => {
    if (initialNarrative !== null) {
      setNarrative(initialNarrative);
      setLoadingInitial(false);
      syncEditFields(initialNarrative);
      return;
    }
    if (!aiEnabled || reportType === "custom") {
      setLoadingInitial(false);
      return;
    }

    let cancelled = false;
    setLoadingInitial(true);
    const query = buildQueryParams({ reportType, eventId, period, from, to });

    fetch(`/api/ai-reports?${query}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { narrative?: ClientNarrativeDto | null };
      })
      .then((payload) => {
        if (cancelled) return;
        const found = payload?.narrative ?? null;
        setNarrative(found);
        syncEditFields(found);
      })
      .catch(() => {
        // Silent fetch failure on initial mount; user can still trigger generation.
      })
      .finally(() => {
        if (!cancelled) setLoadingInitial(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    aiEnabled,
    eventId,
    from,
    initialNarrative,
    period,
    reportType,
    syncEditFields,
    to,
  ]);

  if (!aiEnabled) {
    return null;
  }

  const handleGenerate = async () => {
    setErrorMsg(null);
    setBusyAction("generate");
    try {
      const response = await fetch("/api/ai-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          ...(eventId ? { eventId } : {}),
          ...(period ? { period } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(customSpec ? { customSpec } : {}),
        }),
      });
      const payload = (await response.json()) as {
        narrative?: ClientNarrativeDto | null;
        error?: string;
      };
      if (!response.ok || !payload.narrative) {
        setErrorMsg(
          payload.error ||
            "AI summary unavailable right now. You can still download the PDF.",
        );
        return;
      }
      setNarrative(payload.narrative);
      onNarrativeChange?.(payload.narrative);
      syncEditFields(payload.narrative);
      setIsEditing(false);
    } catch {
      setErrorMsg(
        "AI summary unavailable right now. You can still download the PDF.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprove = async () => {
    if (!narrative) return;
    setErrorMsg(null);
    setBusyAction("approve");
    try {
      const response = await fetch(
        `/api/ai-reports/${encodeURIComponent(narrative.id)}/approve`,
        {
          method: "POST",
          ...(customSpec
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customSpec }),
              }
            : {}),
        },
      );
      const payload = (await response.json()) as {
        narrative?: ClientNarrativeDto | null;
        error?: string;
      };
      if (!response.ok || !payload.narrative) {
        setErrorMsg(payload.error || "Could not approve this summary.");
        return;
      }
      setNarrative(payload.narrative);
      onNarrativeChange?.(payload.narrative);
      syncEditFields(payload.narrative);
    } catch {
      setErrorMsg("Could not approve this summary.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegenerate = async () => {
    if (!narrative) return;
    setErrorMsg(null);
    setBusyAction("regenerate");
    try {
      const response = await fetch(
        `/api/ai-reports/${encodeURIComponent(narrative.id)}/regenerate`,
        {
          method: "POST",
          ...(customSpec
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customSpec }),
              }
            : {}),
        },
      );
      const payload = (await response.json()) as {
        narrative?: ClientNarrativeDto | null;
        error?: string;
      };
      if (!response.ok || !payload.narrative) {
        setErrorMsg(payload.error || "Could not regenerate AI summary.");
        return;
      }
      setNarrative(payload.narrative);
      onNarrativeChange?.(payload.narrative);
      syncEditFields(payload.narrative);
      setIsEditing(false);
    } catch {
      setErrorMsg("Could not regenerate AI summary.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!narrative) return;
    setErrorMsg(null);
    setBusyAction("save");
    try {
      const response = await fetch(
        `/api/ai-reports/${encodeURIComponent(narrative.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              headline: editHeadline.trim(),
              highlights: splitLines(editHighlights),
              risks: splitLines(editRisks),
              recommendations: splitLines(editRecommendations),
            },
            ...(customSpec ? { customSpec } : {}),
          }),
        },
      );
      const payload = (await response.json()) as {
        narrative?: ClientNarrativeDto | null;
        error?: string;
      };
      if (!response.ok || !payload.narrative) {
        setErrorMsg(payload.error || "Could not save edited summary.");
        return;
      }
      setNarrative(payload.narrative);
      onNarrativeChange?.(payload.narrative);
      syncEditFields(payload.narrative);
      setIsEditing(false);
    } catch {
      setErrorMsg("Could not save edited summary.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section
      aria-label={title}
      className="bg-white rounded-xl border border-[#E5DDD3] p-4 sm:p-5 shadow-2xs space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#174C37] shrink-0" />
            <h2 className="text-sm sm:text-base font-bold text-[#3D291F]">
              {title}
            </h2>
          </div>
          <p className="text-xs text-[#5C4638]">
            Officer-only draft generated from anonymised totals · Reviewed by an
            officer before appearing in PDFs
          </p>
        </div>

        {!narrative && !loadingInitial && (
          <CfButton
            disabled={busyAction !== null}
            loading={busyAction === "generate"}
            loadingText="Drafting summary…"
            onClick={handleGenerate}
            size="compact"
            variant="primary"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F0C768] shrink-0" />
            <span>Generate AI summary</span>
          </CfButton>
        )}
      </div>

      {errorMsg && (
        <div
          className="p-3 rounded-[10px] bg-[#FFF9F8] border border-[#F5C2C2] text-xs font-medium text-[#BA3C2A] flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loadingInitial && (
        <div className="p-4 rounded-[10px] bg-[#FAF6F0] border border-[#E5DDD3] animate-pulse space-y-2">
          <div className="h-3.5 w-2/3 bg-[#E5DDD3] rounded" />
          <div className="h-3 w-full bg-[#E5DDD3] rounded" />
          <div className="h-3 w-5/6 bg-[#E5DDD3] rounded" />
        </div>
      )}

      {!loadingInitial && narrative && (
        <div className="rounded-[10px] bg-[#FAF6F0] border border-[#E5DDD3] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E5DDD3]">
            {narrative.status === "approved" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EAF4EE] border border-[#BBDAC6] text-[#174C37] text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Approved · Included in PDFs (Reviewed by{" "}
                  {narrative.approvedByName || "Officer"}
                  {narrative.approvedAt ? `, ${narrative.approvedAt}` : ""})
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FDF8EE] border border-[#EED7A1] text-[#8D5B0E] text-xs font-semibold">
                <span>Draft — not included in PDFs until approved</span>
              </span>
            )}

            <span className="text-xs font-mono text-[#5C4638]">
              {narrative.provider} · {narrative.model}
            </span>
          </div>

          {!isEditing ? (
            <div className="space-y-3 text-sm text-[#3D291F] max-w-4xl">
              <p className="font-bold leading-snug">
                {narrative.content.headline}
              </p>

              {narrative.content.highlights.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#174C37] mb-1">
                    Highlights
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 text-xs sm:text-[13px] text-[#3D291F] leading-relaxed">
                    {narrative.content.highlights.map((line) => (
                      <li key={`h:${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {narrative.content.risks.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#8D5B0E] mb-1">
                    Watchpoints
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 text-xs sm:text-[13px] text-[#3D291F] leading-relaxed">
                    {narrative.content.risks.map((line) => (
                      <li key={`r:${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              {narrative.content.recommendations.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-[#5C4638] mb-1">
                    Recommendations
                  </h3>
                  <ul className="list-disc pl-4 space-y-1 text-xs sm:text-[13px] text-[#3D291F] leading-relaxed">
                    {narrative.content.recommendations.map((line) => (
                      <li key={`rec:${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E5DDD3]">
                {narrative.status !== "approved" && (
                  <CfButton
                    disabled={busyAction !== null}
                    loading={busyAction === "approve"}
                    loadingText="Approving…"
                    onClick={handleApprove}
                    size="compact"
                    variant="primary"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Approve</span>
                  </CfButton>
                )}

                <CfButton
                  disabled={busyAction !== null}
                  onClick={() => {
                    syncEditFields(narrative);
                    setIsEditing(true);
                  }}
                  size="compact"
                  variant="secondary"
                >
                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                  <span>Edit</span>
                </CfButton>

                <CfButton
                  disabled={busyAction !== null}
                  loading={busyAction === "regenerate"}
                  loadingText="Regenerating…"
                  onClick={handleRegenerate}
                  size="compact"
                  variant="secondary"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Regenerate</span>
                </CfButton>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                  htmlFor={`ai-headline-${reportType}`}
                >
                  Headline
                </label>
                <input
                  className="w-full min-h-[44px] px-3 py-2 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                  id={`ai-headline-${reportType}`}
                  maxLength={220}
                  onChange={(e) => setEditHeadline(e.target.value)}
                  type="text"
                  value={editHeadline}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                  htmlFor={`ai-highlights-${reportType}`}
                >
                  Highlights (one per line, up to 5)
                </label>
                <textarea
                  className="w-full min-h-[88px] px-3 py-2 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                  id={`ai-highlights-${reportType}`}
                  onChange={(e) => setEditHighlights(e.target.value)}
                  rows={3}
                  value={editHighlights}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                  htmlFor={`ai-risks-${reportType}`}
                >
                  Watchpoints (one per line, up to 4)
                </label>
                <textarea
                  className="w-full min-h-[72px] px-3 py-2 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                  id={`ai-risks-${reportType}`}
                  onChange={(e) => setEditRisks(e.target.value)}
                  rows={2}
                  value={editRisks}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-bold text-[#3D291F] mb-1"
                  htmlFor={`ai-recs-${reportType}`}
                >
                  Recommendations (one per line, up to 3)
                </label>
                <textarea
                  className="w-full min-h-[72px] px-3 py-2 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37]"
                  id={`ai-recs-${reportType}`}
                  onChange={(e) => setEditRecommendations(e.target.value)}
                  rows={2}
                  value={editRecommendations}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <CfButton
                  disabled={busyAction !== null}
                  loading={busyAction === "save"}
                  loadingText="Saving…"
                  onClick={handleSaveEdit}
                  size="compact"
                  variant="primary"
                >
                  <span>Save Draft</span>
                </CfButton>
                <CfButton
                  disabled={busyAction !== null}
                  onClick={() => setIsEditing(false)}
                  size="compact"
                  variant="secondary"
                >
                  <span>Cancel</span>
                </CfButton>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
