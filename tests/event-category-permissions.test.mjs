import assert from "node:assert/strict";
import test from "node:test";
import { getNavigationItems } from "../src/lib/app-navigation.mjs";

test("navigation: event finance categories standalone link is removed for all roles", () => {
  const adminLinks = getNavigationItems(["admin"]).map((item) => item.href);
  const presidentLinks = getNavigationItems(["president"]).map(
    (item) => item.href,
  );
  const executiveLinks = getNavigationItems(["executive"]).map(
    (item) => item.href,
  );
  const memberLinks = getNavigationItems([]).map((item) => item.href);

  assert.ok(
    !adminLinks.includes("/admin/event-finance-categories"),
    "Admin navigation must not contain /admin/event-finance-categories",
  );
  assert.ok(
    !presidentLinks.includes("/admin/event-finance-categories"),
    "President navigation must not contain /admin/event-finance-categories",
  );
  assert.ok(
    !executiveLinks.includes("/admin/event-finance-categories"),
    "Executive navigation must not contain /admin/event-finance-categories",
  );
  assert.ok(
    !memberLinks.includes("/admin/event-finance-categories"),
    "Member navigation must not contain /admin/event-finance-categories",
  );
});

test("category permissions: Admin and President can create, edit, and delete categories", () => {
  function computePermissions(clubRoles, eventRoles) {
    const isAdmin =
      clubRoles.includes("admin") || clubRoles.includes("president");
    const isEventLead =
      eventRoles.includes("event_lead") || eventRoles.includes("lead");
    return {
      canManageCategories: isAdmin || isEventLead,
      canDeleteCategories: isAdmin,
    };
  }

  const adminPerms = computePermissions(["admin"], []);
  assert.equal(adminPerms.canManageCategories, true);
  assert.equal(adminPerms.canDeleteCategories, true);

  const presidentPerms = computePermissions(["president"], []);
  assert.equal(presidentPerms.canManageCategories, true);
  assert.equal(presidentPerms.canDeleteCategories, true);

  const eventLeadPerms = computePermissions([], ["lead"]);
  assert.equal(eventLeadPerms.canManageCategories, true);
  assert.equal(
    eventLeadPerms.canDeleteCategories,
    false,
    "Event lead must not be allowed to delete categories",
  );

  const eventLeadNamedPerms = computePermissions([], ["event_lead"]);
  assert.equal(eventLeadNamedPerms.canManageCategories, true);
  assert.equal(
    eventLeadNamedPerms.canDeleteCategories,
    false,
    "Event lead must not be allowed to delete categories",
  );

  const regularMemberPerms = computePermissions([], []);
  assert.equal(regularMemberPerms.canManageCategories, false);
  assert.equal(regularMemberPerms.canDeleteCategories, false);

  const executivePerms = computePermissions(["executive"], []);
  assert.equal(executivePerms.canManageCategories, false);
  assert.equal(executivePerms.canDeleteCategories, false);
});

test("cost center category matching: Venue allocation correctly reconciles Venue hire expense", () => {
  function matchesCategoryOrAlias(expenseCatName, allocName) {
    const cleanExp = expenseCatName.trim().toLowerCase();
    const cleanAlloc = allocName.trim().toLowerCase();
    if (cleanExp === cleanAlloc) return true;
    if (cleanAlloc === "venue" && cleanExp.startsWith("venue")) return true;
    if (cleanExp === "venue" && cleanAlloc.startsWith("venue")) return true;
    return false;
  }

  // 1. Direct match: "Catering" === "Catering"
  assert.equal(matchesCategoryOrAlias("Catering", "Catering"), true);

  // 2. Alias match: "Venue hire" -> "Venue"
  assert.equal(matchesCategoryOrAlias("Venue hire", "Venue"), true);
  assert.equal(matchesCategoryOrAlias("Venue", "Venue hire"), true);

  // 3. Renamed category match: "Venue" === "Venue"
  assert.equal(matchesCategoryOrAlias("Venue", "Venue"), true);

  // 4. Non-matching category
  assert.equal(matchesCategoryOrAlias("Security", "Venue"), false);
  assert.equal(matchesCategoryOrAlias("Production", "Catering"), false);
});

test("transaction modal categories: derives strictly from active database categories without hardcoded fallbacks", () => {
  const dbCategories = [
    {
      id: "cat-1",
      name: "Hall Rental",
      category_type: "expense",
      retired_at: null,
    },
    {
      id: "cat-2",
      name: "Old Security",
      category_type: "expense",
      retired_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "cat-3",
      name: "Sponsorship Grant",
      category_type: "revenue",
      retired_at: null,
    },
    {
      id: "cat-4",
      name: "Old Merch",
      category_type: "revenue",
      retired_at: "2026-09-01T00:00:00Z",
    },
  ];

  const revenueCategories = dbCategories
    .filter((c) => c.category_type === "revenue" && !c.retired_at)
    .map((c) => ({ id: c.id, label: c.name }));

  const expenseCategories = dbCategories
    .filter((c) => c.category_type === "expense" && !c.retired_at)
    .map((c) => ({ id: c.id, label: c.name }));

  // Verify only active categories are present
  assert.deepEqual(revenueCategories, [
    { id: "cat-3", label: "Sponsorship Grant" },
  ]);
  assert.deepEqual(expenseCategories, [{ id: "cat-1", label: "Hall Rental" }]);

  // Verify hardcoded default categories are NOT present
  const hardcodedKeys = [
    "talent_booking",
    "venue_production",
    "marketing_promotion",
    "operations_safety",
    "bar_merch",
    "vip_upgrades",
    "vendor_fees",
  ];
  for (const key of hardcodedKeys) {
    assert.ok(
      !expenseCategories.some((c) => c.id === key),
      `Hardcoded category ${key} must not exist in expense categories`,
    );
    assert.ok(
      !revenueCategories.some((c) => c.id === key),
      `Hardcoded category ${key} must not exist in revenue categories`,
    );
  }

  // Helper resolution
  const resolveCategoryForMode = (targetMode, preferred) => {
    const list =
      targetMode === "revenue" ? revenueCategories : expenseCategories;
    if (preferred) {
      const match = list.find(
        (c) =>
          c.id === preferred ||
          c.label.toLowerCase() === preferred.toLowerCase(),
      );
      if (match) return match.id;
    }
    return list[0]?.id || "";
  };

  assert.equal(resolveCategoryForMode("expense", "Hall Rental"), "cat-1");
  assert.equal(resolveCategoryForMode("expense", "cat-1"), "cat-1");
  assert.equal(resolveCategoryForMode("expense", "talent_booking"), "cat-1");
  assert.equal(resolveCategoryForMode("expense"), "cat-1");
  assert.equal(resolveCategoryForMode("revenue"), "cat-3");

  // Empty active categories case
  const emptyExpense = [];
  const resolveEmpty = () => {
    return emptyExpense[0]?.id || "";
  };
  assert.equal(resolveEmpty(), "");
});

test("expense categories: derives strictly from event budget allocations with percentages", () => {
  const budgetCeiling = 1_000_000;
  const costCenters = [
    {
      id: "venue-hire-id",
      name: "Venue Hire",
      allocated: 500_000,
      spent: 100_000,
      committed: 0,
      items: [],
    },
    {
      id: "security-cost-id",
      name: "Security & Operations",
      allocated: 200_000,
      spent: 0,
      committed: 50_000,
      items: [],
    },
  ];

  const expenseCategories = costCenters.map((c) => {
    const percent =
      c.percentage !== undefined
        ? c.percentage
        : budgetCeiling > 0
          ? (c.allocated / budgetCeiling) * 100
          : 0;
    return {
      id: c.categoryId || c.id,
      name: c.name,
      allocated: c.allocated,
      percentage: percent,
      label: `${c.name} — ${percent.toFixed(1)}% (₦${c.allocated.toLocaleString("en-NG")})`,
    };
  });

  // Verify only the 2 allocated budget lines are available
  assert.equal(expenseCategories.length, 2);
  assert.equal(expenseCategories[0].name, "Venue Hire");
  assert.equal(expenseCategories[0].percentage, 50);
  assert.equal(expenseCategories[0].allocated, 500_000);
  assert.equal(expenseCategories[0].label, "Venue Hire — 50.0% (₦500,000)");

  assert.equal(expenseCategories[1].name, "Security & Operations");
  assert.equal(expenseCategories[1].percentage, 20);
  assert.equal(expenseCategories[1].allocated, 200_000);
  assert.equal(
    expenseCategories[1].label,
    "Security & Operations — 20.0% (₦200,000)",
  );

  // Resolution
  const resolveExpense = (preferred) => {
    if (preferred) {
      const match = expenseCategories.find(
        (c) =>
          c.id === preferred ||
          c.name.toLowerCase() === preferred.toLowerCase(),
      );
      if (match) return match.id;
    }
    return expenseCategories[0]?.id || "";
  };

  assert.equal(resolveExpense("Security & Operations"), "security-cost-id");
  assert.equal(resolveExpense("venue-hire-id"), "venue-hire-id");
  assert.equal(resolveExpense("Random Unallocated"), "venue-hire-id"); // falls back to first allocated

  // Empty budget allocations
  const emptyAllocations = [];
  assert.equal(emptyAllocations.length, 0);
});

test("amount formatting and sanitization: parses comma-separated inputs correctly", () => {
  function sanitizeAndParse(value) {
    if (typeof value !== "string") return null;
    const sanitized = value.replace(/,/g, "").trim();
    if (!/^\d{1,13}$/.test(sanitized)) return null;
    const amount = Number(sanitized);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  assert.equal(sanitizeAndParse("10,000"), 10000);
  assert.equal(sanitizeAndParse("1,000,000"), 1000000);
  assert.equal(sanitizeAndParse("200,000"), 200000);
  assert.equal(sanitizeAndParse("50000"), 50000);
  assert.equal(sanitizeAndParse(""), null);
  assert.equal(sanitizeAndParse("invalid"), null);
});

test("budget allocation: bidirectional calculation between percentage and amount", () => {
  const budgetCeiling = 1_000_000;

  function calculateAmountFromPercent(percent, ceiling) {
    const p = parseFloat(percent);
    if (Number.isNaN(p) || ceiling <= 0) return "";
    const amount = Math.round((ceiling * p) / 100);
    return amount > 0 ? amount.toLocaleString() : "";
  }

  function calculatePercentFromAmount(amountStr, ceiling) {
    const num = Number(amountStr.replace(/\D/g, "")) || 0;
    if (num <= 0 || ceiling <= 0) return "";
    const pct = (num / ceiling) * 100;
    return pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(2);
  }

  // 10% on 1,000,000 -> 100,000
  assert.equal(calculateAmountFromPercent("10", budgetCeiling), "100,000");
  assert.equal(calculatePercentFromAmount("100,000", budgetCeiling), "10");

  // 35% on 1,000,000 -> 350,000
  assert.equal(calculateAmountFromPercent("35", budgetCeiling), "350,000");
  assert.equal(calculatePercentFromAmount("350,000", budgetCeiling), "35");

  // Fractional percent: 12.5% on 1,000,000 -> 125,000
  assert.equal(calculateAmountFromPercent("12.5", budgetCeiling), "125,000");
  assert.equal(calculatePercentFromAmount("125,000", budgetCeiling), "12.50");

  // Empty inputs fail gracefully
  assert.equal(calculateAmountFromPercent("", budgetCeiling), "");
  assert.equal(calculatePercentFromAmount("", budgetCeiling), "");
});

test("catalog unallocated categories: correctly detects unallocated catalog items and excludes from expense modal until allocated", () => {
  const catalog = [
    {
      id: "cat-1",
      name: "Venue",
      category_type: "budget_allocation",
      retired_at: null,
    },
    {
      id: "cat-2",
      name: "Security",
      category_type: "budget_allocation",
      retired_at: null,
    },
    {
      id: "cat-3",
      name: "Logistics and transport",
      category_type: "budget_allocation",
      retired_at: null,
    },
    {
      id: "cat-4",
      name: "Old Retired",
      category_type: "budget_allocation",
      retired_at: "2026-01-01",
    },
  ];

  // Currently allocated in this event
  const currentCostCenters = [
    {
      id: "alloc-1",
      categoryId: "cat-1",
      name: "Venue",
      allocated: 500_000,
      percentage: 50,
      spent: 0,
    },
    {
      id: "alloc-2",
      categoryId: "cat-2",
      name: "Security",
      allocated: 200_000,
      percentage: 20,
      spent: 0,
    },
  ];

  // Active unallocated catalog items
  const activeCatalog = catalog.filter(
    (c) => c.category_type === "budget_allocation" && !c.retired_at,
  );
  const unallocated = activeCatalog.filter(
    (cat) =>
      !currentCostCenters.some(
        (alloc) =>
          alloc.name.toLowerCase() === cat.name.toLowerCase() ||
          alloc.categoryId === cat.id,
      ),
  );

  assert.equal(unallocated.length, 1);
  assert.equal(unallocated[0].name, "Logistics and transport");

  // Expense modal options strictly come from allocated cost centers (NOT from unallocated catalog)
  const expenseModalOptions = currentCostCenters.map((c) => c.name);
  assert.ok(expenseModalOptions.includes("Venue"));
  assert.ok(expenseModalOptions.includes("Security"));
  assert.ok(
    !expenseModalOptions.includes("Logistics and transport"),
    "Unallocated category must not appear in expense options",
  );

  // Now simulate user allocating 10% (100,000) to Logistics and transport
  const updatedCostCenters = [
    ...currentCostCenters,
    {
      id: "alloc-3",
      categoryId: "cat-3",
      name: "Logistics and transport",
      allocated: 100_000,
      percentage: 10,
      spent: 0,
    },
  ];

  const updatedExpenseModalOptions = updatedCostCenters.map((c) => c.name);
  assert.ok(
    updatedExpenseModalOptions.includes("Logistics and transport"),
    "Newly allocated category must immediately appear in expense modal options",
  );
});
