"use client";

import { AlertTriangle, FileText, Printer, X } from "lucide-react";
import { ReceiptCell } from "@/components/finances/receipt-cell";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { DashboardTransaction } from "../dashboard-types";

interface TransactionDetailModalProps {
  isOpen: boolean;
  transaction: DashboardTransaction | null;
  onClose: () => void;
}

export function TransactionDetailModal({
  isOpen,
  transaction,
  onClose,
}: TransactionDetailModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen || !transaction) return null;

  const isVoided = transaction.status === "voided";
  const isRevenue = transaction.type === "revenue";

  return (
    <div
      aria-labelledby="voucher-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="voucher-title"
              >
                Digital Financial Voucher
              </h3>
              <p className="text-xs text-[#7A685D] font-mono">
                Reference: {transaction.id}
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

        {/* Voucher Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Status Header */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              isVoided
                ? "bg-[#BA3C2A]/10 border-[#BA3C2A]/30 text-[#BA3C2A]"
                : isRevenue
                  ? "bg-[#174C37]/10 border-[#174C37]/30 text-[#174C37]"
                  : "bg-[#FAF6F0] border-[#E5DDD3] text-[#3D291F]"
            }`}
          >
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider block">
                {isVoided
                  ? "Retained History (Voided Record)"
                  : isRevenue
                    ? "Verified Revenue Receipt"
                    : "Authorized Expense Voucher"}
              </span>
              <p className="text-xl font-bold font-mono tabular-nums mt-0.5">
                {isRevenue ? "+" : "-"}
                {formatNaira(transaction.amount)}
              </p>
            </div>

            <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-white border border-current font-bold">
              {transaction.status.toUpperCase()}
            </span>
          </div>

          {/* Voided Details Notice if applicable */}
          {isVoided && transaction.voidReason && (
            <div className="p-3.5 rounded-xl bg-[#BA3C2A]/10 border border-[#BA3C2A]/20 text-[#BA3C2A] space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Audit Void Explanation:
              </span>
              <p className="leading-relaxed">{transaction.voidReason}</p>
              <p className="text-[10px] text-[#7A685D] mt-1 pt-1 border-t border-[#BA3C2A]/20">
                Action by: {transaction.voidedBy} · Timestamp:{" "}
                {transaction.voidedAt}
              </p>
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
                Date & Time
              </span>
              <span className="font-mono text-[#3D291F] font-semibold mt-0.5 block">
                {transaction.date}
              </span>
            </div>

            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
                Category
              </span>
              <span className="text-[#3D291F] font-semibold mt-0.5 block">
                {transaction.categoryLabel}
              </span>
            </div>

            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
                Counterparty / Payer / Payee
              </span>
              <span className="text-[#3D291F] font-semibold mt-0.5 block">
                {transaction.payerPayee}
              </span>
            </div>

            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
                Payment Channel
              </span>
              <span className="text-[#3D291F] font-semibold mt-0.5 block">
                {transaction.paymentMethod}
              </span>
            </div>

            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold mb-1">
                Receipt / Voucher
              </span>
              <ReceiptCell
                isLegacy={transaction.isLegacy}
                paymentMethod={transaction.paymentMethod}
                paymentStatus={transaction.paymentStatus}
                receipt={transaction.receipt}
              />
            </div>

            <div>
              <span className="text-[#7A685D] block text-[10px] uppercase font-bold">
                Authorized Officer
              </span>
              <span className="text-[#3D291F] font-semibold mt-0.5 block">
                {transaction.authorizedBy} ({transaction.authorizerRole})
              </span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <span className="text-[#7A685D] text-[10px] uppercase font-bold block">
              Official Description / Justification
            </span>
            <p className="p-3 rounded-xl border border-[#E5DDD3] bg-white text-xs text-[#3D291F] leading-relaxed">
              {transaction.description}
            </p>
          </div>

          {/* Notes if available */}
          {transaction.notes && (
            <div className="space-y-1">
              <span className="text-[#7A685D] text-[10px] uppercase font-bold block">
                Internal Audit Committee Notes
              </span>
              <p className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] leading-relaxed">
                {transaction.notes}
              </p>
            </div>
          )}

          {/* Receipt Attachment Indicator */}
          {transaction.receiptFileName && (
            <div className="p-3 rounded-xl border border-[#E5DDD3] bg-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#174C37]" />
                <div>
                  <span className="font-semibold text-[#3D291F] block">
                    {transaction.receiptFileName}
                  </span>
                  <span className="text-[10px] text-[#7A685D]">
                    {transaction.receiptSize || "420 KB"} · SHA-256 Stamped
                  </span>
                </div>
              </div>

              <span className="text-[11px] text-[#174C37] font-semibold bg-[#174C37]/10 px-2.5 py-1 rounded-md">
                Verified Electronic Voucher
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <span className="text-[11px] text-[#7A685D] font-mono">
            Carpenters Family Secretariat
          </span>

          <div className="flex items-center gap-2">
            <button
              className="px-3.5 py-2 text-xs font-medium text-[#3D291F] bg-white border border-[#E5DDD3] rounded-xl hover:bg-[#FAF6F0] min-h-[38px] flex items-center gap-1.5 transition-colors"
              onClick={() => window.print()}
              type="button"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Voucher</span>
            </button>
            <button
              className="px-4 py-2 text-xs font-semibold text-white bg-[#174C37] hover:bg-[#103D2B] rounded-xl min-h-[38px] transition-colors"
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
