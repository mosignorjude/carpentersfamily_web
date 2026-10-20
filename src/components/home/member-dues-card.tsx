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
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

function formatNaira(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

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
}

export function MemberDuesCard({
  dues,
  currentYear,
  currentMonth,
  memberName,
}: MemberDuesCardProps) {
  const [isScheduleExpanded, setIsScheduleExpanded] = useState(false);
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
  const scheduledMonthsCount = rows.length;
  const paidMonthsCount = paidRows.length;
  const totalPaidAmount = paidRows.reduce((sum, r) => sum + r.amountNgn, 0);
  const settlementPercentage = Math.min(
    100,
    scheduledMonthsCount === 0
      ? 0
      : Math.round((paidMonthsCount / scheduledMonthsCount) * 100),
  );

  const currentMonthRow = rows.find((r) => r.coveredMonth === currentMonth);
  const overdueRow = rows.find((r) => r.isOverdue && r.status === "unpaid");
  const activeObligationRow =
    overdueRow ??
    (currentMonthRow && currentMonthRow.status === "unpaid"
      ? currentMonthRow
      : null);

  const activeMonthIndex = activeObligationRow
    ? Number.parseInt(activeObligationRow.coveredMonth.slice(5, 7), 10) - 1
    : -1;
  const activeMonthName =
    activeMonthIndex >= 0 && activeMonthIndex < 12
      ? monthNames[activeMonthIndex].shortName
      : "";

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
              Your {currentYear} Membership Dues
            </h3>
          </div>
          <p className="text-xs font-normal text-[#7A685D] mt-1">
            Monthly contribution schedule for{" "}
            <strong className="text-[#3D291F] font-bold">{memberName}</strong>.
          </p>
        </div>

        {/* Header Right Zone: Privacy badge and Open Ledger link */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-[#174C37] bg-[#FAF6F0] px-3.5 py-1.5 rounded-lg border border-[#E5DDD3] shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-[#174C37]" />
            <span className="font-medium">Private Member Ledger</span>
            <span aria-hidden="true" className="text-[#B8ACA0]">
              ·
            </span>
            <span className="text-[#7A685D]">Confidential</span>
          </div>

          <Link
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] min-w-[44px] rounded-lg bg-white border border-[#E5DDD3] text-xs font-semibold text-[#174C37] hover:bg-[#FAF6F0] transition-colors"
            href="/dues"
          >
            <span>Full Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Summary Highlight Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Settled to Date */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1.5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#7A685D] block">
            Contributions Paid ({currentYear})
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold font-mono text-[#174C37] tabular-nums tracking-tight">
              {formatNaira(totalPaidAmount)}
            </span>
            <span className="text-xs font-semibold text-[#174C37]">
              {paidMonthsCount} of {scheduledMonthsCount} scheduled months paid
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
              : `${paidMonthsCount} of ${scheduledMonthsCount} scheduled months paid.`}
          </p>
        </div>

        {/* 2. Current Month Obligation */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1.5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#7A685D] block">
            Current Month Obligation
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-[#3D291F]">
              {activeObligationRow
                ? "Payment Pending"
                : scheduledMonthsCount > 0
                  ? "All Cleared"
                  : "No Dues Scheduled"}
            </span>
            {activeObligationRow ? (
              <span className="text-xs font-bold text-[#BA3C2A] tabular-nums font-mono">
                {formatNaira(activeObligationRow.amountNgn)} Due
              </span>
            ) : null}
          </div>
          <div className="text-xs font-normal text-[#7A685D] mt-1">
            {activeObligationRow
              ? activeObligationRow.isOverdue
                ? "This contribution is past its due date."
                : "Due by monthly cycle close."
              : scheduledMonthsCount > 0
                ? "Your contributions are up to date."
                : "No dues months are scheduled for this year yet."}
          </div>
        </div>

        {/* 3. Account Status & Action */}
        <div className="home-dues-account-status p-4 sm:p-5 rounded-xl bg-[#0C3325] text-white flex flex-col justify-between space-y-3 shadow-2xs">
          <div>
            <span className="text-[11px] font-semibold text-[#D6A23A] block">
              Account Status
            </span>
            <p className="text-base font-bold mt-1 text-white">
              {activeObligationRow
                ? "Action Recommended"
                : scheduledMonthsCount > 0
                  ? "Member in Good Standing"
                  : "Dues Schedule Pending"}
            </p>
          </div>

          {activeObligationRow ? (
            <Link
              className="w-full py-2.5 px-3 text-xs font-bold text-[#3D291F] bg-[#D6A23A] hover:bg-[#e0ad45] rounded-[10px] transition-colors flex items-center justify-center gap-2 min-h-[44px] shadow-xs"
              href="/dues"
            >
              <CreditCard className="w-4 h-4 text-[#3D291F]" />
              <span>
                Settle {activeMonthName} Dues (
                {formatNaira(activeObligationRow.amountNgn)})
              </span>
            </Link>
          ) : scheduledMonthsCount > 0 ? (
            <div className="flex items-center gap-1.5 text-xs text-[#E5DDD3]">
              <CheckCircle2 className="w-4 h-4 text-[#D6A23A]" />
              <span>All dues cleared for this year</span>
            </div>
          ) : (
            <div className="text-xs text-[#E5DDD3]">
              <span>No dues scheduled</span>
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
              {isScheduleExpanded
                ? "Hide Month-by-Month Schedule"
                : "View Month-by-Month Schedule"}
            </span>
            <span className="home-dues-schedule-toggle-summary">
              ({paidMonthsCount} of {scheduledMonthsCount} scheduled months paid
              · January – December {currentYear})
            </span>
          </span>

          <span className="home-dues-schedule-toggle-action">
            <span>{isScheduleExpanded ? "Collapse" : "Expand"}</span>
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
                Click paid months to view receipt details
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
    </section>
  );
}

export default MemberDuesCard;
