"use client";

import { Banknote, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { setEventBudgetAction } from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormSubmitButton } from "@/components/ui/cf-button";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

interface EventBudgetCeilingModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  currentCeiling: number;
}

export function EventBudgetCeilingModal({
  isOpen,
  onClose,
  eventId,
  currentCeiling,
}: EventBudgetCeilingModalProps) {
  const [reason, setReason] = useState("");

  useModalHygiene({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) {
      setReason("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isEditing = currentCeiling > 0;

  return (
    <div
      aria-labelledby="budget-ceiling-modal-title"
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
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="budget-ceiling-modal-title"
              >
                {isEditing
                  ? "Edit Event Budget Total"
                  : "Set Event Budget Total"}
              </h3>
              <p className="text-xs text-[#7A685D]">
                {isEditing
                  ? "Update approved financial ceiling and preserve category allocations."
                  : "Establish the club-approved expenditure ceiling for this event."}
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form action={setEventBudgetAction} className="p-6 space-y-4 text-xs">
          <input name="event_id" type="hidden" value={eventId} />
          <input name="return_tab" type="hidden" value="budget" />

          {/* Current Ceiling Badge if revising */}
          {isEditing && (
            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-between text-[#5C4638]">
              <div>
                <span className="text-[11px] font-semibold text-[#7A685D] block">
                  Current Budget Ceiling
                </span>
                <span className="text-base font-bold text-[#3D291F] font-mono">
                  {formatNaira(currentCeiling)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#174C37] font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Active Ceiling</span>
              </div>
            </div>
          )}

          {/* Budget Total Input */}
          <div className="space-y-1.5">
            <label
              className="block font-semibold text-[#3D291F]"
              htmlFor="event-budget-total"
            >
              Approved Budget Total (NGN) <span className="text-[#BA3C2A]">*</span>
            </label>
            <FormattedAmountInput
              className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] font-mono"
              defaultValue={isEditing ? String(currentCeiling) : ""}
              id="event-budget-total"
              name="total_ngn"
              placeholder="e.g. 5,000,000"
              required
            />
            <p className="text-[11px] text-[#7A685D] flex items-start gap-1 mt-1">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#174C37] mt-0.5" />
              <span>
                Enter the total amount in whole Naira. Any existing category
                percentage allocations will be maintained against this new total.
              </span>
            </p>
          </div>

          {/* Audit Reason Field */}
          <div className="space-y-1.5">
            <label
              className="block font-semibold text-[#3D291F]"
              htmlFor="event-budget-reason"
            >
              Audit Reason{" "}
              {isEditing ? (
                <span className="text-[#BA3C2A]">*</span>
              ) : (
                <span className="text-[#7A685D] font-normal">(Optional)</span>
              )}
            </label>
            <textarea
              className="w-full p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] resize-none"
              id="event-budget-reason"
              maxLength={500}
              name="reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isEditing
                  ? "Explain why the total budget ceiling is being revised (e.g. Executive approval for expanded catering scope)..."
                  : "Optional note explaining initial budget authorization..."
              }
              required={isEditing}
              rows={3}
              value={reason}
            />
            <div className="flex justify-between items-center text-[10px] text-[#7A685D]">
              <span>
                {isEditing
                  ? "Required for immutable audit logging."
                  : "Recorded in event financial ledger history if provided."}
              </span>
              <span>{reason.length}/500</span>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-3 border-t border-[#E5DDD3] flex items-center justify-end gap-2.5">
            <button
              className="px-4 py-2 border border-[#E5DDD3] bg-white text-[#5C4638] hover:bg-[#FAF6F0] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <FormSubmitButton
              className="px-5 py-2 bg-[#174C37] text-white hover:bg-[#123B2B] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              id="btn-submit-budget-ceiling"
              pendingText={isEditing ? "Updating..." : "Saving..."}
            >
              {isEditing ? "Update Budget Total" : "Save Budget Total"}
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
