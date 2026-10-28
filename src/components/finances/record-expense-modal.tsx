"use client";

import { TrendingDown, X } from "lucide-react";
import {
  ClubExpenseForm,
  type FinanceCategory,
} from "@/app/(member)/finances/finance-forms";
import { FormAlertBanner } from "@/components/ui";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface RecordExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: FinanceCategory[];
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
  categoryUnavailable?: boolean;
}

export function RecordExpenseModal({
  isOpen,
  onClose,
  categories,
  today,
  canBackdate,
  idempotencyKey,
  categoryUnavailable = false,
}: RecordExpenseModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="record-expense-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BA3C2A] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <TrendingDown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="record-expense-title"
              >
                Record Institutional Disbursement
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Authorized club operational and capital expenses
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {categoryUnavailable ? (
            <FormAlertBanner
              message="Expense entry is disabled until cost centers are reconciled."
              title="Categories Unavailable"
              variant="warning"
            />
          ) : (
            <ClubExpenseForm
              canBackdate={canBackdate}
              categories={categories}
              idempotencyKey={idempotencyKey}
              onCancel={onClose}
              today={today}
            />
          )}
        </div>
      </div>
    </div>
  );
}
