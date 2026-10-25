"use client";

import {
  CheckCircle2,
  DollarSign,
  Info,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { recordOpeningBalanceAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
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
}

export function OpeningBalanceEntryCard({
  existingOpeningBalance,
  canRecord = false,
}: OpeningBalanceEntryCardProps) {
  // If already recorded, show verified and locked status badge with recorded details
  if (existingOpeningBalance) {
    const formattedAmount = formatNaira(existingOpeningBalance.amount_ngn);
    const date = existingOpeningBalance.transaction_date;
    const note =
      existingOpeningBalance.source_note ||
      "Verified pre-launch opening treasury balance as of go-live";

    return (
      <div
        className="bg-white rounded-2xl border border-[#174C37]/30 p-5 sm:p-6 shadow-xs space-y-4"
        data-testid="opening-balance-locked"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                Treasury Opening Cash Reserve
              </h3>
              <p className="text-xs text-[#7A685D] font-medium">
                Baseline opening balance established as of launch
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F8F5] border border-[#174C37]/30 text-[#174C37] text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
            Opening Reserve Verified &amp; Locked
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block">
                Recorded Starting Reserve
              </span>
              <span className="text-2xl font-black text-[#174C37] tracking-tight">
                {formattedAmount}
              </span>
            </div>
            <div className="text-left sm:text-right text-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block">
                As-Of Effective Date
              </span>
              <span className="font-semibold text-[#3D291F] font-mono">
                {date}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E5DDD3] text-xs">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block mb-0.5">
              Audit Note
            </span>
            <p className="text-[#5C4638] font-medium leading-relaxed">{note}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[#7A685D] pt-1">
          <Lock className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
          <span>
            Opening reserve is locked to prevent duplicate postings. Historical
            dues collected from Feb–Sep 2026 are included in this balance.
          </span>
        </div>
      </div>
    );
  }

  // Not recorded yet, but user does not have permission to record
  if (!canRecord) {
    return (
      <div
        className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-4"
        data-testid="opening-balance-unauthorized"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#7A685D] flex items-center justify-center shadow-xs">
              <DollarSign className="w-4 h-4 text-[#7A685D]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                Treasury Opening Cash Reserve
              </h3>
              <p className="text-xs text-[#7A685D] font-medium">
                Starting balance for launch operations
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold text-[#7A685D] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#E5DDD3]">
            Pending Entry
          </span>
        </div>
        <p className="text-xs text-[#7A685D] leading-relaxed">
          Opening cash reserve has not yet been recorded. Entry is restricted to
          authorized club Administrators.
        </p>
      </div>
    );
  }

  // Not recorded yet, and canRecord is true: show entry form
  return (
    <div
      className="bg-white rounded-2xl border border-[#D6A23A]/40 p-5 sm:p-6 shadow-xs space-y-4"
      data-testid="opening-balance-entry-form"
    >
      <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
            <DollarSign className="w-4 h-4 text-[#D6A23A]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
              Record Treasury Opening Balance
            </h3>
            <p className="text-xs text-[#7A685D] font-medium">
              Establish initial club cash reserve at launch
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono font-bold text-[#9E6E16] bg-[#FDF8EE] px-2.5 py-1 rounded-md border border-[#EED7A1]">
          Pre-Launch Setup
        </span>
      </div>

      <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-2.5">
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
              className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-bold text-[#174C37] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
              id="amount_ngn"
              min="0.01"
              name="amount_ngn"
              placeholder="e.g. 1500000"
              required
              step="0.01"
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
              className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
              defaultValue="2026-10-01"
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
            className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs text-[#3D291F] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
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
            className="px-5 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs min-h-[40px]"
            loadingText="Recording Balance..."
          >
            Record Opening Balance
          </FormSubmitButton>
        </div>
      </form>
    </div>
  );
}
