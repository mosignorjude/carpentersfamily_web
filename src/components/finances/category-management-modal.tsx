"use client";

import { Tag, X } from "lucide-react";
import {
  type FinanceCategory,
  FinanceCategoryForms,
} from "@/app/(member)/finances/finance-forms";

interface CategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: FinanceCategory[];
}

export function CategoryManagementModal({
  isOpen,
  onClose,
  categories,
}: CategoryManagementModalProps) {
  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="category-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs"
      role="dialog"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <Tag className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="category-modal-title"
              >
                Cost Centers & Categories
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Manage active expenditure cost centers per club resolutions
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

        {/* Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          <FinanceCategoryForms categories={categories} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
