# Event Multi-Day Duration & One 12-Hour Clock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an event run for 1–30 days, entered as separate date / hour / minute / AM-PM controls, and render every event time through one shared 12-hour Africa/Lagos clock.

**Architecture:** Two new pure modules in `src/lib` — `event-schedule.mjs` (form parts ⇄ instant) and `event-times.mjs` (display + liveness) — are imported by both the server actions and the client components, so parsing and formatting exist exactly once. The database owns the duration: `public.events.duration_days` plus a generated `public.events.ends_at`, so every read path (home feed, event list, dashboard, notifications) sees the same live window without recomputing it. The three RPCs that write events gain a duration parameter in one migration, and every scattered `Intl.DateTimeFormat` that prints an event time is repointed at `event-times.mjs`.

**Tech Stack:** Next.js 16 App Router (React server components + server actions), Supabase Postgres with `security definer` RPCs and pgTAP, Node's built-in test runner, Biome.

**Spec:** `docs/superpowers/specs/2026-11-04-event-multi-day-12-hour-time-design.md` (commit `5a462f5`). Read it before starting; this plan argues from it.

## Global Constraints

- **Never run `supabase db push` without `--local`.** A plain `supabase db push` applies migrations to the PRODUCTION database. The only sanctioned form in this plan is `npx supabase db push --local --include-all`.
- **No production writes.** Production database work in this plan is limited to what the operator runs by hand, and that runbook is Task 11. Do not execute it.
- Migrations are pushed before merging, per the standing project ruling.
- Time zone is fixed: `Africa/Lagos` = UTC+01:00 (WAT), no DST since 1977. Every conversion in this plan hard-codes `+01:00`; never use the runtime's local zone.
- Minutes: the form offers a 5-minute grid, but server validation accepts `00`–`59`. An off-grid minute must stay editable — legacy rows carry them.
- Duration is bounded 1–30 days at every layer (form, action, RPC).
- 12-hour display applies to **everywhere, emails included** (spec decision), except a check-in timestamp, which keeps its own clock.
- `public.events` column-level `SELECT` grants are load-bearing for output columns **and** filter columns; an ungranted new column silently empties whole dashboard reads. Task 3 grants both new columns.
- `.mjs` modules imported from `.ts`/`.tsx` need JSDoc typedefs for TypeScript narrowing (`allowJs: true`, `moduleResolution: "bundler"`), and are imported **with** the extension: `@/lib/event-times.mjs`.
- Test style in `tests/*.test.mjs`: behavioural import tests for `src/lib/*.mjs`; `readFileSync` + `assert.match` source-text tests for components. Run one file with `npm test -- tests/<file>.test.mjs` (never `node --test tests/`).
- Lint with `npm run lint` (= `biome check next.config.ts src`); format with `npx biome check --write <paths>`.
- This is NOT the Next.js you know. Before writing framework-coupled code (form actions, server components, revalidation), read the relevant guide in `node_modules/next/dist/docs/`.
- Do not commit `tests/club-admin-terminology.test.mjs` — it is someone else's uncommitted work.
- Postgres: a generated column may NOT reference a column added in the same `ALTER TABLE ... ADD COLUMN` command list. Task 3 keeps them as two statements.

## Intentional Deviations From The Spec

Seven refinements discovered while gathering source, or by the plan's own self-review against the spec. They are decisions, not oversights; implement them as written here.

1. **`p_duration_days integer DEFAULT 1` on `create_event`, but a REQUIRED 7th parameter on `update_event_details`.** ~30 pgTAP callers invoke `public.create_event(...)` positionally with 11 arguments; a `DEFAULT` on the new last parameter keeps them compiling and means one function per schema rather than two overloads. `update_event_details` has only 3 call sites, and an edit that silently resets an event to one day is a data-loss bug — so its duration argument is mandatory and a caller that forgets it gets a Postgres arity error.
2. **`src/lib/staff-presentation.mjs:19-36` `formatStaffTimestamp` is excluded** from the 12-hour sweep. Spec §1 counted it as an event-time formatter, but every call site prints an action or appointment timestamp. Eight of the nine sites change; this one does not.
3. **Minute validation accepts `00`–`59`,** not only `MINUTE_STEPS`. The 5-minute grid is a form affordance, not a data constraint.
4. **`formatSchedule` converts all six email surfaces at once,** including the poll deadline (`notifications.ts:1174`) and the password-change confirmation timestamp (`:560`), and `src/lib/email/notifications.ts` itself is not edited. Spec §2 asked for "everywhere, emails included"; a per-site repoint would have left those two as the app's last 24-hour emails, and it would have broken the three source-text regexes at `tests/email-schedule-format.test.mjs:63-76` for no behavioural gain. The cost is that the clock recipe now exists in three places — `event-times.mjs`, `format-schedule.ts`, `meaningful-change.ts` — because the latter two are transpiled standalone into data-URL imports by their tests and cannot take a relative import. Task 9 puts that reason in a comment beside each local copy, so a future reader does not "fix" the duplication by adding an import and breaking the test.
5. **The multi-day span appears only where `duration_days` is actually selected.** The ticket storefront (`PublicTicketedEvent`, fed by the `get_public_ticketed_events` RPC) and the home Next Up card (`HomeDashboardEvent`) keep a single-day date with a 12-hour clock; giving them the span means a new migration changing an RPC's return shape, and a new field threaded through `mapEventRow`, `home-dashboard.server.ts` and the home test fixtures. Both show *when to arrive*, which is the start date. Attendance, event list, event dashboard and email carry the span.
6. **The live-window bound is inclusive: `ends_at >= now`, not the spec's `ends_at > now` (Design §3.2).** Two readers must agree, and only one of them can choose freely: Task 8 filters in PostgREST with `.gte("ends_at", nowIso)`, and PostgREST exposes `gte`/`gt` but not an exclusive lower bound that also matches the JS half without writing a second predicate. If JS used `>` while SQL used `>=`, an event would sit in the home dashboard's Upcoming list and in `upcomingEventCount` while the events page put it in Past — a one-millisecond disagreement that reads as a random bug. Task 2's `isEventLiveOrUpcoming` therefore returns `bound.getTime() >= now`, and its test pins the equality case: an event is live at exactly its `ends_at` and not live one millisecond later. Spec §7's cases ("day 2 of 3 is live", "one second past is not") hold either way.
7. **`meetingScheduleFromInstant`'s `slice(11, 19)` fallback is left alone,** contrary to Design §4.6's last sentence. That branch runs only when `new Date(startsAt)` fails to parse, so it cannot leak a real UTC instant — for `"2026-11-12T17:00:00.000Z"` the parse succeeds and the `Intl` path with `hourCycle: "h23"` runs, which is what the fallback is being compared against. The value it returns is the machine `startTime` that `createMeetingFingerprint` hashes and that `tests/meaningful-change-detector.test.mjs:116-131` pins as `"18:00:00"`; replacing it with a `7:00 PM` label would change every meeting's fingerprint and re-notify the club about unchanged meetings. Task 9 converts the human-readable half (`describeEventChanges`) and leaves the machine half alone, which is the split §3.4 asks for.

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `src/lib/event-schedule.mjs` | create | Form parts ⇄ instant: `parseEventSchedule`, `parseDurationDays`, `splitInstantForForm`, `MINUTE_STEPS`, `MAX_DURATION_DAYS` |
| `src/lib/event-times.mjs` | create | Display and liveness: `formatEventTime`, `formatMeridiemFromClock`, `formatEventDateSpan`, `formatEventDurationLabel`, `isEventLiveOrUpcoming`, `eventLiveWindowLowerBound` |
| `src/lib/event-validation.mjs` | keep | Unchanged; `eventDateTimeToISOString` stays for announcements (`src/app/actions.ts:3278`) |
| `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql` | create | `duration_days` + generated `ends_at` + grants; new RPC signatures; `guard_event_write` edit branch; `evaluate_notification_reminders` 12-hour body |
| `supabase/tests/database/event_duration_12hour_test.sql` | create | pgTAP for the generated column, grants, RPC validation, audit payload, live window |
| `supabase/tests/database/events_roles_budgets_lifecycle_test.sql` | modify | `update_event_details` call sites gain the 7th argument; two hard-coded signature strings updated |
| `supabase/tests/database/notification_outbox_reminders_test.sql` | modify | two `update_event_details` call sites gain the 7th argument |
| `src/app/actions.ts` | modify | `createEventAction` + `updateEventDetailsAction` read the new parts and pass `p_duration_days` |
| `src/components/events/create-event-disclosure.tsx` | modify | separate date / hour / minute / AM-PM / "Runs for" controls |
| `src/components/events/event-edit-modal.tsx` | modify | same controls, pre-filled from `splitInstantForForm` |
| `src/lib/home-dashboard.mjs` | modify | live-window filters and `mapEventRow` |
| `src/components/events/events-page-view.tsx` | modify | upcoming/past grouping uses the live window |
| `src/components/events/event-card.tsx` | modify | 12-hour time, multi-day date span |
| `src/app/(member)/events/page.tsx` | modify | select list gains `duration_days, ends_at` |
| `src/app/(member)/events/[eventId]/dashboard/page.tsx` | modify | select list + 12-hour header |
| `src/components/events/dashboard/dashboard-types.ts` | modify | `DashboardEventInfo.durationLabel` |
| `src/components/events/dashboard/event-dashboard-view.tsx` | modify | header renders the duration |
| `src/app/(member)/attendance/page.tsx` | modify | events select gains `duration_days` |
| `src/components/events/attendance/attendance-types.ts` | modify | its own narrower `EventRow` gains `duration_days?` |
| `src/components/attendance/attendance-hub-view.tsx` | modify | event date/time lines only (check-in clock untouched) |
| `src/components/events/attendance/attendance-page-view.tsx` | modify | 12-hour |
| `src/components/home/next-up-events-card.tsx` | modify | 12-hour clock, date half unchanged |
| `src/components/tickets/tickets-storefront-view.tsx` | modify | repoint at the shared helper |
| `src/app/(member)/officers/members/page.tsx` | modify | the managed-events list clock becomes 12-hour (its clockless `dateStyle: "full"` date stays) |
| `src/lib/email/format-schedule.ts` | modify | the email clock becomes 12-hour in place (`clockInZone`) |
| `src/lib/notifications/meaningful-change.ts` | modify | `describeEventChanges` prints 12-hour labels; machine clocks and both fingerprints unchanged |
| `src/components/events/event-types.ts` | modify | `duration_days?` / `ends_at?` optional on `EventRow` |
| `src/lib/event-presentation.mjs` | create | `groupEventRows` — the upcoming/past/archive rule, in one place |
| `tests/event-presentation.test.mjs`, `tests/event-clock-surfaces.test.mjs`, `tests/event-schedule-form.test.mjs` | create | grouping, surface-sweep and form-markup guards |
| `docs/data-access-matrix.md` | modify | the two new columns recorded under Event authorization |
| `tests/event-schedule.test.mjs`, `tests/event-times.test.mjs` | create | behaviour for the two new modules |
| `tests/event-creation-validation.test.mjs`, `tests/home-dashboard.test.mjs`, `tests/events-page-presentation.test.mjs`, `tests/email-schedule-format.test.mjs`, `tests/meaningful-change-detector.test.mjs`, `tests/event-card-access.test.mjs` | modify | updated assertions |

---

## Task 1: Event schedule parsing module

**Files:**
- Create: `src/lib/event-schedule.mjs`
- Test: `tests/event-schedule.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MINUTE_STEPS: number[]` — `[0, 5, 10, …, 55]`
  - `MAX_DURATION_DAYS: number` — `30`
  - `parseEventSchedule(parts: { eventDate?: string, startHour?: string, startMinute?: string, meridiem?: string }) → { ok: true, startsAt: string } | { ok: false, field: string, message: string }`
  - `parseDurationDays(value: unknown) → number | null`
  - `splitInstantForForm(iso: unknown) → { eventDate: string, startHour: string, startMinute: string, meridiem: "AM" | "PM" } | null`

`startsAt` returned by `parseEventSchedule` is a UTC `Z` ISO string, byte-compatible with what today's `eventDateTimeToISOString` produces for the same wall clock. `splitInstantForForm` is its inverse and is the only place that turns a stored instant back into form parts.

- [ ] **Step 1: Write the failing test**

Create `tests/event-schedule.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DURATION_DAYS,
  MINUTE_STEPS,
  parseDurationDays,
  parseEventSchedule,
  splitInstantForForm,
} from "../src/lib/event-schedule.mjs";

test("parseEventSchedule builds a WAT instant from separate date and 12-hour parts", () => {
  assert.deepEqual(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "6",
      startMinute: "0",
      meridiem: "PM",
    }),
    { ok: true, startsAt: "2026-11-12T17:00:00.000Z" },
  );
});

test("parseEventSchedule maps the two twelve-hour edge hours onto the 24-hour clock", () => {
  // 12:30 AM Lagos is 2026-11-11T23:30Z — the UTC calendar day moves backwards.
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "12",
      startMinute: "30",
      meridiem: "AM",
    }).startsAt,
    "2026-11-11T23:30:00.000Z",
  );
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "12",
      startMinute: "30",
      meridiem: "PM",
    }).startsAt,
    "2026-11-12T11:30:00.000Z",
  );
});

test("parseEventSchedule accepts every minute, not only the five-minute grid", () => {
  assert.equal(
    parseEventSchedule({
      eventDate: "2026-11-12",
      startHour: "9",
      startMinute: "37",
      meridiem: "AM",
    }).startsAt,
    "2026-11-12T08:37:00.000Z",
  );
});

test("parseEventSchedule rejects each missing or malformed part with its own field", () => {
  const cases = [
    [{ eventDate: "", startHour: "6", startMinute: "0", meridiem: "PM" }, "event_date"],
    [{ eventDate: "2026-11-1", startHour: "6", startMinute: "0", meridiem: "PM" }, "event_date"],
    [{ eventDate: "2026-02-31", startHour: "6", startMinute: "0", meridiem: "PM" }, "event_date"],
    [{ eventDate: "2026-11-12", startHour: "13", startMinute: "0", meridiem: "PM" }, "start_hour"],
    [{ eventDate: "2026-11-12", startHour: "0", startMinute: "0", meridiem: "AM" }, "start_hour"],
    [{ eventDate: "2026-11-12", startHour: "6", startMinute: "60", meridiem: "PM" }, "start_minute"],
    [{ eventDate: "2026-11-12", startHour: "6", startMinute: "x", meridiem: "PM" }, "start_minute"],
    [{ eventDate: "2026-11-12", startHour: "6", startMinute: "0", meridiem: "pm " }, "meridiem"],
    [{ eventDate: "2026-11-12", startHour: "6", startMinute: "0", meridiem: "" }, "meridiem"],
  ];
  for (const [parts, field] of cases) {
    const result = parseEventSchedule(parts);
    assert.equal(result.ok, false, JSON.stringify(parts));
    assert.equal(result.field, field, JSON.stringify(parts));
    assert.ok(result.message.length > 0, JSON.stringify(parts));
  }
});

test("parseEventSchedule tolerates nullish input instead of throwing", () => {
  assert.equal(parseEventSchedule({}).ok, false);
  assert.equal(parseEventSchedule(undefined).ok, false);
  assert.equal(parseEventSchedule({}).field, "event_date");
});

test("parseDurationDays accepts a whole number of days up to the maximum", () => {
  assert.equal(parseDurationDays("1"), 1);
  assert.equal(parseDurationDays("30"), MAX_DURATION_DAYS);
  assert.equal(parseDurationDays(7), 7);
});

test("parseDurationDays rejects zero, out-of-range, fractional and non-numeric input", () => {
  for (const value of ["0", "31", "-1", "1.5", "", "abc", null, undefined, {}, NaN]) {
    assert.equal(parseDurationDays(value), null, String(value));
  }
});

test("splitInstantForForm is the inverse of parseEventSchedule", () => {
  assert.deepEqual(splitInstantForForm("2026-11-12T17:00:00.000Z"), {
    eventDate: "2026-11-12",
    startHour: "6",
    startMinute: "0",
    meridiem: "PM",
  });
  assert.deepEqual(splitInstantForForm("2026-11-12T11:30:00.000Z"), {
    eventDate: "2026-11-12",
    startHour: "12",
    startMinute: "30",
    meridiem: "PM",
  });
});

test("splitInstantForForm recovers a date that crossed midnight in Lagos", () => {
  // 2026-11-12T23:30Z is 2026-11-13 00:30 in WAT: the day moves, so a naive
  // iso.slice(0, 10) would pre-fill the form with the previous evening.
  assert.deepEqual(splitInstantForForm("2026-11-12T23:30:00.000Z"), {
    eventDate: "2026-11-13",
    startHour: "12",
    startMinute: "30",
    meridiem: "AM",
  });
});

test("splitInstantForForm returns null for absent or unparseable instants", () => {
  assert.equal(splitInstantForForm(null), null);
  assert.equal(splitInstantForForm(undefined), null);
  assert.equal(splitInstantForForm(""), null);
  assert.equal(splitInstantForForm("not-a-date"), null);
});

test("MINUTE_STEPS is the documented five-minute grid", () => {
  assert.equal(MINUTE_STEPS.length, 12);
  assert.deepEqual(MINUTE_STEPS.slice(0, 3), [0, 5, 10]);
  assert.equal(MINUTE_STEPS.at(-1), 55);
});
```

The midnight-crossing case is the load-bearing one: `2026-11-12T23:30:00.000Z` is `2026-11-13 00:30` in Lagos, so a naive `iso.slice(0, 10)` pre-fills the edit form with the previous evening.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: FAIL with `Cannot find module … src/lib/event-schedule.mjs` — the file does not exist yet. If it fails any other way, fix the harness, not the assertion.

- [ ] **Step 3: Write the module**

Create `src/lib/event-schedule.mjs`:

```js
/**
 * @fileoverview Translates the event schedule form (separate date, 12-hour
 * clock and duration controls) to and from the instants stored on public.events.
 * Africa/Lagos is UTC+01:00 year-round, so the offset is a constant.
 */

export const MINUTE_STEPS = Array.from({ length: 12 }, (_unused, index) => index * 5);
export const MAX_DURATION_DAYS = 30;

const WAT_OFFSET_MINUTES = 60;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {number} value
 */
function padTwo(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {{ eventDate?: unknown, startHour?: unknown, startMinute?: unknown, meridiem?: unknown }} parts
 * @returns {{ ok: true, startsAt: string } | { ok: false, field: string, message: string }}
 */
export function parseEventSchedule(parts) {
  const source = parts ?? {};
  const eventDate = typeof source.eventDate === "string" ? source.eventDate : "";
  const dateMatch = DATE_PATTERN.exec(eventDate);
  if (!dateMatch) {
    return { ok: false, field: "event_date", message: "Choose the day the event starts." };
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 || month > 12 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() + 1 !== month ||
    calendar.getUTCDate() !== day
  ) {
    return { ok: false, field: "event_date", message: "That date does not exist." };
  }

  const hour = Number(source.startHour);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) {
    return { ok: false, field: "start_hour", message: "Choose an hour between 1 and 12." };
  }
  const minute = Number(source.startMinute);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    return { ok: false, field: "start_minute", message: "Choose a minute between 00 and 59." };
  }
  const meridiem = typeof source.meridiem === "string" ? source.meridiem : "";
  if (meridiem !== "AM" && meridiem !== "PM") {
    return { ok: false, field: "meridiem", message: "Choose AM or PM." };
  }

  const hour24 = meridiem === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;
  const wallClock = `${eventDate}T${padTwo(hour24)}:${padTwo(minute)}`;
  if (new Date(`${wallClock}:00Z`).toISOString().slice(0, 16) !== wallClock) {
    return { ok: false, field: "event_date", message: "That date does not exist." };
  }
  return { ok: true, startsAt: new Date(`${wallClock}:00+01:00`).toISOString() };
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseDurationDays(value) {
  const days = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(days) || days < 1 || days > MAX_DURATION_DAYS) return null;
  return days;
}

/**
 * @param {unknown} iso
 * @returns {{ eventDate: string, startHour: string, startMinute: string, meridiem: "AM" | "PM" } | null}
 */
export function splitInstantForForm(iso) {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const lagos = new Date(instant.getTime() + WAT_OFFSET_MINUTES * 60 * 1000);
  const hour24 = lagos.getUTCHours();
  const meridiem = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    eventDate: lagos.toISOString().slice(0, 10),
    startHour: String(hour12),
    startMinute: padTwo(lagos.getUTCMinutes()),
    meridiem,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: PASS, all tests, pristine output. If the midnight-crossing assertion fails, `splitInstantForForm` is reading the UTC calendar instead of the Lagos one.

- [ ] **Step 5: Verify the wall-clock equivalence the whole plan depends on**

Run: `npm test -- tests/event-creation-validation.test.mjs`
Expected: PASS. `eventDateTimeToISOString("2026-11-12T18:00")` and `parseEventSchedule({ eventDate: "2026-11-12", startHour: "6", startMinute: "0", meridiem: "PM" }).startsAt` must both be `2026-11-12T17:00:00.000Z` — Task 6 swaps one for the other inside `createEventAction`, and existing tests pin the output.

- [ ] **Step 6: Lint and commit**

```bash
npx biome check --write src/lib/event-schedule.mjs tests/event-schedule.test.mjs
npm run lint
git add src/lib/event-schedule.mjs tests/event-schedule.test.mjs
git commit -m "feat(events): parse a schedule from separate date and 12-hour parts"
```

---

## Task 2: Shared display and liveness helpers

**Files:**
- Create: `src/lib/event-times.mjs`
- Test: `tests/event-times.test.mjs`

**Interfaces:**
- Consumes: `MAX_DURATION_DAYS` from `src/lib/event-schedule.mjs`.
- Produces (all timezone-pinned to `Africa/Lagos`, all 12-hour):
  - `formatEventTime(iso: unknown) → string` — `"6:00 PM"`; `""` for an unparseable instant
  - `formatMeridiemFromClock(clock: unknown) → string` — `"6:00 PM"` from `"18:00"`, `"18:00:00"` or a full ISO string; `""` when it cannot tell
  - `formatEventDateSpan(startsAt: unknown, durationDays: unknown) → string` — `"Thursday, 12 November 2026"` for one day, `"Thursday, 12 – Saturday, 14 November 2026"` when the months match, `"Friday, 30 October – Monday, 2 November 2026"` when they do not
  - `formatEventDurationLabel(durationDays: unknown) → string` — `""` or `"1 day"` / `"3 days"`
  - `isEventLiveOrUpcoming(event: { starts_at?: string | null, ends_at?: string | null }, now?: number) → boolean`
  - `eventLiveWindowLowerBound(nowIso: string, maxDays?: number) → string`

- [ ] **Step 1: Write the failing test**

Create `tests/event-times.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  eventLiveWindowLowerBound,
  formatEventDateSpan,
  formatEventDurationLabel,
  formatEventTime,
  formatMeridiemFromClock,
  isEventLiveOrUpcoming,
} from "../src/lib/event-times.mjs";

test("formatEventTime renders a Lagos 12-hour clock", () => {
  assert.equal(formatEventTime("2026-11-12T17:00:00.000Z"), "6:00 PM");
  assert.equal(formatEventTime("2026-11-12T11:30:00.000Z"), "12:30 PM");
  assert.equal(formatEventTime("2026-11-12T23:30:00.000Z"), "12:30 AM");
  assert.equal(formatEventTime("2026-11-12T08:05:00.000Z"), "9:05 AM");
});

test("formatEventTime returns an empty string instead of Invalid Date", () => {
  for (const value of [null, undefined, "", "nope"]) {
    assert.equal(formatEventTime(value), "", String(value));
  }
});

test("formatMeridiemFromClock converts a bare HH:MM or HH:MM:SS clock", () => {
  assert.equal(formatMeridiemFromClock("18:00"), "6:00 PM");
  assert.equal(formatMeridiemFromClock("18:00:00"), "6:00 PM");
  assert.equal(formatMeridiemFromClock("00:30"), "12:30 AM");
  assert.equal(formatMeridiemFromClock("12:15"), "12:15 PM");
  assert.equal(formatMeridiemFromClock("2026-11-12T17:00:00.000Z"), "6:00 PM");
});

test("formatMeridiemFromClock returns an empty string for a clock it cannot read", () => {
  for (const value of [null, undefined, "", "18:00 PM", "24:00", "abc"]) {
    assert.equal(formatMeridiemFromClock(value), "", String(value));
  }
});

test("formatEventDateSpan names one day exactly as the old formatter did", () => {
  assert.equal(formatEventDateSpan("2026-11-12T17:00:00.000Z", 1), "Thursday, 12 November 2026");
  assert.equal(formatEventDateSpan("2026-11-12T17:00:00.000Z", undefined), "Thursday, 12 November 2026");
});

test("formatEventDateSpan spans the last day of a multi-day event", () => {
  assert.equal(
    formatEventDateSpan("2026-11-12T17:00:00.000Z", 3),
    "Thursday, 12 – Saturday, 14 November 2026",
  );
  assert.equal(
    formatEventDateSpan("2026-10-30T17:00:00.000Z", 4),
    "Friday, 30 October – Monday, 2 November 2026",
  );
});

test("formatEventDateSpan ignores a duration that is not a usable day count", () => {
  for (const days of [0, -3, "abc", 1.5, null]) {
    assert.equal(
      formatEventDateSpan("2026-11-12T17:00:00.000Z", days),
      "Thursday, 12 November 2026",
      String(days),
    );
  }
});

test("formatEventDurationLabel counts days pluralised", () => {
  assert.equal(formatEventDurationLabel(1), "1 day");
  assert.equal(formatEventDurationLabel("5"), "5 days");
  assert.equal(formatEventDurationLabel(null), "");
  assert.equal(formatEventDurationLabel(0), "");
});

test("isEventLiveOrUpcoming keeps a one-day event until its own start passes", () => {
  const startsAt = "2026-11-12T17:00:00.000Z";
  const endsAt = "2026-11-12T17:00:00.000Z";
  const at = Date.parse;
  assert.equal(isEventLiveOrUpcoming({ starts_at: startsAt, ends_at: endsAt }, at("2026-11-12T16:59:59.999Z")), true);
  assert.equal(isEventLiveOrUpcoming({ starts_at: startsAt, ends_at: endsAt }, at("2026-11-12T17:00:00.000Z")), true);
  assert.equal(isEventLiveOrUpcoming({ starts_at: startsAt, ends_at: endsAt }, at("2026-11-12T17:00:00.001Z")), false);
});

test("isEventLiveOrUpcoming keeps a multi-day event live on its final day", () => {
  const event = {
    starts_at: "2026-11-12T17:00:00.000Z",
    ends_at: "2026-11-14T17:00:00.000Z",
  };
  assert.equal(isEventLiveOrUpcoming(event, Date.parse("2026-11-14T12:00:00.000Z")), true);
  assert.equal(isEventLiveOrUpcoming(event, Date.parse("2026-11-14T17:00:00.001Z")), false);
});

test("isEventLiveOrUpcoming falls back to starts_at when ends_at was not selected", () => {
  const startsAt = "2026-11-12T17:00:00.000Z";
  assert.equal(isEventLiveOrUpcoming({ starts_at: startsAt }, Date.parse("2026-11-12T10:00:00.000Z")), true);
  assert.equal(isEventLiveOrUpcoming({ starts_at: startsAt }, Date.parse("2026-11-12T18:00:00.000Z")), false);
  assert.equal(isEventLiveOrUpcoming({ starts_at: null }), false);
});

test("eventLiveWindowLowerBound reaches back by the maximum duration minus one day", () => {
  assert.equal(eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z"), "2026-10-14T17:00:00.000Z");
  assert.equal(eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z", 1), "2026-11-12T17:00:00.000Z");
  assert.equal(eventLiveWindowLowerBound("2026-11-12T17:00:00.000Z", 3), "2026-11-10T17:00:00.000Z");
});

test("eventLiveWindowLowerBound leaves an unusable input untouched", () => {
  assert.equal(eventLiveWindowLowerBound("not-a-date"), "not-a-date");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/event-times.test.mjs`
Expected: FAIL with `Cannot find module … src/lib/event-times.mjs`.

- [ ] **Step 3: Write the module**

Create `src/lib/event-times.mjs`:

```js
/**
 * @fileoverview The one place an event time is rendered or an event's live
 * window is decided. Every consumer imports these instead of building an
 * Intl.DateTimeFormat, so "6:00 PM WAT" cannot drift between pages.
 */

import { MAX_DURATION_DAYS } from "./event-schedule.mjs";

const LAGOS = "Africa/Lagos";
const DAY_MS = 86_400_000;

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: LAGOS,
});
const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  timeZone: LAGOS,
});
const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: LAGOS,
});
const monthFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: LAGOS,
});
const longDateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: LAGOS,
});
const yearFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  timeZone: LAGOS,
});

/**
 * "2026-11" for a Lagos calendar month. en-CA is used only because its output is
 * ISO-ordered and therefore safe to slice; the value never reaches the user.
 * @param {Date} instant
 */
function monthKey(instant) {
  return instant.toLocaleDateString("en-CA", { timeZone: LAGOS }).slice(0, 7);
}

/** en-GB prints "06" for the hour; the app has always shown the unpadded form. */
function unpadded(hour12) {
  return hour12.replace(/^0/, "");
}

function parse(iso) {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
export function formatEventTime(iso) {
  const instant = parse(iso);
  if (!instant) return "";
  const parts = timeFormatter.formatToParts(instant);
  const hour = unpadded(parts.find((part) => part.type === "hour")?.value ?? "");
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  const meridiem = dayPeriod.replace(/[^APap]/g, "").toUpperCase();
  return meridiem ? `${hour}:${minute} ${meridiem}` : `${hour}:${minute}`;
}

/**
 * Reads a bare "HH:MM"/"HH:MM:SS" clock, or any string a Date accepts.
 * Meeting minutes store the machine value "18:00:00"; this is the display half.
 * @param {unknown} clock
 * @returns {string}
 */
export function formatMeridiemFromClock(clock) {
  if (typeof clock !== "string" || clock.length === 0) return "";
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(clock);
  if (match) {
    const hour24 = Number(match[1]);
    if (hour24 > 23) return "";
    const meridiem = hour24 < 12 ? "AM" : "PM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return `${hour12}:${match[2]} ${meridiem}`;
  }
  const instant = parse(clock);
  if (!instant) return "";
  const parts = timeFormatter.formatToParts(instant);
  const hour = unpadded(parts.find((part) => part.type === "hour")?.value ?? "");
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const meridiem = (parts.find((part) => part.type === "dayPeriod")?.value ?? "")
    .replace(/[^APap]/g, "")
    .toUpperCase();
  return meridiem ? `${hour}:${minute} ${meridiem}` : "";
}

/**
 * @param {unknown} startsAt
 * @param {unknown} durationDays
 * @returns {string}
 */
export function formatEventDateSpan(startsAt, durationDays) {
  const instant = parse(startsAt);
  if (!instant) return "";
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 2) return longDateFormatter.format(instant);
  const last = new Date(instant.getTime() + (days - 1) * DAY_MS);
  // U+2013 with spaces either side, never a hyphen: the display tests pin it.
  const span = " – ";
  const head = `${weekdayFormatter.format(instant)}, ${dayFormatter.format(instant)}`;
  const tail = `${weekdayFormatter.format(last)}, ${dayFormatter.format(last)} ${monthFormatter.format(last)}`;
  if (monthKey(instant) === monthKey(last)) {
    // "Thursday, 12 – Saturday, 14 November 2026"
    return `${head}${span}${tail} ${yearFormatter.format(last)}`;
  }
  // "Friday, 30 October – Monday, 2 November 2026"
  return `${head} ${monthFormatter.format(instant)}${span}${tail} ${yearFormatter.format(last)}`;
}

/**
 * @param {unknown} durationDays
 * @returns {string}
 */
export function formatEventDurationLabel(durationDays) {
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 1) return "";
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * An event is live or upcoming from its start until the end of its last day.
 * ends_at is the generated column; when a query did not select it we degrade to
 * the old single-instant rule rather than invent a window.
 * @param {{ starts_at?: string | null, ends_at?: string | null }} event
 * @param {number} [now]
 */
export function isEventLiveOrUpcoming(event, now = Date.now()) {
  const upper = event?.ends_at ?? event?.starts_at;
  if (typeof upper !== "string") return false;
  const bound = parse(upper);
  if (!bound) return false;
  return bound.getTime() >= now;
}

/**
 * The earliest starts_at that can still be live: a max-length event that began
 * today and ends now. Callers filter on starts_at with this so Postgres can use
 * the index instead of computing ends_at per row.
 * @param {string} nowIso
 * @param {number} [maxDays]
 * @returns {string}
 */
export function eventLiveWindowLowerBound(nowIso, maxDays = MAX_DURATION_DAYS) {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return nowIso;
  return new Date(now.getTime() - (maxDays - 1) * DAY_MS).toISOString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/event-times.test.mjs`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
npx biome check --write src/lib/event-times.mjs tests/event-times.test.mjs
npm run lint
git add src/lib/event-times.mjs tests/event-times.test.mjs
git commit -m "feat(events): add one shared 12-hour clock and live-window helper"
```

---

## Task 3: Schema — `duration_days`, generated `ends_at`, and the grants

**Files:**
- Create: `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql`
- Create: `supabase/tests/database/event_duration_12hour_test.sql`

**Interfaces:**
- Consumes: `public.events` (`supabase/migrations/20261003101500_events_roles_budgets_lifecycle.sql:5`, `starts_at timestamptz not null` at `:9`), whose column grants are the block at `:183-188`.
- Produces: columns `public.events.duration_days integer not null default 1` and `public.events.ends_at timestamptz` (generated, stored), plus `SELECT` rights on both for `authenticated`. Task 4 adds the RPC parameter that writes `duration_days`; Tasks 6-9 read these columns.

This task is schema only. `duration_days` cannot be changed through `private.guard_event_write` until Task 4 widens it, so the behavioural arithmetic test (a 3-day event's `ends_at`) belongs to Task 4. Here we prove the columns exist, are constrained, and are visible to members.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql`:

```sql
-- Events occupy a whole number of days instead of a single instant.
-- duration_days counts the start day, so every existing row is a one-day event
-- and ends_at equals starts_at: the change is additive and reversible in data terms.
alter table public.events
  add column duration_days integer not null default 1;

comment on column public.events.duration_days is
  'Whole calendar days the event occupies, including its start day (1-30). Africa/Lagos wall clock.';

-- Separate statement: ends_at references duration_days, and a generated column may not
-- depend on a column introduced by the same ALTER command list.
alter table public.events
  add column ends_at timestamptz
    generated always as (starts_at + ((duration_days - 1) * interval '1 day')) stored;

comment on column public.events.ends_at is
  'Instant the event stops being live: the same wall-clock time duration_days - 1 days later. Derived, never written.';

alter table public.events
  add constraint events_duration_days_range check (duration_days between 1 and 30);

-- Column-level SELECT grants on public.events are load-bearing: an ungranted column
-- silently empties whole dashboard reads. Precedent: 20261027140610_grant_event_timezone.sql.
grant select (duration_days, ends_at) on table public.events to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply it locally and confirm the generated column was accepted**

```bash
npx supabase db push --local --include-all
```

Expected: the new migration applies with no error. If Postgres answers `generation expression is not immutable`, STOP and report it: the design assumes `timestamptz + interval` is immutable, and a trigger-maintained `ends_at` is a different design that needs fresh approval, not a silent substitution.

Then confirm the three schema facts independently, with a read-only query:

```bash
npx supabase db query --local "
  select a.attname, a.attgenerated, a.attnotnull, a.atthasdef,
    pg_get_expr(d.adbin, d.adrelid) as default_expr,
    (select c.conname from pg_catalog.pg_constraint c
      where c.conrelid = 'public.events'::regclass
        and c.conname = 'events_duration_days_range') as check_name
  from pg_catalog.pg_attribute a
  left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.events'::regclass and a.attname in ('duration_days','ends_at')
  order by a.attname;"
```

Expected: `duration_days` — `attgenerated` empty, `attnotnull = t`, `atthasdef = t`, `default_expr = 1`, `check_name = events_duration_days_range`. `ends_at` — `attgenerated = s` (stored generated), `default_expr` null, because a generated column has no separate default.

Spec §7 also wants the write refusal proved, not assumed. This runs against the local stack only, inside a transaction that never commits, and it is deliberately not a pgTAP case — pgTAP suites run as a non-superuser role and an RLS failure (`42501`) would look like the generated-column rule:

```bash
npx supabase db query --local --dbname postgres "
begin;
update public.events set ends_at = now() where id = (select min(id) from public.events);
rollback;"
```

Expected: an error naming `ends_at` as generated (Postgres refuses a non-`DEFAULT` value for a stored-generated column) and no rows changed. `0` rows affected with no error means the column is a plain writable column and Step 1's `generated always` clause did not land as written — fix the migration before continuing.

- [ ] **Step 3: Write the pgTAP suite**

Create `supabase/tests/database/event_duration_12hour_test.sql`. The fixture shape is copied from `supabase/tests/database/events_roles_budgets_lifecycle_test.sql:85-111`: insert `auth.users`, let the profile trigger create `member_profiles`, then activate it and grant a club role.

```sql
begin;

select no_plan();

-- Schema shape.
select has_column('public.events', 'duration_days', 'an event carries a whole-day duration');
select has_column('public.events', 'ends_at', 'an event carries the instant it stops being live');
select col_is_atomic('public.events', 'duration_days', 'the day count is a number of days');
select col_not_null('public.events', 'duration_days', 'a missing day count is not allowed');
select has_check('public.events', 'events_duration_days_range',
  'the day count is bounded by a database constraint');

select is(
  (select a.attgenerated from pg_catalog.pg_attribute as a
    where a.attrelid = 'public.events'::regclass and a.attname = 'ends_at'),
  's',
  'ends_at is stored-generated, so no caller can drift it away from duration_days'
);

-- Who may read it. Members read both columns; anon reads neither, because anon
-- has no SELECT on events at all (20261003101500_events_roles_budgets_lifecycle.sql:179).
select is(
  has_column_privilege('authenticated', 'public.events', 'duration_days', 'SELECT'),
  true,
  'members may read the duration'
);
select is(
  has_column_privilege('authenticated', 'public.events', 'ends_at', 'SELECT'),
  true,
  'members may read the live-window upper bound'
);
select is(
  has_column_privilege('anon', 'public.events', 'ends_at', 'SELECT'),
  false,
  'anonymous requests may not read the live-window upper bound'
);

-- Existing rows became one-day events, which is what makes the change additive.
select is(
  (select count(*) from public.events
    where duration_days <> 1 or ends_at is distinct from starts_at),
  0::bigint,
  'every event that existed before this migration is a one-day event'
);

-- Behaviour through the create procedure, which still takes eleven arguments here.
insert into auth.users (
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data,
  email_confirmed_at
) values (
  '00000000-0000-0000-0000-000000000c01', 'authenticated', 'authenticated',
  'duration-admin@example.test', '', '{}'::jsonb,
  '{"full_name":"Duration Admin","username":"duration_admin"}'::jsonb, now()
);
update public.member_profiles set status = 'active'
  where id = '00000000-0000-0000-0000-000000000c01';
insert into public.member_role_assignments (member_id, role, assigned_by, grant_reason)
values (
  '00000000-0000-0000-0000-000000000c01', 'admin',
  '00000000-0000-0000-0000-000000000c01', 'Duration test Admin'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000c01', true);

select is(
  (select duration_days from public.events
    where id = public.create_event(
      'One Day Vigil', 'other', '2026-11-12 18:00:00+01', 'Club Hall', null,
      false, true, false, false, false, false
    )),
  1,
  'an event created without a duration is one day long'
);
select is(
  (select ends_at = starts_at from public.events where title = 'One Day Vigil'),
  true,
  'a one-day event ends at its own start instant'
);

select * from finish();
rollback;
```

The last two assertions are the whole point of the split: a one-day event's live window must be byte-for-byte the behaviour the app has today, so nothing else in the system changes until a duration is actually set.

- [ ] **Step 4: Run the suite**

```bash
npx supabase test db --local supabase/tests/database/event_duration_12hour_test.sql
```

Expected: `ok` lines only, ending with `# Completed successfully`. Gate on zero `not ok` in this file; the seven stale-name suites in project memory are known drift. If this file reports failures caused by leftover rows, re-run after `npx supabase db reset --local`.

- [ ] **Step 5: Confirm the local schema is what the app will read**

```bash
npx supabase db query --local "select id, title, starts_at, ends_at, duration_days from public.events order by starts_at limit 3"
```

Expected: every existing row reports `duration_days = 1` and `ends_at` equal to `starts_at`. If any row differs, STOP and report — the default or the expression is wrong.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261104120000_event_duration_and_12hour_time.sql \
        supabase/tests/database/event_duration_12hour_test.sql
git commit -m "feat(events): store a whole-day duration and derive the live window"
```

---

## Task 4: RPC signatures — create and edit carry the day count

**Files:**
- Modify: `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql` (append)
- Modify: `supabase/tests/database/events_roles_budgets_lifecycle_test.sql:68-70` and `:442`
- Modify: `supabase/tests/database/notification_outbox_reminders_test.sql:816` and `:859`

**Interfaces:**
- Consumes: `public.events.duration_days` from Task 3.
- Produces:
  - `public.create_event(text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer default 1) → uuid`
  - `public.update_event_details(uuid, text, timestamptz, text, text, text, integer) → void` — note the seventh parameter is **required**
  - Both delegate to same-arity `private.*` functions; `private.update_event_details` writes `duration_days` and records it in `public.audit_log`.

Signature order matters for PostgREST overload resolution, so the old signatures are dropped before the new ones are created. `update_event_details` gets a required parameter on purpose: the three existing pgTAP callers are updated in Step 6, and any caller that forgets the day count must fail loudly rather than silently reset a three-day event to one day.

- [ ] **Step 1: Append the drops and the recreated create function**

Append to `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql`:

```sql
drop function if exists private.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean
);
drop function if exists public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean
);
drop function if exists private.update_event_details(uuid, text, timestamptz, text, text, text);
drop function if exists public.update_event_details(uuid, text, timestamptz, text, text, text);

List the parameters exactly as below — twelve, the last one defaulted — then build the body from the live function instead of retyping it:

```sql
create or replace function private.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean,
  p_duration_days integer default 1
)
```

Dump the definition that is actually installed on the local database:

```bash
npx supabase db query --local "select pg_get_functiondef('private.create_event(text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure)"
```

Copy everything the dump returns from `returns uuid` onward beneath that parameter list, keeping `language plpgsql`, `security definer` and `set search_path = ''` byte-for-byte as dumped. Then apply exactly these three edits and nothing else, because transcription is the largest risk in this plan:

1. In the validation chain that raises `'23514'` with `The event details or fixed feature selection is invalid.`, append two terms so an out-of-range day count is refused with the message the form already explains:

```sql
    or p_duration_days is null
    or p_duration_days not between 1 and 30
```

2. In `insert into public.events (...)`, add the column `duration_days` immediately after `ticketing_enabled`, and add `p_duration_days` in the matching position of the `values` list.

3. In the `event_created` audit insert's `jsonb_build_object`, append `,'duration_days', p_duration_days` as the final pair.

Then the invoker wrapper:

```sql
create or replace function public.create_event(
  p_title text,
  p_event_type text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_minutes_enabled boolean,
  p_attendance_enabled boolean,
  p_budget_enabled boolean,
  p_income_enabled boolean,
  p_expenses_enabled boolean,
  p_ticketing_enabled boolean,
  p_duration_days integer default 1
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_event(
    p_title, p_event_type, p_starts_at, p_location, p_description,
    p_minutes_enabled, p_attendance_enabled, p_budget_enabled, p_income_enabled,
    p_expenses_enabled, p_ticketing_enabled, p_duration_days
  );
$function$;
```



- [ ] **Step 2: Append the recreated edit function**

List the parameters exactly as below — seven, the last one required with no default:

```sql
create or replace function private.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_reason text,
  p_duration_days integer
)
```

Dump the installed definition and copy everything from `returns void` onward beneath that list, keeping `language plpgsql`, `security definer` and `set search_path = ''` byte-for-byte:

```bash
npx supabase db query --local "select pg_get_functiondef('private.update_event_details(uuid,text,timestamptz,text,text,text)'::regprocedure)"
```

Then apply exactly these four changes and nothing else:

1. The signature above is the whole interface change: seven arguments, and the seventh has no default.
2. Validation chain: add `or p_duration_days is null or p_duration_days not between 1 and 30` as the last `or` term of the block that raises `'The event details are invalid.'` (the block at `:601-612`).
3. The no-op early return at `:634-639` gains one term, otherwise an edit that changes only the day count returns silently and the audit trail never sees it:

```sql
  if v_event.title is not distinct from p_title
    and v_event.starts_at is not distinct from p_starts_at
    and v_event.location is not distinct from p_location
    and v_event.description is not distinct from p_description
    and v_event.duration_days is not distinct from p_duration_days then
    return;
  end if;
```

4. The `update public.events set` at `:641-645` gains `duration_days = p_duration_days`, and both `jsonb_build_object` calls in the `insert into public.audit_log` at `:651-658` gain a `'duration_days'` key (`v_event.duration_days` in `before_data`, `p_duration_days` in `after_data`).

Then the invoker wrapper:

```sql
create or replace function public.update_event_details(
  p_event_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_location text,
  p_description text,
  p_reason text,
  p_duration_days integer
)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.update_event_details(
    p_event_id, p_title, p_starts_at, p_location, p_description, p_reason, p_duration_days
  );
$function$;
```

- [ ] **Step 3: Widen the write guard so a duration edit is an edit**

`private.guard_event_write` decides what counts as an edit at `20261003101500_events_roles_budgets_lifecycle.sql:326-329`. Recreate the function with that condition extended by one term, so a changed day count requires the same authorization (Executive / Admin / Backup Admin / this event's lead or assistant, scheduled status, `updated_by` = actor, `updated_at` advanced):

```sql
  if new.title is distinct from old.title
    or new.starts_at is distinct from old.starts_at
    or new.location is distinct from old.location
    or new.description is distinct from old.description
    or new.duration_days is distinct from old.duration_days then
```

Do not retype the rest of the trigger function. Dump it, change the one condition, and re-apply:

```bash
npx supabase db query --local "select pg_get_functiondef('private.guard_event_write()'::regprocedure)" > /tmp/guard.sql
```

Copy the body into the migration between `create or replace function private.guard_event_write()` and the closing `$function$;`, add the fifth `or` term, and keep `returns trigger`, `language plpgsql`, `security definer`, `set search_path = ''` exactly as they are.

- [ ] **Step 4: Re-issue the execute grants on the new signatures**

The revoke/grant block in `20261003101500_events_roles_budgets_lifecycle.sql:1223-1247` names the old type lists, so those statements now point at dropped functions. Append a fresh block that matches the shape of the original (read it first and mirror which roles and which privileges it grants — do not invent a wider grant):

```sql
revoke all on function public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) from public, anon;
revoke all on function public.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) from public, anon;

grant execute on function public.create_event(
  text, text, timestamptz, text, text, boolean, boolean, boolean, boolean, boolean, boolean, integer
) to authenticated;
grant execute on function public.update_event_details(
  uuid, text, timestamptz, text, text, text, integer
) to authenticated;
```

Also re-assert that `private` remains unexecutable from outside: copy the corresponding `revoke ... from authenticated, anon, public` lines for the two `private.*` functions from the original block, with the new type lists.

- [ ] **Step 5: Apply and verify the arity**

```bash
npx supabase db reset --local
npx supabase db query --local "
  select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_catalog.pg_namespace n join pg_catalog.pg_proc p on p.pronamespace = n.oid
  where n.nspname in ('public','private')
    and p.proname in ('create_event','update_event_details')
  order by n.nspname, p.proname;"
```

Replay with `db reset --local`, not `db push --local --include-all`: this task appends to the migration file Task 3 already applied, and `db push` tracks migrations by version, so an edited-but-applied file is skipped without error. A skipped push would show the OLD arity here and read like a broken `drop function` / `create function` pair.

Expected: exactly four rows, each ending with the duration parameter — `public.create_event` and `private.create_event` showing `p_duration_days integer default 1`, and both `update_event_details` showing `p_duration_days integer` with no default. Any fifth row is a surviving old overload: drop it before proceeding.

- [ ] **Step 6: Repair the pgTAP callers**

`update_event_details` has exactly three call sites, all positional; each gains `1` as the seventh argument so the assertion it belongs to keeps testing what it tested before:

```bash
grep -rn "update_event_details" supabase/tests/database/*.sql
```

- `supabase/tests/database/events_roles_budgets_lifecycle_test.sql:442` sits inside a `throws_ok` dollar-quoted block that expects `42501` with `Only scheduled, unarchived events can be edited.` Add the argument inside the `$$ ... $$` body; the expected message and code stay unchanged.
- `supabase/tests/database/notification_outbox_reminders_test.sql:816` and `:859` add the argument likewise.

Then update the two hard-coded signature strings in `events_roles_budgets_lifecycle_test.sql:68` and `:70`, which assert EXECUTE privileges by exact type list:

```sql
  and not has_function_privilege('anon', 'public.create_event(text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean,boolean,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_event(text,text,timestamptz,text,text,boolean,boolean,boolean,boolean,boolean,boolean,integer)', 'EXECUTE')
```

The `update_event_details` privilege assertion in the same suite (find it with `grep -n "update_event_details" supabase/tests/database/events_roles_budgets_lifecycle_test.sql`) moves to `public.update_event_details(uuid,text,timestamptz,text,text,text,integer)`.

- [ ] **Step 7: Write the behavioural pgTAP suite**

Append to `supabase/tests/database/event_duration_12hour_test.sql` (before `select * from finish();`) — the fixture block from Step 3 is already in place, and this is where the generated column is actually exercised:

```sql
select is(
  (select ends_at from public.events
    where id = public.create_event(
      'Convention', 'party', '2026-11-12 18:00:00+01', 'Community Centre', null,
      false, false, true, true, true, true, 3
    )),
  timestamptz '2026-11-14 18:00:00+01',
  'a three-day event ends at the same wall clock two days later'
);

select throws_ok(
  $$select public.create_event(
    'Too Long', 'other', '2026-11-20 18:00:00+01', 'Club Hall', null,
    false, true, false, false, false, false, 31
  )$$,
  '23514',
  'The event details or fixed feature selection is invalid.',
  'a duration beyond the maximum is refused by the procedure'
);

select throws_ok(
  $$select public.create_event(
    'Zero Days', 'other', '2026-11-20 18:00:00+01', 'Club Hall', null,
    false, true, false, false, false, false, 0
  )$$,
  '23514',
  'The event details or fixed feature selection is invalid.',
  'a duration below the minimum is refused by the procedure'
);

-- The row carries the count, and ends_at was generated from it by the database, not the caller.
select is(
  (select duration_days from public.events where title = 'Convention'),
  3,
  'the explicit duration reached the row'
);

select lives_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Extend the convention by one day', 4
  )$$,
  'an authorized editor may change the day count with a reason'
);
select is(
  (select ends_at from public.events where title = 'Convention'),
  timestamptz '2026-11-15 18:00:00+01',
  'the generated end instant follows the edited duration'
);
select is(
  (select after_data ->> 'duration_days' from public.audit_log
    where action = 'event_details_updated' and entity_id =
      (select id from public.events where title = 'Convention')
    order by created_at desc limit 1),
  '4',
  'the audit trail records the new day count'
);
select is(
  (select before_data ->> 'duration_days' from public.audit_log
    where action = 'event_details_updated' and entity_id =
      (select id from public.events where title = 'Convention')
    order by created_at desc limit 1),
  '3',
  'the audit trail records the day count it replaced'
);

-- An edit that changes only the day count must not be swallowed by the no-op return.
select lives_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Shorten the convention', 2
  )$$,
  'a duration-only edit is recognised as a real change'
);
select is(
  (select count(*) from public.audit_log
    where action = 'event_details_updated'
      and entity_id = (select id from public.events where title = 'Convention')),
  2::bigint,
  'a duration-only edit is audited'
);

select throws_ok(
  $$select public.update_event_details(
    (select id from public.events where title = 'Convention'),
    'Convention', '2026-11-12 18:00:00+01', 'Community Centre', null,
    'Missing the day count'
  )$$,
  '42883',
  'an editor cannot omit the day count and silently reset the event to one day'
);

That last assertion is the point of making the parameter required rather than defaulted: a
six-argument call has no overload left to resolve to, so Postgres raises undefined_function
(SQLSTATE 42883). Run the block once against the local database and, if the SQLSTATE differs,
use what Postgres actually reports and note it in the commit message.

- [ ] **Step 8: Run both suites and the whole database test set**

```bash
npx supabase test db --local supabase/tests/database/event_duration_12hour_test.sql
npx supabase test db --local
```

Expected: the new suite passes alone; the full run must show **no new** failures. The eleven-argument `public.create_event(...)` callers across `announcements_polls`, `club_administrator_appointment`, `club_event_shared_balance`, `event_finance_ticketing_ledger`, `events_roles_budgets_lifecycle`, `in_app_notifications`, `meetings_minutes_attendance`, `notification_outbox_reminders` and `payment_methods` must still compile precisely because of the `default 1`. Gate on zero `not ok` attributable to your files, with the seven known stale-name suites as the accepted baseline.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20261104120000_event_duration_and_12hour_time.sql \
        supabase/tests/database/event_duration_12hour_test.sql \
        supabase/tests/database/events_roles_budgets_lifecycle_test.sql \
        supabase/tests/database/notification_outbox_reminders_test.sql
git commit -m "feat(events): carry the day count through the event write procedures"
```

---
## Task 5: The reminder email clock reads 12-hour

The scheduler's email body is built in SQL by `public.evaluate_notification_reminders`, which formats the start instant with `'FMDay, FMDD FMMonth YYYY "at" FMHH24:MI'`. Spec §5 puts emails inside the 12-hour sweep, so that one format string has to change. The function is 362 lines; it is re-created with `create or replace` (the pattern this repo already uses in `20261031234554` and `20261101010000`), and the body is **copied programmatically, never retyped** — a hand-copied 362-line definer function is how privilege regressions sneak in.

**Files:**
- Modify (append): `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql`
- Modify (append): `supabase/tests/database/event_duration_12hour_test.sql`
- Read-only reference: `supabase/migrations/20261027000000_scalable_notification_outbox_and_reminders.sql:1344-1708` (`v_when_local` declared at `:1363`, assigned at `:1459-1462`, consumed by `v_body` at `:1463-1464`)
- Create then delete: `scripts/tmp-extract-reminders.cjs`

**Interfaces:**
- Consumes: the Task 3 fixture in `supabase/tests/database/event_duration_12hour_test.sql` — ten `auth.users` rows (`…0701`-`…0710`), `member_profiles` rows `0701`-`0708` active, `0701` holding the `admin` role — and Task 4's `public.create_event(...)` whose `default 1` keeps eleven-argument callers legal.
- Produces: `event_reminder_*` outbox rows whose `body_text` renders the start as `… at 6:00 PM (Africa/Lagos) …`. No later task reads that string: Step 1 asserts it in pgTAP, and Task 11 re-runs the same suite.

- [ ] **Step 1: Append the failing assertion to the pgTAP suite**

Add to the end of `supabase/tests/database/event_duration_12hour_test.sql`, immediately **before** the closing `select * from finish();` line (keep the transaction open — this is one suite, not two):

```sql
-- A party twelve days out leaves every slot window in the future, so the 7d slot
-- can be evaluated deterministically while the local wall clock still reads
-- 18:00. date_trunc + interval keeps the fixture hour pinned no matter when the
-- suite runs.
select set_config(
  'test.dur12_starts',
  (
    select ((date_trunc('day', clock_timestamp() at time zone 'Africa/Lagos')
             + interval '12 days 18 hours') at time zone 'Africa/Lagos')::text
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
select set_config(
  'test.dur12_event',
  public.create_event(
    'Twelve day party', 'party',
    current_setting('test.dur12_starts')::timestamptz,
    'Garden', 'Reminder clock test',
    false, false, false, false, false, false
  )::text,
  true
);
reset role;

select set_config(
  'test.dur12_eval',
  (
    select (scheduled_for + interval '5 minutes')::text
    from public.notification_reminders
    where entity_id = current_setting('test.dur12_event')::uuid
      and reminder_slot = '7d_before'
  ),
  true
);

select public.evaluate_notification_reminders(
  current_setting('test.dur12_eval')::timestamptz
);

select ok(
  (select count(*) > 0
   from public.notification_outbox
   where trigger_type = 'event_reminder_7d'
     and template_payload->>'event_id' = current_setting('test.dur12_event')),
  'the due seven-day event reminder fans out into the outbox'
);

select ok(
  (select bool_and(
      body_text ~ ' at (1[0-2]|[1-9]):[0-5][0-9] (AM|PM) '
      and body_text not like '%at 18:00%'
      and body_text not like '%at 06:00%'
    )
   from public.notification_outbox
   where trigger_type = 'event_reminder_7d'
     and template_payload->>'event_id' = current_setting('test.dur12_event')),
  'the event reminder email prints the start time on a 12-hour clock'
);
```

The first `ok` is a guard: without it `bool_and` over zero rows returns `null`, `ok(null)` fails, and a broken fixture would look like a formatting bug. The second `ok` is the actual spec assertion.

- [ ] **Step 2: Run the suite and watch it fail on the clock, not on the fixture**

```bash
npx supabase db push --local --include-all
npx supabase test db --local supabase/tests/database/event_duration_12hour_test.sql
```

Expected: `not ok` on *"the event reminder email prints the start time on a 12-hour clock"* and `ok` on *"… fans out into the outbox"*. If the first guard also fails, the reminder was never seeded — check that the fixture event is more than seven days in the future before touching any SQL. Do not proceed until the failure is exactly the clock assertion.

- [ ] **Step 3: Copy the function body into the new migration**

Create `scripts/tmp-extract-reminders.cjs` with exactly this content:

```js
const { readFileSync, appendFileSync } = require("fs");

const source =
  "supabase/migrations/20261027000000_scalable_notification_outbox_and_reminders.sql";
const target =
  "supabase/migrations/20261104120000_event_duration_and_12hour_time.sql";

const lines = readFileSync(source, "utf8").split("\n");
const body = lines.slice(1346, 1708).join("\n");
const copied = body.split("\n");

if (!copied[0].startsWith("create or replace function public.evaluate_notification_reminders(")) {
  throw new Error(`start anchor drifted: ${copied[0]}`);
}
if (copied[copied.length - 1].trim() !== "$function$;") {
  throw new Error(`end anchor drifted: ${copied[copied.length - 1]}`);
}

appendFileSync(
  target,
  [
    "",
    "-- 12. Reminder emails now speak a 12-hour clock. The body below is copied",
    "--     verbatim from 20261027000000_scalable_notification_outbox_and_reminders",
    "--     (lines 1347-1708); the only change is the v_when_local assignment.",
    body,
    "",
  ].join("\n"),
);

console.log("copied lines:", copied.length);
```

Run it from the repository root and delete it immediately:

```bash
node scripts/tmp-extract-reminders.cjs
rm scripts/tmp-extract-reminders.cjs
```

Expected: `copied lines: 362`. A thrown `anchor drifted` error means the reference migration is not where this plan read it — stop and re-locate the function with `grep -n 'create or replace function public.evaluate_notification_reminders' supabase/migrations/20261027000000_scalable_notification_outbox_and_reminders.sql` rather than adjusting the slice blindly.

- [ ] **Step 4: Apply the one edit that was allowed**

In the block just appended to `supabase/migrations/20261104120000_event_duration_and_12hour_time.sql`, replace:

```sql
          v_when_local := pg_catalog.to_char(
            v_event.starts_at at time zone v_timezone,
            'FMDay, FMDD FMMonth YYYY "at" FMHH24:MI'
          );
```

with:

```sql
          v_when_local := pg_catalog.to_char(
            v_event.starts_at at time zone v_timezone,
            'FMDay, FMDD FMMonth YYYY "at"'
          )
            || ' '
            || pg_catalog.ltrim(
              pg_catalog.to_char(
                v_event.starts_at at time zone v_timezone,
                'FMHH12'
              ),
              '0'
            )
            || pg_catalog.to_char(
              v_event.starts_at at time zone v_timezone,
              ':MI'
            )
            || case
              when pg_catalog.extract(hour from v_event.starts_at at time zone v_timezone) < 12
                then ' AM'
              else ' PM'
            end;
```

Three things are deliberate and must not be "tidied": the trailing space lives **outside** the `to_char` literal because `FM` mode strips padding blanks; minutes come from a separate `':MI'` call so `FM` cannot eat the leading zero (nine-oh-five must render `9:05`, never `9:5`); and `HH12` never yields `0`, so `ltrim(…, '0')` only corrects a zero-padded single digit. Nothing else in the copied function changes — the meridiem comes from the local-hour `extract`, matching the instant the label displays.

- [ ] **Step 5: Prove the format expression outside the function**

```bash
npx supabase db query --local --dbname postgres "select to_char(x, 'FMDay, FMDD FMMonth YYYY \"at\"') || ' ' || ltrim(to_char(x, 'FMHH12'), '0') || to_char(x, ':MI') || case when extract(hour from x) < 12 then ' AM' else ' PM' end as label from (values (timestamp '2026-11-12 18:00:00'), (timestamp '2026-11-12 09:05:00'), (timestamp '2026-11-12 00:30:00'), (timestamp '2026-11-12 12:00:00')) as t(x);"
```

Expected: four rows whose clock suffixes are exactly `6:00 PM`, `9:05 AM`, `12:30 AM`, `12:00 PM`. The weekday name is whatever Postgres computes for that date and is not part of the assertion.

- [ ] **Step 6: Replay and re-run the suite**

```bash
npx supabase db reset --local
npx supabase test db --local supabase/tests/database/event_duration_12hour_test.sql
```

Replay with `db reset --local`, not `db push --local --include-all`: this task appends the re-created `evaluate_notification_reminders` to a migration file the local database already applied, and `db push` tracks migrations by version — a skipped push leaves the OLD 24-hour body installed, which is exactly the failure this step is meant to clear. The reset also gives the pgTAP run the clean database the project baseline requires.

Expected: every `ok`, no `not ok`, ending with `# Completed successfully`.

- [ ] **Step 7: Confirm the neighbours did not move**

```bash
npx supabase test db --local supabase/tests/database/notification_outbox_reminders_test.sql
```

Expected: the same result as before this task. That suite never asserts on the time label (its event-reminder assertions are on `state`, `batch_group_key`, `cta_url`, `heading`, and row counts), so a change there means the copied function drifted — diff the appended block against `20261027000000_scalable_notification_outbox_and_reminders.sql:1347-1708` and fix the copy, not the test.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261104120000_event_duration_and_12hour_time.sql \
        supabase/tests/database/event_duration_12hour_test.sql
git commit -m "feat(events): put the reminder email clock on 12-hour time"
```

Expected: `git status` shows no leftover `scripts/tmp-*` from this task (Step 3 removed it).

---

## Task 6: The server actions receive split fields and a day count

`createEventAction` and `updateEventDetailsAction` are the only writers of `public.events.starts_at`, so they are the only place the five new form fields become an instant. This task also does the work spec §4 needs for notifications that no form field can express: an event's `ends_at` is derived, and today `actions.ts` hard-codes `endsAt: ""` into both the fingerprint and the change summary — which means a duration-only edit is currently invisible to members. Filling that in makes "End changed from … to …" fire for real.

**Files:**
- Modify: `src/lib/event-schedule.mjs` (append `endsAtFromStart`)
- Modify: `tests/event-schedule.test.mjs` (append its test)
- Modify: `src/app/actions.ts:7-53` (import), `:67-74` (interface), `:76-92` (`eventFingerprint`), `:94-130` (`eventChangeSummary`), `:1677-1698` + `:1723-1735` (create), `:1766-1782` + `:1796-1811` + `:1819-1833` (update)

**Interfaces:**
- Consumes: `parseEventSchedule(parts)` and `parseDurationDays(value)` from Task 1; `public.create_event(..., p_duration_days)` and `public.update_event_details(..., p_duration_days)` from Task 4.
- Produces: `endsAtFromStart(startsAt: string, durationDays: number): string` — an ISO instant, `starts_at + (durationDays - 1)` days, byte-compatible with the generated `ends_at` column. Task 7 does not use it; Task 8's presentation code reads `ends_at` from the database instead.

- [ ] **Step 1: Write the failing test for the derived end instant**

Append to `tests/event-schedule.test.mjs` and add `endsAtFromStart` to the module's import list at the top of the file:

```js
test("endsAtFromStart reproduces the generated ends_at column", () => {
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 1), "2026-11-12T17:00:00.000Z");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 3), "2026-11-14T17:00:00.000Z");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 30), "2026-12-12T17:00:00.000Z");
});

test("endsAtFromStart refuses nonsense instead of inventing an instant", () => {
  assert.equal(endsAtFromStart("not-a-date", 3), "");
  assert.equal(endsAtFromStart("", 3), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 0), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 2.5), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", 31), "");
  assert.equal(endsAtFromStart("2026-11-12T17:00:00.000Z", null), "");
});

test("endsAtFromStart crosses daylight-saving-free Lagos midnight on whole days", () => {
  // 23:30 WAT on 12 November, three days: the last day starts 23:30 WAT on 14 November.
  assert.equal(endsAtFromStart("2026-11-12T22:30:00.000Z", 3), "2026-11-14T22:30:00.000Z");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: FAIL — `does not provide an export named 'endsAtFromStart'`. If it fails any other way, fix that first.

- [ ] **Step 3: Implement it in `src/lib/event-schedule.mjs`**

Append below `splitInstantForForm`:

```js
const DAY_MS = 86_400_000;

/**
 * Reproduces public.events.ends_at, which Postgres computes as
 * starts_at + ((duration_days - 1) * interval '1 day'). Lagos has no DST, so a
 * fixed 24-hour step is exact.
 *
 * @param {unknown} startsAt
 * @param {unknown} durationDays
 * @returns {string} the instant, or an empty string when either input is unusable
 */
export function endsAtFromStart(startsAt, durationDays) {
  if (typeof startsAt !== "string" || startsAt.length === 0) return "";
  const milliseconds = new Date(startsAt).getTime();
  if (Number.isNaN(milliseconds)) return "";
  const days = parseDurationDays(durationDays);
  if (days === null) return "";
  return new Date(milliseconds + (days - 1) * DAY_MS).toISOString();
}
```

`parseDurationDays` is the same 1-30 gate the action and the database use, so the JS mirror cannot drift from the `check` constraint without a test noticing.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: PASS, all tests, pristine output.

- [ ] **Step 5: Rewire `createEventAction`**

In `src/app/actions.ts`, add the import between the `@/lib/event-finance-tab.mjs` and `@/lib/event-validation.mjs` blocks (the file keeps its imports sorted by path):

```ts
import {
  endsAtFromStart,
  parseDurationDays,
  parseEventSchedule,
} from "@/lib/event-schedule.mjs";
```

Replace the `starts_at` entry in the `allowed` array (`:1680`) with the five field names, so the array reads:

```ts
  const allowed = [
    "title",
    "event_type",
    "event_date",
    "start_hour",
    "start_minute",
    "meridiem",
    "duration_days",
    "location",
    "description",
    "minutes_enabled",
    "attendance_enabled",
    "budget_enabled",
    "income_enabled",
    "expenses_enabled",
    "ticketing_enabled",
  ];
```

Replace lines `:1695-1698` (`if (formData.getAll("starts_at").length !== 1)` through `const startsAt = eventDateTimeToISOString(...)`) with:

```ts
  for (const key of ["event_date", "start_hour", "start_minute", "meridiem"]) {
    if (formData.getAll(key).length !== 1) {
      redirect(eventNoticeUrl("invalid-request"));
    }
  }
  const schedule = parseEventSchedule({
    eventDate: formData.get("event_date"),
    startHour: formData.get("start_hour"),
    startMinute: formData.get("start_minute"),
    meridiem: formData.get("meridiem"),
  });
  if (!schedule.ok) redirect(eventNoticeUrl("invalid-request"));
  const startsAt = schedule.startsAt;
  const durationDays = parseDurationDays(formData.get("duration_days"));
  if (durationDays === null) redirect(eventNoticeUrl("invalid-request"));
```

Add the day count to the rpc payload, after `p_ticketing_enabled` (`:1734`):

```ts
    p_ticketing_enabled: ticketingEnabled,
    p_duration_days: durationDays,
```

Leave the `notifyNewEventScheduled({ eventId, title, eventType, startsAt, location, description })` call untouched: the created-event email announces the start, and Task 9 gives it the 12-hour label.

`eventDateTimeToISOString` keeps its import — `:3278` still uses it for a non-event form — and `src/lib/event-validation.mjs` is not modified by this plan.

- [ ] **Step 6: Rewire `updateEventDetailsAction`**

Replace the allowlist at `:1767-1774` with:

```ts
    !eventFieldsOnly(formData, [
      "event_id",
      "title",
      "event_date",
      "start_hour",
      "start_minute",
      "meridiem",
      "duration_days",
      "location",
      "description",
      "reason",
    ])
```

Replace lines `:1779-1782` with the same parse block used in Step 5 (`event_date`/`start_hour`/`start_minute`/`meridiem` → `startsAt`, plus `durationDays`), keeping the surrounding `title` / `location` / `description` / `reason` reads and their combined validity check. The `!startsAt` and a new `durationDays === null` condition belong in that check:

```ts
  if (
    !title ||
    !startsAt ||
    durationDays === null ||
    !location ||
    description === undefined ||
    !reason
  ) {
    redirect(eventNoticeUrl("invalid-request"));
  }
```

Because `parseDurationDays` returns `null` for anything outside 1-30, narrow `durationDays` to a plain number before the rpc by asserting it once, immediately after that block:

```ts
  const days = durationDays as number;
```

Add `duration_days` to the pre-image select (`:1799`) — the generated `ends_at` is deliberately **not** selected, because the action must compare what it computes against what it computes, not against a column a trigger owns:

```ts
    .select(
      "event_type, title, starts_at, location, description, timezone, status, duration_days",
    )
```

Add `p_duration_days: days` to the `update_event_details` payload after `p_description` (`:1809`). This is the required seventh argument from spec deviation §1 — omitting it is a `42883`, not a silent one-day reset.

Extend the row shape at `:67-74` with the derived end:

```ts
interface EventScheduleRow {
  event_type: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  description: string | null;
  timezone: string | null;
}
```

and use it in both `eventFingerprint` (`:87`) and `eventChangeSummary` (`:117`, `:124`) by replacing each hard-coded `endsAt: "",` with:

```ts
    endsAt: row.ends_at ?? "",
```

(`eventChangeSummary` has two objects, so the two occurrences become `before.ends_at ?? ""` and `after.ends_at ?? ""`.)

Finally, fill `ends_at` on both literals at `:1819-1833`:

```ts
    const before: EventScheduleRow = {
      event_type: beforeRow.event_type,
      title: beforeRow.title,
      starts_at: beforeRow.starts_at,
      ends_at: endsAtFromStart(
        beforeRow.starts_at,
        beforeRow.duration_days ?? 1,
      ),
      location: beforeRow.location,
      description: beforeRow.description,
      timezone: beforeRow.timezone,
    };
    const after: EventScheduleRow = {
      ...before,
      title,
      starts_at: startsAt,
      ends_at: endsAtFromStart(startsAt, days),
      location,
      description,
    };
```

`after` spreads `before`, so `ends_at` must be overridden explicitly — that line is the difference between a duration change notifying and not notifying at all. The meeting branch of both helpers still passes `endTime: ""` and is out of scope: meetings keep their own start-only model.

- [ ] **Step 7: Typecheck, lint, and re-run the suites that read this file**

```bash
npx tsc --noEmit
npm run lint
npm test -- tests/event-creation-validation.test.mjs tests/event-schedule.test.mjs tests/meaningful-change-detector.test.mjs tests/notification-trigger-matrix.test.mjs
```

Expected: `tsc` clean (if it reports `beforeRow.duration_days` as `unknown`, the select string is wrong — PostgREST types come from the columns you asked for). `npm run lint` clean. All four test files pass; `tests/meaningful-change-detector.test.mjs` and `tests/notification-trigger-matrix.test.mjs` are included because they exercise the fingerprint and summary paths whose `endsAt` input just changed from `""` to a real instant, and neither one asserts that the value is empty.

- [ ] **Step 8: Commit**

```bash
git add src/app/actions.ts src/lib/event-schedule.mjs tests/event-schedule.test.mjs
git commit -m "feat(events): accept split schedule fields and a day count in the event actions"
```

---
## Task 7: Two forms that ask for date, clock, and length separately

Spec §2 replaces the single `datetime-local` control in both the create form and the edit modal with a date input, an hour select, a minute select, an AM/PM select, and a day-count select. The edit modal has one trap the create form does not: a legacy event can sit on an off-grid minute (`9:37 AM` came from a free-typed `datetime-local`), and a `<select>` that only lists the five-minute grid would silently move that event on an unrelated edit. So the option list is a tested function, not an inline `map`.

**Files:**
- Modify: `src/lib/event-schedule.mjs` (append `minuteSelectOptions`)
- Modify: `tests/event-schedule.test.mjs` (append its test)
- Create: `tests/event-schedule-form.test.mjs`
- Modify: `src/components/events/event-types.ts:7-30`
- Modify: `src/app/(member)/events/page.tsx:34`
- Modify: `src/components/events/create-event-disclosure.tsx:154-191`
- Modify: `src/components/events/event-edit-modal.tsx:16-19`, `:155-171`

**Interfaces:**
- Consumes: `MINUTE_STEPS`, `MAX_DURATION_DAYS`, `splitInstantForForm` from Task 1; `formatEventDurationLabel` from Task 2.
- Produces: `minuteSelectOptions(selectedMinute: unknown, steps?: readonly number[]): { value: string; label: string }[]`; form fields named `event_date`, `start_hour`, `start_minute`, `meridiem`, `duration_days` (consumed by Task 6's actions); `EventRow.duration_days?: number` and `EventRow.ends_at?: string | null` (consumed by Task 8 and Task 9).

- [ ] **Step 1: Write the failing test for the minute option list**

Append to `tests/event-schedule.test.mjs` and add `minuteSelectOptions` to the import list at the top of the file:

```js
test("minuteSelectOptions offers the five-minute grid in ascending order", () => {
  const options = minuteSelectOptions("");
  assert.equal(options.length, 12);
  assert.deepEqual(options.slice(0, 3), [
    { value: "00", label: "00" },
    { value: "05", label: "05" },
    { value: "10", label: "10" },
  ]);
  assert.deepEqual(options.at(-1), { value: "55", label: "55" });
});

test("minuteSelectOptions keeps an off-grid minute selectable and in order", () => {
  const options = minuteSelectOptions("37");
  assert.equal(options.length, 13);
  assert.ok(options.some((option) => option.value === "37"));
  const values = options.map((option) => Number(option.value));
  assert.deepEqual(values, [...values].sort((left, right) => left - right));
});

test("minuteSelectOptions ignores a grid minute or junk instead of duplicating it", () => {
  assert.equal(minuteSelectOptions("30").length, 12);
  assert.equal(minuteSelectOptions(null).length, 12);
  assert.equal(minuteSelectOptions("7").length, 12);
  assert.equal(minuteSelectOptions(undefined).length, 12);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: FAIL — `does not provide an export named 'minuteSelectOptions'`.

- [ ] **Step 3: Implement it in `src/lib/event-schedule.mjs`**

Append below `parseDurationDays`:

```js
/**
 * The minute control offers a five-minute grid, but a legacy event can sit on an
 * off-grid minute typed into the old datetime-local field. Keeping that minute
 * selectable is what stops an unrelated edit from silently moving the start.
 *
 * @param {unknown} selectedMinute
 * @param {readonly number[]} [steps]
 * @returns {{ value: string, label: string }[]}
 */
export function minuteSelectOptions(selectedMinute, steps = MINUTE_STEPS) {
  const options = steps.map((step) => {
    const value = padTwo(step);
    return { value, label: value };
  });
  const selected = typeof selectedMinute === "string" ? selectedMinute : "";
  if (
    /^\d{2}$/.test(selected) &&
    !options.some((option) => option.value === selected)
  ) {
    options.push({ value: selected, label: selected });
    options.sort(
      (left, right) => Number(left.value) - Number(right.value),
    );
  }
  return options;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/event-schedule.test.mjs`
Expected: PASS, all tests, pristine output.

- [ ] **Step 5: Write the failing source-text test for both forms**

Create `tests/event-schedule-form.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createSource = readFileSync(
  "src/components/events/create-event-disclosure.tsx",
  "utf8",
);
const editSource = readFileSync(
  "src/components/events/event-edit-modal.tsx",
  "utf8",
);

const scheduleFields = [
  "event_date",
  "start_hour",
  "start_minute",
  "meridiem",
  "duration_days",
];

for (const [name, source] of [
  ["create-event-disclosure.tsx", createSource],
  ["event-edit-modal.tsx", editSource],
]) {
  test(`${name} posts the split schedule fields`, () => {
    for (const field of scheduleFields) {
      assert.match(source, new RegExp(`name="${field}"`));
    }
    assert.doesNotMatch(
      source,
      /name="starts_at"/,
      "the combined datetime field must be gone",
    );
    assert.doesNotMatch(
      source,
      /datetime-local/,
      "no datetime-local control may survive",
    );
  });
}

test("the edit modal seeds its controls from the stored instant", () => {
  assert.match(editSource, /splitInstantForForm\(event\.starts_at\)/);
  assert.match(editSource, /minuteSelectOptions\(/);
  assert.doesNotMatch(
    editSource,
    /function dateTimeLocalValue/,
    "the hand-rolled +01:00 shim must be deleted, not left unused",
  );
});

test("the create form defaults to a single day", () => {
  assert.match(
    createSource,
    /name="duration_days"[\s\S]{0,200}defaultValue=\{?"1"\}?/,
  );
});

test("the schedule is entered as a date control, not a datetime-local", () => {
  for (const source of [createSource, editSource]) {
    assert.match(source, /type="date"/);
    assert.match(source, /name="meridiem"[\s\S]{0,400}>\s*AM\s*</);
    assert.match(source, /name="meridiem"[\s\S]{0,600}>\s*PM\s*</);
  }
});
```

The AM/PM assertions are what prove the meridiem is a real control rather than a hidden field: `name="meridiem"` followed within the same block by both `AM` and `PM` as option text. A `type="date"` plus a bare `start_hour` select with no meridiem would still satisfy every earlier assertion in this file, and would silently store the wrong instant.

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- tests/event-schedule-form.test.mjs`
Expected: FAIL on the first create-form assertion (`name="event_date"` missing). If a test errors instead of failing, the file path in the `readFileSync` call is wrong.

- [ ] **Step 7: Let the row type and the events query carry the new columns**

In `src/components/events/event-types.ts`, insert after `starts_at: string;` (both new members are optional on purpose — the attendance and ticketing pages build `EventRow` objects by cast, and required members would break those files):

```ts
  starts_at: string;
  duration_days?: number;
  ends_at?: string | null;
```

In `src/app/(member)/events/page.tsx:34`, extend the select string so the edit modal can seed its controls. `duration_days` and `ends_at` are granted to `authenticated` in Task 3 — adding a column to a select without its grant is how this project has previously emptied whole dashboard reads:

```ts
        "id,title,event_type,starts_at,duration_days,ends_at,location,description,minutes_enabled,attendance_enabled,budget_enabled,income_enabled,expenses_enabled,ticketing_enabled,status,status_changed_at,archived_at,created_at,updated_at",
```

- [ ] **Step 8: Rebuild the create form block**

In `src/components/events/create-event-disclosure.tsx`, add to the imports at the top:

```tsx
import {
  MAX_DURATION_DAYS,
  minuteSelectOptions,
} from "@/lib/event-schedule.mjs";
import { formatEventDurationLabel } from "@/lib/event-times.mjs";
```

Add these module-level constants above `interface CreateEventDisclosureProps`:

```tsx
const HOUR_OPTIONS = Array.from({ length: 12 }, (_unused, index) =>
  String(index + 1),
);
const DURATION_OPTIONS = Array.from(
  { length: MAX_DURATION_DAYS },
  (_unused, index) => index + 1,
);
const FIELD_CLASS =
  "w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const PART_CLASS =
  "w-full h-11 px-2 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const LABEL_CLASS =
  "block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5";
const HINT_CLASS = "text-[10px] text-[#7A685D] mt-1 block";
```

Then replace the whole `{/* Schedule & Venue */}` block at `:154-191` with:

```tsx
              {/* Schedule & Venue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLASS} htmlFor="create-event-date">
                    Start Date <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    className={FIELD_CLASS}
                    id="create-event-date"
                    name="event_date"
                    required
                    type="date"
                  />
                </div>

                <div>
                  <label
                    className={LABEL_CLASS}
                    htmlFor="create-event-start-hour"
                  >
                    Start Time <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      className={PART_CLASS}
                      defaultValue=""
                      id="create-event-start-hour"
                      name="start_hour"
                      required
                    >
                      <option disabled value="">
                        Hour
                      </option>
                      {HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                    <select
                      className={PART_CLASS}
                      defaultValue=""
                      id="create-event-start-minute"
                      name="start_minute"
                      required
                    >
                      <option disabled value="">
                        Min
                      </option>
                      {minuteSelectOptions("").map((minute) => (
                        <option key={minute.value} value={minute.value}>
                          {minute.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className={PART_CLASS}
                      defaultValue="PM"
                      id="create-event-meridiem"
                      name="meridiem"
                      required
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                  <span className={HINT_CLASS}>
                    12-hour clock, West Africa Time.
                  </span>
                </div>

                <div>
                  <label
                    className={LABEL_CLASS}
                    htmlFor="create-event-duration-days"
                  >
                    Runs For <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <select
                    className={FIELD_CLASS}
                    defaultValue="1"
                    id="create-event-duration-days"
                    name="duration_days"
                    required
                  >
                    {DURATION_OPTIONS.map((days) => (
                      <option key={days} value={String(days)}>
                        {formatEventDurationLabel(days)}
                      </option>
                    ))}
                  </select>
                  <span className={HINT_CLASS}>
                    The last day keeps the event live all day, even after its
                    start has passed.
                  </span>
                </div>

                <div>
                  <label
                    className={LABEL_CLASS}
                    htmlFor="create-event-location"
                  >
                    Location / Venue <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    defaultValue="Fobbs Apartment, Michael Fidelis Nwaefulu Street, GRA Phase 1, Asaba"
                    id="create-event-location"
                    maxLength={200}
                    name="location"
                    required
                  />
                </div>
              </div>
```

The placeholder `<option disabled value="">` plus `required` is what makes the browser stop an incomplete schedule before the action ever runs, and `defaultValue="PM"` keeps the meridiem a value that is always present, matching Task 6's `meridiem !== "AM" && meridiem !== "PM"` rejection.

- [ ] **Step 9: Rebuild the edit modal block**

In `src/components/events/event-edit-modal.tsx`, delete the `dateTimeLocalValue` helper at `:16-19` entirely — its `+ 60 * 60 * 1000` hand-rolled Lagos shift is exactly what `splitInstantForForm` replaces — and add to the imports:

```tsx
import {
  MAX_DURATION_DAYS,
  minuteSelectOptions,
  splitInstantForForm,
} from "@/lib/event-schedule.mjs";
import { formatEventDurationLabel } from "@/lib/event-times.mjs";
```

Add module-level constants above `interface EventEditModalProps`:

```tsx
const HOUR_OPTIONS = Array.from({ length: 12 }, (_unused, index) =>
  String(index + 1),
);
const DURATION_OPTIONS = Array.from(
  { length: MAX_DURATION_DAYS },
  (_unused, index) => index + 1,
);
const FIELD_CLASS =
  "w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const PART_CLASS =
  "w-full h-10 px-2 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const LABEL_CLASS =
  "block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5";
```

Immediately after `if (!isOpen || !event) return null;` at `:82` (so `event` is already narrowed), add:

```tsx
  const schedule = splitInstantForForm(event.starts_at);
  const minuteOptions = minuteSelectOptions(schedule?.startMinute);
```

Then replace the `{/* Date & Time */}` block at `:155-171` with:

```tsx
          {/* Start date, 12-hour clock, and length */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="edit-event-date">
                Start Date <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className={FIELD_CLASS}
                defaultValue={schedule?.eventDate ?? ""}
                id="edit-event-date"
                name="event_date"
                required
                type="date"
              />
            </div>

            <div>
              <label
                className={LABEL_CLASS}
                htmlFor="edit-event-duration-days"
              >
                Runs For <span className="text-[#BA3C2A]">*</span>
              </label>
              <select
                className={FIELD_CLASS}
                defaultValue={String(event.duration_days ?? 1)}
                id="edit-event-duration-days"
                name="duration_days"
                required
              >
                {DURATION_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {formatEventDurationLabel(days)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL_CLASS} htmlFor="edit-event-start-hour">
                Start Time <span className="text-[#BA3C2A]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.startHour ?? ""}
                  id="edit-event-start-hour"
                  name="start_hour"
                  required
                >
                  <option disabled value="">
                    Hour
                  </option>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.startMinute ?? ""}
                  id="edit-event-start-minute"
                  name="start_minute"
                  required
                >
                  <option disabled value="">
                    Min
                  </option>
                  {minuteOptions.map((minute) => (
                    <option key={minute.value} value={minute.value}>
                      {minute.label}
                    </option>
                  ))}
                </select>
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.meridiem ?? "PM"}
                  id="edit-event-meridiem"
                  name="meridiem"
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>
```

Every control keeps the stored value as its `defaultValue`, so opening the modal and saving a title-only change posts the same instant and the same day count it started with. The `htmlFor="edit-event-start-hour"` on the wide time label is intentional: the first control in that group is the hour select.

- [ ] **Step 10: Run both suites, typecheck, and lint**

```bash
npm test -- tests/event-schedule.test.mjs tests/event-schedule-form.test.mjs
npx tsc --noEmit
npm run lint
```

Expected: both test files PASS; `tsc` clean (a `Property 'duration_days' does not exist` error means Step 7 was skipped or the interface member was added without the `?`); biome clean.

- [ ] **Step 11: Commit**

```bash
git add src/lib/event-schedule.mjs tests/event-schedule.test.mjs \
        tests/event-schedule-form.test.mjs src/components/events/event-types.ts \
        "src/app/(member)/events/page.tsx" \
        src/components/events/create-event-disclosure.tsx \
        src/components/events/event-edit-modal.tsx
git commit -m "feat(events): split the date, 12-hour clock, and day count in both event forms"
```

---

## Task 8: The live window spans the whole event

Spec §3 says an event stays upcoming from its start until the end of its **last** day. Three readers decide "upcoming" today, and all three compare against `starts_at` alone: the events page grouping, the card's "Awaiting Completion" badge, and two queries plus one row filter in the home dashboard. The grouping rule has lived twice — once in `events-page-view.tsx` and once as a copy inside `tests/events-page-presentation.test.mjs` — which is why it moves into a lib module in this task: a rule that exists twice cannot be changed once.

**Files:**
- Create: `src/lib/event-presentation.mjs`
- Create: `tests/event-presentation.test.mjs`
- Modify: `src/components/events/events-page-view.tsx:69-118`
- Modify: `src/components/events/event-card.tsx:77-79`
- Modify: `src/lib/home-dashboard.mjs:1`, `:207-225`, `:448-461`, `:830-841`
- Modify: `tests/home-dashboard.test.mjs:362`
- Modify: `tests/events-page-presentation.test.mjs:4-29`, `:91`

**Interfaces:**
- Consumes: `isEventLiveOrUpcoming(event, now)` from Task 2 — it reads `starts_at` / `ends_at` (snake_case, as they come from PostgREST) and degrades to `starts_at` when `ends_at` was not selected.
- Produces: `groupEventRows(events, now?): { upcoming, recentPast, retainedArchive }` used by `events-page-view.tsx`; `EventRow.ends_at` (added in Task 7) as the data source for all three readers.

- [ ] **Step 1: Write the failing grouping tests**

Create `tests/event-presentation.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { groupEventRows } from "../src/lib/event-presentation.mjs";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");

// Every fixture row is a one-day event unless it says otherwise: ends_at
// defaults to starts_at, which is exactly the invariant the generated column
// enforces in the database.
const row = (id, overrides = {}) => ({
  id,
  title: id,
  status: "scheduled",
  archived_at: null,
  starts_at: "2026-11-15T17:00:00.000Z",
  ...overrides,
  ends_at:
    overrides.ends_at ?? overrides.starts_at ?? "2026-11-15T17:00:00.000Z",
});

test("a scheduled event inside its last day stays upcoming", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("multi", {
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-16T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["multi"],
  );
  assert.equal(recentPast.length, 0);
});

test("a scheduled event past its last day is past", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("finished-window", {
        starts_at: "2026-11-10T17:00:00.000Z",
        ends_at: "2026-11-12T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["finished-window"],
  );
});

test("the instant exactly equal to ends_at is still upcoming", () => {
  const { upcoming } = groupEventRows(
    [
      row("boundary", {
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-16T17:00:00.000Z",
      }),
    ],
    Date.parse("2026-11-16T17:00:00.000Z"),
  );
  assert.equal(upcoming.length, 1);
});

test("a row without ends_at keeps the old start-only rule", () => {
  const legacy = row("legacy", { starts_at: "2026-11-20T17:00:00.000Z" });
  delete legacy.ends_at;
  const { upcoming } = groupEventRows([legacy], NOW);
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["legacy"],
  );
});

test("completed events leave upcoming even inside their window", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("done", {
        status: "completed",
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-20T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["done"],
  );
});

test("archived rows are only ever in retainedArchive", () => {
  const { upcoming, recentPast, retainedArchive } = groupEventRows(
    [
      row("archived", {
        status: "completed",
        archived_at: "2026-11-15T10:00:00.000Z",
        starts_at: "2026-12-01T17:00:00.000Z",
        ends_at: "2026-12-03T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.equal(upcoming.length, 0);
  assert.equal(recentPast.length, 0);
  assert.deepEqual(
    retainedArchive.map((event) => event.id),
    ["archived"],
  );
});

test("upcoming sorts soonest first and past sorts newest first", () => {
  const { upcoming, recentPast } = groupEventRows(
    [
      row("later", { starts_at: "2026-11-30T17:00:00.000Z" }),
      row("sooner", { starts_at: "2026-11-20T17:00:00.000Z" }),
      row("old", {
        status: "completed",
        starts_at: "2026-01-01T17:00:00.000Z",
      }),
      row("newer", {
        status: "completed",
        starts_at: "2026-02-01T17:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    upcoming.map((event) => event.id),
    ["sooner", "later"],
  );
  assert.deepEqual(
    recentPast.map((event) => event.id),
    ["newer", "old"],
  );
});
```

The third test is the one that catches an accidental `>` instead of `>=`; the fourth is the degradation path that keeps every existing `EventRow` literal valid without an `ends_at`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/event-presentation.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/event-presentation.mjs'` (or an ERR_MODULE_NOT_FOUND report). Not a passing run: the module does not exist yet.

- [ ] **Step 3: Create `src/lib/event-presentation.mjs`**

```js
/**
 * @fileoverview The one place that decides which list an event belongs to.
 * The events page and its tests both read these rules, so "upcoming" cannot
 * drift between the two.
 */

import { isEventLiveOrUpcoming } from "./event-times.mjs";

/**
 * @param {{ starts_at: string, ends_at?: string | null, status: string, archived_at: string | null }[]} events
 * @param {number} [now]
 * @returns {{ upcoming: typeof events, recentPast: typeof events, retainedArchive: typeof events }}
 */
export function groupEventRows(events, now = Date.now()) {
  const rows = Array.isArray(events) ? events : [];
  const unarchived = (event) => !event.archived_at;

  const upcoming = rows
    .filter(
      (event) =>
        unarchived(event) &&
        event.status === "scheduled" &&
        isEventLiveOrUpcoming(event, now),
    )
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  const recentPast = rows
    .filter(
      (event) =>
        unarchived(event) &&
        (event.status !== "scheduled" || !isEventLiveOrUpcoming(event, now)),
    )
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

  const retainedArchive = rows
    .filter((event) => Boolean(event.archived_at))
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));

  return { upcoming, recentPast, retainedArchive };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/event-presentation.test.mjs`
Expected: PASS, seven tests, pristine output.

- [ ] **Step 5: Make the events page use it**

In `src/components/events/events-page-view.tsx`, add to the imports:

```tsx
import { groupEventRows } from "@/lib/event-presentation.mjs";
```

and replace the body of the `useMemo` from `const filtered = events.filter(filterFn);` (`:85`) through the closing `};` of the returned object (`:117`) with:

```tsx
    const filtered = events.filter(filterFn);

    return groupEventRows(filtered, Date.now());
  }, [events, selectedType, searchQuery]);
```

Keep the `filterFn` definition above it and keep the destructuring at `:69` (`{ scheduledUpcoming, recentPast, retainedArchive }`) — the names are unchanged, only the rules moved.

- [ ] **Step 6: Delete the mirrored copy from the test file**

In `tests/events-page-presentation.test.mjs`, remove the whole local `groupEvents` function (`:4-29`, including its comment) and add the import:

```js
import { groupEventRows } from "../src/lib/event-presentation.mjs";
```

Then change the call inside the first test (`:91`) to pass the pinned clock explicitly, because the real helper defaults to `Date.now()` while the copy defaulted to a fixture instant:

```js
  const { upcoming, recentPast, retainedArchive } = groupEventRows(
    events,
    new Date("2026-10-16T12:00:00Z").getTime(),
  );
```

Run: `npm test -- tests/events-page-presentation.test.mjs`
Expected: PASS with the existing four tests intact — the fixture rows carry no `ends_at`, so they take the degradation path in Step 3 and keep the start-only verdicts the test already asserts.

- [ ] **Step 7: Fix the card badge**

In `src/components/events/event-card.tsx`, add:

```tsx
import { isEventLiveOrUpcoming } from "@/lib/event-times.mjs";
```

and replace `:77-79` with:

```tsx
  const startDate = new Date(event.starts_at);
  const isPastScheduled =
    event.status === "scheduled" &&
    !isEventLiveOrUpcoming(event, Date.now());
```

The `startDate` line stays because `:126-127` still formats from it. A three-day event now keeps the green "Status: Scheduled" badge through its last day instead of flipping to "Awaiting Completion" the evening after it opened, and the existing "Event date has passed." copy remains accurate for the window that really has ended.

- [ ] **Step 8: Fix the home dashboard queries and row filter**

In `src/lib/home-dashboard.mjs`, add this as the first import (it sorts before the existing `notification-page-presentation.mjs` import):

```js
import { isEventLiveOrUpcoming } from "./event-times.mjs";
```

In `mapEventRow`, delete `const startsAt = Date.parse(row?.starts_at);` (`:208`) — nothing else in the function reads it — and replace the `startsAt < nowTimestamp ||` line inside the rejection chain with:

```js
    !isEventLiveOrUpcoming(row, nowTimestamp) ||
```

In `countUpcomingEvents` (`:455`) and in `eventsQuery` (`:837`), change the bound column:

```js
    .gte("ends_at", nowIso),
```

and add `ends_at` to the `eventsQuery` select list at `:833`, immediately after `starts_at`:

```ts
      "id,title,event_type,starts_at,ends_at,location,status,archived_at,budget_enabled,income_enabled,expenses_enabled,ticketing_enabled,attendance_enabled",
```

`ends_at` is granted to `authenticated` in Task 3, which is what makes it legal in both a filter and a select; an ungranted column here would silently return zero rows. The order stays `starts_at` ascending — a nine-day retreat beginning next week should still lead the list over one beginning in three weeks.

The priority-events rule at `:352` (`startsAt - nowTimestamp <= PRIORITY_EVENT_WINDOW_MS`) is deliberately untouched: it measures how soon an event *begins*, which is a lead-time question, not a live-window question.

- [ ] **Step 9: Update the pinned filter assertion**

In `tests/home-dashboard.test.mjs:362`, the expected filter list becomes:

```js
  assert.deepEqual(eventCountQuery.filters, [
    { method: "eq", column: "status", value: "scheduled" },
    { method: "is", column: "archived_at", value: null },
    { method: "gte", column: "ends_at", value: now.toISOString() },
  ]);
```

Then append a behavioural test for the row filter to the same file, next to the "invalid event rows never enter the dashboard" test at `:508-523`, which is the closest working example. The file already imports `getHomeDashboardData`, and `memberId`, `eventId`, `now`, `baseEvent(...)`, and `createSupabase({ tables })` are all module-level in it. `now` there is `2026-10-31T23:30:00.000Z`, so the fixture below starts **before** `now` and ends **after** it — that pairing is the whole point of the test:

```js
test("an event inside its last day is still upcoming for the member", async () => {
  const supabase = createSupabase({
    tables: {
      events: {
        data: [
          baseEvent({
            starts_at: "2026-10-30T18:00:00+01:00",
            ends_at: "2026-11-02T18:00:00+01:00",
          }),
        ],
        error: null,
        count: 1,
      },
    },
  });

  const dashboard = await getHomeDashboardData(supabase, memberId, now);

  assert.equal(dashboard.events.unavailable, false);
  assert.deepEqual(
    dashboard.events.rows.map((event) => event.id),
    [eventId],
  );
  assert.deepEqual(dashboard.upcomingEventCount, {
    unavailable: false,
    count: 1,
  });
});
```

`baseEvent` is a function that takes overrides, not an object — spreading it would produce a row with no fields and the assertion would pass for the wrong reason. This test fails before Step 8 because `mapEventRow` still rejects `starts_at < now`.

- [ ] **Step 10: Run everything this task touched**

```bash
npm test -- tests/event-presentation.test.mjs tests/events-page-presentation.test.mjs tests/home-dashboard.test.mjs tests/event-times.test.mjs
npx tsc --noEmit
npm run lint
```

Expected: all four test files pass, `tsc` clean, biome clean. If `tests/home-dashboard.test.mjs` fails with `upcoming.events` empty, `eventsQuery` is still filtering on `starts_at`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/event-presentation.mjs tests/event-presentation.test.mjs \
        src/components/events/events-page-view.tsx src/components/events/event-card.tsx \
        src/lib/home-dashboard.mjs tests/home-dashboard.test.mjs \
        tests/events-page-presentation.test.mjs
git commit -m "feat(events): keep an event upcoming through its last day"
```

---

## Task 9: The member's email clock reads 12-hour

Two clocks still speak to members in 24-hour ISO. `src/lib/email/format-schedule.ts:9-13` builds `dateStyle: "medium", timeStyle: "short"` in `en-NG`, which renders `12 Nov 2026, 18:00`, and it feeds all six email surfaces in `src/lib/email/notifications.ts`. `src/lib/notifications/meaningful-change.ts:124-133` puts a raw `2026-11-12T18:00:00.000Z` in the "What Changed" line of the event-changed email.

Both modules are tested by transpiling the `.ts` source with `ts.transpileModule` and importing the result as a base64 `data:text/javascript` URL — see `tests/email-schedule-format.test.mjs:18-26` and `tests/meaningful-change-detector.test.mjs:10-18`. **A data-URL module has no base, so a relative import in either file throws at import time.** That is why each carries its own small clock instead of importing `formatEventTime` from `src/lib/event-times.mjs`, and why the three of them must be changed together, in one commit, so the duplication is bounded and visible.

`src/lib/email/notifications.ts` is **not** modified: `formatSchedule` keeps its name and signature, so all six call sites (`:560` password change, `:833` created, `:890` changed, `:961` cancelled, `:1008` role assigned, `:1174` poll closes) become 12-hour at once, and the three source-text regexes at `tests/email-schedule-format.test.mjs:63-76` keep passing untouched. The spec's rule is "everywhere, emails included", so the poll deadline and the security-confirmation timestamp convert with them rather than being left as the app's last 24-hour emails.

**Files:**
- Modify: `src/lib/email/format-schedule.ts` (whole file)
- Modify: `src/lib/notifications/meaningful-change.ts:118-133` plus one new local helper
- Test: `tests/email-schedule-format.test.mjs` (append two `it` blocks)
- Test: `tests/meaningful-change-detector.test.mjs` (append one `it` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatSchedule(isoString: string, timezone?: string) → string` with the same name and default, now returning `"12 Nov 2026, 6:00 PM WAT"`. Still echoes `isoString` for an unparseable instant or an unusable zone.

- [ ] **Step 1: Write the failing email test**

Append to the `describe` block in `tests/email-schedule-format.test.mjs`, after the test at `:55-61`:

```js
  it("renders the email clock in 12-hour form with an uppercase meridiem", () => {
    assert.equal(
      formatSchedule("2026-11-12T17:00:00.000Z", "Africa/Lagos"),
      "12 Nov 2026, 6:00 PM WAT",
    );
    assert.equal(
      formatSchedule("2026-11-12T23:30:00.000Z", "Africa/Lagos"),
      "13 Nov 2026, 12:30 AM WAT",
    );
    assert.equal(
      formatSchedule("2026-11-12T12:00:00.000Z", "Africa/Lagos"),
      "12 Nov 2026, 1:00 PM WAT",
    );
  });

  it("never prints a 24-hour hour or a narrow no-break space", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const iso = `2026-06-15T${String(hour).padStart(2, "0")}:15:00.000Z`;
      const formatted = formatSchedule(iso, "Africa/Lagos");
      assert.match(formatted, / (1[0-2]|[1-9]):\d\d (AM|PM) WAT$/, iso);
      assert.equal(
        formatted.includes(String.fromCharCode(0x202f)),
        false,
        iso,
      );
    }
  });
```

Build the narrow space with `String.fromCharCode(0x202f)` exactly as above. Do not paste the character itself — it is invisible and indistinguishable from an ASCII space — and do not write a ` space ` escape, which a copy through an editor can silently turn into a plain space. An ASCII-space `includes` would always return false, so the test would pass while the bug stayed.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/email-schedule-format.test.mjs`
Expected: FAIL on the new blocks — `18:00` does not match `/ (1[0-2]|[1-9]):\d\d (AM|PM) WAT$/`. The four pre-existing tests still pass; if the three source-text regexes at `:63-76` fail, something was edited in `notifications.ts` that should not have been.

- [ ] **Step 3: Rewrite `src/lib/email/format-schedule.ts`**

Replace the whole file:

```ts
export function formatSchedule(
  isoString: string,
  timezone = "Africa/Lagos",
): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  try {
    const day = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      dateStyle: "medium",
    }).format(date);
    const timeZoneName = new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;

    return `${day}, ${clockInZone(date, timezone)}${
      timeZoneName ? ` ${timeZoneName}` : ""
    }`;
  } catch {
    return isoString;
  }
}

/**
 * The club clock is "6:00 PM". en-NG's own 12-hour short time is "06:00 pm"
 * behind a U+202F, so the parts are reassembled instead of trusted. This does
 * not import src/lib/event-times.mjs: this module's test transpiles it
 * standalone into a data-URL import, where a relative specifier cannot resolve.
 */
function clockInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-NG", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour").replace(/^0/, "");
  const minute = read("minute").replace(/\D/g, "").slice(0, 2) || "00";
  const meridiem = read("dayPeriod").replace(/[^APapMm]/g, "").toUpperCase();
  return meridiem ? `${hour}:${minute} ${meridiem}` : `${hour}:${minute}`;
}
```

- [ ] **Step 4: Run the email tests to verify they pass**

Run: `npm test -- tests/email-schedule-format.test.mjs`
Expected: PASS, six tests. If `uses the configured timezone label instead of always saying WAT` fails, the `timeZoneName` lookup was moved inside the clock helper — it must stay in `formatSchedule`, because the `America/Los_Angeles` case expects the zone's own label (`GMT-8`), not `WAT`.

- [ ] **Step 5: Write the failing change-summary test**

Append to the last `describe` block in `tests/meaningful-change-detector.test.mjs`, next to the existing `describes only the event fields that changed` test at `:145-156`. The file's `event` fixture is `{ startsAt: "2026-11-12T18:00:00.000Z", endsAt: "2026-11-12T21:00:00.000Z", timezone: "Africa/Lagos", … }` (`:28-34`), so Lagos renders 19:00 and 22:00:

```js
  it("names event clock changes in 12-hour form, never as a raw instant", () => {
    assert.equal(
      detector.describeEventChanges(event, {
        ...event,
        startsAt: "2026-11-19T18:00:00.000Z",
      }),
      "Start changed from 12 Nov 2026, 7:00 PM to 19 Nov 2026, 7:00 PM",
    );

    assert.equal(
      detector.describeEventChanges(event, { ...event, endsAt: null }),
      "End changed from 12 Nov 2026, 10:00 PM to not set",
    );
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- tests/meaningful-change-detector.test.mjs`
Expected: FAIL with `actual: "Start changed from 2026-11-12T18:00:00.000Z to 2026-11-19T18:00:00.000Z"`. Every other test in the file must still pass — they assert prefixes (`/Start changed from/`), so the wording change is what is being tested here, not the phrasing.

- [ ] **Step 7: Add the local clock to `meaningful-change.ts`**

Insert this function after `instant()` (which ends at `:28`) — same no-relative-import reason, same part rules:

```ts
/**
 * The change summary is read by a member, so it shows "12 Nov 2026, 7:00 PM"
 * rather than an ISO instant. Reassembled from parts, not imported from
 * src/lib/event-times.mjs, because this module's test transpiles it standalone
 * into a data-URL import where a relative specifier cannot resolve.
 */
function scheduleLabel(
  value: string | null | undefined,
  timezone: string | null | undefined,
): string {
  const cleaned = clean(value);
  if (!cleaned) return "";
  const parsed = new Date(cleaned);
  if (Number.isNaN(parsed.getTime())) return cleaned;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: clean(timezone) || "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(parsed);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const hour = read("hour").replace(/^0/, "");
    const minute = read("minute").replace(/\D/g, "").slice(0, 2) || "00";
    const meridiem = read("dayPeriod").replace(/[^APapMm]/g, "").toUpperCase();
    return `${read("day")} ${read("month")} ${read("year")}, ${hour}:${minute}${
      meridiem ? ` ${meridiem}` : ""
    }`;
  } catch {
    return cleaned;
  }
}
```

Then replace the two `changes.push(...)` blocks inside `describeEventChanges` — currently `:124-133` — with:

```ts
  if (instant(before.startsAt) !== instant(after.startsAt)) {
    changes.push(
      `Start changed from ${
        scheduleLabel(before.startsAt, before.timezone) || "not set"
      } to ${scheduleLabel(after.startsAt, after.timezone) || "not set"}`,
    );
  }
  if (instant(before.endsAt) !== instant(after.endsAt)) {
    changes.push(
      `End changed from ${
        scheduleLabel(before.endsAt, before.timezone) || "not set"
      } to ${scheduleLabel(after.endsAt, after.timezone) || "not set"}`,
    );
  }
```

Do not touch `instant()`, either `createMeetingFingerprint`/`createEventFingerprint`, `meetingScheduleFromInstant`, or `describeMeetingChanges`. The fingerprints hash normalised ISO instants and must stay byte-identical, or every existing event's `change_hash` would move and a no-op edit would look like a change. `describeMeetingChanges` prints `meetingDate` and the machine `startTime` (`"18:00:00"`): those are round-tripped by `meetingScheduleFromInstant` and asserted in `tests/meaningful-change-detector.test.mjs:116-131`, so they keep their 24-hour machine form.

- [ ] **Step 8: Run both notification suites**

```bash
npm test -- tests/meaningful-change-detector.test.mjs tests/email-schedule-format.test.mjs
```
Expected: PASS. The `derives meeting date and time in the club timezone` and `createEventFingerprint` tests are the canaries: if either breaks, something touched the machine-readable side.

- [ ] **Step 9: Prove nothing else consumed the old email shape**

```bash
grep -rn "formatSchedule" src tests
```
Expected: `src/lib/email/notifications.ts` shows six call sites and an import of `@/lib/email/format-schedule` — both unchanged; `src/lib/email/format-schedule.ts` defines it; `tests/email-schedule-format.test.mjs` reads it. If any other file appears, it is a new consumer and must be reviewed against these assertions.

- [ ] **Step 10: Lint, typecheck, commit**

```bash
npx biome check --write src/lib/email/format-schedule.ts src/lib/notifications/meaningful-change.ts tests/email-schedule-format.test.mjs tests/meaningful-change-detector.test.mjs
npm run lint
npx tsc --noEmit
git add src/lib/email/format-schedule.ts src/lib/notifications/meaningful-change.ts \
        tests/email-schedule-format.test.mjs tests/meaningful-change-detector.test.mjs
git commit -m "feat(events): put member emails and change summaries on the 12-hour clock"
```

---

---

## Task 10: Every event surface uses the shared clock

Task 9 converted the two `.ts` modules that could not import the shared helper. This task converts the components that can, and they must all point at the same functions so the rule cannot drift again. Seven surfaces render an event or meeting time today; five of them are 24-hour and one is 12-hour-but-inconsistent.

The inventory was taken by grepping every `Intl` clock in `src` (`hour12: false`, `timeStyle`, `hour: "2-digit"`, `hourCycle`). The ones listed below are the surfaces whose *subject is an event's or meeting's scheduled time*. The rest are deliberately not touched, and the rule applied is: **a formatter whose subject is a record's created/updated/audit timestamp keeps its clock.** That excludes `src/app/(member)/events/[eventId]/dashboard/page.tsx:756` (`watAuditTime` — audit log rows), `src/components/events/attendance/minutes-card.tsx:16` (`minutes.updated_at`), `attendance-audit-history.tsx:13`, `attendance-roster-table.tsx:35`, `checkin-card.tsx:45`, `officer-session-controls.tsx:26`, `attendance-controls.tsx:17` (a QR session TTL, not a schedule), `src/lib/staff-presentation.mjs:33` (deviation 2), `src/lib/event-finance-utils.mjs:70`, `src/app/(member)/officers/members/page.tsx:195`, and the dues/announcement/finance-ledger timestamps.

**Files:**
- Modify: `src/components/events/event-card.tsx:41-46`, `:77`, `:126-127`
- Modify: `src/app/(member)/events/[eventId]/dashboard/page.tsx:17`, `:192`, `:299-320`
- Modify: `src/components/events/dashboard/dashboard-types.ts:148-164`
- Modify: `src/components/events/dashboard/event-dashboard-view.tsx:572-587`
- Modify: `src/app/(member)/attendance/page.tsx:62`
- Modify: `src/components/events/attendance/attendance-types.ts:1-11`
- Modify: `src/components/attendance/attendance-hub-view.tsx:20-32`, `:73-77`, `:311`, `:537`, `:658`
- Modify: `src/components/events/attendance/attendance-page-view.tsx:41-45`, `:127`
- Modify: `src/components/home/next-up-events-card.tsx:14-20`, `:145`
- Modify: `src/app/(member)/officers/members/page.tsx:250-253`
- Modify: `src/components/tickets/tickets-storefront-view.tsx:57-62`, `:198`
- Test: `tests/event-clock-surfaces.test.mjs`

**Interfaces:**
- Consumes: `formatEventTime`, `formatEventDateSpan`, `formatEventDurationLabel` from `src/lib/event-times.mjs` (Task 2); `EventRow.duration_days` (Task 7); `ends_at` already selected where Task 8 needed it.
- Produces: `DashboardEventInfo.durationLabel: string` and `DashboardEventInfo.dateFormatted` / `timeWAT` carrying 12-hour text — consumed only by `event-dashboard-view.tsx` and the tab components, which read the strings and never re-format.

- [ ] **Step 1: Write the failing surface test**

Create `tests/event-clock-surfaces.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const surfaces = [
  "../src/components/events/event-card.tsx",
  "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
  "../src/components/attendance/attendance-hub-view.tsx",
  "../src/components/events/attendance/attendance-page-view.tsx",
  "../src/components/home/next-up-events-card.tsx",
  "../src/app/(member)/officers/members/page.tsx",
  "../src/components/tickets/tickets-storefront-view.tsx",
];

describe("event clock surfaces", () => {
  for (const path of surfaces) {
    it(`${path} prints event times through the shared 12-hour helper`, () => {
      const text = source(path);
      assert.match(text, /formatEventTime\(/);
      assert.equal(text.includes("hour12: false"), false);
    });
  }

  it("spans the last day wherever the duration is selected", () => {
    for (const path of [
      "../src/components/events/event-card.tsx",
      "../src/app/(member)/events/[eventId]/dashboard/page.tsx",
      "../src/components/attendance/attendance-hub-view.tsx",
      "../src/components/events/attendance/attendance-page-view.tsx",
    ]) {
      assert.match(source(path), /formatEventDateSpan\(/, path);
    }
  });

  it("keeps the officer's check-in clock out of the sweep", () => {
    const hub = source("../src/components/attendance/attendance-hub-view.tsx");
    assert.match(hub, /watShortDate\.format\(new Date\(row\.checkedInAt\)\)/);
  });

  it("feeds the dashboard header the columns the span needs", () => {
    assert.match(
      source("../src/app/(member)/events/[eventId]/dashboard/page.tsx"),
      /select\(\s*"id, title, event_type, starts_at, duration_days,/,
    );
    assert.match(
      source("../src/app/(member)/attendance/page.tsx"),
      /"id, title, event_type, starts_at, duration_days, location, status, minutes_enabled, attendance_enabled, archived_at",/,
    );
  });
});
```

The last test in the file is a guard, not decoration: `duration_days` silently missing from a `select` degrades `formatEventDateSpan` to a single-day label, which is exactly the bug the column-grant history says is hardest to see. Asserting the select text is the cheap way to catch it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/event-clock-surfaces.test.mjs`
Expected: FAIL on all six surface tests (`formatEventTime(` absent) and on both guard tests. If a surface test fails on `hour12: false` alone, that is the `event-card.tsx:45` and dashboard `page.tsx:309` formatters, which is correct.

- [ ] **Step 3: Convert the event card**

In `src/components/events/event-card.tsx`, add alongside the existing imports:

```tsx
import { formatEventDateSpan, formatEventTime } from "@/lib/event-times.mjs";
```

delete the whole `timeFormatter` declaration at `:41-46` —

```tsx
const timeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
```

— and replace `:126-127` with:

```tsx
  const formattedDate = formatEventDateSpan(
    event.starts_at,
    event.duration_days,
  );
  const formattedTime = formatEventTime(event.starts_at);
```

Then delete `const startDate = new Date(event.starts_at);` at `:77`; Task 8 kept it only because these two lines used it, and `isPastScheduled` now decides from `event` directly. Keep `dateFormatter` (`:33-39`) — `:324` and `:330` still print the created and archived dates with it.

The card's date line grows a weekday, because `formatEventDateSpan` returns `Thursday, 12 November 2026` where the old `dateFormatter` printed `Thursday, 12 November 2026` too (`weekday: "long"` was already in its options). Nothing visible changes for a one-day event, which is the point: only the clock moves, `18:00` → `6:00 PM`.

- [ ] **Step 4: Convert the event dashboard header**

In `src/app/(member)/events/[eventId]/dashboard/page.tsx`, add to the import block (next to `:17`'s `partitionExpensesByAllocation`):

```tsx
import {
  formatEventDateSpan,
  formatEventDurationLabel,
  formatEventTime,
} from "@/lib/event-times.mjs";
```

Add `duration_days` to the events select at `:192`, keeping the existing column order intact:

```ts
        "id, title, event_type, starts_at, duration_days, location, status, archived_at, description, minutes_enabled, attendance_enabled, income_enabled, expenses_enabled, ticketing_enabled, budget_enabled",
```

Replace `:299-320` — the `startDate` / `dateFormatter` / `timeFormatter` block and the two `eventInfo` fields — with:

```tsx
  const eventInfo: DashboardEventInfo = {
    id: rawEvent.id,
    title: rawEvent.title,
    type: rawEvent.event_type,
    status: rawEvent.status,
    startsAt: rawEvent.starts_at,
    dateFormatted: formatEventDateSpan(
      rawEvent.starts_at,
      rawEvent.duration_days,
    ),
    timeWAT: formatEventTime(rawEvent.starts_at),
    durationLabel: formatEventDurationLabel(rawEvent.duration_days),
    location: rawEvent.location,
    details: rawEvent.description ?? undefined,
    budgetCeiling: budgetResult.data?.total_ngn ?? 0,
    archivedAt: rawEvent.archived_at,
    attendanceEnabled: rawEvent.attendance_enabled,
    minutesEnabled: rawEvent.minutes_enabled,
  };
```

The `// Format Dates in Africa/Lagos WAT` comment at `:298` goes with the formatters; `event-times.mjs` now carries that intent. `rawEvent` is typed from the query, so `duration_days` needs no cast — if `tsc` complains it does not exist on the row type, the select edit in this step did not land.

- [ ] **Step 5: Give the dashboard type its duration label**

In `src/components/events/dashboard/dashboard-types.ts`, inside `DashboardEventInfo` (`:148-164`), add after `timeWAT: string;`:

```ts
  durationLabel?: string;
```

Optional, because `DashboardEventInfo` literals also appear in the tab test fixtures; making it required would force every fixture to name it for no benefit.

- [ ] **Step 6: Render the duration in the dashboard header**

In `src/components/events/dashboard/event-dashboard-view.tsx`, replace the Date & Time Row at `:572-587` with:

```tsx
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14.5px] sm:text-xs text-[#4A524D] sm:text-[#5C4638] font-medium sm:font-normal">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#174C37] shrink-0" />
                <span>{event.dateFormatted}</span>
              </div>
              <span
                aria-hidden="true"
                className="text-stone-300 select-none sm:text-[#E5DDD3]"
              >
                •
              </span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#174C37] shrink-0" />
                <span className="font-mono">{event.timeWAT}</span>
              </div>
              {event.durationLabel && (
                <>
                  <span
                    aria-hidden="true"
                    className="text-stone-300 select-none sm:text-[#E5DDD3]"
                  >
                    •
                  </span>
                  <span>{event.durationLabel}</span>
                </>
              )}
            </div>
```

`formatEventDurationLabel(1)` returns `"1 day"`, so a single-day event does read "1 day" here. That is deliberate — an officer comparing budget to duration needs the number even when it is one — and it is why the field renders rather than being hidden for a one-day event.

- [ ] **Step 7: Convert the attendance surfaces**

The attendance views use a second, narrower `EventRow` — `src/components/events/attendance/attendance-types.ts:1-11` — not the one Task 7 extended in `event-types.ts`. Add the optional duration to it first, after `starts_at: string;`:

```ts
  duration_days?: number;
```

Without it, `tsc` rejects `selectedEvent.duration_days` in the next file and the natural but wrong fix is to delete the span, which silently reduces every multi-day event to its first day on the attendance screens.

`src/app/(member)/attendance/page.tsx` feeds both views from one query, so `duration_days` is added once, at `:62`:

```ts
      "id, title, event_type, starts_at, duration_days, location, status, minutes_enabled, attendance_enabled, archived_at",
```

In `src/components/attendance/attendance-hub-view.tsx`, delete the `watDateTime` formatter at `:73-77` and add to the import block near `:33`:

```tsx
import { formatEventDateSpan, formatEventTime } from "@/lib/event-times.mjs";
```

then replace the three event-time renderings:

- `:311` becomes
  ```tsx
                    {formatEventDateSpan(
                      selectedEvent.starts_at,
                      selectedEvent.duration_days,
                    )}
                    , {formatEventTime(selectedEvent.starts_at)} WAT
  ```
- `:537` becomes
  ```tsx
                      {formatEventDateSpan(
                        selectedEvent.starts_at,
                        selectedEvent.duration_days,
                      )}
                      , {formatEventTime(selectedEvent.starts_at)} WAT
  ```
- `:658` becomes
  ```tsx
                          {eventDateOnly.format(new Date(row.startsAt))},{" "}
                          {formatEventTime(row.startsAt)} WAT
  ```
  where `eventDateOnly` is a new formatter declared beside `watShortDate`:
  ```tsx
  const eventDateOnly = new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
  });
  ```

`:658` uses the compact date rather than `formatEventDateSpan` because `MemberAttendanceHistoryItem` (`:38-45`) carries only `startsAt`, and the column is a monospace table cell. Leave `watShortDate` (`:79-83`) in place — `:671` still formats `row.checkedInAt` with it, and that clock is a check-in timestamp, not a schedule. Leave `:269`'s inline `toLocaleDateString` alone: it prints `month + day` only, with no clock to convert.

In `src/components/events/attendance/attendance-page-view.tsx`, delete the `watDateTime` formatter at `:41-45`, add

```tsx
import { formatEventDateSpan, formatEventTime } from "@/lib/event-times.mjs";
```

and replace `:127` with:

```tsx
                  {formatEventDateSpan(event.starts_at, event.duration_days)}
                  , {formatEventTime(event.starts_at)}
```

- [ ] **Step 8: Convert the home card, the member-admin events list and the ticket storefront**

`src/components/home/next-up-events-card.tsx:145` is the only date on that card — `:141` is labelled "Top row: Date & Type" and nothing else prints the day — so the clock changes and the date text must survive. Replace the local `formatEventDateTime` at `:14-20` with a date-only formatter, add the shared clock import, and keep the same copy shape:

```tsx
import { formatEventTime } from "@/lib/event-times.mjs";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});
```

and change `:145` to

```tsx
                  <span>
                    {dateFormatter.format(new Date(evt.startsAt))},{" "}
                    {formatEventTime(evt.startsAt)}
                  </span>
```

`"12 Nov 2026, 18:00"` becomes `"12 Nov 2026, 6:00 PM"` — the date half is byte-identical to what the card printed before, because `dateStyle: "medium"` was already producing it.

This surface shows no multi-day span: `HomeDashboardEvent` (`src/lib/home-dashboard.server.ts:28-47`) has no duration field, and threading `duration_days` through `mapEventRow` in `home-dashboard.mjs`, its `.server.ts` type, and the `tests/home-dashboard.test.mjs` fixtures would buy one line of copy on a screen that lists *what is next* rather than *what the event is*.

Design §1's fourth 24-hour site is easy to miss because its formatter is built inline inside a `.map`, not at module scope. In `src/app/(member)/officers/members/page.tsx`, the block at `:250-253`

```ts
    const timeWAT = new Intl.DateTimeFormat("en-NG", {
      timeZone: "Africa/Lagos",
      timeStyle: "short",
    }).format(dateObj);
```

becomes

```ts
    const timeWAT = formatEventTime(evt.starts_at);
```

with

```ts
import { formatEventTime } from "@/lib/event-times.mjs";
```

added to that page's import block. `dateFormatted` at `:246-249` keeps its `dateStyle: "full"` formatter: it prints no clock, so there is nothing to convert, and `ManagedEvent` carries no `duration_days` (the select at `:240` does not ask for it), so this list keeps a single-day date. This page is a server component; the `.mjs` import is the same pattern the page already uses at `:16` for `member-administration-presentation.mjs`.

In `src/components/tickets/tickets-storefront-view.tsx`, delete the `timeFormatter` at `:57-62`, add

```tsx
import { formatEventTime } from "@/lib/event-times.mjs";
```

to the import block, and change `:198` — inside the `events.map((event) => {` body that already computes `eventDate` at `:169` — to

```tsx
                        <span>{formatEventTime(event.starts_at)} WAT</span>
```

`dateFormatter` and `eventDate` stay: `:194` still prints the date. This surface was already `hour12: true`, so the conversion is about the shape rather than the hour — `en-NG` was printing `06:00 pm WAT` behind a U+202F, and the shared helper prints `6:00 PM WAT`. The storefront keeps a single-day date because `PublicTicketedEvent` (`:27-34`) is the output of the `get_public_ticketed_events` RPC, which does not return `duration_days`; giving it the span would mean a new migration and a new RPC return shape for a page where the start date is the operative information.

- [ ] **Step 9: Run the guard test and the neighbours**

```bash
npm test -- tests/event-clock-surfaces.test.mjs tests/event-card-access.test.mjs tests/event-times.test.mjs tests/event-presentation.test.mjs
```
Expected: all PASS. `tests/event-card-access.test.mjs` covers the access matrix, not the clock; it is here because it is the suite most likely to notice the card's imports moved.

- [ ] **Step 10: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: both clean. Two specific failures to expect and fix rather than work around: `duration_days` missing from the `rawEvent` type means the Step 4 select edit missed; an unused `dateFormatter` or `watShortDate` means a formatter was deleted that still had a live call site.

- [ ] **Step 11: Commit**

```bash
git add tests/event-clock-surfaces.test.mjs src/components/events/event-card.tsx \
        "src/app/(member)/events/[eventId]/dashboard/page.tsx" \
        src/components/events/dashboard/dashboard-types.ts \
        src/components/events/dashboard/event-dashboard-view.tsx \
        "src/app/(member)/attendance/page.tsx" \
        src/components/events/attendance/attendance-types.ts \
        src/components/attendance/attendance-hub-view.tsx \
        src/components/events/attendance/attendance-page-view.tsx \
        src/components/home/next-up-events-card.tsx \
        "src/app/(member)/officers/members/page.tsx" \
        src/components/tickets/tickets-storefront-view.tsx
git commit -m "feat(events): render every event surface on the shared 12-hour clock"
```

---

## Task 11: Verify the whole feature and write down what production still needs

Nothing in this task is new behaviour. It exists because the feature spans a migration, three RPCs, two server actions, two forms, four grouping readers, three email surfaces and seven components — and because the last verification step produces the runbook the operator, not the agent, runs against production.

**Files:**
- Modify: `docs/data-access-matrix.md` (the `## Event authorization` section, `:156-176`)
- Nothing else; if this task needs a code change, that is a defect in Tasks 1-10 and goes back to the task that owns the file.

**Interfaces:**
- Consumes: every prior task's output.
- Produces: a green suite, a verified UI, and `docs/superpowers/plans/2026-11-04-event-multi-day-12-hour-time.md`-referenced production runbook text committed to the branch.

- [ ] **Step 1: Run the whole JavaScript suite**

```bash
npm test
```
Expected: every test passes. `npm test` is `node --test` and discovers `tests/*.test.mjs` itself — never run `node --test tests/`, which resolves the directory differently on this machine. The suites this feature moved: `event-schedule`, `event-times`, `event-schedule-form`, `event-presentation`, `events-page-presentation`, `home-dashboard`, `email-schedule-format`, `meaningful-change-detector`, `event-clock-surfaces`, `event-creation-validation`, `event-card-access`. A failure in any *other* suite is a regression from a shared file — `actions.ts`, `event-types.ts`, `home-dashboard.mjs` — and must be fixed, not skipped.

- [ ] **Step 2: Typecheck and lint**

```bash
npx tsc --noEmit
npm run lint
```
Expected: both silent. `npm run lint` is `biome check next.config.ts src`, so it does not look at `tests/` or `scripts/`; run `npx biome check --write` on the specific test files if they were hand-edited.

- [ ] **Step 3: Replay the local schema and run pgTAP**

```bash
npx supabase db reset --local
npx supabase test db --local
```
Expected: the reset applies every migration including Task 3's, and `supabase test db` reports each suite passing. The standing baseline is that seven stale-name suites fail on name drift only — compare against `git stash`-free expectation by checking that the *set* of failing suite names is unchanged from before this branch, and that no failure mentions `duration_days`, `ends_at`, `update_event_details`, `create_event`, or `evaluate_notification_reminders`. Any failure naming one of those is a real defect.

If `db reset --local` is unavailable or the local stack is not running, start it with `npx supabase start` and retry. Do **not** substitute `db push --local --include-all` here: Task 5 edits a migration file that the local database already applied, and `db push` may silently skip an already-applied file, which would leave the 12-hour reminder body unreplayed and Task 5's pgTAP test failing for the wrong reason.

- [ ] **Step 4: Prove the two new columns are readable by a member**

```bash
npx supabase db query --local --dbname postgres "
select pg_catalog.has_column_privilege('authenticated','public.events','duration_days','select') as duration_readable,
       pg_catalog.has_column_privilege('authenticated','public.events','ends_at','select') as ends_readable;
"
```
Expected: both `true`. A `false` here is the silent-empty-read hazard this project has been bitten by twice: an ungranted column makes the whole `select(...)` return no rows rather than one missing field, so the dashboard appears empty rather than broken. If either is false, Task 3's grant statement did not run — fix Task 3, re-run Step 3, and do not continue.

- [ ] **Step 5: Record the new columns in the access matrix**

In `docs/data-access-matrix.md`, add one row to the `## Event authorization` table (after the row at `:160`, so reading precedes writing):

```md
| Read `duration_days` and the generated `ends_at` | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active | Allowed while active |
```

and extend the paragraph at `:169-176` by appending this sentence after "…read retained event and budget values for transparency.":

```md
`ends_at` is generated from `starts_at` and `duration_days` and is never
writable: every event mutation path accepts a day count and Postgres derives the
end of the live window, so no client can store a duration that disagrees with the
column the read paths filter on.
```

```bash
git add docs/data-access-matrix.md
git commit -m "docs(events): record duration_days and the generated ends_at in the access matrix"
```

- [ ] **Step 6: Build and run the production bundle**

```bash
npm run build
npx next start -p 3001
```

Read the port from the startup log and use that, rather than assuming `3001` was free — a stale listener on `3001` from an earlier session makes `next start` print a different port, and verifying the wrong server is worse than not verifying at all. Leave the server running for Step 7.

Expected: build succeeds. Watch for two failure modes specific to this feature: a `.mjs` import that `tsc` accepted but the bundler cannot resolve (the extension must be written in the specifier), and a server component importing `splitInstantForForm` from a client-only path.

- [ ] **Step 7: Verify in the browser, as one batched pass**

The browser viewport here is locked, so screenshots are cheap but scroll-dependent checks are not: open each screen, take one snapshot, and read everything you need from it before moving on. Log in as `admin@carpentersfamily.test`.

Check, in order:

1. **Create form** at `/events` — the New Event disclosure shows a date input, an hour select, a minute select, an AM/PM select and a "Runs For" select, and contains **no** `datetime-local` control. Fill it as `12 Nov 2026`, `6`, `00`, `PM`, `3 days` and submit.
2. **The new card** in the Upcoming list — reads `Thursday, 12 – Saturday, 14 November 2026` and `6:00 PM`. It must appear in Upcoming, not Past.
3. **Liveness across the window** — edit the event you just created and change nothing but the location; save; the card must still be Upcoming. Then confirm the grouping on `/events` still lists it while `starts_at` is in the past but `ends_at` is not (set the date to yesterday with a 3-day run, and it stays Upcoming).
4. **Edit modal** — opens pre-filled with the same date, `6`, `00`, `PM` and `3 days`; changing the day count to `1` and saving shortens the card's date span to the single day.
5. **Event dashboard** for that event — the header shows the span, `6:00 PM` and `3 days`; the Overview, Team Roles and Reports tabs still render (they read `DashboardEventInfo`, and a missing `duration_days` in the select would show a one-day label here).
6. **Attendance hub** at `/attendance` for an attendance-enabled event — the banner and the minutes heading both read the 12-hour clock, while the history table's check-in column keeps its own clock.
7. **Home card** at `/` — the Next Up event reads `12 Nov 2026, 6:00 PM`.
8. **Ticket storefront** at `/tickets` for a ticketed event — reads `6:00 PM WAT`, uppercase and unpadded.
9. **An email-shaped artifact** — record a change to a scheduled event and open the notification in the app's notification surface, or run `npm run email:test` if `.env.local` is configured; the "What Changed" line must read `Start changed from 12 Nov 2026, 6:00 PM to …`, never an ISO instant.

If any of 1-9 cannot be verified through the UI in this environment, say so explicitly in the final report rather than reporting the feature as verified. The test suites prove the helpers; only these checks prove the forms and the pages.

- [ ] **Step 8: Stop the server and re-run the suite once more**

```bash
npm test
```
Expected: still green. Browser edits during Step 7 wrote rows into the **local** database only; if a test now fails on fixture counts, a leftover row from Step 7 is the cause, and the fix is `npx supabase db reset --local`, not a changed assertion.

- [ ] **Step 9: Commit the verification record**

```bash
git status --short
git add -u
git commit -m "test(events): record the multi-day and 12-hour verification pass"
```

`git status --short` first, for two reasons. `tests/club-admin-terminology.test.mjs` is someone else's uncommitted work and must not be staged — if it appears as modified, leave it unstaged. And if the only entries are files this plan did not name, unstage them and stage the named paths instead. If the working tree is clean, there is nothing to record here: skip the commit rather than force an empty one, and say so in the report.

- [ ] **Step 10: Write the production runbook into the plan, and stop there**

Append to this plan file a final section titled `## Production apply (operator-gated)` recording, in order:

1. `git log --oneline` the migration filenames added by Tasks 3, 4 and 5 and confirm each is committed on this branch under `supabase/migrations/`. Nothing is merged yet by design: the standing ruling is that the operator pushes the branch and applies migrations to production **before** the merge, so this list is read from the branch, not from `main`.
2. The exact commands the operator runs against production, each on its own line, prefixed by the note that they write to the production database:
   ```bash
   npx supabase db push            # operator only — applies every pending migration to PRODUCTION
   npx supabase test db            # operator only — pgTAP against production
   ```
   and the two verifications they must run afterwards: the `has_column_privilege` query from Step 4 without `--local`, and one `select id, starts_at, duration_days, ends_at from public.events order by starts_at desc limit 5;` to show the generated column filled for existing rows (`duration_days` defaults to `1`, so `ends_at` must equal `starts_at`).
3. One line stating plainly: **no agent in this plan runs either command.** Everything up to Step 9 used `--local` or no database at all.

```bash
git add docs/superpowers/plans/2026-11-04-event-multi-day-12-hour-time.md
git commit -m "docs(events): add the operator-gated production apply runbook"
```

Then stop. Do not push, open a pull request, or merge: this branch's push and merge decisions belong to the operator, and the migrations added by Tasks 3, 4 and 5 must be pushed by them before any merge.

---

---
