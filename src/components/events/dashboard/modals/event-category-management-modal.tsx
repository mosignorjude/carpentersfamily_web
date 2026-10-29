"use client";

import {
  AlertCircle,
  Archive,
  Edit2,
  FolderPlus,
  Info,
  PlusCircle,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createEventFinanceCategoryAction,
  renameEventFinanceCategoryAction,
  retireEventFinanceCategoryAction,
  saveEventBudgetAllocationCategoryAction,
} from "@/app/(member)/events/category-actions";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import {
  FormAlertBanner,
  FormFieldHint,
  FormSubmitButton,
} from "@/components/ui";
import { formatNaira, formatPercent } from "@/lib/format";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type {
  DashboardCostCenter,
  EventFinanceCategoryItem,
} from "../dashboard-types";

interface EventCategoryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryType: "expense" | "budget_allocation" | "revenue";
  eventId: string;
  categories: EventFinanceCategoryItem[];
  canManage: boolean;
  canDelete: boolean;
  budgetCeiling?: number;
  costCenters?: DashboardCostCenter[];
}

const typeLabels: Record<
  "expense" | "budget_allocation" | "revenue",
  { title: string; tab: string; singular: string }
> = {
  expense: {
    title: "Expense Categories",
    tab: "expenses",
    singular: "Expense Category",
  },
  budget_allocation: {
    title: "Budget Allocation Categories",
    tab: "budget",
    singular: "Budget Allocation Category",
  },
  revenue: {
    title: "Revenue Categories",
    tab: "revenue",
    singular: "Revenue Category",
  },
};

export function EventCategoryManagementModal({
  isOpen,
  onClose,
  categoryType,
  eventId,
  categories,
  canManage,
  canDelete,
  budgetCeiling = 0,
  costCenters = [],
}: EventCategoryManagementModalProps) {
  // Editing state for standard categories
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(
    null,
  );
  const [showRetired, setShowRetired] = useState(false);

  // Budget Allocation Form States (Create)
  const [allocName, setAllocName] = useState("");
  const [allocPercent, setAllocPercent] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [allocReason, setAllocReason] = useState("");

  // Budget Allocation Editing State
  const [editingAllocKey, setEditingAllocKey] = useState<string | null>(null);
  const [editAllocName, setEditAllocName] = useState("");
  const [editAllocPercent, setEditAllocPercent] = useState("");
  const [editAllocAmount, setEditAllocAmount] = useState("");
  const [editAllocReason, setEditAllocReason] = useState("");
  const [deletingAllocKey, setDeletingAllocKey] = useState<string | null>(null);

  // Modal hygiene: locks scroll and dismisses on Escape
  useModalHygiene({ isOpen, onClose });

  // Reset state when closing/opening
  useEffect(() => {
    if (!isOpen) {
      setEditingCategoryId(null);
      setDeletingCategoryId(null);
      setAllocName("");
      setAllocPercent("");
      setAllocAmount("");
      setAllocReason("");
      setEditingAllocKey(null);
      setDeletingAllocKey(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentMeta = typeLabels[categoryType];
  const isBudgetAllocationMode = categoryType === "budget_allocation";

  // Filter out internal unallocated buffer from real cost center allocations
  const activeAllocations = costCenters.filter(
    (c) => !c.name.toLowerCase().includes("unallocated"),
  );

  // Catalog categories for budget_allocation
  const matchingCatalogCategories = categories.filter(
    (c) => c.category_type === "budget_allocation",
  );
  const activeCatalogCategories = matchingCatalogCategories.filter(
    (c) => !c.retired_at,
  );

  // Unallocated categories from the catalog (not currently assigned in this event's budget)
  const unallocatedCatalogCategories = activeCatalogCategories.filter((cat) => {
    return !activeAllocations.some(
      (alloc) =>
        alloc.name.toLowerCase() === cat.name.toLowerCase() ||
        (alloc.categoryId && alloc.categoryId === cat.id),
    );
  });

  // Budget totals & remaining headroom
  const currentTotalAllocated = activeAllocations.reduce(
    (sum, c) => sum + c.allocated,
    0,
  );
  const remainingHeadroom = Math.max(0, budgetCeiling - currentTotalAllocated);
  const remainingPercent =
    budgetCeiling > 0 ? (remainingHeadroom / budgetCeiling) * 100 : 0;
  const currentAllocAmountNum = Number(allocAmount.replace(/\D/g, "")) || 0;
  const isCreateOverHeadroom =
    remainingHeadroom <= 0 || currentAllocAmountNum > remainingHeadroom;

  // Dynamic Bidirectional Calculation for Create Form
  const handlePercentChange = (val: string) => {
    setAllocPercent(val);
    const num = parseFloat(val);
    if (!Number.isNaN(num) && budgetCeiling > 0) {
      const calculated = Math.round((budgetCeiling * num) / 100);
      setAllocAmount(calculated > 0 ? calculated.toLocaleString() : "");
    } else if (!val) {
      setAllocAmount("");
    }
  };

  const handleAmountChange = (val: string) => {
    setAllocAmount(val);
    const num = Number(val.replace(/\D/g, "")) || 0;
    if (num > 0 && budgetCeiling > 0) {
      const pct = (num / budgetCeiling) * 100;
      setAllocPercent(pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2));
    } else if (!num) {
      setAllocPercent("");
    }
  };

  // Dynamic Bidirectional Calculation for Edit Form
  const handleEditPercentChange = (val: string) => {
    setEditAllocPercent(val);
    const num = parseFloat(val);
    if (!Number.isNaN(num) && budgetCeiling > 0) {
      const calculated = Math.round((budgetCeiling * num) / 100);
      setEditAllocAmount(calculated > 0 ? calculated.toLocaleString() : "");
    } else if (!val) {
      setEditAllocAmount("");
    }
  };

  const handleEditAmountChange = (val: string) => {
    setEditAllocAmount(val);
    const num = Number(val.replace(/\D/g, "")) || 0;
    if (num > 0 && budgetCeiling > 0) {
      const pct = (num / budgetCeiling) * 100;
      setEditAllocPercent(pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2));
    } else if (!num) {
      setEditAllocPercent("");
    }
  };

  return (
    <div
      aria-labelledby="category-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center items-end justify-center p-0 sm:p-4 bg-[#3D291F]/40 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />

      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5DDD3] shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden z-10 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E5DDD3] bg-[#FAF6F0]">
          <div>
            <h2
              className="text-lg font-bold text-[#3D291F]"
              id="category-modal-title"
            >
              {currentMeta.title}
            </h2>
            <p className="text-xs text-[#7A685D] mt-0.5">
              {isBudgetAllocationMode
                ? `Total event budget ceiling: ${formatNaira(budgetCeiling)} • Allocated: ${formatNaira(currentTotalAllocated)} • Remaining buffer: ${formatNaira(remainingHeadroom)}`
                : "Admin, Backup Admin, and Event Leads can create and edit categories."}
            </p>
          </div>
          <button
            aria-label="Close dialog"
            className="p-2 text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] hover:bg-white rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            id="btn-close-category-modal"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* ========================================================= */}
          {/* BUDGET ALLOCATION MODE: Percentage & Amount Form          */}
          {/* ========================================================= */}
          {isBudgetAllocationMode ? (
            <div className="space-y-6">
              {/* Form to Add / Allocate Category */}
              {canManage ? (
                <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] p-4 space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold text-[#174C37]">
                    <div className="flex items-center gap-2">
                      <FolderPlus className="w-4 h-4 text-[#174C37]" />
                      <span>Add / Allocate Budget Category</span>
                    </div>
                    {remainingHeadroom > 0 ? (
                      <span className="text-[11px] text-[#174C37] font-semibold font-mono">
                        Available Headroom: {formatNaira(remainingHeadroom)} (
                        {remainingPercent.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#BA3C2A] font-semibold">
                        Budget fully allocated (0% headroom)
                      </span>
                    )}
                  </div>

                  {remainingHeadroom <= 0 && (
                    <FormAlertBanner
                      message="Budget is 100% allocated. To allocate a new category, first edit or reduce existing allocations below to free up available headroom."
                      title="Budget Fully Allocated"
                      variant="warning"
                    />
                  )}

                  {/* Quick Select from Unallocated Catalog Categories */}
                  {unallocatedCatalogCategories.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-[#E5DDD3]/60">
                      <label
                        htmlFor="quick-select-category"
                        className="text-[11px] font-semibold text-[#7A685D] block"
                      >
                        Choose from existing unallocated catalog categories:
                      </label>
                      <select
                        id="quick-select-category"
                        className="w-full h-9 px-3 text-xs bg-white border border-[#E5DDD3] rounded-lg text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                        onChange={(e) => {
                          if (e.target.value) {
                            setAllocName(e.target.value);
                          }
                        }}
                        value={
                          unallocatedCatalogCategories.some(
                            (c) =>
                              c.name.toLowerCase() === allocName.toLowerCase(),
                          )
                            ? allocName
                            : ""
                        }
                      >
                        <option value="">
                          -- Or type a new category name below --
                        </option>
                        {unallocatedCatalogCategories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name} (Unallocated • 0% / ₦0)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <form
                    action={saveEventBudgetAllocationCategoryAction}
                    className="space-y-3"
                  >
                    <input name="event_id" type="hidden" value={eventId} />
                    <input name="action_type" type="hidden" value="create" />
                    <input
                      name="total_ngn"
                      type="hidden"
                      value={budgetCeiling}
                    />
                    <input name="tab" type="hidden" value="budget" />

                    {/* Category Name */}
                    <div>
                      <label
                        className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                        htmlFor="alloc-category-name"
                      >
                        Category Name <span className="text-[#BA3C2A]">*</span>
                      </label>
                      <input
                        className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                        id="alloc-category-name"
                        maxLength={80}
                        minLength={2}
                        name="name"
                        onChange={(e) => setAllocName(e.target.value)}
                        placeholder="e.g. Logistics & Transport"
                        required
                        type="text"
                        value={allocName}
                      />
                    </div>

                    {/* Percentage (%) and Amount (₦) with Bidirectional calculation */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                          htmlFor="alloc-percent"
                        >
                          Allocation (%){" "}
                          <span className="text-[#BA3C2A]">*</span>
                        </label>
                        <div className="relative">
                          <input
                            className="w-full h-10 px-3 pr-8 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                            id="alloc-percent"
                            max={Math.max(
                              0.01,
                              Number(remainingPercent.toFixed(2)),
                            )}
                            min={0.01}
                            name="allocation_percent"
                            onChange={(e) =>
                              handlePercentChange(e.target.value)
                            }
                            placeholder="e.g. 10"
                            required
                            step="0.01"
                            type="number"
                            value={allocPercent}
                          />
                          <span className="absolute right-3 top-2.5 text-xs text-[#7A685D] font-bold pointer-events-none">
                            %
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                          htmlFor="alloc-amount"
                        >
                          Amount (₦) <span className="text-[#BA3C2A]">*</span>
                        </label>
                        <FormattedAmountInput
                          className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] font-mono"
                          id="alloc-amount"
                          name="allocation_amount_ngn"
                          onChange={(e) => handleAmountChange(e.target.value)}
                          placeholder="e.g. 100,000"
                          required
                          value={allocAmount}
                        />
                      </div>
                    </div>

                    {currentAllocAmountNum > remainingHeadroom &&
                      remainingHeadroom > 0 && (
                        <FormAlertBanner
                          message={`Amount exceeds available headroom of ${formatNaira(remainingHeadroom)} (${remainingPercent.toFixed(1)}%). Reduce percentage or amount.`}
                          title="Headroom Exceeded"
                          variant="error"
                        />
                      )}

                    {/* Audit Reason */}
                    <div>
                      <label
                        className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                        htmlFor="alloc-reason"
                      >
                        Audit Reason <span className="text-[#BA3C2A]">*</span>
                      </label>
                      <input
                        className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                        id="alloc-reason"
                        maxLength={500}
                        minLength={1}
                        name="reason"
                        onChange={(e) => setAllocReason(e.target.value)}
                        placeholder="Operational justification for this budget allocation..."
                        required
                        type="text"
                        value={allocReason}
                      />
                      <FormFieldHint message="Required by Club Governance for all budget modifications." />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-[#7A685D]">
                        {allocPercent && allocAmount && budgetCeiling > 0 ? (
                          <>
                            Allocating <strong>{allocPercent}%</strong> of{" "}
                            {formatNaira(budgetCeiling)} ={" "}
                            <strong className="text-[#174C37]">
                              ₦{allocAmount}
                            </strong>
                          </>
                        ) : (
                          "Enter percentage or amount to calculate the other."
                        )}
                      </span>
                      <FormSubmitButton
                        disabled={isCreateOverHeadroom}
                        id="btn-submit-budget-allocation"
                        leftIcon={FolderPlus}
                        loadingText="Allocating..."
                        title={
                          remainingHeadroom <= 0
                            ? "Budget is 100% allocated. Reduce an existing category first."
                            : isCreateOverHeadroom
                              ? "Entered amount exceeds available headroom."
                              : "Allocate Category"
                        }
                      >
                        Allocate Category
                      </FormSubmitButton>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D] flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#7A685D] shrink-0" />
                  <span>
                    You have view-only access. Allocating or modifying budget
                    categories requires Admin, Backup Admin, or Event Lead
                    roles.
                  </span>
                </div>
              )}

              {/* Active Allocated Categories List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#3D291F] uppercase tracking-wide">
                    Allocated Event Categories ({activeAllocations.length})
                  </h3>
                  <span className="text-[11px] text-[#7A685D] font-mono">
                    Total: {formatNaira(currentTotalAllocated)} /{" "}
                    {formatNaira(budgetCeiling)}
                  </span>
                </div>

                {activeAllocations.length === 0 ? (
                  <div className="text-center py-6 px-4 border border-dashed border-[#E5DDD3] rounded-xl text-xs text-[#7A685D]">
                    No budget categories allocated for this event yet.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5DDD3] border border-[#E5DDD3] rounded-xl overflow-hidden">
                    {activeAllocations.map((alloc) => {
                      const isEditing = editingAllocKey === alloc.name;
                      const isDeleting = deletingAllocKey === alloc.name;
                      const pct =
                        alloc.percentage !== undefined
                          ? alloc.percentage
                          : budgetCeiling > 0
                            ? (alloc.allocated / budgetCeiling) * 100
                            : 0;
                      const maxAvailableForThisCategory =
                        alloc.allocated + remainingHeadroom;
                      const maxPercentForThisCategory =
                        budgetCeiling > 0
                          ? (maxAvailableForThisCategory / budgetCeiling) * 100
                          : 100;
                      const editAmountNum =
                        Number(editAllocAmount.replace(/\D/g, "")) || 0;
                      const isEditOverLimit =
                        editAmountNum > maxAvailableForThisCategory;

                      return (
                        <div
                          className="p-3.5 bg-white transition-colors"
                          key={alloc.id || alloc.name}
                        >
                          {/* Standard View */}
                          {!isEditing && !isDeleting && (
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#3D291F] block">
                                    {alloc.name}
                                  </span>
                                  <span className="text-[10px] font-semibold bg-[#FAF6F0] text-[#174C37] px-2 py-0.5 rounded-md border border-[#E5DDD3] font-mono">
                                    {formatPercent(pct)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-[#7A685D] font-mono mt-0.5 block">
                                  Budget:{" "}
                                  <strong>
                                    {formatNaira(alloc.allocated)}
                                  </strong>{" "}
                                  • Spent: {formatNaira(alloc.spent)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {canManage && (
                                  <button
                                    aria-label={`Edit ${alloc.name}`}
                                    className="px-2.5 py-1.5 text-xs font-medium text-[#5C4638] hover:text-[#174C37] bg-[#FAF6F0] hover:bg-[#FAF6F0]/80 border border-[#E5DDD3] rounded-lg transition-colors flex items-center gap-1 min-h-[32px] cursor-pointer"
                                    id={`btn-edit-allocation-${alloc.name.toLowerCase().replace(/\s+/g, "-")}`}
                                    onClick={() => {
                                      setEditingAllocKey(alloc.name);
                                      setEditAllocName(alloc.name);
                                      setEditAllocPercent(
                                        pct % 1 === 0
                                          ? pct.toFixed(0)
                                          : pct.toFixed(2),
                                      );
                                      setEditAllocAmount(
                                        alloc.allocated.toLocaleString(),
                                      );
                                      setEditAllocReason("");
                                      setDeletingAllocKey(null);
                                    }}
                                    type="button"
                                  >
                                    <Edit2 className="w-3 h-3 text-[#174C37]" />
                                    <span>Edit</span>
                                  </button>
                                )}

                                {canDelete && (
                                  <button
                                    aria-label={`Remove ${alloc.name}`}
                                    className="px-2.5 py-1.5 text-xs font-medium text-[#BA3C2A] bg-white hover:bg-[#BA3C2A]/10 border border-[#BA3C2A]/30 rounded-lg transition-colors flex items-center gap-1 min-h-[32px] cursor-pointer"
                                    id={`btn-remove-allocation-${alloc.name.toLowerCase().replace(/\s+/g, "-")}`}
                                    onClick={() => {
                                      setDeletingAllocKey(alloc.name);
                                      setEditingAllocKey(null);
                                    }}
                                    type="button"
                                  >
                                    <Trash2 className="w-3 h-3 text-[#BA3C2A]" />
                                    <span>Remove</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Inline Edit Form (Rename, % or Amount) */}
                          {isEditing && (
                            <form
                              action={saveEventBudgetAllocationCategoryAction}
                              className="space-y-3 pt-1"
                            >
                              <input
                                name="event_id"
                                type="hidden"
                                value={eventId}
                              />
                              <input
                                name="action_type"
                                type="hidden"
                                value="edit"
                              />
                              <input
                                name="old_name"
                                type="hidden"
                                value={alloc.name}
                              />
                              <input
                                name="category_id"
                                type="hidden"
                                value={alloc.categoryId ?? ""}
                              />
                              <input
                                name="total_ngn"
                                type="hidden"
                                value={budgetCeiling}
                              />
                              <input name="tab" type="hidden" value="budget" />

                              <div className="flex items-center justify-between text-xs font-semibold text-[#174C37]">
                                <span>Edit &quot;{alloc.name}&quot;</span>
                                <button
                                  className="text-xs text-[#7A685D] bg-transparent border-0 hover:underline cursor-pointer"
                                  onClick={() => setEditingAllocKey(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-[#7A685D] bg-[#FAF6F0] p-2 rounded-lg border border-[#E5DDD3]">
                                <span>
                                  Adjustment Ceiling for this Category:
                                </span>
                                <span className="font-mono font-semibold text-[#174C37]">
                                  Up to{" "}
                                  {formatNaira(maxAvailableForThisCategory)} (
                                  {maxPercentForThisCategory.toFixed(1)}%)
                                </span>
                              </div>

                              <div>
                                <label
                                  className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                  htmlFor={`edit-name-${alloc.name}`}
                                >
                                  Category Name (Rename)
                                </label>
                                <input
                                  className="w-full h-9 px-3 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                  id={`edit-name-${alloc.name}`}
                                  maxLength={80}
                                  minLength={2}
                                  name="name"
                                  onChange={(e) =>
                                    setEditAllocName(e.target.value)
                                  }
                                  required
                                  type="text"
                                  value={editAllocName}
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label
                                    className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                    htmlFor={`edit-percent-${alloc.name}`}
                                  >
                                    Allocation (%)
                                  </label>
                                  <div className="relative">
                                    <input
                                      className="w-full h-9 px-3 pr-8 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                      id={`edit-percent-${alloc.name}`}
                                      max={Math.min(
                                        100,
                                        Number(
                                          maxPercentForThisCategory.toFixed(2),
                                        ),
                                      )}
                                      min={0.01}
                                      name="allocation_percent"
                                      onChange={(e) =>
                                        handleEditPercentChange(e.target.value)
                                      }
                                      required
                                      step="0.01"
                                      type="number"
                                      value={editAllocPercent}
                                    />
                                    <span className="absolute right-3 top-2 text-xs text-[#7A685D] font-bold pointer-events-none">
                                      %
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  <label
                                    className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                    htmlFor={`edit-amount-${alloc.name}`}
                                  >
                                    Amount (₦)
                                  </label>
                                  <FormattedAmountInput
                                    className="w-full h-9 px-3 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] font-mono focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                    id={`edit-amount-${alloc.name}`}
                                    name="allocation_amount_ngn"
                                    onChange={(e) =>
                                      handleEditAmountChange(e.target.value)
                                    }
                                    required
                                    value={editAllocAmount}
                                  />
                                </div>
                              </div>

                              {isEditOverLimit && (
                                <FormAlertBanner
                                  message={`Amount exceeds maximum available budget of ${formatNaira(maxAvailableForThisCategory)} (${maxPercentForThisCategory.toFixed(1)}%). Reduce percentage or amount.`}
                                  title="Budget Limit Exceeded"
                                  variant="error"
                                />
                              )}

                              <div>
                                <label
                                  className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                  htmlFor={`edit-reason-${alloc.name}`}
                                >
                                  Audit Reason{" "}
                                  <span className="text-[#BA3C2A]">*</span>
                                </label>
                                <input
                                  className="w-full h-9 px-3 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                  id={`edit-reason-${alloc.name}`}
                                  maxLength={500}
                                  minLength={1}
                                  name="reason"
                                  onChange={(e) =>
                                    setEditAllocReason(e.target.value)
                                  }
                                  placeholder="Justification for adjusting this allocation..."
                                  required
                                  type="text"
                                  value={editAllocReason}
                                />
                                <FormFieldHint message="Required by Club Governance for all budget modifications." />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  className="px-3 py-1.5 text-xs font-medium text-[#5C4638] bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg hover:bg-white min-h-[32px] cursor-pointer"
                                  onClick={() => setEditingAllocKey(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                                <FormSubmitButton
                                  disabled={
                                    isEditOverLimit || editAmountNum <= 0
                                  }
                                  id={`btn-submit-edit-${alloc.name.toLowerCase().replace(/\s+/g, "-")}`}
                                  loadingText="Saving..."
                                  size="compact"
                                >
                                  Save Allocation
                                </FormSubmitButton>
                              </div>
                            </form>
                          )}

                          {/* Inline Remove Confirmation */}
                          {isDeleting && canDelete && (
                            <form
                              action={saveEventBudgetAllocationCategoryAction}
                              className="space-y-3 pt-1 bg-[#BA3C2A]/5 p-3 rounded-lg border border-[#BA3C2A]/20"
                            >
                              <input
                                name="event_id"
                                type="hidden"
                                value={eventId}
                              />
                              <input
                                name="action_type"
                                type="hidden"
                                value="remove"
                              />
                              <input
                                name="old_name"
                                type="hidden"
                                value={alloc.name}
                              />
                              <input
                                name="category_id"
                                type="hidden"
                                value={alloc.categoryId ?? ""}
                              />
                              <input
                                name="total_ngn"
                                type="hidden"
                                value={budgetCeiling}
                              />
                              <input name="tab" type="hidden" value="budget" />

                              <div className="flex items-center gap-1.5 text-xs font-bold text-[#BA3C2A]">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>
                                  Remove &quot;{alloc.name}&quot; from Event
                                  Budget?
                                </span>
                              </div>

                              <p className="text-[11px] text-[#7A685D]">
                                This will remove the allocation of{" "}
                                <strong>{formatNaira(alloc.allocated)}</strong>{" "}
                                ({formatPercent(pct)}) and return it to the
                                unallocated buffer.
                              </p>

                              <div>
                                <label
                                  className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                  htmlFor={`remove-reason-${alloc.name}`}
                                >
                                  Removal Reason{" "}
                                  <span className="text-[#BA3C2A]">*</span>
                                </label>
                                <input
                                  className="w-full h-9 px-3 text-xs bg-white border border-[#E5DDD3] rounded-lg text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
                                  id={`remove-reason-${alloc.name}`}
                                  maxLength={500}
                                  minLength={1}
                                  name="reason"
                                  placeholder="Governance justification for removing this allocation..."
                                  required
                                  type="text"
                                />
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  className="px-3 py-1.5 text-xs font-medium text-[#5C4638] bg-white border border-[#E5DDD3] rounded-lg hover:bg-[#FAF6F0] min-h-[32px] cursor-pointer"
                                  onClick={() => setDeletingAllocKey(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                                <FormSubmitButton
                                  id={`btn-confirm-remove-${alloc.name.toLowerCase().replace(/\s+/g, "-")}`}
                                  loadingText="Removing..."
                                  size="compact"
                                  variant="danger"
                                >
                                  Confirm Removal
                                </FormSubmitButton>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unallocated Catalog Categories Section */}
              {unallocatedCatalogCategories.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-[#E5DDD3]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-[#3D291F]">
                        Unallocated Catalog Categories (
                        {unallocatedCatalogCategories.length})
                      </h4>
                      <p className="text-[11px] text-[#7A685D]">
                        These categories exist in the club catalog but are not
                        allocated in this event.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {unallocatedCatalogCategories.map((c) => (
                      <div
                        className="p-3 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] flex items-center justify-between gap-2"
                        key={c.id}
                      >
                        <div>
                          <span className="text-xs font-semibold text-[#3D291F] block">
                            {c.name}
                          </span>
                          <span className="text-[10px] text-[#7A685D]">
                            0% • ₦0 allocated
                          </span>
                        </div>
                        {canManage && (
                          <button
                            className="px-2.5 py-1 text-xs font-semibold text-[#174C37] bg-white border border-[#174C37]/30 hover:bg-[#174C37] hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={remainingHeadroom <= 0}
                            onClick={() => {
                              setAllocName(c.name);
                              // focus percent input
                              document.getElementById("alloc-percent")?.focus();
                            }}
                            title={
                              remainingHeadroom <= 0
                                ? "Budget is 100% allocated. Reduce an existing allocation first."
                                : "Allocate Category"
                            }
                            type="button"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Allocate</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ========================================================= */
            /* STANDARD REVENUE / EXPENSE MODE                            */
            /* ========================================================= */
            <div className="space-y-6">
              {/* Standard Create Form */}
              {canManage ? (
                <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#174C37]">
                    <FolderPlus className="w-4 h-4 text-[#174C37]" />
                    <span>Add New {currentMeta.singular}</span>
                  </div>

                  <form
                    action={createEventFinanceCategoryAction}
                    className="space-y-3"
                  >
                    <input
                      name="category_type"
                      type="hidden"
                      value={categoryType}
                    />
                    <input name="event_id" type="hidden" value={eventId} />
                    <input name="tab" type="hidden" value={currentMeta.tab} />

                    <div>
                      <label
                        className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                        htmlFor="create-category-name"
                      >
                        Category Name <span className="text-[#BA3C2A]">*</span>
                      </label>
                      <input
                        className="w-full h-10 px-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                        id="create-category-name"
                        maxLength={80}
                        minLength={2}
                        name="name"
                        placeholder="e.g. VIP Table Reservations"
                        required
                        type="text"
                      />
                    </div>

                    <input
                      name="reason"
                      type="hidden"
                      value="Initial category entry"
                    />

                    <div className="flex justify-end pt-1">
                      <FormSubmitButton
                        id="btn-submit-create-category"
                        leftIcon={FolderPlus}
                        loadingText="Creating..."
                      >
                        Create Category
                      </FormSubmitButton>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D] flex items-center gap-2">
                  <Info className="w-4 h-4 text-[#7A685D] shrink-0" />
                  <span>
                    You have view-only access to categories. Creating or editing
                    requires Admin, Backup Admin, or Event Lead permissions.
                  </span>
                </div>
              )}

              {/* Active Catalog Categories List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#3D291F] uppercase tracking-wide">
                    Active Categories (
                    {
                      categories.filter(
                        (c) =>
                          c.category_type === categoryType && !c.retired_at,
                      ).length
                    }
                    )
                  </h3>
                  {!canDelete && canManage && (
                    <span className="text-[11px] text-[#7A685D] italic">
                      Deletion restricted to Admins
                    </span>
                  )}
                </div>

                {categories.filter(
                  (c) => c.category_type === categoryType && !c.retired_at,
                ).length === 0 ? (
                  <div className="text-center py-6 px-4 border border-dashed border-[#E5DDD3] rounded-xl text-xs text-[#7A685D]">
                    No active categories found for{" "}
                    {currentMeta.title.toLowerCase()}.
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5DDD3] border border-[#E5DDD3] rounded-xl overflow-hidden">
                    {categories
                      .filter(
                        (c) =>
                          c.category_type === categoryType && !c.retired_at,
                      )
                      .map((cat) => {
                        const isEditing = editingCategoryId === cat.id;
                        const isDeleting = deletingCategoryId === cat.id;

                        return (
                          <div
                            className="p-3.5 bg-white transition-colors"
                            key={cat.id}
                          >
                            {!isEditing && !isDeleting && (
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <span className="text-xs font-bold text-[#3D291F] block">
                                    {cat.name}
                                  </span>
                                  <span className="text-[10px] text-[#7A685D]">
                                    Created{" "}
                                    {new Date(
                                      cat.created_at,
                                    ).toLocaleDateString("en-GB", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {canManage && (
                                    <button
                                      aria-label={`Rename ${cat.name}`}
                                      className="px-2.5 py-1.5 text-xs font-medium text-[#5C4638] hover:text-[#174C37] bg-[#FAF6F0] hover:bg-[#FAF6F0]/80 border border-[#E5DDD3] rounded-lg transition-colors flex items-center gap-1 min-h-[32px] cursor-pointer"
                                      id={`btn-rename-${cat.id}`}
                                      onClick={() => {
                                        setEditingCategoryId(cat.id);
                                        setDeletingCategoryId(null);
                                      }}
                                      type="button"
                                    >
                                      <Edit2 className="w-3 h-3 text-[#174C37]" />
                                      <span>Rename</span>
                                    </button>
                                  )}

                                  {canDelete && (
                                    <button
                                      aria-label={`Delete ${cat.name}`}
                                      className="px-2.5 py-1.5 text-xs font-medium text-[#BA3C2A] bg-white hover:bg-[#BA3C2A]/10 border border-[#BA3C2A]/30 rounded-lg transition-colors flex items-center gap-1 min-h-[32px] cursor-pointer"
                                      id={`btn-delete-${cat.id}`}
                                      onClick={() => {
                                        setDeletingCategoryId(cat.id);
                                        setEditingCategoryId(null);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 className="w-3 h-3 text-[#BA3C2A]" />
                                      <span>Delete</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {isEditing && (
                              <form
                                action={renameEventFinanceCategoryAction}
                                className="space-y-3 pt-1"
                              >
                                <input
                                  name="category_id"
                                  type="hidden"
                                  value={cat.id}
                                />
                                <input
                                  name="event_id"
                                  type="hidden"
                                  value={eventId}
                                />
                                <input
                                  name="tab"
                                  type="hidden"
                                  value={currentMeta.tab}
                                />

                                <div className="flex items-center justify-between text-xs font-semibold text-[#174C37]">
                                  <span>Rename Category</span>
                                  <button
                                    className="text-xs text-[#7A685D] bg-transparent border-0 hover:underline cursor-pointer"
                                    onClick={() => setEditingCategoryId(null)}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                </div>

                                <div>
                                  <label
                                    className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                    htmlFor={`rename-name-${cat.id}`}
                                  >
                                    New Name
                                  </label>
                                  <input
                                    className="w-full h-9 px-3 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                    defaultValue={cat.name}
                                    id={`rename-name-${cat.id}`}
                                    maxLength={80}
                                    minLength={2}
                                    name="name"
                                    required
                                    type="text"
                                  />
                                </div>

                                <div>
                                  <label
                                    className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                    htmlFor={`rename-reason-${cat.id}`}
                                  >
                                    Audit Reason
                                  </label>
                                  <input
                                    className="w-full h-9 px-3 text-xs bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                                    id={`rename-reason-${cat.id}`}
                                    maxLength={500}
                                    minLength={1}
                                    name="reason"
                                    placeholder="Reason for renaming this category..."
                                    required
                                    type="text"
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    className="px-3 py-1.5 text-xs font-medium text-[#5C4638] bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg hover:bg-white min-h-[32px] cursor-pointer"
                                    onClick={() => setEditingCategoryId(null)}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                  <FormSubmitButton
                                    id={`btn-submit-rename-${cat.id}`}
                                    loadingText="Saving..."
                                    size="compact"
                                  >
                                    Save Rename
                                  </FormSubmitButton>
                                </div>
                              </form>
                            )}

                            {isDeleting && canDelete && (
                              <form
                                action={retireEventFinanceCategoryAction}
                                className="space-y-3 pt-1 bg-[#BA3C2A]/5 p-3 rounded-lg border border-[#BA3C2A]/20"
                              >
                                <input
                                  name="category_id"
                                  type="hidden"
                                  value={cat.id}
                                />
                                <input
                                  name="event_id"
                                  type="hidden"
                                  value={eventId}
                                />
                                <input
                                  name="tab"
                                  type="hidden"
                                  value={currentMeta.tab}
                                />

                                <div className="flex items-center gap-1.5 text-xs font-bold text-[#BA3C2A]">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>Delete &quot;{cat.name}&quot;?</span>
                                </div>

                                <p className="text-[11px] text-[#7A685D]">
                                  This will retire the category from active
                                  selection and log the deletion reason to the
                                  permanent audit trail.
                                </p>

                                <div>
                                  <label
                                    className="block text-[11px] font-semibold text-[#5C4638] mb-1"
                                    htmlFor={`delete-reason-${cat.id}`}
                                  >
                                    Deletion Reason{" "}
                                    <span className="text-[#BA3C2A]">*</span>
                                  </label>
                                  <input
                                    className="w-full h-9 px-3 text-xs bg-white border border-[#E5DDD3] rounded-lg text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#BA3C2A]"
                                    id={`delete-reason-${cat.id}`}
                                    maxLength={500}
                                    minLength={1}
                                    name="reason"
                                    placeholder="Governance reason for retiring this category..."
                                    required
                                    type="text"
                                  />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    className="px-3 py-1.5 text-xs font-medium text-[#5C4638] bg-white border border-[#E5DDD3] rounded-lg hover:bg-[#FAF6F0] min-h-[32px] cursor-pointer"
                                    onClick={() => setDeletingCategoryId(null)}
                                    type="button"
                                  >
                                    Cancel
                                  </button>
                                  <FormSubmitButton
                                    id={`btn-confirm-delete-${cat.id}`}
                                    loadingText="Retiring..."
                                    size="compact"
                                    variant="danger"
                                  >
                                    Confirm Deletion
                                  </FormSubmitButton>
                                </div>
                              </form>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Retired Categories Audit Section (for Admins) */}
          {canDelete && (
            <div className="pt-2 border-t border-[#E5DDD3]">
              <button
                className="text-xs text-[#7A685D] hover:text-[#3D291F] font-semibold flex items-center gap-1.5 bg-transparent border-0 cursor-pointer"
                id="btn-toggle-retired-categories"
                onClick={() => setShowRetired((prev) => !prev)}
                type="button"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>
                  {showRetired ? "Hide" : "Show"} Retired Categories (
                  {
                    categories.filter(
                      (c) => c.category_type === categoryType && c.retired_at,
                    ).length
                  }
                  )
                </span>
              </button>

              {showRetired && (
                <div className="mt-3 space-y-2">
                  {categories.filter(
                    (c) => c.category_type === categoryType && c.retired_at,
                  ).length === 0 ? (
                    <p className="text-[11px] text-[#7A685D] italic">
                      No retired categories in this section.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5DDD3] border border-[#E5DDD3] rounded-xl overflow-hidden bg-[#FAF6F0]/50">
                      {categories
                        .filter(
                          (c) =>
                            c.category_type === categoryType && c.retired_at,
                        )
                        .map((cat) => (
                          <div
                            className="p-3 flex items-center justify-between text-xs"
                            key={cat.id}
                          >
                            <div>
                              <span className="font-semibold text-[#7A685D] line-through block">
                                {cat.name}
                              </span>
                              <span className="text-[10px] text-[#7A685D]">
                                Retired{" "}
                                {cat.retired_at
                                  ? new Date(cat.retired_at).toLocaleDateString(
                                      "en-GB",
                                      {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      },
                                    )
                                  : ""}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#BA3C2A] bg-[#BA3C2A]/10 px-2 py-0.5 rounded-sm font-semibold">
                              Retired
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
