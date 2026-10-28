"use client";

import { AlertTriangle, X } from "lucide-react";
import {
  type FinanceTransaction,
  FinanceVoidForm,
} from "@/app/(member)/finances/finance-forms";

interface VoidTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinanceTransaction | null;
}

export function VoidTransactionModal({
  isOpen,
  onClose,
  transaction,
}: VoidTransactionModalProps) {
  if (!isOpen || !transaction) return null;

  return (
    <div
      aria-labelledby="void-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs"
      role="dialog"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#BA3C2A] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="void-modal-title"
              >
                Void Transaction Record
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Retain in audit history without balance effect
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
          <FinanceVoidForm onCancel={onClose} transaction={transaction} />
        </div>
      </div>
    </div>
  );
}
