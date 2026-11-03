import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("../src/app/api/reports/[report]/route.ts", import.meta.url),
  "utf8"
);

const csvSection = source.slice(
  source.indexOf("function financeRowsToCsv"),
  source.indexOf("function financeRowsToPdf")
);
const pdfSection = source.slice(
  source.indexOf("function financeRowsToPdf"),
  source.indexOf("async function createFinanceExport")
);
const validationStart = source.indexOf("for (const field of [");
assert.notEqual(
  validationStart,
  -1,
  "the summary-key validation loop must exist"
);
const validationSection = source.slice(
  validationStart,
  source.indexOf("] as const", validationStart)
);

const SUMMARY_KEYS = [
  "dues_income",
  "other_income",
  "expenses",
  "event_inflow",
  "event_outflow",
  "balance",
];

describe("Club event shared balance exports", () => {
  for (const key of SUMMARY_KEYS) {
    it(`renders and validates summary.${key}`, () => {
      assert.match(
        csvSection,
        new RegExp(`String\\(summary\\.${key}\\)`),
        `the CSV must carry a row for ${key}`
      );
      assert.match(
        pdfSection,
        new RegExp(`formatPdfAmount\\(summary\\.${key}\\)`),
        `the PDF must carry a line for ${key}`
      );
      assert.match(
        validationSection,
        new RegExp(`"${key}"`),
        `${key} must be validated before the export is built`
      );
    });
  }

  it("names the event cash lines as event money, not club money", () => {
    assert.match(csvSection, /All-time event cash in \(NGN\)/);
    assert.match(csvSection, /All-time event cash out \(NGN\)/);
    assert.match(pdfSection, /All-time event cash in: /);
    assert.match(pdfSection, /All-time event cash out: /);
    assert.doesNotMatch(csvSection, /Event (income|expenses) \(NGN\)/);
  });

  it("keeps event rows out of the club transaction list", () => {
    assert.match(
      csvSection,
      /transactions\.map\(\(transaction\) => \[/,
      "the CSV transaction rows still come from the club ledger only"
    );
  });
});
