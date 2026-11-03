function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function matchesAlias(name, allocationName) {
  const left = normalizeName(name);
  const right = normalizeName(allocationName);
  if (!left || !right) return false;
  if (left === right) return true;
  if (right === "venue" && left.startsWith("venue")) return true;
  if (left === "venue" && right.startsWith("venue")) return true;
  return false;
}

function matchTier(expense, allocation, categoryNameById) {
  if (allocation.category_id) {
    if (expense.budget_allocation_category_id === allocation.category_id)
      return 1;
    if (expense.category_id === allocation.category_id) return 2;
  }
  const liveName = expense.category_id
    ? categoryNameById.get(expense.category_id)
    : null;
  if (
    expense.budget_allocation_name_snapshot === allocation.allocation_name ||
    expense.category_name_snapshot === allocation.allocation_name ||
    (liveName && liveName === allocation.allocation_name)
  ) {
    return 3;
  }
  if (
    (expense.category_name_snapshot &&
      matchesAlias(
        expense.category_name_snapshot,
        allocation.allocation_name,
      )) ||
    (liveName && matchesAlias(liveName, allocation.allocation_name))
  ) {
    return 4;
  }
  return 0;
}

/**
 * @template E
 * @template A
 * @param {{ allocations?: A[], expenses?: E[], categoryNameById?: Map<string, string> }} input
 * @returns {{ centers: { allocation: A, expenses: E[] }[], unmatched: { categoryName: string, expenses: E[] }[] }}
 */
export function partitionExpensesByAllocation({
  allocations = [],
  expenses = [],
  categoryNameById = new Map(),
}) {
  const centers = allocations
    .filter(
      (allocation) =>
        !normalizeName(allocation.allocation_name).includes("unallocated"),
    )
    .map((allocation) => ({ allocation, expenses: [] }));

  const unmatched = new Map();

  for (const expense of expenses) {
    let best = null;
    for (const center of centers) {
      const tier = matchTier(expense, center.allocation, categoryNameById);
      if (tier > 0 && (!best || tier < best.tier)) {
        best = { center, tier };
      }
    }
    if (best) {
      best.center.expenses.push(expense);
      continue;
    }
    const liveName = expense.category_id
      ? categoryNameById.get(expense.category_id)
      : null;
    const categoryName =
      liveName || expense.category_name_snapshot || "General Expenses";
    const group = unmatched.get(categoryName);
    if (group) group.expenses.push(expense);
    else unmatched.set(categoryName, { categoryName, expenses: [expense] });
  }

  return { centers, unmatched: [...unmatched.values()] };
}
