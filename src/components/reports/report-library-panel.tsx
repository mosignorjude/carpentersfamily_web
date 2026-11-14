"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileDown,
  FileText,
  FolderOpen,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReportLibraryItem } from "@/lib/reports/library-core";

interface ReportLibraryPanelProps {
  items: ReportLibraryItem[];
  onOpenItem: (item: ReportLibraryItem) => void;
}

type LibraryFilter = "all" | "approved" | "draft" | "stale";

function formatReportTypeLabel(reportType: string): string {
  switch (reportType) {
    case "club_overview":
      return "Executive Brief";
    case "club_finance":
      return "Club Finance";
    case "dues":
      return "Member Dues";
    case "event_finance":
      return "Event Finance";
    case "agm_statement":
      return "AGM Statement";
    case "treasurer_report":
      return "Treasurer Report";
    case "minutes":
      return "Meeting Minutes";
    case "custom":
      return "Custom Query";
    default:
      return reportType.replace(/_/g, " ");
  }
}

function formatUpdatedDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(parsed);
}

export function ReportLibraryPanel({
  items,
  onOpenItem,
}: ReportLibraryPanelProps) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: items.length,
      approved: items.filter((i) => i.status === "approved").length,
      draft: items.filter((i) => i.status === "draft").length,
      stale: items.filter((i) => i.isStale).length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "approved" && item.status !== "approved") return false;
      if (filter === "draft" && item.status !== "draft") return false;
      if (filter === "stale" && !item.isStale) return false;

      if (!q) return true;
      const haystack = [
        item.headline,
        item.summaryExcerpt,
        item.scopeTitle ?? "",
        formatReportTypeLabel(item.reportType),
        item.periodStart,
        item.periodEnd,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, filter, query]);

  return (
    <section aria-label="Saved Report Library" className="space-y-4">
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#3D291F]">
              Saved Report Library
            </h2>
            <p className="text-xs text-[#5C4638]">
              Approved narratives and saved drafts across all club scopes,
              ordered by most recent activity.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-[#FAF6F0] border border-[#E5DDD3] text-[11px] font-mono font-semibold text-[#5C4638]">
            {items.length} saved
          </span>
        </div>

        {/* Filter Pills + Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-[#E5DDD3]">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", `All (${counts.all})`],
                ["approved", `Approved (${counts.approved})`],
                ["draft", `Drafts (${counts.draft})`],
                ["stale", `Data Updated (${counts.stale})`],
              ] as const
            ).map(([key, label]) => (
              <button
                className={`inline-flex items-center justify-center px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer min-h-[44px] ${
                  filter === key
                    ? "bg-[#174C37] text-white shadow-2xs"
                    : "bg-[#FAF6F0] text-[#54433A] border border-[#E5DDD3] hover:bg-white"
                }`}
                key={key}
                onClick={() => setFilter(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              aria-label="Search saved reports"
              className="w-full min-h-[44px] pl-9 pr-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-xl text-xs text-[#3D291F] placeholder:text-[#9A8B7E] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, period, or event..."
              type="search"
              value={query}
            />
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-2 shadow-2xs">
          <FolderOpen className="w-9 h-9 text-[#B8ACA0] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            No Saved Reports Match
          </h3>
          <p className="text-xs text-[#7A685D] max-w-md mx-auto">
            {items.length === 0
              ? "Generate an Executive Brief, formal draft, or financial summary to build your officer report archive."
              : "Adjust the status filter or search terms to view matching saved reports."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const externalHref =
              item.reportType === "club_finance"
                ? "/finances?tab=setup"
                : item.reportType === "dues"
                  ? "/dues"
                  : item.reportType === "event_finance" && item.scopeId
                    ? `/events/${item.scopeId}/dashboard`
                    : null;

            return (
              <article
                className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                key={item.id}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6F0] text-[#3D291F] border border-[#E5DDD3]">
                      {formatReportTypeLabel(item.reportType)}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === "approved"
                          ? "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20"
                          : "bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3]"
                      }`}
                    >
                      {item.status === "approved" ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Clock className="w-3 h-3" />
                      )}
                      <span>
                        {item.status === "approved" ? "Approved" : "Draft"}
                      </span>
                    </span>

                    {item.isStale && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FDF8EE] text-[#8D5B0E] border border-[#EED7A1]">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Data Updated</span>
                      </span>
                    )}

                    <span className="text-[11px] font-mono text-[#7A685D]">
                      {item.periodStart} → {item.periodEnd}
                    </span>
                  </div>

                  <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F] leading-snug">
                    {item.headline}
                  </h3>

                  {item.summaryExcerpt && (
                    <p className="text-xs text-[#5C4638] line-clamp-2 leading-relaxed">
                      {item.summaryExcerpt}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#7A685D] pt-0.5">
                    <span>Updated {formatUpdatedDate(item.updatedAt)}</span>
                    {item.approvedByName && (
                      <span>Approved by {item.approvedByName}</span>
                    )}
                    <span className="font-mono text-[10px] uppercase">
                      {item.provider}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {item.pdfHref && (
                    <a
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors"
                      href={item.pdfHref}
                      rel="noopener"
                      target="_blank"
                    >
                      <FileDown className="w-3.5 h-3.5 text-[#174C37]" />
                      <span>PDF</span>
                    </a>
                  )}

                  {externalHref ? (
                    <Link
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors"
                      href={externalHref}
                    >
                      <span>Open</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <button
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors cursor-pointer"
                      onClick={() => onOpenItem(item)}
                      type="button"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#D6A23A]" />
                      <span>Open</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
