"use client";

import { Loader2, ShieldAlert, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { DashboardTransaction } from "../dashboard-types";

interface VoidTransactionModalProps {
  isOpen: boolean;
  isPending?: boolean;
  transaction: DashboardTransaction | null;
  onClose: () => void;
  onConfirmVoid: (txnId: string, reason: string) => void;
}

export function VoidTransactionModal({
  isOpen,
  isPending = false,
  transaction,
  onClose,
  onConfirmVoid,
}: VoidTransactionModalProps) {
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");

  useModalHygiene({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) {
      setReason("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen || !transaction) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (!reason.trim()) {
      setError(
        "A transparent, explanatory audit reason is mandatory to void this record.",
      );
      return;
    }

    onConfirmVoid(transaction.id, reason.trim());
  };

  return (
    <div
      aria-labelledby="void-modal-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#BA3C2A]/10 text-[#BA3C2A] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="void-modal-title"
              >
                Void Ledger Record
              </h3>
              <p className="text-xs text-[#7A685D]">
                Carpenters Family Financial Compliance
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form
          className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
          onSubmit={handleSubmit}
        >
          {/* Policy Notice */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1 text-[#5C4638]">
            <span className="font-semibold text-[#174C37] block">
              Immutable Retained History Rule:
            </span>
            <p className="leading-relaxed">
              Permanent deletion is prohibited. This transaction will remain
              visible in the ledger marked with strike-through, zero financial
              effect, and your permanent reason for audit accountability.
            </p>
          </div>

          {/* Transaction Summary Card */}
          <div className="p-3 rounded-xl border border-[#E5DDD3] bg-white space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#3D291F]">
                {transaction.id}
              </span>
              <span className="font-mono font-bold text-[#BA3C2A] text-sm tabular-nums">
                {formatNaira(transaction.amount)}
              </span>
            </div>
            <p className="text-xs font-semibold text-[#3D291F]">
              {transaction.description}
            </p>
            <p className="text-[11px] text-[#7A685D]">
              Party: {transaction.payerPayee} · Channel:{" "}
              {transaction.paymentMethod === "bank_transfer"
                ? "Bank Transfer"
                : "Cash"}
            </p>
          </div>

          {/* Reason Input */}
          <div className="space-y-1.5">
            <label
              className="font-bold text-[#3D291F] block"
              htmlFor="void-reason-input"
            >
              Mandatory Void Reason / Audit Note
            </label>
            <textarea
              className="w-full h-24 p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A] resize-none"
              id="void-reason-input"
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder="State exactly why this transaction is being reversed (e.g. duplicate voucher, bank reversal, miscategorized vendor invoice)..."
              required
              value={reason}
            />
            {error ? (
              <p className="text-xs text-[#BA3C2A] font-semibold mt-1">
                {error}
              </p>
            ) : null}
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2.5 text-xs font-semibold text-[#5C4638] bg-[#FAF6F0] hover:bg-[#E5DDD3]/60 rounded-xl transition-colors min-h-[42px] disabled:opacity-50"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#BA3C2A] hover:bg-[#8E2A1C] rounded-xl transition-colors min-h-[42px] shadow-xs flex items-center gap-1.5 disabled:opacity-75"
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Voiding Record…</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>Confirm Void Record</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
