"use client";

import { CheckSquare, Square, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  correctDuesPaymentAction,
  recordDuesPaymentAction,
  setDuesRateAction,
  writeOffDuesAction,
} from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { formatNaira } from "@/lib/format";

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

function RecordDuesSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-[10px] bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Recording Payment..." : "Record Dues Payment"}
    </button>
  );
}

export function DuesPaymentForm({
  memberId,
  availableMonths,
  today,
  monthlyRateNgn = 5000,
  returnTo,
}: {
  memberId: string;
  availableMonths: DuesMonthOption[];
  today: string;
  monthlyRateNgn?: number;
  returnTo?: string;
}) {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [prepayInput, setPrepayInput] = useState("");
  const [amountEditedManually, setAmountEditedManually] = useState(false);
  const [manualAmountDigits, setManualAmountDigits] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash">(
    "bank_transfer",
  );
  const [hasReceiptFile, setHasReceiptFile] = useState(false);

  const parsedPrepayMonths = useMemo(() => {
    if (!prepayInput.trim()) return [];
    const checkedPrefixes = new Set(
      selectedMonths.map((month) => month.slice(0, 7)),
    );
    const unique = new Set<string>();
    for (const token of prepayInput.split(",")) {
      const trimmed = token.trim();
      const match = /^(\d{4})-(0[1-9]|1[0-2])(-01)?$/.exec(trimmed);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!checkedPrefixes.has(key)) {
          unique.add(key);
        }
      }
    }
    return [...unique];
  }, [prepayInput, selectedMonths]);

  const suggestedTotal = useMemo(() => {
    const unpaidSum = availableMonths
      .filter((option) => selectedMonths.includes(option.month))
      .reduce(
        (sum, option) => sum + (Number(option.amount) || monthlyRateNgn),
        0,
      );
    return unpaidSum + parsedPrepayMonths.length * monthlyRateNgn;
  }, [availableMonths, selectedMonths, parsedPrepayMonths, monthlyRateNgn]);

  const displayedAmountDigits = amountEditedManually
    ? manualAmountDigits
    : suggestedTotal > 0
      ? String(suggestedTotal)
      : "";

  const totalSelectedCount = selectedMonths.length + parsedPrepayMonths.length;

  const toggleMonth = (month: string) => {
    setAmountEditedManually(false);
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month],
    );
  };

  const selectAllMonths = () => {
    setAmountEditedManually(false);
    setSelectedMonths(availableMonths.map((option) => option.month));
  };

  const clearMonths = () => {
    setAmountEditedManually(false);
    setSelectedMonths([]);
  };

  const submitDisabled =
    totalSelectedCount === 0 ||
    !displayedAmountDigits ||
    Number(displayedAmountDigits) <= 0 ||
    (paymentMethod === "bank_transfer" && !hasReceiptFile);

  return (
    <form
      action={recordDuesPaymentAction}
      className="space-y-4"
      encType="multipart/form-data"
    >
      <input name="member_id" type="hidden" value={memberId} />
      {returnTo && <input name="return_to" type="hidden" value={returnTo} />}
      {selectedMonths.map((month) => (
        <input
          key={month}
          name="covered_month"
          type="hidden"
          value={month.slice(0, 7)}
        />
      ))}

      {availableMonths.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#54433A]">
              Unpaid Months to Cover
            </span>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs font-bold text-[#174C37] hover:underline cursor-pointer"
                onClick={selectAllMonths}
                type="button"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Select All ({availableMonths.length})</span>
              </button>
              <span aria-hidden="true" className="text-[#B8ACA0]">
                ·
              </span>
              <button
                className="inline-flex min-h-[36px] items-center gap-1 px-2 text-xs font-bold text-[#7A685D] hover:underline cursor-pointer"
                onClick={clearMonths}
                type="button"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1.5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/60">
            {availableMonths.map((option) => {
              const isChecked = selectedMonths.includes(option.month);
              return (
                <label
                  key={option.month}
                  className={`flex min-h-[44px] items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                    isChecked
                      ? "bg-white border-[#174C37] text-[#174C37] font-bold shadow-2xs"
                      : "bg-transparent border-[#E5DDD3] text-[#54433A] hover:bg-white"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      checked={isChecked}
                      className="w-4 h-4 rounded border-[#E5DDD3] accent-[#174C37] shrink-0"
                      onChange={() => toggleMonth(option.month)}
                      type="checkbox"
                    />
                    <span className="truncate">{option.label}</span>
                  </span>
                  <span className="font-mono text-[11px] tabular-nums shrink-0">
                    {displayAmount(option.amount)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
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
          onChange={(e) => {
            setAmountEditedManually(false);
            setPrepayInput(e.target.value);
          }}
          placeholder="YYYY-MM, YYYY-MM"
          value={prepayInput}
        />
        <p className="text-[11px] font-normal text-[#7A685D] mt-1">
          Select unpaid months or enter future months. Total updates
          automatically to match the configured monthly dues rate (
          {formatNaira(monthlyRateNgn)}/mo).
        </p>
      </label>

      {totalSelectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#EAF4ED] border border-[#A8D5BC] text-xs text-[#174C37]">
          <span className="font-semibold">
            {totalSelectedCount} {totalSelectedCount === 1 ? "month" : "months"}{" "}
            selected
          </span>
          <strong className="font-mono font-black tabular-nums">
            Expected Total: {formatNaira(suggestedTotal)}
          </strong>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full min-w-0">
        <label
          className="block text-xs font-bold text-[#54433A] space-y-1.5 w-full min-w-0 max-w-full"
          htmlFor="dues-payment-amount"
        >
          <span>Payment Amount (₦)</span>
          <FormattedAmountInput
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] font-mono font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            id="dues-payment-amount"
            name="amount_ngn"
            onAmountChange={(digits) => {
              setAmountEditedManually(true);
              setManualAmountDigits(digits);
            }}
            placeholder={`e.g. ${monthlyRateNgn.toLocaleString("en-NG")}`}
            required
            value={displayedAmountDigits}
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
            onChange={(e) =>
              setPaymentMethod(e.target.value as "bank_transfer" | "cash")
            }
            value={paymentMethod}
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash / Secretariat POS</option>
          </select>
        </label>

        <label className="block text-xs font-bold text-[#54433A] space-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-[#174C37]" />
            <span>
              {paymentMethod === "bank_transfer"
                ? "Payment Receipt / Voucher (Required)"
                : "Payment Receipt / Voucher (Optional)"}
            </span>
          </span>
          <input
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2 text-xs text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
            name="receipt_file"
            onChange={(e) =>
              setHasReceiptFile(
                Boolean(e.target.files && e.target.files.length > 0),
              )
            }
            required={paymentMethod === "bank_transfer"}
            type="file"
          />
          {paymentMethod === "cash" ? (
            <p className="text-[11px] font-normal text-[#7A685D] pt-1 sm:pt-6">
              Optional for cash payments. Attach a PDF, JPG, or PNG receipt up
              to 4 MiB if available.
            </p>
          ) : (
            <p className="text-[11px] font-normal text-[#7A685D] pt-1">
              Required for bank transfer. PDF, JPG, or PNG up to 4 MiB; visible
              to the member once recorded.
            </p>
          )}
        </label>
      </div>

      <div className="pt-2">
        <RecordDuesSubmitButton disabled={submitDisabled} />
      </div>
    </form>
  );
}

export function DuesWriteOffForm({
  memberId,
  memberName,
  pastUnpaidMonths,
  returnTo,
}: {
  memberId: string;
  memberName: string;
  pastUnpaidMonths: DuesMonthOption[];
  returnTo?: string;
}) {
  if (pastUnpaidMonths.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#54433A]">
        There are no past unpaid months to write off.
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
            `Write off the selected dues months for ${memberName}? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="member_id" type="hidden" value={memberId} />
      {returnTo && <input name="return_to" type="hidden" value={returnTo} />}

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
        <span>Reason for write-off</span>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#BA3C2A] focus:ring-1 focus:ring-[#BA3C2A] outline-hidden"
          maxLength={500}
          name="reason"
          placeholder="Brief reason for clearing these dues..."
          required
        />
      </label>

      <div className="pt-2">
        <button
          className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-[10px] bg-[#BA3C2A] text-white text-xs font-bold hover:bg-[#a33222] transition-colors shadow-xs cursor-pointer min-h-[44px]"
          type="submit"
        >
          Write Off Selected Months
        </button>
      </div>
    </form>
  );
}

export function DuesPaymentCorrectionForm({
  payment,
  members,
  returnTo,
}: {
  payment: PaymentCorrection;
  members: DuesMemberOption[];
  returnTo?: string;
}) {
  return (
    <details className="group border border-[#E5DDD3] rounded-xl bg-white overflow-hidden text-xs">
      <summary className="p-3 font-bold text-[#174C37] hover:bg-[#FAF6F0] cursor-pointer flex items-center justify-between transition-colors">
        <span>Edit Payment Record</span>
        <span className="text-[11px] text-[#54433A] font-medium">
          Audit Retained
        </span>
      </summary>

      <form
        action={correctDuesPaymentAction}
        className="mt-3 pt-3 px-3 pb-3 border-t border-[#E5DDD3] space-y-3.5"
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
        {returnTo && <input name="return_to" type="hidden" value={returnTo} />}

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
            htmlFor={`dues-correct-amount-${payment.id}`}
          >
            <span>Corrected Amount in Whole Naira (₦)</span>
            <FormattedAmountInput
              className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] font-mono font-bold focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
              defaultValue={payment.amount_ngn}
              id={`dues-correct-amount-${payment.id}`}
              name="amount_ngn"
              required
            />
          </label>

          <label
            className="block text-xs font-bold text-[#54433A] space-y-1 w-full min-w-0 max-w-full"
            htmlFor={`dues-correct-date-${payment.id}`}
          >
            <span>Corrected Payment Date</span>
            <input
              className="block w-full max-w-full min-w-0 rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden appearance-none"
              defaultValue={payment.payment_date}
              id={`dues-correct-date-${payment.id}`}
              name="payment_date"
              required
              type="date"
            />
          </label>
        </div>

        <label className="block text-xs font-bold text-[#54433A] space-y-1">
          <span>Reason for correction</span>
          <input
            autoComplete="off"
            className="w-full rounded-lg border border-[#E5DDD3] bg-white p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
            maxLength={500}
            name="reason"
            placeholder="Brief explanation of this correction..."
            required
          />
        </label>

        <div className="pt-1">
          <button
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[38px]"
            type="submit"
          >
            Save Correction
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
          className="block text-xs font-bold text-[#54433A] space-y-1.5 w-full min-w-0 max-w-full"
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
          className="block text-xs font-bold text-[#54433A] space-y-1.5 w-full min-w-0 max-w-full"
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
        <span>Reason for rate change</span>
        <input
          autoComplete="off"
          className="w-full rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] p-2.5 text-xs text-[#3D291F] focus:border-[#174C37] focus:ring-1 focus:ring-[#174C37] outline-hidden"
          maxLength={500}
          name="reason"
          placeholder="e.g. Approved at the general meeting"
          required
        />
      </label>

      <div className="pt-1">
        <button
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#103D2B] transition-colors shadow-2xs cursor-pointer min-h-[44px] sm:min-h-[38px]"
          type="submit"
        >
          Save Rate
        </button>
      </div>
    </form>
  );
}
