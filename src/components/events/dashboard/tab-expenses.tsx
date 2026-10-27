"use client";

import {
  Megaphone,
  Music,
  Plus,
  Search,
  ShieldAlert,
  Tent,
  Wallet,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type { DashboardCostCenter, ExpenseCategory } from "./dashboard-types";

interface TabExpensesProps {
  costCenters: DashboardCostCenter[];
  canRecord: boolean;
  onRecordExpense: (category?: ExpenseCategory) => void;
  budgetCeiling?: number;
}

export function TabExpenses({
  costCenters,
  canRecord,
  onRecordExpense,
  budgetCeiling = 0,
}: TabExpensesProps) {
  const [selectedCenter, setSelectedCenter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const centerIcons: Record<
    ExpenseCategory,
    React.ComponentType<{ className?: string }>
  > = {
    talent_booking: Music,
    venue_production: Tent,
    marketing_promotion: Megaphone,
    operations_safety: ShieldAlert,
  };

  const totalAllocated = costCenters.reduce((acc, c) => acc + c.allocated, 0);
  const totalSpent = costCenters.reduce((acc, c) => acc + c.spent, 0);
  const totalCommitted = costCenters.reduce((acc, c) => acc + c.committed, 0);
  const totalRemaining =
    budgetCeiling > 0
      ? Math.max(0, budgetCeiling - (totalSpent + totalCommitted))
      : totalAllocated - (totalSpent + totalCommitted);

  const filteredCenters = costCenters.filter((center) => {
    if (selectedCenter !== "all" && center.id !== selectedCenter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = center.name.toLowerCase().includes(q);
      const matchItem = center.items.some(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.vendor.toLowerCase().includes(q),
      );
      return matchName || matchItem;
    }
    return true;
  });

  return (
    <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-6 overflow-hidden max-w-full">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#174C37]" />
            <h3 className="text-lg font-bold text-[#3D291F]">
              Expense Management & Cost Centers
            </h3>
          </div>
          <p className="text-xs text-[#7A685D] mt-1">
            Reconciliation of operational cost centers and authorized
            disbursements configured for this event.
          </p>
        </div>

        {/* Aggregate Expense Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
            <span className="text-[11px] text-[#7A685D] block">
              Disbursed Outflows
            </span>
            <span className="font-bold text-[#BA3C2A] text-base tabular-nums font-mono">
              {formatNaira(totalSpent)}
            </span>
          </div>
          <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
            <span className="text-[11px] text-[#7A685D] block">
              Committed POs
            </span>
            <span className="font-bold text-[#D6A23A] text-base tabular-nums font-mono">
              {formatNaira(totalCommitted)}
            </span>
          </div>
          <div className="bg-[#FAF6F0] px-3.5 py-2 rounded-xl border border-[#E5DDD3] text-right">
            <span className="text-[11px] text-[#7A685D] block">
              Unallocated Buffer
            </span>
            <span className="font-bold text-[#174C37] text-base tabular-nums font-mono">
              {formatNaira(totalRemaining)}
            </span>
          </div>

          {canRecord && (
            <button
              className="px-4 py-2.5 bg-[#BA3C2A] text-white rounded-xl font-semibold hover:bg-[#8E2A1C] transition-colors flex items-center gap-1.5 min-h-[44px] shadow-xs shrink-0 cursor-pointer"
              id="btn-record-disbursement"
              onClick={() => onRecordExpense()}
              type="button"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Record Disbursement</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 min-w-0 max-w-full">
        {/* Segmented Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto min-w-0 max-w-full flex-1">
          <button
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
              selectedCenter === "all"
                ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
            }`}
            onClick={() => setSelectedCenter("all")}
            type="button"
          >
            All Cost Centers ({costCenters.length})
          </button>
          {costCenters.map((c) => (
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors min-h-[36px] cursor-pointer ${
                selectedCenter === c.id
                  ? "bg-[#174C37] text-white shadow-xs font-semibold border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              key={c.id}
              onClick={() => setSelectedCenter(c.id)}
              type="button"
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vendor or expense item..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Cost Centers Grid */}
      {filteredCenters.length === 0 ? (
        <EmptyStateCard
          actionLabel={canRecord ? "Record Disbursement" : undefined}
          className="my-4"
          description={
            searchQuery
              ? "No cost centers or items match your search. Try clearing your search query."
              : "No expenses recorded against budget allocations yet."
          }
          icon={Wallet}
          onAction={canRecord ? () => onRecordExpense() : undefined}
          title="No Expenses Recorded"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredCenters.map((center) => {
            const Icon = centerIcons[center.id] || Wallet;
            const totalUtilized = center.spent + center.committed;
            const percentUtilized = Math.min(
              100,
              (totalUtilized / (center.allocated || 1)) * 100,
            );
            const variance = center.allocated - totalUtilized;
            const isOverBudget = variance < 0;

            const spentPercent = Math.min(
              100,
              (center.spent / (center.allocated || 1)) * 100,
            );
            const committedPercent = Math.min(
              100,
              (center.committed / (center.allocated || 1)) * 100,
            );

            return (
              <div
                className="bg-white rounded-2xl border border-[#E5DDD3] p-5 hover:border-[#174C37]/50 transition-colors flex flex-col justify-between"
                key={center.id}
              >
                <div>
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FAF6F0] flex items-center justify-center text-[#174C37] shrink-0 border border-[#E5DDD3]">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-[#3D291F]">
                          {center.name}
                        </h4>
                        <p className="text-xs text-[#7A685D] mt-0.5">
                          Allocated:{" "}
                          <span className="font-semibold text-[#3D291F] tabular-nums font-mono">
                            {formatNaira(center.allocated)}
                          </span>{" "}
                          (
                          {formatPercent(
                            center.percentage !== undefined
                              ? center.percentage
                              : budgetCeiling > 0
                                ? (center.allocated / budgetCeiling) * 100
                                : (center.allocated / (totalAllocated || 1)) *
                                  100,
                          )}{" "}
                          of budget)
                        </p>
                      </div>
                    </div>

                    {canRecord && (
                      <button
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-[#BA3C2A] bg-[#FAF6F0] border border-[#BA3C2A]/30 rounded-lg hover:bg-[#BA3C2A] hover:text-white transition-colors shrink-0 flex items-center gap-1 min-h-[36px]"
                        onClick={() => onRecordExpense(center.id)}
                        type="button"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Record</span>
                      </button>
                    )}
                  </div>

                  {/* Numbers Row */}
                  <div className="mt-4 grid grid-cols-3 gap-2 p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-center min-w-0">
                    <div className="min-w-0">
                      <span className="text-[11px] text-[#7A685D] block">
                        Disbursed
                      </span>
                      <span className="font-bold text-xs text-[#BA3C2A] tabular-nums font-mono block truncate">
                        {formatNaira(center.spent)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] text-[#7A685D] block">
                        Committed POs
                      </span>
                      <span className="font-semibold text-xs text-[#D6A23A] tabular-nums font-mono block truncate">
                        {formatNaira(center.committed)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] text-[#7A685D] block">
                        Variance
                      </span>
                      <span
                        className={`font-semibold text-xs tabular-nums font-mono block truncate ${
                          isOverBudget ? "text-[#BA3C2A]" : "text-[#174C37]"
                        }`}
                      >
                        {variance >= 0
                          ? `+${formatNaira(variance)}`
                          : formatNaira(variance)}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar (CSP Compliant with percentWidthClass) */}
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-[#7A685D]">
                      <span>Allocation consumption</span>
                      <span className="font-semibold text-[#3D291F] tabular-nums">
                        {formatPercent(percentUtilized)}
                      </span>
                    </div>
                    <div className="w-full bg-[#E5DDD3]/60 rounded-full h-2 overflow-hidden flex">
                      <div
                        className={`bg-[#BA3C2A] h-full transition-all duration-500 ${percentWidthClass(spentPercent)}`}
                      />
                      <div
                        className={`bg-[#D6A23A] h-full transition-all duration-500 ${percentWidthClass(committedPercent)}`}
                      />
                    </div>
                  </div>

                  {/* Itemized Line Items List */}
                  <div className="mt-4 pt-3 border-t border-[#E5DDD3]">
                    <span className="text-[11px] font-semibold text-[#7A685D] uppercase tracking-wide block mb-2">
                      Authorized Line Items & Contracts ({center.items.length})
                    </span>

                    <div className="space-y-2">
                      {center.items.map((item) => (
                        <div
                          className="p-2.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]/70 text-xs space-y-1"
                          key={`${center.id}-${item.name}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-[#3D291F]">
                              {item.name}
                            </span>
                            <span className="font-bold text-[#3D291F] tabular-nums font-mono">
                              {formatNaira(item.spent)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#7A685D]">
                            <span>Vendor: {item.vendor}</span>
                            <span>Budgeted: {formatNaira(item.allocated)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
