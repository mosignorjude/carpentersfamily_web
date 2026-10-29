"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Receipt,
  XCircle,
} from "lucide-react";
import { ReceiptCell } from "@/components/finances/receipt-cell";
import { formatCoveredMonthsDisplay } from "@/lib/dues-governance.mjs";
import type { DuesPaymentRequestItem } from "./officer-dues-approvals-card";

interface MyDuesRequestsCardProps {
  requests: DuesPaymentRequestItem[];
}

export function MyDuesRequestsCard({ requests = [] }: MyDuesRequestsCardProps) {
  if (requests.length === 0) return null;

  const formatNaira = (amount: number | string) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(Number(amount) || 0);

  const formatDateTime = (timestamp: string) => {
    try {
      return new Intl.DateTimeFormat("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp));
    } catch {
      return timestamp;
    }
  };

  const getStatusBadge = (status: string, reason?: string | null) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Approved &amp; Credited</span>
          </span>
        );
      case "rejected":
        return (
          <div className="space-y-1 text-right">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#BA3C2A]/10 text-[#BA3C2A] border border-[#BA3C2A]/20">
              <XCircle className="w-3.5 h-3.5 text-[#BA3C2A]" />
              <span>Rejected</span>
            </span>
            {reason && (
              <p className="text-[11px] text-[#BA3C2A] max-w-xs">{reason}</p>
            )}
          </div>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#D6A23A]/15 text-[#3D291F] border border-[#D6A23A]/40">
            <Clock className="w-3.5 h-3.5 text-[#D6A23A]" />
            <span>Pending Review</span>
          </span>
        );
    }
  };

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "bank_transfer":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#54433A]">
            <Building2 className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Bank Transfer</span>
          </span>
        );
      case "paystack":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#54433A]">
            <CreditCard className="w-3.5 h-3.5 text-[#D6A23A]" />
            <span>Paystack Card</span>
          </span>
        );
      case "pos":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#54433A]">
            <Receipt className="w-3.5 h-3.5 text-[#3D291F]" />
            <span>POS / Secretariat</span>
          </span>
        );
      default:
        return (
          <span className="text-[11px] text-[#54433A] capitalize">
            {method}
          </span>
        );
    }
  };

  return (
    <section
      aria-labelledby="my-requests-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-6 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between border-b border-[#E5DDD3] pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#174C37]" />
          <h2
            className="text-base font-extrabold text-[#3D291F] tracking-tight"
            id="my-requests-heading"
          >
            My Dues Payment Submissions
          </h2>
        </div>
        <span className="text-xs text-[#54433A]">
          {requests.length} submission{requests.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="divide-y divide-[#E5DDD3]">
        {requests.map((req) => (
          <div
            key={req.id}
            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="font-bold text-[#3D291F]">
                  {formatCoveredMonthsDisplay(req.covered_months)}
                </strong>
                <span className="text-[#B8ACA0]">·</span>
                {getMethodBadge(req.payment_method)}
                <span className="text-[#B8ACA0]">·</span>
                <ReceiptCell
                  paymentMethod={req.payment_method}
                  paymentStatus={req.status === "approved" ? "paid" : "pending"}
                  receipt={req.receipt}
                  receiptUnavailable={req.receiptUnavailable}
                  isLegacy={!req.receipt && Boolean(req.payment_reference)}
                />
                {req.payment_reference && (
                  <>
                    <span className="text-[#B8ACA0]">·</span>
                    <span className="font-mono text-[#7A685D]">
                      Ref: {req.payment_reference}
                    </span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-[#7A685D]">
                Submitted {formatDateTime(req.created_at)}
                {req.notes ? ` · Note: ${req.notes}` : ""}
              </p>
            </div>

            <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-center gap-1.5 shrink-0">
              <span className="font-mono font-bold text-sm text-[#3D291F]">
                {formatNaira(req.amount_ngn)}
              </span>
              {getStatusBadge(req.status, req.review_reason)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
