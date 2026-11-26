import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import ts from "typescript";
import * as duesGovernance from "../src/lib/dues-governance.mjs";
import { rpcErrorNotice } from "../src/lib/rpc-error-notice.ts";

function loadTsModule(relativePath) {
  const fullPath = new URL(relativePath, import.meta.url);
  assert.equal(existsSync(fullPath), true, `${relativePath} must exist`);
  const src = readFileSync(fullPath, "utf8");
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

describe("Dues officer recording, receipt visibility, and dedicated member ledger", () => {
  it("enforces self-recording, President separation, and Admin exemption in canRecordDuesForMember", () => {
    assert.equal(
      typeof duesGovernance.canRecordDuesForMember,
      "function",
      "canRecordDuesForMember must be exported from src/lib/dues-governance.mjs",
    );

    // Executive can record for regular member, another executive, and president
    for (const targetRoles of [[], ["executive"], ["president"]]) {
      const check = duesGovernance.canRecordDuesForMember({
        actorId: "exec-1",
        actorRoles: ["executive"],
        targetMemberId: "target-1",
        targetRoles,
      });
      assert.equal(check.allowed, true);
      assert.equal(check.reason, null);
    }

    // Club Admin can record for regular member, executive, and president
    for (const targetRoles of [[], ["executive"], ["president"]]) {
      const check = duesGovernance.canRecordDuesForMember({
        actorId: "admin-1",
        actorRoles: ["admin"],
        targetMemberId: "target-1",
        targetRoles,
      });
      assert.equal(check.allowed, true);
      assert.equal(check.reason, null);
    }

    // President can record for regular member and executive, NOT another president
    assert.equal(
      duesGovernance.canRecordDuesForMember({
        actorId: "pres-1",
        actorRoles: ["president"],
        targetMemberId: "member-1",
        targetRoles: [],
      }).allowed,
      true,
    );
    const presToPres = duesGovernance.canRecordDuesForMember({
      actorId: "pres-1",
      actorRoles: ["president"],
      targetMemberId: "pres-2",
      targetRoles: ["president"],
    });
    assert.equal(presToPres.allowed, false);
    assert.match(presToPres.reason, /Executive or Club Admin/i);

    // Officers cannot record their own dues
    const selfRecord = duesGovernance.canRecordDuesForMember({
      actorId: "exec-1",
      actorRoles: ["executive"],
      targetMemberId: "exec-1",
      targetRoles: ["executive"],
    });
    assert.equal(selfRecord.allowed, false);
    assert.match(selfRecord.reason, /own dues/i);

    // Club Admins are exempt
    const adminTarget = duesGovernance.canRecordDuesForMember({
      actorId: "exec-1",
      actorRoles: ["executive"],
      targetMemberId: "admin-1",
      targetRoles: ["admin"],
    });
    assert.equal(adminTarget.allowed, false);
    assert.match(adminTarget.reason, /exempt/i);

    // Regular member blocked
    const memberActor = duesGovernance.canRecordDuesForMember({
      actorId: "m-1",
      actorRoles: [],
      targetMemberId: "m-2",
      targetRoles: [],
    });
    assert.equal(memberActor.allowed, false);
  });

  it("maps dues and receipt RPC error messages cleanly", () => {
    assert.equal(
      rpcErrorNotice({
        code: "23514",
        message:
          "Payment amount must exactly equal the configured rate total for the selected months.",
      }),
      "dues-amount-mismatch",
    );
    assert.equal(
      rpcErrorNotice({
        code: "23514",
        message: "A covered past or current month is outside the member dues period.",
      }),
      "dues-month-outside-period",
    );
    assert.equal(
      rpcErrorNotice({
        code: "23514",
        message: "Admins are exempt from statutory dues obligations.",
      }),
      "dues-member-exempt",
    );
    assert.equal(
      rpcErrorNotice({
        code: "42501",
        message: "Officers cannot record their own dues payments.",
      }),
      "self-action-denied",
    );
    assert.equal(
      rpcErrorNotice({
        code: "42501",
        message: "Officers cannot attach receipts to their own dues payments.",
      }),
      "self-action-denied",
    );
  });

  it("exports typed success and error notices for all receipt and dues failure codes", async () => {
    const mod = await loadTsModule("../src/lib/dues-notices.ts");
    const expectedErrors = [
      "receipt-required",
      "receipt-invalid",
      "receipt-upload-failed",
      "receipt-storage-unavailable",
      "receipt-not-allowed",
      "duplicate-record",
      "self-action-denied",
      "dues-amount-mismatch",
      "dues-month-outside-period",
      "dues-member-exempt",
      "denied",
      "invalid-request",
      "operation-failed",
    ];
    for (const code of expectedErrors) {
      const notice = mod.getDuesNotice(code);
      assert.ok(notice, `missing error notice for ${code}`);
      assert.equal(notice.variant, "error", `${code} must be error variant`);
      assert.ok(notice.message.length > 5);
    }

    for (const code of [
      "saved",
      "rate-saved",
      "receipt-attached",
      "dues-request-approved",
      "dues-request-submitted",
      "historical-dues-reconciled",
    ]) {
      const notice = mod.getDuesNotice(code);
      assert.ok(notice, `missing success notice for ${code}`);
      assert.equal(notice.variant, "success", `${code} must be success variant`);
    }
  });

  it("ships migration defining is_member_dues_month_payable and updating all dues & receipt RPCs", () => {
    const migrationPath = new URL(
      "../supabase/migrations/20261126020000_dues_officer_recording_receipts_and_prelaunch_fix.sql",
      import.meta.url,
    );
    assert.equal(existsSync(migrationPath), true, "migration file must exist");
    const sql = readFileSync(migrationPath, "utf8");
    assert.match(sql, /create or replace function private\.is_member_dues_month_payable/i);
    assert.match(sql, /create or replace function public\.record_dues_payment/i);
    assert.match(sql, /create or replace function public\.submit_dues_payment_request/i);
    assert.match(sql, /create or replace function private\.write_off_dues_months/i);
    assert.match(sql, /create or replace function private\.correct_dues_payment/i);
    assert.match(sql, /create or replace function public\.attach_finance_receipt/i);
    assert.match(sql, /p_scope\s+not\s+in\s*\(\s*'club'\s*,\s*'event'\s*,\s*'event_ticket'\s*,\s*'dues'\s*\)/i);
  });

  it("provides dedicated /dues/members/[memberId] route and MemberDuesLedgerView without self-pay triggers", () => {
    const routePath = new URL(
      "../src/app/(member)/dues/members/[memberId]/page.tsx",
      import.meta.url,
    );
    const ledgerViewPath = new URL(
      "../src/components/dues/member-dues-ledger-view.tsx",
      import.meta.url,
    );
    const duesPagePath = new URL(
      "../src/app/(member)/dues/page.tsx",
      import.meta.url,
    );
    const paymentsCardPath = new URL(
      "../src/components/dues/dues-payments-history-card.tsx",
      import.meta.url,
    );

    assert.equal(existsSync(routePath), true, "member ledger page must exist");
    assert.equal(existsSync(ledgerViewPath), true, "MemberDuesLedgerView must exist");

    const routeSrc = readFileSync(routePath, "utf8");
    assert.match(routeSrc, /await params/);
    assert.match(routeSrc, /await searchParams/);
    assert.match(routeSrc, /canManageDues/);
    assert.match(routeSrc, /MemberDuesLedgerView/);

    const duesPageSrc = readFileSync(duesPagePath, "utf8");
    assert.match(duesPageSrc, /\/dues\/members\/\$\{/);

    const ledgerViewSrc = readFileSync(ledgerViewPath, "utf8");
    assert.match(ledgerViewSrc, /showPayActions=\{false\}/);
    assert.doesNotMatch(ledgerViewSrc, /PayDuesModal/);

    const paymentsCardSrc = readFileSync(paymentsCardPath, "utf8");
    assert.match(paymentsCardSrc, /ReceiptCell/);
    assert.match(paymentsCardSrc, /action="\/api\/receipts"/);
    assert.match(paymentsCardSrc, /value="dues"/);
  });
});
