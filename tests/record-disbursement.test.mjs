import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildDisbursementFields,
  getActiveExpenseCategories,
  matchExpenseCategoryByName,
} from "../src/lib/record-disbursement.mjs";

const modalSource = await readFile(
  new URL(
    "../src/components/events/dashboard/modals/record-transaction-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

const CATEGORIES = [
  {
    id: "venue-expense",
    name: "Venue",
    category_type: "expense",
    retired_at: null,
  },
  {
    id: "security-expense",
    name: "Security",
    category_type: "expense",
    retired_at: null,
  },
  {
    id: "logistics-expense",
    name: "Logistics & Stage Transport",
    category_type: "expense",
    retired_at: null,
  },
  {
    id: "retired-expense",
    name: "Produce",
    category_type: "expense",
    retired_at: "2026-10-01T00:00:00Z",
  },
  {
    id: "venue-allocation",
    name: "Venue",
    category_type: "budget_allocation",
    retired_at: null,
  },
  {
    id: "merch-revenue",
    name: "Merchandise",
    category_type: "revenue",
    retired_at: null,
  },
];

test("active expense categories exclude retired and non-expense catalog entries", () => {
  assert.deepEqual(
    getActiveExpenseCategories(CATEGORIES).map((category) => category.id),
    ["venue-expense", "security-expense", "logistics-expense"],
  );
});

test("allocation names match an active expense category after punctuation and case normalization", () => {
  assert.equal(
    matchExpenseCategoryByName(" venue ", CATEGORIES)?.id,
    "venue-expense",
  );
  assert.equal(
    matchExpenseCategoryByName("SECURITY", CATEGORIES)?.id,
    "security-expense",
  );
  assert.equal(
    matchExpenseCategoryByName("Logistics and transport", CATEGORIES),
    null,
    "Names that only partially overlap must not be treated as a match",
  );
  assert.equal(
    matchExpenseCategoryByName("Produce", CATEGORIES),
    null,
    "Retired expense categories must not be offered",
  );
  assert.equal(
    matchExpenseCategoryByName("Venue", [
      {
        id: "venue-allocation",
        name: "Venue",
        category_type: "budget_allocation",
        retired_at: null,
      },
    ]),
    null,
    "Budget-allocation categories must never be matched as expense categories",
  );
});

test("disbursement fields keep the expense category and budget allocation ids separate", () => {
  const fields = buildDisbursementFields(
    {
      id: "venue-allocation",
      costCenterId: "venue-allocation",
      name: "Venue",
    },
    {
      id: "venue-expense",
      name: "Venue",
      category_type: "expense",
      retired_at: null,
    },
  );

  assert.deepEqual(fields, {
    category: "venue-expense",
    categoryLabel: "Venue",
    budgetAllocationCategoryId: "venue-allocation",
  });
  assert.notEqual(
    fields.category,
    fields.budgetAllocationCategoryId,
    "The transaction category must not reuse the budget-allocation id",
  );
});

test("disbursement fields fail closed when the allocation or expense category is missing", () => {
  assert.equal(buildDisbursementFields(undefined, CATEGORIES[0]), null);
  assert.equal(
    buildDisbursementFields(
      { id: "venue-allocation", name: "Venue" },
      undefined,
    ),
    null,
  );
});

test("record transaction modal submits a real expense category and validates it before saving", () => {
  assert.match(
    modalSource,
    /getActiveExpenseCategories\(categories\)/,
    "Expense mode must build its options from active expense-type categories",
  );
  assert.match(
    modalSource,
    /buildDisbursementFields\(/,
    "Disbursement submission must use the shared payload builder",
  );
  assert.ok(
    !/budgetAllocationCategoryId:\s*matchedExpenseCategory\?\.id/.test(
      modalSource,
    ),
    "The allocation id must no longer be submitted as the transaction category",
  );
  assert.match(
    modalSource,
    /No active expense categories/,
    "Submitting without an active expense category must be rejected with an actionable message",
  );
});
