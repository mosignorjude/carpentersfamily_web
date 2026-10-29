"use client";

import { useState } from "react";
import {
  correctDuesPaymentAction,
  recordDuesPaymentAction,
  setDuesRateAction,
  writeOffDuesAction,
} from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";

export type DuesMonthOption = {
  month: string;
  amount: string | number | null;
  label: string;
};

export type DuesMemberOption = {
  id: string;
  full_name: string;
  username: string;
  status: string;
};

export type PaymentCorrection = {
  id: string;
  member_id: string;
  amount_ngn: string | number;
  payment_date: string;
  covered_months: string[];
};

function displayAmount(amount: string | number | null) {
  if (amount === null) return "rate unavailable";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function DuesPaymentForm({
  memberId,
  availableMonths,
  today,
}: {
  memberId: string;
  availableMonths: DuesMonthOption[];
  today: string;
}) {
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash">(
    "cash",
  );

  return (
    <form
      action={recordDuesPaymentAction}
      className="space-y-4"
      encType="multipart/form-data"
    >
      <input name="member_id" type="hidden" value={memberId} />

      {availableMonths.length > 0 ? (
        <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
          <span>
            Unpaid Months to Cover (Hold Ctrl / Cmd to select multiple)
          </span>
          <select
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden shadow-2xs font-medium"
            multiple
            name="covered_month"
            size={Math.min(8, availableMonths.length)}
          >
            {availableMonths.map((option) => (
              <option
                className="py-1 px-1.5 rounded hover:bg-[#174C37]/10"
                key={option.month}
                value={option.month.slice(0, 7)}
              >
                {option.label} · {displayAmount(option.amount)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="p-3 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#54433A]">
          <span className="font-bold block text-[#3D291F]">
            Unpaid Months to Cover
          </span>
          <span>There are no unpaid months in the current schedule.</span>
        </div>
      )}

      <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
        <span>Additional Future Pre-payment Months (Optional)</span>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden font-mono"
          maxLength={10000}
          name="prepay_months"
          placeholder="YYYY-MM, YYYY-MM"
        />
        <p className="text-[11px] font-normal text-[#7A685D] mt-1">
          Select full months or enter additional future months. The database
          checks the exact total against each month&apos;s configured rate;
          partial payments are rejected.
        </p>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0">
        <label
          className="block text-xs font-bold text-[#54433A] space-y-1.5 w-full min-w-0 max-w-full"
          htmlFor="dues-payment-amount"
        >
          <span>Exact Payment Amount in Whole Naira (₦)</span>
          <FormattedAmountInput
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] font-mono font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            id="dues-payment-amount"
            name="amount_ngn"
            placeholder="e.g. 10,000"
            required
          />
        </label>

        <label
          className="block text-xs font-bold text-[#54433A] space-y-1.5 w-full min-w-0 max-w-full"
          htmlFor="dues-payment-date"
        >
          <span>Payment Date</span>
          <input
            className="block w-full max-w-full min-w-0 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden appearance-none"
            defaultValue={today}
            id="dues-payment-date"
            max={today}
            name="payment_date"
            required
            type="date"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
          <span>Payment Method</span>
          <select
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            name="payment_method"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "bank_transfer" | "cash")
            }
          >
            <option value="cash">Cash / Secretariat POS</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </label>

        {paymentMethod === "bank_transfer" ? (
          <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
            <span>Payment Receipt / Voucher (Required)</span>
            <input
              type="file"
              name="receipt_file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              required
              className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2 text-xs text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
            />
          </label>
        ) : (
          <div className="flex items-center text-xs text-[#7A685D] pt-1 sm:pt-6">
            <span>No receipt attachment required for cash transaction.</span>
          </div>
        )}
      </div>

      <div className="pt-2">
        <button
          className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-[10px] bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer min-h-[44px]"
          type="submit"
        >
          Record Dues Payment
        </button>
      </div>
    </form>
  );
}

export function DuesWriteOffForm({
  memberId,
  memberName,
  pastUnpaidMonths,
}: {
  memberId: string;
  memberName: string;
  pastUnpaidMonths: DuesMonthOption[];
}) {
  if (pastUnpaidMonths.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#54433A]">
        No past unpaid months are currently eligible for statutory write-off.
      </div>
    );
  }

  return (
    <form
      action={writeOffDuesAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Write off the selected full dues months for ${memberName}? This is a final financial disposition.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />

      <label className="block text-xs font-bold text-[#BA3C2A] space-y-1.5">
        <span>Old Unpaid Months to Write Off</span>
        <select
          className="w-full rounded-lg border border-[#F5C2C2] bg-[#FFF9F8] p-2.5 text-xs text-[#3D291F] focus:border-[#BA3C2A] focus:ring-1 focus:ring-[#BA3C2A] outline-hidden font-medium"
          multiple
          name="covered_month"
          required
          size={Math.min(8, pastUnpaidMonths.length)}
        >
          {pastUnpaidMonths.map((option) => (
            <option
              className="py-1 px-1.5 rounded hover:bg-[#BA3C2A]/10"
              key={option.month}
              value={option.month.slice(0, 7)}
            >
              {option.label} · {displayAmount(option.amount)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
        <span>Required Governance & Audit Reason</span>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#BA3C2A] focus:ring-1 focus:ring-[#BA3C2A] outline-hidden"
          maxLength={500}
          name="reason"
          placeholder="State the executive resolution or justification..."
          required
        />
      </label>

      <div className="pt-2">
        <button
          className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-[10px] bg-[#BA3C2A] text-white text-xs font-bold hover:bg-[#a33222] transition-colors shadow-xs cursor-pointer min-h-[44px]"
          type="submit"
        >
          Confirm Statutory Write-Off
        </button>
      </div>
    </form>
  );
}

export function DuesPaymentCorrectionForm({
  payment,
  members,
}: {
  payment: PaymentCorrection;
  members: DuesMemberOption[];
}) {
  return (
    <details className="group border border-[#E5DDD3] rounded-xl bg-white overflow-hidden text-xs">
      <summary className="p-3 font-bold text-[#174C37] hover:bg-[#FAF6F0] cursor-pointer flex items-center justify-between transition-colors">
        <span>Officer Action: Correct This Payment Record</span>
        <span className="text-[11px] text-[#54433A] font-medium">
          Audit Retained
        </span>
      </summary>

      <form
        action={correctDuesPaymentAction}
        className="mt-3 pt-3 border-t border-[#E5DDD3] space-y-3.5"
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Save this payment correction? The previous coverage will remain in the audit history.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="payment_id" type="hidden" value={payment.id} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <label className="block text-xs font-bold text-[#54433A] space-y-1">
            <span>Member Assignment</span>
            <select
              className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden font-medium"
              defaultValue={payment.member_id}
              name="member_id"
              required
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} · @{member.username} · {member.status}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-bold text-[#54433A] space-y-1">
            <span>Corrected Covered Months (comma-separated YYYY-MM)</span>
            <input
              autoComplete="off"
              className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] font-mono focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
              defaultValue={payment.covered_months
                .map((month) => month.slice(0, 7))
                .join(", ")}
              maxLength={10000}
              name="covered_months"
              required
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full min-w-0">
          <label
            className="block text-xs font-bold text-[#54433A] space-y-1 w-full min-w-0 max-w-full"
            htmlFor="dues-correct-amount"
          >
            <span>Corrected Amount in Whole Naira (₦)</span>
            <FormattedAmountInput
              className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] font-mono font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
              defaultValue={payment.amount_ngn}
              id="dues-correct-amount"
              name="amount_ngn"
              required
            />
          </label>

          <label
            className="block text-xs font-bold text-[#54433A] space-y-1 w-full min-w-0 max-w-full"
            htmlFor="dues-correct-date"
          >
            <span>Corrected Payment Date</span>
            <input
              className="block w-full max-w-full min-w-0 rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden appearance-none"
              defaultValue={payment.payment_date}
              id="dues-correct-date"
              name="payment_date"
              required
              type="date"
            />
          </label>
        </div>

        <label className="block text-xs font-bold text-[#54433A] space-y-1">
          <span>Required Correction Reason (Recorded in Audit Trail)</span>
          <input
            autoComplete="off"
            className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            maxLength={500}
            name="reason"
            placeholder="Explain why this receipt record is being corrected..."
            required
          />
        </label>

        <div className="pt-1">
          <button
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[38px]"
            type="submit"
          >
            Save Payment Correction
          </button>
        </div>
      </form>
    </details>
  );
}

export function DuesRateForm({ nextMonth }: { nextMonth: string }) {
  return (
    <form
      action={setDuesRateAction}
      className="space-y-3.5 text-xs"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Set a new monthly dues rate effective ${nextMonth}? Any already-paid future months keep their recorded rate.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full min-w-0">
        <label
          className="block text-xs font-bold text-[#54433A] space-y-1 w-full min-w-0 max-w-full"
          htmlFor="dues-effective-month"
        >
          <span>Effective Month (Next month only)</span>
          <input
            className="block w-full max-w-full min-w-0 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] font-mono focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden appearance-none"
            defaultValue={nextMonth}
            id="dues-effective-month"
            name="effective_month"
            required
            type="month"
          />
        </label>

        <label
          className="block text-xs font-bold text-[#54433A] space-y-1 w-full min-w-0 max-w-full"
          htmlFor="dues-monthly-amount"
        >
          <span>New Monthly Rate in Whole Naira (₦)</span>
          <FormattedAmountInput
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] font-mono font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            id="dues-monthly-amount"
            name="amount_ngn"
            placeholder="e.g. 10,000"
            required
          />
        </label>
      </div>

      <label className="block text-xs font-bold text-[#54433A] space-y-1">
        <span>Governance Resolution or Justification</span>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
          maxLength={500}
          name="reason"
          placeholder="e.g. General Assembly Resolution GA-2026-03"
          required
        />
      </label>

      <div className="pt-1">
        <button
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[38px]"
          type="submit"
        >
          Schedule Dues Rate
        </button>
      </div>
    </form>
  );
}
