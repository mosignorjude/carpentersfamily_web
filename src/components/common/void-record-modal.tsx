"use client";

import { AlertTriangle, Loader2, ShieldAlert, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { VoidableRecord } from "@/components/events/dashboard/dashboard-types";

interface VoidRecordModalProps {
  isOpen: boolean;
  isPending?: boolean;
  record: VoidableRecord | null;
  userRoles?: string[];
  onClose: () => void;
  onConfirmVoid: (
    record: VoidableRecord,
    reason: string,
  ) => void | Promise<{ success: boolean; error?: string }>;
}

export function VoidRecordModal({
  isOpen,
  isPending = false,
  record,
  userRoles = [],
  onClose,
  onConfirmVoid,
}: VoidRecordModalProps) {
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");

  useModalHygiene({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) {
      setReason("");
      setError("");
    }
  }, [isOpen]);

  if (!isOpen || !record) return null;

  const isAdmin =
    userRoles.includes("admin") ||
    userRoles.includes("backup_admin") ||
    userRoles.includes("president");

  // Determine consequence and permissions
  let actionTitle = "Void Record";
  let consequenceCopy =
    "Excludes this record from all balances. Retains row in audit trail.";
  let isActionBlocked = false;
  let blockedReason = "";

  if (record.entityType === "ticket_sale") {
    if (
      record.source === "online" &&
      record.verificationStatus === "recorded"
    ) {
      actionTitle = "Void Order";
      consequenceCopy =
        "Cancels this order. No payment was received; no refund required.";
    } else if (record.verificationStatus === "approved") {
      actionTitle = "Void Ticket (Refund)";
      consequenceCopy = `Voids this approved ticket and marks ${
        record.amountNgn ? formatNaira(record.amountNgn) : "the payment"
      } as owed back to the buyer.`;
      if (!isAdmin) {
        isActionBlocked = true;
        blockedReason =
          "Segregation of duties: Only an active Administrator may void or refund an approved ticket.";
      }
    } else {
      actionTitle = "Void Ticket";
      consequenceCopy =
        "Rejects this sale and frees capacity. Discards unverified payment claim.";
    }
  } else if (record.entityType === "event_transaction") {
    if (record.verificationStatus === "recorded") {
      actionTitle = "Void Voucher";
      consequenceCopy =
        "Rejects this voucher before it can affect event budgets or ledgers.";
    } else {
      actionTitle = "Void Transaction";
      consequenceCopy =
        "Excludes this record from all balances. Retains row in audit trail.";
      if (!isAdmin) {
        isActionBlocked = true;
        blockedReason =
          "Segregation of duties: Only an active Administrator may void posted event transactions.";
      }
    }
  } else if (record.entityType === "club_transaction") {
    actionTitle = "Void Transaction";
    consequenceCopy =
      "Excludes this record from club treasury. Retains row in audit trail.";
    if (!isAdmin) {
      isActionBlocked = true;
      blockedReason =
        "Segregation of duties: Only an active Administrator may void club financial transactions.";
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || isActionBlocked) return;

    const trimmed = reason.trim();
    if (!trimmed || trimmed.length < 5) {
      setError(
        "A transparent audit reason of at least 5 characters is mandatory to void this record.",
      );
      return;
    }

    try {
      const res = await onConfirmVoid(record, trimmed);
      if (res && typeof res === "object" && !res.success && res.error) {
        setError(res.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to void record";
      setError(msg);
    }
  };

  return (
    <div
      aria-labelledby="void-modal-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#BA3C2A]/10 text-[#BA3C2A] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="void-modal-title"
              >
                {actionTitle}
              </h3>
              <p className="text-xs text-[#7A685D]">
                Irreversible administrative void action.
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form
          className="p-6 space-y-4 text-xs overflow-y-auto flex-1"
          onSubmit={handleSubmit}
        >
          {/* Target Record Summary Card */}
          <div className="p-3.5 rounded-xl border border-[#E5DDD3] bg-white space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#3D291F]">
                {record.reference || record.id}
              </span>
              {record.amountNgn !== undefined && (
                <span className="font-mono font-bold text-[#BA3C2A] text-sm tabular-nums">
                  {formatNaira(record.amountNgn)}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-[#3D291F]">
              {record.title || record.description}
            </p>
            {record.party && (
              <p className="text-[11px] text-[#7A685D]">
                Party: {record.party}
                {record.paymentMethod
                  ? ` · Channel: ${
                      record.paymentMethod === "bank_transfer"
                        ? "Bank Transfer"
                        : "Cash"
                    }`
                  : ""}
              </p>
            )}
          </div>

          {/* Dynamic Financial Consequence Helper */}
          <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-[#5C4638] space-y-1">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] tracking-wider block">
              Financial Impact
            </span>
            <p className="text-xs leading-relaxed font-medium">
              {consequenceCopy}
            </p>
          </div>

          {/* Blocked Notification (if non-admin) */}
          {isActionBlocked && (
            <div className="p-3 bg-[#BA3C2A]/10 border border-[#BA3C2A]/20 rounded-xl flex items-start gap-2.5 text-[#BA3C2A]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-medium leading-relaxed">
                {blockedReason}
              </p>
            </div>
          )}

          {/* Audit Reason Textarea */}
          <div className="space-y-1.5">
            <label
              className="font-bold text-[#3D291F] block"
              htmlFor="void-record-reason-input"
            >
              Audit Reason (Mandatory)
            </label>
            <textarea
              className="w-full h-24 p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A] resize-none disabled:bg-[#FAF6F0] disabled:cursor-not-allowed"
              disabled={isPending || isActionBlocked}
              id="void-record-reason-input"
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              placeholder="State exactly why this record is being voided (min 5 characters)..."
              required
              value={reason}
            />
            {error && (
              <p className="text-xs text-[#BA3C2A] font-semibold mt-1">
                {error}
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2.5 text-xs font-semibold text-[#5C4638] bg-[#FAF6F0] hover:bg-[#E5DDD3]/60 rounded-xl transition-colors min-h-[44px] disabled:opacity-50 cursor-pointer"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-5 py-2.5 text-xs font-semibold text-white bg-[#BA3C2A] hover:bg-[#8E2A1C] rounded-xl transition-colors min-h-[44px] shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              disabled={isPending || isActionBlocked || reason.trim().length < 5}
              type="submit"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Voiding Record…</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  <span>Confirm Void</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
