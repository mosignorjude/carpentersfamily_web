"use client";

import { Edit3, X } from "lucide-react";
import {
  type FinanceCategory,
  FinanceCorrectionForm,
  type FinanceTransaction,
} from "@/app/(member)/finances/finance-forms";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface CorrectTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinanceTransaction | null;
  categories: FinanceCategory[];
  today: string;
}

export function CorrectTransactionModal({
  isOpen,
  onClose,
  transaction,
  categories,
  today,
}: CorrectTransactionModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen || !transaction) return null;

  return (
    <div
      aria-labelledby="correct-modal-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <Edit3 className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="correct-modal-title"
              >
                Correct Posted Ledger Entry
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Update parameters with mandatory audited justification
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: the panel owns the viewport cap, this row owns the scroll */}
        <div className="p-6 flex-1 min-h-0 overflow-y-auto">
          <FinanceCorrectionForm
            categories={categories}
            onCancel={onClose}
            today={today}
            transaction={transaction}
          />
        </div>
      </div>
    </div>
  );
}
