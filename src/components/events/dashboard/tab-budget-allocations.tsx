"use client";

import { BarChart3, Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
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
  canManageCategories?: boolean;
  onManageCategories?: () => void;
  onOpenBudgetCeilingModal?: () => void;
}

export function TabBudgetAllocations({
  budgetCeiling,
  costCenters,
  revenueStreams,
  canManageCategories,
  onManageCategories,
  onOpenBudgetCeilingModal,
}: TabBudgetAllocationsProps) {
  const [activeChartTab, setActiveChartTab] = useState<
    "allocation" | "revenue_mix" | "cash_velocity"
  >("allocation");

  const totalRevenue = revenueStreams.reduce((acc, s) => acc + s.actual, 0);
  const totalExpenses = costCenters.reduce((acc, c) => acc + c.spent, 0);

  // Cash flow summary
  const cashTimeline = [
    {
      week: "Phase 1 (Advance Setup)",
      inflow: Math.round(totalRevenue * 0.2),
      outflow: Math.round(totalExpenses * 0.35),
      net: Math.round(totalRevenue * 0.2) - Math.round(totalExpenses * 0.35),
    },
    {
      week: "Phase 2 (Pre-Event)",
      inflow: Math.round(totalRevenue * 0.3),
      outflow: Math.round(totalExpenses * 0.25),
      net: Math.round(totalRevenue * 0.3) - Math.round(totalExpenses * 0.25),
    },
    {
      week: "Phase 3 (Event Window)",
      inflow: Math.round(totalRevenue * 0.35),
      outflow: Math.round(totalExpenses * 0.25),
      net: Math.round(totalRevenue * 0.35) - Math.round(totalExpenses * 0.25),
    },
    {
      week: "Phase 4 (Reconciliation)",
      inflow:
        totalRevenue -
        (Math.round(totalRevenue * 0.2) +
          Math.round(totalRevenue * 0.3) +
          Math.round(totalRevenue * 0.35)),
      outflow:
        totalExpenses -
        (Math.round(totalExpenses * 0.35) +
          Math.round(totalExpenses * 0.25) +
          Math.round(totalExpenses * 0.25)),
      net:
        totalRevenue -
        totalExpenses -
        (Math.round(totalRevenue * 0.85) - Math.round(totalExpenses * 0.85)),
    },
  ];

  return (
    <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6">
      {/* Chart Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#174C37]" />
            <h3 className="text-lg font-bold text-[#3D291F]">
              Budget Allocation & Financial Analytics
            </h3>
          </div>
          <p className="text-xs text-[#7A685D] mt-1">
            Visual distribution of approved capital allocations, revenue
            diversification, and cash velocity.
          </p>
        </div>

        {/* Header Controls: Budget Total, Categories button and Chart Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {canManageCategories && onOpenBudgetCeilingModal && (
            <button
              className="px-3.5 py-1.5 bg-[#174C37] text-white hover:bg-[#123B2B] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[36px] shadow-xs shrink-0 cursor-pointer"
              id="btn-set-budget-total"
              onClick={onOpenBudgetCeilingModal}
              type="button"
            >
              {budgetCeiling > 0 ? (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Budget Total</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Set Budget Total</span>
                </>
              )}
            </button>
          )}

          {canManageCategories && onManageCategories && (
            <button
              className="px-3.5 py-1.5 bg-white text-[#174C37] border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[36px] shadow-xs shrink-0 cursor-pointer"
              id="btn-manage-budget-categories"
              onClick={onManageCategories}
              type="button"
            >
              <Tags className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Categories</span>
            </button>
          )}

          {/* Chart View Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] cursor-pointer ${
                activeChartTab === "allocation"
                  ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              onClick={() => setActiveChartTab("allocation")}
              type="button"
            >
              Cost Center Spending
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] cursor-pointer ${
                activeChartTab === "revenue_mix"
                  ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              onClick={() => setActiveChartTab("revenue_mix")}
              type="button"
            >
              Revenue Composition
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px] cursor-pointer ${
                activeChartTab === "cash_velocity"
                  ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              onClick={() => setActiveChartTab("cash_velocity")}
              type="button"
            >
              Cash Velocity Timeline
            </button>
          </div>
        </div>
      </div>

      {/* View 1: Consolidated Capital Allocation & Burn Rate Matrix */}
      {activeChartTab === "allocation" && (
        <div className="space-y-6">
          {costCenters.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D] space-y-3">
              <p>
                No budget allocations or cost centers configured for this event
                yet.
              </p>
              {canManageCategories && onOpenBudgetCeilingModal && (
                <div>
                  <button
                    className="px-4 py-2 bg-[#174C37] text-white hover:bg-[#123B2B] rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 min-h-[36px] shadow-xs cursor-pointer"
                    id="btn-open-budget-ceiling-empty"
                    onClick={onOpenBudgetCeilingModal}
                    type="button"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {budgetCeiling > 0
                        ? "Edit Budget Total"
                        : "Set Budget Total"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
                <div>
                  <h4 className="text-base font-bold text-[#3D291F]">
                    Capital Allocation & Burn Rate Matrix
                  </h4>
                  <p className="text-xs text-[#7A685D] mt-0.5">
                    Authorized ceiling allocations, actual disbursements, and
                    operational commitments.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
                    <span className="text-[11px] text-[#7A685D] block">
                      Total Ceiling
                    </span>
                    <span className="font-bold text-[#174C37] text-sm tabular-nums font-mono">
                      {formatNaira(budgetCeiling)}
                    </span>
                  </div>
                  <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
                    <span className="text-[11px] text-[#7A685D] block">
                      Overall Burn Rate
                    </span>
                    <span className="font-bold text-[#3D291F] text-sm tabular-nums font-mono">
                      {formatPercent(
                        budgetCeiling > 0
                          ? ((totalExpenses +
                              costCenters.reduce(
                                (s, c) => s + c.committed,
                                0,
                              )) /
                              budgetCeiling) *
                              100
                          : 0,
                      )}
                    </span>
                  </div>
                  {canManageCategories && onOpenBudgetCeilingModal && (
                    <button
                      className="px-3.5 py-2 bg-white text-[#174C37] border border-[#174C37]/30 hover:bg-[#FAF6F0] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[40px] shadow-xs cursor-pointer"
                      onClick={onOpenBudgetCeilingModal}
                      type="button"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>
                        {budgetCeiling > 0 ? "Edit Ceiling" : "Set Ceiling"}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Matrix Table */}
              <TableScroll label="Budget allocations">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5DDD3] bg-[#F7F3EC] text-[#7A685D] uppercase tracking-wider font-semibold text-[11px]">
                      <th className="py-2.5 px-3.5">Cost Center</th>
                      <th className="py-2.5 px-3.5">Allocated Ceiling</th>
                      <th className="py-2.5 px-3.5">Disbursed Spend</th>
                      <th className="py-2.5 px-3.5">Committed POs</th>
                      <th className="py-2.5 px-3.5">Burn Rate Bar</th>
                      <th className="py-2.5 px-3.5 text-right">
                        Buffer Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBE5DC]">
                    {costCenters.map((center) => {
                      const totalUtilized = center.spent + center.committed;
                      const percent = Math.min(
                        100,
                        (totalUtilized / (center.allocated || 1)) * 100,
                      );
                      const variance = center.allocated - totalUtilized;
                      const isOverBudget = variance < 0;

                      return (
                        <tr
                          key={center.id}
                          className="hover:bg-[#FAF6F0]/50 transition-colors"
                        >
                          <td className="py-3 px-3.5 font-bold text-[#3D291F]">
                            {center.name}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono font-semibold text-[#3D291F]">
                            {formatNaira(center.allocated)}{" "}
                            <span className="text-[11px] font-normal text-[#7A685D]">
                              (
                              {formatPercent(
                                center.percentage !== undefined
                                  ? center.percentage
                                  : budgetCeiling > 0
                                    ? (center.allocated / budgetCeiling) * 100
                                    : 0,
                              )}
                              )
                            </span>
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-[#BA3C2A]">
                            {formatNaira(center.spent)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[#D6A23A]">
                            {formatNaira(center.committed)}
                          </td>
                          <td className="py-3 px-3.5 whitespace-nowrap min-w-[140px]">
                            <div className="flex items-baseline justify-between font-mono text-xs">
                              <span className="font-semibold text-[#3D291F]">
                                {formatPercent(percent)}
                              </span>
                            </div>
                            <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isOverBudget
                                    ? "bg-[#BA3C2A]"
                                    : percent > 85
                                      ? "bg-[#D6A23A]"
                                      : "bg-[#174C37]"
                                } ${percentWidthClass(percent)}`}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            {isOverBudget ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]">
                                {formatNaira(Math.abs(variance))} Deficit
                              </span>
                            ) : percent > 85 ? (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7]">
                                Near Cap (+{formatNaira(variance)})
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                                Healthy (+{formatNaira(variance)})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          )}
        </div>
      )}

      {/* View 2: Revenue Composition */}
      {activeChartTab === "revenue_mix" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {revenueStreams.map((stream) => {
              const sharePercent = Math.min(
                100,
                (stream.actual / (totalRevenue || 1)) * 100,
              );
              return (
                <div
                  className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2"
                  key={stream.id}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#3D291F]">
                      {stream.name}
                    </span>
                    <span className="text-xs font-semibold text-[#174C37] font-mono">
                      {formatPercent(sharePercent)}
                    </span>
                  </div>
                  <div className="text-base font-bold text-[#174C37] font-mono tabular-nums">
                    {formatNaira(stream.actual)}
                  </div>
                  <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`bg-[#174C37] h-full rounded-full transition-all duration-300 ease-out ${percentWidthClass(
                        sharePercent,
                      )}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-[#7A685D]">
                    <span>Target: {formatNaira(stream.target)}</span>
                    <span>
                      {stream.actual >= stream.target ? "Achieved" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638]">
            <p>
              <strong>Revenue Composition Analysis: </strong>
              Ticketing represents the core driver of club event finance,
              supplemented by corporate brand sponsorships and on-site
              concessions. All streams are audited weekly under club policy.
            </p>
          </div>
        </div>
      )}

      {/* View 3: Cash Velocity Timeline */}
      {activeChartTab === "cash_velocity" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cashTimeline.map((item) => (
              <div
                className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2 text-xs"
                key={item.week}
              >
                <span className="font-bold text-[#3D291F] block text-xs">
                  {item.week}
                </span>
                <div className="space-y-1">
                  <div className="flex justify-between text-[#5C4638]">
                    <span>Inflow:</span>
                    <strong className="text-[#174C37] font-mono">
                      +{formatNaira(item.inflow)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-[#5C4638]">
                    <span>Outflow:</span>
                    <strong className="text-[#BA3C2A] font-mono">
                      -{formatNaira(item.outflow)}
                    </strong>
                  </div>
                </div>
                <div className="pt-2 border-t border-[#E5DDD3] flex justify-between font-bold">
                  <span>Net Flow:</span>
                  <span
                    className={`font-mono ${
                      item.net >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                    }`}
                  >
                    {item.net >= 0 ? "+" : ""}
                    {formatNaira(item.net)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#E5DDD3] text-xs text-[#5C4638]">
            <p>
              <strong>Treasury Velocity Note: </strong>
              Cash outflows peak during initial venue lease and headline talent
              deposit commitments (Weeks 1 & 2), and are swiftly balanced by
              ticket settlement inflows and corporate partner disbursements
              (Weeks 3 & 4).
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
