"use client";

import { Download, FileText, Paperclip, Upload, X } from "lucide-react";
import type { FinanceTransaction } from "@/app/(member)/finances/finance-forms";
import { FormSubmitButton } from "@/components/ui";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

export type FinanceReceipt = {
  id: string;
  transaction_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
};

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: FinanceTransaction | null;
  receipts: FinanceReceipt[];
  isOfficer: boolean;
  receiptUnavailable: boolean;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReceiptModal({
  isOpen,
  onClose,
  transaction,
  receipts,
  isOfficer,
  receiptUnavailable,
}: ReceiptModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen || !transaction) return null;

  return (
    <div
      aria-labelledby="receipt-modal-title"
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
              <Paperclip className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="receipt-modal-title"
              >
                Verified Receipt Vouchers
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Official documents attached to verified transactions
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
        <div className="p-6 space-y-5 text-xs text-[#3D291F]">
          {/* Transaction Metadata Snapshot */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[#7A685D] font-medium">Record:</span>
              <strong className="text-[#3D291F] font-bold">
                {transaction.kind === "income"
                  ? transaction.source_note
                  : transaction.description}
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7A685D] font-medium">
                Type / Category:
              </span>
              <span className="font-semibold text-[#174C37]">
                {transaction.kind === "income"
                  ? "Non-Dues Income"
                  : (transaction.category_name_snapshot ?? "Expense")}
              </span>
            </div>
            {transaction.payer_payee ? (
              <div className="flex items-center justify-between">
                <span className="text-[#7A685D] font-medium">
                  {transaction.kind === "income" ? "Payer:" : "Payee:"}
                </span>
                <span className="text-[#3D291F] font-medium">
                  {transaction.payer_payee}
                </span>
              </div>
            ) : null}
          </div>

          {/* Receipts List */}
          <div className="space-y-2.5">
            <h4 className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider">
              Attached Receipts ({receipts.length})
            </h4>

            {receiptUnavailable ? (
              <p className="p-3 bg-[#FDF8EE] rounded-lg border border-[#EED7A1] text-xs text-[#D6A23A]">
                Receipt attachments could not be verified. Download and upload
                controls are unavailable.
              </p>
            ) : receipts.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-[#E5DDD3] text-center space-y-1.5 bg-[#FAF6F0]/50">
                <FileText className="w-8 h-8 text-[#B8ACA0] mx-auto" />
                <p className="font-bold text-[#3D291F]">No Receipts Attached</p>
                <p className="text-[11px] text-[#7A685D]">
                  No scanned voucher or banking confirmation has been attached
                  to this record yet.
                </p>
              </div>
            ) : (
              <div className="border border-[#E5DDD3] rounded-xl overflow-hidden divide-y divide-[#E5DDD3] bg-white">
                {receipts.map((receipt) => (
                  <div
                    className="p-3.5 flex items-center justify-between gap-3 text-xs"
                    key={receipt.id}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#174C37] shrink-0" />
                      <div className="truncate">
                        <strong className="block truncate font-bold text-[#3D291F]">
                          {receipt.original_filename}
                        </strong>
                        <span className="text-[11px] text-[#7A685D]">
                          {formatFileSize(receipt.size_bytes)} ·{" "}
                          {receipt.content_type}
                        </span>
                      </div>
                    </div>

                    <a
                      className="px-3 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-[#174C37] hover:bg-[#174C37] hover:text-white font-bold text-xs transition-colors flex items-center gap-1.5 shrink-0"
                      download
                      href={`/api/receipts/${receipt.id}`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload New Receipt (Officers Only on Non-Voided) */}
          {isOfficer && !transaction.voided_at && !receiptUnavailable && (
            <form
              action="/api/receipts"
              className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3"
              encType="multipart/form-data"
              method="post"
            >
              <input name="scope" type="hidden" value="club" />
              <input name="target_id" type="hidden" value={transaction.id} />
              <input name="return_url" type="hidden" value="/finances" />
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#174C37]" />
                <h4 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
                  Attach Official Voucher
                </h4>
              </div>
              <p className="text-[11px] text-[#7A685D]">
                Choose a PDF, JPEG, or PNG receipt under 4 MiB. File content and
                MIME will be independently verified.
              </p>

              <div>
                <input
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  className="w-full text-xs text-[#54433A] file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-[#E5DDD3] file:text-xs file:font-bold file:bg-white file:text-[#3D291F] hover:file:bg-[#FAF6F0] cursor-pointer"
                  name="file"
                  required
                  type="file"
                />
              </div>

              <div className="flex justify-end pt-1">
                <FormSubmitButton
                  className="px-4 py-2 rounded-lg bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                  pendingLabel="Uploading Receipt…"
                  statusToastMessage="Uploading and verifying voucher attachment."
                >
                  Upload & Verify Receipt
                </FormSubmitButton>
              </div>
            </form>
          )}

          <div className="flex justify-end pt-2 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
