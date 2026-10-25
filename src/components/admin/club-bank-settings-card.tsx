"use client";

import { Building2, Edit3, Lock } from "lucide-react";
import { updateClubPaymentSettingsAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";

export interface ClubPaymentSettings {
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  instructions?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
}

export interface ClubBankSettingsCardProps {
  paymentSettings?: ClubPaymentSettings | null;
  isAdmin?: boolean;
  isOfficer?: boolean;
}

export function ClubBankSettingsCard({
  paymentSettings,
  isAdmin = false,
}: ClubBankSettingsCardProps) {
  const canEdit = Boolean(isAdmin);

  const bankName =
    paymentSettings?.bankName ?? paymentSettings?.bank_name ?? "";
  const accountNumber =
    paymentSettings?.accountNumber ?? paymentSettings?.account_number ?? "";
  const accountName =
    paymentSettings?.accountName ?? paymentSettings?.account_name ?? "";
  const instructions = paymentSettings?.instructions ?? "";

  const isConfigured = Boolean(bankName && accountNumber && accountName);

  if (!canEdit) {
    return (
      <div
        className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-4"
        data-testid="club-bank-settings-read-only"
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-[#174C37] flex items-center justify-center shadow-xs">
              <Building2 className="w-4 h-4 text-[#174C37]" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                Club Settlement Bank Account
              </h3>
              <p className="text-xs text-[#7A685D] font-medium">
                Official depository for member dues and club transfers
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold text-[#7A685D] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#E5DDD3] flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-[#7A685D]" />
            Read Only
          </span>
        </div>

        {isConfigured ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block mb-1">
                  Bank Name
                </span>
                <span className="font-bold text-[#3D291F] text-sm block">
                  {bankName}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block mb-1">
                  Account Number (NUBAN)
                </span>
                <span className="font-mono font-extrabold text-[#174C37] text-sm tracking-wider block">
                  {accountNumber}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block mb-1">
                Account Name
              </span>
              <span className="font-bold text-[#3D291F] block">
                {accountName}
              </span>
            </div>

            {instructions && (
              <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#7A685D] block mb-1">
                  Deposit / Transfer Instructions
                </span>
                <p className="text-[#5C4638] whitespace-pre-wrap leading-relaxed">
                  {instructions}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D]">
            Settlement bank details have not yet been configured by club
            administration.
          </div>
        )}

        <div className="pt-2 text-[11px] text-[#7A685D] flex items-center gap-1.5 border-t border-[#E5DDD3]">
          <Lock className="w-3 h-3 shrink-0 text-[#7A685D]" />
          <span>
            Settlement account updates are restricted to club Administrators.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-2xl border border-[#174C37]/30 p-5 sm:p-6 shadow-xs space-y-4"
      data-testid="club-bank-settings-editable"
    >
      <div className="flex items-center justify-between pb-3.5 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
            <Building2 className="w-4 h-4 text-[#D6A23A]" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
              Club Settlement Bank Details
            </h3>
            <p className="text-xs text-[#7A685D] font-medium">
              Manage the official receiving account for member dues and
              donations
            </p>
          </div>
        </div>
        <span className="text-[11px] font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2.5 py-1 rounded-md border border-[#E5DDD3] flex items-center gap-1.5">
          <Edit3 className="w-3 h-3 text-[#174C37]" />
          Admin Controlled
        </span>
      </div>

      <form
        action={updateClubPaymentSettingsAction}
        className="space-y-4"
        method="post"
      >
        <input name="return_to" type="hidden" value="/finances" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1.5">
            <label
              className="block text-xs font-bold text-[#3D291F]"
              htmlFor="bank_name"
            >
              Bank Name <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
              defaultValue={bankName}
              id="bank_name"
              maxLength={100}
              name="bank_name"
              placeholder="e.g. Zenith Bank"
              required
              type="text"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="block text-xs font-bold text-[#3D291F]"
              htmlFor="account_number"
            >
              Account Number (10 digits){" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-mono font-bold text-[#174C37] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
              defaultValue={accountNumber}
              id="account_number"
              inputMode="numeric"
              maxLength={10}
              name="account_number"
              pattern="^[0-9]{10}$"
              placeholder="10-digit NUBAN"
              required
              type="text"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-bold text-[#3D291F]"
            htmlFor="account_name"
          >
            Account Name <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            className="w-full h-10 px-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors"
            defaultValue={accountName}
            id="account_name"
            maxLength={150}
            name="account_name"
            placeholder="e.g. Carpenters Family Social Club"
            required
            type="text"
          />
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-bold text-[#3D291F]"
            htmlFor="instructions"
          >
            Transfer Instructions / Narration Guide{" "}
            <span className="text-[11px] font-normal text-[#7A685D]">
              (optional)
            </span>
          </label>
          <textarea
            className="w-full p-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs text-[#3D291F] focus:outline-none focus:border-[#174C37] focus:bg-white transition-colors resize-none leading-relaxed"
            defaultValue={instructions}
            id="instructions"
            maxLength={500}
            name="instructions"
            placeholder="e.g. Please put your Member Full Name and Phone Number in the transfer remark."
            rows={2}
          />
        </div>

        <div className="pt-2 flex items-center justify-end">
          <FormSubmitButton
            className="px-5 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs min-h-[40px]"
            loadingText="Saving Bank Details..."
          >
            Save Bank Details
          </FormSubmitButton>
        </div>
      </form>
    </div>
  );
}
