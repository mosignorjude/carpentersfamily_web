"use client";

import { AlertCircle, AlertTriangle, Plus, Tag } from "lucide-react";
import { useState } from "react";
import {
  correctClubFinanceAction,
  createFinanceCategoryAction,
  recordClubFinanceAction,
  retireFinanceCategoryAction,
  voidClubFinanceAction,
} from "@/app/actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormSubmitButton } from "@/components/ui/cf-button";

export type FinanceCategory = {
  id: string;
  name: string;
  retired_at: string | null;
};

export type FinanceTransaction = {
  id: string;
  kind: "income" | "expense";
  amount_ngn: number | string;
  transaction_date: string;
  description: string | null;
  category_id: string | null;
  category_name_snapshot: string | null;
  payer_payee: string | null;
  source_note: string | null;
  is_opening_balance: boolean;
  payment_method?: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

function confirmSubmit(
  event: React.FormEvent<HTMLFormElement>,
  message: string,
) {
  if (!window.confirm(message)) event.preventDefault();
}

export function ClubIncomeForm({
  today,
  canBackdate,
  idempotencyKey,
  onCancel,
}: {
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
  onCancel?: () => void;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash">(
    "bank_transfer",
  );

  return (
    <form
      action={recordClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
      encType="multipart/form-data"
    >
      <input name="kind" type="hidden" value="income" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="income-amount"
          >
            Amount in whole Naira (₦) <span className="text-[#BA3C2A]">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7A685D]">
              ₦
            </span>
            <FormattedAmountInput
              className="w-full h-10 pl-8 pr-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              id="income-amount"
              name="amount_ngn"
              placeholder="e.g. 50,000"
              required
            />
          </div>
        </div>

        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="income-date"
          >
            Transaction Date <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            id="income-date"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            defaultValue={today}
            max={today}
            min={canBackdate ? yearStart : today}
            name="transaction_date"
            required
            type="date"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="income-payment-method"
          >
            Payment Method <span className="text-[#BA3C2A]">*</span>
          </label>
          <select
            id="income-payment-method"
            name="payment_method"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "bank_transfer" | "cash")
            }
            required
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        {paymentMethod === "bank_transfer" ? (
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="income-receipt-file"
            >
              Payment Receipt / Voucher{" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="income-receipt-file"
              type="file"
              name="receipt_file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              required
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
            />
            <p className="mt-1 text-[11px] text-[#7A685D]">
              PDF, JPG, or PNG up to 4 MiB
            </p>
          </div>
        ) : (
          <div className="flex items-center text-xs text-[#7A685D] pt-6">
            <span>No receipt attachment required for cash transaction.</span>
          </div>
        )}
      </div>

      <div>
        <label
          className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
          htmlFor="income-source-note"
        >
          Source Note / Income Description{" "}
          <span className="text-[#BA3C2A]">*</span>
        </label>
        <input
          id="income-source-note"
          autoComplete="off"
          className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          maxLength={500}
          name="source_note"
          placeholder="e.g. Corporate donation for community outreach project"
          required
        />
      </div>

      <div>
        <label
          className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
          htmlFor="income-payer"
        >
          Payer / Donor Entity (Optional)
        </label>
        <input
          id="income-payer"
          autoComplete="off"
          className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          maxLength={160}
          name="payer_payee"
          placeholder="e.g. Chief O. Emeka Foundation"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton className="min-h-[40px]" loadingText="Recording...">
          Record Non-Dues Income
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function ClubExpenseForm({
  categories,
  today,
  canBackdate,
  idempotencyKey,
  onCancel,
}: {
  categories: FinanceCategory[];
  today: string;
  canBackdate: boolean;
  idempotencyKey: string;
  onCancel?: () => void;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const activeCategories = categories.filter((c) => !c.retired_at);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash">(
    "bank_transfer",
  );

  return (
    <form
      action={recordClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
      encType="multipart/form-data"
    >
      <input name="kind" type="hidden" value="expense" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="expense-amount"
          >
            Disbursement Amount in whole Naira (₦){" "}
            <span className="text-[#BA3C2A]">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7A685D]">
              ₦
            </span>
            <FormattedAmountInput
              className="w-full h-10 pl-8 pr-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
              id="expense-amount"
              name="amount_ngn"
              placeholder="e.g. 25,000"
              required
            />
          </div>
        </div>

        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="expense-date"
          >
            Disbursement Date <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            id="expense-date"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
            defaultValue={today}
            max={today}
            min={canBackdate ? yearStart : today}
            name="transaction_date"
            required
            type="date"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="expense-payment-method"
          >
            Payment Method <span className="text-[#BA3C2A]">*</span>
          </label>
          <select
            id="expense-payment-method"
            name="payment_method"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as "bank_transfer" | "cash")
            }
            required
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
          </select>
        </div>

        {paymentMethod === "bank_transfer" ? (
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="expense-receipt-file"
            >
              Payment Receipt / Voucher{" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="expense-receipt-file"
              type="file"
              name="receipt_file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              required
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
            />
            <p className="mt-1 text-[11px] text-[#7A685D]">
              PDF, JPG, or PNG up to 4 MiB
            </p>
          </div>
        ) : (
          <div className="flex items-center text-xs text-[#7A685D] pt-6">
            <span>No receipt attachment required for cash transaction.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="expense-category"
          >
            Expense Category / Cost Center{" "}
            <span className="text-[#BA3C2A]">*</span>
          </label>
          <select
            id="expense-category"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
            defaultValue=""
            name="category_id"
            required
          >
            <option value="">Choose an active category</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
            htmlFor="expense-payee"
          >
            Payee / Vendor Entity <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            id="expense-payee"
            autoComplete="off"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
            maxLength={160}
            name="payer_payee"
            placeholder="e.g. Asaba Electric Disco Co."
            required
          />
        </div>
      </div>

      <div>
        <label
          className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
          htmlFor="expense-description"
        >
          Disbursement Description / Justification{" "}
          <span className="text-[#BA3C2A]">*</span>
        </label>
        <input
          id="expense-description"
          autoComplete="off"
          className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
          maxLength={500}
          name="description"
          placeholder="e.g. Secretariat generator fueling and maintenance"
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton
          className="min-h-[40px]"
          loadingText="Recording..."
          variant="danger"
        >
          Record Expense Disbursement
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function FinanceCategoryForms({
  categories,
  onCancel,
}: {
  categories: FinanceCategory[];
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-6 text-xs text-[#3D291F]">
      {/* Create New Category Form */}
      <form
        action={createFinanceCategoryAction}
        className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3"
      >
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#174C37]" />
          <h4 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
            Register New Cost Center / Category
          </h4>
        </div>

        <input name="reason" type="hidden" value="Initial cost center entry" />

        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] mb-1"
            htmlFor="cat-name"
          >
            Category Name <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            id="cat-name"
            autoComplete="off"
            className="w-full h-9 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            maxLength={80}
            minLength={2}
            name="name"
            placeholder="e.g. Welfare & Benevolence"
            required
          />
        </div>

        <div className="flex justify-end pt-1">
          <FormSubmitButton
            leftIcon={Plus}
            loadingText="Adding..."
            size="compact"
          >
            Add Category
          </FormSubmitButton>
        </div>
      </form>

      {/* Categories Roster */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider">
          Existing Cost Centers ({categories.length})
        </h4>

        <div className="border border-[#E5DDD3] rounded-xl overflow-hidden divide-y divide-[#E5DDD3] bg-white">
          {categories.map((category) => (
            <div
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              key={category.id}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                    category.retired_at
                      ? "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]"
                      : "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20"
                  }`}
                >
                  {category.retired_at ? "Retired" : "Active"}
                </span>
                <strong
                  className={`font-bold ${category.retired_at ? "text-[#7A685D] line-through" : "text-[#3D291F]"}`}
                >
                  {category.name}
                </strong>
              </div>

              {!category.retired_at ? (
                <form
                  action={retireFinanceCategoryAction}
                  className="flex items-center gap-2"
                  onSubmit={(event) =>
                    confirmSubmit(
                      event,
                      `Retire “${category.name}”? Historical entries will keep this category.`,
                    )
                  }
                >
                  <input name="category_id" type="hidden" value={category.id} />
                  <label
                    className="visually-hidden"
                    htmlFor={`retire-reason-${category.id}`}
                  >
                    Retirement reason
                  </label>
                  <input
                    id={`retire-reason-${category.id}`}
                    autoComplete="off"
                    className="h-8 px-2.5 bg-white border border-[#E5DDD3] rounded-md text-[11px] text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-1 focus:ring-[#BA3C2A]"
                    maxLength={500}
                    name="reason"
                    placeholder="Reason for retirement..."
                    required
                  />
                  <FormSubmitButton
                    loadingText="Retiring..."
                    size="compact"
                    variant="danger"
                  >
                    Retire
                  </FormSubmitButton>
                </form>
              ) : (
                <span className="text-[11px] text-[#7A685D] italic">
                  Preserved for audit retention
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {onCancel && (
        <div className="flex justify-end pt-3 border-t border-[#E5DDD3]">
          <button
            className="px-4 py-2 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer"
            onClick={onCancel}
            type="button"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export function FinanceCorrectionForm({
  transaction,
  categories,
  today,
  onCancel,
}: {
  transaction: FinanceTransaction;
  categories: FinanceCategory[];
  today: string;
  onCancel?: () => void;
}) {
  const yearStart = `${today.slice(0, 4)}-01-01`;

  return (
    <form
      action={correctClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
    >
      <input name="transaction_id" type="hidden" value={transaction.id} />

      <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-[11px] text-[#5C4638] flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-[#D6A23A] shrink-0" />
        <span>
          Modifying record parameters will update the posted ledger and log an
          indelible diff in the officer audit log.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
            htmlFor="correct-amount"
          >
            Amount in whole Naira (₦) <span className="text-[#BA3C2A]">*</span>
          </label>
          <FormattedAmountInput
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            defaultValue={transaction.amount_ngn}
            id="correct-amount"
            name="amount_ngn"
            required
          />
        </div>

        <div>
          <label
            className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
            htmlFor="correct-date"
          >
            Transaction Date <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            id="correct-date"
            className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            defaultValue={transaction.transaction_date}
            max={today}
            min={yearStart}
            name="transaction_date"
            required
            type="date"
          />
        </div>
      </div>

      {transaction.kind === "expense" ? (
        <>
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
              htmlFor="correct-desc"
            >
              Description <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="correct-desc"
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              defaultValue={transaction.description ?? ""}
              maxLength={500}
              name="description"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
                htmlFor="correct-cat"
              >
                Category <span className="text-[#BA3C2A]">*</span>
              </label>
              <select
                id="correct-cat"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.category_id ?? ""}
                name="category_id"
                required
              >
                {categories.map((category) => (
                  <option
                    key={category.id}
                    value={category.id}
                    disabled={Boolean(
                      category.retired_at &&
                        category.id !== transaction.category_id,
                    )}
                  >
                    {category.name}
                    {category.retired_at ? " · Retired" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
                htmlFor="correct-payee"
              >
                Payee <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                id="correct-payee"
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={transaction.payer_payee ?? ""}
                maxLength={160}
                name="payer_payee"
                required
              />
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
              htmlFor="correct-source"
            >
              Source Note <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="correct-source"
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              defaultValue={transaction.source_note ?? ""}
              maxLength={500}
              name="source_note"
              required
            />
          </div>

          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
              htmlFor="correct-payer"
            >
              Payer (Optional)
            </label>
            <input
              id="correct-payer"
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              defaultValue={transaction.payer_payee ?? ""}
              maxLength={160}
              name="payer_payee"
            />
          </div>
        </div>
      )}

      <div>
        <label
          className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
          htmlFor="correct-reason"
        >
          Required Correction Reason (Audited){" "}
          <span className="text-[#BA3C2A]">*</span>
        </label>
        <input
          id="correct-reason"
          autoComplete="off"
          className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          maxLength={500}
          name="reason"
          placeholder="e.g. Correcting typo in vendor invoice amount per receipt voucher"
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton className="min-h-[40px]" loadingText="Saving...">
          Save Correction
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function FinanceVoidForm({
  transaction,
  onCancel,
}: {
  transaction: FinanceTransaction;
  onCancel?: () => void;
}) {
  return (
    <form
      action={voidClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
      onSubmit={(event) =>
        confirmSubmit(
          event,
          "Void this financial record? It will remain in the history and no longer count toward the balance.",
        )
      }
    >
      <input name="transaction_id" type="hidden" value={transaction.id} />

      <div className="p-3 bg-[#FDF2F2] rounded-xl border border-[#F5C2C2] text-xs text-[#BA3C2A] flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <strong className="block font-bold">Irreversible Action:</strong>
          <span>
            Voiding permanently excludes this record from club balances while
            preserving full immutable history.
          </span>
        </div>
      </div>

      <div>
        <label
          className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1"
          htmlFor="void-reason"
        >
          Required Void Reason (Audited){" "}
          <span className="text-[#BA3C2A]">*</span>
        </label>
        <input
          id="void-reason"
          autoComplete="off"
          className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
          maxLength={500}
          name="reason"
          placeholder="e.g. Duplicated voucher entry created in error"
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[40px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton
          className="min-h-[40px]"
          loadingText="Voiding..."
          variant="danger"
        >
          Confirm Void
        </FormSubmitButton>
      </div>
    </form>
  );
}
