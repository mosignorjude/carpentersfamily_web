import assert from "node:assert/strict";
import test from "node:test";
import {
  canReviewDuesRequest,
  canSubmitDues,
  formatCoveredMonthsDisplay,
} from "../src/lib/dues-governance.mjs";

test("dues eligibility: Admins do NOT pay dues", () => {
  assert.equal(
    canSubmitDues(["admin"]),
    false,
    "Admin must not be allowed to submit or pay dues",
  );
  assert.equal(
    canSubmitDues(["admin", "executive"]),
    false,
    "Member with admin role must be exempt from dues",
  );
  assert.equal(
    canSubmitDues(["backup_admin"]),
    true,
    "Backup Admin pays statutory dues",
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
  assert.match(result.reason, /Only an Executive, Admin, or Backup Admin/i);
});

test("dues review: target Admin is exempt from dues", () => {
  const result = canReviewDuesRequest({
    approverId: "admin-1",
    approverRoles: ["admin"],
    targetMemberId: "admin-2",
    targetRoles: ["admin"],
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Admins are exempt from paying dues/i);
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

  // Backup Admin approving own dues
  const backupSelf = canReviewDuesRequest({
    approverId: "backup-1",
    approverRoles: ["backup_admin"],
    targetMemberId: "backup-1",
    targetRoles: ["backup_admin"],
  });
  assert.equal(backupSelf.allowed, false);
  assert.match(backupSelf.reason, /Officers cannot approve their own dues/i);
});

test("dues review: Executive CAN approve Backup Admin dues", () => {
  const result = canReviewDuesRequest({
    approverId: "exec-1",
    approverRoles: ["executive"],
    targetMemberId: "backup-1",
    targetRoles: ["backup_admin"],
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

test("dues review: Backup Admin CAN approve ordinary member and executive dues", () => {
  // Ordinary member
  const memberResult = canReviewDuesRequest({
    approverId: "backup-1",
    approverRoles: ["backup_admin"],
    targetMemberId: "member-1",
    targetRoles: [],
  });
  assert.equal(memberResult.allowed, true);

  // Executive
  const execResult = canReviewDuesRequest({
    approverId: "backup-1",
    approverRoles: ["backup_admin"],
    targetMemberId: "exec-1",
    targetRoles: ["executive"],
  });
  assert.equal(execResult.allowed, true);
});

test("dues review: Backup Admin CANNOT approve Backup Admin dues", () => {
  // Another Backup Admin
  const result = canReviewDuesRequest({
    approverId: "backup-1",
    approverRoles: ["backup_admin"],
    targetMemberId: "backup-2",
    targetRoles: ["backup_admin"],
  });
  assert.equal(result.allowed, false);
  assert.match(
    result.reason,
    /Backup Admin dues payments can only be approved by an Admin or Executive/i,
  );
});

test("dues review: Admin CAN approve all users dues including Backup Admin", () => {
  // Ordinary member
  assert.equal(
    canReviewDuesRequest({
      approverId: "admin-1",
      approverRoles: ["admin"],
      targetMemberId: "member-1",
      targetRoles: [],
    }).allowed,
    true,
  );

  // Executive
  assert.equal(
    canReviewDuesRequest({
      approverId: "admin-1",
      approverRoles: ["admin"],
      targetMemberId: "exec-1",
      targetRoles: ["executive"],
    }).allowed,
    true,
  );

  // Backup Admin
  assert.equal(
    canReviewDuesRequest({
      approverId: "admin-1",
      approverRoles: ["admin"],
      targetMemberId: "backup-1",
      targetRoles: ["backup_admin"],
    }).allowed,
    true,
  );
});

test("formatCoveredMonthsDisplay formats single, multiple, and bounded ranges", () => {
  assert.equal(formatCoveredMonthsDisplay([]), "No months specified");
  assert.equal(formatCoveredMonthsDisplay(["2026-01-01"]), "Jan 2026");
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
