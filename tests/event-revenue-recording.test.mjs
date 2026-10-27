import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20261027233000_allow_event_revenue_category.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("record_event_financial_transaction revenue category support", () => {
  it("does not forbid p_category_id when p_kind is income", () => {
    assert.doesNotMatch(
      migrationSource,
      /p_kind\s*=\s*'income'[^;]*p_category_id\s+is\s+not\s+null|or\s+p_category_id\s+is\s+not\s+null[^;]*p_kind\s*=\s*'income'/,
      "Migration must not forbid p_category_id on income/revenue",
    );
  });

  it("verifies p_category_id belongs to a revenue category when provided for income", () => {
    assert.match(
      migrationSource,
      /category_type\s*=\s*'revenue'/,
      "Migration must validate category_type is revenue for income transactions",
    );
  });
});
