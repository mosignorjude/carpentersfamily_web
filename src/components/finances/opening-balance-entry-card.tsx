"use client";

import {
  CheckCircle2,
  DollarSign,
  Info,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { recordOpeningBalanceAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import { createSubmissionKey } from "@/lib/finance-idempotency.mjs";
import { formatNaira } from "@/lib/format";

export interface OpeningBalanceTransaction {
  id?: string;
  amount_ngn: number | string;
  transaction_date: string;
  source_note?: string | null;
  created_at?: string;
}

export interface OpeningBalanceEntryCardProps {
  existingOpeningBalance?: OpeningBalanceTransaction | null;
  canRecord?: boolean;
  today?: string;
}

function getWatTodayFallback() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function OpeningBalanceEntryCard({
  existingOpeningBalance,
  canRecord = false,
  today,
}: OpeningBalanceEntryCardProps) {
  const [idempotencyKey] = useState(() => createSubmissionKey());
  const defaultDate = today || getWatTodayFallback();
  // If already recorded, show verified and locked status badge with recorded details
  if (existingOpeningBalance) {
    const formattedAmount = formatNaira(existingOpeningBalance.amount_ngn);
    const date = existingOpeningBalance.transaction_date;
    const note =
      existingOpeningBalance.source_note ||
      "Verified pre-launch opening treasury balance as of go-live";

    return (
      <div
        className="bg-white rounded-xl border border-[#E5DDD3] p-5 sm:p-6 shadow-2xs space-y-4"
        data-testid="opening-balance-locked"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[10px] bg-[#174C37] text-white flex items-center justify-center shadow-2xs shrink-0">
              <ShieldCheck className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                Opening Balance
              </h3>
              <p className="text-xs text-[#5C4638] font-medium">
                Baseline opening balance established as of launch
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F8F5] border border-[#174C37]/30 text-[#174C37] text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
            Verified &amp; Locked
          </span>
        </div>

        <div className="p-4 rounded-[10px] bg-[#FAF6F0] border border-[#E5DDD3] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-[#5C4638] block">
                Recorded Starting Reserve
              </span>
              <span className="text-2xl font-black text-[#174C37] tracking-tight tabular-nums font-mono">
                {formattedAmount}
              </span>
            </div>
            <div className="text-left sm:text-right text-xs">
              <span className="text-xs font-semibold text-[#5C4638] block">
                As-Of Effective Date
              </span>
              <span className="font-semibold text-[#3D291F] font-mono">
                {date}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5DDD3] text-xs">
            <span className="text-xs font-semibold text-[#5C4638] block mb-0.5">
              Audit Note
            </span>
            <p className="text-[#5C4638] font-medium leading-relaxed">{note}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#5C4638] pt-1">
          <Lock className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
          <span>
            Opening reserve is locked to prevent duplicate postings. Historical
            dues collected from Feb–Sep 2026 are included in this balance.
          </span>
        </div>
      </div>
    );
  }

  // Not recorded yet, and user does not have permission to record
  if (!canRecord) {
    return null;
  }

  // Not recorded yet, and canRecord is true: show entry form
  return (
    <div
      className="bg-white rounded-xl border border-[#E5DDD3] p-5 sm:p-6 shadow-2xs space-y-4"
      data-testid="opening-balance-entry-form"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-[10px] bg-[#174C37] text-white flex items-center justify-center shadow-2xs shrink-0">
            <DollarSign className="w-4 h-4 text-[#D6A23A]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
              Record Treasury Opening Balance
            </h3>
            <p className="text-xs text-[#5C4638] font-medium">
              Establish initial club cash reserve at launch
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold text-[#8D5B0E] bg-[#FDF8EE] px-2.5 py-1 rounded-[10px] border border-[#EED7A1]">
          Pre-Launch Setup
        </span>
      </div>

      <div className="p-3.5 rounded-[10px] bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          This opening balance establishes the starting cash reserve for the
          club treasury as of launch. Historical dues collected from Feb–Sep
          2026 are included in this balance and will not be double-counted.
        </p>
      </div>

      <form
        action={recordOpeningBalanceAction}
        className="space-y-4"
        method="post"
      >
        <input name="idempotency_key" type="hidden" value={idempotencyKey} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label
              className="block text-xs font-bold text-[#3D291F]"
              htmlFor="amount_ngn"
            >
              Verified Opening Amount (₦){" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0]/60 text-sm font-bold text-[#174C37] focus:outline-none focus:ring-2 focus:ring-[#174C37] focus:bg-white transition-colors"
              id="amount_ngn"
              min="1"
              name="amount_ngn"
              placeholder="e.g. 1500000"
              required
              step="1"
              type="number"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-xs font-bold text-[#3D291F]"
              htmlFor="transaction_date"
            >
              As-Of Date <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0]/60 text-sm font-semibold text-[#3D291F] focus:outline-none focus:ring-2 focus:ring-[#174C37] focus:bg-white transition-colors"
              defaultValue={defaultDate}
              id="transaction_date"
              name="transaction_date"
              required
              type="date"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-bold text-[#3D291F]"
            htmlFor="source_note"
          >
            Source Note
          </label>
          <input
            className="w-full min-h-[44px] px-3 rounded-[10px] border border-[#E5DDD3] bg-[#FAF6F0]/60 text-sm text-[#3D291F] focus:outline-none focus:ring-2 focus:ring-[#174C37] focus:bg-white transition-colors"
            defaultValue="Verified pre-launch opening treasury balance as of go-live"
            id="source_note"
            maxLength={500}
            name="source_note"
            required
            type="text"
          />
        </div>

        <div className="pt-2 flex items-center justify-end">
          <FormSubmitButton
            className="px-5 py-2.5 rounded-[10px] bg-[#174C37] hover:bg-[#103D2B] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-2xs min-h-[44px]"
            loadingText="Recording Balance..."
          >
            Record Opening Balance
          </FormSubmitButton>
        </div>
      </form>
    </div>
  );
}
