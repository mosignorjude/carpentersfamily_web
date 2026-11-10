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
    it("uses unified Edit Budget action label and preserves Spending / Revenue Mix / Cash Flow sub-tabs", () => {
      assert.doesNotMatch(
        budgetSource,
        />\s*Edit Ceiling\s*</,
        "TabBudgetAllocations must use unified Edit Budget wording",
      );
      assert.match(
        budgetSource,
        /Edit Budget/,
        "TabBudgetAllocations must display Edit Budget action",
      );
      assert.match(budgetSource, />\s*Spending\s*</);
      assert.match(budgetSource, />\s*Revenue Mix\s*</);
      assert.match(budgetSource, />\s*Cash Flow\s*</);
    });

    it("makes chart view switcher horizontally scrollable on mobile without overflow", () => {
      assert.match(
        budgetSource,
        /overflow-x-auto/,
        "Chart switcher must include overflow-x-auto to prevent mobile blowout",
      );
    });

    it("renders mobile cost-center cards (md:hidden) and desktop TableScroll matrix (hidden md:block)", () => {
      assert.match(budgetSource, /md:hidden/);
      assert.match(budgetSource, /hidden\s+md:block/);
      assert.match(budgetSource, /<TableScroll/);
      assert.match(budgetSource, /<table[^>]*min-w-\[580px\]/);
    });
  });

  describe("TabReports", () => {
    it("renders Committee cards, responsive DM Sans Statement rows, and System Audit Trail without wide tables", () => {
      assert.match(reportSource, /grid-cols-1\s+md:grid-cols-2/);
      assert.match(reportSource, /grid-cols-2\s+sm:grid-cols-4/);
      assert.match(reportSource, /divide-y/);
      assert.doesNotMatch(reportSource, /<table\b/);
      assert.match(reportSource, /<EventAuditTrailList/);
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
