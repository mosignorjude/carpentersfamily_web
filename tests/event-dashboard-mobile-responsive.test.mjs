import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const budgetSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-budget-allocations.tsx", import.meta.url),
  "utf8"
);

const reportSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-reports.tsx", import.meta.url),
  "utf8"
);

const auditSource = readFileSync(
  new URL("../src/components/events/dashboard/tab-audit-log.tsx", import.meta.url),
  "utf8"
);

describe("Event Dashboard Mobile Responsiveness and Deduplication", () => {
  describe("TabBudgetAllocations", () => {
    it("deduplicates budget buttons by omitting redundant Edit Ceiling button", () => {
      assert.doesNotMatch(
        budgetSource,
        />\s*Edit Ceiling\s*</,
        "TabBudgetAllocations must remove redundant Edit Ceiling button"
      );
      assert.match(
        budgetSource,
        /Edit Budget Total/,
        "TabBudgetAllocations must retain primary Edit Budget Total button"
      );
    });

    it("makes chart view switcher horizontally scrollable on mobile without overflow", () => {
      assert.match(
        budgetSource,
        /overflow-x-auto/,
        "Chart switcher must include overflow-x-auto to prevent mobile blowout"
      );
    });

    it("ensures budget matrix table has min-width for table scroll region", () => {
      assert.match(
        budgetSource,
        /<table[^>]*min-w-\[580px\]/,
        "Budget matrix table must specify min-w-[580px] to preserve column geometry during horizontal scroll"
      );
    });

    it("uses concise tab labels in view switcher", () => {
      assert.match(budgetSource, />\s*Spending\s*</);
      assert.match(budgetSource, />\s*Revenue Mix\s*</);
      assert.match(budgetSource, />\s*Cash Velocity\s*</);
    });
  });

  describe("TabReports", () => {
    it("makes report actions responsive with mobile grid", () => {
      assert.match(
        reportSource,
        /grid-cols-2\s+sm:flex/,
        "Report top action buttons must use responsive grid-cols-2 on mobile"
      );
    });

    it("uses responsive flex-col on section headers", () => {
      assert.match(
        reportSource,
        /flex\s+flex-col\s+sm:flex-row\s+sm:items-center\s+justify-between/,
        "Statement section headers must stack on mobile and flex on desktop"
      );
    });

    it("ensures report statement tables specify min-widths", () => {
      assert.match(
        reportSource,
        /<table[^>]*min-w-\[500px\]/,
        "Revenue statement table must specify min-w-[500px]"
      );
      assert.match(
        reportSource,
        /<table[^>]*min-w-\[540px\]/,
        "Disbursements statement table must specify min-w-[540px]"
      );
    });
  });

  describe("TabAuditLog", () => {
    it("eliminates rigid min-w-[200px] on search input to prevent mobile blowout", () => {
      assert.doesNotMatch(
        auditSource,
        /min-w-\[200px\]/,
        "Audit log search container must not enforce rigid min-w-[200px]"
      );
    });

    it("makes filter controls and search stack responsively on mobile", () => {
      assert.match(
        auditSource,
        /flex\s+flex-col\s+sm:flex-row\s+items-stretch\s+sm:items-center/,
        "Category dropdown and search must stack on mobile"
      );
    });

    it("stacks officer audit trail header on mobile", () => {
      assert.match(
        auditSource,
        /flex\s+flex-col\s+sm:flex-row\s+sm:items-center\s+justify-between/,
        "Section 2 header must stack on mobile to prevent 460px blowout"
      );
    });

    it("wraps mobile journal card footer actions", () => {
      assert.match(
        auditSource,
        /flex-wrap/,
        "Mobile journal card footer must allow flex-wrap on narrow screens"
      );
    });
  });
});
