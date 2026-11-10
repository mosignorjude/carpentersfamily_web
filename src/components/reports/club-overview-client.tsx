"use client";

import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CfFilterPill } from "@/components/ui";
import { formatNaira } from "@/lib/format";
import type { OverviewPeriod } from "@/lib/reports/period";
import { AiSummaryPanel, type ClientNarrativeDto } from "./ai-summary-panel";

export interface ClubOverviewFactsView {
  period_label: string;
  period: string;
  club_finance: {
    period_dues_collected_ngn: number;
    period_other_income_ngn: number;
    period_expenses_ngn: number;
    current_club_balance_ngn: number;
    expense_by_category: Array<{
      category: string;
      amount: number;
      share_pct: number;
    }>;
  };
  dues: {
    active_members: number;
    paid_rows_in_period: number;
    unpaid_rows_in_period: number;
    overdue_rows_as_of_end: number;
    overdue_three_plus_members: number;
    paid_amount_ngn: number;
    owed_through_end_ngn: number;
    collection_rate_pct: number;
  };
  events: {
    events_count: number;
    completed_count: number;
    scheduled_count: number;
    cancelled_count: number;
    event_cash_in_ngn: number;
    event_cash_out_ngn: number;
    net_event_cash_ngn: number;
    ticket_revenue_ngn: number;
    tickets_sold: number;
    top_events: Array<{ title: string; net_result_ngn: number }>;
  };
  attendance: {
    sessions_count: number;
    total_checkins: number;
  };
}

export function ClubOverviewClient({
  period,
  currentMonthParam,
  previousMonthParam,
  currentYearParam,
  facts,
  aiEnabled,
  initialNarrative,
}: {
  period: OverviewPeriod;
  currentMonthParam: string;
  previousMonthParam: string;
  currentYearParam: string;
  facts: ClubOverviewFactsView | null;
  aiEnabled: boolean;
  initialNarrative: ClientNarrativeDto | null;
}) {
  const router = useRouter();
  const [includeAi, setIncludeAi] = useState(true);
  const [monthValue, setMonthValue] = useState(
    period.periodParam.startsWith("month:")
      ? period.periodParam.slice(6)
      : currentMonthParam.slice(6),
  );

  const navigatePeriod = (nextParam: string) => {
    router.push(`/officers/reports?period=${encodeURIComponent(nextParam)}`);
  };

  const pdfHref = `/api/reports/overview?period=${encodeURIComponent(
    period.periodParam,
  )}&format=pdf&includeAi=${includeAi ? "true" : "false"}`;
  const csvHref = `/api/reports/overview?period=${encodeURIComponent(
    period.periodParam,
  )}&format=csv`;

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8">
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#174C37]">
              Officer Reports Centre
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Club Overview &amp; AI Reports
            </h1>
            <p className="text-xs sm:text-sm text-[#5C4638]">
              Period:{" "}
              <strong className="text-[#3D291F]">{period.periodLabel}</strong> (
              {period.periodStart} to {period.periodEnd})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs"
              href={pdfHref}
              rel="noopener"
              target="_blank"
            >
              <FileText className="w-4 h-4 text-[#D6A23A] shrink-0" />
              <span>Download Branded PDF</span>
            </a>
            <a
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] text-xs font-bold hover:bg-white transition-colors shadow-2xs"
              href={csvHref}
              rel="noopener"
              target="_blank"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#174C37] shrink-0" />
              <span>Export CSV</span>
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E5DDD3]">
          <div className="flex flex-wrap items-center gap-1.5">
            <CfFilterPill
              active={period.periodParam === currentMonthParam}
              onClick={() => navigatePeriod(currentMonthParam)}
            >
              This Month
            </CfFilterPill>
            <CfFilterPill
              active={period.periodParam === previousMonthParam}
              onClick={() => navigatePeriod(previousMonthParam)}
            >
              Last Month
            </CfFilterPill>
            <CfFilterPill
              active={period.periodParam === currentYearParam}
              onClick={() => navigatePeriod(currentYearParam)}
            >
              Full Year ({currentYearParam.slice(5)})
            </CfFilterPill>

            <div className="flex items-center gap-1.5 pl-1">
              <label className="sr-only" htmlFor="overview-month-picker">
                Choose month
              </label>
              <input
                className="min-h-[44px] px-3 py-1.5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F]"
                id="overview-month-picker"
                onChange={(e) => {
                  const val = e.target.value;
                  setMonthValue(val);
                  if (/^\d{4}-\d{2}$/.test(val)) {
                    navigatePeriod(`month:${val}`);
                  }
                }}
                type="month"
                value={monthValue}
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 min-h-[44px] px-2 text-xs text-[#5C4638] cursor-pointer select-none">
            <input
              checked={includeAi}
              className="w-4 h-4 accent-[#174C37]"
              onChange={(e) => setIncludeAi(e.target.checked)}
              type="checkbox"
            />
            <span>Include approved AI summary in PDF</span>
          </label>
        </div>
      </section>

      {!aiEnabled && (
        <div className="p-4 rounded-2xl bg-[#FDF8EE] border border-[#EED7A1] text-xs text-[#8D5B0E] flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>
            AI summaries are currently off. Set <code>GEMINI_API_KEY</code> (and
            keep <code>AI_REPORTS_ENABLED=true</code>) in server environment
            variables to enable AI drafts. Branded PDFs and CSV exports remain
            available.
          </span>
        </div>
      )}

      {facts && (
        <>
          <AiSummaryPanel
            aiEnabled={aiEnabled}
            initialNarrative={initialNarrative}
            period={period.periodParam}
            reportType="club_overview"
            title={`Club Overview AI Summary (${period.periodLabel})`}
          />

          <section
            aria-label="Key Overview Totals"
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Current Club Balance
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#174C37] mt-1 tabular-nums">
                {formatNaira(facts.club_finance.current_club_balance_ngn)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Period Dues Collected
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#3D291F] mt-1 tabular-nums">
                {formatNaira(facts.club_finance.period_dues_collected_ngn)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Period Operating Expenses
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#BA3C2A] mt-1 tabular-nums">
                {formatNaira(facts.club_finance.period_expenses_ngn)}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Dues Collection Rate
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#3D291F] mt-1 tabular-nums">
                {facts.dues.collection_rate_pct}%
              </p>
              <span className="text-[11px] text-[#7A685D]">
                {facts.dues.overdue_three_plus_members} members 3+ mos overdue
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Net Event Cash
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#174C37] mt-1 tabular-nums">
                {formatNaira(facts.events.net_event_cash_ngn)}
              </p>
              <span className="text-[11px] text-[#7A685D]">
                {facts.events.events_count} events · {facts.events.tickets_sold}{" "}
                tickets sold
              </span>
            </div>
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#5C4638]">
                Attendance Check-ins
              </span>
              <p className="text-lg sm:text-xl font-extrabold text-[#3D291F] mt-1 tabular-nums">
                {facts.attendance.total_checkins}
              </p>
              <span className="text-[11px] text-[#7A685D]">
                Across {facts.attendance.sessions_count} sessions
              </span>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#3D291F]">
                Operating Expenses by Category
              </h2>
              {facts.club_finance.expense_by_category.length === 0 ? (
                <p className="text-xs text-[#7A685D] py-3">
                  No club operating expenses were recorded in this period.
                </p>
              ) : (
                <div className="divide-y divide-[#E5DDD3]">
                  {facts.club_finance.expense_by_category.map((cat) => (
                    <div
                      key={cat.category}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-[#3D291F]">
                        {cat.category}
                      </span>
                      <span className="font-mono text-[#5C4638] tabular-nums">
                        {formatNaira(cat.amount)} ({cat.share_pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-bold text-[#3D291F]">
                Event Cash Results in Period
              </h2>
              {facts.events.top_events.length === 0 ? (
                <p className="text-xs text-[#7A685D] py-3">
                  No scheduled events fell within this period.
                </p>
              ) : (
                <div className="divide-y divide-[#E5DDD3]">
                  {facts.events.top_events.map((ev) => (
                    <div
                      key={ev.title}
                      className="py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-[#3D291F]">
                        {ev.title}
                      </span>
                      <span className="font-mono font-bold text-[#174C37] tabular-nums">
                        {formatNaira(ev.net_result_ngn)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div className="rounded-2xl border border-dashed border-[#E5DDD3] bg-[#FAF6F0] p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#3D291F]">
            <Download className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Phase 2: Custom Plain-English Reports (Planned)</span>
          </div>
          <p className="text-xs text-[#5C4638]">
            Ask questions like &ldquo;Q3 event spending by category&rdquo; to
            generate verified custom tables and PDFs.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-[#E5DDD3] bg-[#FAF6F0] p-4 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#3D291F]">
            <Sparkles className="w-3.5 h-3.5 text-[#174C37]" />
            <span>
              Phase 3: AGM, Treasurer &amp; Minutes Drafting (Planned)
            </span>
          </div>
          <p className="text-xs text-[#5C4638]">
            Draft formal AGM financial statements, treasurer reports, and
            pseudonymised meeting minutes.
          </p>
        </div>
      </section>
    </div>
  );
}
