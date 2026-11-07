"use client";

import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
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
import { percentWidthClass } from "@/lib/percent-width-class";

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
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-5 h-5 text-[#3D291F]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="dues-status-heading"
          >
            {currentYear ?? "Annual"} Membership Dues
          </h3>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            Dues Ledger Currently Unavailable
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-md mx-auto leading-relaxed">
            Your dues records could not be loaded. Please check back shortly or
            visit your dues page.
          </p>
          <div className="pt-2">
            <Link
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] min-w-[44px] rounded-[10px] bg-white border border-[#E5DDD3] text-[#174C37] text-xs font-bold hover:bg-[#FAF6F0] transition-colors shadow-xs"
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
  const settlementPercentage = Math.min(
    100,
    scheduledMonthsCount === 0
      ? 0
      : Math.round((paidMonthsCount / scheduledMonthsCount) * 100),
  );

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

  return (
    <section
      aria-labelledby="dues-status-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs space-y-6"
    >
      {/* Header and Privacy Notice */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#174C37]" />
            <h3
              className="text-lg font-bold text-[#3D291F]"
              id="dues-status-heading"
            >
              Member Dues
            </h3>
          </div>
          <p className="text-xs font-normal text-[#7A685D] mt-1">
            Your monthly contribution for {currentYear}.
          </p>
        </div>

        {/* Header Right Zone: Open Ledger link (anchored text, no badge) */}
        <div className="flex items-center shrink-0">
          <Link
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#174C37] hover:text-[#0C3325] hover:underline transition-colors py-1.5"
            href="/dues"
          >
            <span>Full ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Mobile Consolidated Summary Strip (sm:hidden) */}
      <div className="sm:hidden grid grid-cols-3 gap-2 p-3.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
        <div className="text-center space-y-0.5">
          <span className="text-[10px] font-bold text-[#7A685D] uppercase tracking-wider block">
            Paid ({currentYear})
          </span>
          <span className="font-mono font-bold text-base text-[#174C37] block">
            {formatNaira(totalPaidAmount)}
          </span>
          <span className="text-[10px] text-[#7A685D] block">
            {paidMonthsCount}/{scheduledMonthsCount} mo
          </span>
        </div>

        <div className="text-center space-y-0.5 border-x border-[#E5DDD3] px-1">
          <span className="text-[10px] font-bold text-[#7A685D] uppercase tracking-wider block">
            Due Now
          </span>
          <span
            className={`font-mono font-bold text-base block ${
              unpaidTotalNgn > 0 ? "text-[#BA3C2A]" : "text-[#174C37]"
            }`}
          >
            {formatNaira(unpaidTotalNgn)}
          </span>
          <span className="text-[10px] text-[#7A685D] block">
            {unpaidMonthsCount} mo owed
          </span>
        </div>

        <div className="text-center flex flex-col justify-center items-center space-y-0.5">
          <span className="text-[10px] font-bold text-[#7A685D] uppercase tracking-wider block">
            Action
          </span>
          {unpaidTotalNgn > 0 ? (
            <button
              className="mt-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[#174C37] hover:bg-[#0C3325] rounded-lg transition-colors shadow-2xs"
              onClick={() => setIsPayModalOpen(true)}
              type="button"
            >
              Pay now
            </button>
          ) : (
            <span className="font-bold text-xs text-[#174C37] block mt-1">
              Up to date
            </span>
          )}
        </div>
      </div>

      {/* Desktop Summary Highlight Strip (hidden sm:grid) */}
      <div className="hidden sm:grid sm:grid-cols-3 gap-4">
        {/* 1. Settled to Date */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1.5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#7A685D] block">
            Paid ({currentYear})
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-[#174C37] tabular-nums tracking-tight">
              {formatNaira(totalPaidAmount)}
            </span>
          </div>
          <div
            aria-label={`Scheduled dues paid for ${currentYear}`}
            aria-valuemax={Math.max(scheduledMonthsCount, 1)}
            aria-valuemin={0}
            aria-valuenow={paidMonthsCount}
            aria-valuetext={`${paidMonthsCount} of ${scheduledMonthsCount} scheduled months paid (${settlementPercentage}%)`}
            className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-2.5 overflow-hidden"
            role="progressbar"
          >
            <div
              className={`bg-[#174C37] h-full rounded-full transition-all duration-500 ${percentWidthClass(settlementPercentage)}`}
            />
          </div>
          <p className="text-[11px] text-[#7A685D]">
            {scheduledMonthsCount === 0
              ? "No dues months are scheduled for this year yet."
              : `${paidMonthsCount}/${scheduledMonthsCount} months paid`}
          </p>
        </div>

        {/* 2. Due Now */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1.5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#7A685D] block">
            Due Now
          </span>
          <div className="flex items-baseline justify-between">
            <span
              className={`text-lg font-bold font-mono tabular-nums tracking-tight ${
                unpaidTotalNgn > 0 ? "text-[#BA3C2A]" : "text-[#174C37]"
              }`}
            >
              {formatNaira(unpaidTotalNgn)}
            </span>
            <span className="text-xs font-semibold text-[#7A685D]">
              {unpaidMonthsCount} {unpaidMonthsCount === 1 ? "month" : "months"}{" "}
              due
            </span>
          </div>
          <div className="text-xs font-normal text-[#7A685D] mt-1">
            {unpaidTotalNgn > 0
              ? "Unpaid balance for scheduled months."
              : "All scheduled months are paid."}
          </div>
        </div>

        {/* 3. Action */}
        <div className="home-dues-account-status p-4 sm:p-5 rounded-xl bg-[#0C3325] text-white flex flex-col justify-between space-y-3 shadow-2xs">
          <div>
            <span className="text-[11px] font-semibold text-[#D6A23A] block">
              Action
            </span>
            <p className="text-base font-bold mt-1 text-white">
              {unpaidTotalNgn > 0 ? "Payment Due" : "Up to date"}
            </p>
          </div>

          {unpaidTotalNgn > 0 ? (
            <button
              className="w-full py-2.5 px-3 text-xs font-bold text-[#3D291F] bg-[#D6A23A] hover:bg-[#e0ad45] rounded-[10px] transition-colors flex items-center justify-center gap-2 min-h-[44px] shadow-xs cursor-pointer"
              onClick={() => setIsPayModalOpen(true)}
              type="button"
            >
              <CreditCard className="w-4 h-4 text-[#3D291F]" />
              <span>Pay now</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-[#E5DDD3]">
              <CheckCircle2 className="w-4 h-4 text-[#D6A23A]" />
              <span>Up to date</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Month-by-Month Schedule Accordion Control */}
      <div className="pt-2 border-t border-[#E5DDD3]">
        <button
          aria-expanded={isScheduleExpanded}
          className={`home-dues-schedule-toggle${isScheduleExpanded ? " is-expanded" : ""}`}
          onClick={() => setIsScheduleExpanded(!isScheduleExpanded)}
          type="button"
        >
          <span className="home-dues-schedule-toggle-main">
            <Calendar
              aria-hidden="true"
              className="home-dues-schedule-toggle-icon"
            />
            <span className="home-dues-schedule-toggle-label">
              Monthly Schedule (Jan – Dec {currentYear})
            </span>
          </span>

          <span className="home-dues-schedule-toggle-action">
            <span>{isScheduleExpanded ? "Hide" : "View"}</span>
            {isScheduleExpanded ? (
              <ChevronUp aria-hidden="true" />
            ) : (
              <ChevronDown aria-hidden="true" />
            )}
          </span>
        </button>

        {/* Collapsible Month-by-Month Status Grid */}
        {isScheduleExpanded && (
          <div className="mt-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5C4638]">
              <span className="font-bold text-[#3D291F]">
                12-Month Schedule Breakdown
              </span>
              <span className="text-[#7A685D]">
                Tap any paid month to view receipt
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
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
                const isUpcoming =
                  row?.status === "unpaid" &&
                  currentMonth !== null &&
                  coveredMonth > currentMonth;
                const isWrittenOff = row?.status === "written_off";

                const amount = row?.amountNgn ?? null;

                const cardContent = (
                  <>
                    <div className="w-full">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs text-[#3D291F]">
                          {m.shortName}
                        </span>
                        {isPaid ? (
                          <CheckCircle2 className="w-4 h-4 text-[#174C37]" />
                        ) : isDue || isOverdue ? (
                          <Clock className="w-4 h-4 text-[#BA3C2A]" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-[#B8ACA0]" />
                        )}
                      </div>

                      <span className="text-xs font-bold font-mono text-[#3D291F] block mt-1.5 tabular-nums">
                        {amount === null ? "—" : formatNaira(amount)}
                      </span>
                    </div>

                    <div className="w-full mt-2.5 pt-2 border-t border-[#E5DDD3] flex items-center justify-between text-[11px]">
                      <span
                        className={`font-bold uppercase tracking-wider ${
                          isPaid
                            ? "text-[#174C37]"
                            : isDue
                              ? "text-[#BA3C2A]"
                              : isOverdue
                                ? "text-[#BA3C2A]"
                                : "text-[#7A685D]"
                        }`}
                      >
                        {isPaid
                          ? "Paid"
                          : isDue
                            ? "Due Now"
                            : isOverdue
                              ? "Overdue"
                              : isWrittenOff
                                ? "Written Off"
                                : isUpcoming
                                  ? "Upcoming"
                                  : row?.status === "unpaid"
                                    ? "Unpaid"
                                    : "Not scheduled"}
                      </span>

                      {isPaid ? (
                        receipt ? (
                          <span className="text-[#174C37] font-bold underline">
                            Receipt
                          </span>
                        ) : (
                          <span className="text-[#7A685D] font-semibold">
                            Receipt unavailable
                          </span>
                        )
                      ) : isDue || isOverdue ? (
                        <Link
                          className="text-[#BA3C2A] font-bold underline min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-1"
                          href="/dues"
                        >
                          Pay
                        </Link>
                      ) : null}
                    </div>
                  </>
                );

                if (isPaid && receipt) {
                  return (
                    <button
                      className="cf-month-tile-btn"
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
                      {cardContent}
                    </button>
                  );
                }

                return (
                  <div
                    className={`p-3.5 rounded-xl border transition-all text-left flex flex-col justify-between min-h-[100px] shadow-2xs ${
                      isDue || isOverdue
                        ? "bg-[#FAF0EE] border-[#BA3C2A]/50 ring-1 ring-[#BA3C2A]/30"
                        : "bg-white border-[#E5DDD3]"
                    }`}
                    key={m.shortName}
                  >
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Embedded Mini-Voucher Viewer */}
      {selectedPaidMonth && (
        <div className="p-4 sm:p-5 rounded-xl bg-[#FAF6F0] border-2 border-[#174C37]/40 animate-in fade-in duration-150 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#174C37]/10 text-[#174C37]">
                <FileText className="w-5 h-5 text-[#174C37]" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-[#3D291F]">
                  Dues Payment Record · {selectedPaidMonth.name} {currentYear}
                </h4>
                <dl className="mt-2 grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Receipt ID:{" "}
                    </dt>
                    <dd className="inline break-all font-mono font-bold text-[#174C37]">
                      {selectedPaidMonth.receipt.paymentId}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Payment amount:{" "}
                    </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatNaira(selectedPaidMonth.receipt.amountNgn)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Applied to {selectedPaidMonth.name}:{" "}
                    </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatNaira(selectedPaidMonth.amount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Paid on:{" "}
                    </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatPaymentDate(selectedPaidMonth.receipt.paymentDate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Recorded:{" "}
                    </dt>
                    <dd className="inline font-bold text-[#3D291F]">
                      {formatRecordedAt(selectedPaidMonth.receipt.recordedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-[#7A685D]">
                      Record status:{" "}
                    </dt>
                    <dd className="inline font-bold text-[#174C37]">
                      {selectedPaidMonth.receipt.correctedAt
                        ? `Correction on file (${formatRecordedAt(selectedPaidMonth.receipt.correctedAt)})`
                        : "Current payment record"}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <button
              className="cf-btn cf-btn--neutral px-3 py-1.5 cursor-pointer min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
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
