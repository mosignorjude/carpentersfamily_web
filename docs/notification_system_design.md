# Carpenters Family Web — Scalable Notification System Design (v2.0)

> **Target Repository:** `carpentersfamily_web` (Next.js App Router + Supabase Postgres/Auth + Resend + Cloudflare R2)  
> **Current Scale:** ~15 active club members running on **Free Tiers** (Vercel Hobby, Supabase Free, Resend Free with a verified Custom Domain)  
> **Target Scale Architecture:** Engineered to handle **10,000+ users** without dropping messages, duplicating emails, or timing out serverless functions.  
> **Audience:** Written for a **Junior Developer** and your AI pair-programming agent (**Codex** or **Antigravity**). Every architectural concept is explained in plain English before diving into SQL and TypeScript.

---

## Table of Contents

1. [Junior Developer Orientation: How Notifications Actually Work](#1-junior-developer-orientation-how-notifications-actually-work)
2. [Read-Only Audit of the Current Notification System (`v1`)](#2-read-only-audit-of-the-current-notification-system-v1)
3. [How the Current System Behaves & Its 7 Core Flaws](#3-how-the-current-system-behaves--its-7-core-flaws)
4. [Comparison: Existing System (`v1`) vs. New Scalable System (`v2`)](#4-comparison-existing-system-v1-vs-new-scalable-system-v2)
5. [The Complete 26-Trigger Audit & Specification Matrix](#5-the-complete-26-trigger-audit--specification-matrix)
6. [Deep-Dive Architecture: Designing for 15 Users Today & 10,000 Users Tomorrow](#6-deep-dive-architecture-designing-for-15-users-today--10000-users-tomorrow)
7. [Database Schema & Migration Specification](#7-database-schema--migration-specification)
8. [Meaningful-Change Detection & Event Rescheduling State Machine](#8-meaningful-change-detection--event-rescheduling-state-machine)
9. [Backend Worker, Resend Batching & Rate-Limit Queueing](#9-backend-worker-resend-batching--rate-limit-queueing)
10. [Non-Code Setup Guide: Step-by-Step Dashboard Instructions](#10-non-code-setup-guide-step-by-step-dashboard-instructions)
11. [Junior Developer Checkpoints: Questions the Agent Must Ask You First](#11-junior-developer-checkpoints-questions-the-agent-must-ask-you-first)
12. [Local Browser Verification & Testing Playbook (Beyond Unit Tests)](#12-local-browser-verification--testing-playbook-beyond-unit-tests)
13. [System Limitations, Free-Tier Quotas & 10k Scaling Playbook](#13-system-limitations-free-tier-quotas--10k-scaling-playbook)

---

## 1. Junior Developer Orientation: How Notifications Actually Work

Before changing any code, let's build a clear mental model of **why** notification systems fail when apps grow—and how we prevent that.

### The Restaurant Analogy (Synchronous vs. Asynchronous)
Imagine an executive in Carpenters Family clicks **"Publish Announcement"** on the website:

* **The Naive Way (Synchronous / Inline):** The Next.js Server Action saves the announcement to Supabase, and *while the executive's browser is still spinning*, the server tries to contact Resend to send emails to every member.
  * *Why this works for 5 users:* Sending 5 emails takes ~1 second.
  * *Why this breaks at 100–10,000 users:* Vercel's Free (Hobby) tier kills any server request that takes longer than **10–60 seconds**. Even worse, Resend only allows **2 API requests per second** on default tiers. If you loop through 100 members, Resend blocks you at email #3 with a `429 Too Many Requests` error, and the remaining 97 members never get the email!
* **The Scalable Way (Transactional Outbox + Queue Worker):**
  1. When the executive clicks **"Publish Announcement"**, Postgres saves the announcement **and** writes a "delivery job" into a database table called `notification_outbox` in **under 50 milliseconds**. The executive immediately sees a green success message in their browser.
  2. In the background, a **Queue Worker** wakes up, grabs up to 100 pending emails at a time, and uses Resend's **`resend.batch.send()`** API (which sends 100 personalized emails in **1 single HTTP request**!).
  3. If Resend says *"You hit your rate limit or daily free-tier cap,"* the worker doesn't crash or throw away the emails. It marks those jobs as `paused_rate_limit` with a `next_attempt_at` timestamp and resumes sending them automatically when the limit resets.

---

## 2. Read-Only Audit of the Current Notification System (`v1`)

An inspection of your uploaded `carpentersfamily_web-main` repository reveals the following existing files that power notifications and emails today:

### 2.1 Existing Database Migrations (`supabase/migrations/`)
1. **`20261003103500_in_app_notifications.sql`**:
   * Created the initial in-app `notifications` table and helper functions to notify members inside the portal.
2. **`20261015020000_mark_all_notifications_read.sql`** & **`20261015040000_mark_notification_unread.sql`**:
   * Added RPCs for marking in-app notifications as read/unread.
3. **`20261024140000_notification_system_hardening.sql`**:
   * Hardened RLS policies and permission boundaries on in-app notifications.
4. **`20261024210000_detailed_notifications_and_deletion.sql`**:
   * Added richer notification metadata, soft/hard deletion support, and expanded in-app triggers for dues, finances, and governance actions.
5. **`20261025140000_event_notifications_dedup_and_actor_feed.sql`**:
   * Added deduplication keys and actor-feed awareness for event-related notifications (documented in `docs/superpowers/plans/2026-10-25-event-notifications-remediation.md`).

### 2.2 Existing Backend Email & Webhook Files (`src/`)
1. **`src/lib/email/config.ts`**:
   * Reads `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO_EMAIL`, and `RESEND_WEBHOOK_SECRET` from environment variables and validates configuration.
2. **`src/lib/email/client.ts`**:
   * Wraps the Resend SDK to send emails using React Email templates.
3. **`src/lib/email/notifications.ts`**:
   * Contains application-level helper functions called from Next.js Server Actions (`src/app/actions.ts`) to dispatch emails (primarily around event notifications and test emails).
4. **`src/lib/email/templates/`**:
   * `base-layout.tsx`: Shared Carpenters Family branded email wrapper with text branding and club colors.
   * `club-notification-email.tsx`: Generic notification email template with heading, body copy, and CTA button.
   * `test-verification-email.tsx`: Used by `scripts/send-test-email.mjs`.
5. **`src/app/api/webhooks/resend/route.ts`**:
   * Webhook endpoint created to receive delivery events from Resend.
6. **`src/app/actions.ts`**:
   * Central Server Actions file handling mutations for authentication/lifecycle, club roles, announcements, polls, meetings/attendance, events, event finances, club finances, and dues.

### 2.3 Existing Frontend Notification UI (`src/components/`)
1. **`src/components/notifications/notifications-drawer.tsx`** & **`src/app/(member)/notifications/page.tsx`**:
   * Displays the member's in-app notification feed with read/unread toggles and deletion actions.
2. **`src/components/home/personal-notifications-card.tsx`**:
   * Dashboard summary widget showing recent personal alerts.
3. **`src/lib/notification-sync.ts`** & **`src/lib/notification-page-presentation.mjs`**:
   * Client-side synchronization utilities (`CustomEvent` / router refresh) to keep the notification badge and drawer updated after user actions.

---

## 3. How the Current System Behaves & Its 7 Core Flaws

Right now, `carpentersfamily_web` has a **solid in-app notification foundation** for immediate database mutations, plus an **initial Resend integration** for immediate event emails. However, when evaluated against your **26-Trigger Email Policy (`Email triggers.docx`)** and your **10,000-user scalability requirement**, the current system has **7 critical architectural flaws**:

### Flaw 1: Inline Email Dispatch Inside Server Actions (`src/app/actions.ts`)
* **How it behaves now:** When a Server Action triggers an email via `src/lib/email/notifications.ts`, the email is dispatched during the HTTP request lifecycle of the user's form submission.
* **Why it's a flaw:** If Resend's API experiences a 3-second hiccup, or if the recipient list grows to hundreds of members, the Server Action slows down or times out. Worse, if the Resend call fails mid-loop, half your members get the email and half do not, with no automatic retry mechanism.

### Flaw 2: Zero Infrastructure for Scheduled / Time-Based Reminders (9 of Your 26 Triggers)
* **How it behaves now:** The codebase only reacts when a human clicks a button (an HTTP request). There is **no background scheduler** or **reminder state table**.
* **Why it's a flaw:** It is currently impossible to send:
  * Meeting reminders (**24h before**, **2h before**)
  * Event reminders (**7d before**, **3d before**, **24h before**, **2h before**)
  * Dues reminders (**Upcoming dues**, **On due date**, **Weekly overdue while unpaid**)

### Flaw 3: No Rescheduling State Machine or "Missed Window" Guard
* **How it behaves now:** Because there is no `notification_reminders` ledger tracking which reminder windows (`7d`, `3d`, `24h`, `2h`) have already been sent for a specific `event_id` or `meeting_id`, rescheduling an event cannot follow your policy rules.
* **Why it's a flaw:** Your policy strictly requires: *"Preserve the history of reminders already sent, reassess only unsent reminders after a schedule change, skip reminders whose scheduled time has passed, and never resend reminders already sent."* Without a state machine table, changing an event's start time by 30 minutes could either re-blast the 7-day and 3-day reminders to all members or send a "catch-up burst" of past-due reminders all at once.

### Flaw 4: No Rate-Limit Queueing ("Pause & Resume Later")
* **How it behaves now:** If `src/lib/email/client.ts` hits Resend's **2 requests/second** rate limit or the **100 emails/day** Free Tier quota, the API call returns an error and the email is lost.
* **Why it's a flaw:** Your policy explicitly requires: *"Queue emails when the Resend sending limit is reached and resume later."* Right now, with 15 active members, publishing 4 announcements and 3 event updates in a single day ($7 \times 15 = 105\text{ emails}$) will exceed Resend's 100/day Free Tier limit on the 7th broadcast, dropping the last 5 members' emails permanently unless they are queued in a persistent database outbox.

### Flaw 5: Missing Canonical "Meaningful Change" Fingerprinting
* **How it behaves now:** Updating a meeting or event needs to distinguish between fixing a minor typo in the description versus changing a critical field (**date, time, venue/location, or agenda**).
* **Why it's a flaw:** Without comparing the `OLD` vs. `NEW` canonical fields (date, start/end time, timezone, venue, agenda) before enqueueing an email, admins editing a spelling mistake will accidentally spam all active members with a "Meeting/Event Changed" email.

### Flaw 6: Incomplete Coverage of the 26-Trigger Policy
* **How it behaves now:** While in-app notifications exist for several governance actions and initial event emails were recently added, the majority of the 26 email triggers—specifically **Welcome email coordinated with email confirmation**, **Role upgrade email**, **Account suspension/reactivation emails**, **Meeting created/changed/cancelled emails**, **Announcement published permission-gated email**, and **Dues receipt submitted / approved / rejected emails**—are not unified under a single idempotent email outbox pipeline.

### Flaw 7: Unbatched Fan-Out Cannot Scale to 10,000 Users
* **How it behaves now:** Sending individual emails in a loop (`resend.emails.send`) requires $10,000$ separate HTTP requests for $10,000$ members. At $2\text{ requests/second}$, that takes $5,000\text{ seconds}$ ($\approx 83\text{ minutes}$!).
* **Why it's a flaw:** By switching to Resend's **`resend.batch.send()`** (up to 100 emails per HTTP request) backed by a cursor-paginated database outbox, $10,000$ emails require only **100 HTTP requests** ($\approx 50\text{ seconds}$ total across background worker ticks).

---

## 4. Comparison: Existing System (`v1`) vs. New Scalable System (`v2`)

| Feature / Dimension | Existing System (`v1` in Repo) | New Scalable System (`v2` in This Design) | Why This Improvement Matters to You |
|---|---|---|---|
| **Email Dispatch Pattern** | Inline inside Next.js Server Actions (`src/lib/email/notifications.ts`) | **Transactional Outbox Pattern** (`public.notification_outbox`) + Background Worker | Button clicks in the portal never lag or fail even if Resend is down or rate-limited. |
| **Trigger Coverage** | Partial (mainly in-app + initial event alerts) | **All 26 Policy Triggers** (Auth, Meetings, Announcements, Events, Dues/Payments) | Complete alignment with `Email triggers.docx`. |
| **Time-Based Reminders** | None | **Timezone-Aware Reminder Engine** (`public.notification_reminders` + Cron) | Automatically handles 7d, 3d, 24h, 2h, due-date, and weekly overdue reminders in the event's configured timezone. |
| **Event/Meeting Rescheduling** | No reminder history tracking | **Stateful Reminder Ledger** (preserves `sent`, recalculates `pending`, marks past windows `skipped_past_due`) | Prevents embarrassing catch-up bursts or duplicate reminder emails when an event time is edited. |
| **Meaningful Change Detection** | Manual / partial | **Deterministic Field Diffing** (`date`, `time`, `venue`, `agenda` hash comparison) | Fixing a typo won't spam the club; changing the venue or start time will immediately alert everyone. |
| **Resend Rate Limit & Quota Handling** | Fails if rate limit (2 req/s) or daily limit (100/day) is hit | **Smart Outbox Throttling & Pause-on-Quota** (`status = 'paused_rate_limit'`, auto-resumes later) | Protects your Free Tier today (15 users) and scales smoothly to 10,000+ users without losing a single email. |
| **10,000-User Broadcast Strategy** | 1-by-1 email calls | **Chunked `resend.batch.send()`** (100 personalized emails per API call + `Idempotency-Key`) | Cuts API calls by **99%** (100 requests instead of 10,000) and guarantees zero duplicate deliveries on retry. |
| **In-App Live Updates** | Custom client sync (`notification-sync.ts`) on local mutation | **Supabase Realtime (`postgres_changes`)** + existing `notification-sync.ts` fallback | Members see live unread bell updates the second another officer approves their dues or posts an announcement. |

---

## 5. The Complete 26-Trigger Audit & Specification Matrix

Below is the authoritative mapping of all **26 triggers** from your `Email triggers.docx` policy (broken down into every distinct event and reminder window), showing how each one must be implemented, who receives it, and the exact **Idempotency Key** formula used to guarantee no member ever receives a duplicate email.

### Group 1: Authentication & Account Triggers (Triggers 1–6)

| # | Trigger Name | Current Status in Repo | Target Recipients | Delivery Mechanism | Deterministic Idempotency Key | Special Rules & Notes |
|---|---|---|---|---|---|---|
| **1** | **Welcome Email** | Missing | Affected Member | Outbox -> `resend.emails.send` | `welcome:user:{user_id}` | Triggered **only once** when `email_confirmed_at` transitions from `NULL` to `NOT NULL` (or first verified login in `/auth/callback`) so it **never** duplicates the confirmation email. |
| **2** | **Email Confirmation** | Handled by Supabase Auth | Registering Member | **Supabase Auth via Resend Custom SMTP** | Managed by Supabase Auth | Configured in Supabase Dashboard -> Auth -> SMTP using Resend credentials so confirmation emails come from your custom domain. |
| **3** | **Password Reset** | Handled by Supabase Auth (`/forgot-password`) | Requesting Member | **Supabase Auth via Resend Custom SMTP** | Managed by Supabase Auth | Triggered by `supabase.auth.resetPasswordForEmail` and completed on `/reset-password`. |
| **4** | **Role Upgrade** | In-App Only (`20261012170000`) | Affected Member | Outbox -> `resend.emails.send` | `role_upgrade:user:{user_id}:role:{new_role}:{timestamp_minute}` | Fires only when a member's club role or executive role is **upgraded** (e.g., `member` -> `executive` or `admin`, or assigned an Event Lead/Team role). |
| **5** | **Account Suspension** | In-App / DB Lifecycle (`lifecycle-form.tsx`) | Affected Member | Outbox -> `resend.emails.send` | `account_suspended:user:{user_id}:audit:{audit_id}` | Fires when member lifecycle status changes to `suspended`. Includes reason (if provided) and contact instructions. |
| **6** | **Account Reactivation** | In-App / DB Lifecycle (`lifecycle-form.tsx`) | Affected Member | Outbox -> `resend.emails.send` | `account_reactivated:user:{user_id}:audit:{audit_id}` | Fires when a `suspended` member is restored to `active` status. |

### Group 2: Meeting Triggers (Triggers 7–11)

| # | Trigger Name | Current Status in Repo | Target Recipients | Delivery Mechanism | Deterministic Idempotency Key | Special Rules & Notes |
|---|---|---|---|---|---|---|
| **7** | **Meeting Created** | Partial (In-App only) | All Active Members | Outbox -> `resend.batch.send` | `meeting_created:meeting:{meeting_id}:recipient:{user_id}` | Also seeds 2 rows in `notification_reminders` (`24h`, `2h`). |
| **8** | **Meeting Meaningfully Changed** | Missing | All Active Members | Outbox -> `resend.batch.send` | `meeting_changed:meeting:{meeting_id}:rev:{change_hash}:recipient:{user_id}` | **Only** fires if `meeting_date`, `start_time`, `venue`, or `agenda` changes. Typo fixes do **not** fire emails. Re-evaluates unsent reminders. |
| **9** | **Meeting Cancelled** | Missing / Partial | All Active Members | Outbox -> `resend.batch.send` | `meeting_cancelled:meeting:{meeting_id}:recipient:{user_id}` | Immediately marks all `pending` reminders for this meeting as `cancelled`. |
| **10** | **Meeting Reminder — 24 Hours Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `meeting_reminder_24h:meeting:{meeting_id}:recipient:{user_id}` | Evaluated in configured meeting timezone. Skipped if created/rescheduled $< 24\text{h}$ before start. |
| **11** | **Meeting Reminder — 2 Hours Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `meeting_reminder_2h:meeting:{meeting_id}:recipient:{user_id}` | Evaluated in configured meeting timezone. Skipped if scheduled time already passed. |

### Group 3: Announcement Triggers (Trigger 12)

| # | Trigger Name | Current Status in Repo | Target Recipients | Delivery Mechanism | Deterministic Idempotency Key | Special Rules & Notes |
|---|---|---|---|---|---|---|
| **12** | **Announcement Published** | In-App Exists (`20261003103200`) | All Active Members | Outbox -> `resend.batch.send` | `announcement_published:ann:{announcement_id}:recipient:{user_id}` | **Strict Permission Gate:** Only users with explicit announcement publish permission (`admin` / authorized `executive`) can trigger emails. Draft saves and minor edits **never** trigger emails. |

### Group 4: Event Triggers (Triggers 13–19)

| # | Trigger Name | Current Status in Repo | Target Recipients | Delivery Mechanism | Deterministic Idempotency Key | Special Rules & Notes |
|---|---|---|---|---|---|---|
| **13** | **Event Published** | Partial (`20261025140000`) | All Active Members | Outbox -> `resend.batch.send` | `event_published:event:{event_id}:recipient:{user_id}` | Fires when event transitions to published/active. Seeds 4 reminder slots (`7d`, `3d`, `24h`, `2h`) in `notification_reminders`. |
| **14** | **Event Meaningfully Changed** | Partial (`20261025140000`) | All Active Members | Outbox -> `resend.batch.send` | `event_changed:event:{event_id}:rev:{change_hash}:recipient:{user_id}` | Fires **only** when event date, start/end time, timezone, venue/location, or core schedule changes. Triggers the **Event Rescheduling State Machine**. |
| **15** | **Event Cancelled** | Partial (`20261025140000`) | All Active Members | Outbox -> `resend.batch.send` | `event_cancelled:event:{event_id}:recipient:{user_id}` | Marks all unsent reminders (`7d`, `3d`, `24h`, `2h`) as `cancelled`. |
| **16** | **Event Reminder — 7 Days Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `event_reminder_7d:event:{event_id}:recipient:{user_id}` | Evaluated in event timezone. Never resent if event is rescheduled after being sent. |
| **17** | **Event Reminder — 3 Days Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `event_reminder_3d:event:{event_id}:recipient:{user_id}` | Evaluated in event timezone. Skipped if event is rescheduled to $< 3\text{ days}$ away. |
| **18** | **Event Reminder — 24 Hours Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `event_reminder_24h:event:{event_id}:recipient:{user_id}` | Evaluated in event timezone. |
| **19** | **Event Reminder — 2 Hours Before** | Missing | All Active Members | Cron -> Outbox -> `resend.batch.send` | `event_reminder_2h:event:{event_id}:recipient:{user_id}` | Evaluated in event timezone. |

### Group 5: Dues & Payment Triggers (Triggers 20–26)

| # | Trigger Name | Current Status in Repo | Target Recipients | Delivery Mechanism | Deterministic Idempotency Key | Special Rules & Notes |
|---|---|---|---|---|---|---|
| **20** | **Dues Reminder (Upcoming)** | Missing (In-App schedule exists) | Affected Unpaid Active Members | Cron -> Outbox -> `resend.batch.send` | `dues_upcoming:period:{dues_period_key}:user:{user_id}` | Follows existing database dues schedule rule (e.g., 7 days before due date for members who have not yet paid that period). |
| **21** | **Dues Overdue Reminder (On Due Date)** | Missing | Affected Unpaid Member | Cron -> Outbox -> `resend.batch.send` | `dues_on_due_date:period:{dues_period_key}:user:{user_id}` | Sent on the exact applicable due date if the member's dues for that period remain unpaid. |
| **22** | **Dues Overdue Reminder (Weekly Recurring)** | Missing | Affected Unpaid Member | Cron -> Outbox -> `resend.batch.send` | `dues_overdue_weekly:period:{dues_period_key}:week:{iso_year_week}:user:{user_id}` | Sent once per week (keyed by ISO week `YYYY-IW`) while the dues remain unpaid. Stops immediately once paid or approved. |
| **23** | **Payment Receipt Submitted** | In-App Only (`20261017230000`) | Submitting Member | Outbox -> `resend.emails.send` | `payment_receipt_submitted:req:{request_id}:user:{user_id}` | Confirms to the member that their dues/payment receipt was uploaded and is awaiting officer verification. |
| **24** | **Payment Approved** | In-App Only (`20261017230000`) | Affected Member | Outbox -> `resend.emails.send` | `payment_approved:req:{request_id}:user:{user_id}` | Notifies the member that their payment request was approved and recorded on the ledger. |
| **25** | **Payment Rejected** | In-App Only (`20261017230000`) | Affected Member | Outbox -> `resend.emails.send` | `payment_rejected:req:{request_id}:user:{user_id}` | Notifies the member that their payment receipt was rejected, including the officer's rejection reason so they can resubmit. |
| **26** | **Membership / Role Request Decision (Governance Completion)** | Partial (`20261013035611`) | Affected Member + Officers | Outbox -> `resend.emails.send` | `governance_decision:req:{request_id}:status:{status}:user:{user_id}` | Completes the 26-trigger policy suite by ensuring initial membership approval/rejection and officer dues-verification alerts are tracked idempotently. |

---

## 6. Deep-Dive Architecture: Designing for 15 Users Today & 10,000 Users Tomorrow

### Why We Use a Database-Backed Outbox Instead of Paid Third-Party Queues
Since you are currently running on **Free Tiers** for 15 users, we do **not** want to force you to pay for external Redis clusters or enterprise message brokers. However, you also want the code to handle **10,000+ users** when you grow.

We achieve both by building a **Postgres Transactional Outbox + Batch Worker** right inside your existing **Supabase + Next.js** stack:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   1. EVENT & REMINDER INGESTION LAYER                      │
│                                                                            │
│  ┌──────────────────────────┐        ┌──────────────────────────────────┐  │
│  │ Next.js Server Actions   │        │ Timezone Reminder Evaluator      │  │
│  │ (Role, Dues, Event, Mtg, │        │ (/api/internal/notifications/    │  │
│  │  Announcement mutations) │        │  evaluate-reminders via Cron)    │  │
│  └────────────┬─────────────┘        └─────────────────┬────────────────┘  │
└───────────────┼────────────────────────────────────────┼───────────────────┘
                │ Atomic SQL Transaction                 │ Claims due slots &
                ▼                                        ▼ skips past windows
┌────────────────────────────────────────────────────────────────────────────┐
│                   2. SUPABASE POSTGRES PERSISTENCE LAYER                   │
│                                                                            │
│  ┌──────────────────────────┐  ┌─────────────────────┐  ┌───────────────┐  │
│  │ public.notifications     │  │ public.notification │  │ public.notif_ │  │
│  │ (In-App Inbox & Realtime │  │ _reminders          │  │ outbox        │  │
│  │  WebSocket Broadcast)    │  │ (7d/3d/24h/2h/dues  │  │ (Idempotent   │  │
│  │                          │  │  state machine)     │  │  Email Queue) │  │
│  └──────────────────────────┘  └─────────────────────┘  └───────┬───────┘  │
└─────────────────────────────────────────────────────────────────┼──────────┘
                                                                  │
                                   FOR UPDATE SKIP LOCKED         │
                                   (Claims up to 500 rows/tick)   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   3. STATELESS BATCH DISPATCH WORKER                       │
│              (/api/internal/notifications/process-outbox)                  │
│                                                                            │
│  • Groups broadcast emails into chunks of 100 for `resend.batch.send()`    │
│  • Attaches deterministic `Idempotency-Key` header to every Resend call    │
│  • Paces requests at 1.5 req/sec (under Resend's 2 req/sec limit)          │
│  • On HTTP 429 (Rate Limit / Daily Free Cap): pauses remaining jobs with   │
│    `status = 'paused_rate_limit'` and `next_attempt_at` (ZERO emails lost) │
└─────────────────────────────────────────────────────────────────┬──────────┘
                                                                  │
                                                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   4. RESEND API & SVIX WEBHOOK LOOP                        │
│                                                                            │
│  Resend Delivers Emails ──► Posts `email.delivered` / `email.bounced` ──►  │
│  `/api/webhooks/resend` ──► Updates `public.notification_outbox` status    │
└────────────────────────────────────────────────────────────────────────────┘
```

### How the Math Works at 15 Users vs. 10,000 Users
* **At 15 Users (Today on Free Tiers):**
  * Publishing an announcement inserts **15 rows** into `public.notification_outbox`.
  * The worker immediately sends all 15 emails in **1 single `resend.batch.send()` API call** (taking ~250ms).
  * If you publish 7 broadcasts in one day ($7 \times 15 = 105\text{ emails}$) and hit Resend's 100-email/day Free Tier cap, the remaining 5 rows are automatically marked `paused_rate_limit` with `next_attempt_at = tomorrow 00:05 UTC` and delivered automatically the next morning!
* **At 10,000 Users (Future Scale):**
  * Instead of looping 10,000 times in JavaScript (which crashes Node.js memory), a single SQL `INSERT INTO public.notification_outbox SELECT ... FROM public.profiles WHERE is_active = true` inserts 10,000 rows inside Postgres in **~120ms**.
  * The Outbox Worker claims **500 rows per run** (5 batches of 100 emails via `resend.batch.send()`), paced at 600ms between calls (~3 seconds per worker run).
  * Over 20 worker runs (e.g., 1 run per minute via `pg_cron`), all 10,000 users receive their personalized email without ever exceeding Resend's 2 req/sec limit or Vercel's function timeout.

---

## 7. Database Schema & Migration Specification

Create a new migration file: `supabase/migrations/20261027000000_scalable_notification_outbox_and_reminders.sql`.

### 7.1 `public.notification_outbox` (The Idempotent Email Queue)
```sql
CREATE TYPE public.notification_outbox_status AS ENUM (
    'pending',
    'processing',
    'sent',
    'delivered',
    'paused_rate_limit',
    'failed_permanent',
    'cancelled',
    'skipped'
);

CREATE TABLE public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    trigger_type VARCHAR(64) NOT NULL, -- Maps 1-to-1 with the 26 triggers
    recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    
    -- Email Payload (rendered via React Email in worker)
    subject TEXT NOT NULL,
    heading TEXT NOT NULL,
    body_text TEXT NOT NULL,
    cta_label TEXT,
    cta_url TEXT,
    template_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Group key allows batching up to 100 emails per resend.batch.send() call
    batch_group_key VARCHAR(128),
    
    -- Delivery & Retry State Machine
    status public.notification_outbox_status NOT NULL DEFAULT 'pending',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ,
    resend_email_id TEXT,
    last_error TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- High-throughput index for worker claiming with FOR UPDATE SKIP LOCKED
CREATE INDEX idx_notification_outbox_claimable
ON public.notification_outbox (next_attempt_at ASC, batch_group_key)
WHERE status IN ('pending', 'paused_rate_limit');

CREATE INDEX idx_notification_outbox_resend_id
ON public.notification_outbox (resend_email_id)
WHERE resend_email_id IS NOT NULL;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- Zero client-side access: only service_role / SECURITY DEFINER functions can access outbox
```

### 7.2 `public.notification_reminders` (Stateful Reminder & Rescheduling Ledger)
This table is the brain that enforces your **Meeting, Event, and Dues Reminder rules** and your **Event Rescheduling rules**:

```sql
CREATE TYPE public.reminder_entity_type AS ENUM ('meeting', 'event', 'dues_period');
CREATE TYPE public.reminder_slot_type AS ENUM (
    '7d_before',
    '3d_before',
    '24h_before',
    '2h_before',
    'dues_upcoming',
    'dues_on_due_date',
    'dues_weekly_overdue'
);
CREATE TYPE public.reminder_state AS ENUM (
    'pending',
    'dispatched',
    'skipped_past_due',
    'cancelled'
);

CREATE TABLE public.notification_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type public.reminder_entity_type NOT NULL,
    entity_id UUID NOT NULL, -- meeting.id, event.id, or dues schedule id
    reminder_slot public.reminder_slot_type NOT NULL,
    
    -- For weekly overdue dues, week_bucket stores '2026-W44'; for one-time slots, 'ONCE'
    cycle_key VARCHAR(32) NOT NULL DEFAULT 'ONCE',
    
    -- Configured timezone of the event/meeting (defaulting to 'Africa/Lagos')
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Lagos',
    target_occurrence_at TIMESTAMPTZ NOT NULL, -- When the meeting/event starts
    scheduled_for TIMESTAMPTZ NOT NULL,        -- Exact UTC timestamp when reminder should fire
    
    state public.reminder_state NOT NULL DEFAULT 'pending',
    dispatched_at TIMESTAMPTZ,
    skip_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (entity_type, entity_id, reminder_slot, cycle_key)
);

CREATE INDEX idx_notification_reminders_due
ON public.notification_reminders (scheduled_for ASC)
WHERE state = 'pending';

ALTER TABLE public.notification_reminders ENABLE ROW LEVEL SECURITY;
```

### 7.3 Helper SQL Function: Atomic Outbox Enqueue with Conflict Ignore
```sql
CREATE OR REPLACE FUNCTION public.enqueue_notification_email(
    p_idempotency_key VARCHAR(255),
    p_trigger_type VARCHAR(64),
    p_recipient_user_id UUID,
    p_recipient_email TEXT,
    p_recipient_name TEXT,
    p_subject TEXT,
    p_heading TEXT,
    p_body_text TEXT,
    p_cta_label TEXT DEFAULT NULL,
    p_cta_url TEXT DEFAULT NULL,
    p_batch_group_key VARCHAR(128) DEFAULT NULL,
    p_template_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_outbox_id UUID;
BEGIN
    IF p_recipient_email IS NULL OR btrim(p_recipient_email) = '' THEN
        RETURN NULL;
    END IF;

    INSERT INTO public.notification_outbox (
        idempotency_key,
        trigger_type,
        recipient_user_id,
        recipient_email,
        recipient_name,
        subject,
        heading,
        body_text,
        cta_label,
        cta_url,
        batch_group_key,
        template_payload
    )
    VALUES (
        p_idempotency_key,
        p_trigger_type,
        p_recipient_user_id,
        lower(btrim(p_recipient_email)),
        p_recipient_name,
        p_subject,
        p_heading,
        p_body_text,
        p_cta_label,
        p_cta_url,
        p_batch_group_key,
        p_template_payload
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_outbox_id;

    RETURN v_outbox_id;
END;
$$;
```

---

## 8. Meaningful-Change Detection & Event Rescheduling State Machine

Your policy specifies two critical behavioral rules that trip up most developers. Here is how we implement them deterministically.

### 8.1 Rule A: What Counts as a "Meaningful Change" (Meetings & Events)
When an admin or event lead edits a Meeting or Event, we **must not** email all active members if they only fixed a typo or tweaked internal budget settings.

We compute a **Canonical Meaningful Fingerprint**:
* **For Meetings:**
  $$\text{Fingerprint}_{\text{meeting}} = \text{SHA256}\left(\text{date} \parallel \text{start\_time} \parallel \text{end\_time} \parallel \text{venue} \parallel \text{btrim(agenda)}\right)$$
* **For Events:**
  $$\text{Fingerprint}_{\text{event}} = \text{SHA256}\left(\text{starts\_at} \parallel \text{ends\_at} \parallel \text{timezone} \parallel \text{btrim(location)} \parallel \text{btrim(title)}\right)$$

**How it works:**
1. Before saving an update to a published meeting or event, compare the old fingerprint to the new fingerprint.
2. If $\text{Fingerprint}_{\text{old}} = \text{Fingerprint}_{\text{new}}$, save the edit normally and **do not enqueue any email**.
3. If $\text{Fingerprint}_{\text{old}} \neq \text{Fingerprint}_{\text{new}}$, enqueue the `meeting_changed` or `event_changed` email keyed by the new `change_hash`, including a human-readable summary of what changed (e.g., *"Date moved from Nov 12 to Nov 19; Venue updated to Main Hall"*).

### 8.2 Rule B: The Event & Meeting Rescheduling State Machine
Your policy states:
> *"Event rescheduling rules: preserve the history of reminders already sent, reassess only unsent reminders after a schedule change, skip reminders whose scheduled time has passed, and never resend reminders already sent."*

Here is the exact SQL/TypeScript algorithm executed whenever an Event's `starts_at` (or Meeting's `meeting_date`/`start_time`) is created or updated:

1. **Calculate the 4 Reminder Timestamps** relative to the new `starts_at` (in the event's configured `timezone`):
   * `7d_before` = `new_starts_at - INTERVAL '7 days'`
   * `3d_before` = `new_starts_at - INTERVAL '3 days'`
   * `24h_before` = `new_starts_at - INTERVAL '24 hours'`
   * `2h_before` = `new_starts_at - INTERVAL '2 hours'`
2. **Loop through each slot (`7d_before`, `3d_before`, `24h_before`, `2h_before`):**
   * **Case 1: Existing row has `state = 'dispatched'`**
     * **Action:** **DO NOTHING.** Preserve `dispatched_at` history and **never** reset it to `pending`. Even if the event was pushed back 2 weeks so the new 7-day mark is in the future, the 7-day reminder was *already sent* and must never be resent.
   * **Case 2: Existing row has `state IN ('pending', 'skipped_past_due')` (or does not exist yet)**
     * Compare the newly calculated `scheduled_for` timestamp against `NOW()`:
     * **If `new_scheduled_for <= NOW()`:** The window for this reminder has already passed! Set `state = 'skipped_past_due'`, `skip_reason = 'Scheduled time already passed at creation/reschedule'`. **Never send a catch-up burst.**
     * **If `new_scheduled_for > NOW()`:** Set `state = 'pending'` and `scheduled_for = new_scheduled_for`.

### 8.3 Rule C: Skipping Missed Reminders During Cron Downtime (Grace Horizon)
What happens if your cron job is delayed by 3 hours and wakes up 10 minutes *after* an event has already started?
* Every reminder slot has a **Grace Horizon**:
  * For `7d_before`, `3d_before`, and `24h_before`: Valid only if `NOW() >= scheduled_for` **AND** `NOW() <= scheduled_for + INTERVAL '6 hours'` **AND** `NOW() < target_occurrence_at - INTERVAL '2 hours'`.
  * For `2h_before`: Valid only if `NOW() >= scheduled_for` **AND** `NOW() < target_occurrence_at - INTERVAL '15 minutes'`.
* If `NOW()` is past the Grace Horizon when the evaluator runs, the evaluator marks the slot `state = 'skipped_past_due'` (`skip_reason = 'Missed grace horizon; suppressed catch-up burst'`) and does **not** send late emails.

---

## 9. Backend Worker, Resend Batching & Rate-Limit Queueing

### 9.1 How the Outbox Worker Processes Jobs (`/api/internal/notifications/process-outbox/route.ts`)
1. **Authentication:** Verifies `Authorization: Bearer ${process.env.CRON_SECRET}`.
2. **Claiming Jobs Atomically:**
   Uses a Postgres RPC `claim_notification_outbox_jobs(p_limit := 200)` with `FOR UPDATE SKIP LOCKED` to claim rows where `status IN ('pending', 'paused_rate_limit') AND next_attempt_at <= NOW()`.
3. **Grouping into Single vs. Batch Calls:**
   * Rows sharing a `batch_group_key` (e.g., `ann:123` or `event_published:456`) are chunked into arrays of **up to 100 emails** and dispatched via **`resend.batch.send(chunk, { idempotencyKey })`**.
   * Individual transactional rows (e.g., `payment_approved`, `role_upgrade`) are either grouped into a multi-message `resend.batch.send()` batch or sent via `resend.emails.send(..., { idempotencyKey })`.
4. **Pacing Under Resend's 2 req/sec Limit:**
   * After each Resend API call, the worker waits `600ms` (`await new Promise(r => setTimeout(r, 600))`) so it never exceeds 1.6 requests/second.
5. **Handling Rate Limits & Daily Quotas (`429 Too Many Requests`):**
   * Resend returns HTTP `429` with an error `name` of either:
     * `rate_limit_exceeded` (per-second limit hit): Set `status = 'paused_rate_limit'` and `next_attempt_at = NOW() + INTERVAL '1 minute'`.
     * `daily_quota_exceeded` or `monthly_quota_exceeded` (Free Tier 100/day or 3,000/month cap hit): Set `status = 'paused_rate_limit'` and `next_attempt_at = date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 day 5 minutes'`.
   * The worker immediately stops making further Resend calls for this tick and returns a clean `200 OK` summary (`{ sent, pausedForQuota }`) so queued emails sit safely in Postgres until the quota resets.

---

## 10. Non-Code Setup Guide: Step-by-Step Dashboard Instructions

> **Junior Developer Note:** Code alone cannot send emails or run scheduled jobs if your cloud dashboards aren't connected. Whenever you (or your AI agent) reach this stage, follow these exact click-by-step instructions.

### Step 1: Configure Resend Custom Domain & API Key
1. Log in to [Resend](https://resend.com).
2. In the left sidebar, click **Domains** -> verify that your custom domain shows a green **Verified** badge.
3. In the left sidebar, click **API Keys** -> **Create API Key**:
   * **Name:** `carpentersfamily-web`
   * **Permission:** `Sending access`
   * **Domain:** Select your verified custom domain.
4. Copy the key (starts with `re_...`) and save it for `.env.local` and Vercel.

### Step 2: Connect Supabase Auth to Resend SMTP (Required for Triggers #2 & #3!)
By default, Supabase's built-in email server only sends **2 emails per hour** and often lands in spam. To make **Trigger #2 (Email Confirmation)** and **Trigger #3 (Password Reset)** work reliably from your custom domain:
1. Open your [Supabase Dashboard](https://supabase.com/dashboard) and select your `carpentersfamily` project.
2. In the left sidebar, click **Authentication** -> **Emails** -> scroll down to **SMTP Settings** (or **Project Settings** -> **Authentication** -> **SMTP Settings**).
3. Toggle **Enable Custom SMTP** to **ON**.
4. Fill in these exact details:
   * **Sender email:** `notifications@yourdomain.com` (must match your verified Resend domain)
   * **Sender name:** `Carpenters Family`
   * **Host:** `smtp.resend.com`
   * **Port number:** `465` (with SSL enabled)
   * **Minimum interval per user:** `60` seconds
   * **Username:** `resend` *(literally the word `resend`)*
   * **Password:** Paste your Resend API Key (`re_...`)
5. Click **Save**.

### Step 3: Configure the Resend Delivery Webhook
To let `carpentersfamily_web` know when an email is delivered or bounced:
1. In the [Resend Dashboard](https://resend.com/webhooks), click **Webhooks** -> **Add Webhook**.
2. **Endpoint URL:** `https://your-custom-domain.com/api/webhooks/resend`
3. **Events to listen for:** Check `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, and `email.complained`.
4. Click **Add**.
5. On the webhook detail page, copy the **Signing Secret** (starts with `whsec_...`). This is your `RESEND_WEBHOOK_SECRET`.

### Step 4: Enable `pg_cron` and `pg_net` in Supabase (Zero-Signup Background Scheduler)
Instead of signing up for a separate queue service, use Supabase's built-in extensions (included on the Free Tier!):
1. In your Supabase Dashboard, go to **Database** -> **Extensions**.
2. Search for **`pg_cron`** and toggle it **ON**.
3. Search for **`pg_net`** and toggle it **ON**.
4. Open the **SQL Editor** in Supabase and store the full outbox worker URL and matching `CRON_SECRET` in Supabase Vault. The outbox worker runs every minute:
   ```sql
   SELECT vault.create_secret(
     'https://your-custom-domain.com/api/internal/notifications/process-outbox',
     'notification_worker_url'
   );
   SELECT vault.create_secret('your-generated-cron-secret-here', 'notification_cron_secret');
   ```

### Step 5: Add Environment Variables to `.env.local` and Vercel
1. Generate a random 32-character secret for `CRON_SECRET` (run `openssl rand -hex 32` in your terminal).
2. Update your local `.env.local` file:
   ```env
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   RESEND_API_KEY="re_xxxxxxxxxxxxxxxxx"
   RESEND_FROM_EMAIL="Carpenters Family <notifications@yourdomain.com>"
   RESEND_REPLY_TO_EMAIL="support@yourdomain.com"
   RESEND_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxx"
   CRON_SECRET="your_generated_32_char_hex_secret"
   ```
3. Open your [Vercel Dashboard](https://vercel.com/dashboard) -> select your project -> **Settings** -> **Environment Variables**:
   * Add all 6 variables above for **Production**, **Preview**, and **Development** (setting `NEXT_PUBLIC_APP_URL` to `https://your-custom-domain.com` in Production).
   * Redeploy your latest production deployment so Vercel picks up the new variables.

---

## 11. Junior Developer Checkpoints: Questions the Agent Must Ask You First

When you give this design document to **Codex** or **Antigravity**, the agent is instructed **never to guess** on club business rules. It will pause and ask you these specific questions if you haven't answered them yet:

1. **Sender Email Address:** *"What exact sender email address on your custom domain (e.g., `notifications@carpentersfamily.com` or `no-reply@carpentersfamily.org`) is verified in your Resend account?"*
2. **Default Club Timezone:** *"All your members and events appear to be based in Nigeria (`Africa/Lagos`, WAT / UTC+1). Should `Africa/Lagos` be the default timezone for all Meeting, Event, and Dues reminders when an event doesn't specify another timezone?"*
3. **Upcoming Dues Reminder Window (Trigger #20):** *"For Trigger #20 ('Dues reminder — follow the existing website/database dues rule'), how many days before the due date should the upcoming reminder email go out (e.g., 7 days before the 1st of the month), and what day of the week do you prefer the weekly overdue reminder (Trigger #22) to run (e.g., every Monday at 8:00 AM WAT)?"*
4. **Local Supabase vs. Linked Remote Supabase:** *"For our local browser verification, are you running Supabase locally via Docker (`npx supabase start`), or is your `.env.local` connected to a remote Supabase project?"*

---

## 12. Local Browser Verification & Testing Playbook (Beyond Unit Tests)

Automated unit tests (`npm test`) are great, but they mock out the browser and email server. Before considering this feature complete, you and your agent **must** verify the system live in your local browser at `http://localhost:3000`.

### Phase A: Automated Test Suite Verification
1. Run Biome lint/format check: `npm run check` (or `npx biome check .`)
2. Run Node unit & integration tests: `npm test`
   * Must include new tests for:
     * `tests/notification-outbox-worker.test.mjs` (batch chunking of 100, rate-limit `429` pause/resume, idempotency key deduplication)
     * `tests/reminder-rescheduling-state-machine.test.mjs` (preserving `dispatched` reminders, recalculating `pending`, skipping past-due slots)
     * `tests/meaningful-change-detector.test.mjs` (typo edit vs. date/time/venue/agenda change)

### Phase B: Live Local Browser Verification (`http://localhost:3000`)
Start your dev server (`npm run dev`) and open `http://localhost:3000` in your browser:

1. **Verify Trigger #12 (Announcement Published) & Permission Gate:**
   * Log in as an authorized Admin/Executive -> go to `/announcements`.
   * Publish a new announcement.
   * **Verify in Browser:** Open the Notifications Drawer (bell icon) -> confirm the in-app notification appears immediately.
   * **Verify in Database / Dev Inspector:** Check `public.notification_outbox` -> confirm 1 row per active member was created with `trigger_type = 'announcement_published'` and a shared `batch_group_key`.
   * Trigger the outbox worker locally (`curl -X POST http://localhost:3000/api/internal/notifications/process-outbox -H "Authorization: Bearer $CRON_SECRET"`).
   * **Verify in Resend Dashboard -> Emails:** Confirm a single batch request delivered the announcement email to active members.

2. **Verify Triggers #13, #14, #15 & Event Rescheduling Rules:**
   * Go to `/events` -> create and publish a new Event set **5 days in the future**.
   * **Verify Reminder Ledger (`public.notification_reminders`):**
     * `7d_before` slot is automatically marked **`skipped_past_due`** (since the event is only 5 days away—no catch-up burst!).
     * `3d_before`, `24h_before`, and `2h_before` slots are marked **`pending`**.
   * Now edit the Event in the browser: change **only a typo in the description**.
     * **Verify:** Zero `event_changed` emails are queued in `notification_outbox`.
   * Now edit the Event's **Venue or Start Time** (move it to **10 days in the future** after manually marking `3d_before` as `dispatched` in DB to test the rule):
     * **Verify:** `event_changed` email is queued for all active members, the already-`dispatched` slot remains `dispatched` (never resent!), and unsent slots update to the new schedule.

3. **Verify Triggers #23, #24, #25 (Dues Payment Receipt Submitted -> Approved / Rejected):**
   * Log in as a regular member -> go to `/dues` -> click **Pay Dues** -> upload a sample receipt image/PDF.
   * **Verify:** `payment_receipt_submitted` email is queued in `notification_outbox` for that member.
   * Log in as an Officer/Admin -> approve (or reject with reason) the dues payment request.
   * **Verify:** `payment_approved` (or `payment_rejected`) email is queued and delivered via Resend, and the member's in-app notification drawer updates live.

4. **Verify Rate-Limit Queueing (Resend Free Tier Protection):**
   * Simulate a Resend `429 daily_quota_exceeded` response in local dev mode.
   * Run `/api/internal/notifications/process-outbox`.
   * **Verify:** Pending rows transition to `status = 'paused_rate_limit'` with `next_attempt_at` set in the future rather than failing or dropping the emails.

---

## 13. System Limitations, Free-Tier Quotas & 10k Scaling Playbook

Every production architecture has real-world boundaries imposed by cloud providers. Here are the exact limitations of your current Free Tier setup and how the system handles them:

| Platform | Current Free Tier Limit | How It Affects `carpentersfamily_web` | How Our Design Mitigates It | When You Need to Upgrade |
|---|---|---|---|---|
| **Resend (Free Tier)** | **100 emails / day** and **3,000 emails / month**; **2 requests / second** | With 15 members, 1 club-wide broadcast uses 15 emails. If you send $> 6$ club-wide broadcasts in a single 24-hour period ($6 \times 15 = 90$), the 7th broadcast will hit the 100/day cap. | Our `notification_outbox` worker catches Resend's `429 daily_quota_exceeded` response, marks the remaining rows as `paused_rate_limit`, and automatically sends them the next day when your 100/day quota resets. **Zero emails are lost.** | Upgrade to **Resend Pro ($20/mo)** when your club grows past ~40–50 active members or when you need $>100$ emails delivered on the same day (Resend Pro removes the daily cap and gives 50,000 emails/month). |
| **Vercel (Hobby / Free Tier)** | **10s–60s serverless timeout**; **Vercel Cron only allows 1 run per day** | You cannot use `vercel.json` Cron for 2-hour meeting/event reminders on Vercel Hobby because Vercel Hobby blocks cron expressions that run more than once per day. | We use **Supabase `pg_cron` + `pg_net`** (which is 100% free on Supabase Free Tier and runs every 1–5 minutes!) to trigger your Next.js `/api/internal/notifications/*` routes. | No upgrade needed for reminders if using Supabase `pg_cron`. Upgrade to Vercel Pro only when commercial traffic or team seats require it. |
| **Supabase (Free Tier)** | **500 MB database**; **200 concurrent Realtime connections**; pauses after 7 days of zero DB activity | If no member visits the site for 7 days AND no `pg_cron` job pings it, Supabase Free pauses the project. | Running the reminder evaluator ensures regular database activity, and outbox rows older than 90 days can be pruned automatically to keep database size tiny. | Upgrade to **Supabase Pro ($25/mo)** before exceeding 200 simultaneous online users or 500 MB of database rows. |
| **No Opt-Out Controls (Release 1 Policy)** | Your policy states: *"No opt-out controls in the first release."* | All active members receive club governance, meeting, event, and dues emails as part of their membership. | Because all emails are strictly transactional/membership-governance alerts to closed club members (not public marketing), this is compliant; however, we structure the outbox so a `notification_preferences` table can be plugged in cleanly in Release 2. | Add per-category email preferences before opening the platform to thousands of external/public users. |
