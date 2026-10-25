function normalizeCategoryName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function getActiveExpenseCategories(categories = []) {
  return categories.filter(
    (category) => category?.category_type === "expense" && !category.retired_at,
  );
}

export function matchExpenseCategoryByName(allocationName, categories = []) {
  const target = normalizeCategoryName(allocationName);
  if (!target) return null;
  return (
    getActiveExpenseCategories(categories).find(
      (category) => normalizeCategoryName(category.name) === target,
    ) ?? null
  );
}

/**
 * The finance RPC expects `category_id` to reference an expense-category row and
 * `budget_allocation_category_id` to reference a budget-allocation row. Keeping
 * the two ids separate is what makes a disbursement post.
 */
export function buildDisbursementFields(allocation, expenseCategory) {
  if (!allocation?.id || !expenseCategory?.id) return null;
  return {
    category: expenseCategory.id,
    categoryLabel: expenseCategory.name,
    budgetAllocationCategoryId: allocation.id,
  };
}
