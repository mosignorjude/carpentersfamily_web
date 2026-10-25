# Event Notifications Deduplication and Admin Self-Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate event notifications ("Event alert" and "Event update") and ensure Admins/actors receive notifications for their own actions so the Home Page "Recent Member Activity" feed and notifications drawer accurately reflect their activity.

**Architecture:** 
1. In PostgreSQL migration, update `private.notify_from_audit_log()` so public event lifecycle events (`event_created`, `event_details_updated`, `event_completed`, `event_cancelled`, `event_reopened`, `event_archived`) trigger only the single canonical `fanout_member_notification('event_activity', ...)`, eliminating redundant `fanout_officer_notification('officer_event', ...)`.
2. In `private.fanout_member_notification()` and `private.fanout_officer_notification()`, remove the actor exclusion filter (`and profile.id is distinct from p_actor_id`) so all active members and officers—including the actor who performed the action—receive the notification in `public.notifications`.
3. In `private.notify_single_member()`, remove `p_recipient_id = p_actor_id` suppression to ensure target members always receive their notification even if self-assigned.
4. Add automated tests verifying single notification creation per event, actor notification inclusion, and Home Page activity feed presence.

**Tech Stack:** PostgreSQL (Supabase migrations, PL/pgSQL triggers, RLS), Next.js / TypeScript, Node.js test runner (`node:test`).

**Spec:** User request dated 2026-10-25:
- "creating an event created two alerts 'Event alert' and 'Event update'" -> Deduplicate to single alert.
- "The Admin didnt have the notice for in home page for the activitities or action created by them. Admin should receive notification of their own actions." -> Ensure Admins/actors receive notifications for their actions in their home page activity feed.

## Global Constraints

- Never commit deferred backup scripts (`scripts/backup-supabase.ps1`, `scripts/storage-backup.mjs`, `supabase/config.toml`, `tests/storage-backup-stream.test.mjs`).
- Preserve timezone consistency (`Africa/Lagos`).
- Ensure all notification inserts pass through `private.guard_notification_write()` security checks.
- Maintain deduplication keys format (`event-activity:<audit_id>`, `announcement:<entity_id>`, etc.).

## Review Focus

1. Verify officers do not receive duplicate notifications for event creation, editing, cancellation, completion, or reopening.
2. Verify officer-only role notifications (`event_role_assigned`, `event_role_granted`, `event_role_revoked`) continue to trigger `officer_event` ("Event alert") for officers.
3. Verify the actor (Admin or member) receives a notification record (`recipient_id = actor_id`) when creating events, announcements, polls, or financial transactions.
4. Verify the actor's Home Page "Recent Member Activity" feed displays their newly created event/action.
5. Verify `npm test` and Biome linter pass with zero regressions.

---

### Task 1: Database Migration for Notification Deduplication and Actor Ingestion

**Files:**
- Create: `supabase/migrations/20261025140000_event_notifications_dedup_and_actor_feed.sql`

- [x] **Step 1: Write migration `supabase/migrations/20261025140000_event_notifications_dedup_and_actor_feed.sql`**
  - Redefine `private.fanout_member_notification()` without `and profile.id is distinct from p_actor_id`.
  - Redefine `private.fanout_officer_notification()` without `and profile.id is distinct from p_actor_id`.
  - Redefine `private.notify_single_member()` removing `or p_recipient_id = p_actor_id`.
  - Redefine `private.notify_from_audit_log()`:
    - For `event_created`, `event_details_updated`, `event_completed`, `event_cancelled`, `event_reopened`, `event_archived`: remove `perform private.fanout_officer_notification('officer_event', ...)` and retain only `perform private.fanout_member_notification('event_activity', ...)`.
    - Retain `fanout_officer_notification('officer_event', ...)` strictly for `event_role_assigned`, `event_role_granted`, `event_role_revoked`.

- [x] **Step 2: Validate SQL syntax against existing migration patterns**
  - Verify function permissions (`revoke ... from public`, `grant execute ... to authenticated`).
  - Verify search paths (`set search_path = ''`).

---

### Task 2: Automated Tests for Notification Fanout and Home Page Activity Feed

**Files:**
- Create: `tests/event-notifications-dedup.test.mjs`
- Modify: `tests/notification-page-presentation.test.mjs` (if needed)

- [x] **Step 1: Write tests in `tests/event-notifications-dedup.test.mjs`**
  - Verify migration SQL contains the deduplicated event logic and removed actor exclusion.
  - Verify that `categoryLabels` in `src/lib/notification-page-presentation.mjs` correctly labels `event_activity` as `"Event update"`.
  - Verify that `getMemberActivity` query in `src/lib/home-dashboard.mjs` consumes `notifications` table for `recipient_id = memberId` and accurately reflects actor-received rows.

- [x] **Step 2: Run test suite**
  - Run `node --test tests/event-notifications-dedup.test.mjs` and ensure all assertions pass.
  - Run full test suite: `npm test`.

---

### Task 3: Linting & Code Verification

**Files:**
- Check: `src/` and `tests/`

- [x] **Step 1: Run linter and formatting check**
  - Run `npx @biomejs/biome check --write` on touched files.
- [x] **Step 2: Run full build and test suite**
  - Run `npm test` and `npm run build`.
