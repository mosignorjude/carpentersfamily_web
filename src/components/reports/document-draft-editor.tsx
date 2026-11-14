"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DocumentDraftSection,
  DocumentDraftType,
  FormalDocumentDraftContent,
} from "@/lib/ai/document-drafts";
import { formatNaira } from "@/lib/format";
import type { AgmComparisonRow } from "@/lib/reports/drafts-core";

export interface MeetingDraftOption {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
}

interface DraftDto {
  id: string;
  reportType: DocumentDraftType;
  scopeId: string | null;
  periodStart: string;
  periodEnd: string;
  factsFingerprint: string;
  provider: string;
  model: string;
  content: FormalDocumentDraftContent;
  status: "draft" | "approved" | "discarded";
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

interface MinutesMeetingContext {
  id: string;
  title: string;
  startsAt: string;
  durationDays: number;
  location: string | null;
  publishedRevision: number | null;
  publishedUpdatedAt: string | null;
  publishedContent: string | null;
  attendanceCounts: {
    present: number;
    late: number;
    absent: number;
    excused: number;
    total: number;
  };
}

interface TreasurerFactsPreview {
  period_label: string;
  period: string;
  treasury_totals: {
    total_inflows_ngn: number;
    total_outflows_ngn: number;
    net_period_cash_flow_ngn: number;
    closing_club_balance_ngn: number;
  };
  dues: {
    active_members: number;
    collection_rate_pct: number;
    owed_through_end_ngn: number;
    overdue_three_plus_members: number;
  };
}

interface DocumentDraftEditorProps {
  aiEnabled: boolean;
  defaultYear: number;
  defaultPeriodParam: string;
  currentMonthParam: string;
  previousMonthParam: string;
  meetings: MeetingDraftOption[];
  initialDocType?: DocumentDraftType;
  initialMeetingId?: string;
}

const DOC_TABS: ReadonlyArray<{
  key: DocumentDraftType;
  label: string;
  subtitle: string;
}> = [
  {
    key: "agm_statement",
    label: "AGM Financial Statement",
    subtitle: "Comparative year-on-year statement + AI AGM commentary",
  },
  {
    key: "treasurer_report",
    label: "Treasurer's Report",
    subtitle: "First-person treasury briefing + official signature block",
  },
  {
    key: "minutes",
    label: "Meeting Minutes",
    subtitle: "Privacy-masked notes → structured minutes → Meeting Hub",
  },
];

function formatYearMetric(
  value: number,
  unit: AgmComparisonRow["unit"],
): string {
  if (unit === "NGN") return formatNaira(value);
  if (unit === "PCT") return `${value}%`;
  return String(value);
}

function buildRecentPeriodChoices(
  defaultYear: number,
  currentMonthParam: string,
  previousMonthParam: string,
): Array<{ param: string; label: string }> {
  const choices: Array<{ param: string; label: string }> = [];
  const seen = new Set<string>();
  const add = (param: string, label: string) => {
    if (!seen.has(param)) {
      seen.add(param);
      choices.push({ param, label });
    }
  };

  add(currentMonthParam, `Current Month (${currentMonthParam.slice(6)})`);
  add(previousMonthParam, `Previous Month (${previousMonthParam.slice(6)})`);
  add(`year:${defaultYear}`, `Full Year ${defaultYear}`);
  add(`year:${defaultYear - 1}`, `Full Year ${defaultYear - 1}`);

  for (let m = 1; m <= 12; m += 1) {
    const mm = String(m).padStart(2, "0");
    const param = `month:${defaultYear}-${mm}`;
    add(param, `${defaultYear}-${mm}`);
  }
  return choices;
}

export function DocumentDraftEditor({
  aiEnabled,
  defaultYear,
  defaultPeriodParam,
  currentMonthParam,
  previousMonthParam,
  meetings,
  initialDocType = "agm_statement",
  initialMeetingId,
}: DocumentDraftEditorProps) {
  const [docType, setDocType] = useState<DocumentDraftType>(initialDocType);
  const [fiscalYear, setFiscalYear] = useState<number>(defaultYear);
  const [treasurerPeriod, setTreasurerPeriod] =
    useState<string>(defaultPeriodParam);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>(
    initialMeetingId && meetings.some((m) => m.id === initialMeetingId)
      ? initialMeetingId
      : (meetings[0]?.id ?? ""),
  );

  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [comparisonRows, setComparisonRows] = useState<AgmComparisonRow[]>([]);
  const [treasurerFacts, setTreasurerFacts] =
    useState<TreasurerFactsPreview | null>(null);
  const [meetingCtx, setMeetingCtx] = useState<MinutesMeetingContext | null>(
    null,
  );

  // Editable draft form fields
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editSections, setEditSections] = useState<DocumentDraftSection[]>([]);
  const [editRecsText, setEditRecsText] = useState("");
  const [dirtyEdits, setDirtyEdits] = useState(false);

  // Meeting minutes notes & privacy preview state
  const [rawNotes, setRawNotes] = useState("");
  const [previewMaskedText, setPreviewMaskedText] = useState("");
  const [previewStats, setPreviewStats] = useState<{
    membersMatched: number;
    sharedNamesMatched: number;
    emailsMasked: number;
    phonesMasked: number;
    handlesMasked: number;
  } | null>(null);
  const [showMaskedPreview, setShowMaskedPreview] = useState(false);
  const [publishReason, setPublishReason] = useState(
    "Structured via AI Minutes Assistant",
  );
  const [publishedResult, setPublishedResult] = useState<{
    revisionNumber: number;
    redirectUrl: string;
  } | null>(null);

  const periodChoices = useMemo(
    () =>
      buildRecentPeriodChoices(
        defaultYear,
        currentMonthParam,
        previousMonthParam,
      ),
    [defaultYear, currentMonthParam, previousMonthParam],
  );

  const yearChoices = useMemo(
    () => [defaultYear, defaultYear - 1, defaultYear - 2],
    [defaultYear],
  );

  const syncFormFromDraft = useCallback((nextDraft: DraftDto | null) => {
    setDraft(nextDraft);
    setDirtyEdits(false);
    if (!nextDraft) {
      setEditTitle("");
      setEditSummary("");
      setEditSections([]);
      setEditRecsText("");
      return;
    }
    setEditTitle(nextDraft.content.title);
    setEditSummary(nextDraft.content.summary);
    setEditSections(nextDraft.content.sections);
    setEditRecsText(nextDraft.content.recommendations.join("\n"));
  }, []);

  const loadScope = useCallback(async () => {
    setError(null);
    setNotice(null);
    setPublishedResult(null);

    if (docType === "minutes" && !selectedMeetingId) {
      syncFormFromDraft(null);
      setMeetingCtx(null);
      return;
    }

    const params = new URLSearchParams({ reportType: docType });
    if (docType === "agm_statement") {
      params.set("year", String(fiscalYear));
    } else if (docType === "treasurer_report") {
      params.set("period", treasurerPeriod);
    } else {
      params.set("eventId", selectedMeetingId);
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/ai-reports/drafts?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not load document drafting data.");
        syncFormFromDraft(null);
        return;
      }

      if (docType === "agm_statement") {
        setComparisonRows(json.comparisonRows ?? []);
      } else if (docType === "treasurer_report") {
        setTreasurerFacts(json.facts ?? null);
      } else {
        setMeetingCtx(json.meeting ?? null);
      }
      syncFormFromDraft(json.draft ?? null);
    } catch {
      setError("Network error while loading drafting workspace.");
    } finally {
      setLoading(false);
    }
  }, [
    docType,
    fiscalYear,
    treasurerPeriod,
    selectedMeetingId,
    syncFormFromDraft,
  ]);

  useEffect(() => {
    void loadScope();
  }, [loadScope]);

  useEffect(() => {
    if (selectedMeetingId === undefined) return;
    setRawNotes("");
    setPreviewMaskedText("");
    setPreviewStats(null);
    setShowMaskedPreview(false);
  }, [selectedMeetingId]);

  const handlePreviewMaskedNotes = async () => {
    if (!selectedMeetingId) return;
    setError(null);
    setNotice(null);
    setWorking(true);
    try {
      const res = await fetch("/api/ai-reports/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview_minutes",
          eventId: selectedMeetingId,
          rawNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not generate privacy preview.");
        return;
      }
      setPreviewMaskedText(json.maskedText);
      setPreviewStats(json.stats);
      setShowMaskedPreview(true);
    } catch {
      setError("Network error while previewing masked text.");
    } finally {
      setWorking(false);
    }
  };

  const handleGenerate = async (regenerateExisting = false) => {
    setError(null);
    setNotice(null);
    setPublishedResult(null);
    setWorking(true);
    try {
      let res: Response;
      if (regenerateExisting && draft) {
        const body =
          docType === "minutes"
            ? {
                rawNotes,
                ...(showMaskedPreview && previewMaskedText.trim()
                  ? { preparedMaskedNotes: previewMaskedText }
                  : {}),
              }
            : {};
        res = await fetch(`/api/ai-reports/drafts/${draft.id}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const payload: Record<string, unknown> = {
          action: "generate",
          reportType: docType,
        };
        if (docType === "agm_statement") payload.year = fiscalYear;
        if (docType === "treasurer_report") payload.period = treasurerPeriod;
        if (docType === "minutes") {
          payload.eventId = selectedMeetingId;
          payload.rawNotes = rawNotes;
          if (showMaskedPreview && previewMaskedText.trim()) {
            payload.preparedMaskedNotes = previewMaskedText;
          }
        }
        res = await fetch("/api/ai-reports/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not generate document draft.");
        return;
      }

      syncFormFromDraft(json.draft ?? null);
      setNotice(
        json.cached
          ? "Loaded existing grounded draft for this scope."
          : "Generated a new AI draft ready for review.",
      );
    } catch {
      setError("Network error while generating document draft.");
    } finally {
      setWorking(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!draft) return;
    setError(null);
    setNotice(null);
    setWorking(true);

    const recs = editRecsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/ai-reports/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            title: editTitle.trim(),
            summary: editSummary.trim(),
            sections: editSections,
            recommendations: recs,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not save draft edits.");
        return;
      }
      syncFormFromDraft(json.draft ?? null);
      setNotice("Saved edits as draft. Review and approve when ready.");
    } catch {
      setError("Network error while saving edits.");
    } finally {
      setWorking(false);
    }
  };

  const handleApprove = async () => {
    if (!draft || dirtyEdits) return;
    setError(null);
    setNotice(null);
    setWorking(true);
    try {
      const res = await fetch(`/api/ai-reports/drafts/${draft.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not approve document draft.");
        return;
      }
      syncFormFromDraft(json.draft ?? null);
      setNotice("Document approved and ready for official PDF export.");
    } catch {
      setError("Network error while approving draft.");
    } finally {
      setWorking(false);
    }
  };

  const handlePublishMinutes = async () => {
    if (draft?.reportType !== "minutes" || dirtyEdits) return;
    setError(null);
    setNotice(null);
    setWorking(true);
    try {
      const res = await fetch(
        `/api/ai-reports/drafts/${draft.id}/publish-minutes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: publishReason }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not publish minutes to Meeting Hub.");
        return;
      }
      setPublishedResult({
        revisionNumber: json.revisionNumber,
        redirectUrl: json.redirectUrl,
      });
      setNotice(
        `Minutes saved to Meeting Hub (Revision ${json.revisionNumber}).`,
      );
      await loadScope();
    } catch {
      setError("Network error while publishing minutes.");
    } finally {
      setWorking(false);
    }
  };

  const pdfDownloadHref = useMemo(() => {
    const p = new URLSearchParams({ reportType: docType, includeAi: "true" });
    if (docType === "agm_statement") p.set("year", String(fiscalYear));
    else if (docType === "treasurer_report") p.set("period", treasurerPeriod);
    else if (selectedMeetingId) p.set("eventId", selectedMeetingId);
    return `/api/reports/drafts?${p.toString()}`;
  }, [docType, fiscalYear, treasurerPeriod, selectedMeetingId]);

  const unresolvedTokens = draft?.content.unresolvedTokens ?? [];

  const updateSectionBody = (key: string, body: string) => {
    setDirtyEdits(true);
    setEditSections((prev) =>
      prev.map((sec) => (sec.key === key ? { ...sec, body } : sec)),
    );
  };

  return (
    <section
      aria-labelledby="document-drafting-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-4 sm:p-6 shadow-xs space-y-5"
      id="document-drafting"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-[#E5DDD3]">
        <div>
          <h2
            className="text-lg font-extrabold text-[#3D291F] tracking-tight"
            id="document-drafting-heading"
          >
            AGM, Treasurer &amp; Meeting Minutes Drafter
          </h2>
          <p className="text-xs sm:text-sm text-[#5C4638] mt-1">
            Draft structured formal reports from verified figures or
            privacy-masked meeting notes. Nothing enters official PDFs or
            Meeting Hub until an officer approves it.
          </p>
        </div>

        {(docType !== "minutes" ||
          Boolean(draft?.status === "approved") ||
          Boolean(meetingCtx?.publishedContent)) && (
          <a
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-[10px] bg-[#0C3325] text-white text-xs sm:text-sm font-bold hover:bg-[#174C37] transition-colors shrink-0 whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
            href={pdfDownloadHref}
          >
            <FileText className="w-4 h-4 text-[#D6A23A] shrink-0" />
            <span>
              Download{" "}
              {docType === "agm_statement"
                ? "AGM"
                : docType === "treasurer_report"
                  ? "Treasurer"
                  : "Minutes"}{" "}
              PDF
            </span>
          </a>
        )}
      </div>

      {/* Document Type Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {DOC_TABS.map((tab) => {
          const active = docType === tab.key;
          return (
            <button
              key={tab.key}
              aria-pressed={active}
              className={`text-left min-h-[56px] p-3.5 rounded-[10px] border transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30 ${
                active
                  ? "bg-[#0C3325] text-white border-[#0C3325]"
                  : "bg-[#FAF6F0] text-[#3D291F] border-[#E5DDD3] hover:border-[#174C37]/50"
              }`}
              onClick={() => {
                setDocType(tab.key);
                setShowMaskedPreview(false);
              }}
              type="button"
            >
              <div className="text-sm font-extrabold">{tab.label}</div>
              <div
                className={`text-xs mt-0.5 ${
                  active ? "text-[#FAF6F0]/85" : "text-[#5C4638]"
                }`}
              >
                {tab.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Scope Controls per Document Type */}
      <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] p-4 space-y-3">
        {docType === "agm_statement" && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 w-full sm:w-auto">
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#5C4638]"
                htmlFor="agm-year-select"
              >
                Financial Year (Compared vs Prior FY)
              </label>
              <select
                className="mt-1.5 w-full sm:w-auto max-w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                id="agm-year-select"
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                value={fiscalYear}
              >
                {yearChoices.map((yr) => (
                  <option key={yr} value={yr}>
                    FY {yr} (vs FY {yr - 1})
                  </option>
                ))}
              </select>
            </div>

            {aiEnabled && (
              <button
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-[10px] bg-[#174C37] text-white text-xs sm:text-sm font-bold hover:bg-[#0C3325] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
                disabled={working || loading}
                onClick={() => void handleGenerate(Boolean(draft))}
                type="button"
              >
                {working ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : draft ? (
                  <RefreshCw className="w-4 h-4 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-[#D6A23A] shrink-0" />
                )}
                <span>
                  {draft
                    ? "Regenerate AGM Draft"
                    : "Draft AGM Financial Statement"}
                </span>
              </button>
            )}
          </div>
        )}

        {docType === "treasurer_report" && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 w-full sm:w-auto">
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#5C4638]"
                htmlFor="treasurer-period-select"
              >
                Reporting Period
              </label>
              <select
                className="mt-1.5 w-full sm:w-auto max-w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                id="treasurer-period-select"
                onChange={(e) => setTreasurerPeriod(e.target.value)}
                value={treasurerPeriod}
              >
                {periodChoices.map((opt) => (
                  <option key={opt.param} value={opt.param}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {aiEnabled && (
              <button
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-[10px] bg-[#174C37] text-white text-xs sm:text-sm font-bold hover:bg-[#0C3325] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
                disabled={working || loading}
                onClick={() => void handleGenerate(Boolean(draft))}
                type="button"
              >
                {working ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : draft ? (
                  <RefreshCw className="w-4 h-4 shrink-0" />
                ) : (
                  <Sparkles className="w-4 h-4 text-[#D6A23A] shrink-0" />
                )}
                <span>
                  {draft
                    ? "Regenerate Treasurer Draft"
                    : "Draft Treasurer's Report"}
                </span>
              </button>
            )}
          </div>
        )}

        {docType === "minutes" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex-1 min-w-[220px]">
                <label
                  className="block text-xs font-bold uppercase tracking-wider text-[#5C4638]"
                  htmlFor="minutes-meeting-select"
                >
                  Select Club Meeting
                </label>
                {meetings.length === 0 ? (
                  <p className="text-xs text-[#5C4638] mt-1">
                    No active meetings with minutes enabled were found. Create a
                    meeting in the Meeting Hub first.
                  </p>
                ) : (
                  <select
                    className="mt-1.5 w-full max-w-md min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                    id="minutes-meeting-select"
                    onChange={(e) => {
                      setSelectedMeetingId(e.target.value);
                      setShowMaskedPreview(false);
                      setPreviewMaskedText("");
                    }}
                    value={selectedMeetingId}
                  >
                    {meetings.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.startsAt.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {meetingCtx && (
                <div className="text-xs text-[#5C4638] flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white border border-[#E5DDD3] font-semibold">
                    Attendance: {meetingCtx.attendanceCounts.present} present,{" "}
                    {meetingCtx.attendanceCounts.late} late
                  </span>
                  {meetingCtx.publishedRevision ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#174C37]/10 text-[#174C37] font-bold">
                      Published Rev {meetingCtx.publishedRevision}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {selectedMeetingId && (
              <div className="space-y-3">
                <div>
                  <label
                    className="block text-xs font-bold uppercase tracking-wider text-[#5C4638] mb-1.5"
                    htmlFor="minutes-raw-notes"
                  >
                    Officer Meeting Notes (stays private on club server — names
                    masked automatically before AI)
                  </label>
                  <textarea
                    className="w-full h-36 p-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="minutes-raw-notes"
                    maxLength={15000}
                    onChange={(e) => {
                      setRawNotes(e.target.value);
                      setShowMaskedPreview(false);
                    }}
                    placeholder="Enter rough bullet points from the meeting: attendees, agenda topics, key discussion points, motions passed, and action owners..."
                    value={rawNotes}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-[10px] border border-[#174C37]/40 bg-white text-[#174C37] text-xs sm:text-sm font-bold hover:bg-[#FAF6F0] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                    disabled={working || rawNotes.trim().length < 10}
                    onClick={() => void handlePreviewMaskedNotes()}
                    type="button"
                  >
                    <Eye className="w-4 h-4 shrink-0" />
                    <span>What the AI Will See</span>
                  </button>

                  {aiEnabled && (
                    <button
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[#174C37] text-white text-xs sm:text-sm font-bold hover:bg-[#0C3325] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
                      disabled={working || rawNotes.trim().length < 10}
                      onClick={() => void handleGenerate(Boolean(draft))}
                      type="button"
                    >
                      {working ? (
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-[#D6A23A] shrink-0" />
                      )}
                      <span>
                        {draft
                          ? "Re-structure Minutes Draft"
                          : "Draft Structured Minutes"}
                      </span>
                    </button>
                  )}
                </div>

                {showMaskedPreview && (
                  <div className="p-3.5 rounded-xl bg-white border border-[#174C37]/40 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-[#174C37] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>
                          Privacy Preview — Exact Text Sent to AI (editable to
                          mask non-member guests by hand)
                        </span>
                      </span>
                      {previewStats && (
                        <span className="text-xs text-[#5C4638]">
                          Masked: {previewStats.membersMatched} member tokens,{" "}
                          {previewStats.emailsMasked} emails,{" "}
                          {previewStats.phonesMasked} phones,{" "}
                          {previewStats.handlesMasked} handles
                        </span>
                      )}
                    </div>
                    <textarea
                      aria-label="What the AI will see"
                      className="w-full h-32 p-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0] font-mono text-xs text-[#3D291F] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                      maxLength={15000}
                      onChange={(e) => setPreviewMaskedText(e.target.value)}
                      value={previewMaskedText}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Deterministic Fact Summary Strip for AGM & Treasurer */}
      {docType === "agm_statement" && comparisonRows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#E5DDD3]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0C3325] text-white">
                <th className="py-2 px-3 font-bold">Comparative Statement</th>
                <th className="py-2 px-3 font-bold text-right">
                  FY {fiscalYear}
                </th>
                <th className="py-2 px-3 font-bold text-right">
                  FY {fiscalYear - 1}
                </th>
                <th className="py-2 px-3 font-bold text-right">YoY Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD3]">
              {comparisonRows.map((row) => (
                <tr key={row.lineItem} className="even:bg-[#FAF6F0]/60">
                  <td className="py-2 px-3 font-semibold text-[#3D291F]">
                    {row.lineItem}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#3D291F]">
                    {formatYearMetric(row.currentValue, row.unit)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#5C4638]">
                    {formatYearMetric(row.priorValue, row.unit)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-[#174C37]">
                    {formatYearMetric(row.varianceValue, row.unit)}
                    {row.variancePct !== null
                      ? ` (${row.variancePct > 0 ? "+" : ""}${row.variancePct}%)`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {docType === "treasurer_report" && treasurerFacts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="text-xs font-bold uppercase text-[#5C4638]">
              Closing Balance
            </div>
            <div className="text-sm font-extrabold text-[#174C37] font-mono tabular-nums mt-0.5">
              {formatNaira(
                treasurerFacts.treasury_totals.closing_club_balance_ngn,
              )}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="text-xs font-bold uppercase text-[#5C4638]">
              Period Inflows
            </div>
            <div className="text-sm font-extrabold text-[#3D291F] font-mono tabular-nums mt-0.5">
              {formatNaira(treasurerFacts.treasury_totals.total_inflows_ngn)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="text-xs font-bold uppercase text-[#5C4638]">
              Period Outflows
            </div>
            <div className="text-sm font-extrabold text-[#BA3C2A] font-mono tabular-nums mt-0.5">
              {formatNaira(treasurerFacts.treasury_totals.total_outflows_ngn)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="text-xs font-bold uppercase text-[#5C4638]">
              Dues Collection
            </div>
            <div className="text-sm font-extrabold text-[#174C37] font-mono tabular-nums mt-0.5">
              {treasurerFacts.dues.collection_rate_pct}%
            </div>
          </div>
        </div>
      )}

      {/* Feedback Alerts */}
      {error && (
        <div
          className="p-3 rounded-xl bg-[#BA3C2A]/10 border border-[#BA3C2A]/30 text-xs font-semibold text-[#BA3C2A]"
          role="alert"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          className="p-3 rounded-xl bg-[#174C37]/10 border border-[#174C37]/30 text-xs font-semibold text-[#174C37] flex flex-wrap items-center justify-between gap-2"
          role="status"
        >
          <span>{notice}</span>
          {publishedResult && (
            <Link
              className="underline font-bold"
              href={publishedResult.redirectUrl}
            >
              Open in Meeting Hub →
            </Link>
          )}
        </div>
      )}

      {/* Unresolved Placeholder Warning for Minutes */}
      {unresolvedTokens.length > 0 && (
        <div
          className="p-3.5 rounded-xl bg-[#D6A23A]/15 border border-[#D6A23A] text-xs text-[#3D291F] space-y-1"
          role="alert"
        >
          <div className="font-extrabold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-[#8D5B0E] shrink-0" />
            <span>
              Unresolved placeholder tokens detected — edit before approving or
              publishing:
            </span>
          </div>
          <div className="font-mono text-xs font-bold text-[#8D5B0E]">
            {unresolvedTokens.join(" · ")}
          </div>
        </div>
      )}

      {/* Section-by-Section Editor */}
      {loading ? (
        <div className="p-6 text-center text-xs sm:text-sm text-[#5C4638]">
          Loading document workspace...
        </div>
      ) : draft ? (
        <div className="space-y-4 pt-3 border-t border-[#E5DDD3]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {draft.status === "approved" ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#174C37]/10 text-[#174C37] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Approved by {draft.approvedByName} ({draft.approvedAt})
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#D6A23A]/20 text-[#8D5B0E] font-bold">
                  Draft — not included in official PDFs or Meeting Hub until
                  approved
                </span>
              )}
              <span className="text-xs text-[#5C4638]">
                Model: {draft.provider} ({draft.model})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#5C4638] mb-1.5"
                htmlFor="draft-title-input"
              >
                Document Title
              </label>
              <input
                className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0]/50 text-sm font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                id="draft-title-input"
                maxLength={160}
                onChange={(e) => {
                  setDirtyEdits(true);
                  setEditTitle(e.target.value);
                }}
                value={editTitle}
              />
            </div>

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#5C4638] mb-1.5"
                htmlFor="draft-summary-input"
              >
                Executive Summary / Opening Note
              </label>
              <textarea
                className="w-full h-24 p-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0]/50 text-sm text-[#3D291F] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                id="draft-summary-input"
                maxLength={800}
                onChange={(e) => {
                  setDirtyEdits(true);
                  setEditSummary(e.target.value);
                }}
                value={editSummary}
              />
            </div>

            {editSections.map((section) => {
              const hasUnresolved = unresolvedTokens.some((tok) =>
                section.body.includes(tok),
              );
              return (
                <div key={section.key}>
                  <label
                    className="block text-xs font-bold uppercase tracking-wider text-[#5C4638] mb-1.5"
                    htmlFor={`draft-sec-${section.key}`}
                  >
                    {section.heading}
                    {hasUnresolved && (
                      <span className="ml-2 text-[#BA3C2A]">
                        (Contains unresolved token)
                      </span>
                    )}
                  </label>
                  <textarea
                    className={`w-full h-28 p-3 rounded-[10px] border text-sm text-[#3D291F] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30 ${
                      hasUnresolved
                        ? "border-[#BA3C2A] bg-[#BA3C2A]/5"
                        : "border-[#E5DDD3] bg-white"
                    }`}
                    id={`draft-sec-${section.key}`}
                    maxLength={3500}
                    onChange={(e) =>
                      updateSectionBody(section.key, e.target.value)
                    }
                    value={section.body}
                  />
                </div>
              );
            })}

            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider text-[#5C4638] mb-1.5"
                htmlFor="draft-recs-input"
              >
                Recommendations / Notes (one per line, optional)
              </label>
              <textarea
                className="w-full h-24 p-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                id="draft-recs-input"
                onChange={(e) => {
                  setDirtyEdits(true);
                  setEditRecsText(e.target.value);
                }}
                value={editRecsText}
              />
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-[10px] border border-[#E5DDD3] bg-white text-xs sm:text-sm font-bold text-[#3D291F] hover:bg-[#FAF6F0] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                disabled={working || !dirtyEdits}
                onClick={() => void handleSaveEdits()}
                type="button"
              >
                Save Edits as Draft
              </button>

              {draft.status !== "approved" && (
                <button
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[#174C37] text-white text-xs sm:text-sm font-bold hover:bg-[#0C3325] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
                  disabled={
                    working || dirtyEdits || unresolvedTokens.length > 0
                  }
                  onClick={() => void handleApprove()}
                  type="button"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Approve Draft</span>
                </button>
              )}
            </div>

            {docType === "minutes" &&
              draft.status === "approved" &&
              !dirtyEdits &&
              unresolvedTokens.length === 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Revision reason for Meeting Hub"
                    className="min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-white text-sm text-[#3D291F] w-full sm:w-64 focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/30"
                    maxLength={500}
                    onChange={(e) => setPublishReason(e.target.value)}
                    placeholder="Reason for Meeting Hub revision"
                    value={publishReason}
                  />
                  <button
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-[10px] bg-[#0C3325] text-white text-xs sm:text-sm font-bold hover:bg-[#174C37] disabled:opacity-50 cursor-pointer whitespace-nowrap focus:outline-hidden focus:ring-2 focus:ring-[#174C37]/40"
                    disabled={working}
                    onClick={() => void handlePublishMinutes()}
                    type="button"
                  >
                    <Send className="w-4 h-4 text-[#D6A23A] shrink-0" />
                    <span>Save &amp; Publish to Meeting Hub</span>
                  </button>
                </div>
              )}
          </div>
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-[#FAF6F0]/70 border border-dashed border-[#E5DDD3] text-xs sm:text-sm text-[#5C4638]">
          {docType === "minutes"
            ? "Paste or type meeting notes above, preview privacy masking, and click 'Draft Structured Minutes' to populate section editors."
            : "No AI draft has been generated for this scope yet. You can download the deterministic PDF immediately or click Draft above to add AI commentary."}
        </div>
      )}
    </section>
  );
}
