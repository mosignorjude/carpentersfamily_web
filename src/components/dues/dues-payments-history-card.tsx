import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Paperclip,
  Receipt,
  ShieldAlert,
  Upload,
} from "lucide-react";
import Link from "next/link";
import type {
  DuesMemberOption,
  PaymentCorrection,
} from "@/app/(member)/dues/dues-forms";
import { DuesPaymentCorrectionForm } from "@/app/(member)/dues/dues-forms";
import {
  ReceiptCell,
  type ReceiptInfo,
} from "@/components/finances/receipt-cell";
import { FormSubmitButton } from "@/components/ui";
import { formatNaira } from "@/lib/format";

export type PaymentRow = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  payment_date: string;
  payment_method?: string | null;
  request_id?: string | null;
  recorded_by: string;
  recorded_at: string;
  corrected_at: string | null;
  receipts?: ReceiptInfo[];
  receiptUnavailable?: boolean;
};

interface DuesPaymentsHistoryCardProps {
  payments: PaymentRow[];
  coverageByPayment: Map<string, string[]>;
  canCorrect: boolean;
  canAttachReceipt?: boolean;
  members: DuesMemberOption[];
  targetMemberId: string;
  paymentPage: number;
  totalPaymentsCount: number;
  pageSize: number;
  baseHref?: string;
  returnUrl?: string;
}

function formatDate(date: string) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  }).format(value);
}

function formatMonth(month: string) {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function historyPageHref(baseHref: string, page: number) {
  const params = new URLSearchParams({
    payment_page: String(page),
    tab: "history",
  });
  return `${baseHref}?${params.toString()}`;
}

function formatMethodLabel(method?: string | null) {
  switch (method) {
    case "bank_transfer":
      return "Bank Transfer";
    case "cash":
      return "Cash / Secretariat POS";
    case "pre_launch_reconciliation":
      return "Pre-Launch Reconciliation";
    default:
      return null;
  }
}

export function DuesPaymentsHistoryCard({
  payments,
  coverageByPayment,
  canCorrect,
  canAttachReceipt = false,
  members,
  targetMemberId: _targetMemberId,
  paymentPage,
  totalPaymentsCount,
  pageSize,
  baseHref = "/dues",
  returnUrl,
}: DuesPaymentsHistoryCardProps) {
  const totalPages = Math.ceil(totalPaymentsCount / pageSize);
  const attachReturnUrl = returnUrl ?? `${baseHref}?tab=history`;

  return (
    <section
      aria-labelledby="payment-history-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="payment-history-heading"
            >
              Payment History
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Confirmed dues payments, receipts, and covered months
          </p>
        </div>
      </div>

      {/* Payment Cards */}
      <div className="p-4 sm:p-6 space-y-3.5 pt-0">
        {payments.length === 0 ? (
          <div className="p-8 text-center space-y-2 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
            <FileCheck className="w-8 h-8 text-[#B8ACA0] mx-auto" />
            <h4 className="text-sm font-bold text-[#3D291F]">
              No payments recorded yet
            </h4>
            <p className="text-xs text-[#54433A]">
              Payments recorded for these dues will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const paymentMonths = coverageByPayment.get(payment.id) ?? [];
              const receipts = payment.receipts ?? [];
              const methodLabel = formatMethodLabel(payment.payment_method);
              const correction: PaymentCorrection = {
                id: payment.id,
                member_id: payment.member_id,
                amount_ngn: payment.amount_ngn,
                payment_date: payment.payment_date,
                covered_months: paymentMonths,
              };

              return (
                <article
                  className="p-4 sm:p-5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] hover:bg-white transition-colors space-y-3 shadow-2xs"
                  key={payment.id}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5DDD3]/75 pb-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold shrink-0">
                        ₦
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-black font-mono text-[#174C37] tabular-nums">
                            {formatNaira(payment.amount_ngn)}
                          </span>
                          {methodLabel && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#3D291F] bg-white border border-[#E5DDD3] px-2 py-0.5 rounded">
                              <Building2 className="w-3 h-3 text-[#174C37]" />
                              <span>{methodLabel}</span>
                            </span>
                          )}
                          {payment.corrected_at && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#BA3C2A] bg-[#FDF2F2] px-2 py-0.5 rounded">
                              <ShieldAlert className="w-3 h-3" />
                              <span>Corrected</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#54433A] mt-0.5 font-medium">
                          Payment ID:{" "}
                          <span className="font-mono text-[#3D291F]">
                            {payment.id.slice(0, 13)}…
                          </span>{" "}
                          · Paid {formatDate(payment.payment_date)}
                        </p>
                      </div>
                    </div>

                    <div className="text-left sm:text-right text-[11px] text-[#54433A]">
                      <span>Recorded: {formatDate(payment.recorded_at)}</span>
                    </div>
                  </div>

                  {/* Receipt Evidence */}
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="text-xs font-bold text-[#54433A] inline-flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5 text-[#174C37]" />
                      <span>Receipt Evidence:</span>
                    </span>
                    {receipts.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {receipts.map((receipt) => (
                          <div
                            key={receipt.id}
                            className="inline-flex items-center gap-2 bg-white border border-[#E5DDD3] px-2.5 py-1 rounded-lg"
                          >
                            <ReceiptCell
                              paymentMethod={payment.payment_method}
                              paymentStatus="paid"
                              receipt={receipt}
                            />
                            <span className="text-[11px] text-[#7A685D] truncate max-w-[160px]">
                              {receipt.filename}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ReceiptCell
                        paymentMethod={payment.payment_method}
                        paymentStatus="paid"
                        receipt={null}
                        receiptUnavailable={payment.receiptUnavailable}
                      />
                    )}
                  </div>

                  {/* Covered Months Pills */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-xs font-bold text-[#54433A]">
                      Covered Months:
                    </span>
                    {paymentMonths.length > 0 ? (
                      paymentMonths.map((month) => (
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white text-[#174C37] border border-[#E5DDD3]"
                          key={month}
                        >
                          {formatMonth(month)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#7A685D] italic">
                        No coverage assigned
                      </span>
                    )}
                  </div>

                  {/* Officer Post-Hoc Receipt Attachment */}
                  {canAttachReceipt && (
                    <details className="group border border-[#E5DDD3] rounded-xl bg-white overflow-hidden text-xs">
                      <summary className="p-3 font-bold text-[#174C37] hover:bg-[#FAF6F0] cursor-pointer flex items-center justify-between transition-colors">
                        <span className="inline-flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {receipts.length > 0
                              ? "Attach Additional Receipt"
                              : "Attach Receipt"}
                          </span>
                        </span>
                        <span className="text-[11px] text-[#54433A] font-medium">
                          PDF, JPG, PNG up to 4 MiB
                        </span>
                      </summary>
                      <form
                        action="/api/receipts"
                        className="p-3 border-t border-[#E5DDD3] bg-[#FAF6F0]/60 flex flex-col sm:flex-row sm:items-center gap-3"
                        encType="multipart/form-data"
                        method="post"
                      >
                        <input name="scope" type="hidden" value="dues" />
                        <input
                          name="target_id"
                          type="hidden"
                          value={payment.id}
                        />
                        <input
                          name="return_url"
                          type="hidden"
                          value={attachReturnUrl}
                        />
                        <input
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2 text-xs text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
                          name="file"
                          required
                          type="file"
                        />
                        <FormSubmitButton
                          className="w-full sm:w-auto shrink-0 min-h-[40px]"
                          leftIcon={Upload}
                          loadingText="Uploading..."
                          size="compact"
                        >
                          Upload Receipt
                        </FormSubmitButton>
                      </form>
                    </details>
                  )}

                  {/* Admin Correction Drawer */}
                  {canCorrect && paymentMonths.length > 0 && (
                    <div className="pt-2 border-t border-[#E5DDD3]/60">
                      <DuesPaymentCorrectionForm
                        members={members}
                        payment={correction}
                        returnTo={returnUrl}
                      />
                    </div>
                  )}
                </article>
              );
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-[#E5DDD3]">
                <div className="text-xs text-[#54433A]">
                  Page <strong>{paymentPage + 1}</strong> of{" "}
                  <strong>{totalPages}</strong>
                </div>

                <div className="flex items-center gap-2">
                  {paymentPage > 0 ? (
                    <Link
                      className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-xs font-bold text-[#3D291F] hover:bg-[#FAF6F0] inline-flex items-center gap-1 shadow-2xs"
                      href={historyPageHref(baseHref, paymentPage - 1)}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </Link>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-neutral-100 text-xs text-neutral-400 inline-flex items-center gap-1 cursor-not-allowed">
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </span>
                  )}

                  {paymentPage + 1 < totalPages ? (
                    <Link
                      className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-xs font-bold text-[#3D291F] hover:bg-[#FAF6F0] inline-flex items-center gap-1 shadow-2xs"
                      href={historyPageHref(baseHref, paymentPage + 1)}
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-neutral-100 text-xs text-neutral-400 inline-flex items-center gap-1 cursor-not-allowed">
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
