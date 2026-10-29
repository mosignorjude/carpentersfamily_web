"use client";

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  CreditCard,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import type { DuesMonthOption } from "@/app/(member)/dues/dues-forms";
import {
  DuesPaymentForm,
  DuesWriteOffForm,
} from "@/app/(member)/dues/dues-forms";

interface OfficerDuesControlsCardProps {
  canRecord: boolean;
  canWriteOff: boolean;
  memberId: string;
  memberName: string;
  availableMonths: DuesMonthOption[];
  pastUnpaidMonths: DuesMonthOption[];
  today: string;
}

export function OfficerDuesControlsCard({
  canRecord,
  canWriteOff,
  memberId,
  memberName,
  availableMonths,
  pastUnpaidMonths,
  today,
}: OfficerDuesControlsCardProps) {
  const [activeTab, setActiveTab] = useState<"record" | "writeoff">("record");

  if (!canRecord && !canWriteOff) return null;

  return (
    <section
      aria-labelledby="officer-actions-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="officer-actions-heading"
            >
              Officer Treasury Controls
            </h2>
          </div>
          <p className="text-xs text-[#54433A] font-medium mt-1">
            Authoritative ledger mutation desk for{" "}
            <strong className="text-[#3D291F] font-bold">{memberName}</strong>
          </p>
        </div>

        {/* Action Toggle Pills */}
        <div className="flex items-center gap-2">
          {canRecord && (
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "record"
                  ? "bg-[#174C37] text-white shadow-2xs"
                  : "bg-white text-[#54433A] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setActiveTab("record")}
              type="button"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Payment</span>
            </button>
          )}

          {canWriteOff && (
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "writeoff"
                  ? "bg-[#BA3C2A] text-white shadow-2xs"
                  : "bg-white text-[#54433A] border border-[#E5DDD3] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => setActiveTab("writeoff")}
              type="button"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Write Off Unpaid</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="p-4 sm:p-6 space-y-4 pt-0">
        {activeTab === "record" && canRecord && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3] text-xs text-[#54433A]">
              <CheckCircle2 className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Recording a dues payment creates an official receipt voucher,
                updates eligible covered months, and logs an indelible audit
                entry in the system ledger.
              </p>
            </div>

            <DuesPaymentForm
              availableMonths={availableMonths}
              memberId={memberId}
              today={today}
            />
          </div>
        )}

        {activeTab === "writeoff" && canWriteOff && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 bg-[#FFF9F8] p-3 rounded-xl border border-[#F5C2C2] text-xs text-[#BA3C2A]">
              <AlertCircle className="w-4 h-4 text-[#BA3C2A] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Writing off dues is a final financial disposition. The write-off
                reason is permanently recorded in the audit history.
              </p>
            </div>

            <DuesWriteOffForm
              memberId={memberId}
              memberName={memberName}
              pastUnpaidMonths={pastUnpaidMonths}
            />
          </div>
        )}
      </div>
    </section>
  );
}
