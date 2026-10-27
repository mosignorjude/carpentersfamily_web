"use client";

import {
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  approveDuesPaymentRequestAction,
  rejectDuesPaymentRequestAction,
} from "@/app/actions";
import {
  ReceiptCell,
  type ReceiptInfo,
} from "@/components/finances/receipt-cell";
import { FormSubmitButton } from "@/components/ui/cf-button";
import { EmptyStateCard } from "@/components/ui/state-screen";
import {
  canReviewDuesRequest,
  formatCoveredMonthsDisplay,
} from "@/lib/dues-governance.mjs";

export type DuesPaymentRequestItem = {
  id: string;
  member_id: string;
  amount_ngn: number | string;
  covered_months: string[];
  payment_method: string;
  payment_reference?: string | null;
  receipt?: ReceiptInfo | null;
  receiptUnavailable?: boolean;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
};

interface OfficerDuesApprovalsCardProps {
  pendingRequests: DuesPaymentRequestItem[];
  pendingMembersMap: Record<
    string,
    { full_name: string; username: string; roles: string[] }
  >;
  viewerId: string;
  viewerRoles: string[];
}

export function OfficerDuesApprovalsCard({
  pendingRequests = [],
  pendingMembersMap = {},
  viewerId,
  viewerRoles = [],
}: OfficerDuesApprovalsCardProps) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "bank_transfer":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#174C37]/10 text-[#174C37]">
            <Building2 className="w-3 h-3" />
            <span>Bank Transfer</span>
          </span>
        );
      case "paystack":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#D6A23A]/15 text-[#3D291F]">
            <CreditCard className="w-3 h-3 text-[#D6A23A]" />
            <span>Paystack Card</span>
          </span>
        );
      case "pos":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#3D291F]/10 text-[#3D291F]">
            <Receipt className="w-3 h-3" />
            <span>Secretariat POS</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 capitalize">
            {method}
          </span>
        );
    }
  };

  return (
    <section
      aria-labelledby="dues-approvals-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5DDD3] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F] tracking-tight"
              id="dues-approvals-heading"
            >
              Officer Dues Approvals Queue
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                pendingRequests.length > 0
                  ? "bg-[#D6A23A]/20 text-[#3D291F] border border-[#D6A23A]/40"
                  : "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]"
              }`}
            >
              {pendingRequests.length} Pending
            </span>
          </div>
          <p className="text-xs text-[#54433A]">
            Review, verify payment references against club statements, and
            authorize settlement into the immutable dues ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#54433A]">
          <Clock className="w-4 h-4 text-[#174C37]" />
          <span>Officer Verification</span>
        </div>
      </div>

      {pendingRequests.length === 0 ? (
        <EmptyStateCard
          className="my-2"
          description="All member dues submissions have been verified and settled. When members submit payment references, they will appear here for verification."
          icon={CheckCircle2}
          title="No Pending Dues Submissions"
        />
      ) : (
        <div className="space-y-4">
          {pendingRequests.map((req) => {
            const memberInfo = pendingMembersMap[req.member_id] ?? {
              full_name: "Club Member",
              username: "member",
              roles: [],
            };

            const reviewCheck = canReviewDuesRequest({
              approverId: viewerId,
              approverRoles: viewerRoles,
              targetMemberId: req.member_id,
              targetRoles: memberInfo.roles,
            });

            const isSelf = viewerId === req.member_id;
            const isRejectOpen = rejectingId === req.id;

            return (
              <div
                key={req.id}
                className="p-5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/40 hover:bg-[#FAF6F0]/80 transition-colors space-y-4"
              >
                {/* Request Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#174C37] text-white flex items-center justify-center font-bold text-xs shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-sm font-bold text-[#3D291F]">
                          {memberInfo.full_name}
                        </strong>
                        <span className="text-xs text-[#7A685D]">
                          @{memberInfo.username}
                        </span>
                        {memberInfo.roles.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#174C37] text-white"
                          >
                            {r.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-[#7A685D] block">
                        Submitted: {formatDateTime(req.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-lg font-black font-mono text-[#174C37] tabular-nums block">
                      {formatNaira(req.amount_ngn)}
                    </span>
                    <span className="text-[11px] font-bold text-[#54433A]">
                      {formatCoveredMonthsDisplay(req.covered_months)}
                    </span>
                  </div>
                </div>

                {/* Details Strip */}
                <div className="p-3 bg-white rounded-lg border border-[#E5DDD3] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[10px] font-bold text-[#7A685D] uppercase block">
                        Channel
                      </span>
                      {getMethodBadge(req.payment_method)}
                    </div>
                    <div className="border-l border-[#E5DDD3] pl-3">
                      <span className="text-[10px] font-bold text-[#7A685D] uppercase block">
                        Receipt Evidence
                      </span>
                      <ReceiptCell
                        paymentMethod={req.payment_method}
                        paymentStatus="paid"
                        receipt={req.receipt}
                        receiptUnavailable={req.receiptUnavailable}
                        isLegacy={
                          !req.receipt && Boolean(req.payment_reference)
                        }
                      />
                      {req.payment_reference && (
                        <span className="font-mono text-[10px] text-[#7A685D] block">
                          Ref: {req.payment_reference}
                        </span>
                      )}
                    </div>
                  </div>

                  {req.notes && (
                    <div className="text-xs text-[#54433A] italic max-w-sm">
                      &ldquo;{req.notes}&rdquo;
                    </div>
                  )}
                </div>

                {/* Governance Permission & Action Buttons */}
                {!reviewCheck.allowed ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#FFF9F8] border border-[#F5C2C2] text-xs">
                    <div className="flex items-center gap-2 text-[#BA3C2A] font-bold">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{reviewCheck.reason}</span>
                    </div>
                    {isSelf && (
                      <span className="text-[11px] text-[#7A685D]">
                        Another officer must verify your dues submission.
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 border-t border-[#E5DDD3]">
                    {!isRejectOpen ? (
                      <>
                        <button
                          className="px-4 py-2 rounded-lg border border-[#E5DDD3] bg-white text-[#BA3C2A] text-xs font-bold hover:bg-[#FFF9F8] transition-colors cursor-pointer min-h-[38px] flex items-center justify-center gap-1.5"
                          onClick={() => {
                            setRejectingId(req.id);
                            setRejectReason("");
                          }}
                          type="button"
                        >
                          <XCircle className="w-4 h-4 text-[#BA3C2A]" />
                          <span>Reject Submission</span>
                        </button>

                        <form
                          action={approveDuesPaymentRequestAction}
                          className="inline-block"
                        >
                          <input
                            name="request_id"
                            type="hidden"
                            value={req.id}
                          />
                          <FormSubmitButton
                            id={`btn-approve-dues-${req.id}`}
                            className="btn-approve-dues-action w-full sm:w-auto px-5 py-2 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs min-h-[38px] flex items-center justify-center gap-1.5"
                            leftIcon={CheckCircle2}
                            loadingText="Settling..."
                          >
                            Approve &amp; Settle Dues
                          </FormSubmitButton>
                        </form>
                      </>
                    ) : (
                      <form
                        action={rejectDuesPaymentRequestAction}
                        className="w-full space-y-2.5 p-3 rounded-lg bg-[#FFF9F8] border border-[#F5C2C2]"
                      >
                        <input name="request_id" type="hidden" value={req.id} />
                        <div className="flex items-center justify-between text-xs text-[#BA3C2A] font-bold">
                          <span>Confirm Rejection of Payment Submission</span>
                          <button
                            className="text-[11px] text-[#7A685D] hover:underline cursor-pointer"
                            onClick={() => setRejectingId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                        <input
                          className="w-full rounded border border-[#F5C2C2] bg-white p-2 text-xs text-[#3D291F] outline-hidden focus:border-[#BA3C2A] focus:ring-1 focus:ring-[#BA3C2A]"
                          maxLength={500}
                          minLength={1}
                          name="reason"
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="State reason for rejecting (e.g. Reference not found on bank statement)..."
                          required
                          type="text"
                          value={rejectReason}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            className="px-3 py-1.5 rounded border border-[#E5DDD3] bg-white text-xs font-bold text-[#54433A] cursor-pointer"
                            onClick={() => setRejectingId(null)}
                            type="button"
                          >
                            Back
                          </button>
                          <FormSubmitButton
                            disabled={rejectReason.trim().length === 0}
                            loadingText="Rejecting..."
                            size="compact"
                            variant="danger"
                          >
                            Confirm Rejection
                          </FormSubmitButton>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
