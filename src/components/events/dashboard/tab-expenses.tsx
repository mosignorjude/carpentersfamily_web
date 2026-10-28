"use client";

import {
  Megaphone,
  Music,
  Plus,
  ShieldAlert,
  Tent,
  Wallet,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import { formatNaira, formatPercent } from "@/lib/format";
import { percentWidthClass } from "@/lib/percent-width-class";
import type {
  DashboardCostCenter,
  DashboardTransaction,
  ExpenseCategory,
} from "./dashboard-types";
import { EventDomainLedger } from "./event-domain-ledger";
import { VoucherInspectionDrawer } from "./voucher-inspection-drawer";

interface TabExpensesProps {
  costCenters: DashboardCostCenter[];
  canRecord: boolean;
  onRecordExpense: (category?: ExpenseCategory) => void;
  budgetCeiling?: number;
  expenseTransactions?: DashboardTransaction[];
  eventId?: string;
  currentUserId?: string;
  userRole?: string;
}

export function TabExpenses({
  costCenters,
  canRecord,
  onRecordExpense,
  budgetCeiling = 0,
  expenseTransactions = [],
  eventId = "",
  currentUserId,
  userRole,
}: TabExpensesProps) {
  const [selectedTxn, setSelectedTxn] = useState<DashboardTransaction | null>(null);

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

  return (
    <div className="space-y-6">
      {/* 1. Master Consolidated Operational Cost Centers & Budget Matrix Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-5">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#174C37]" />
              <h3 className="text-lg font-bold text-[#3D291F]">
                Operational Cost Centers & Budget Matrix
              </h3>
            </div>
            <p className="text-xs text-[#7A685D] mt-1">
              Reconciliation of operational cost centers and authorized disbursements.
            </p>
          </div>

          {/* Aggregate Expense Stats & Single Record Button */}
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

        {/* Cost Centers Table Matrix */}
        {costCenters.length === 0 ? (
          <EmptyStateCard
            actionLabel={canRecord ? "Record Disbursement" : undefined}
            className="my-4"
            description="No expenses recorded against budget allocations yet."
            icon={Wallet}
            onAction={canRecord ? () => onRecordExpense() : undefined}
            title="No Expenses Recorded"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E5DDD3] bg-[#F7F3EC] text-[#7A685D] uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-2.5 px-3.5">Cost Center</th>
                  <th className="py-2.5 px-3.5">Budget Ceiling</th>
                  <th className="py-2.5 px-3.5">Disbursed Spend</th>
                  <th className="py-2.5 px-3.5">Committed POs</th>
                  <th className="py-2.5 px-3.5">Utilization Bar</th>
                  <th className="py-2.5 px-3.5 text-right">Available Buffer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBE5DC]">
                {costCenters.map((center) => {
                  const Icon = centerIcons[center.id] || Wallet;
                  const totalUtilized = center.spent + center.committed;
                  const percentUtilized = Math.min(
                    100,
                    (totalUtilized / (center.allocated || 1)) * 100
                  );
                  const variance = center.allocated - totalUtilized;
                  const isOverBudget = variance < 0;

                  return (
                    <tr
                      key={center.id}
                      className="hover:bg-[#FAF6F0]/50 transition-colors"
                    >
                      {/* Name & Icon */}
                      <td className="py-3 px-3.5 max-w-[220px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shrink-0">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-[#3D291F] block text-sm">
                              {center.name}
                            </span>
                            <span className="text-[11px] text-[#7A685D]">
                              {center.items.length} line items
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Budget Ceiling */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono font-semibold text-[#3D291F]">
                        {formatNaira(center.allocated)}
                      </td>

                      {/* Disbursed Spend */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono font-bold text-sm text-[#BA3C2A]">
                        {formatNaira(center.spent)}
                      </td>

                      {/* Committed POs */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-[#D6A23A]">
                        {formatNaira(center.committed)}
                      </td>

                      {/* Utilization Bar */}
                      <td className="py-3 px-3.5 whitespace-nowrap min-w-[140px]">
                        <div className="flex items-baseline justify-between font-mono text-xs">
                          <span className="font-semibold text-[#3D291F]">
                            {formatPercent(percentUtilized)}
                          </span>
                        </div>
                        <div className="w-full bg-[#E5DDD3] rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isOverBudget
                                ? "bg-[#BA3C2A]"
                                : percentUtilized > 85
                                  ? "bg-[#D6A23A]"
                                  : "bg-[#174C37]"
                            } ${percentWidthClass(percentUtilized)}`}
                          />
                        </div>
                      </td>

                      {/* Available Buffer */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        {isOverBudget ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]">
                            {formatNaira(Math.abs(variance))} Deficit
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                            +{formatNaira(variance)} Buffer
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Embedded Disbursement Ledger */}
      <EventDomainLedger
        currentUserId={currentUserId}
        domain="expenses"
        onInspect={(txn) => setSelectedTxn(txn)}
        title="Disbursement Ledger"
        transactions={expenseTransactions}
        userRole={userRole}
      />

      {/* 3. Split-Screen Voucher Inspection Drawer */}
      <VoucherInspectionDrawer
        currentUserId={currentUserId}
        eventId={eventId}
        isOpen={Boolean(selectedTxn)}
        onClose={() => setSelectedTxn(null)}
        transaction={selectedTxn}
        userRole={userRole}
      />
    </div>
  );
}
