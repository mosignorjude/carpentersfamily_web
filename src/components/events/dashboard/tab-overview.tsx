"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  FileText,
  Paperclip,
  PiggyBank,
  Plus,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardTicketTier,
  DashboardTransaction,
} from "./dashboard-types";

interface TabOverviewProps {
  event: DashboardEventInfo;
  ticketTiers: DashboardTicketTier[];
  costCenters: DashboardCostCenter[];
  transactions: DashboardTransaction[];
  totalTicketRevenue: number;
  totalTicketsSold: number;
  totalTicketsCapacity: number;
  totalRevenue: number;
  totalExpenses: number;
  committedExpenses: number;
  budgetCeiling: number;
  canRecord?: boolean;
  canManageCategories?: boolean;
  onNavigateTab: (tabId: string) => void;
  onOpenRecordModal: (type: "ticket" | "revenue" | "expense") => void;
  onOpenBudgetCeilingModal?: () => void;
}

export function TabOverview({
  ticketTiers,
  costCenters,
  transactions,
  totalTicketRevenue,
  totalTicketsSold,
  totalTicketsCapacity,
  totalRevenue,
  totalExpenses,
  committedExpenses,
  budgetCeiling,
  canRecord = false,
  canManageCategories = false,
  onNavigateTab,
  onOpenRecordModal,
  onOpenBudgetCeilingModal,
}: TabOverviewProps) {
  const safeBudget = budgetCeiling || 1;
  const netSurplus = totalRevenue - totalExpenses;
  const remainingBudget = Math.max(
    0,
    budgetCeiling - (totalExpenses + committedExpenses),
  );
  const budgetUtilization =
    budgetCeiling > 0
      ? ((totalExpenses + committedExpenses) / safeBudget) * 100
      : 0;
  const ticketPercentageOfRevenue =
    totalRevenue > 0 ? (totalTicketRevenue / totalRevenue) * 100 : 0;
  const revenueAgainstBudget =
    budgetCeiling > 0 ? (totalRevenue / safeBudget) * 100 : 0;

  const totalAllocated = costCenters.reduce(
    (sum, c) => sum + (c.allocated || 0),
    0,
  );
  const unallocatedReserve = Math.max(0, budgetCeiling - totalAllocated);
  const allocatedPercent =
    budgetCeiling > 0
      ? Math.min(100, Math.round((totalAllocated / safeBudget) * 100))
      : 0;
  const isOverBudget = budgetCeiling > 0 && totalExpenses > budgetCeiling;
  const overBudgetDeficit = Math.max(0, totalExpenses - budgetCeiling);

  const pendingTransactions = transactions.filter(
    (t) => t.status === "pending" || t.status === "unverified",
  );

  const expensePercent =
    budgetCeiling > 0
      ? Math.min(100, Math.max(0, (totalExpenses / safeBudget) * 100))
      : 0;
  const committedPercent =
    budgetCeiling > 0
      ? Math.min(100, Math.max(0, (committedExpenses / safeBudget) * 100))
      : 0;

  const latestCostCenters = [...costCenters]
    .sort((a, b) => {
      const timeA = a.latestInputAt ? Date.parse(a.latestInputAt) : 0;
      const timeB = b.latestInputAt ? Date.parse(b.latestInputAt) : 0;
      const validTimeA = Number.isNaN(timeA) ? 0 : timeA;
      const validTimeB = Number.isNaN(timeB) ? 0 : timeB;
      if (validTimeA !== validTimeB) {
        return validTimeB - validTimeA;
      }
      return (b.inputOrder ?? 0) - (a.inputOrder ?? 0);
    })
    .slice(0, 3);

  return (
    <div className="space-y-6 min-w-0">
      {/* Over-budget Deficit Warning Callout */}
      {isOverBudget && (
        <div className="bg-[#FDF2F0] border border-[#BA3C2A]/30 rounded-2xl p-4 text-[#BA3C2A] flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-sm block">
                Budget Ceiling Exceeded!
              </strong>
              <p className="text-xs text-[#7A271A] mt-0.5">
                Total event expenditures have exceeded the approved ceiling by{" "}
                <strong className="font-mono font-bold">
                  {formatNaira(overBudgetDeficit)}
                </strong>
                . Submit an executive ceiling revision or reallocate departmental funds.
              </p>
            </div>
          </div>
          {canManageCategories && onOpenBudgetCeilingModal && (
            <button
              className="px-3 py-1.5 rounded-xl bg-[#BA3C2A] text-white text-xs font-bold shrink-0 hover:bg-[#9B3222] transition-colors cursor-pointer"
              onClick={onOpenBudgetCeilingModal}
              type="button"
            >
              Revise Ceiling
            </button>
          )}
        </div>
      )}

      {/* Pending Officer Verification Alert */}
      {pendingTransactions.length > 0 && (
        <div className="bg-[#FAF6F0] border border-[#D6A23A]/50 rounded-2xl p-3.5 sm:p-4 text-[#3D291F] flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#D6A23A] shrink-0" />
            <span className="text-xs font-medium">
              <strong className="font-bold text-[#174C37]">
                {pendingTransactions.length} pending transactions
              </strong>{" "}
              awaiting officer review and receipt verification.
            </span>
          </div>
          <button
            className="text-xs font-bold text-[#174C37] hover:underline shrink-0 cursor-pointer"
            onClick={() => onNavigateTab("ledger")}
            type="button"
          >
            Review Ledger &rarr;
          </button>
        </div>
      )}

      {/* 4-Metric Financial Overview Cards: 2x2 grid on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-4">
        {/* 1. Ticket Sales (Deep links to Tickets tab) */}
        <button
          className="text-left bg-white rounded-2xl border border-[#174C37] p-3.5 sm:p-5 shadow-xs relative overflow-hidden hover:border-[#174C37] hover:shadow-md transition-all cursor-pointer group"
          onClick={() => onNavigateTab("tickets")}
          type="button"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-[#174C37] uppercase tracking-wide truncate max-w-[110px] sm:max-w-none">
              Ticket Sales
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#174C37] shrink-0 group-hover:bg-[#174C37] group-hover:text-white transition-colors">
              <Ticket className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8D5B0E] group-hover:text-white" />
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className="text-base sm:text-2xl lg:text-3xl font-bold text-[#3D291F] tabular-nums font-mono leading-tight">
              {formatNaira(totalTicketRevenue)}
            </div>
            <p className="text-[11px] sm:text-xs text-[#6B5D53] mt-0.5 sm:mt-1 truncate">
              <span className="font-semibold text-[#174C37] tabular-nums">
                {totalTicketsSold}
              </span>{" "}
              of {totalTicketsCapacity} sold
            </p>
          </div>

          <div className="hidden sm:flex mt-4 pt-3 border-t border-[#E5DDD3] items-center justify-between text-xs">
            <span className="text-[#6B5D53]">Share of Revenue</span>
            <span className="font-semibold text-[#174C37] tabular-nums font-mono">
              {formatPercent(ticketPercentageOfRevenue)}
            </span>
          </div>
        </button>

        {/* 2. Total Gross Revenue (Deep links to Budget/Revenue) */}
        <button
          className="text-left bg-white rounded-2xl border border-[#E5DDD3] p-3.5 sm:p-5 shadow-xs hover:border-[#174C37]/50 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => onNavigateTab("budget")}
          type="button"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-[#6B5D53] uppercase tracking-wide truncate max-w-[110px] sm:max-w-none">
              Total Revenue
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#174C37] shrink-0 group-hover:bg-[#174C37] group-hover:text-white transition-colors">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className="text-base sm:text-2xl lg:text-3xl font-bold text-[#3D291F] tabular-nums font-mono leading-tight">
              {formatNaira(totalRevenue)}
            </div>
            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[#174C37] mt-0.5 sm:mt-1 font-medium truncate">
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {budgetCeiling > 0
                  ? `${formatPercent(revenueAgainstBudget)} of target`
                  : "Approved revenue"}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex mt-4 pt-3 border-t border-[#E5DDD3] items-center justify-between text-xs">
            <span className="text-[#6B5D53]">Status</span>
            <span className="font-semibold text-[#3D291F]">Verified</span>
          </div>
        </button>

        {/* 3. Total Expenses (Deep links to Budget/Expenses) */}
        <button
          className="text-left bg-white rounded-2xl border border-[#E5DDD3] p-3.5 sm:p-5 shadow-xs hover:border-[#BA3C2A]/50 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => onNavigateTab("budget")}
          type="button"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-[#6B5D53] uppercase tracking-wide truncate max-w-[110px] sm:max-w-none">
              Total Expenses
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#BA3C2A] shrink-0 group-hover:bg-[#BA3C2A] group-hover:text-white transition-colors">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className="text-base sm:text-2xl lg:text-3xl font-bold text-[#3D291F] tabular-nums font-mono leading-tight">
              {formatNaira(totalExpenses)}
            </div>
            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[#6B5D53] mt-0.5 sm:mt-1 truncate">
              <span className="text-[#BA3C2A] font-semibold tabular-nums">
                {formatPercent(budgetUtilization)}
              </span>
              <span className="truncate">
                {budgetCeiling > 0 ? "of budget" : "spent"}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex mt-4 pt-3 border-t border-[#E5DDD3] items-center justify-between text-xs">
            <span className="text-[#6B5D53]">Pending Commitments</span>
            <span className="font-semibold text-[#3D291F] tabular-nums font-mono">
              {formatNaira(committedExpenses)}
            </span>
          </div>
        </button>

        {/* 4. Net Operating Margin / Remaining Buffer (Deep links to Statement) */}
        <button
          className="text-left bg-[#0C3325] text-white rounded-2xl border border-[#174C37] p-3.5 sm:p-5 shadow-xs hover:border-[#D6A23A]/60 hover:shadow-md transition-all cursor-pointer group"
          onClick={() => onNavigateTab("statement")}
          type="button"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-[#D6A23A] uppercase tracking-wide truncate max-w-[110px] sm:max-w-none">
              Net Surplus
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#174C37] flex items-center justify-center text-[#D6A23A] shrink-0">
              <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>

          <div className="mt-2 sm:mt-3">
            <div className="text-base sm:text-2xl lg:text-3xl font-bold text-white tabular-nums font-mono leading-tight">
              {formatNaira(netSurplus)}
            </div>
            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[#D6A23A] mt-0.5 sm:mt-1 font-medium truncate">
              <span className="truncate">
                Margin:{" "}
                {totalRevenue > 0
                  ? `${netSurplus >= 0 ? "+" : ""}${formatPercent((netSurplus / totalRevenue) * 100)}`
                  : "0.0%"}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex mt-4 pt-3 border-t border-[#174C37] items-center justify-between text-xs text-[#E5DDD3]">
            <span>Remaining Budget</span>
            <span className="font-semibold text-white tabular-nums font-mono">
              {formatNaira(remainingBudget)}
            </span>
          </div>
        </button>
      </div>

      {/* Approved Budget Ceiling & Headroom Card */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#174C37] uppercase tracking-wider">
                Approved Budget Ceiling
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#174C37] bg-[#174C37]/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3 text-[#174C37]" />
                Reconciled
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#3D291F] font-mono tabular-nums mt-1">
              {formatNaira(budgetCeiling)}
            </h3>
            <p className="text-xs text-[#7A685D] mt-0.5">
              Authorized club expenditure limit for this event.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canManageCategories && onOpenBudgetCeilingModal && (
              <button
                className="px-3 py-1.5 text-xs font-semibold text-[#174C37] bg-[#FAF6F0] hover:bg-[#EEEADD] border border-[#E5DDD3] rounded-xl transition-colors cursor-pointer min-h-[38px]"
                id="btn-overview-budget-ceiling"
                onClick={onOpenBudgetCeilingModal}
                type="button"
              >
                {budgetCeiling > 0 ? "Edit Ceiling" : "Set Ceiling"}
              </button>
            )}
            <button
              className="px-3 py-1.5 text-xs font-semibold text-[#3D291F] bg-white hover:bg-stone-50 border border-[#E5DDD3] rounded-xl transition-colors cursor-pointer min-h-[38px]"
              onClick={() => onNavigateTab("budget")}
              type="button"
            >
              Manage Allocations &rarr;
            </button>
          </div>
        </div>

        {/* Headroom utilization progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5C4638] font-medium">
              Allocated:{" "}
              <strong className="text-[#3D291F] font-mono font-bold">
                {formatNaira(totalAllocated)}
              </strong>{" "}
              ({allocatedPercent}% of ceiling)
            </span>
            <span className="text-[#7A685D] font-mono">
              Unallocated Headroom:{" "}
              <strong className="text-[#174C37] font-bold">
                {formatNaira(unallocatedReserve)}
              </strong>
            </span>
          </div>

          <div className="w-full bg-[#FAF6F0] rounded-full h-3 overflow-hidden flex border border-[#E5DDD3]">
            <div
              className={`bg-[#174C37] h-full transition-all duration-500 ${percentWidthClass(allocatedPercent)}`}
              title={`Allocated: ${formatNaira(totalAllocated)}`}
            />
            <div
              className={`bg-[#FAF6F0] h-full transition-all duration-500 ${percentWidthClass(100 - allocatedPercent)}`}
              title={`Unallocated Headroom: ${formatNaira(unallocatedReserve)}`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
            <div className="bg-[#FAF6F0] p-2.5 rounded-xl border border-[#E5DDD3]">
              <span className="text-[11px] text-[#7A685D] block">
                Allocated to Desks
              </span>
              <span className="font-mono font-bold text-[#3D291F]">
                {formatNaira(totalAllocated)}
              </span>
            </div>
            <div className="bg-[#FAF6F0] p-2.5 rounded-xl border border-[#E5DDD3]">
              <span className="text-[11px] text-[#7A685D] block">
                Unallocated Buffer
              </span>
              <span className="font-mono font-bold text-[#174C37]">
                {formatNaira(unallocatedReserve)}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-[#FAF6F0] p-2.5 rounded-xl border border-[#E5DDD3]">
              <span className="text-[11px] text-[#7A685D] block">
                Actual Spent
              </span>
              <span
                className={`font-mono font-bold ${isOverBudget ? "text-[#BA3C2A]" : "text-[#3D291F]"}`}
              >
                {formatNaira(totalExpenses)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Snapshot Modules & Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Box Office Card */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center">
                  <Ticket className="w-4 h-4 text-[#8D5B0E]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#3D291F]">
                    Ticket Sales
                  </h4>
                  <p className="text-[11px] text-[#7A685D]">
                    {totalTicketsSold} of {totalTicketsCapacity} sold
                  </p>
                </div>
              </div>
              <button
                className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline cursor-pointer"
                onClick={() => onNavigateTab("tickets")}
                type="button"
              >
                View All &rarr;
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {ticketTiers.length === 0 ? (
                <p className="text-xs text-[#7A685D] py-2">
                  No ticket tiers yet.
                </p>
              ) : (
                ticketTiers.slice(0, 3).map((tier) => (
                  <div
                    className="flex items-center justify-between text-xs py-1 border-b border-[#FAF6F0]"
                    key={tier.id}
                  >
                    <span className="text-[#5C4638] font-medium">
                      {tier.name}
                    </span>
                    <span className="font-mono font-semibold text-[#174C37]">
                      {tier.sold} / {tier.capacity}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {canRecord && (
            <button
              className="w-full py-2 bg-[#174C37] text-white rounded-xl text-xs font-semibold hover:bg-[#103D2B] transition-colors flex items-center justify-center gap-1.5 min-h-[38px] shadow-xs cursor-pointer"
              onClick={() => onOpenRecordModal("ticket")}
              type="button"
            >
              <Plus className="w-3.5 h-3.5 text-[#85B89A]" />
              <span>Record Ticket Sale</span>
            </button>
          )}
        </div>

        {/* Quick Budget & Expenses Card */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#BA3C2A]/10 text-[#BA3C2A] flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#3D291F]">
                    Cost Centers
                  </h4>
                  <p className="text-[11px] text-[#7A685D]">
                    {costCenters.length}{" "}
                    {costCenters.length === 1 ? "Category" : "Categories"} ·{" "}
                    {formatNaira(totalExpenses)} spent
                  </p>
                </div>
              </div>
              <button
                className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline cursor-pointer"
                onClick={() => onNavigateTab("budget")}
                type="button"
              >
                View All &rarr;
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {latestCostCenters.length === 0 ? (
                <p className="text-xs text-[#7A685D] py-2">
                  No expenses recorded yet.
                </p>
              ) : (
                latestCostCenters.map((center) => (
                  <div
                    className="flex items-center justify-between text-xs py-1 border-b border-[#FAF6F0]"
                    key={center.id}
                  >
                    <span className="text-[#5C4638] font-medium truncate max-w-[140px]">
                      {center.name}
                    </span>
                    <span className="font-mono text-xs text-right">
                      <span className="font-semibold text-[#BA3C2A]">
                        {formatNaira(center.spent)}
                      </span>
                      <span className="text-[10px] text-[#7A685D] ml-1">
                        (
                        {formatPercent(
                          center.percentage !== undefined
                            ? center.percentage
                            : budgetCeiling > 0
                              ? (center.allocated / safeBudget) * 100
                              : 0,
                        )}
                        )
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {canRecord && (
            <button
              className="w-full py-2 bg-white border border-[#E5DDD3] text-[#3D291F] rounded-xl text-xs font-semibold hover:bg-[#FAF6F0] transition-colors flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
              onClick={() => onOpenRecordModal("expense")}
              type="button"
            >
              <Plus className="w-3.5 h-3.5 text-[#BA3C2A]" />
              <span>Record Expense</span>
            </button>
          )}
        </div>

        {/* Quick Financial Statement Card */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-[#174C37]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#3D291F]">
                    Financial Summary
                  </h4>
                  <p className="text-[11px] text-[#7A685D]">
                    {netSurplus >= 0 ? "Surplus" : "Deficit"}:{" "}
                    {formatNaira(netSurplus)}
                  </p>
                </div>
              </div>
              <button
                className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline cursor-pointer"
                onClick={() => onNavigateTab("statement")}
                type="button"
              >
                View Report &rarr;
              </button>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between text-[#5C4638]">
                <span>Total Revenue:</span>
                <strong className="font-mono text-[#174C37]">
                  {formatNaira(totalRevenue)}
                </strong>
              </div>
              <div className="flex justify-between text-[#5C4638]">
                <span>Total Expenses:</span>
                <strong className="font-mono text-[#BA3C2A]">
                  {formatNaira(totalExpenses)}
                </strong>
              </div>
              <div className="flex justify-between font-bold text-[#3D291F] pt-1 border-t border-[#E5DDD3]">
                <span>Net Balance:</span>
                <strong className="font-mono text-[#174C37]">
                  {formatNaira(netSurplus)}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="w-full py-2 bg-[#FAF6F0] text-[#174C37] border border-[#174C37]/30 rounded-xl text-xs font-semibold hover:bg-[#174C37] hover:text-white transition-colors flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
            onClick={() => onNavigateTab("statement")}
            type="button"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Full Report</span>
          </button>
        </div>
      </div>

      {/* Recent Audit Ledger Preview */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div>
            <h4 className="font-bold text-base text-[#3D291F]">
              Recent Transactions
            </h4>
            <p className="text-xs text-[#7A685D]">
              Latest recorded event transactions across all categories.
            </p>
          </div>

          <button
            className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            onClick={() => onNavigateTab("ledger")}
            type="button"
          >
            <span>Master Ledger ({transactions.length})</span>
            <span>&rarr;</span>
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#7A685D] py-4 text-center">
            No transactions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-[#E5DDD3]">
            {transactions.slice(0, 5).map((txn) => (
              <div
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                key={txn.id}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                      txn.type === "revenue"
                        ? "bg-[#174C37]/10 text-[#174C37]"
                        : "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                    }`}
                  >
                    {txn.type === "revenue" ? "+" : "-"}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#3D291F]">
                        {txn.description}
                      </span>
                      {txn.receiptUrl && (
                        <Paperclip className="w-3 h-3 text-[#7A685D]" />
                      )}
                    </div>
                    <span className="text-[#7A685D] text-[11px]">
                      {txn.categoryLabel} · {txn.payerPayee}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <span className="text-[#7A685D] text-[11px] font-mono">
                    {txn.date}
                  </span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      txn.status === "voided"
                        ? "line-through text-[#7A685D]"
                        : txn.type === "revenue"
                          ? "text-[#174C37]"
                          : "text-[#BA3C2A]"
                    }`}
                  >
                    {txn.type === "revenue" ? "+" : "-"}
                    {formatNaira(txn.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
