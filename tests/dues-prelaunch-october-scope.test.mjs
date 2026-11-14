import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Issue 03: prelaunch dues scope and October continuity for reconciled members", () => {
  it("scopes Feb-Sep prelaunch months strictly to prelaunch cohort and realigns Shedrach & Daniel to 2026-10-01", async () => {
    const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql") && f >= "20261113234828")
      .sort();

    assert.ok(
      files.length > 0,
      "a remediation migration (>= 20261113234828) must exist for Issue 03",
    );

    const contents = await Promise.all(
      files.map((file) => readFile(new URL(file, migrationsDir), "utf8")),
    );
    const sql = contents.join("\n");

    // 1. Pre-launch restriction applied across dues_month_status, dues_member_has_month_obligation, dues_member_has_overdue
    assert.match(
      sql,
      /create or replace view public\.dues_month_status/i,
    );
    assert.match(
      sql,
      /create or replace function private\.dues_member_has_month_obligation/i,
    );
    assert.match(
      sql,
      /create or replace function private\.dues_member_has_overdue/i,
    );
    assert.match(
      sql,
      /starts_month\s*<=\s*date\s*'2026-10-01'[\s\S]*covered_month\s*<\s*date\s*'2026-10-01'/i,
      "prelaunch cohort check must require membership period starting <= 2026-10-01 or prelaunch historical disposition",
    );

    // 2. backfill_member_historical_dues aligns starts_month > 2026-10-01 to 2026-10-01
    assert.match(
      sql,
      /create or replace function private\.backfill_member_historical_dues[\s\S]*update public\.dues_membership_periods[\s\S]*starts_month\s*=\s*date\s*'2026-10-01'/i,
      "backfill_member_historical_dues must align post-launch approved prelaunch members to starts_month = 2026-10-01",
    );

    // 3. Reconciles Shedrach and Nwosu Daniel Ogechukwu cleanly
    assert.match(sql, /e3d3c724-71e1-4f82-8532-f5da8330147d/);
    assert.match(sql, /d5850893-6592-423c-8472-9802da999d37/);
    assert.doesNotMatch(
      sql,
      /\b(?:delete|update)\s+(?:from\s+)?public\.(?:dues_payments|dues_month_dispositions)\b/i,
      "migration must not modify or delete existing dues_payments or dues_month_dispositions rows",
    );
  });

  it("includes pgTAP coverage verifying post-launch members exclude Feb-Oct while reconciled prelaunch members keep Oct", async () => {
    const pgTapFiles = [
      "../supabase/tests/database/pre_launch_financial_onboarding_test.sql",
      "../supabase/tests/database/dues_privacy_test.sql",
    ];
    const contents = await Promise.all(
      pgTapFiles.map((p) => readFile(new URL(p, import.meta.url), "utf8")),
    );
    const combined = contents.join("\n");

    assert.match(
      combined,
      /post-launch|2026-11-01.*Feb|future post-launch/i,
      "pgTAP dues test suite must verify that Nov+ post-launch members do not receive Feb-Sep or Oct obligations",
    );
  });
});
