import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const budgetSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-budget-allocations.tsx",
    import.meta.url,
  ),
  "utf8",
);

const reportSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-reports.tsx",
    import.meta.url,
  ),
  "utf8",
);

const auditSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-audit-log.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Event Dashboard Mobile Responsiveness and Deduplication", () => {
  describe("TabBudgetAllocations", () => {
    it("deduplicates budget buttons by omitting redundant Edit Ceiling button", () => {
      assert.doesNotMatch(
        budgetSource,
        />\s*Edit Ceiling\s*</,
        "TabBudgetAllocations must remove redundant Edit Ceiling button",
      );
      assert.match(
        budgetSource,
        /Edit Budget Total/,
        "TabBudgetAllocations must retain primary Edit Budget Total button",
      );
    });

    it("makes chart view switcher horizontally scrollable on mobile without overflow", () => {
      assert.match(
        budgetSource,
        /overflow-x-auto/,
        "Chart switcher must include overflow-x-auto to prevent mobile blowout",
      );
    });

    it("ensures budget matrix table has min-width for table scroll region", () => {
      assert.match(
        budgetSource,
        /<table[^>]*min-w-\[580px\]/,
        "Budget matrix table must specify min-w-[580px] to preserve column geometry during horizontal scroll",
      );
    });

    it("uses concise tab labels in view switcher", () => {
      assert.match(budgetSource, />\s*Spending\s*</);
      assert.match(budgetSource, />\s*Revenue Mix\s*</);
      assert.match(budgetSource, />\s*Cash Velocity\s*</);
    });

    it("renders the Capital Allocation & Burn Rate Matrix as a horizontally scrollable table on mobile with helper text", () => {
      assert.match(
        budgetSource,
        /Swipe left or right to scroll the allocation matrix/,
        "TabBudgetAllocations must render mobile scroll helper text",
      );
      assert.doesNotMatch(
        budgetSource,
        /hidden\s+sm:block/,
        "TabBudgetAllocations must keep the matrix table visible and scrollable on mobile viewports",
      );
    });
  });

  describe("TabReports", () => {
    it("makes report actions responsive with mobile grid", () => {
      assert.match(
        reportSource,
        /grid-cols-2\s+sm:flex/,
        "Report top action buttons must use responsive grid-cols-2 on mobile",
      );
    });

    it("uses responsive flex-col on section headers", () => {
      assert.match(
        reportSource,
        /flex\s+flex-col\s+sm:flex-row\s+sm:items-center\s+justify-between/,
        "Statement section headers must stack on mobile and flex on desktop",
      );
    });

    it("ensures report statement tables specify min-widths", () => {
      assert.match(
        reportSource,
        /<table[^>]*min-w-\[500px\]/,
        "Revenue statement table must specify min-w-[500px]",
      );
      assert.match(
        reportSource,
        /<table[^>]*min-w-\[540px\]/,
        "Disbursements statement table must specify min-w-[540px]",
      );
    });

    it("renders the statement tables as horizontally scrollable on mobile with helper text", () => {
      assert.match(
        reportSource,
        /Swipe left or right to scroll the revenue table/,
        "TabReports must render mobile scroll helper text for the revenue table",
      );
      assert.match(
        reportSource,
        /Swipe left or right to scroll the disbursements table/,
        "TabReports must render mobile scroll helper text for the disbursements table",
      );
      assert.doesNotMatch(
        reportSource,
        /hidden\s+sm:block/,
        "TabReports must keep the statement tables visible and scrollable on mobile viewports",
      );
    });

    it("uses responsive 2x2 grid on mobile for P&L summary metrics", () => {
      assert.match(
        reportSource,
        /grid-cols-2\s+sm:grid-cols-4/,
        "P&L summary must use grid-cols-2 sm:grid-cols-4",
      );
    });
  });

  describe("TabAuditLog", () => {
    it("eliminates rigid min-w-[200px] on search input to prevent mobile blowout", () => {
      assert.doesNotMatch(
        auditSource,
        /min-w-\[200px\]/,
        "Audit log search container must not enforce rigid min-w-[200px]",
      );
    });

    it("makes filter controls and search stack responsively on mobile", () => {
      assert.match(
        auditSource,
        /flex\s+flex-col\s+sm:flex-row\s+items-stretch\s+sm:items-center/,
        "Category dropdown and search must stack on mobile",
      );
    });

    it("stacks officer audit trail header on mobile", () => {
      assert.match(
        auditSource,
        /flex\s+flex-col\s+sm:flex-row\s+sm:items-center\s+justify-between/,
        "Section 2 header must stack on mobile to prevent 460px blowout",
      );
    });

    it("wraps mobile journal card footer actions", () => {
      assert.match(
        auditSource,
        /flex-wrap/,
        "Mobile journal card footer must allow flex-wrap on narrow screens",
      );
    });
  });
});
