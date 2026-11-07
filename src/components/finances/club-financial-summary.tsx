"use client";

import {
  AlertCircle,
  Coins,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { formatNaira } from "@/lib/format";

interface ClubFinancialSummaryProps {
  currentBalance: number | string | null | undefined;
  duesIncome: number | string | null | undefined;
  otherIncome: number | string | null | undefined;
  totalExpenses: number | string | null | undefined;
  eventInflow: number | string | null | undefined;
  eventOutflow: number | string | null | undefined;
  isUnavailable?: boolean;
}

export function ClubFinancialSummary({
  currentBalance,
  duesIncome,
  otherIncome,
  totalExpenses,
  eventInflow,
  eventOutflow,
  isUnavailable = false,
}: ClubFinancialSummaryProps) {
  const inflow = Number(eventInflow ?? 0);
  const outflow = Number(eventOutflow ?? 0);
  const eventNet = inflow - outflow;

  return (
    <section aria-labelledby="summary-heading" className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 border-b border-[#E5DDD3] gap-1">
        <h3
          className="text-xs font-bold text-[#7A685D] uppercase tracking-wider"
          id="summary-heading"
        >
          Financial Summary
        </h3>
      </div>

      {isUnavailable ? (
        <div className="p-6 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-[#D6A23A]/15 text-[#3D291F] flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <h4 className="text-sm font-bold text-[#3D291F]">
            Club Account Balances Verification Pending
          </h4>
          <p className="text-xs text-[#7A685D] max-w-md mx-auto leading-relaxed">
            Financial reconciliation with club treasury records is currently in
            progress. Missing balances are held as unverified rather than
            reported as zero.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. All-time Current Balance */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#174C37]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Current Balance
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#174C37] shadow-xs" />
              </div>
              <div className="text-2xl font-black font-mono text-[#0C3325] tracking-tight tabular-nums">
                {formatNaira(currentBalance)}
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#5C4638] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>Verified club balance</span>
            </div>
          </div>

          {/* 2. Dues Income (Collective) */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#174C37]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Dues Income
                </span>
                <Coins className="w-4 h-4 text-[#174C37]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#174C37] tracking-tight tabular-nums">
                {formatNaira(duesIncome)}
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
              <span>Total member dues collected</span>
            </div>
          </div>

          {/* 3. Other Income */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#D6A23A]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Other Income
                </span>
                <TrendingUp className="w-4 h-4 text-[#D6A23A]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#3D291F] tracking-tight tabular-nums">
                {formatNaira(otherIncome)}
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
              <span>Donations, grants, and sponsors</span>
            </div>
          </div>

          {/* 4. Total Expenses */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#BA3C2A]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Club Expenses
                </span>
                <TrendingDown className="w-4 h-4 text-[#BA3C2A]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#BA3C2A] tracking-tight tabular-nums">
                {formatNaira(totalExpenses)}
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
              <span>Approved club expenses</span>
            </div>
          </div>

          {/* 5. Event Cash (Same Account) */}
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#D6A23A]/40">
            <div>
              <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                <span className="font-bold uppercase tracking-wider text-[10px]">
                  Event Cash (Live)
                </span>
                <Scale className="w-4 h-4 text-[#D6A23A]" />
              </div>
              <div className="text-2xl font-black font-mono text-[#3D291F] tracking-tight tabular-nums">
                {formatNaira(eventNet)}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#54433A]">
                <span>In {formatNaira(eventInflow)}</span>
                <span>Out {formatNaira(eventOutflow)}</span>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
              <span>
                One account, so it counts as it moves - never as club income or
                expenses
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
