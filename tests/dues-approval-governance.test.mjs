import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canManageDues,
  canReviewDuesRequest,
  canSubmitDues,
  formatCoveredMonthsDisplay,
} from "../src/lib/dues-governance.mjs";

test("dues eligibility: system administrators do NOT pay dues", () => {
  assert.equal(
    canSubmitDues(["admin"]),
    false,
    "A system administrator must not be allowed to submit or pay dues",
  );
  assert.equal(
    canSubmitDues(["admin", "executive"]),
    false,
    "A member holding the system administrator role must be exempt from dues",
  );
  assert.equal(
    canSubmitDues(["president"]),
    true,
    "President pays statutory dues",
  );
  assert.equal(
    canSubmitDues(["executive"]),
    true,
    "Executive pays statutory dues",
  );
  assert.equal(canSubmitDues([]), true, "Ordinary member pays statutory dues");
});

test("dues review: non-officers cannot review dues requests", () => {
  const result = canReviewDuesRequest({
    approverId: "member-1",
    approverRoles: [],
    targetMemberId: "member-2",
    targetRoles: [],
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Only an Executive, Club Admin, or President/i);
});

test("dues review: a club administrator CAN review member and executive dues", () => {
  for (const targetRoles of [[], ["executive"]]) {
    const result = canReviewDuesRequest({
      approverId: "club-admin-1",
      approverRoles: ["admin"],
      targetMemberId: "member-2",
      targetRoles,
    });
    assert.equal(
      result.allowed,
      true,
      targetRoles.join(",") || "ordinary member",
    );
    assert.equal(result.reason, null);
  }
});

test("dues review: a club administrator CAN review the president's dues", () => {
  const result = canReviewDuesRequest({
    approverId: "club-admin-1",
    approverRoles: ["admin"],
    targetMemberId: "president-1",
    targetRoles: ["president"],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test("dues review: a club administrator cannot review their own dues", () => {
  const result = canReviewDuesRequest({
    approverId: "club-admin-1",
    approverRoles: ["admin"],
    targetMemberId: "club-admin-1",
    targetRoles: ["admin"],
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /cannot approve their own dues/i);
});

test("dues review: Officers CANNOT approve their own dues", () => {
  // Executive approving own dues
  const execSelf = canReviewDuesRequest({
    approverId: "exec-1",
    approverRoles: ["executive"],
    targetMemberId: "exec-1",
    targetRoles: ["executive"],
  });
  assert.equal(execSelf.allowed, false);
  assert.match(execSelf.reason, /Officers cannot approve their own dues/i);

  // President approving own dues
  const presidentSelf = canReviewDuesRequest({
    approverId: "president-1",
    approverRoles: ["president"],
    targetMemberId: "president-1",
    targetRoles: ["president"],
  });
  assert.equal(presidentSelf.allowed, false);
  assert.match(presidentSelf.reason, /Officers cannot approve their own dues/i);
});

test("dues review: Executive CAN approve President dues", () => {
  const result = canReviewDuesRequest({
    approverId: "exec-1",
    approverRoles: ["executive"],
    targetMemberId: "president-1",
    targetRoles: ["president"],
  });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);
});

test("dues review: Executive CAN approve ordinary member dues and other executive dues", () => {
  // Ordinary member
  const memberResult = canReviewDuesRequest({
    approverId: "exec-1",
    approverRoles: ["executive"],
    targetMemberId: "member-1",
    targetRoles: [],
  });
  assert.equal(memberResult.allowed, true);

  // Other executive
  const otherExecResult = canReviewDuesRequest({
    approverId: "exec-1",
    approverRoles: ["executive"],
    targetMemberId: "exec-2",
    targetRoles: ["executive"],
  });
  assert.equal(otherExecResult.allowed, true);
});

test("dues review: President CAN approve ordinary member and executive dues", () => {
  // Ordinary member
  const memberResult = canReviewDuesRequest({
    approverId: "president-1",
    approverRoles: ["president"],
    targetMemberId: "member-1",
    targetRoles: [],
  });
  assert.equal(memberResult.allowed, true);

  // Executive
  const execResult = canReviewDuesRequest({
    approverId: "president-1",
    approverRoles: ["president"],
    targetMemberId: "exec-1",
    targetRoles: ["executive"],
  });
  assert.equal(execResult.allowed, true);
});

test("dues review: President CANNOT approve President dues", () => {
  // Another President
  const result = canReviewDuesRequest({
    approverId: "president-1",
    approverRoles: ["president"],
    targetMemberId: "president-2",
    targetRoles: ["president"],
  });
  assert.equal(result.allowed, false);
  assert.match(
    result.reason,
    /President dues payments can only be approved by an Executive/i,
  );
});

test("formatCoveredMonthsDisplay formats single, multiple, and bounded ranges", () => {
  assert.equal(formatCoveredMonthsDisplay([]), "No months specified");
  assert.equal(
    formatCoveredMonthsDisplay(["2026-01-01"]),
    "Jan 2026",
  );
  assert.equal(
    formatCoveredMonthsDisplay(["2026-01-01", "2026-02-01"]),
    "Jan 2026, Feb 2026",
  );
  assert.equal(
    formatCoveredMonthsDisplay([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]),
    "Jan 2026 – Apr 2026 (4 months)",
  );
});

test("dues write roles: reviewer and recorder are the same set", () => {
  assert.equal(canManageDues(["admin"]), true, "the club administrator writes dues");
  assert.equal(canManageDues(["executive"]), true);
  assert.equal(canManageDues(["president"]), true);
  assert.equal(canManageDues(["member"]), false);
  assert.equal(canManageDues([]), false);
});

test("server actions gate dues writes through the shared predicate", () => {
  const actions = readFileSync("src/app/actions.ts", "utf8");
  assert.deepEqual(
    (actions.match(/canManageDues\(actor\.roles\)/g) ?? []).length,
    3,
    "approve, reject and record each consult canManageDues",
  );
  assert.deepEqual(
    (
      actions.match(
        /if \(!actor\.roles\.has\("executive"\) && !actor\.roles\.has\("president"\)\)/g,
      ) ?? []
    ).length,
    0,
    "no dues action keeps an inline executive-or-president gate",
  );
});

test("the dues page shows the record station to the club administrator", () => {
  const duesPage = readFileSync("src/app/(member)/dues/page.tsx", "utf8");
  assert.match(duesPage, /const canRecord = canManageDues\(roles\);/);
});
