"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  verifyEventFinancialTransactionAction,
  verifyEventTicketSaleAction,
} from "@/app/(member)/events/[eventId]/dashboard/actions";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { DashboardTransaction } from "./dashboard-types";

interface VoucherInspectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: DashboardTransaction | null;
  eventId: string;
  currentUserId?: string;
  userRole?: string;
}

export function VoucherInspectionDrawer({
  isOpen,
  onClose,
  transaction,
  eventId,
  currentUserId,
  userRole,
}: VoucherInspectionDrawerProps) {
  useModalHygiene({ isOpen, onClose });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !transaction) return null;

  const status =
    transaction.status === "voided"
      ? "rejected"
      : transaction.verificationStatus || "approved";
  const isRejected = status === "rejected";
  const isApproved = status === "approved";
  const isPending = status === "recorded";
  const isExpense = transaction.type === "expense";

  const isOfficer =
    userRole === "admin" ||
    userRole === "president" ||
    userRole === "executive" ||
    userRole === "lead" ||
    userRole === "event_lead";

  const isExecutiveSelfReview =
    userRole === "executive" &&
    Boolean(currentUserId) &&
    Boolean(transaction.createdBy) &&
    transaction.createdBy === currentUserId;

  const isTicketSale = transaction.category === "ticket_sales";

  async function handleApprove() {
    if (!transaction) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = isTicketSale
      ? await verifyEventTicketSaleAction({
          eventId,
          saleId: transaction.id,
          decision: "approved",
        })
      : await verifyEventFinancialTransactionAction({
          eventId,
          transactionId: transaction.id,
          decision: "approved",
        });

    setIsSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Approval failed.");
    } else {
      onClose();
    }
  }

  async function handleReject() {
    if (!transaction) return;
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 5) {
      setErrorMessage(
        "Please enter an explanation of at least 5 characters to reject/reverse.",
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = isTicketSale
      ? await verifyEventTicketSaleAction({
          eventId,
          saleId: transaction.id,
          decision: "rejected",
          reason: trimmed,
        })
      : await verifyEventFinancialTransactionAction({
          eventId,
          transactionId: transaction.id,
          decision: "rejected",
          reason: trimmed,
        });

    setIsSubmitting(false);
    if (!res.success) {
      setErrorMessage(res.error || "Reversal failed.");
    } else {
      setShowRejectInput(false);
      setRejectionReason("");
      onClose();
    }
  }

  const receiptUrl = transaction.receipt?.id
    ? `/api/receipts/${transaction.receipt.id}`
    : null;

  return (
    <div
      aria-labelledby="voucher-inspection-title"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-[#3D291F]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white rounded-3xl border border-[#E5DDD3] shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Drawer Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#E5DDD3] flex items-center justify-center text-[#174C37] shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="voucher-inspection-title"
              >
                Voucher Audit & Verification Inspection
              </h3>
              <p className="text-xs text-[#7A685D] mt-0.5">
                Inspect receipt voucher documentation against the claimed
                financial record.
              </p>
            </div>
          </div>
          <button
            aria-label="Close voucher inspection"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-full bg-white border border-[#E5DDD3] hover:bg-[#FAF6F0] flex items-center justify-center text-[#7A685D] hover:text-[#3D291F] transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body - Split View */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-[#FDF0EE] border border-[#F5C7C0] text-xs text-[#BA3C2A] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Pane: Claimed Transaction Details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#7A685D]">
                  Claimed Transaction Details
                </h4>
                <span
                  className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F]"
                  title={`UUID: ${transaction.id}`}
                >
                  #
                  {transaction.paymentRef ||
                    transaction.id.slice(0, 8).toUpperCase()}
                </span>
              </div>

              {/* Amount Display */}
              <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
                <span className="text-[11px] font-semibold text-[#7A685D] block uppercase">
                  Claimed Amount ({transaction.type})
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums ${
                    isRejected
                      ? "line-through text-[#7A685D]"
                      : isExpense
                        ? "text-[#BA3C2A]"
                        : "text-[#174C37]"
                  }`}
                >
                  {isRejected ? "" : isExpense ? "-" : "+"}
                  {formatNaira(transaction.amount)}
                </div>
                <div className="text-xs text-[#7A685D] pt-1">
                  Payment Method:{" "}
                  <strong className="text-[#3D291F]">
                    {transaction.paymentMethod}
                  </strong>
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="space-y-3 text-xs bg-white border border-[#E5DDD3] rounded-2xl p-4">
                <div>
                  <span className="text-[#7A685D] block text-[11px]">
                    Description
                  </span>
                  <p className="font-semibold text-[#3D291F] mt-0.5">
                    {transaction.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E5DDD3]/60">
                  <div>
                    <span className="text-[#7A685D] block text-[11px]">
                      Counterparty
                    </span>
                    <p className="font-medium text-[#3D291F] mt-0.5">
                      {transaction.payerPayee}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#7A685D] block text-[11px]">
                      Category
                    </span>
                    <p className="font-medium text-[#3D291F] mt-0.5">
                      {transaction.categoryLabel || "General"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E5DDD3]/60">
                  <div>
                    <span className="text-[#7A685D] block text-[11px]">
                      Transaction Date
                    </span>
                    <p className="font-mono font-medium text-[#3D291F] mt-0.5">
                      {transaction.date}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#7A685D] block text-[11px]">
                      Current Review Status
                    </span>
                    <div className="mt-0.5">
                      {isPending && (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FFF4E5] text-[#B27D16] border border-[#F8D8A7]">
                          Recorded (Pending)
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]">
                          Approved & Active
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]">
                          Rejected / Reversed
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isRejected && transaction.rejectionReason && (
                  <div className="p-3 rounded-xl bg-[#FDF0EE] border border-[#F5C7C0] text-xs text-[#BA3C2A] space-y-1">
                    <strong className="block font-bold">
                      Officer Rejection Explanation:
                    </strong>
                    <p className="italic">"{transaction.rejectionReason}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Pane: Receipt Voucher Evidence */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#7A685D]">
                  Receipt Voucher Evidence
                </h4>
                {transaction.receipt && (
                  <span className="text-xs font-mono text-[#7A685D]">
                    {transaction.receiptSize || "Evidence Attached"}
                  </span>
                )}
              </div>

              {transaction.receipt ? (
                <div className="bg-[#FAF6F0] rounded-2xl border border-[#E5DDD3] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Paperclip className="w-4 h-4 text-[#174C37] shrink-0" />
                      <span
                        className="text-xs font-bold text-[#3D291F] truncate"
                        title={transaction.receipt.filename}
                      >
                        {transaction.receipt.filename}
                      </span>
                    </div>

                    {receiptUrl && (
                      <a
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#174C37] bg-white border border-[#174C37]/30 rounded-lg hover:bg-[#174C37] hover:text-white transition-colors"
                        download={transaction.receipt.filename}
                        href={receiptUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>

                  {/* Document Preview Box */}
                  <div className="rounded-xl border border-[#E5DDD3] bg-white overflow-hidden min-h-[220px] max-h-[340px] flex items-center justify-center p-2">
                    {transaction.receipt.contentType.startsWith("image/") &&
                    receiptUrl ? (
                      /* biome-ignore lint/performance/noImgElement: dynamic user-uploaded receipt evidence loaded via authorized API */
                      <img
                        alt="Receipt Voucher Evidence"
                        className="max-h-[320px] max-w-full object-contain mx-auto rounded-lg shadow-xs"
                        src={receiptUrl}
                      />
                    ) : (
                      <div className="text-center p-6 space-y-3">
                        <FileText className="w-10 h-10 mx-auto text-[#174C37]/60" />
                        <div>
                          <p className="text-xs font-semibold text-[#3D291F]">
                            PDF Voucher Document Attached
                          </p>
                          <p className="text-[11px] text-[#7A685D] mt-0.5">
                            {transaction.receipt.filename}
                          </p>
                        </div>
                        {receiptUrl && (
                          <a
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#174C37] text-white rounded-xl text-xs font-semibold hover:bg-[#103D2B] transition-colors"
                            href={receiptUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open PDF in New Tab</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Discrepancy comparison prompt */}
                  <div className="text-[11px] text-[#5C4638] bg-white border border-[#E5DDD3] rounded-xl p-3 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
                    <span>
                      Check that the voucher's issued total matches the claimed{" "}
                      <strong className="text-[#174C37] font-mono">
                        {formatNaira(transaction.amount)}
                      </strong>
                      . If there is a mismatch or missing proof, reverse the
                      record below.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#D6A23A]/40 bg-[#FFF9F0] p-6 text-center space-y-3">
                  <ShieldAlert className="w-8 h-8 mx-auto text-[#D6A23A]" />
                  <div>
                    <h5 className="text-sm font-bold text-[#3D291F]">
                      No Receipt Document Uploaded
                    </h5>
                    <p className="text-xs text-[#7A685D] mt-1 max-w-sm mx-auto">
                      This transaction claim was submitted without an attached
                      digital voucher or invoice.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rejection Input Section */}
          {showRejectInput && (
            <div className="p-4 rounded-2xl bg-[#FDF0EE] border border-[#F5C7C0] space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#BA3C2A] flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" />
                  Mandatory Reversal Explanation
                </span>
                <button
                  className="text-xs text-[#7A685D] hover:underline cursor-pointer"
                  onClick={() => setShowRejectInput(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <textarea
                className="w-full text-xs p-3 bg-white border border-[#F5C7C0] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State why this record is being reversed (e.g., Receipt amount is ₦10,000 but claimed ₦100,000; or invalid vendor voucher)..."
                rows={3}
                value={rejectionReason}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  className="px-3 py-1.5 text-xs text-[#5C4638] hover:bg-white rounded-lg transition-colors cursor-pointer"
                  onClick={() => setShowRejectInput(false)}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="px-4 py-2 bg-[#BA3C2A] text-white rounded-xl text-xs font-bold hover:bg-[#8E2A1C] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  disabled={isSubmitting || rejectionReason.trim().length < 5}
                  onClick={handleReject}
                  type="button"
                >
                  <X className="w-4 h-4" />
                  <span>Confirm Reversal & Backout Funds</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#7A685D]">
            {isRejected ? (
              <span className="text-[#BA3C2A] font-medium">
                This transaction has been permanently reversed. Re-approval is
                forbidden.
              </span>
            ) : isOfficer ? (
              isExecutiveSelfReview ? (
                <span className="text-[#B27D16] font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Awaiting Independent Officer Review: You entered this claim.
                </span>
              ) : (
                <span>Authorized Officer Audit Panel</span>
              )
            ) : (
              <span>Transparent Member Audit View</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 bg-white text-[#3D291F] border border-[#E5DDD3] rounded-xl text-xs font-semibold hover:bg-[#FAF6F0] transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
              onClick={onClose}
              type="button"
            >
              Close
            </button>

            {isOfficer &&
              !isRejected &&
              (isExecutiveSelfReview ? (
                <span className="text-xs font-semibold text-[#B27D16] bg-[#FFF4E5] border border-[#F8D8A7] px-3 py-2 rounded-xl">
                  Awaiting Independent Officer Review
                </span>
              ) : (
                <>
                  {!showRejectInput && (
                    <button
                      className="px-4 py-2 bg-white text-[#BA3C2A] border border-[#BA3C2A]/40 rounded-xl text-xs font-bold hover:bg-[#FDF0EE] transition-colors cursor-pointer flex items-center gap-1.5 min-h-[38px]"
                      disabled={isSubmitting}
                      onClick={() => setShowRejectInput(true)}
                      type="button"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject / Reverse</span>
                    </button>
                  )}

                  {!isApproved && (
                    <button
                      className="px-4 py-2 bg-[#174C37] text-white rounded-xl text-xs font-bold hover:bg-[#103D2B] transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 min-h-[38px] shadow-xs"
                      disabled={isSubmitting}
                      onClick={handleApprove}
                      type="button"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#D6A23A]" />
                      <span>Approve Record</span>
                    </button>
                  )}
                </>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
