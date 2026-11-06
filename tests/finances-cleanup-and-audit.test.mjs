import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const financesPageSource = readFileSync(
  new URL("../src/app/(member)/finances/page.tsx", import.meta.url),
  "utf8",
);
const financesViewSource = readFileSync(
  new URL("../src/components/finances/finances-page-view.tsx", import.meta.url),
  "utf8",
);
const summarySource = readFileSync(
  new URL("../src/components/finances/club-financial-summary.tsx", import.meta.url),
  "utf8",
);
const auditHistorySource = readFileSync(
  new URL("../src/components/finances/officer-audit-history.tsx", import.meta.url),
  "utf8",
);

describe("Finance Page Clean-Up & Audit Pagination (Stage 5)", () => {
  describe("Element Removals", () => {
    it("removes 'Access: General Meeting Ledger' from Finances page view", () => {
      assert.doesNotMatch(financesViewSource, /Access:\s*General Meeting Ledger/);
      assert.doesNotMatch(financesViewSource, /General Meeting Ledger/);
    });

    it("removes 'Officer Management Desk Active' from Finances page view", () => {
      assert.doesNotMatch(financesViewSource, /Officer Management Desk Active/);
    });

    it("removes 'Ledger Status' and 'Audited & Reconciled' from Finances page view", () => {
      assert.doesNotMatch(financesViewSource, /Ledger Status/);
      assert.doesNotMatch(financesViewSource, /Audited &amp; Reconciled/);
      assert.doesNotMatch(financesViewSource, /Audited & Reconciled/);
    });

    it("removes 'All Figures in Nigerian Naira (₦) · Tabular Numerals' from club-financial-summary", () => {
      assert.doesNotMatch(
        summarySource,
        /All Figures in Nigerian Naira \(₦\) · Tabular Numerals/,
      );
    });
  });

  describe("Audit Trail Pagination & Default Collapse", () => {
    it("defines AUDIT_PAGE_SIZE = 20 and paginates audit log to 20 records per page", () => {
      assert.match(financesPageSource, /AUDIT_PAGE_SIZE\s*=\s*20/);
      assert.match(
        financesPageSource,
        /Math\.ceil\(auditCount \/ AUDIT_PAGE_SIZE\)/,
      );
      assert.match(
        financesPageSource,
        /\.range\(\s*auditPage \* AUDIT_PAGE_SIZE,\s*\(auditPage \+ 1\) \* AUDIT_PAGE_SIZE - 1,?\s*\)/,
      );
    });

    it("defaults the audit trail to collapsed (closed by default unless audit_page is present)", () => {
      assert.match(
        auditHistorySource,
        /const hasAuditParam = Boolean\(searchParams\?\.get\("audit_page"\)\);/,
      );
      assert.match(
        auditHistorySource,
        /const \[isOpen, setIsOpen\] = useState\(hasAuditParam\);/,
      );
    });

    it("provides intuitive Previous and Next controls with 'Page X of Y' counter", () => {
      assert.match(auditHistorySource, /<span>Previous<\/span>/);
      assert.match(auditHistorySource, /<span>Next<\/span>/);
      assert.match(
        auditHistorySource,
        /Page \{auditPage \+ 1\} of \{auditPageCount\}/,
      );
    });
  });

  describe("Financial Ledger Privacy Statement Relocation", () => {
    it("places the exact privacy statement in the Finance page footer", () => {
      assert.match(
        financesViewSource,
        /<footer[\s\S]*?Financial records are restricted to registered members in good\s*standing\. All transactions are logged and audited by the Executive\s*Committee\.[\s\S]*?<\/footer>/,
      );
    });

    it("preserves Privacy & Shared Ledger Mandate in the footer", () => {
      assert.match(
        financesViewSource,
        /<footer[\s\S]*?Privacy &amp; Shared Ledger Mandate[\s\S]*?<\/footer>/,
      );
    });
  });
});
