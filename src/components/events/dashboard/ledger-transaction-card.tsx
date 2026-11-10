"use client";

import { Paperclip } from "lucide-react";
import { formatNaira } from "@/lib/format";
import type { DashboardTransaction } from "./dashboard-types";

export interface LedgerTransactionCardProps {
  transaction: DashboardTransaction;
  onSelect: (transaction: DashboardTransaction) => void;
  currentUserId?: string;
  userRole?: string;
}

export function LedgerTransactionCard({
  transaction,
  onSelect,
  currentUserId,
  userRole,
}: LedgerTransactionCardProps) {
  const effectiveStatus =
    transaction.verificationStatus === "cancelled"
      ? "cancelled"
      : transaction.status === "voided"
        ? "rejected"
        : transaction.verificationStatus || "approved";

  const isVoided =
    effectiveStatus === "rejected" || effectiveStatus === "cancelled";
  const isCancelled = effectiveStatus === "cancelled";
  const isPending = effectiveStatus === "recorded";
  const isExpense = transaction.type === "expense";

  const isExecutive = userRole === "executive";
  const isSelfReview =
    isExecutive &&
    isPending &&
    Boolean(currentUserId) &&
    Boolean(transaction.createdBy) &&
    transaction.createdBy === currentUserId;

  const dotColor = isVoided
    ? "bg-[#BA3C2A]"
    : isPending
      ? "bg-[#8D5B0E]"
      : "bg-[#174C37]";
  const statusTextColor = isVoided
    ? "text-[#BA3C2A]"
    : isPending
      ? "text-[#8D5B0E]"
      : "text-[#174C37]";
  const cardSurface = isVoided
    ? "bg-[#FFF8F7] border-[#BA3C2A]/30 hover:border-[#BA3C2A]/60"
    : "bg-white border-[#E5DDD3] hover:border-[#174C37]/50";
  const amountColor = isVoided
    ? "line-through text-[#7A685D]"
    : isExpense
      ? "text-[#BA3C2A]"
      : "text-[#174C37]";

  const shortRef =
    transaction.paymentRef || transaction.id.slice(0, 8).toUpperCase();
  const categoryLine =
    transaction.category === "ticket_sales" && transaction.tierName
      ? `${transaction.tierName} · ${transaction.categoryLabel}`
      : transaction.categoryLabel || "General";
  const hasReceipt = Boolean(
    transaction.receipt || transaction.receiptFileName,
  );
  const statusLabel = isPending
    ? "Pending"
    : isCancelled
      ? "Cancelled"
      : isVoided
        ? "Voided"
        : "Approved";

  return (
    <button
      className={`w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer shadow-2xs space-y-1 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174C37] focus-visible:ring-offset-1 ${cardSurface}`}
      onClick={() => onSelect(transaction)}
      title={`Full ID: ${transaction.id}`}
      type="button"
    >
      {/* Line 1: Status Dot + Bold Action/Title + Desktop Counterparty + Tabular Amount */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
          />
          <strong
            className={`text-xs font-bold truncate block ${
              isVoided ? "line-through text-[#7A685D]" : "text-[#3D291F]"
            }`}
          >
            {transaction.description}
          </strong>
          <span className="text-[11px] text-[#7A685D] truncate hidden sm:inline">
            · {transaction.payerPayee}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`font-mono font-bold text-xs tabular-nums ${amountColor}`}
          >
            {isExpense ? "-" : "+"}
            {formatNaira(transaction.amount)}
          </span>
        </div>
      </div>

      {/* Line 2: Category, Mobile Party, Ref/Date, Paperclip Receipt & Concise Status / Wrapped SoD */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-[#7A685D] border-t border-[#E5DDD3]/40 pt-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 pr-1">
          <span className="font-medium text-[#5C4638] truncate">
            {categoryLine}
          </span>
          <span className="sm:hidden" aria-hidden="true">
            ·
          </span>
          <span className="truncate sm:hidden">{transaction.payerPayee}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono shrink-0">#{shortRef}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono shrink-0">{transaction.date}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 max-w-full">
          {hasReceipt && (
            <span
              className="text-[#174C37] inline-flex items-center gap-0.5 font-medium"
              title="Receipt attached"
            >
              <Paperclip className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Receipt</span>
            </span>
          )}
          {isSelfReview ? (
            <span className="font-semibold text-[#8D5B0E] whitespace-normal text-right leading-tight">
              Needs Another Officer's Review
            </span>
          ) : (
            <span className={`font-bold ${statusTextColor}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
