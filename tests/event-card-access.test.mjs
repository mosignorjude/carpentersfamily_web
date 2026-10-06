import assert from "node:assert/strict";
import test from "node:test";
import { getEventCardAccess } from "../src/lib/event-card-access.mjs";

function access({ roles = [], eventRoles = [], ...state } = {}) {
  return getEventCardAccess({
    roles: new Set(roles),
    eventRoles: new Set(eventRoles),
    status: "scheduled",
    archivedAt: null,
    ...state,
  });
}

test("ordinary members and committee members have no management controls", () => {
  for (const identity of [access(), access({ eventRoles: ["committee"] })]) {
    assert.equal(identity.isManager, false);
    assert.equal(identity.canEdit, false);
    assert.equal(identity.canSetStatus, false);
    assert.equal(identity.canSetBudget, false);
    assert.equal(identity.canReopen, false);
    assert.equal(identity.showBudgetEditor, false);
  }
});

test("event assistants can edit and set budgets but cannot change lifecycle state", () => {
  const assistant = access({ eventRoles: ["assistant"] });
  assert.equal(assistant.canEdit, true);
  assert.equal(assistant.canSetBudget, true);
  assert.equal(assistant.canSetStatus, false);
  assert.equal(assistant.canReopen, false);
  assert.equal(assistant.showBudgetEditor, true);
});

test("event leads can edit, set budgets, and change lifecycle state", () => {
  const lead = access({ eventRoles: ["lead"] });
  assert.equal(lead.canEdit, true);
  assert.equal(lead.canSetBudget, true);
  assert.equal(lead.canSetStatus, true);
  assert.equal(lead.canReopen, false);
});

test("executives keep manager capabilities but cannot reopen events", () => {
  const executive = access({ roles: ["executive"] });
  assert.equal(executive.isManager, true);
  assert.equal(executive.canEdit, true);
  assert.equal(executive.canSetStatus, true);
  assert.equal(executive.canSetBudget, true);
  assert.equal(executive.canReopen, false);
});

test("Admin and Backup Admin can reopen; both retain event manager capabilities", () => {
  for (const role of ["admin", "backup_admin"]) {
    const admin = access({ roles: [role] });
    assert.equal(admin.isManager, true);
    assert.equal(admin.canEdit, true);
    assert.equal(admin.canSetStatus, true);
    assert.equal(admin.canSetBudget, true);
    assert.equal(admin.canReopen, true);
  }
});

test("completed, cancelled, and retained events do not show mutable controls", () => {
  for (const state of [
    { status: "completed" },
    { status: "cancelled" },
    { archivedAt: "2026-10-01T00:00:00.000Z" },
    { archivedGroup: true },
  ]) {
    const admin = access({ roles: ["admin"], eventRoles: ["lead"], ...state });
    assert.equal(admin.mutable, false);
    assert.equal(admin.showBudgetEditor, false);
  }
});

test("budget read errors fail closed without changing other lead capabilities", () => {
  const lead = access({ eventRoles: ["lead"], budgetReadError: true });
  assert.equal(lead.canEdit, true);
  assert.equal(lead.canSetStatus, true);
  assert.equal(lead.canSetBudget, true);
  assert.equal(lead.showBudgetEditor, false);
});
