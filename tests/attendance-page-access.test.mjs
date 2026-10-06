import assert from "node:assert/strict";
import test from "node:test";
import { getAttendancePageAccess } from "../src/lib/attendance-page-access.mjs";

function access({ roles = [], eventRoles = [] } = {}) {
  return getAttendancePageAccess({
    roles: new Set(roles),
    eventRoles: new Set(eventRoles),
  });
}

test("ordinary members and Committee see only their own attendance", () => {
  for (const identity of [access(), access({ eventRoles: ["committee"] })]) {
    assert.equal(identity.canControl, false);
    assert.equal(identity.canWriteMinutes, false);
    assert.equal(identity.canReviewAttendance, false);
    assert.equal(identity.isOfficer, false);
  }
});

test("event Leads and Assistants review attendance for their assigned event", () => {
  for (const role of ["lead", "assistant"]) {
    const identity = access({ eventRoles: [role] });
    assert.equal(identity.canControl, false);
    assert.equal(identity.canWriteMinutes, false);
    assert.equal(identity.canReviewAttendance, true);
    assert.equal(identity.isOfficer, false);
  }
});

test("Backup Admin can review attendance and audit history, not control sessions or minutes", () => {
  const identity = access({ roles: ["backup_admin"] });
  assert.equal(identity.canControl, false);
  assert.equal(identity.canWriteMinutes, false);
  assert.equal(identity.canReviewAttendance, true);
  assert.equal(identity.isOfficer, true);
});

test("Executive and Admin can control sessions, write minutes, and review attendance", () => {
  for (const role of ["executive", "admin"]) {
    const identity = access({ roles: [role] });
    assert.equal(identity.canControl, true);
    assert.equal(identity.canWriteMinutes, true);
    assert.equal(identity.canReviewAttendance, true);
    assert.equal(identity.isOfficer, true);
  }
});

test("event-role access is scoped to the role set for the requested event", () => {
  const unrelatedEventLead = access({ eventRoles: [] });
  assert.equal(unrelatedEventLead.canReviewAttendance, false);
  assert.equal(unrelatedEventLead.canControl, false);
});
