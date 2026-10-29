import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSimplePdf, getWATDate } from "../src/lib/report-export.ts";

describe("Event Finance PDF generation integration", () => {
  it("generates valid PDF header and trailer for event finance report", () => {
    const lines = [
      "Event Title: SLK Rave",
      "Period: All dates to All dates",
      `Generated: ${getWATDate()}`,
      "",
      "--- FINANCIAL SUMMARY ---",
      "Paid other income: NGN 1500000",
      "Pending other income: NGN 0",
      "Unpaid other income: NGN 0",
      "Paid & deposit expenses: NGN 950000",
      "Expense commitments: NGN 0",
      "Ticket income net of refunds: NGN 3750000",
      "Net ticket quantity: 184",
      "Net event result: NGN 4300000",
      "",
      "--- TRANSACTIONS & TICKET RELEASES ---",
      "2026-10-14 | Expense | NGN 950000 | paid | Stage Sound & LED Rigging | Oligbo Palace Ground",
      "2026-10-20 | Ticket sale (VIP) | Qty: 38 | NGN 1330000 | card | Anonymous",
    ];

    const pdf = createSimplePdf(
      "Carpenters Family Social Club | Event Finance Report",
      "SLK Rave",
      lines,
    );

    assert.ok(pdf instanceof Uint8Array, "Must return Uint8Array");
    assert.ok(pdf.byteLength > 100, "PDF must not be empty");

    const header = Buffer.from(pdf.slice(0, 8)).toString("ascii");
    assert.match(header, /^%PDF-1\./, "Must have valid %PDF-1.x header");

    const tail = Buffer.from(pdf.slice(-30)).toString("ascii");
    assert.match(tail, /%%EOF\s*$/, "Must end with %%EOF");
  });
});
