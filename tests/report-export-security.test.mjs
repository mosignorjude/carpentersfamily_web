import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/report-export.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const exports = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

describe("report CSV security", () => {
  it("neutralizes formula markers after whitespace in user-controlled text", () => {
    for (const marker of [
      "=",
      "+",
      "-",
      "@",
      "  =",
      "\t+",
      "\r\n-",
      "\uFEFF@",
    ]) {
      const csv = exports.toCsv(["value"], [[`${marker}1+1`]]);
      assert.ok(csv.split("\r\n")[1].startsWith("\"'"), marker);
    }
  });

  it("preserves UTF-8, quotes CSV delimiters, and keeps hostile markup as text", () => {
    const csv = exports.toCsv(
      ["value"],
      [['Ọlámidé, "Example"\n<script>alert(1)</script>']],
    );
    assert.ok(csv.startsWith("\uFEFF"));
    assert.match(csv, /"Ọlámidé, ""Example""\n<script>alert\(1\)<\/script>"/u);
    assert.ok(csv.endsWith("\r\n"));
  });
});

describe("report PDF security and bounds", () => {
  it("creates a structurally indexed text-only PDF with hostile input encoded as inert text", () => {
    const pdf = exports.createSimplePdf("Club report", "Current year", [
      "Payer: x) Tj\n/JavaScript /OpenAction <script>alert(1)</script>",
      "Ọlámidé Æ Ω",
    ]);
    assert.ok(pdf instanceof Uint8Array);
    const text = Buffer.from(pdf).toString("ascii");
    assert.ok(text.startsWith("%PDF-1.4"));
    assert.doesNotMatch(
      text,
      /<script>|\/JavaScript|\/OpenAction|\/Annots|\/URI\b/u,
    );
    assert.ok(text.includes("3c7363726970743e"));
    assert.ok(text.includes("4f6c616d69646520c6203f"));

    const xrefOffset = Number(text.match(/startxref\n(\d+)\n%%EOF/u)?.[1]);
    assert.ok(Number.isSafeInteger(xrefOffset));
    assert.equal(text.slice(xrefOffset, xrefOffset + 4), "xref");
    const firstObjectOffset = Number(
      text.match(/xref\n\d+ \d+\n[^\n]+\n(\d{10})/u)?.[1],
    );
    assert.equal(
      text.slice(firstObjectOffset, firstObjectOffset + 7),
      "1 0 obj",
    );
  });

  it("limits generated pages and export size without returning partial documents", () => {
    assert.equal(
      exports.createSimplePdf(
        "Report",
        "Year",
        Array(5601).fill("bounded line"),
      ),
      null,
    );
    assert.equal(exports.MAX_REPORT_ROWS, 1000);
    assert.equal(exports.MAX_REPORT_EXPORT_BYTES, 4 * 1024 * 1024);
  });

  it("uses Africa/Lagos date boundaries and exact whole-NGN arithmetic", () => {
    assert.equal(
      exports.getWATDate(new Date("2026-12-31T23:30:00.000Z")),
      "2027-01-01",
    );
    assert.equal(exports.wholeNgn("9007199254740993"), 9007199254740993n);
    assert.equal(exports.wholeNgn("10.5"), null);
    assert.equal(exports.wholeNgn("1000000000000000000"), null);
  });

  it("totals only each member's unpaid months due through the report date", () => {
    const totals = exports.owedByMember(
      [
        {
          member_id: "member-a",
          status: "unpaid",
          due_date: "2026-04-30",
          amount_ngn: "5000",
        },
        {
          member_id: "member-a",
          status: "unpaid",
          due_date: "2026-05-31",
          amount_ngn: "500",
        },
        {
          member_id: "member-a",
          status: "unpaid",
          due_date: "2026-06-30",
          amount_ngn: "700",
        },
        {
          member_id: "member-a",
          status: "paid",
          due_date: "2026-03-31",
          amount_ngn: "8000",
        },
        {
          member_id: "member-a",
          status: "written_off",
          due_date: "2026-02-28",
          amount_ngn: "9000",
        },
        {
          member_id: "member-b",
          status: "unpaid",
          due_date: "2026-05-01",
          amount_ngn: "200",
        },
      ],
      "2026-05-31",
    );
    assert.equal(totals?.get("member-a"), 5500n);
    assert.equal(totals?.get("member-b"), 200n);
    assert.equal(
      exports.owedByMember(
        [
          {
            member_id: "member-a",
            status: "unpaid",
            due_date: "2026-05-31",
            amount_ngn: null,
          },
        ],
        "2026-05-31",
      ),
      null,
    );
  });
});
