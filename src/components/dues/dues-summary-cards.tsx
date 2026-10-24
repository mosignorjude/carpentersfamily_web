import {
  AlertTriangle,
  Building,
  CalendarCheck,
  CheckCircle2,
  DollarSign,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { formatNaira } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";

interface DuesSummaryCardsProps {
  paidMonthsCount: number;
  totalPaidAmount: number;
  openTotal: number;
  unpaidMonthsCount: number;
  monthlyRate: number;
  nextMonthRate?: {
    effectiveMonth: string;
    amount: number;
  } | null;
  clubTotalIncome?: number | null;
  isOfficer: boolean;
}

export function DuesSummaryCards({
  paidMonthsCount,
  totalPaidAmount,
  openTotal,
  unpaidMonthsCount,
  monthlyRate,
  nextMonthRate,
  clubTotalIncome,
  isOfficer,
}: DuesSummaryCardsProps) {
  const hasOutstanding = openTotal > 0;
  const settlementPercentage = Math.min(
    100,
    Math.round((paidMonthsCount / 12) * 100),
  );

  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 ${
        isOfficer ? "lg:grid-cols-4" : "lg:grid-cols-3"
      } gap-4`}
    >
      {/* 1. Total Settled Contributions */}
      <div className="bg-white rounded-xl border border-[#E5DDD3] p-5 shadow-2xs space-y-2 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-[#54433A] uppercase tracking-wider">
            <span>Settled to Date</span>
            <div className="w-7 h-7 rounded-lg bg-[#174C37]/10 flex items-center justify-center text-[#174C37]">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-[#174C37] tabular-nums tracking-tight">
              {formatNaira(totalPaidAmount)}
            </span>
            <span className="text-xs font-bold text-[#174C37] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
              {paidMonthsCount} mo. paid
            </span>
          </div>
        </div>

        <div>
          <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 overflow-hidden mt-3">
            <div
              className={`bg-[#174C37] h-full rounded-full transition-all duration-500 ${percentWidthClass(settlementPercentage)}`}
            />
          </div>
          <p className="text-[11px] font-medium text-[#54433A] mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Audited & verified in member ledger</span>
          </p>
        </div>
      </div>

      {/* 2. Outstanding Balance */}
      <div
        className={`rounded-xl border p-5 shadow-2xs space-y-2 flex flex-col justify-between ${
          hasOutstanding
            ? "bg-[#FFF9F8] border-[#F5C2C2]"
            : "bg-white border-[#E5DDD3]"
        }`}
      >
        <div>
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
            <span
              className={hasOutstanding ? "text-[#BA3C2A]" : "text-[#54433A]"}
            >
              Current Outstanding
            </span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                hasOutstanding
                  ? "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                  : "bg-[#174C37]/10 text-[#174C37]"
              }`}
            >
              {hasOutstanding ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`text-2xl font-black font-mono tabular-nums tracking-tight ${
                hasOutstanding ? "text-[#BA3C2A]" : "text-[#174C37]"
              }`}
            >
              {formatNaira(openTotal)}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border ${
                hasOutstanding
                  ? "bg-white text-[#BA3C2A] border-[#F5C2C2]"
                  : "bg-[#FAF6F0] text-[#174C37] border-[#E5DDD3]"
              }`}
            >
              {hasOutstanding ? `${unpaidMonthsCount} mo. due` : "All Clear"}
            </span>
          </div>
        </div>

        <p className="text-[11px] font-medium text-[#54433A] mt-2 leading-relaxed">
          {hasOutstanding
            ? "Settlement required before monthly cycle close."
            : "All eligible contribution periods are up to date."}
        </p>
      </div>

      {/* 3. Monthly Statutory Rate */}
      <div className="bg-white rounded-xl border border-[#E5DDD3] p-5 shadow-2xs space-y-2 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-[#54433A] uppercase tracking-wider">
            <span>Statutory Dues Rate</span>
            <div className="w-7 h-7 rounded-lg bg-[#D6A23A]/15 flex items-center justify-center text-[#3D291F]">
              <DollarSign className="w-4 h-4 text-[#D6A23A]" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-[#3D291F] tabular-nums tracking-tight">
              {formatNaira(monthlyRate)}
            </span>
            <span className="text-xs font-bold text-[#54433A] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
              Per Month
            </span>
          </div>
        </div>

        <p className="text-[11px] font-medium text-[#54433A] mt-2">
          {nextMonthRate ? (
            <span>
              Next month rate:{" "}
              <strong className="text-[#3D291F]">
                {formatNaira(nextMonthRate.amount)}
              </strong>{" "}
              (eff. {nextMonthRate.effectiveMonth})
            </span>
          ) : (
            <span>Established by club general resolution</span>
          )}
        </p>
      </div>

      {/* 4. Club Aggregate Dues (Officers only) */}
      {isOfficer && (
        <div className="bg-white rounded-xl border border-[#E5DDD3] p-5 shadow-2xs space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-[#54433A] uppercase tracking-wider">
              <span>Club All-Time Dues</span>
              <div className="w-7 h-7 rounded-lg bg-[#174C37]/10 flex items-center justify-center text-[#174C37]">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-black font-mono text-[#174C37] tabular-nums tracking-tight">
                {clubTotalIncome !== null && clubTotalIncome !== undefined
                  ? formatNaira(clubTotalIncome)
                  : "₦0"}
              </span>
              <span className="text-xs font-bold text-[#174C37] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
                Treasury
              </span>
            </div>
          </div>

          <p className="text-[11px] font-medium text-[#54433A] mt-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Aggregated across all verified members</span>
          </p>
        </div>
      )}
    </div>
  );
}
