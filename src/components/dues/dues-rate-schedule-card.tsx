import { Calendar, DollarSign, History, ShieldCheck } from "lucide-react";
import { DuesRateForm } from "@/app/(member)/dues/dues-forms";
import { formatNaira } from "@/lib/format";

export type RateRow = {
  id: string;
  effective_month: string;
  monthly_amount_ngn: number | string;
  changed_by: string;
  changed_at: string;
  reason: string;
};

interface DuesRateScheduleCardProps {
  rates: RateRow[];
  canChangeRate: boolean;
  nextMonth: string;
}

function formatMonth(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function DuesRateScheduleCard({
  rates,
  canChangeRate,
  nextMonth,
}: DuesRateScheduleCardProps) {
  return (
    <section
      aria-labelledby="rate-history-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="rate-history-heading"
            >
              Statutory Rate Schedule
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Historical and effective monthly dues rates set by club governance
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-bold text-[#174C37] bg-white px-3 py-1 rounded-lg border border-[#E5DDD3] shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-[#174C37]" />
          <span>Governance Resolution Enforced</span>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 pt-0">
        {/* Rates Timeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {rates.map((rate, idx) => {
            const isLatest = idx === rates.length - 1;
            return (
              <article
                className={`p-4 rounded-xl border space-y-2 transition-all ${
                  isLatest
                    ? "border-[#174C37] bg-[#FAF6F0] shadow-2xs"
                    : "border-[#E5DDD3] bg-white"
                }`}
                key={rate.id}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black font-mono text-[#174C37] tabular-nums">
                    {formatNaira(rate.monthly_amount_ngn)}
                  </span>
                  {isLatest ? (
                    <span className="text-[10px] font-bold text-white bg-[#174C37] px-2 py-0.5 rounded shadow-2xs">
                      Effective Rate
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-[#54433A] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
                      Archived
                    </span>
                  )}
                </div>

                <div className="text-xs font-bold text-[#3D291F] flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#54433A]" />
                  <span>Effective {formatMonth(rate.effective_month)}</span>
                </div>

                <p className="text-[11px] text-[#54433A] leading-relaxed line-clamp-2">
                  {rate.reason || "General statutory club contribution."}
                </p>
              </article>
            );
          })}
        </div>

        {/* Change Next Month's Rate Section (Admin only) */}
        {canChangeRate && (
          <div className="space-y-3 pt-4 border-t border-[#E5DDD3]">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#D6A23A]" />
              <h3 className="text-sm font-bold text-[#3D291F]">
                Schedule Next Month&apos;s Dues Rate
              </h3>
            </div>
            <div className="flex items-start gap-2.5 bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3] text-xs text-[#54433A]">
              <p className="leading-relaxed">
                Only the President or a system administrator can schedule a rate
                change. Effective rates for past months cannot be modified; any
                already-paid future months preserve their recorded receipt
                value.
              </p>
            </div>
            <div className="pt-1">
              <DuesRateForm nextMonth={nextMonth} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
