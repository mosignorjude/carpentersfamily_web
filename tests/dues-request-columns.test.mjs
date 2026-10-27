import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// `payment_reference` was dropped from public.dues_payment_requests in
// 20261025122000_dues_payment_methods.sql. Selecting it makes PostgREST fail
// the whole query, which emptied the dues page and silently suppressed the
// approval and rejection notifications.

const FILES = ["src/app/actions.ts", "src/app/(member)/dues/page.tsx"];

const EXISTING_COLUMNS = new Set([
  "id",
  "member_id",
  "amount_ngn",
  "covered_months",
  "payment_method",
  "notes",
  "status",
  "created_at",
  "reviewed_by",
  "reviewed_at",
  "review_reason",
]);

const sources = await Promise.all(
  FILES.map(async (file) => ({
    file,
    source: await readFile(new URL(`../${file}`, import.meta.url), "utf8"),
  })),
);

function duesRequestSelects(source) {
  const selects = [];
  const marker = '.from("dues_payment_requests")';
  let index = source.indexOf(marker);
  while (index !== -1) {
    const window = source.slice(index, index + 300);
    const match = window.match(/\n\s*\.select\(\s*"([^"]+)"/);
    if (match) selects.push(match[1]);
    index = source.indexOf(marker, index + marker.length);
  }
  return selects;
}

for (const { file, source } of sources) {
  test(`${file} selects only existing dues_payment_requests columns`, () => {
    const selects = duesRequestSelects(source);
    assert.ok(selects.length > 0, `expected a dues request select in ${file}`);

    for (const columns of selects) {
      const missing = columns
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean)
        .filter((column) => !EXISTING_COLUMNS.has(column));

      assert.deepEqual(
        missing,
        [],
        `${file} selects missing column(s): ${missing.join(", ")}`,
      );
    }
  });
}
