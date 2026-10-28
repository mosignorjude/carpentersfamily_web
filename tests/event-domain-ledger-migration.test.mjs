import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const migrationSource = readFileSync(
  new URL("../supabase/migrations/20261028000000_event_domain_ledgers_and_verification.sql", import.meta.url),
  "utf8"
);

describe("Event Domain Ledgers & Verification Migration", () => {
  it("adds verification_status column with check constraint to transactions and ticket sales", () => {
    assert.match(migrationSource, /verification_status\s+text\s+not\s+null\s+default\s+'approved'/i);
    assert.match(migrationSource, /check\s*\(\s*verification_status\s+in\s*\('recorded',\s*'approved',\s*'rejected'\)\s*\)/i);
  });

  it("enforces segregation of duties in verify_event_financial_transaction", () => {
    assert.match(migrationSource, /create\s+or\s+replace\s+function\s+public\.verify_event_financial_transaction/i);
    assert.match(migrationSource, /42501/);
    assert.match(migrationSource, /v_actor_role\s*=\s*'executive'\s+and\s+v_txn\.created_by\s*=\s*v_actor_id/i);
  });

  it("prevents re-approving rejected entries (terminal state)", () => {
    assert.match(migrationSource, /v_txn\.verification_status\s*=\s*'rejected'/i);
  });

  it("populates voided_at on financial transaction rejection and refunded_at on ticket sale rejection", () => {
    assert.match(migrationSource, /voided_at\s*=\s*(v_now|clock_timestamp\(\)|pg_catalog\.clock_timestamp\(\))/i);
    assert.match(migrationSource, /refunded_at\s*=\s*(v_now|clock_timestamp\(\)|pg_catalog\.clock_timestamp\(\))/i);
  });
});
