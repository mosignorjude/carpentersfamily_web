import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getNotificationCategoryLabel,
  getNotificationHref,
  getNotificationReadLabel,
} from "../src/lib/notification-page-presentation.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261025140000_event_notifications_dedup_and_actor_feed.sql",
  import.meta.url,
);

test("migration file exists and eliminates duplicate event notifications", () => {
  const sql = readFileSync(migrationPath, "utf8");

  // 1. Verify actor exclusion filter is removed so actors receive notifications of their own actions
  assert.equal(
    sql.includes("profile.id is distinct from p_actor_id"),
    false,
    "Migration must not filter out p_actor_id in fanout functions",
  );
  assert.equal(
    sql.includes("or p_recipient_id = p_actor_id"),
    false,
    "notify_single_member must not filter out self-assigned targets",
  );

  // 2. Verify notify_from_audit_log only emits single member fanout for general event actions
  const eventActionSection = sql.slice(
    sql.indexOf("elsif new.action in ("),
    sql.indexOf("elsif new.action in ('event_role_assigned'"),
  );

  assert.ok(
    eventActionSection.includes("fanout_member_notification"),
    "Event lifecycle actions must trigger fanout_member_notification('event_activity')",
  );
  assert.equal(
    eventActionSection.includes("fanout_officer_notification"),
    false,
    "Event lifecycle actions must NOT trigger redundant fanout_officer_notification('officer_event')",
  );

  // 3. Verify officer-only role assignments still trigger officer_event
  const roleIdx = sql.indexOf("elsif new.action in ('event_role_assigned'");
  const memberLifecycleIdx = sql.indexOf(
    "elsif new.action in (\n    'member_approved'",
    roleIdx,
  );
  const roleActionSection = sql.slice(roleIdx, memberLifecycleIdx);
  assert.ok(
    roleActionSection.includes("fanout_officer_notification"),
    "Event role assignment actions must continue triggering fanout_officer_notification",
  );

  // 4. Verify duplicate cleanup and backfill blocks exist
  assert.ok(
    sql.includes("delete from public.notifications as n_officer"),
    "Migration must include cleanup for pre-existing duplicate officer_event notifications",
  );
  assert.ok(
    sql.includes("Backfill missing event_activity notifications for actors"),
    "Migration must include backfill for actors who previously missed notifications",
  );
});

test("category presentation maps event notifications cleanly", () => {
  assert.equal(getNotificationCategoryLabel("event_activity"), "Event update");
  assert.equal(getNotificationCategoryLabel("officer_event"), "Event alert");

  assert.equal(
    getNotificationHref({
      category: "event_activity",
      event_id: "evt-001",
    }),
    "/events#event-evt-001",
  );
  assert.equal(
    getNotificationHref({
      category: "officer_event",
      event_id: "evt-001",
    }),
    "/events#event-evt-001",
  );
});

test("home dashboard activity feed maps actor-received notifications correctly", () => {
  const actorNotification = {
    id: "notif-100",
    category: "event_activity",
    title: "New event: Annual Gala",
    body: "Annual Gala has been scheduled at Civic Center.",
    event_id: "evt-999",
    source_type: "event",
    source_id: "evt-999",
    created_at: "2026-10-25T12:00:00.000Z",
    read_at: null,
  };

  assert.equal(getNotificationReadLabel(actorNotification.read_at), "Unread");
  assert.equal(
    getNotificationCategoryLabel(actorNotification.category),
    "Event update",
  );
  assert.equal(getNotificationHref(actorNotification), "/events#event-evt-999");
});
