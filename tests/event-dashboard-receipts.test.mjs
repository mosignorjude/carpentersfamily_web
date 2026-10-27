import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveReceiptCellState } from "../src/lib/receipt-cell-state.mjs";

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

describe("Event Dashboard Receipts Integration", () => {
  it("queries finance_receipts for event_transaction_id in page.tsx", () => {
    assert.match(
      pageSource,
      /\.from\("finance_receipts"\)[\s\S]*\.in\("event_transaction_id",\s*rawTxnIds\)/,
      "page.tsx must fetch receipts matching transaction IDs",
    );
  });

  it("queries finance_receipts for event_ticket_sale_id in page.tsx", () => {
    assert.match(
      pageSource,
      /\.from\("finance_receipts"\)[\s\S]*\.in\("event_ticket_sale_id",\s*rawSaleIds\)/,
      "page.tsx must fetch receipts matching ticket sale IDs",
    );
  });

  it("attaches receipt object and metadata to manualTransactions", () => {
    assert.match(
      pageSource,
      /manualTransactions[\s\S]*receipt:\s*rc\s*\?\?\s*null[\s\S]*receiptFileName:\s*rc\?\.filename[\s\S]*receiptSize:\s*formatReceiptSize\(rc\?\.sizeBytes\)/,
      "manualTransactions must attach receipt, receiptFileName, and receiptSize",
    );
  });

  it("attaches receipt object and metadata to saleTransactions", () => {
    assert.match(
      pageSource,
      /saleTransactions[\s\S]*receipt:\s*rc\s*\?\?\s*null[\s\S]*receiptFileName:\s*rc\?\.filename[\s\S]*receiptSize:\s*formatReceiptSize\(rc\?\.sizeBytes\)/,
      "saleTransactions must attach receipt, receiptFileName, and receiptSize",
    );
  });

  it("imports and renders ReceiptCell in TabAuditLog", () => {
    assert.match(
      auditLogSource,
      /import\s*\{\s*ReceiptCell\s*\}\s*from\s*["']@\/components\/finances\/receipt-cell["']/,
      "tab-audit-log.tsx must import ReceiptCell",
    );
    assert.match(
      auditLogSource,
      /<ReceiptCell[\s\S]*receipt=\{txn\.receipt\}/,
      "tab-audit-log.tsx must render ReceiptCell with txn.receipt",
    );
  });

  it("resolves view_download for ticket sale receipt with Bank Transfer (NIBSS)", () => {
    const state = resolveReceiptCellState({
      method: "Bank Transfer (NIBSS)",
      status: "paid",
      hasReceipt: true,
    });
    assert.equal(state, "view_download");
  });
});
