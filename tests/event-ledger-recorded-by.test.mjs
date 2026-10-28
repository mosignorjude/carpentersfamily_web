import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(
  new URL(
    "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
    import.meta.url,
  ),
  "utf8",
);

const auditLogSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/tab-audit-log.tsx",
    import.meta.url,
  ),
  "utf8",
);

const modalSource = readFileSync(
  new URL(
    "../src/components/events/dashboard/modals/transaction-detail-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Event Ledger Recorded/Auth by Attribution", () => {
  it("selects created_by in event_financial_transactions query", () => {
    assert.match(
      pageSource,
      /\.from\("event_financial_transactions"\)[\s\S]*created_by/,
      "page.tsx must select created_by on financial transactions",
    );
  });

  it("selects seller_id in event_ticket_sales query", () => {
    assert.match(
      pageSource,
      /\.from\("event_ticket_sales"\)[\s\S]*seller_id/,
      "page.tsx must select seller_id on ticket sales",
    );
  });

  it("batch queries member_profiles for unique actor usernames", () => {
    assert.match(
      pageSource,
      /\.from\("member_profiles"\)[\s\S]*\.select\("id,\s*username"\)/,
      "page.tsx must batch query member_profiles for actor usernames",
    );
  });

  it("renames Authorized By column header to Recorded/Auth by in TabAuditLog", () => {
    assert.match(
      auditLogSource,
      /<th[^>]*>Recorded\/Auth by<\/th>/,
      "TabAuditLog must label column Recorded/Auth by",
    );
    assert.doesNotMatch(
      auditLogSource,
      /<th[^>]*>Authorized By<\/th>/,
      "TabAuditLog must not retain old Authorized By column header",
    );
  });

  it("renames Authorized Officer to Recorded / Authorized by in TransactionDetailModal", () => {
    assert.match(
      modalSource,
      /Recorded\s*\/\s*Authorized by/,
      "TransactionDetailModal must label metadata card Recorded / Authorized by",
    );
  });
});
