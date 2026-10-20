"use client";

import { Lock, Shield, Tag, TrendingDown, TrendingUp } from "lucide-react";

interface OfficerFinanceControlsProps {
  isOfficer: boolean;
  canCorrect: boolean;
  onOpenRecordIncome: () => void;
  onOpenRecordExpense: () => void;
  onOpenCategoryManagement: () => void;
}

export function OfficerFinanceControls({
  isOfficer,
  canCorrect,
  onOpenRecordIncome,
  onOpenRecordExpense,
  onOpenCategoryManagement,
}: OfficerFinanceControlsProps) {
  if (!isOfficer) return null;

  return (
    <section aria-labelledby="officer-tools-heading" className="space-y-3">
      <div className="bg-white rounded-2xl border border-[#174C37]/30 p-5 sm:p-6 shadow-xs space-y-4">
        {/* Header with Role Verification Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-[#E5DDD3] gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
              <Shield className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <div>
              <h4
                className="text-sm sm:text-base font-extrabold text-[#3D291F]"
                id="officer-tools-heading"
              >
                Officer Treasury Controls & Record Management
              </h4>
              <p className="text-xs text-[#7A685D] font-medium">
                Authorized Executive Role · Club Financial Governance Policy
              </p>
            </div>
          </div>

          <span className="text-[11px] font-mono text-[#174C37] bg-[#FAF6F0] px-3 py-1 rounded-md border border-[#E5DDD3] self-start sm:self-center font-bold">
            Governance Active
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="officer-record-income-btn"
            className="px-4 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors flex items-center gap-2 shadow-xs min-h-[42px] cursor-pointer"
            onClick={onOpenRecordIncome}
            type="button"
          >
            <TrendingUp className="w-4 h-4 text-[#D6A23A]" />
            <span>Record Non-Dues Income</span>
          </button>

          <button
            id="officer-record-expense-btn"
            className="px-4 py-2.5 rounded-xl bg-white border border-[#BA3C2A]/40 text-[#BA3C2A] hover:bg-[#BA3C2A]/10 text-xs font-bold transition-colors flex items-center gap-2 min-h-[42px] cursor-pointer"
            onClick={onOpenRecordExpense}
            type="button"
          >
            <TrendingDown className="w-4 h-4" />
            <span>Record an Expense</span>
          </button>

          <button
            id="officer-manage-categories-btn"
            className="px-4 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] hover:bg-white text-xs font-bold transition-colors flex items-center gap-2 min-h-[42px] cursor-pointer"
            onClick={onOpenCategoryManagement}
            type="button"
          >
            <Tag className="w-4 h-4 text-[#7A685D]" />
            <span>Manage Cost Centers</span>
          </button>
        </div>

        {/* Explicit Privacy & Scope Guardrail */}
        <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-2.5">
          <Lock className="w-3.5 h-3.5 text-[#7A685D] shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong className="text-[#3D291F]">Ledger Privacy Guard: </strong>
            Individual member dues status and debt collections are strictly
            confidential and remain isolated in individual member ledgers.
            {canCorrect
              ? " As an Administrator, you also hold rights to void or correct posted entries with mandatory audit justification."
              : " Correcting or voiding existing entries is restricted to Administrators."}
          </span>
        </div>
      </div>
    </section>
  );
}
