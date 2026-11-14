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
  openingBalanceTotal?: number | string | null;
  postLaunchDues?: number | string | null;
  preLaunchDues?: number | string | null;
  isUnavailable?: boolean;
}

export function ClubFinancialSummary({
  currentBalance,
  duesIncome,
  otherIncome,
  totalExpenses,
  eventInflow,
  eventOutflow,
  openingBalanceTotal = 0,
  postLaunchDues = 0,
  preLaunchDues = 0,
  isUnavailable = false,
}: ClubFinancialSummaryProps) {
  const inflow = Number(eventInflow ?? 0);
  const outflow = Number(eventOutflow ?? 0);
  const eventNet = inflow - outflow;
  const openingReserve = Number(openingBalanceTotal ?? 0);
  const postLaunch = Number(postLaunchDues ?? 0);
  const preLaunch = Number(preLaunchDues ?? 0);
  const otherIncomeTotal = Number(otherIncome ?? 0);
  const expensesTotal = Number(totalExpenses ?? 0);

  return (
    <section aria-labelledby="summary-heading" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 border-b border-[#E5DDD3] gap-1">
        <h3
          className="text-xs font-bold text-[#7A685D] uppercase tracking-wider"
          id="summary-heading"
        >
          Treasury Position &amp; Breakdown
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
        <div className="space-y-4">
          {/* Verified Current Balance Hero + Cash Reconciliation Strip */}
          <div className="rounded-2xl bg-[#0C3325] text-white border border-[#174C37] p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#EED7A1]">
                  <ShieldCheck className="w-4 h-4 text-[#D6A23A] shrink-0" />
                  <span>Verified Current Balance</span>
                </div>
                <div className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight tabular-nums">
                  {formatNaira(currentBalance)}
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-[#F6F1EA]">
                <span className="w-2 h-2 rounded-full bg-[#D6A23A]" />
                Cash-reconciled treasury total
              </span>
            </div>

            <div className="pt-3 border-t border-white/15 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-[#F6F1EA]">
                <span className="text-white/70">Opening Reserve</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatNaira(openingReserve)}
                </span>
              </span>
              <span className="text-white/60 font-bold" aria-hidden="true">
                +
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-[#F6F1EA]">
                <span className="text-white/70">Post-Launch Dues</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatNaira(postLaunch)}
                </span>
              </span>
              <span className="text-white/60 font-bold" aria-hidden="true">
                +
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-[#F6F1EA]">
                <span className="text-white/70">Other Income</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatNaira(otherIncomeTotal)}
                </span>
              </span>
              <span className="text-white/60 font-bold" aria-hidden="true">
                +
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-[#F6F1EA]">
                <span className="text-white/70">Live Event Net</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatNaira(eventNet)}
                </span>
              </span>
              <span className="text-white/60 font-bold" aria-hidden="true">
                −
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/8 border border-white/10 text-[#F6F1EA]">
                <span className="text-white/70">Club Expenses</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatNaira(expensesTotal)}
                </span>
              </span>
            </div>
          </div>

          {/* 4-Up Supporting Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Dues Income (Collective: Post-Launch + Pre-Launch Reconciled) */}
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#174C37]/40">
              <div>
                <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Dues Income
                  </span>
                  <Coins className="w-4 h-4 text-[#174C37]" />
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#174C37] tracking-tight tabular-nums">
                  {formatNaira(duesIncome)}
                </div>
              </div>
              <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D] tabular-nums">
                {preLaunch > 0 ? (
                  <span>
                    Post-launch {formatNaira(postLaunch)} · Pre-launch{" "}
                    {formatNaira(preLaunch)}
                  </span>
                ) : (
                  <span>Total member dues collected</span>
                )}
              </div>
            </div>

            {/* 2. Other Income */}
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#D6A23A]/40">
              <div>
                <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Other Income
                  </span>
                  <TrendingUp className="w-4 h-4 text-[#D6A23A]" />
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#3D291F] tracking-tight tabular-nums">
                  {formatNaira(otherIncome)}
                </div>
              </div>
              <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
                <span>Donations, grants, and sponsors</span>
              </div>
            </div>

            {/* 3. Total Expenses */}
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#BA3C2A]/40">
              <div>
                <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Club Expenses
                  </span>
                  <TrendingDown className="w-4 h-4 text-[#BA3C2A]" />
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#BA3C2A] tracking-tight tabular-nums">
                  {formatNaira(totalExpenses)}
                </div>
              </div>
              <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
                <span>Approved club expenses</span>
              </div>
            </div>

            {/* 4. Event Cash (Live) */}
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs flex flex-col justify-between transition-all hover:border-[#D6A23A]/40">
              <div>
                <div className="flex items-center justify-between text-xs text-[#7A685D] mb-1.5">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Event Cash (Live)
                  </span>
                  <Scale className="w-4 h-4 text-[#D6A23A]" />
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-[#3D291F] tracking-tight tabular-nums">
                  {formatNaira(eventNet)}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] font-mono tabular-nums text-[#54433A]">
                  <span>In {formatNaira(eventInflow)}</span>
                  <span>Out {formatNaira(eventOutflow)}</span>
                </div>
              </div>
              <div className="pt-3 mt-3 border-t border-[#FAF6F0] text-[11px] text-[#7A685D]">
                <span>
                  One account, so it counts as it moves - never as club income
                  or expenses
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
