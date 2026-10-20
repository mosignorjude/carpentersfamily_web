"use client";

import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  FileText,
  PiggyBank,
  Plus,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { percentWidthClass } from "@/lib/percent-width-class";
import { formatNaira, formatPercent } from "./dashboard-mock-data";
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
  onNavigateTab: (tabId: string) => void;
  onOpenRecordModal: (type: "ticket" | "revenue" | "expense") => void;
}

export function TabOverview({
  event,
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
  onNavigateTab,
  onOpenRecordModal,
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

  const expensePercent =
    budgetCeiling > 0
      ? Math.min(100, Math.max(0, (totalExpenses / safeBudget) * 100))
      : 0;
  const committedPercent =
    budgetCeiling > 0
      ? Math.min(100, Math.max(0, (committedExpenses / safeBudget) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Heading & Status */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E5DDD3]">
        <div>
          <span className="text-xs font-semibold text-[#174C37] uppercase tracking-wider">
            Event Overview & Budget Allocation
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#3D291F] tracking-tight mt-1">
            {event.title} — Event Finance
          </h2>
          <p className="text-sm text-[#7A685D] mt-1">
            Financial reconciliation, ticket inventory, and operational cost
            accounting for Carpenters Family Social Club.
          </p>
        </div>

        {/* Budget Target Capsule */}
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-3.5 sm:text-right shrink-0">
          <span className="text-xs text-[#7A685D] block">
            Approved Club Budget Ceiling
          </span>
          <span className="text-xl sm:text-2xl font-bold text-[#3D291F] tabular-nums font-mono">
            {formatNaira(budgetCeiling)}
          </span>
          <div className="flex items-center gap-2 text-xs text-[#174C37] font-medium justify-start sm:justify-end mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Fully Funded & Authorized by Trustees</span>
          </div>
        </div>
      </div>

      {/* 4-Metric Financial Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Ticket Sales (Prominently Featured) */}
        <div className="bg-white rounded-2xl border-2 border-[#174C37] p-5 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-[#174C37] text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-bl-lg">
            Core Driver
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#174C37] uppercase tracking-wide">
              Ticket Sales Revenue
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#174C37]">
              <Ticket className="w-4 h-4 text-[#D6A23A]" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-[#3D291F] tabular-nums font-mono">
              {formatNaira(totalTicketRevenue)}
            </div>
            <p className="text-xs text-[#7A685D] mt-1">
              <span className="font-semibold text-[#174C37] tabular-nums">
                {totalTicketsSold}
              </span>{" "}
              of {totalTicketsCapacity} passes sold across {ticketTiers.length}{" "}
              tier{ticketTiers.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5DDD3] flex items-center justify-between text-xs">
            <span className="text-[#7A685D]">Share of Gross Revenue</span>
            <span className="font-semibold text-[#174C37] tabular-nums font-mono">
              {formatPercent(ticketPercentageOfRevenue)}
            </span>
          </div>
        </div>

        {/* 2. Total Gross Revenue */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7A685D] uppercase tracking-wide">
              Total Realized Revenue
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#174C37]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-[#3D291F] tabular-nums font-mono">
              {formatNaira(totalRevenue)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#174C37] mt-1 font-medium">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>
                {budgetCeiling > 0
                  ? `${formatPercent(revenueAgainstBudget)} of ${formatNaira(budgetCeiling)} target`
                  : "Reconciled inflows"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5DDD3] flex items-center justify-between text-xs">
            <span className="text-[#7A685D]">Active Inflow Streams</span>
            <span className="font-semibold text-[#3D291F]">
              100% Reconciled
            </span>
          </div>
        </div>

        {/* 3. Total Expenses */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7A685D] uppercase tracking-wide">
              Total Incurred Expenses
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] flex items-center justify-center text-[#BA3C2A]">
              <Wallet className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-[#3D291F] tabular-nums font-mono">
              {formatNaira(totalExpenses)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#7A685D] mt-1">
              <span className="text-[#BA3C2A] font-semibold tabular-nums">
                {formatPercent(budgetUtilization)}
              </span>
              <span>
                {budgetCeiling > 0
                  ? `of ${formatNaira(budgetCeiling)} disbursed`
                  : "disbursed to date"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5DDD3] flex items-center justify-between text-xs">
            <span className="text-[#7A685D]">Committed POs</span>
            <span className="font-semibold text-[#3D291F] tabular-nums font-mono">
              {formatNaira(committedExpenses)}
            </span>
          </div>
        </div>

        {/* 4. Net Operating Margin / Remaining Buffer */}
        <div className="bg-[#0C3325] text-white rounded-2xl border border-[#174C37] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#D6A23A] uppercase tracking-wide">
              Net Surplus & Remaining Buffer
            </span>
            <div className="w-8 h-8 rounded-lg bg-[#174C37] flex items-center justify-center text-[#D6A23A]">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-bold text-white tabular-nums font-mono">
              {formatNaira(netSurplus)}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#D6A23A] mt-1 font-medium">
              <span>
                Operating Margin:{" "}
                {totalRevenue > 0
                  ? `${netSurplus >= 0 ? "+" : ""}${formatPercent((netSurplus / totalRevenue) * 100)}`
                  : "0.0%"}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#174C37] flex items-center justify-between text-xs text-[#E5DDD3]">
            <span>Uncommitted Buffer</span>
            <span className="font-semibold text-white tabular-nums font-mono">
              {formatNaira(remainingBudget)}
            </span>
          </div>
        </div>
      </div>

      {/* Budget Burn & Allocation Progress Bar (CSP Compliant with percentWidthClass) */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#3D291F]">
              {formatNaira(budgetCeiling)} Budget Burn & Financial Health Index
            </h3>
            <p className="text-xs text-[#7A685D]">
              Direct tracking of total disbursements and pending commitments
              against the approved club authorization ceiling.
            </p>
          </div>
          <div className="text-xs font-medium text-[#174C37] sm:text-right">
            <span className="tabular-nums font-mono font-bold">
              {formatNaira(remainingBudget)}
            </span>{" "}
            Reserve Available (
            {budgetCeiling > 0
              ? formatPercent((remainingBudget / safeBudget) * 100)
              : "0.0%"}
            )
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full bg-[#FAF6F0] rounded-full h-3 overflow-hidden flex border border-[#E5DDD3]">
          <div
            className={`bg-[#174C37] h-full transition-all duration-500 ${percentWidthClass(expensePercent)}`}
            title={`Disbursed: ${formatNaira(totalExpenses)}`}
          />
          <div
            className={`bg-[#D6A23A] h-full transition-all duration-500 ${percentWidthClass(committedPercent)}`}
            title={`Committed: ${formatNaira(committedExpenses)}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-xs text-[#7A685D]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-[#174C37]" />
            <span>Disbursed Expenses ({formatNaira(totalExpenses)})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-[#D6A23A]" />
            <span>
              Committed Purchase Orders ({formatNaira(committedExpenses)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-[#FAF6F0] border border-[#E5DDD3]" />
            <span>Remaining Buffer ({formatNaira(remainingBudget)})</span>
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
                  <Ticket className="w-4 h-4 text-[#D6A23A]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#3D291F]">
                    Tickets Status
                  </h4>
                  <p className="text-[11px] text-[#7A685D]">
                    {totalTicketsSold} sold of {totalTicketsCapacity} total
                    capacity
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
                  No ticket tiers configured for this event.
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
              <Plus className="w-3.5 h-3.5 text-[#D6A23A]" />
              <span>Issue & Record Ticket Sale</span>
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
                    {costCenters.length} Center
                    {costCenters.length === 1 ? "" : "s"} ·{" "}
                    {formatNaira(totalExpenses)} disbursed
                  </p>
                </div>
              </div>
              <button
                className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline cursor-pointer"
                onClick={() => onNavigateTab("expenses")}
                type="button"
              >
                View All &rarr;
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              {costCenters.length === 0 ? (
                <p className="text-xs text-[#7A685D] py-2">
                  No cost centers or expenses recorded yet.
                </p>
              ) : (
                costCenters.slice(0, 3).map((center) => (
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
              <span>Record Expense Voucher</span>
            </button>
          )}
        </div>

        {/* Quick Financial Statement Card */}
        <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-[#D6A23A]" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[#3D291F]">
                    P&L Snapshot
                  </h4>
                  <p className="text-[11px] text-[#7A685D]">
                    {netSurplus >= 0 ? "Surplus" : "Deficit"}:{" "}
                    {formatNaira(netSurplus)}
                  </p>
                </div>
              </div>
              <button
                className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline cursor-pointer"
                onClick={() => onNavigateTab("reports")}
                type="button"
              >
                View P&L &rarr;
              </button>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between text-[#5C4638]">
                <span>Total Inflow:</span>
                <strong className="font-mono text-[#174C37]">
                  {formatNaira(totalRevenue)}
                </strong>
              </div>
              <div className="flex justify-between text-[#5C4638]">
                <span>Total Outflow:</span>
                <strong className="font-mono text-[#BA3C2A]">
                  {formatNaira(totalExpenses)}
                </strong>
              </div>
              <div className="flex justify-between font-bold text-[#3D291F] pt-1 border-t border-[#E5DDD3]">
                <span>Net Cash Margin:</span>
                <strong className="font-mono text-[#174C37]">
                  {formatNaira(netSurplus)}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="w-full py-2 bg-[#FAF6F0] text-[#174C37] border border-[#174C37]/30 rounded-xl text-xs font-semibold hover:bg-[#174C37] hover:text-white transition-colors flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer"
            onClick={() => onNavigateTab("reports")}
            type="button"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Open Executive Statement</span>
          </button>
        </div>
      </div>

      {/* Recent Audit Ledger Preview */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div>
            <h4 className="font-bold text-base text-[#3D291F]">
              Recent Transactions & Box Office Entries
            </h4>
            <p className="text-xs text-[#7A685D]">
              Latest authorized ledger entries. Complete retained history
              available in Audit log.
            </p>
          </div>

          <button
            className="text-xs text-[#174C37] bg-transparent border-0 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            onClick={() => onNavigateTab("audit_log")}
            type="button"
          >
            <span>Go to Audit Log ({transactions.length} records)</span>
            <span>&rarr;</span>
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-xs text-[#7A685D] py-4 text-center">
            No financial transactions recorded for this event yet.
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
                    <span className="font-semibold text-[#3D291F] block">
                      {txn.description}
                    </span>
                    <span className="text-[#7A685D] text-[11px]">
                      {txn.categoryLabel} · {txn.payerPayee} · Ref:{" "}
                      {txn.paymentRef}
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
