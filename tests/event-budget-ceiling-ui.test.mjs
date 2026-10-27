import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const modalPath = new URL(
  "../src/components/events/dashboard/modals/event-budget-ceiling-modal.tsx",
  import.meta.url,
);
const tabBudgetAllocationsPath = new URL(
  "../src/components/events/dashboard/tab-budget-allocations.tsx",
  import.meta.url,
);
const tabOverviewPath = new URL(
  "../src/components/events/dashboard/tab-overview.tsx",
  import.meta.url,
);
const dashboardViewPath = new URL(
  "../src/components/events/dashboard/event-dashboard-view.tsx",
  import.meta.url,
);

describe("EventBudgetCeilingModal", () => {
  it("file exists and exports EventBudgetCeilingModal", () => {
    assert.ok(
      existsSync(modalPath),
      "event-budget-ceiling-modal.tsx must exist",
    );
    const source = readFileSync(modalPath, "utf8");
    assert.match(
      source,
      /export function EventBudgetCeilingModal/,
      "Must export EventBudgetCeilingModal",
    );
  });

  it("submits to setEventBudgetAction with correct fields", () => {
    if (!existsSync(modalPath)) return;
    const source = readFileSync(modalPath, "utf8");
    assert.match(
      source,
      /setEventBudgetAction/,
      "Must use setEventBudgetAction",
    );
    assert.match(
      source,
      /name="total_ngn"/,
      "Must include total_ngn input field",
    );
    assert.match(
      source,
      /name="event_id"/,
      "Must include event_id hidden field",
    );
    assert.match(
      source,
      /name="return_tab"/,
      "Must include return_tab hidden field",
    );
    assert.match(
      source,
      /name="reason"/,
      "Must include reason field",
    );
  });

  it("handles dynamic copy for initial setup vs revision", () => {
    if (!existsSync(modalPath)) return;
    const source = readFileSync(modalPath, "utf8");
    assert.match(
      source,
      /Set Event Budget Total/,
      "Must include Set Event Budget Total heading for initial ceiling",
    );
    assert.match(
      source,
      /Edit Event Budget Total/,
      "Must include Edit Event Budget Total heading for existing ceiling",
    );
  });
});

describe("TabBudgetAllocations button wiring", () => {
  const source = readFileSync(tabBudgetAllocationsPath, "utf8");

  it("preserves the existing Categories button intact", () => {
    assert.match(
      source,
      /id="btn-manage-budget-categories"/,
      "Categories button with id btn-manage-budget-categories must remain intact",
    );
    assert.match(
      source,
      /onManageCategories/,
      "onManageCategories prop must remain intact",
    );
  });

  it("renders a Set/Edit Budget Total button alongside Categories button", () => {
    assert.match(
      source,
      /onOpenBudgetCeilingModal/,
      "TabBudgetAllocations must accept onOpenBudgetCeilingModal prop",
    );
    assert.match(
      source,
      /btn-set-budget-total|btn-edit-budget-total|btn-open-budget-ceiling/,
      "TabBudgetAllocations must render a button to open budget ceiling modal",
    );
    assert.match(
      source,
      /Set Budget Total/,
      "TabBudgetAllocations must display Set Budget Total when ceiling is 0",
    );
    assert.match(
      source,
      /Edit Budget Total/,
      "TabBudgetAllocations must display Edit Budget Total when ceiling is > 0",
    );
  });

  it("renders a Set Budget Total call-to-action in empty state", () => {
    assert.match(
      source,
      /costCenters\.length === 0/,
      "TabBudgetAllocations must handle empty cost centers",
    );
    assert.match(
      source,
      /onOpenBudgetCeilingModal/,
      "Empty state must provide access to onOpenBudgetCeilingModal",
    );
  });
});

describe("TabOverview and EventDashboardView integration", () => {
  const overviewSource = readFileSync(tabOverviewPath, "utf8");
  const dashboardSource = readFileSync(dashboardViewPath, "utf8");

  it("TabOverview accepts onOpenBudgetCeilingModal and provides trigger on ceiling card", () => {
    assert.match(
      overviewSource,
      /onOpenBudgetCeilingModal/,
      "TabOverview must accept onOpenBudgetCeilingModal",
    );
  });

  it("EventDashboardView renders EventBudgetCeilingModal and manages state", () => {
    assert.match(
      dashboardSource,
      /EventBudgetCeilingModal/,
      "EventDashboardView must import and render EventBudgetCeilingModal",
    );
    assert.match(
      dashboardSource,
      /isBudgetCeilingModalOpen|budgetCeilingModalOpen/,
      "EventDashboardView must maintain budget ceiling modal open state",
    );
  });
});
