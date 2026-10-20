import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Receipt,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type {
  DuesMemberOption,
  PaymentCorrection,
} from "@/app/(member)/dues/dues-forms";
import { DuesPaymentCorrectionForm } from "@/app/(member)/dues/dues-forms";

export type PaymentRow = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  payment_date: string;
  recorded_by: string;
  recorded_at: string;
  corrected_at: string | null;
};

interface DuesPaymentsHistoryCardProps {
  payments: PaymentRow[];
  coverageByPayment: Map<string, string[]>;
  canCorrect: boolean;
  members: DuesMemberOption[];
  targetMemberId: string;
  paymentPage: number;
  totalPaymentsCount: number;
  pageSize: number;
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

function formatNaira(value: string | number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function historyPageHref(memberId: string, page: number) {
  const params = new URLSearchParams({
    member_id: memberId,
    payment_page: String(page),
  });
  return `/dues?${params.toString()}`;
}

export function DuesPaymentsHistoryCard({
  payments,
  coverageByPayment,
  canCorrect,
  members,
  targetMemberId,
  paymentPage,
  totalPaymentsCount,
  pageSize,
}: DuesPaymentsHistoryCardProps) {
  const totalPages = Math.ceil(totalPaymentsCount / pageSize);

  return (
    <section
      aria-labelledby="payment-history-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] overflow-hidden shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="payment-history-heading"
            >
              Recorded Payment History
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Official statutory payment receipts and audit trail
          </p>
        </div>

        <span className="text-xs font-bold text-[#174C37] bg-white px-3 py-1 rounded-lg border border-[#E5DDD3] self-start sm:self-auto shadow-2xs">
          {totalPaymentsCount} Total Receipts
        </span>
      </div>

      {/* Payment Cards */}
      <div className="p-5 sm:p-6 space-y-3.5 pt-0">
        {payments.length === 0 ? (
          <div className="p-8 text-center space-y-2 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
            <FileCheck className="w-8 h-8 text-[#B8ACA0] mx-auto" />
            <h4 className="text-sm font-bold text-[#3D291F]">
              No Payments Recorded
            </h4>
            <p className="text-xs text-[#54433A]">
              Payments confirmed by the treasury desk will appear here with
              verified coverage records.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const paymentMonths = coverageByPayment.get(payment.id) ?? [];
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
                      <div className="w-8 h-8 rounded-lg bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
                        ₦
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black font-mono text-[#174C37] tabular-nums">
                            {formatNaira(payment.amount_ngn)}
                          </span>
                          {payment.corrected_at ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#BA3C2A] bg-[#FDF2F2] px-2 py-0.5 rounded border border-[#F5C2C2]">
                              <ShieldAlert className="w-3 h-3" />
                              <span>Corrected</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#174C37] bg-[#EAF4ED] px-2 py-0.5 rounded border border-[#A8D5BC]">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Verified</span>
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#54433A] mt-0.5 font-medium">
                          Receipt ID:{" "}
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

                  {/* Covered Months Pills */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-xs font-bold text-[#54433A]">
                      Covered Months:
                    </span>
                    {paymentMonths.length > 0 ? (
                      paymentMonths.map((month) => (
                        <span
                          className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-white text-[#174C37] border border-[#E5DDD3] shadow-2xs"
                          key={month}
                        >
                          {formatMonth(month)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-[#7A685D] italic">
                        No current coverage assigned
                      </span>
                    )}
                  </div>

                  {/* Admin Correction Drawer */}
                  {canCorrect && paymentMonths.length > 0 && (
                    <div className="pt-2 border-t border-[#E5DDD3]/60">
                      <DuesPaymentCorrectionForm
                        members={members}
                        payment={correction}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {totalPaymentsCount > pageSize && (
          <nav
            aria-label="Payment history pagination"
            className="flex items-center justify-between pt-3 border-t border-[#E5DDD3] text-xs font-bold text-[#54433A]"
          >
            <div>
              {paymentPage > 0 ? (
                <Link
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0] transition-colors"
                  href={historyPageHref(targetMemberId, paymentPage - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Newer receipts</span>
                </Link>
              ) : (
                <div />
              )}
            </div>

            <span>
              Page {paymentPage + 1} of {Math.max(1, totalPages)}
            </span>

            <div>
              {(paymentPage + 1) * pageSize < totalPaymentsCount ? (
                <Link
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#174C37] hover:bg-[#FAF6F0] transition-colors"
                  href={historyPageHref(targetMemberId, paymentPage + 1)}
                >
                  <span>Older receipts</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ) : (
                <div />
              )}
            </div>
          </nav>
        )}
      </div>
    </section>
  );
}
