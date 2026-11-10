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

const receiptPreviewPath = new URL(
  "../src/components/finances/receipt-preview.tsx",
  import.meta.url,
);

const receiptViewerSource = readFileSync(
  new URL("../src/components/finances/receipt-viewer.tsx", import.meta.url),
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

  it("maps bank_transfer to 'Bank Transfer' without NIBSS suffix in page.tsx", () => {
    assert.match(
      pageSource,
      /bank_transfer:\s*["']Bank Transfer["']/,
      "page.tsx must map bank_transfer to 'Bank Transfer'",
    );
    assert.doesNotMatch(
      pageSource,
      /Bank Transfer\s*\(NIBSS\)/,
      "page.tsx must not contain 'Bank Transfer (NIBSS)'",
    );
  });

  it("resolves view_download for ticket sale receipt with Bank Transfer", () => {
    const state = resolveReceiptCellState({
      method: "Bank Transfer",
      status: "paid",
      hasReceipt: true,
    });
    assert.equal(state, "view_download");
  });

  it("extracts CSP-safe ReceiptPreview using local pdfjs worker and Uint8Array fetch", () => {
    const previewSource = readFileSync(receiptPreviewPath, "utf8");
    assert.match(previewSource, /export function ReceiptPreview/);
    assert.match(previewSource, /fetch\(/);
    assert.match(previewSource, /new Uint8Array\(/);
    assert.match(previewSource, /pdfjs\.getDocument\(\{\s*data\s*\}\)/);
    assert.match(previewSource, /pdfjs-dist\/build\/pdf\.worker\.min\.mjs/);
    assert.doesNotMatch(previewSource, /unpkg\.com/);
    assert.doesNotMatch(previewSource, /<iframe/);
    assert.match(previewSource, /URL\.createObjectURL/);
    assert.match(previewSource, /URL\.revokeObjectURL/);
    assert.match(previewSource, /min-h-\[44px\]/);
    assert.match(receiptViewerSource, /ReceiptPreview/);
    assert.match(receiptViewerSource, /aria-label="Close receipt viewer"/);
  });
});
