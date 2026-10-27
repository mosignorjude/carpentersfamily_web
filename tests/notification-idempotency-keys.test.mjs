import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/notifications/idempotency.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const keys = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const USER_ID = "A1B2C3D4-0000-4000-8000-000000000001";
const REQUEST_ID = "B1B2C3D4-0000-4000-8000-000000000002";
const EVENT_ID = "C1B2C3D4-0000-4000-8000-000000000003";

const KEY_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,254}$/;

describe("deterministic notification idempotency keys", () => {
  it("builds account and security keys", () => {
    assert.equal(keys.welcomeKey(USER_ID), `welcome:user:${USER_ID.toLowerCase()}`);
    assert.equal(
      keys.roleUpgradeKey({
        userId: USER_ID,
        role: "Executive",
        occurredAt: new Date("2026-10-26T15:30:45.000Z"),
      }),
      `role_upgrade:user:${USER_ID.toLowerCase()}:role:executive:202610261530`,
    );
    assert.equal(
      keys.accountSuspendedKey({
        userId: USER_ID,
        auditId: "D1B2C3D4-0000-4000-8000-000000000004",
      }),
      `account_suspended:user:${USER_ID.toLowerCase()}:audit:d1b2c3d4-0000-4000-8000-000000000004`,
    );
    assert.equal(
      keys.accountReactivatedKey({
        userId: USER_ID,
        auditId: "D1B2C3D4-0000-4000-8000-000000000004",
      }),
      `account_reactivated:user:${USER_ID.toLowerCase()}:audit:d1b2c3d4-0000-4000-8000-000000000004`,
    );
  });

  it("builds payment and governance keys", () => {
    assert.equal(
      keys.paymentReceiptSubmittedKey({
        requestId: REQUEST_ID,
        userId: USER_ID,
      }),
      `payment_receipt_submitted:req:${REQUEST_ID.toLowerCase()}:user:${USER_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.paymentApprovedKey({ requestId: REQUEST_ID, userId: USER_ID }),
      `payment_approved:req:${REQUEST_ID.toLowerCase()}:user:${USER_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.paymentRejectedKey({ requestId: REQUEST_ID, userId: USER_ID }),
      `payment_rejected:req:${REQUEST_ID.toLowerCase()}:user:${USER_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.governanceDecisionKey({
        requestId: REQUEST_ID,
        status: "Approved",
        userId: USER_ID,
      }),
      `governance_decision:req:${REQUEST_ID.toLowerCase()}:status:approved:user:${USER_ID.toLowerCase()}`,
    );
  });

  it("builds broadcast group keys and mirrors the database recipient suffix", () => {
    assert.equal(
      keys.eventPublishedKey(EVENT_ID),
      `event_published:event:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.eventChangedKey(EVENT_ID, "ABCDEF1234"),
      `event_changed:event:${EVENT_ID.toLowerCase()}:rev:abcdef1234`,
    );
    assert.equal(
      keys.meetingCreatedKey(EVENT_ID),
      `meeting_created:meeting:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.announcementPublishedKey(EVENT_ID),
      `announcement_published:ann:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.broadcastRecipientKey(keys.eventPublishedKey(EVENT_ID), USER_ID),
      `event_published:event:${EVENT_ID.toLowerCase()}:recipient:${USER_ID.toLowerCase()}`,
    );
  });

  it("builds keys for cancellations, polls, assignments, and attendance", () => {
    assert.equal(
      keys.meetingChangedKey(EVENT_ID, "ABCDEF1234"),
      `meeting_changed:meeting:${EVENT_ID.toLowerCase()}:rev:abcdef1234`,
    );
    assert.equal(
      keys.meetingCancelledKey(EVENT_ID),
      `meeting_cancelled:meeting:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.eventCancelledKey(EVENT_ID),
      `event_cancelled:event:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.pollCreatedKey(EVENT_ID),
      `poll_created:poll:${EVENT_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.eventRoleAssignedKey({
        eventId: EVENT_ID,
        userId: USER_ID,
        role: "Event Lead",
      }),
      `event_role_assigned:event:${EVENT_ID.toLowerCase()}:user:${USER_ID.toLowerCase()}:role:event_lead`,
    );
    assert.equal(
      keys.attendanceOpenedKey(EVENT_ID),
      `event_attendance_opened:event:${EVENT_ID.toLowerCase()}`,
    );
  });

  it("keeps changed-event group keys inside the database length limit", () => {
    const fullHash = "a".repeat(64);
    for (const groupKey of [
      keys.eventChangedKey(EVENT_ID, fullHash),
      keys.meetingChangedKey(EVENT_ID, fullHash),
    ]) {
      assert.ok(groupKey.length <= 128, `${groupKey.length} chars`);
      const recipientKey = keys.broadcastRecipientKey(groupKey, USER_ID);
      assert.ok(recipientKey.length <= 255, `${recipientKey.length} chars`);
    }
    assert.match(
      keys.meetingChangedKey(EVENT_ID, fullHash),
      /:rev:[a-f0-9]{32}$/u,
    );
  });

  it("builds keys for role changes, officer alerts, and security notices", () => {
    assert.equal(
      keys.roleChangedKey({
        userId: USER_ID,
        role: "Backup Admin",
        occurredAt: new Date("2026-10-26T15:30:45.000Z"),
      }),
      `club_role_changed:user:${USER_ID.toLowerCase()}:role:backup_admin:202610261530`,
    );
    assert.equal(
      keys.passwordUpdatedKey({
        userId: USER_ID,
        occurredAt: new Date("2026-10-26T15:30:45.000Z"),
      }),
      `password_updated:user:${USER_ID.toLowerCase()}:202610261530`,
    );
    assert.equal(
      keys.signupReceiptKey(USER_ID),
      `signup_receipt:user:${USER_ID.toLowerCase()}`,
    );
    assert.equal(
      keys.duesRequestSubmittedKey({
        requestId: REQUEST_ID,
        officerEmail: "Officer@Example.ORG",
      }),
      `dues_request_submitted:req:${REQUEST_ID.toLowerCase()}:officer:officer_example_org`,
    );
    assert.equal(
      keys.memberSignupAlertKey({
        signupId: "New.Member@Example.ORG",
        officerEmail: "Officer@Example.ORG",
      }),
      "member_signup_alert:signup:new_member_example_org:officer:officer_example_org",
    );
  });

  it("produces keys valid for the outbox constraint", () => {
    const built = [
      keys.welcomeKey(USER_ID),
      keys.paymentApprovedKey({ requestId: REQUEST_ID, userId: USER_ID }),
      keys.eventCancelledKey(EVENT_ID),
      keys.meetingCancelledKey(EVENT_ID),
      keys.announcementPublishedKey(EVENT_ID),
      keys.pollCreatedKey(EVENT_ID),
      keys.eventRoleAssignedKey({
        eventId: EVENT_ID,
        userId: USER_ID,
        role: "Lead",
      }),
      keys.attendanceOpenedKey(EVENT_ID),
      keys.roleChangedKey({
        userId: USER_ID,
        role: "Executive",
        occurredAt: new Date("2026-10-26T15:30:45.000Z"),
      }),
      keys.passwordUpdatedKey({
        userId: USER_ID,
        occurredAt: new Date("2026-10-26T15:30:45.000Z"),
      }),
      keys.duesRequestSubmittedKey({
        requestId: REQUEST_ID,
        officerEmail: "Officer@Example.ORG",
      }),
      keys.memberSignupAlertKey({
        signupId: "New.Member@Example.ORG",
        officerEmail: "Officer@Example.ORG",
      }),
      keys.broadcastRecipientKey(keys.meetingCreatedKey(EVENT_ID), USER_ID),
    ];

    for (const key of built) {
      assert.match(key, KEY_PATTERN);
      assert.equal(key, key.toLowerCase());
    }
  });
});
