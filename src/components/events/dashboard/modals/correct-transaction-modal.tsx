"use client";

import { AlertCircle, Edit3, Lock, X } from "lucide-react";
import { useState } from "react";
import { correctEventFinancialTransactionAction } from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormSubmitButton } from "@/components/ui/cf-button";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { DashboardTransaction } from "../dashboard-types";

interface CorrectTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: DashboardTransaction | null;
  eventId: string;
}

export function CorrectTransactionModal({
  isOpen,
  onClose,
  transaction,
  eventId,
}: CorrectTransactionModalProps) {
  useModalHygiene({ isOpen, onClose });

  const [paymentStatus, setPaymentStatus] = useState<string>(
    transaction?.paymentStatus || "paid",
  );

  if (!isOpen || !transaction) return null;

  const isIncome = transaction.type === "revenue";
  const method = transaction.paymentMethod || "cash";
  const isBankTransfer = method === "bank_transfer";
  const hasExistingReceipt = Boolean(transaction.receipt);
  const needsReceiptUpload =
    isBankTransfer && paymentStatus === "paid" && !hasExistingReceipt;

  return (
    <div
      aria-labelledby="correct-event-txn-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <Edit3 className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="correct-event-txn-title"
              >
                Correct Event Ledger Entry
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Audited modification of event financial record
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

        {/* Form Body */}
        <form
          action={correctEventFinancialTransactionAction}
          className="p-6 space-y-4 text-xs text-[#3D291F] overflow-y-auto flex-1"
          encType="multipart/form-data"
        >
          <input name="event_id" type="hidden" value={eventId} />
          <input name="transaction_id" type="hidden" value={transaction.id} />
          <input name="payment_method" type="hidden" value={method} />

          {/* Immutable Payment Method Banner */}
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-[#7A685D] shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-[11px]">
              <span className="font-bold text-[#3D291F] block">
                Payment Channel:{" "}
                <span className="capitalize">
                  {method === "bank_transfer" ? "Bank Transfer" : "Cash"}
                </span>
              </span>
              <p className="text-[#7A685D]">
                Payment method is immutable. If the counterparty paid through a
                different channel, void this entry and re-record it.
              </p>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-amount"
              >
                Corrected Amount (₦) <span className="text-[#BA3C2A]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7A685D]">
                  ₦
                </span>
                <FormattedAmountInput
                  className="w-full h-10 pl-8 pr-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  defaultValue={String(transaction.amount)}
                  id="correct-amount"
                  name="amount_ngn"
                  required
                />
              </div>
            </div>

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-date"
              >
                Transaction Date <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.date.slice(0, 10)}
                id="correct-date"
                name="transaction_date"
                required
                type="date"
              />
            </div>
          </div>

          {/* Counterparty & Payment Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-party"
              >
                {isIncome ? "Payer / Donor" : "Payee / Vendor"}{" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                autoComplete="off"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.payerPayee}
                id="correct-party"
                maxLength={160}
                name="payer_payee"
                required
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-status"
              >
                Payment Status <span className="text-[#BA3C2A]">*</span>
              </label>
              <select
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                id="correct-status"
                name="payment_status"
                onChange={(e) => setPaymentStatus(e.target.value)}
                value={paymentStatus}
              >
                <option value="paid">Settled / Paid</option>
                <option value="pending">Pending Payment</option>
                <option value="unpaid">Unpaid Commitment</option>
                <option value="deposit">Deposit Paid</option>
              </select>
            </div>
          </div>

          {/* Description or Source Note */}
          {isIncome ? (
            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-source-note"
              >
                Source Note / Description{" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                autoComplete="off"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.description}
                id="correct-source-note"
                maxLength={500}
                name="source_note"
                required
              />
            </div>
          ) : (
            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="correct-description"
              >
                Disbursement Description{" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                autoComplete="off"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.description}
                id="correct-description"
                maxLength={500}
                name="description"
                required
              />
            </div>
          )}

          {/* Conditional receipt upload when transitioning to paid without existing receipt */}
          {needsReceiptUpload && (
            <div className="p-3.5 rounded-xl border border-[#EED7A1] bg-[#FDF8EE] space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#D6A23A] shrink-0" />
                <h4 className="font-bold text-xs text-[#3D291F]">
                  Receipt Voucher Required for Paid Bank Transfer
                </h4>
              </div>
              <p className="text-[11px] text-[#54433A]">
                This transaction has no attached receipt. Changing status to
                Settled / Paid requires uploading a verified payment voucher.
              </p>
              <input
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
                id="correct-receipt-file"
                name="receipt_file"
                required
                type="file"
              />
            </div>
          )}

          {/* Mandatory Reason */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="correct-reason"
            >
              Audited Correction Reason{" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <textarea
              className="w-full h-20 p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] resize-none"
              id="correct-reason"
              maxLength={500}
              name="reason"
              placeholder="Explain why this record is being modified (e.g. corrected invoice amount from vendor, receipt received)"
              required
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <FormSubmitButton loadingText="Correcting...">
              Save Audited Correction
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
