"use client";

import {
  Building2,
  CalendarCheck,
  Check,
  Copy,
  CreditCard,
  Receipt,
  ShieldCheck,
  X,
} from "lucide-react";
import { useId, useState } from "react";
import type { DuesMonthOption } from "@/app/(member)/dues/dues-forms";
import { submitDuesPaymentRequestAction } from "@/app/actions";
import {
  CfTextField,
  FormAlertBanner,
  FormFieldHint,
  FormSubmitButton,
} from "@/components/ui";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

export interface DuesPaymentSettings {
  bankName: string;
  accountNumber: string;
  accountName: string;
  instructions?: string;
}

interface PayDuesModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberName: string;
  unpaidTotalNgn: number;
  monthlyRateNgn: number;
  availableMonths: DuesMonthOption[];
  isAdmin?: boolean;
  paymentSettings?: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    instructions?: string;
  } | null;
}

export function PayDuesModal({
  isOpen,
  onClose,
  memberName,
  unpaidTotalNgn,
  monthlyRateNgn,
  availableMonths = [],
  isAdmin = false,
  paymentSettings,
}: PayDuesModalProps) {
  const [copied, setCopied] = useState(false);
  const [channel, setChannel] = useState<"transfer" | "gateway" | "pos">(
    "transfer",
  );
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() =>
    availableMonths.map((m) => m.month),
  );
  const [hasReceiptFile, setHasReceiptFile] = useState(false);
  const [notes, setNotes] = useState("");

  useModalHygiene({ isOpen, onClose });

  const notesInputId = useId();

  if (!isOpen) return null;

  const isBankConfigured = Boolean(
    paymentSettings?.bankName &&
      paymentSettings?.accountNumber &&
      paymentSettings?.accountName,
  );
  const displayBankTitle = isBankConfigured
    ? `${paymentSettings?.bankName} · ${paymentSettings?.accountName}`
    : "Club bank details verification pending";
  const displayAccountNumber = isBankConfigured
    ? (paymentSettings?.accountNumber ?? "—")
    : "Pending verification";

  const handleCopy = () => {
    if (!isBankConfigured || !paymentSettings?.accountNumber) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(paymentSettings.accountNumber)
          .catch(() => {});
      }
    } catch {
      // Fallback for restricted clipboard contexts
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  const formatNaira = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(amount);

  const toggleMonth = (month: string) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };

  const selectAll = () => {
    setSelectedMonths(availableMonths.map((m) => m.month));
  };

  const clearSelection = () => {
    setSelectedMonths([]);
  };

  const selectedAmountNgn = availableMonths
    .filter((m) => selectedMonths.includes(m.month))
    .reduce((sum, m) => sum + (Number(m.amount) || monthlyRateNgn), 0);

  return (
    <div
      aria-labelledby="pay-dues-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center items-end justify-center p-0 sm:p-4 bg-[#0C3325]/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5DDD3] w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-0 sm:my-8">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-extrabold text-base shadow-xs">
              ₦
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="pay-dues-title"
              >
                Settle Statutory Membership Dues
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Carpenters Family Social Club · Dues Desk
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

        {/* Form & Body */}
        <form
          action={submitDuesPaymentRequestAction}
          className="flex flex-col flex-1 overflow-hidden"
          encType="multipart/form-data"
          id="dues-payment-form"
        >
          <div className="p-6 space-y-4 text-xs text-[#3D291F] max-h-[75vh] overflow-y-auto">
            {/* Admin Exemption Banner */}
            {isAdmin ? (
              <div className="p-5 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#174C37]/15 text-[#174C37] mx-auto flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-[#174C37]" />
                </div>
                <h4 className="font-bold text-sm text-[#3D291F]">
                  Club Administrator Exemption
                </h4>
                <p className="text-xs text-[#54433A] max-w-sm mx-auto leading-relaxed">
                  As an active Club Administrator, you are exempt from statutory
                  dues obligations under club financial policy. No payment
                  submission is required.
                </p>
                <div className="pt-2">
                  <button
                    className="px-5 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors cursor-pointer min-h-[44px]"
                    onClick={onClose}
                    type="button"
                  >
                    Understood
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Member & Obligation Snapshot */}
                <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#54433A] font-medium">
                      Club Member:
                    </span>
                    <strong className="text-[#3D291F] font-bold text-sm">
                      {memberName}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#54433A] font-medium">
                      Standard Monthly Rate:
                    </span>
                    <span className="font-mono font-bold text-xs text-[#174C37]">
                      {formatNaira(monthlyRateNgn)} / month
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2.5 border-t border-[#E5DDD3]">
                    <span className="font-bold text-[#3D291F]">
                      Total Open Dues:
                    </span>
                    <span className="text-lg font-black font-mono text-[#BA3C2A] tabular-nums">
                      {formatNaira(unpaidTotalNgn)}
                    </span>
                  </div>
                </div>

                {availableMonths.length === 0 ? (
                  <div className="p-5 rounded-xl border border-[#E5DDD3] bg-white text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-[#174C37]/10 text-[#174C37] mx-auto flex items-center justify-center">
                      <CalendarCheck className="w-5 h-5 text-[#174C37]" />
                    </div>
                    <h4 className="font-bold text-sm text-[#3D291F]">
                      Account Up to Date
                    </h4>
                    <p className="text-xs text-[#54433A] leading-relaxed">
                      You have no outstanding statutory dues obligations. Thank
                      you for your prompt contributions!
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Month Selection */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-[#54433A] uppercase tracking-wider">
                          Select Months to Settle
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-[10px] font-bold text-[#174C37] hover:underline cursor-pointer"
                            onClick={selectAll}
                            type="button"
                          >
                            Select All
                          </button>
                          <span className="text-[#B8ACA0]">·</span>
                          <button
                            className="flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-[10px] font-bold text-[#7A685D] hover:underline cursor-pointer"
                            id="btn-clear-dues-months"
                            onClick={clearSelection}
                            type="button"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-[#E5DDD3] rounded-xl bg-[#FAF6F0]/50">
                        {availableMonths.map((opt) => {
                          const isChecked = selectedMonths.includes(opt.month);
                          return (
                            <label
                              key={opt.month}
                              className={`flex min-h-[44px] items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? "bg-white border-[#174C37] text-[#174C37] font-bold shadow-2xs"
                                  : "bg-transparent border-[#E5DDD3] text-[#54433A] hover:bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  checked={isChecked}
                                  className="w-4 h-4 text-[#174C37] border-[#E5DDD3] rounded focus:ring-[#174C37]"
                                  onChange={() => toggleMonth(opt.month)}
                                  type="checkbox"
                                />
                                <span className="truncate">{opt.label}</span>
                              </div>
                              <span className="font-mono text-[11px] tabular-nums">
                                {formatNaira(
                                  Number(opt.amount) || monthlyRateNgn,
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {selectedMonths.length === 0 && (
                        <FormAlertBanner
                          className="mt-2.5"
                          message="Please select at least one unpaid dues month above to proceed with payment settlement."
                          title="No Months Selected"
                          variant="warning"
                        />
                      )}
                    </div>

                    {/* Channel Selector */}
                    <div>
                      <span className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-2">
                        Select Settlement Channel
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          className={`p-2.5 rounded-xl border text-center transition-all min-h-[44px] cursor-pointer ${
                            channel === "transfer"
                              ? "border-[#174C37] bg-[#174C37]/10 text-[#174C37] font-bold shadow-2xs"
                              : "border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0]"
                          }`}
                          onClick={() => setChannel("transfer")}
                          type="button"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Building2 className="w-4 h-4 text-[#174C37]" />
                            <span className="text-[11px]">Bank Transfer</span>
                          </div>
                        </button>

                        <button
                          className={`p-2.5 rounded-xl border text-center transition-all min-h-[44px] cursor-pointer ${
                            channel === "gateway"
                              ? "border-[#174C37] bg-[#174C37]/10 text-[#174C37] font-bold shadow-2xs"
                              : "border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0]"
                          }`}
                          onClick={() => setChannel("gateway")}
                          type="button"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <CreditCard className="w-4 h-4 text-[#D6A23A]" />
                            <span className="text-[11px]">Card / Paystack</span>
                          </div>
                        </button>

                        <button
                          className={`p-2.5 rounded-xl border text-center transition-all min-h-[44px] cursor-pointer ${
                            channel === "pos"
                              ? "border-[#174C37] bg-[#174C37]/10 text-[#174C37] font-bold shadow-2xs"
                              : "border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0]"
                          }`}
                          onClick={() => setChannel("pos")}
                          type="button"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Receipt className="w-4 h-4 text-[#3D291F]" />
                            <span className="text-[11px]">Secretariat POS</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Bank Account Details Banner */}
                    {channel === "transfer" && (
                      <div className="p-3.5 rounded-xl border border-[#E5DDD3] bg-white space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#54433A]">
                            Bank / Account:
                          </span>
                          <strong className="text-[#3D291F]">
                            {displayBankTitle}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between bg-[#FAF6F0] px-3 py-1.5 rounded-lg border border-[#E5DDD3]">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-[#54433A] block">
                              Account Number
                            </span>
                            <strong className="font-mono text-base font-black text-[#174C37] tracking-wider">
                              {displayAccountNumber}
                            </strong>
                          </div>
                          <button
                            id="btn-copy-account-number"
                            disabled={!isBankConfigured}
                            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                              !isBankConfigured
                                ? "opacity-50 cursor-not-allowed bg-neutral-200 text-neutral-500"
                                : copied
                                  ? "bg-emerald-700 text-white scale-105 shadow-xs cursor-pointer"
                                  : "bg-[#174C37] text-white hover:bg-[#103D2B] cursor-pointer"
                            }`}
                            onClick={handleCopy}
                            type="button"
                            title={
                              !isBankConfigured
                                ? "Account details pending verification"
                                : "Copy Account Number"
                            }
                          >
                            {copied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#D6A23A] scale-110 transition-transform duration-200" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-[#FAF6F0]" />
                                <span>Copy Account</span>
                              </>
                            )}
                          </button>
                        </div>

                        {paymentSettings?.instructions && (
                          <p className="text-[11px] text-[#54433A] bg-[#FAF6F0] p-2 rounded-lg border border-[#E5DDD3]">
                            <span className="font-semibold text-[#3D291F]">
                              Note:{" "}
                            </span>
                            {paymentSettings.instructions}
                          </p>
                        )}

                        {!isBankConfigured && (
                          <p className="text-[11px] text-[#8C6D23] bg-[#FDF8EE] p-2 rounded-lg border border-[#EED7A1]">
                            Official bank account details are currently being
                            verified by club administration.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Channel specific content */}
                    {channel === "gateway" && (
                      <div className="p-4 rounded-xl border border-[#EED7A1] bg-[#FDF8EE] text-center space-y-2">
                        <CreditCard className="w-6 h-6 text-[#D6A23A] mx-auto" />
                        <h4 className="font-bold text-xs text-[#3D291F]">
                          Online Card Payment Unavailable
                        </h4>
                        <p className="text-[11px] text-[#54433A]">
                          Online card and payment gateway settlements are
                          currently unavailable. Please choose Bank Transfer or
                          Secretariat POS.
                        </p>
                      </div>
                    )}

                    {channel === "pos" && (
                      <div className="p-3.5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] space-y-1">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-[#174C37]" />
                          <h4 className="font-bold text-xs text-[#3D291F]">
                            Secretariat Cash / POS Settlement
                          </h4>
                        </div>
                        <p className="text-[11px] text-[#54433A]">
                          Submit this request and present your cash or card at
                          the Secretariat desk. The reviewing officer will
                          verify and confirm receipt in the system.
                        </p>
                      </div>
                    )}

                    {/* Payment Submission Fields */}
                    <div className="space-y-3 pt-2 border-t border-[#E5DDD3]">
                      {/* Hidden Form Fields */}
                      {selectedMonths.map((m) => (
                        <input
                          key={m}
                          name="covered_months"
                          type="hidden"
                          value={m.slice(0, 7)}
                        />
                      ))}
                      <input
                        name="amount_ngn"
                        type="hidden"
                        value={selectedAmountNgn}
                      />
                      <input
                        name="payment_method"
                        type="hidden"
                        value={channel === "pos" ? "cash" : "bank_transfer"}
                      />

                      {/* Receipt file input for Bank Transfer */}
                      {channel === "transfer" && (
                        <CfTextField
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
                          hint="Upload your bank transfer confirmation slip or mobile app screenshot (PDF, JPG, PNG up to 4 MiB)."
                          id="dues-receipt-file"
                          label="Payment Receipt / Screenshot *"
                          name="receipt_file"
                          onChange={(e) =>
                            setHasReceiptFile(
                              Boolean(
                                e.target.files && e.target.files.length > 0,
                              ),
                            )
                          }
                          required
                          type="file"
                        />
                      )}

                      {/* Optional Notes */}
                      <div className="space-y-1">
                        <label
                          className="block text-[11px] font-bold text-[#3D291F] uppercase tracking-wider"
                          htmlFor={notesInputId}
                        >
                          Additional Notes (Optional)
                        </label>
                        <textarea
                          className="w-full min-h-[7rem] rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden resize-none"
                          id={notesInputId}
                          maxLength={500}
                          name="notes"
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. Paid via mobile banking app by member Adekunle"
                          rows={2}
                          value={notes}
                        />
                        <FormFieldHint message="Include any relevant payment details (e.g. depositor name, bank app used)." />
                      </div>
                    </div>
                  </>
                )}

                {/* Verification Protocol Notice */}
                <FormAlertBanner
                  message="Dues payments are database-backed and verified by designated Club Officers (Executive, Admin, or Backup Admin). Officers cannot approve their own dues."
                  title="Verification Protocol"
                  variant="info"
                />
              </>
            )}
          </div>

          {/* Pinned Footer */}
          <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
            <button
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#3D291F] text-xs font-bold hover:bg-[#F5EFEB] transition-colors cursor-pointer min-h-[44px]"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>

            {!isAdmin && availableMonths.length > 0 && (
              <FormSubmitButton
                className="w-full sm:w-auto px-5 py-2.5 min-h-[44px]"
                disabled={
                  selectedMonths.length === 0 ||
                  selectedAmountNgn <= 0 ||
                  channel === "gateway" ||
                  (channel === "transfer" && !hasReceiptFile)
                }
                id="btn-submit-dues-payment"
                leftIcon={ShieldCheck}
                loadingText="Submitting Payment..."
              >
                Submit Payment for Verification (
                {formatNaira(selectedAmountNgn)})
              </FormSubmitButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
