"use client";

import { Banknote, ChevronRight, Pencil, Plus, Tags } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { TableScroll } from "@/components/ui/table-scroll";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardCostCenter,
  DashboardRevenueStream,
} from "./dashboard-types";

interface TabBudgetAllocationsProps {
  budgetCeiling: number;
  costCenters: DashboardCostCenter[];
  revenueStreams: DashboardRevenueStream[];
  initialSubTab?: "allocation" | "revenue_mix" | "cash_velocity";
  canManageCategories?: boolean;
  canRecord?: boolean;
  verifiedTicketRevenue?: number;
  pendingRevenue?: number;
  committedExpenses?: number;
  onManageCategories?: () => void;
  onManageRevenueCategories?: () => void;
  onOpenBudgetCeilingModal?: () => void;
  onOpenRecordModal?: (type: "revenue" | "expense") => void;
  onJumpToLedger?: (
    type?: "all" | "tickets" | "revenue" | "expenses",
    category?: string,
    status?: "all" | "recorded" | "approved" | "rejected" | "cancelled",
  ) => void;
}

export function TabBudgetAllocations({
  budgetCeiling,
  costCenters,
  revenueStreams,
  initialSubTab = "allocation",
  canManageCategories = false,
  canRecord = false,
  verifiedTicketRevenue,
  pendingRevenue,
  committedExpenses,
  onManageCategories,
  onManageRevenueCategories,
  onOpenBudgetCeilingModal,
  onOpenRecordModal,
  onJumpToLedger,
}: TabBudgetAllocationsProps) {
  const [activeChartTab, setActiveChartTab] = useState<
    "allocation" | "revenue_mix" | "cash_velocity"
  >(initialSubTab);

  useEffect(() => {
    setActiveChartTab(initialSubTab);
  }, [initialSubTab]);

  const totalRevenue = revenueStreams.reduce((acc, s) => acc + s.actual, 0);
  const totalPendingInflows =
    pendingRevenue ?? revenueStreams.reduce((acc, s) => acc + s.pending, 0);
  const totalExpenses = costCenters.reduce((acc, c) => acc + c.spent, 0);
  const totalCommitted =
    committedExpenses ??
    costCenters.reduce((acc, c) => acc + (c.committed || 0), 0);
  const totalAllocated = costCenters.reduce(
    (sum, c) => sum + (c.allocated || 0),
    0,
  );
  const unallocated = budgetCeiling - totalAllocated;
  const ticketStreamSum =
    verifiedTicketRevenue ??
    revenueStreams
      .filter((s) => s.id === "ticket_sales")
      .reduce((sum, s) => sum + s.actual, 0);
  const directStreamsSum = Math.max(0, totalRevenue - ticketStreamSum);
  const netCashPosition = totalRevenue - totalExpenses;

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Sub-Navigation & Governance Header Card */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#3D291F]">
              Budget Allocations &amp; Revenue Streams
            </h2>
            <p className="text-xs text-[#5C4638]">
              Category spending limits, revenue targets, and net cash flow health
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageCategories && onOpenBudgetCeilingModal && (
              <button
                className="px-3 py-2 min-h-[44px] rounded-xl bg-[#FAF6F0] hover:border-[#174C37] border border-[#E5DDD3] text-xs font-bold text-[#3D291F] flex items-center gap-1.5 cursor-pointer transition-colors"
                id="btn-set-budget-total"
                onClick={onOpenBudgetCeilingModal}
                type="button"
              >
                {budgetCeiling > 0 ? (
                  <>
                    <Pencil className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>Edit Budget</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>Set Budget</span>
                  </>
                )}
              </button>
            )}

            {canManageCategories && onManageCategories && (
              <button
                className="px-3 py-2 min-h-[44px] rounded-xl bg-[#FAF6F0] hover:border-[#174C37] border border-[#E5DDD3] text-xs font-bold text-[#174C37] flex items-center gap-1.5 cursor-pointer transition-colors"
                id="btn-manage-budget-categories"
                onClick={
                  activeChartTab === "revenue_mix" && onManageRevenueCategories
                    ? onManageRevenueCategories
                    : onManageCategories
                }
                type="button"
              >
                <Tags className="w-3.5 h-3.5 text-[#174C37]" />
                <span>Manage Categories</span>
              </button>
            )}

            {canRecord && onOpenRecordModal && (
              <button
                className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                onClick={() =>
                  onOpenRecordModal(
                    activeChartTab === "revenue_mix" ? "revenue" : "expense",
                  )
                }
                type="button"
              >
                <Plus className="w-3.5 h-3.5 text-[#F0C768]" />
                <span>
                  {activeChartTab === "revenue_mix"
                    ? "Record Revenue"
                    : "Record Expense"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-tab Pills + Allocation Headroom Readout */}
        <div className="pt-3 border-t border-[#E5DDD3] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#E5DDD3] overflow-x-auto max-w-full">
            <button
              className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeChartTab === "allocation"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#5C4638] hover:text-[#3D291F]"
              }`}
              onClick={() => setActiveChartTab("allocation")}
              type="button"
            >
              Spending
            </button>
            <button
              className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeChartTab === "revenue_mix"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#5C4638] hover:text-[#3D291F]"
              }`}
              onClick={() => setActiveChartTab("revenue_mix")}
              type="button"
            >
              Revenue Mix
            </button>
            <button
              className={`px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                activeChartTab === "cash_velocity"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "text-[#5C4638] hover:text-[#3D291F]"
              }`}
              onClick={() => setActiveChartTab("cash_velocity")}
              type="button"
            >
              Cash Flow
            </button>
          </div>

          <div className="text-xs text-[#5C4638] font-mono">
            Allocated: <strong>{formatNaira(totalAllocated)}</strong> of{" "}
            <strong>{formatNaira(budgetCeiling)}</strong>{" "}
            {budgetCeiling > 0 && (
              <span className="text-[#7A685D]">
                (
                {unallocated >= 0
                  ? `${formatNaira(unallocated)} unallocated reserve`
                  : `${formatNaira(Math.abs(unallocated))} over-allocated`}
                )
              </span>
            )}
          </div>
        </div>
      </div>

      {/* View 1: Cost Center Spending vs Allocation */}
      {activeChartTab === "allocation" && (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#3D291F]">
                Cost Center Spending vs Allocation
              </h3>
              <p className="text-xs text-[#7A685D]">
                Click any category to filter its disbursements in the Ledger
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-[#BA3C2A]">
              Total Spent: {formatNaira(totalExpenses)}
            </span>
          </div>

          {costCenters.length === 0 ? (
            <EmptyStateCard
              className="my-2"
              description="Set an event budget and allocate categories to track spending."
              icon={Banknote}
              title="No Budget Allocations Yet"
              {...(canManageCategories && onOpenBudgetCeilingModal
                ? {
                    actionLabel:
                      budgetCeiling > 0 ? "Edit Budget" : "Set Budget",
                    onAction: onOpenBudgetCeilingModal,
                  }
                : {})}
            />
          ) : (
            <>
              {/* Mobile Cost Center Cards */}
              <div className="md:hidden space-y-2.5">
                {costCenters.map((cc) => {
                  const buffer = cc.allocated - cc.spent;
                  const pct =
                    cc.allocated > 0
                      ? Math.round((cc.spent / cc.allocated) * 100)
                      : 0;
                  const statusLabel =
                    buffer < 0
                      ? "Over Cap"
                      : pct >= 95
                        ? "Near Cap"
                        : "Healthy";

                  return (
                    <button
                      className="w-full text-left p-3 min-h-[44px] rounded-xl bg-[#FAF6F0]/70 hover:bg-[#FAF6F0] border border-[#E5DDD3] transition-colors cursor-pointer space-y-2.5"
                      key={`mob-cc-${cc.id}`}
                      onClick={() => onJumpToLedger?.("expenses", cc.name)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-bold text-[#3D291F] block">
                            {cc.name}
                          </span>
                          <span className="text-[11px] text-[#7A685D]">
                            {cc.items.length} item
                            {cc.items.length === 1 ? "" : "s"}
                            {cc.committed > 0
                              ? ` · Pending ${formatNaira(cc.committed)}`
                              : ""}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            buffer < 0
                              ? "bg-[#BA3C2A]/15 text-[#BA3C2A]"
                              : pct >= 95
                                ? "bg-[#8D5B0E]/15 text-[#8D5B0E]"
                                : "bg-[#174C37]/10 text-[#174C37]"
                          }`}
                        >
                          {statusLabel} ({buffer >= 0 ? "+" : "-"}
                          {formatNaira(Math.abs(buffer))})
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs font-mono bg-white p-2 rounded-lg border border-[#E5DDD3]/60">
                        <div>
                          <span className="text-[10px] font-sans text-[#7A685D] block">
                            Allocated
                          </span>
                          <span className="font-semibold text-[#3D291F]">
                            {formatNaira(cc.allocated)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-sans text-[#7A685D] block">
                            Spent
                          </span>
                          <span className="font-semibold text-[#BA3C2A]">
                            {formatNaira(cc.spent)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-sans text-[#7A685D] block">
                            Used
                          </span>
                          <span className="font-bold text-[#3D291F]">
                            {pct}%
                          </span>
                        </div>
                      </div>

                      <div className="w-full h-1.5 bg-[#E5DDD3] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${percentWidthClass(
                            Math.min(100, pct),
                          )} ${
                            buffer < 0
                              ? "bg-[#BA3C2A]"
                              : pct >= 95
                                ? "bg-[#8D5B0E]"
                                : "bg-[#174C37]"
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Desktop Cost Center Matrix Table */}
              <div className="hidden md:block">
                <TableScroll label="Budget allocation matrix">
                  <table className="w-full min-w-[580px] text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#E5DDD3] text-[11px] uppercase tracking-wider text-[#7A685D] bg-[#FAF6F0]">
                        <th className="py-2.5 px-3 rounded-tl-lg">Cost Center</th>
                        <th className="py-2.5 px-3 text-right">Allocated</th>
                        <th className="py-2.5 px-3 text-right">Share</th>
                        <th className="py-2.5 px-3 text-right">Spent</th>
                        <th className="py-2.5 px-3 text-right">Pending</th>
                        <th className="py-2.5 px-3 text-right">Remaining</th>
                        <th className="py-2.5 px-3 w-36">Used</th>
                        <th className="py-2.5 px-3 text-right rounded-tr-lg">
                          Ledger
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DDD3]/70 font-mono">
                      {costCenters.map((cc) => {
                        const buffer = cc.allocated - cc.spent;
                        const pct =
                          cc.allocated > 0
                            ? (cc.spent / cc.allocated) * 100
                            : 0;
                        const sharePct =
                          cc.percentage !== undefined
                            ? cc.percentage
                            : budgetCeiling > 0
                              ? (cc.allocated / budgetCeiling) * 100
                              : 0;

                        return (
                          <tr
                            className="hover:bg-[#FAF6F0] transition-colors"
                            key={`desk-cc-${cc.id}`}
                          >
                            <td className="py-3 px-3 font-sans">
                              <div className="font-bold text-[#3D291F]">
                                {cc.name}
                              </div>
                              <div className="text-[11px] text-[#7A685D]">
                                {cc.items.length} item
                                {cc.items.length === 1 ? "" : "s"}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-[#3D291F]">
                              {formatNaira(cc.allocated)}
                            </td>
                            <td className="py-3 px-3 text-right text-[#7A685D]">
                              {formatPercent(sharePct)}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold text-[#BA3C2A]">
                              {formatNaira(cc.spent)}
                            </td>
                            <td className="py-3 px-3 text-right text-[#8D5B0E]">
                              {formatNaira(cc.committed)}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  buffer < 0
                                    ? "bg-[#BA3C2A]/15 text-[#BA3C2A]"
                                    : pct >= 95
                                      ? "bg-[#8D5B0E]/15 text-[#8D5B0E]"
                                      : "bg-[#174C37]/10 text-[#174C37]"
                                }`}
                              >
                                {buffer >= 0 ? "+" : "-"}
                                {formatNaira(Math.abs(buffer))}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-[#E5DDD3] rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${percentWidthClass(
                                      Math.min(100, pct),
                                    )} ${
                                      buffer < 0
                                        ? "bg-[#BA3C2A]"
                                        : pct >= 95
                                          ? "bg-[#8D5B0E]"
                                          : "bg-[#174C37]"
                                    }`}
                                  />
                                </div>
                                <span className="w-11 text-right text-[11px]">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-sans">
                              <button
                                className="inline-flex items-center gap-0.5 px-2.5 py-2 min-h-[44px] rounded-lg text-xs font-semibold text-[#174C37] hover:underline cursor-pointer"
                                onClick={() =>
                                  onJumpToLedger?.("expenses", cc.name)
                                }
                                type="button"
                              >
                                <span>Ledger</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            </>
          )}
        </div>
      )}

      {/* View 2: Revenue Streams */}
      {activeChartTab === "revenue_mix" && (
        <div className="space-y-3">
          <div className="bg-[#174C37]/10 border border-[#174C37]/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#3D291F]">
              <strong>Verified Inflows:</strong> Ticket Sales (
              {formatNaira(ticketStreamSum)}) + Direct Streams (
              {formatNaira(directStreamsSum)}) ={" "}
              <strong className="font-mono text-[#174C37]">
                {formatNaira(totalRevenue)}
              </strong>
            </span>
            <button
              className="font-semibold text-[#174C37] underline cursor-pointer min-h-[44px] inline-flex items-center"
              onClick={() => onJumpToLedger?.("revenue", "", "all")}
              type="button"
            >
              View Revenue Ledger &rarr;
            </button>
          </div>

          {revenueStreams.length === 0 ? (
            <div className="bg-white border border-[#E5DDD3] rounded-2xl p-6 text-center text-xs text-[#7A685D]">
              No revenue streams recorded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {revenueStreams.map((rs) => {
                const target = rs.target > 0 ? rs.target : rs.actual || 1;
                const pct = Math.min(100, (rs.actual / target) * 100);
                const reached = rs.target > 0 && rs.actual >= rs.target;
                const isTicketStream = rs.id === "ticket_sales";

                return (
                  <button
                    className="text-left bg-white border border-[#E5DDD3] hover:border-[#174C37] rounded-2xl p-4 shadow-2xs cursor-pointer transition-colors flex flex-col justify-between min-h-[44px]"
                    key={rs.id}
                    onClick={() =>
                      onJumpToLedger?.(
                        isTicketStream ? "tickets" : "revenue",
                        isTicketStream ? "" : rs.name,
                      )
                    }
                    type="button"
                  >
                    <div className="w-full">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-base font-bold text-[#3D291F]">
                          {rs.name}
                        </h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                            reached
                              ? "bg-[#174C37]/10 text-[#174C37]"
                              : "bg-[#8D5B0E]/15 text-[#8D5B0E]"
                          }`}
                        >
                          {reached ? "Target Reached" : "Active Stream"}
                        </span>
                      </div>
                      {rs.description && (
                        <p className="text-xs text-[#7A685D] mt-0.5">
                          {rs.description}
                        </p>
                      )}
                    </div>

                    <div className="w-full mt-4">
                      <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                        <div>
                          <span className="text-[10px] font-sans text-[#7A685D] block">
                            {rs.target > 0 ? "Target" : "Pending"}
                          </span>
                          <span className="font-semibold text-[#5C4638]">
                            {rs.target > 0
                              ? formatNaira(rs.target)
                              : formatNaira(rs.pending)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-sans text-[#7A685D] block">
                            Received ({pct.toFixed(0)}%)
                          </span>
                          <span className="font-bold text-[#174C37]">
                            {formatNaira(rs.actual)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-[#E5DDD3] rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-[#174C37] rounded-full transition-all duration-300 ${percentWidthClass(
                            pct,
                          )}`}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View 3: Cash Flow Summary (Real Telemetry Only) */}
      {activeChartTab === "cash_velocity" && (
        <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-4">
          <h3 className="text-base font-bold text-[#3D291F]">
            Event Cash Flow &amp; Realized Position
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
              <span className="text-xs text-[#7A685D]">
                Gross Inflows (Verified)
              </span>
              <div className="text-xl font-bold text-[#174C37] mt-1 font-mono tabular-nums">
                +{formatNaira(totalRevenue)}
              </div>
              <span className="text-[11px] text-[#5C4638] mt-1 block">
                {formatNaira(ticketStreamSum)} tickets +{" "}
                {formatNaira(directStreamsSum)} direct streams
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
              <span className="text-xs text-[#7A685D]">
                Gross Outflows (Verified)
              </span>
              <div className="text-xl font-bold text-[#BA3C2A] mt-1 font-mono tabular-nums">
                -{formatNaira(totalExpenses)}
              </div>
              <span className="text-[11px] text-[#5C4638] mt-1 block">
                Across {costCenters.length} cost center
                {costCenters.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0C3325] text-white">
              <span className="text-xs text-[#E5DDD3]">
                Net Event Cash Position
              </span>
              <div className="text-xl font-bold text-[#F0C768] mt-1 font-mono tabular-nums">
                {netCashPosition >= 0 ? "+" : "-"}
                {formatNaira(Math.abs(netCashPosition))}
              </div>
              <span className="text-[11px] text-[#E5DDD3] mt-1 block">
                Verified inflows minus verified disbursements
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[#7A685D] block text-[11px]">
                Pending Verification (Excluded Above)
              </span>
              <span className="font-semibold text-[#3D291F]">
                Pending inflows:{" "}
                <strong className="font-mono text-[#174C37]">
                  {formatNaira(totalPendingInflows)}
                </strong>{" "}
                · Pending expense commitments:{" "}
                <strong className="font-mono text-[#8D5B0E]">
                  {formatNaira(totalCommitted)}
                </strong>
              </span>
            </div>
            <button
              className="text-xs font-semibold text-[#174C37] hover:underline cursor-pointer min-h-[44px] inline-flex items-center"
              onClick={() => onJumpToLedger?.("all", "", "recorded")}
              type="button"
            >
              Inspect Pending Entries &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
