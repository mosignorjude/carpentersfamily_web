import assert from "node:assert/strict";
import test from "node:test";
import { partitionExpensesByAllocation } from "../src/lib/event-cost-centers.mjs";

const ALLOCATIONS = [
  {
    position: 1,
    category_id: "alloc-stage",
    allocation_name: "Stage and Lighting",
    amount_ngn: 1750000,
  },
  {
    position: 2,
    category_id: "alloc-security",
    allocation_name: "Security",
    amount_ngn: 250000,
  },
  {
    position: 7,
    category_id: "alloc-venue",
    allocation_name: "Venue",
    amount_ngn: 100000,
  },
];

function expense(overrides) {
  return {
    id: "txn-1",
    amount_ngn: 100000,
    payment_status: "paid",
    category_id: null,
    category_name_snapshot: null,
    budget_allocation_category_id: null,
    budget_allocation_name_snapshot: null,
    ...overrides,
  };
}

function allExpenses(partition) {
  const rows = [];
  for (const center of partition.centers) rows.push(...center.expenses);
  for (const group of partition.unmatched) rows.push(...group.expenses);
  return rows;
}

test("an expense is charged to exactly one cost center, never to a second one that merely shares its category name", () => {
  const venuePayment = expense({
    id: "pay-venue",
    category_id: "cat-venue",
    category_name_snapshot: "Venue",
    budget_allocation_category_id: "alloc-stage",
    budget_allocation_name_snapshot: "Stage and Lighting",
  });
  const polo = expense({
    id: "pay-polos",
    amount_ngn: 138000,
    category_id: "cat-marketing",
    category_name_snapshot: "Marketing & Promotions",
    budget_allocation_category_id: "alloc-marketing",
    budget_allocation_name_snapshot: "Marketing & Promotions",
  });

  const partition = partitionExpensesByAllocation({
    allocations: ALLOCATIONS,
    expenses: [venuePayment, polo],
    categoryNameById: new Map([
      ["cat-venue", "Venue"],
      ["cat-marketing", "Marketing & Promotions"],
    ]),
  });

  const stage = partition.centers.find(
    (c) => c.allocation.allocation_name === "Stage and Lighting",
  );
  const venue = partition.centers.find(
    (c) => c.allocation.allocation_name === "Venue",
  );

  assert.deepEqual(
    stage.expenses.map((row) => row.id),
    ["pay-venue"],
    "the allocation id on the row decides the cost center",
  );
  assert.deepEqual(
    venue.expenses,
    [],
    "the Venue center must not claim the payment just because its category is named Venue",
  );
  assert.equal(
    allExpenses(partition).reduce((sum, row) => sum + row.amount_ngn, 0),
    238000,
    "cost-center totals cannot exceed the money actually spent",
  );
});

test("the allocation id outranks a category id that points at a different cost center", () => {
  const partition = partitionExpensesByAllocation({
    allocations: ALLOCATIONS,
    expenses: [
      expense({
        id: "pay-both",
        category_id: "alloc-venue",
        budget_allocation_category_id: "alloc-stage",
      }),
    ],
    categoryNameById: new Map(),
  });

  const claimed = allExpenses(partition);
  assert.equal(
    claimed.length,
    1,
    "one expense may only enter one cost center's list",
  );
  assert.deepEqual(
    partition.centers
      .filter((c) => c.expenses.length > 0)
      .map((c) => c.allocation.allocation_name),
    ["Stage and Lighting"],
  );
});

test("an expense with no allocation id still falls back to the cost center named like its category", () => {
  const partition = partitionExpensesByAllocation({
    allocations: ALLOCATIONS,
    expenses: [
      expense({
        id: "pay-guards",
        amount_ngn: 250000,
        category_id: "cat-security",
        category_name_snapshot: "Security",
      }),
    ],
    categoryNameById: new Map([["cat-security", "Security"]]),
  });

  const security = partition.centers.find(
    (c) => c.allocation.allocation_name === "Security",
  );
  assert.deepEqual(
    security.expenses.map((row) => row.id),
    ["pay-guards"],
    "the name fallback is load-bearing: allocations are bound to categories by name, so a genuine expense must not disappear",
  );
});

test("an expense that matches no cost center is grouped as unmatched under its live category name", () => {
  const partition = partitionExpensesByAllocation({
    allocations: ALLOCATIONS,
    expenses: [
      expense({
        id: "pay-giving",
        amount_ngn: 40000,
        category_id: "cat-giving",
        category_name_snapshot: "Stewardship",
      }),
    ],
    categoryNameById: new Map([["cat-giving", "Stewardship"]]),
  });

  assert.deepEqual(
    partition.centers.map((c) => c.expenses),
    [[], [], []],
    "no cost center may adopt an unrelated expense",
  );
  assert.deepEqual(
    partition.unmatched.map((g) => ({
      categoryName: g.categoryName,
      ids: g.expenses.map((row) => row.id),
    })),
    [{ categoryName: "Stewardship", ids: ["pay-giving"] }],
  );
});
