"use client";

import { TrendingUp, X } from "lucide-react";
import { ClubIncomeForm } from "@/app/(member)/finances/finance-forms";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface RecordIncomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
}

export function RecordIncomeModal({
  isOpen,
  onClose,
  today,
  canBackdate,
  idempotencyKey,
}: RecordIncomeModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="record-income-title"
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
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <TrendingUp className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="record-income-title"
              >
                Record Non-Dues Income
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Inflows from donations, sponsorships, and investments
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
        <div className="p-6">
          <ClubIncomeForm
            canBackdate={canBackdate}
            idempotencyKey={idempotencyKey}
            onCancel={onClose}
            today={today}
          />
        </div>
      </div>
    </div>
  );
}
