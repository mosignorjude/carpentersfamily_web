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
import { CfFieldLayout, CfSelect, CfTextField, CONTROL } from "@/components/ui";
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const formData = new FormData(form);
    const errors: Record<string, string> = {};

    const rawAmount = String(formData.get("amount_ngn") || "").replace(
      /\D/g,
      "",
    );
    if (!rawAmount || Number(rawAmount) <= 0) {
      errors.amount_ngn = "Please enter amount.";
    }

    const sourceNote = String(formData.get("source_note") || "").trim();
    if (!sourceNote) {
      errors.source_note = "Please enter source note.";
    }

    if (paymentMethod === "bank_transfer") {
      const file = formData.get("receipt_file") as File | null;
      if (!file || file.size === 0) {
        errors.receipt_file = "Please attach payment receipt.";
      }
    }

    if (Object.keys(errors).length > 0) {
      e.preventDefault();
      setFieldErrors(errors);
    }
  };

  return (
    <form
      action={recordClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
      encType="multipart/form-data"
      noValidate
      onSubmit={handleSubmit}
    >
      <input name="kind" type="hidden" value="income" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <CfFieldLayout
            error={fieldErrors.amount_ngn}
            errorId="income-error-amount"
            htmlFor="income-amount"
            label="Amount in whole Naira (₦) *"
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7A685D]">
                ₦
              </span>
              <FormattedAmountInput
                aria-describedby={
                  fieldErrors.amount_ngn ? "income-error-amount" : undefined
                }
                aria-invalid={fieldErrors.amount_ngn ? "true" : undefined}
                className={`${CONTROL} pl-8 ${
                  fieldErrors.amount_ngn
                    ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]"
                    : ""
                }`}
                id="income-amount"
                name="amount_ngn"
                onChange={() => clearFieldError("amount_ngn")}
                placeholder="e.g. 50,000"
              />
            </div>
          </CfFieldLayout>
        </div>

        <div>
          <CfTextField
            defaultValue={today}
            id="income-date"
            label="Transaction Date *"
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
          <CfSelect
            id="income-payment-method"
            label="Payment Method *"
            name="payment_method"
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value as "bank_transfer" | "cash");
              clearFieldError("receipt_file");
            }}
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
          </CfSelect>
        </div>

        {paymentMethod === "bank_transfer" ? (
          <div>
            <CfTextField
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
              error={fieldErrors.receipt_file}
              hint="PDF, JPG, or PNG up to 4 MiB"
              id="income-receipt-file"
              label="Payment Receipt / Voucher *"
              name="receipt_file"
              onChange={() => clearFieldError("receipt_file")}
              type="file"
            />
          </div>
        ) : (
          <div className="flex items-center text-xs text-[#7A685D] pt-6">
            <span>No receipt attachment required for cash transaction.</span>
          </div>
        )}
      </div>

      <div>
        <CfTextField
          autoComplete="off"
          error={fieldErrors.source_note}
          id="income-source-note"
          label="Source Note / Income Description *"
          maxLength={500}
          name="source_note"
          onChange={() => clearFieldError("source_note")}
          placeholder="e.g. Corporate donation for community outreach project"
        />
      </div>

      <div>
        <CfTextField
          autoComplete="off"
          id="income-payer"
          label="Payer / Donor Entity (Optional)"
          maxLength={160}
          name="payer_payee"
          placeholder="e.g. Chief O. Emeka Foundation"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton loadingText="Recording...">
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (fieldName: string) => {
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const formData = new FormData(form);
    const errors: Record<string, string> = {};

    const rawAmount = String(formData.get("amount_ngn") || "").replace(
      /\D/g,
      "",
    );
    if (!rawAmount || Number(rawAmount) <= 0) {
      errors.amount_ngn = "Please enter amount.";
    }

    const categoryId = String(formData.get("category_id") || "").trim();
    if (!categoryId) {
      errors.category_id = "Please select an expense category.";
    }

    const payee = String(formData.get("payer_payee") || "").trim();
    if (!payee) {
      errors.payer_payee = "Please enter payee name.";
    }

    const description = String(formData.get("description") || "").trim();
    if (!description) {
      errors.description = "Please enter expense description.";
    }

    if (paymentMethod === "bank_transfer") {
      const file = formData.get("receipt_file") as File | null;
      if (!file || file.size === 0) {
        errors.receipt_file = "Please attach payment receipt.";
      }
    }

    if (Object.keys(errors).length > 0) {
      e.preventDefault();
      setFieldErrors(errors);
    }
  };

  return (
    <form
      action={recordClubFinanceAction}
      className="space-y-4 text-xs text-[#3D291F]"
      encType="multipart/form-data"
      noValidate
      onSubmit={handleSubmit}
    >
      <input name="kind" type="hidden" value="expense" />
      <input name="idempotency_key" type="hidden" value={idempotencyKey} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <CfFieldLayout
            error={fieldErrors.amount_ngn}
            errorId="expense-error-amount"
            htmlFor="expense-amount"
            label="Disbursement Amount in whole Naira (₦) *"
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7A685D]">
                ₦
              </span>
              <FormattedAmountInput
                aria-describedby={
                  fieldErrors.amount_ngn ? "expense-error-amount" : undefined
                }
                aria-invalid={fieldErrors.amount_ngn ? "true" : undefined}
                className={`${CONTROL} pl-8 ${
                  fieldErrors.amount_ngn
                    ? "border-[#BA3C2A] ring-1 ring-[#BA3C2A]"
                    : ""
                }`}
                id="expense-amount"
                name="amount_ngn"
                onChange={() => clearFieldError("amount_ngn")}
                placeholder="e.g. 25,000"
              />
            </div>
          </CfFieldLayout>
        </div>

        <div>
          <CfTextField
            defaultValue={today}
            id="expense-date"
            label="Disbursement Date *"
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
          <CfSelect
            id="expense-payment-method"
            label="Payment Method *"
            name="payment_method"
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value as "bank_transfer" | "cash");
              clearFieldError("receipt_file");
            }}
          >
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cash">Cash</option>
          </CfSelect>
        </div>

        {paymentMethod === "bank_transfer" ? (
          <div>
            <CfTextField
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
              error={fieldErrors.receipt_file}
              hint="PDF, JPG, or PNG up to 4 MiB"
              id="expense-receipt-file"
              label="Payment Receipt / Voucher *"
              name="receipt_file"
              onChange={() => clearFieldError("receipt_file")}
              type="file"
            />
          </div>
        ) : (
          <div className="flex items-center text-xs text-[#7A685D] pt-6">
            <span>No receipt attachment required for cash transaction.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <CfSelect
            defaultValue=""
            error={fieldErrors.category_id}
            id="expense-category"
            label="Expense Category / Cost Center *"
            name="category_id"
            onChange={() => clearFieldError("category_id")}
          >
            <option value="">Choose an active category</option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </CfSelect>
        </div>

        <div>
          <CfTextField
            autoComplete="off"
            error={fieldErrors.payer_payee}
            id="expense-payee"
            label="Payee / Vendor Entity *"
            maxLength={160}
            name="payer_payee"
            onChange={() => clearFieldError("payer_payee")}
            placeholder="e.g. Asaba Electric Disco Co."
          />
        </div>
      </div>

      <div>
        <CfTextField
          autoComplete="off"
          error={fieldErrors.description}
          id="expense-description"
          label="Disbursement Description / Justification *"
          maxLength={500}
          name="description"
          onChange={() => clearFieldError("description")}
          placeholder="e.g. Secretariat generator fueling and maintenance"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton loadingText="Recording..." variant="danger">
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
  const [nameError, setNameError] = useState<string>("");

  const handleCreateSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      e.preventDefault();
      setNameError("Please enter category name.");
    }
  };

  return (
    <div className="space-y-6 text-xs text-[#3D291F]">
      {/* Create New Category Form */}
      <form
        action={createFinanceCategoryAction}
        className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3"
        noValidate
        onSubmit={handleCreateSubmit}
      >
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#174C37]" />
          <h4 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
            Register New Cost Center / Category
          </h4>
        </div>

        <input name="reason" type="hidden" value="Initial cost center entry" />

        <CfTextField
          autoComplete="off"
          error={nameError}
          id="cat-name"
          label="Category Name *"
          maxLength={80}
          name="name"
          onChange={() => setNameError("")}
          placeholder="e.g. Welfare & Benevolence"
        />

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
                  className="flex flex-wrap items-center gap-2"
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
                    className="min-w-0 flex-1 min-h-[44px] px-2.5 bg-white border border-[#E5DDD3] rounded-md text-base placeholder:text-sm text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-1 focus:ring-[#BA3C2A]"
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
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
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
          <CfFieldLayout
            htmlFor="correct-amount"
            label="Amount in whole Naira (₦) *"
          >
            <FormattedAmountInput
              className={CONTROL}
              defaultValue={transaction.amount_ngn}
              id="correct-amount"
              name="amount_ngn"
              required
            />
          </CfFieldLayout>
        </div>

        <div>
          <CfTextField
            defaultValue={transaction.transaction_date}
            id="correct-date"
            label="Transaction Date *"
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
            <CfTextField
              defaultValue={transaction.description ?? ""}
              id="correct-desc"
              label="Description *"
              maxLength={500}
              name="description"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <CfSelect
                defaultValue={transaction.category_id ?? ""}
                id="correct-cat"
                label="Category *"
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
              </CfSelect>
            </div>

            <div>
              <CfTextField
                defaultValue={transaction.payer_payee ?? ""}
                id="correct-payee"
                label="Payee *"
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
            <CfTextField
              defaultValue={transaction.source_note ?? ""}
              id="correct-source"
              label="Source Note *"
              maxLength={500}
              name="source_note"
              required
            />
          </div>

          <div>
            <CfTextField
              defaultValue={transaction.payer_payee ?? ""}
              id="correct-payer"
              label="Payer (Optional)"
              maxLength={160}
              name="payer_payee"
            />
          </div>
        </div>
      )}

      <div>
        <CfTextField
          autoComplete="off"
          id="correct-reason"
          label="Required Correction Reason (Audited) *"
          maxLength={500}
          name="reason"
          placeholder="e.g. Correcting typo in vendor invoice amount per receipt voucher"
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton loadingText="Saving...">
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
        <CfTextField
          autoComplete="off"
          id="void-reason"
          label="Required Void Reason (Audited) *"
          maxLength={500}
          name="reason"
          placeholder="e.g. Duplicated voucher entry created in error"
          required
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
        {onCancel && (
          <button
            className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <FormSubmitButton loadingText="Voiding..." variant="danger">
          Confirm Void
        </FormSubmitButton>
      </div>
    </form>
  );
}
