"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { DuesMonthOption } from "@/app/(member)/dues/dues-forms";
import {
  type DuesPaymentSettings,
  PayDuesModal,
} from "@/components/dues/pay-dues-modal";
import { formatNaira } from "@/lib/format";
import type { HomeDashboardDues } from "@/lib/home-dashboard.server";

const monthNames = [
  { shortName: "Jan", fullName: "January", index: 0 },
  { shortName: "Feb", fullName: "February", index: 1 },
  { shortName: "Mar", fullName: "March", index: 2 },
  { shortName: "Apr", fullName: "April", index: 3 },
  { shortName: "May", fullName: "May", index: 4 },
  { shortName: "Jun", fullName: "June", index: 5 },
  { shortName: "Jul", fullName: "July", index: 6 },
  { shortName: "Aug", fullName: "August", index: 7 },
  { shortName: "Sep", fullName: "September", index: 8 },
  { shortName: "Oct", fullName: "October", index: 9 },
  { shortName: "Nov", fullName: "November", index: 10 },
  { shortName: "Dec", fullName: "December", index: 11 },
];

const TEN_PROGRESS_SEGMENTS = [
  "seg-1",
  "seg-2",
  "seg-3",
  "seg-4",
  "seg-5",
  "seg-6",
  "seg-7",
  "seg-8",
  "seg-9",
  "seg-10",
] as const;

function formatPaymentDate(date: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(new Date(`${date.slice(0, 10)}T00:00:00+01:00`));
}

function formatRecordedAt(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

interface MemberDuesCardProps {
  dues: {
    unavailable: boolean;
    rows: HomeDashboardDues[];
  };
  currentYear: string | null;
  currentMonth: string | null;
  memberName: string;
  paymentSettings?: DuesPaymentSettings | null;
}

export function MemberDuesCard({
  dues,
  currentYear,
  currentMonth,
  memberName,
  paymentSettings,
}: MemberDuesCardProps) {
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedPaidMonth, setSelectedPaidMonth] = useState<{
    name: string;
    amount: number;
    receipt: NonNullable<HomeDashboardDues["receipt"]>;
  } | null>(null);

  if (dues.unavailable || !currentYear) {
    return (
      <section
        aria-labelledby="dues-status-heading"
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-lg bg-[#174C37]/10 text-[#174C37] font-mono text-xs font-bold grid place-items-center">
            ₦
          </div>
          <h2
            className="font-serif font-bold text-base text-[#3D291F]"
            id="dues-status-heading"
          >
            {currentYear ?? "Annual"} Member Dues
          </h2>
        </div>
        <div className="p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            Dues Ledger Currently Unavailable
          </h3>
          <p className="text-xs font-medium text-[#5C4638] max-w-md mx-auto leading-relaxed">
            Your dues records could not be loaded. Please check back shortly or
            visit your dues page.
          </p>
          <div className="pt-2">
            <Link
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] min-w-[44px] rounded-lg bg-white border border-[#E5DDD3] text-[#174C37] text-xs font-bold hover:bg-[#FAF6F0] transition-colors shadow-xs"
              href="/dues"
            >
              Open Dues Page
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const rows = dues.rows ?? [];
  const paidRows = rows.filter((r) => r.status === "paid");
  const unpaidRows = rows.filter((r) => r.status === "unpaid");
  const unpaidTotalNgn = unpaidRows.reduce((sum, r) => sum + r.amountNgn, 0);
  const unpaidMonthsCount = unpaidRows.length;

  const scheduledMonthsCount = rows.length;
  const paidMonthsCount = paidRows.length;
  const totalPaidAmount = paidRows.reduce((sum, r) => sum + r.amountNgn, 0);

  const availableMonths: DuesMonthOption[] = unpaidRows.map((r) => {
    let label = r.coveredMonth;
    try {
      const [y, m] = r.coveredMonth.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, 1));
      label = new Intl.DateTimeFormat("en-NG", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
    } catch {
      label = r.coveredMonth;
    }
    return {
      month: r.coveredMonth,
      amount: r.amountNgn,
      label,
    };
  });

  const monthlyRateNgn = unpaidRows[0]?.amountNgn ?? rows[0]?.amountNgn ?? 5000;
  const monthsMap = new Map(rows.map((r) => [r.coveredMonth, r]));

  // Progress segment count: 10 segments standard for active club dues schedule
  const progressSegmentsTotal = Math.max(scheduledMonthsCount, 10);

  return (
    <section
      aria-labelledby="dues-status-heading"
      className="rounded-2xl bg-white border border-[#E5DDD3] shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[#174C37]/10 text-[#174C37] font-mono text-xs font-bold grid place-items-center shrink-0">
            ₦
          </div>
          <h2
            className="font-serif font-bold text-base text-[#3D291F]"
            id="dues-status-heading"
          >
            Member Dues
          </h2>
        </div>

        <Link
          className="text-xs font-semibold text-[#174C37] hover:text-[#0C3325] hover:underline transition-colors inline-flex items-center gap-1 min-h-[44px]"
          href="/dues"
        >
          <span>Full ledger</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>

      {/* Metrics Strip */}
      <div className="mx-4 p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-between gap-2">
        {/* Column 1: Paid */}
        <div className="space-y-0.5 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7A685D] block truncate">
            PAID ({paidMonthsCount}/{scheduledMonthsCount || 10} MO)
          </span>
          <span className="font-mono font-bold text-sm text-[#174C37] block tabular-nums">
            {formatNaira(totalPaidAmount)}
          </span>
        </div>

        {/* Vertical hairline divider */}
        <div className="h-7 w-px bg-[#E5DDD3] shrink-0" />

        {/* Column 2: Due Now */}
        <div className="space-y-0.5 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#7A685D] block truncate">
            DUE NOW ({unpaidMonthsCount} MO)
            <span className="sr-only">
              {unpaidMonthsCount} {unpaidMonthsCount === 1 ? "month" : "months"}{" "}
              due · {unpaidMonthsCount} mo owed
            </span>
          </span>
          <span
            className={`font-mono font-bold text-sm block tabular-nums ${
              unpaidTotalNgn > 0 ? "text-[#BA3C2A]" : "text-[#174C37]"
            }`}
          >
            {formatNaira(unpaidTotalNgn)}
          </span>
        </div>

        {/* Column 3: Compact Pay Now Action */}
        <div className="shrink-0 flex items-center">
          {unpaidTotalNgn > 0 ? (
            <button
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3.5 py-2 rounded-lg bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-semibold shrink-0 transition-colors shadow-2xs cursor-pointer"
              onClick={() => setIsPayModalOpen(true)}
              type="button"
            >
              Pay now
            </button>
          ) : (
            <span className="text-xs font-bold text-[#174C37] px-2.5 py-1.5 bg-[#174C37]/10 rounded-lg inline-flex items-center min-h-[44px]">
              Up to date
            </span>
          )}
        </div>
      </div>

      {/* Slim 10-Segment Visual Progress Bar */}
      <div
        aria-label={`Dues payment progress: ${paidMonthsCount} of ${progressSegmentsTotal} months paid`}
        aria-valuemax={progressSegmentsTotal}
        aria-valuemin={0}
        aria-valuenow={paidMonthsCount}
        className="px-4 py-2.5 grid grid-cols-10 gap-1"
        role="progressbar"
      >
        {TEN_PROGRESS_SEGMENTS.map((segId, i) => {
          const isPaid = i < paidMonthsCount;
          return (
            <span
              className={`h-1.5 rounded-full transition-all ${
                isPaid ? "bg-[#174C37]" : "bg-[#BA3C2A]/25"
              }`}
              key={segId}
            />
          );
        })}
      </div>

      {/* Slim Attached Footer Accordion Bar */}
      <button
        aria-expanded={isScheduleExpanded}
        className="w-full border-t border-[#E5DDD3] bg-[#FAF6F0]/60 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer"
        onClick={() => setIsScheduleExpanded(!isScheduleExpanded)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-[#174C37]" />
          <span>Monthly Schedule (Jan – Dec {currentYear})</span>
        </span>
        <span className="text-[#7A685D] flex items-center gap-1 font-normal text-[11px]">
          <span>{isScheduleExpanded ? "Hide" : "View"}</span>
          {isScheduleExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {/* Expanded Inline Month Grid */}
      {isScheduleExpanded && (
        <div className="p-3.5 bg-white border-t border-[#E5DDD3] space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[11px] text-[#7A685D]">
            <span>12-Month Schedule Breakdown</span>
            <span>Tap any paid month to view receipt</span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {monthNames.map((m) => {
              const coveredMonth = `${currentYear}-${String(m.index + 1).padStart(2, "0")}-01`;
              const row = monthsMap.get(coveredMonth);
              const isPaid = row?.status === "paid";
              const isOverdue = row?.isOverdue && row?.status === "unpaid";
              const receipt = row?.receipt;
              const isDue =
                row?.status === "unpaid" &&
                coveredMonth === currentMonth &&
                !row.isOverdue;

              const content = (
                <div className="w-full text-left">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#3D291F]">
                      {m.shortName}
                    </span>
                    {isPaid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
                    ) : isDue || isOverdue ? (
                      <Clock className="w-3.5 h-3.5 text-[#BA3C2A]" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B8ACA0]" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[#7A685D] block mt-0.5">
                    {row?.amountNgn ? formatNaira(row.amountNgn) : "—"}
                  </span>
                </div>
              );

              if (isPaid && receipt) {
                return (
                  <button
                    className="p-2 rounded-lg border border-[#E5DDD3] bg-white hover:border-[#174C37] hover:bg-[#FAF6F0] transition-colors cursor-pointer text-left shadow-2xs min-h-[44px] flex flex-col justify-between"
                    key={m.shortName}
                    onClick={() => {
                      setSelectedPaidMonth({
                        name: m.fullName,
                        amount: row.amountNgn,
                        receipt,
                      });
                    }}
                    type="button"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  className={`p-2 rounded-lg border text-left shadow-2xs min-h-[44px] flex flex-col justify-between ${
                    isDue || isOverdue
                      ? "bg-[#FAF0EE] border-[#BA3C2A]/40"
                      : "bg-white border-[#E5DDD3]"
                  }`}
                  key={m.shortName}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Embedded Mini-Voucher Viewer */}
      {selectedPaidMonth && (
        <div className="p-3.5 mx-4 my-3 rounded-xl bg-[#FAF6F0] border border-[#174C37]/40 animate-in fade-in duration-150 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#174C37]/10 text-[#174C37] shrink-0 mt-0.5">
                <FileText className="w-4 h-4 text-[#174C37]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-[#3D291F] truncate">
                  Payment Record · {selectedPaidMonth.name} {currentYear}
                </h3>
                <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] grid-cols-1 sm:grid-cols-2">
                  <div>
                    <dt className="inline text-[#7A685D]">Receipt ID: </dt>
                    <dd className="inline font-mono font-bold text-[#174C37]">
                      {selectedPaidMonth.receipt.paymentId}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-[#7A685D]">Amount: </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatNaira(selectedPaidMonth.receipt.amountNgn)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-[#7A685D]">Paid: </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatPaymentDate(selectedPaidMonth.receipt.paymentDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-[#7A685D]">Recorded: </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatRecordedAt(selectedPaidMonth.receipt.recordedAt)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <button
              className="text-xs font-semibold text-[#7A685D] hover:text-[#3D291F] px-2 py-1 rounded-md hover:bg-[#E5DDD3]/50 cursor-pointer transition-colors shrink-0"
              onClick={() => setSelectedPaidMonth(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <PayDuesModal
        availableMonths={availableMonths}
        isOpen={isPayModalOpen}
        memberName={memberName}
        monthlyRateNgn={monthlyRateNgn}
        onClose={() => setIsPayModalOpen(false)}
        paymentSettings={paymentSettings}
        unpaidTotalNgn={unpaidTotalNgn}
      />
    </section>
  );
}

export default MemberDuesCard;
