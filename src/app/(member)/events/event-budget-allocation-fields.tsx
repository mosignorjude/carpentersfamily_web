"use client";

import { useState } from "react";
import { FormattedAmountInput } from "@/components/formatted-amount-input";
import { FormAlertBanner, FormFieldError } from "@/components/ui";

type CategoryOption = { id: string; name: string };
type AllocationOption = {
  position: number;
  category_id: string | null;
  allocation_percent: number | string;
};
type AllocationFormRow = {
  key: string;
  categoryId: string;
  percentage: string;
};

const money = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

export default function EventBudgetAllocationFields({
  categories,
  allocations,
  total,
}: {
  categories: CategoryOption[];
  allocations: AllocationOption[];
  total: number | null;
}) {
  const [budgetTotal, setBudgetTotal] = useState(String(total ?? ""));
  const [rows, setRows] = useState<AllocationFormRow[]>(() =>
    allocations.length
      ? allocations.map((allocation) => ({
          key: `allocation-${allocation.position}`,
          categoryId: allocation.category_id ?? "",
          percentage: Number(allocation.allocation_percent).toFixed(2),
        }))
      : [{ key: "allocation-new-1", categoryId: "", percentage: "" }],
  );

  const totalAmount = Number(budgetTotal.replace(/\D/g, "")) || 0;
  const allocatedPercent = rows.reduce(
    (sum, row) => sum + (Number(row.percentage) || 0),
    0,
  );
  const allocatedAmount = rows.reduce((sum, row) => {
    const percentage = Number(row.percentage);
    return (
      sum +
      (Number.isFinite(percentage)
        ? Math.round((totalAmount * percentage) / 100)
        : 0)
    );
  }, 0);
  const percentageIsTooHigh = allocatedPercent > 100.000001;
  const amountIsTooHigh = allocatedAmount > totalAmount;

  function updateRow(index: number, values: Partial<AllocationFormRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...values } : row,
      ),
    );
  }

  function addRow() {
    if (rows.length >= 50) return;
    setRows((current) => [
      ...current,
      {
        key: `allocation-${crypto.randomUUID()}`,
        categoryId: "",
        percentage: "",
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((current) =>
      current.filter((_row, rowIndex) => rowIndex !== index),
    );
  }

  return (
    <>
      <label htmlFor="event-budget-total">
        Budget total (NGN)
        <FormattedAmountInput
          id="event-budget-total"
          name="total_ngn"
          onChange={(event) => setBudgetTotal(event.target.value)}
          placeholder="e.g. 1,000,000"
          required
          value={budgetTotal}
        />
      </label>
      <fieldset className="allocation-fieldset">
        <legend>Budget allocation categories</legend>
        {rows.map((row, index) => {
          const isDuplicate =
            Boolean(row.categoryId) &&
            rows.some(
              (otherRow, otherIndex) =>
                otherIndex !== index && otherRow.categoryId === row.categoryId,
            );
          const isMissingPercent = Boolean(row.categoryId) && !row.percentage;

          return (
            <div className="allocation-input-row" key={row.key}>
              <label>
                Category
                <select
                  className={isDuplicate ? "border-[#BA3C2A]" : ""}
                  name="allocation_category_id"
                  onChange={(event) =>
                    updateRow(index, { categoryId: event.target.value })
                  }
                  required={Boolean(row.percentage)}
                  value={row.categoryId}
                >
                  <option value="">Select a category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {isDuplicate && (
                  <FormFieldError message="This category is already allocated in another row." />
                )}
              </label>
              <label>
                Allocation (%)
                <input
                  className={isMissingPercent ? "border-[#BA3C2A]" : ""}
                  max={100}
                  min={0}
                  name="allocation_percent"
                  onChange={(event) =>
                    updateRow(index, { percentage: event.target.value })
                  }
                  required={Boolean(row.categoryId)}
                  step="0.01"
                  type="number"
                  value={row.percentage}
                />
                {isMissingPercent && (
                  <FormFieldError message="Allocation percent required." />
                )}
              </label>
              <div className="allocation-input-amount">
                <span>Calculated amount</span>
                <strong>
                  {money.format(
                    Math.round(
                      (totalAmount * (Number(row.percentage) || 0)) / 100,
                    ),
                  )}
                </strong>
              </div>
              <button
                aria-label={`Remove allocation ${index + 1}`}
                className="button-secondary allocation-remove-button"
                onClick={() => removeRow(index)}
                type="button"
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          className="button-secondary"
          disabled={rows.length >= 50}
          onClick={addRow}
          type="button"
        >
          Add allocation category
        </button>
      </fieldset>
      <dl className="event-budget-editor-summary">
        <div>
          <dt>Allocated</dt>
          <dd>
            {allocatedPercent.toFixed(2)}% · {money.format(allocatedAmount)}
          </dd>
        </div>
        <div>
          <dt>Unallocated</dt>
          <dd>
            {Math.max(0, 100 - allocatedPercent).toFixed(2)}% ·{" "}
            {money.format(Math.max(0, totalAmount - allocatedAmount))}
          </dd>
        </div>
      </dl>
      {percentageIsTooHigh || amountIsTooHigh ? (
        <FormAlertBanner
          className="mt-3"
          message="Allocation percentages and their rounded Naira amounts must each stay within the budget total (100%). Reduce allocations to proceed."
          title="Allocation Exceeds 100%"
          variant="error"
        />
      ) : null}
    </>
  );
}
