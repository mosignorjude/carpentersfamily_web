import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const [appSource, sqlSource, callbackSource, actionsSource] = await Promise.all([
  readFile(
    new URL("../src/lib/email/notifications.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/migrations/20261027000000_scalable_notification_outbox_and_reminders.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/actions.ts", import.meta.url), "utf8"),
]);

// Every trigger from the 26-trigger policy matrix in
// docs/notification_system_design.md. `app` markers must exist in the email
// service, `sql` markers in the reminder migration. Triggers 2 and 3 are
// delivered by Supabase Auth's custom SMTP and must never be queued in the
// outbox.
const TRIGGER_MATRIX = [
  {
    id: 1,
    name: "Welcome Email",
    app: ["triggerType: \"welcome\"", "welcomeKey(", "notifyWelcomeIfActive("],
    triggerTypes: ["welcome"],
  },
  {
    id: 2,
    name: "Email Confirmation",
    auth: true,
    forbiddenAppTypes: ["email_confirmation", "signup_confirmation"],
    callback: ["exchangeCodeForSession("],
    triggerTypes: [],
  },
  {
    id: 3,
    name: "Password Reset",
    auth: true,
    forbiddenAppTypes: ["password_reset", "password_recovery"],
    actions: ["resetPasswordForEmail("],
    triggerTypes: [],
  },
  {
    id: 4,
    name: "Role Upgrade",
    app: ["roleUpgradeKey(", "\"role_upgrade\""],
    triggerTypes: ["role_upgrade"],
  },
  {
    id: 5,
    name: "Account Suspension",
    app: ["accountSuspendedKey(", "\"account_suspended\""],
    triggerTypes: ["account_suspended"],
  },
  {
    id: 6,
    name: "Account Reactivation",
    app: ["accountReactivatedKey(", "\"account_reactivated\""],
    triggerTypes: ["account_reactivated"],
  },
  {
    id: 7,
    name: "Meeting Created",
    app: ["meetingCreatedKey(", "\"meeting_created\""],
    sql: ["array['24h_before', '2h_before']"],
    triggerTypes: ["meeting_created"],
  },
  {
    id: 8,
    name: "Meeting Meaningfully Changed",
    app: ["meetingChangedKey(", "\"meeting_changed\""],
    triggerTypes: ["meeting_changed"],
  },
  {
    id: 9,
    name: "Meeting Cancelled",
    app: ["meetingCancelledKey(", "\"meeting_cancelled\""],
    triggerTypes: ["meeting_cancelled"],
  },
  {
    id: 10,
    name: "Meeting Reminder — 24 Hours Before",
    sql: [
      "'meeting_reminder_'",
      "when '24h_before' then interval '24 hours'",
    ],
    triggerTypes: ["meeting_reminder_24h"],
  },
  {
    id: 11,
    name: "Meeting Reminder — 2 Hours Before",
    sql: ["'meeting_reminder_'", "when '2h_before' then interval '2 hours'"],
    triggerTypes: ["meeting_reminder_2h"],
  },
  {
    id: 12,
    name: "Announcement Published",
    app: ["announcementPublishedKey(", "\"announcement_published\""],
    triggerTypes: ["announcement_published"],
  },
  {
    id: 13,
    name: "Event Published",
    app: ["eventPublishedKey(", "\"event_published\""],
    sql: ["array['7d_before', '3d_before', '24h_before', '2h_before']"],
    triggerTypes: ["event_published"],
  },
  {
    id: 14,
    name: "Event Meaningfully Changed",
    app: ["eventChangedKey(", "\"event_changed\""],
    triggerTypes: ["event_changed"],
  },
  {
    id: 15,
    name: "Event Cancelled",
    app: ["eventCancelledKey(", "\"event_cancelled\""],
    triggerTypes: ["event_cancelled"],
  },
  {
    id: 16,
    name: "Event Reminder — 7 Days Before",
    sql: ["'event_reminder_'", "when '7d_before' then interval '7 days'"],
    triggerTypes: ["event_reminder_7d"],
  },
  {
    id: 17,
    name: "Event Reminder — 3 Days Before",
    sql: ["'event_reminder_'", "when '3d_before' then interval '3 days'"],
    triggerTypes: ["event_reminder_3d"],
  },
  {
    id: 18,
    name: "Event Reminder — 24 Hours Before",
    sql: ["'event_reminder_'", "when '24h_before' then interval '24 hours'"],
    triggerTypes: ["event_reminder_24h"],
  },
  {
    id: 19,
    name: "Event Reminder — 2 Hours Before",
    sql: ["'event_reminder_'", "when '2h_before' then interval '2 hours'"],
    triggerTypes: ["event_reminder_2h"],
  },
  {
    id: 20,
    name: "Dues Reminder (Upcoming)",
    sql: ["'dues_upcoming'", "v_trigger_type || ':period:' || v_reminder.cycle_key"],
    triggerTypes: ["dues_upcoming"],
  },
  {
    id: 21,
    name: "Dues Overdue Reminder (On Due Date)",
    sql: [
      "'dues_on_due_date'",
      "v_trigger_type || ':period:' || v_reminder.cycle_key",
    ],
    triggerTypes: ["dues_on_due_date"],
  },
  {
    id: 22,
    name: "Dues Overdue Reminder (Weekly Recurring)",
    sql: ["'dues_overdue_weekly'", "'dues_overdue_weekly:period:'"],
    triggerTypes: ["dues_overdue_weekly"],
  },
  {
    id: 23,
    name: "Payment Receipt Submitted",
    app: ["paymentReceiptSubmittedKey(", "\"payment_receipt_submitted\""],
    triggerTypes: ["payment_receipt_submitted"],
  },
  {
    id: 24,
    name: "Payment Approved",
    app: ["paymentApprovedKey(", "\"payment_approved\""],
    triggerTypes: ["payment_approved"],
  },
  {
    id: 25,
    name: "Payment Rejected",
    app: ["paymentRejectedKey(", "\"payment_rejected\""],
    triggerTypes: ["payment_rejected"],
  },
  {
    id: 26,
    name: "Membership / Role Request Decision",
    app: ["governanceDecisionKey(", "\"governance_decision\""],
    triggerTypes: ["governance_decision"],
  },
];

// In-app notifications that intentionally go beyond the 26-email policy.
const SUPPLEMENTAL_TRIGGER_TYPES = [
  "member_signup_alert",
  "signup_receipt",
  "club_role_changed",
  "password_updated",
  "dues_request_submitted",
  "event_role_assigned",
  "event_attendance_opened",
  "poll_created",
];

const SOURCES = { app: appSource, sql: sqlSource, callback: callbackSource, actions: actionsSource };

function appTriggerTypes(source) {
  const types = new Set();
  for (const match of source.matchAll(/triggerType:\s*([^,\n]+)/gu)) {
    for (const literal of match[1].matchAll(/"([a-z_]+)"/gu)) {
      types.add(literal[1]);
    }
  }
  return types;
}

function sqlTriggerTypes(source) {
  const types = new Set();
  for (const match of source.matchAll(/v_trigger_type := '([a-z_]+)'/gu)) {
    types.add(match[1]);
  }
  return types;
}

describe("26-trigger policy matrix", () => {
  it("documents exactly the 26 policy triggers once each", () => {
    assert.equal(TRIGGER_MATRIX.length, 26);
    assert.deepEqual(
      TRIGGER_MATRIX.map((trigger) => trigger.id),
      Array.from({ length: 26 }, (_, index) => index + 1),
    );
    assert.equal(
      new Set(TRIGGER_MATRIX.map((trigger) => trigger.name)).size,
      26,
    );
  });

  it("wires every outbox trigger to a deterministic code path", () => {
    for (const trigger of TRIGGER_MATRIX) {
      for (const sourceName of ["app", "sql", "callback", "actions"]) {
        const markers = trigger[sourceName] ?? [];
        for (const marker of markers) {
          assert.ok(
            SOURCES[sourceName].includes(marker),
            `Trigger ${trigger.id} (${trigger.name}) is missing ${sourceName} marker: ${marker}`,
          );
        }
      }
      if (trigger.auth) {
        for (const forbidden of trigger.forbiddenAppTypes ?? []) {
          assert.ok(
            !appSource.includes(`triggerType: "${forbidden}"`),
            `Trigger ${trigger.id} (${trigger.name}) must be delivered by Supabase Auth, not the outbox`,
          );
        }
      }
    }
  });

  it("keeps the database reminder prefixes and slots aligned with the matrix", () => {
    const sqlSlots = new Set([
      "7d_before",
      "3d_before",
      "24h_before",
      "2h_before",
      "dues_upcoming",
      "dues_on_due_date",
      "dues_weekly_overdue",
    ]);
    for (const slot of sqlSlots) {
      assert.ok(sqlSource.includes(`'${slot}'`), `reminder slot ${slot} is not declared`);
    }
    assert.ok(sqlSource.includes("replace(v_reminder.reminder_slot::text, '_before', '')"));
  });

  it("has no undocumented outbox trigger types", () => {
    const documented = new Set([
      ...TRIGGER_MATRIX.flatMap((trigger) => trigger.triggerTypes),
      ...SUPPLEMENTAL_TRIGGER_TYPES,
    ]);

    for (const triggerType of appTriggerTypes(appSource)) {
      assert.ok(
        documented.has(triggerType),
        `outbox trigger type "${triggerType}" is not documented in the matrix`,
      );
    }
    for (const triggerType of sqlTriggerTypes(sqlSource)) {
      assert.ok(
        documented.has(triggerType),
        `SQL trigger type "${triggerType}" is not documented in the matrix`,
      );
    }
  });
});
