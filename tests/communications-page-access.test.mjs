import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getCommunicationsPageAccess,
  getPollSummaryPresentation,
} from "../src/lib/communications-page-access.mjs";

const activeEventIds = ["event-a", "event-b"];
const announcementsPage = readFileSync(
  new URL("../src/app/(member)/announcements/page.tsx", import.meta.url),
  "utf8",
);

function access({
  roles = [],
  eventLeadIds = [],
  roleLookupFailed = false,
} = {}) {
  return getCommunicationsPageAccess({
    roles,
    eventLeadIds,
    activeEventIds,
    roleLookupFailed,
  });
}

test("members, Committee, Assistant, and Backup Admin do not get publishing controls", () => {
  for (const role of ["member", "committee", "assistant", "backup_admin"]) {
    const permissions = access({ roles: [role] });
    assert.equal(permissions.canPublish, false, role);
    assert.equal(permissions.globalPublisher, false, role);
    assert.equal(permissions.canManageForEvent(null), false, role);
    assert.equal(permissions.canManageForEvent("event-a"), false, role);
  }
});

test("Admin and Executive can publish club-wide and to active events", () => {
  for (const role of ["admin", "executive"]) {
    const permissions = access({ roles: [role] });
    assert.equal(permissions.globalPublisher, true, role);
    assert.equal(permissions.canPublish, true, role);
    assert.deepEqual(permissions.publishEventIds, activeEventIds, role);
    assert.equal(permissions.canManageForEvent(null), true, role);
    assert.equal(permissions.canManageForEvent("event-b"), true, role);
    assert.equal(permissions.canManageForEvent("archived-event"), false, role);
  }
});

test("Admin and Executive retain club-wide publishing when no active events exist", () => {
  for (const role of ["admin", "executive"]) {
    const permissions = getCommunicationsPageAccess({ roles: [role] });
    assert.equal(permissions.canPublish, true, role);
    assert.equal(permissions.globalPublisher, true, role);
    assert.deepEqual(permissions.publishEventIds, [], role);
    assert.equal(permissions.canManageForEvent(null), true, role);
  }
});

test("an Event Lead can publish and manage only assigned active event updates", () => {
  const permissions = access({ eventLeadIds: ["event-a"] });
  assert.equal(permissions.canPublish, true);
  assert.equal(permissions.globalPublisher, false);
  assert.deepEqual(permissions.publishEventIds, ["event-a"]);
  assert.equal(permissions.canManageForEvent(null), false);
  assert.equal(permissions.canManageForEvent("event-a"), true);
  assert.equal(permissions.canManageForEvent("event-b"), false);
  assert.equal(permissions.canManageForEvent("archived-event"), false);
});

test("failed role lookup hides publishing and management controls", () => {
  const permissions = access({
    roles: ["admin"],
    eventLeadIds: ["event-a"],
    roleLookupFailed: true,
  });
  assert.equal(permissions.canPublish, false);
  assert.equal(permissions.globalPublisher, false);
  assert.deepEqual(permissions.publishEventIds, []);
  assert.equal(permissions.canManageForEvent(null), false);
  assert.equal(permissions.canManageForEvent("event-a"), false);
});

test("missing revision history suppresses edit controls without changing publishing", () => {
  const permissions = access({ roles: ["executive"] });
  assert.equal(permissions.canPublish, true);
  assert.equal(permissions.canManageForEvent("event-a", false), false);
  assert.equal(permissions.canManageForEvent("event-a", true), true);
});

test("poll summaries without database release approval expose no exact totals", () => {
  const hidden = getPollSummaryPresentation(
    [
      { has_voted: false, results_visible: false, votes: null },
      { has_voted: false, results_visible: false, votes: null },
    ],
    false,
  );
  assert.equal(hidden.state, "hidden");
  assert.equal(hidden.resultsVisible, false);
  assert.equal(hidden.totalVotes, null);
  assert.equal(hidden.hasVoted, false);
});

test("an open poll hides even an unexpectedly released aggregate", () => {
  const open = getPollSummaryPresentation(
    [
      { has_voted: false, results_visible: true, votes: 4 },
      { has_voted: false, results_visible: true, votes: 3 },
    ],
    false,
    true,
  );
  assert.equal(open.state, "hidden");
  assert.equal(open.resultsVisible, false);
  assert.equal(open.totalVotes, null);
});

test("the page privacy guard withholds an aggregate below five votes", () => {
  const belowThreshold = getPollSummaryPresentation(
    [
      { has_voted: false, results_visible: true, votes: 2 },
      { has_voted: false, results_visible: true, votes: 1 },
    ],
    false,
  );
  assert.equal(belowThreshold.state, "hidden");
  assert.equal(belowThreshold.resultsVisible, false);
  assert.equal(belowThreshold.totalVotes, null);
});

test("released poll summaries expose aggregate totals without a ballot identity", () => {
  const released = getPollSummaryPresentation(
    [
      { has_voted: true, results_visible: true, votes: 4 },
      { has_voted: true, results_visible: true, votes: 3 },
    ],
    false,
  );
  assert.equal(released.state, "released");
  assert.equal(released.resultsVisible, true);
  assert.equal(released.totalVotes, 7);
  assert.equal(released.hasVoted, true);
  assert.equal("member_id" in released, false);
  assert.equal("option_id" in released, false);
});

test("failed poll summary reads fail closed and do not indicate prior voting", () => {
  const unavailable = getPollSummaryPresentation(
    [{ has_voted: true, results_visible: true, votes: 9 }],
    true,
  );
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.resultsVisible, false);
  assert.equal(unavailable.totalVotes, null);
  assert.equal(unavailable.hasVoted, false);
});

test("member-authored communications stay in React text rendering", () => {
  assert.match(announcementsPage, /\{announcement\.message\}/);
  assert.match(announcementsPage, /\{poll\.question\}/);
  assert.match(announcementsPage, /\{option\.label\}/);
  assert.doesNotMatch(
    announcementsPage,
    /dangerouslySetInnerHTML|\binnerHTML\s*=/i,
  );
});
