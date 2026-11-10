"use client";

import {
  AlertTriangle,
  ChevronRight,
  FileText,
  Ticket,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardTicketTier,
  DashboardTransaction,
} from "./dashboard-types";
import { LedgerTransactionCard } from "./ledger-transaction-card";

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
  pendingTicketRevenue?: number;
  pendingRevenue?: number;
  pendingExpenses?: number;
  pendingTicketsCount?: number;
  revenueStreamsCount?: number;
  teamMembersCount?: number;
  userRole?: string;
  currentUserId?: string;
  canRecord?: boolean;
  canManageCategories?: boolean;
  onNavigateTab: (tabId: string) => void;
  onNavigateBudgetSubTab?: (
    sub: "allocation" | "revenue_mix" | "cash_velocity",
  ) => void;
  onJumpToLedger?: (
    type?: "all" | "tickets" | "revenue" | "expenses",
    category?: string,
    status?: "all" | "recorded" | "approved" | "rejected" | "cancelled",
  ) => void;
  onInspectTransaction?: (transaction: DashboardTransaction) => void;
  onOpenRecordModal: (type: "ticket" | "revenue" | "expense") => void;
  onOpenBudgetCeilingModal?: () => void;
  onManageAllocations?: () => void;
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
  pendingRevenue = 0,
  revenueStreamsCount = 0,
  teamMembersCount = 0,
  userRole,
  currentUserId,
  canManageCategories = false,
  onNavigateTab,
  onNavigateBudgetSubTab,
  onJumpToLedger,
  onInspectTransaction,
  onOpenBudgetCeilingModal,
  onManageAllocations,
}: TabOverviewProps) {
  const safeBudget = budgetCeiling || 1;
  const netSurplus = totalRevenue - totalExpenses;
  const remainingCeiling = budgetCeiling - totalExpenses;
  const ceilingUsedPercent =
    budgetCeiling > 0 ? Math.min(100, (totalExpenses / safeBudget) * 100) : 0;
  const netMarginPercent =
    totalRevenue > 0 ? (netSurplus / totalRevenue) * 100 : 0;
  const revenueCeilingPercent =
    budgetCeiling > 0 ? (totalRevenue / safeBudget) * 100 : 0;

  const totalAllocated = costCenters.reduce(
    (sum, c) => sum + (c.allocated || 0),
    0,
  );
  const unallocatedReserve = budgetCeiling - totalAllocated;
  const isOverBudget = budgetCeiling > 0 && remainingCeiling < 0;
  const overBudgetDeficit = Math.abs(Math.min(0, remainingCeiling));

  const pendingTransactions = transactions.filter(
    (t) =>
      t.status !== "voided" &&
      (t.verificationStatus === "recorded" ||
        (t.status as string) === "pending"),
  );

  const activeCostCenters = [...costCenters]
    .sort((a, b) => {
      if (b.spent !== a.spent) return b.spent - a.spent;
      const timeA = a.latestInputAt ? Date.parse(a.latestInputAt) : 0;
      const timeB = b.latestInputAt ? Date.parse(b.latestInputAt) : 0;
      return (
        (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA)
      );
    })
    .slice(0, 4);

  const capacityPercent =
    totalTicketsCapacity > 0
      ? ((totalTicketsSold / totalTicketsCapacity) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-4 min-w-0">
      {/* Over-Budget Warning Banner */}
      {isOverBudget && (
        <div className="bg-[#BA3C2A]/10 border border-[#BA3C2A]/30 rounded-2xl p-3.5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-[#BA3C2A] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#BA3C2A]">
                Budget Ceiling Exceeded by {formatNaira(overBudgetDeficit)}
              </h3>
              <p className="text-xs text-[#5C4638] mt-0.5">
                Verified event expenditures exceed the approved ceiling. Review
                cost centers or revise the budget ceiling.
              </p>
            </div>
          </div>
          <button
            className="shrink-0 px-3 py-2 min-h-[44px] rounded-xl bg-[#BA3C2A] hover:bg-[#9B3222] text-white text-xs font-semibold cursor-pointer transition-colors"
            onClick={() =>
              onNavigateBudgetSubTab
                ? onNavigateBudgetSubTab("allocation")
                : onNavigateTab("budget")
            }
            type="button"
          >
            Review Budget
          </button>
        </div>
      )}

      {/* Pending Officer Verification Strip */}
      {pendingTransactions.length > 0 && (
        <div className="bg-[#FAF6F0] border border-[#8D5B0E]/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2.5 text-[#3D291F]">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              aria-hidden="true"
              className="w-2.5 h-2.5 rounded-full bg-[#8D5B0E] shrink-0"
            />
            <span>
              <strong className="font-bold text-[#3D291F]">
                {pendingTransactions.length} pending{" "}
                {pendingTransactions.length === 1 ? "entry" : "entries"}
              </strong>{" "}
              awaiting officer review before counting toward realized totals.
            </span>
          </div>
          <button
            className="text-xs font-bold text-[#174C37] hover:underline shrink-0 cursor-pointer min-h-[44px] flex items-center"
            onClick={() =>
              onJumpToLedger
                ? onJumpToLedger("all", "", "recorded")
                : onNavigateTab("ledger")
            }
            type="button"
          >
            Review Pending ({pendingTransactions.length}) &rarr;
          </button>
        </div>
      )}

      {/* Top Row: 7-col 2x2 Interactive KPI Strip + 5-col Budget Ceiling Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left 7 Cols: 2x2 KPI Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 gap-2.5">
          {/* 1. Verified Ticket Sales */}
          <button
            className="text-left bg-white border border-[#E5DDD3] hover:border-[#174C37] rounded-2xl p-3.5 transition-all cursor-pointer shadow-2xs min-h-[44px] flex flex-col justify-between"
            onClick={() => onNavigateTab("tickets")}
            type="button"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#7A685D]">
              <span className="truncate pr-1">Ticket Sales</span>
              <Ticket className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-[#3D291F] mt-1 font-mono tabular-nums">
              {formatNaira(totalTicketRevenue)}
            </div>
            <div className="text-xs text-[#5C4638] mt-1 flex items-center justify-between gap-1">
              <span className="truncate">
                <strong className="text-[#3D291F]">{totalTicketsSold}</strong>{" "}
                of {totalTicketsCapacity} sold
              </span>
              <span className="text-[11px] text-[#174C37] font-semibold shrink-0">
                Tiers &rarr;
              </span>
            </div>
          </button>

          {/* 2. Verified Total Revenue */}
          <button
            className="text-left bg-white border border-[#E5DDD3] hover:border-[#174C37] rounded-2xl p-3.5 transition-all cursor-pointer shadow-2xs min-h-[44px] flex flex-col justify-between"
            onClick={() =>
              onNavigateBudgetSubTab
                ? onNavigateBudgetSubTab("revenue_mix")
                : onNavigateTab("budget")
            }
            type="button"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#7A685D]">
              <span className="truncate pr-1">Total Revenue</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-[#174C37] mt-1 font-mono tabular-nums">
              {formatNaira(totalRevenue)}
            </div>
            <div className="text-xs text-[#5C4638] mt-1 flex items-center justify-between gap-1">
              <span className="truncate">
                {pendingRevenue > 0
                  ? `+${formatNaira(pendingRevenue)} pending`
                  : budgetCeiling > 0
                    ? `${formatPercent(revenueCeilingPercent)} of target`
                    : "Verified inflows"}
              </span>
              <span className="text-[11px] text-[#174C37] font-semibold shrink-0">
                {revenueStreamsCount} streams &rarr;
              </span>
            </div>
          </button>

          {/* 3. Verified Total Expenses */}
          <button
            className="text-left bg-white border border-[#E5DDD3] hover:border-[#BA3C2A] rounded-2xl p-3.5 transition-all cursor-pointer shadow-2xs min-h-[44px] flex flex-col justify-between"
            onClick={() =>
              onNavigateBudgetSubTab
                ? onNavigateBudgetSubTab("allocation")
                : onNavigateTab("budget")
            }
            type="button"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#7A685D]">
              <span className="truncate pr-1">Total Expenses</span>
              <TrendingDown className="w-3.5 h-3.5 text-[#BA3C2A] shrink-0" />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-[#BA3C2A] mt-1 font-mono tabular-nums">
              {formatNaira(totalExpenses)}
            </div>
            <div className="text-xs text-[#5C4638] mt-1 flex items-center justify-between gap-1">
              <span className="truncate">
                {committedExpenses > 0
                  ? `${formatNaira(committedExpenses)} pending`
                  : budgetCeiling > 0
                    ? `${ceilingUsedPercent.toFixed(1)}% of ceiling`
                    : "Verified spend"}
              </span>
              <span className="text-[11px] text-[#BA3C2A] font-semibold shrink-0">
                {costCenters.length} centers &rarr;
              </span>
            </div>
          </button>

          {/* 4. Net Realized Position */}
          <button
            className={`text-left rounded-2xl p-3.5 transition-all cursor-pointer shadow-xs min-h-[44px] flex flex-col justify-between ${
              netSurplus >= 0
                ? "bg-[#0C3325] text-[#FAF6F0]"
                : "bg-[#BA3C2A] text-white"
            }`}
            onClick={() => onNavigateTab("statement")}
            type="button"
          >
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#E5DDD3]">
              <span className="truncate pr-1">
                {netSurplus >= 0 ? "Net Surplus" : "Net Deficit"}
              </span>
              <FileText
                className={`w-3.5 h-3.5 shrink-0 ${
                  netSurplus >= 0 ? "text-[#F0C768]" : "text-white"
                }`}
              />
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white mt-1 font-mono tabular-nums">
              {netSurplus >= 0 ? "+" : "-"}
              {formatNaira(Math.abs(netSurplus))}
            </div>
            <div className="text-xs text-[#E5DDD3] mt-1 flex items-center justify-between gap-1">
              <span className="truncate">
                Margin: {netMarginPercent.toFixed(1)}%
              </span>
              <span
                className={`text-[11px] font-semibold shrink-0 ${
                  netSurplus >= 0 ? "text-[#F0C768]" : "text-white"
                }`}
              >
                Statement &rarr;
              </span>
            </div>
          </button>
        </div>

        {/* Right 5 Cols: Approved Budget Ceiling Card */}
        <div className="lg:col-span-5 bg-white border border-[#E5DDD3] rounded-2xl p-4 flex flex-col justify-between shadow-2xs space-y-3">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A685D] block">
                  Approved Budget Ceiling
                </span>
                <div className="text-2xl font-bold text-[#3D291F] mt-0.5 font-mono tabular-nums">
                  {budgetCeiling > 0 ? formatNaira(budgetCeiling) : "Not Set"}
                </div>
              </div>
              {canManageCategories && onOpenBudgetCeilingModal && (
                <button
                  className="px-3 py-2 min-h-[44px] rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] hover:border-[#174C37] text-xs font-semibold text-[#174C37] cursor-pointer shrink-0 transition-colors"
                  onClick={onOpenBudgetCeilingModal}
                  type="button"
                >
                  {budgetCeiling > 0 ? "Edit Budget" : "Set Budget"}
                </button>
              )}
            </div>

            {budgetCeiling > 0 ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                  <span className="font-medium text-[#5C4638]">
                    Spent:{" "}
                    <strong className="text-[#3D291F] font-mono">
                      {formatNaira(totalExpenses)}
                    </strong>{" "}
                    ({ceilingUsedPercent.toFixed(1)}%)
                  </span>
                  <span
                    className={`font-semibold font-mono ${
                      remainingCeiling >= 0
                        ? "text-[#174C37]"
                        : "text-[#BA3C2A]"
                    }`}
                  >
                    {remainingCeiling >= 0
                      ? `${formatNaira(remainingCeiling)} left`
                      : `${formatNaira(Math.abs(remainingCeiling))} over`}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#E5DDD3] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${percentWidthClass(
                      ceilingUsedPercent,
                    )} ${remainingCeiling < 0 ? "bg-[#BA3C2A]" : "bg-[#174C37]"}`}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#7A685D] mt-3">
                No event spending ceiling has been configured yet.
              </p>
            )}
          </div>

          <div className="pt-2.5 border-t border-[#E5DDD3]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4638]">
            <span>
              Allocated:{" "}
              <strong className="font-mono text-[#3D291F]">
                {formatNaira(totalAllocated)}
              </strong>
              {budgetCeiling > 0 && (
                <span className="text-[#7A685D]">
                  {" "}
                  (
                  {unallocatedReserve >= 0
                    ? `${formatNaira(unallocatedReserve)} unallocated`
                    : `${formatNaira(Math.abs(unallocatedReserve))} over-allocated`}
                  )
                </span>
              )}
            </span>

            {canManageCategories && (
              <button
                className="font-semibold text-[#174C37] hover:underline cursor-pointer min-h-[44px] inline-flex items-center"
                onClick={() =>
                  onManageAllocations
                    ? onManageAllocations()
                    : onNavigateTab("budget")
                }
                type="button"
              >
                Manage Allocations &rarr;
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Middle Row: Active Cost Centers + Ticket Inventory Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Active Cost Centers */}
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-[#3D291F]">
                  Active Cost Centers
                </h2>
                <p className="text-xs text-[#7A685D]">
                  Category spending vs allocation
                </p>
              </div>
              <button
                className="text-xs font-semibold text-[#174C37] hover:underline flex items-center gap-0.5 cursor-pointer min-h-[44px]"
                onClick={() =>
                  onNavigateBudgetSubTab
                    ? onNavigateBudgetSubTab("allocation")
                    : onNavigateTab("budget")
                }
                type="button"
              >
                <span>View All ({costCenters.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeCostCenters.length === 0 ? (
              <p className="text-center py-6 text-xs text-[#7A685D]">
                No cost center allocations configured yet.
              </p>
            ) : (
              <div className="space-y-2">
                {activeCostCenters.map((cc) => {
                  const pct =
                    cc.allocated > 0
                      ? Math.min(
                          100,
                          Math.round((cc.spent / cc.allocated) * 100),
                        )
                      : 0;
                  const isOver = cc.allocated > 0 && cc.spent > cc.allocated;
                  return (
                    <button
                      className="w-full text-left p-2.5 min-h-[44px] rounded-xl bg-[#FAF6F0]/70 hover:bg-[#FAF6F0] border border-[#E5DDD3]/80 transition-colors cursor-pointer"
                      key={cc.id}
                      onClick={() =>
                        onJumpToLedger
                          ? onJumpToLedger("expenses", cc.name, "all")
                          : onNavigateTab("ledger")
                      }
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#3D291F]">
                        <span className="truncate pr-2">{cc.name}</span>
                        <span className="font-mono shrink-0 text-[#BA3C2A]">
                          {formatNaira(cc.spent)}{" "}
                          <span className="text-[#7A685D] font-normal">
                            / {formatNaira(cc.allocated)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[#E5DDD3] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${percentWidthClass(pct)} ${
                              isOver
                                ? "bg-[#BA3C2A]"
                                : pct >= 90
                                  ? "bg-[#8D5B0E]"
                                  : "bg-[#174C37]"
                            }`}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-[#5C4638] w-9 text-right">
                          {pct}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Ticket Inventory Pulse */}
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-[#3D291F]">
                  Ticket Inventory Pulse
                </h2>
                <p className="text-xs text-[#7A685D]">
                  {totalTicketsSold} of {totalTicketsCapacity} passes sold (
                  {capacityPercent}% capacity)
                </p>
              </div>
              <button
                className="text-xs font-semibold text-[#174C37] hover:underline flex items-center gap-0.5 cursor-pointer min-h-[44px]"
                onClick={() => onNavigateTab("tickets")}
                type="button"
              >
                <span>Manage Tiers</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {ticketTiers.length === 0 ? (
              <p className="text-center py-6 text-xs text-[#7A685D]">
                No ticket tiers configured yet.
              </p>
            ) : (
              <div className="space-y-2">
                {ticketTiers.slice(0, 4).map((tier) => {
                  const tierPct =
                    tier.capacity > 0
                      ? ((tier.sold / tier.capacity) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <button
                      className="w-full text-left p-2.5 min-h-[44px] rounded-xl bg-[#FAF6F0]/70 hover:bg-[#FAF6F0] border border-[#E5DDD3]/80 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                      key={tier.id}
                      onClick={() => onNavigateTab("tickets")}
                      type="button"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-[#3D291F] truncate">
                            {tier.name}
                          </span>
                          <span className="text-[11px] font-mono text-[#5C4638]">
                            ({formatNaira(tier.price)})
                          </span>
                        </div>
                        <span className="text-[11px] text-[#7A685D] block">
                          Revenue: {formatNaira(tier.sold * tier.price)}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-xs font-bold text-[#174C37]">
                          {tier.sold} / {tier.capacity}
                        </span>
                        <span className="block text-[10px] text-[#7A685D]">
                          {tierPct}% sold
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E5DDD3]/80 flex items-center justify-between text-xs gap-2">
            <span className="text-[#5C4638] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>
                Committee:{" "}
                <strong className="text-[#3D291F]">
                  {teamMembersCount} assigned
                </strong>
              </span>
            </span>
            <button
              className="text-[#174C37] font-semibold hover:underline cursor-pointer min-h-[44px] inline-flex items-center shrink-0"
              onClick={() => onNavigateTab("statement")}
              type="button"
            >
              Manage Team &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Ledger Activity (Mandatory 2-Line Cards) */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-base font-bold text-[#3D291F]">
              Recent Ledger Activity
            </h2>
            <p className="text-xs text-[#7A685D]">
              Tap any card to review receipt or officer verification
            </p>
          </div>
          <button
            className="text-xs font-semibold text-[#174C37] hover:underline flex items-center gap-0.5 cursor-pointer min-h-[44px] shrink-0"
            onClick={() =>
              onJumpToLedger
                ? onJumpToLedger("all", "", "all")
                : onNavigateTab("ledger")
            }
            type="button"
          >
            <span>Full Ledger ({transactions.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-center py-6 text-xs text-[#7A685D]">
            No ledger entries recorded yet.
          </p>
        ) : (
          <div className="space-y-1.5">
            {transactions.slice(0, 5).map((txn) => (
              <LedgerTransactionCard
                currentUserId={currentUserId}
                key={txn.id}
                onSelect={(selected) => onInspectTransaction?.(selected)}
                transaction={txn}
                userRole={userRole}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
