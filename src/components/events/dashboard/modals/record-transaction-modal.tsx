"use client";

import { Loader2, Plus, Ticket, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormAlertBanner } from "@/components/ui";
import { formatNaira, formatPercent } from "@/lib/format";
import {
  buildDisbursementFields,
  getActiveExpenseCategories,
  matchExpenseCategoryByName,
} from "@/lib/record-disbursement.mjs";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type {
  DashboardCostCenter,
  DashboardTicketTier,
  DashboardTransaction,
  EventFinanceCategoryItem,
  TransactionType,
} from "../dashboard-types";

type TransactionMode = "ticket" | "revenue" | "expense";

export type RecordedTransactionSubmission = Omit<
  DashboardTransaction,
  "id" | "status"
> & {
  tierId?: string;
  ticketQuantity?: number;
  budgetAllocationCategoryId?: string;
  receiptFile?: File | null;
  paymentStatus?: string;
};

interface RecordTransactionModalProps {
  isOpen: boolean;
  isPending?: boolean;
  onClose: () => void;
  onSave: (txn: RecordedTransactionSubmission) => void;
  userRole: string;
  initialType?: TransactionType;
  initialCategory?: string;
  ticketTiers: DashboardTicketTier[];
  categories?: EventFinanceCategoryItem[];
  costCenters?: DashboardCostCenter[];
  budgetCeiling?: number;
}

export function RecordTransactionModal({
  isOpen,
  isPending = false,
  onClose,
  onSave,
  userRole,
  initialType = "revenue",
  initialCategory,
  ticketTiers,
  categories = [],
  costCenters = [],
  budgetCeiling = 0,
}: RecordTransactionModalProps) {
  const determineInitialMode = (): TransactionMode => {
    if (initialCategory === "ticket_sales") return "ticket";
    if (initialType === "expense") return "expense";
    return "revenue";
  };

  const revenueCategories = categories
    .filter((c) => c.category_type === "revenue" && !c.retired_at)
    .map((c) => ({ id: c.id, label: c.name }));

  const expenseCategoryOptions = getActiveExpenseCategories(categories).map(
    (c) => ({ id: c.id, name: c.name }),
  );

  const allocationOptions = costCenters
    .filter((c) => !c.name.toLowerCase().includes("unallocated"))
    .map((c) => {
      const percent =
        c.percentage !== undefined
          ? c.percentage
          : budgetCeiling > 0
            ? (c.allocated / budgetCeiling) * 100
            : 0;
      return {
        id: c.categoryId || c.id,
        costCenterId: c.id,
        name: c.name,
        allocated: c.allocated,
        percentage: percent,
        label: `${c.name} — ${formatPercent(percent)} (${formatNaira(c.allocated)})`,
      };
    });

  const resolveCategoryForMode = (
    targetMode: "revenue" | "expense",
    preferred?: string,
  ): string => {
    if (targetMode === "revenue") {
      if (preferred) {
        const match = revenueCategories.find(
          (c) =>
            c.id === preferred ||
            c.label.toLowerCase() === preferred.toLowerCase(),
        );
        if (match) return match.id;
      }
      return revenueCategories[0]?.id || "";
    }
    if (preferred) {
      const match = allocationOptions.find(
        (c) =>
          c.id === preferred ||
          c.costCenterId === preferred ||
          c.name.toLowerCase() === preferred.toLowerCase() ||
          c.label.toLowerCase().includes(preferred.toLowerCase()),
      );
      if (match) return match.id;
    }
    return allocationOptions[0]?.id || "";
  };

  const resolveExpenseCategory = (allocationId: string): string => {
    const allocation = allocationOptions.find((c) => c.id === allocationId);
    return matchExpenseCategoryByName(allocation?.name, categories)?.id || "";
  };

  const [mode, setMode] = useState<TransactionMode>(determineInitialMode());
  const [selectedTierId, setSelectedTierId] = useState<string>(
    ticketTiers[1]?.id || ticketTiers[0]?.id || "regular",
  );
  const [ticketQuantity, setTicketQuantity] = useState<number>(1);
  const [attendeePhone, setAttendeePhone] = useState<string>("");

  const [category, setCategory] = useState<string>(() =>
    initialCategory
      ? resolveCategoryForMode(
          initialType === "expense" ? "expense" : "revenue",
          initialCategory,
        )
      : resolveCategoryForMode(
          initialType === "expense" ? "expense" : "revenue",
        ),
  );
  const [expenseCategory, setExpenseCategory] = useState<string>(() =>
    resolveExpenseCategory(resolveCategoryForMode("expense")),
  );
  const [description, setDescription] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [payerPayee, setPayerPayee] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash">(
    "bank_transfer",
  );
  const [paymentStatus, setPaymentStatus] = useState<
    "paid" | "pending" | "unpaid" | "deposit"
  >("paid");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");

  useModalHygiene({ isOpen, onClose });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset category and fields when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialCategory === "ticket_sales") {
        setMode("ticket");
        setPaymentMethod("bank_transfer");
      } else if (initialType === "expense") {
        setMode("expense");
        const allocationId = resolveCategoryForMode("expense", initialCategory);
        setCategory(allocationId);
        setExpenseCategory(resolveExpenseCategory(allocationId));
        setPaymentMethod("bank_transfer");
      } else {
        setMode("revenue");
        setCategory(resolveCategoryForMode("revenue", initialCategory));
        setPaymentMethod("bank_transfer");
      }
      setPaymentStatus("paid");
      setReceiptFile(null);
      setError("");
    } else {
      setDescription("");
      setAmount("");
      setPayerPayee("");
      setAttendeePhone("");
      setNotes("");
      setReceiptFile(null);
      setTicketQuantity(1);
      setError("");
    }
  }, [isOpen, initialCategory, initialType]);

  if (!isOpen) return null;

  const currentTier =
    ticketTiers.find((t) => t.id === selectedTierId) || ticketTiers[0];
  const calculatedTicketTotal = currentTier
    ? currentTier.price * ticketQuantity
    : 0;

  const authorizerName =
    userRole === "admin" || userRole === "backup_admin"
      ? "Club Admin"
      : "Event Officer";
  const authorizerRole =
    userRole === "admin" || userRole === "backup_admin" ? "Admin" : "Executive";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setError("");

    const now = new Date();
    const watTime = `${now.toISOString().slice(0, 10)} ${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    if (mode === "ticket") {
      if (!currentTier) {
        setError("Please select a valid ticket tier.");
        return;
      }
      if (ticketQuantity <= 0) {
        setError("Please specify at least 1 ticket to issue.");
        return;
      }
      if (currentTier.sold + ticketQuantity > currentTier.capacity) {
        setError(
          `Capacity exceeded! Only ${currentTier.capacity - currentTier.sold} tickets remaining for ${currentTier.name}.`,
        );
        return;
      }
      if (!payerPayee.trim()) {
        setError("Attendee / Purchaser name is required.");
        return;
      }

      if (paymentMethod === "bank_transfer" && !receiptFile) {
        setError(
          "Payment receipt file is required for bank transfer ticket sales.",
        );
        return;
      }

      onSave({
        date: watTime,
        type: "revenue",
        category: "ticket_sales",
        categoryLabel: "Ticket Sales",
        description: `Box Office Sale — ${ticketQuantity}x ${currentTier.name} (Direct Issue)`,
        amount: calculatedTicketTotal,
        payerPayee: attendeePhone.trim()
          ? `${payerPayee.trim()} (${attendeePhone.trim()})`
          : payerPayee.trim(),
        paymentMethod,
        authorizedBy: authorizerName,
        authorizerRole,
        notes:
          notes.trim() ||
          `Direct box office issuance for ${ticketQuantity} admission pass(es).`,
        tierId: currentTier.id,
        ticketQuantity,
        receiptFile,
      });

      return;
    }

    const rawDigits = amount.replace(/\D/g, "");
    const numAmount = Number(rawDigits);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid numeric amount greater than zero.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!payerPayee.trim()) {
      setError("Payer or Payee name is required.");
      return;
    }
    if (
      paymentStatus === "paid" &&
      paymentMethod === "bank_transfer" &&
      !receiptFile
    ) {
      setError(
        "Payment receipt voucher file is required for settled bank transfer transactions.",
      );
      return;
    }
    if (mode === "revenue" && !category) {
      setError(
        "Please select an active revenue category (or create one in Categories).",
      );
      return;
    }
    if (mode === "expense" && !category) {
      setError(
        "Please configure budget allocations for this event before recording disbursements.",
      );
      return;
    }
    if (mode === "expense" && expenseCategoryOptions.length === 0) {
      setError(
        "No active expense categories are configured. Ask an Admin to add one before recording disbursements.",
      );
      return;
    }
    if (mode === "expense" && !expenseCategory) {
      setError(
        "Please select an active expense category for this disbursement.",
      );
      return;
    }

    let submissionCategory = category;
    let submissionCategoryLabel =
      mode === "revenue"
        ? revenueCategories.find((c) => c.id === category)?.label || "Revenue"
        : "";
    let budgetAllocationCategoryId: string | undefined;

    if (mode === "expense") {
      const fields = buildDisbursementFields(
        allocationOptions.find((c) => c.id === category),
        expenseCategoryOptions.find((c) => c.id === expenseCategory),
      );
      if (!fields) {
        setError(
          "Please select both a budget allocation and an expense category.",
        );
        return;
      }
      submissionCategory = fields.category;
      submissionCategoryLabel = fields.categoryLabel;
      budgetAllocationCategoryId = fields.budgetAllocationCategoryId;
    }

    onSave({
      date: watTime,
      type: mode === "revenue" ? "revenue" : "expense",
      category: submissionCategory,
      categoryLabel: submissionCategoryLabel,
      budgetAllocationCategoryId,
      description: description.trim(),
      amount: numAmount,
      payerPayee: payerPayee.trim(),
      paymentMethod,
      paymentStatus,
      receiptFile,
      authorizedBy: authorizerName,
      authorizerRole,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div
      aria-labelledby="record-modal-title"
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
      <div className="relative z-10 bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center">
              <Plus className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="record-modal-title"
              >
                Record Event Transaction
              </h3>
              <p className="text-xs text-[#7A685D]">
                Club Governance & Audit Mandate
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="p-2 text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="p-3 bg-[#FAF6F0] border-b border-[#E5DDD3] flex items-center gap-1.5">
          <button
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 min-h-[38px] ${
              mode === "ticket"
                ? "bg-[#174C37] text-white shadow-xs"
                : "text-[#5C4638] hover:text-[#174C37] bg-white border border-[#E5DDD3]"
            }`}
            onClick={() => {
              setMode("ticket");
              setError("");
            }}
            type="button"
          >
            <Ticket className="w-4 h-4 text-[#D6A23A]" />
            <span>Ticket Sale</span>
          </button>

          <button
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 min-h-[38px] ${
              mode === "revenue"
                ? "bg-[#174C37] text-white shadow-xs"
                : "text-[#5C4638] hover:text-[#174C37] bg-white border border-[#E5DDD3]"
            }`}
            id="btn-mode-revenue"
            onClick={() => {
              setMode("revenue");
              setCategory(resolveCategoryForMode("revenue"));
              setError("");
            }}
            type="button"
          >
            <span>Other Revenue</span>
          </button>

          <button
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 min-h-[38px] ${
              mode === "expense"
                ? "bg-[#BA3C2A] text-white shadow-xs"
                : "text-[#5C4638] hover:text-[#BA3C2A] bg-white border border-[#E5DDD3]"
            }`}
            id="btn-mode-disbursement"
            onClick={() => {
              setMode("expense");
              const allocationId = resolveCategoryForMode("expense");
              setCategory(allocationId);
              setExpenseCategory(resolveExpenseCategory(allocationId));
              setError("");
            }}
            type="button"
          >
            <span>Disbursement</span>
          </button>
        </div>

        {/* Modal Form Body */}
        <form
          className="p-6 overflow-y-auto space-y-4 text-xs"
          onSubmit={handleSubmit}
        >
          {error ? (
            <FormAlertBanner
              message={error}
              onDismiss={() => setError("")}
              title="Transaction Error"
              variant="error"
            />
          ) : null}

          {/* MODE 1: TICKET SALE */}
          {mode === "ticket" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="ticket-tier-select"
                >
                  Select Admission Tier
                </label>
                <select
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="ticket-tier-select"
                  onChange={(e) => setSelectedTierId(e.target.value)}
                  value={selectedTierId}
                >
                  {ticketTiers.map((tier) => (
                    <option
                      disabled={tier.sold >= tier.capacity}
                      key={tier.id}
                      value={tier.id}
                    >
                      {tier.name} — {formatNaira(tier.price)} (
                      {tier.capacity - tier.sold} remaining)
                      {tier.sold >= tier.capacity ? " [SOLD OUT]" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="ticket-quantity-input"
                  >
                    Quantity Passes
                  </label>
                  <input
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="ticket-quantity-input"
                    max={
                      currentTier ? currentTier.capacity - currentTier.sold : 10
                    }
                    min={1}
                    onChange={(e) =>
                      setTicketQuantity(
                        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
                      )
                    }
                    type="number"
                    value={ticketQuantity}
                  />
                </div>

                <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] flex flex-col justify-center">
                  <span className="text-[10px] text-[#7A685D] uppercase font-bold">
                    Total Amount Due
                  </span>
                  <span className="text-base font-bold text-[#174C37] font-mono tabular-nums">
                    {formatNaira(calculatedTicketTotal)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="ticket-attendee-name"
                >
                  Attendee / Purchaser Name
                </label>
                <input
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="ticket-attendee-name"
                  onChange={(e) => setPayerPayee(e.target.value)}
                  placeholder="e.g. Chief Emeka Nwosu"
                  required
                  type="text"
                  value={payerPayee}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="ticket-attendee-phone"
                >
                  Phone Number (Optional for SMS pass)
                </label>
                <input
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="ticket-attendee-phone"
                  onChange={(e) => setAttendeePhone(e.target.value)}
                  placeholder="e.g. 0800 000 0000"
                  type="tel"
                  value={attendeePhone}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="ticket-payment-method"
                >
                  Payment Method
                </label>
                <select
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="ticket-payment-method"
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as "bank_transfer" | "cash")
                  }
                  value={paymentMethod}
                >
                  <option value="bank_transfer">Direct Bank Transfer</option>
                  <option value="cash">Cash at Box Office</option>
                </select>
              </div>

              {paymentMethod === "bank_transfer" && (
                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="ticket-receipt-file"
                  >
                    Transfer Receipt / Screenshot{" "}
                    <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    id="ticket-receipt-file"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    required
                    onChange={(e) =>
                      setReceiptFile(e.target.files?.[0] || null)
                    }
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
                  />
                  <p className="text-[11px] text-[#7A685D]">
                    PDF, JPG, or PNG up to 4 MiB
                  </p>
                </div>
              )}
            </div>
          )}

          {/* MODE 2 & 3: OTHER REVENUE OR EXPENSE */}
          {(mode === "revenue" || mode === "expense") && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="category-select"
                >
                  {mode === "revenue"
                    ? "Revenue Stream Category"
                    : "Budget Allocation (Cost Center)"}
                </label>
                <select
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  disabled={
                    (mode === "revenue" ? revenueCategories : allocationOptions)
                      .length === 0
                  }
                  id="category-select"
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (mode === "expense") {
                      setExpenseCategory(
                        resolveExpenseCategory(e.target.value),
                      );
                    }
                  }}
                  value={category}
                >
                  {(mode === "revenue" ? revenueCategories : allocationOptions)
                    .length === 0 ? (
                    <option disabled value="">
                      {mode === "revenue"
                        ? "No active revenue categories configured"
                        : "No budget allocations configured for this event"}
                    </option>
                  ) : mode === "revenue" ? (
                    revenueCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  ) : (
                    allocationOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {mode === "expense" && (
                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="expense-category-select"
                  >
                    Expense Category
                  </label>
                  <select
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    disabled={expenseCategoryOptions.length === 0}
                    id="expense-category-select"
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    value={expenseCategory}
                  >
                    {expenseCategoryOptions.length === 0 ? (
                      <option disabled value="">
                        No active expense categories configured
                      </option>
                    ) : (
                      <>
                        <option disabled value="">
                          Select an expense category
                        </option>
                        {expenseCategoryOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <p className="text-[11px] text-[#7A685D] mt-1">
                    Every disbursement posts against an Admin-managed expense
                    category and an approved budget allocation.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  className="font-bold text-[#3D291F] block"
                  htmlFor="txn-description"
                >
                  Transaction Description
                </label>
                <input
                  className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="txn-description"
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    mode === "revenue"
                      ? "e.g. Nigerian Breweries Stage Title Rights"
                      : "e.g. Lekki Meadow Grounds advance lease settlement"
                  }
                  required
                  type="text"
                  value={description}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="txn-amount"
                  >
                    Amount (₦ NGN)
                  </label>
                  <FormattedAmountInput
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="txn-amount"
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 500,000"
                    required
                    value={amount}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="txn-payment-method"
                  >
                    Payment Channel
                  </label>
                  <select
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="txn-payment-method"
                    onChange={(e) =>
                      setPaymentMethod(
                        e.target.value as "bank_transfer" | "cash",
                      )
                    }
                    value={paymentMethod}
                  >
                    <option value="bank_transfer">Direct Bank Transfer</option>
                    <option value="cash">Cash Voucher / Petty Cash</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="txn-party"
                  >
                    {mode === "revenue"
                      ? "Payer / Counterparty"
                      : "Payee / Vendor"}
                  </label>
                  <input
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="txn-party"
                    onChange={(e) => setPayerPayee(e.target.value)}
                    placeholder="e.g. Meadow Estates Ltd"
                    required
                    type="text"
                    value={payerPayee}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    className="font-bold text-[#3D291F] block"
                    htmlFor="txn-payment-status"
                  >
                    Payment Status
                  </label>
                  <select
                    className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="txn-payment-status"
                    onChange={(e) =>
                      setPaymentStatus(
                        e.target.value as
                          | "paid"
                          | "pending"
                          | "unpaid"
                          | "deposit",
                      )
                    }
                    value={paymentStatus}
                  >
                    <option value="paid">Settled / Paid</option>
                    <option value="pending">Pending Payment</option>
                    <option value="unpaid">Unpaid Commitment</option>
                    <option value="deposit">Deposit Paid</option>
                  </select>
                </div>
              </div>

              {paymentMethod === "bank_transfer" &&
                paymentStatus === "paid" && (
                  <div className="space-y-1.5">
                    <label
                      className="font-bold text-[#3D291F] block"
                      htmlFor="txn-receipt-file"
                    >
                      Payment Receipt / Voucher{" "}
                      <span className="text-[#BA3C2A]">*</span>
                    </label>
                    <input
                      id="txn-receipt-file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      required
                      onChange={(e) =>
                        setReceiptFile(e.target.files?.[0] || null)
                      }
                      className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#174C37] file:text-white hover:file:bg-[#103D2B] cursor-pointer"
                    />
                    <p className="text-[11px] text-[#7A685D]">
                      PDF, JPG, or PNG up to 4 MiB (Required for settled bank
                      transfers)
                    </p>
                  </div>
                )}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              className="font-bold text-[#3D291F] block"
              htmlFor="txn-notes"
            >
              Auditor Notes (Optional)
            </label>
            <textarea
              className="w-full h-20 p-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] resize-none"
              id="txn-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide background context or compliance notes for the internal audit committee..."
              value={notes}
            />
          </div>

          <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] text-[11px] text-[#7A685D] flex items-center justify-between">
            <span>
              Authorized officer sign-off: <strong>{authorizerName}</strong> (
              {authorizerRole})
            </span>
            <span className="font-mono text-[#174C37]">Verified</span>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2.5 text-xs font-semibold text-[#5C4638] bg-[#FAF6F0] hover:bg-[#E5DDD3]/60 rounded-xl transition-colors min-h-[42px] disabled:opacity-50"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`px-5 py-2.5 text-xs font-semibold text-white rounded-xl transition-colors min-h-[42px] flex items-center gap-1.5 shadow-xs disabled:opacity-75 ${
                mode === "expense"
                  ? "bg-[#BA3C2A] hover:bg-[#8E2A1C]"
                  : "bg-[#174C37] hover:bg-[#103D2B]"
              }`}
              disabled={isPending}
              id="btn-submit-record-transaction"
              type="submit"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#D6A23A]" />
              ) : (
                <Plus className="w-4 h-4 text-[#D6A23A]" />
              )}
              <span>
                {isPending
                  ? mode === "ticket"
                    ? "Posting Ticket Sale…"
                    : mode === "expense"
                      ? "Posting Disbursement…"
                      : "Posting Revenue…"
                  : mode === "ticket"
                    ? "Issue & Post Ticket Sale"
                    : mode === "expense"
                      ? "Post Disbursement"
                      : "Post Revenue Receipt"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
