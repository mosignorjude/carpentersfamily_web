import Link from "next/link";
import { redirect } from "next/navigation";
import {
  closeEventAttendanceAction,
  correctEventAttendanceAction,
  openEventAttendanceAction,
  saveEventMinutesAction,
  setAttendanceDefaultAction,
} from "@/app/actions";
import { getAttendancePageAccess } from "@/lib/attendance-page-access.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AttendanceCheckIn, AttendanceQrIssuer } from "./attendance-controls";

type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  minutes_enabled: boolean;
  attendance_enabled: boolean;
  status: string;
  archived_at: string | null;
};

type MinutesRow = {
  event_id: string;
  content: string;
  revision_number: number;
  updated_at: string;
};

type SessionRow = {
  event_id: string;
  opened_at: string;
  late_after_minutes: number;
  late_after_at: string;
  closed_at: string | null;
};

type AttendanceRow = {
  event_id: string;
  member_id: string;
  attendance_status: string;
  check_in_method: string;
  checked_in_at: string | null;
  recorded_at: string;
  corrected_at: string | null;
  correction_reason: string | null;
};

type MemberRow = {
  id: string;
  full_name: string;
  username: string;
  status: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  target_member_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

const noticeText: Record<string, string> = {
  "minutes-saved": "Meeting minutes were saved.",
  "attendance-opened": "Attendance check-in is open.",
  "attendance-closed":
    "Attendance is closed and missing members were marked absent.",
  "attendance-corrected": "The attendance record was corrected and audited.",
  "checked-in": "Your attendance was recorded.",
  "cutoff-saved": "The club-wide late cutoff was updated.",
  denied: "You are not allowed to make that change.",
  "invalid-request": "Check the submitted fields and try again.",
  "operation-failed":
    "The meeting or attendance change could not be saved. It may be closed, expired, or already recorded.",
};

const watDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "full",
  timeStyle: "short",
});

const watShortDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  rejected: "Rejected check-in",
};

function dateTime(value: string) {
  return `${watDateTime.format(new Date(value))} WAT`;
}

function shortDateTime(value: string) {
  return `${watShortDateTime.format(new Date(value))} WAT`;
}

export default async function EventAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  ) {
    redirect("/events?notice=invalid-request");
  }

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) redirect("/?notice=configuration");
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");
  const memberId = authData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status")
    .eq("id", memberId)
    .maybeSingle();
  if (profileError || profile?.status !== "active")
    redirect("/?notice=sign-in");

  const [eventResult, globalRolesResult, eventRolesResult] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id,title,starts_at,minutes_enabled,attendance_enabled,status,archived_at",
      )
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("member_role_assignments")
      .select("role")
      .eq("member_id", memberId)
      .is("revoked_at", null),
    supabase
      .from("event_role_assignments")
      .select("role")
      .eq("event_id", eventId)
      .eq("member_id", memberId)
      .is("revoked_at", null),
  ]);
  if (eventResult.error || globalRolesResult.error || eventRolesResult.error) {
    redirect(`/events/${eventId}/attendance?notice=operation-failed`);
  }
  const event = eventResult.data as EventRow | null;
  if (!event) redirect("/events?notice=operation-failed");

  const roles = new Set((globalRolesResult.data ?? []).map((row) => row.role));
  const eventRoles = new Set(
    (eventRolesResult.data ?? []).map((row) => row.role),
  );
  const { canControl, canWriteMinutes, canReviewAttendance, isOfficer } =
    getAttendancePageAccess({ roles, eventRoles });

  const [minutesResult, sessionResult, settingsResult, attendanceResult] =
    await Promise.all([
      event.minutes_enabled
        ? supabase
            .from("event_minutes")
            .select("event_id,content,revision_number,updated_at")
            .eq("event_id", eventId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      event.attendance_enabled
        ? supabase
            .from("event_attendance_sessions")
            .select(
              "event_id,opened_at,late_after_minutes,late_after_at,closed_at",
            )
            .eq("event_id", eventId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      isOfficer
        ? supabase
            .from("club_attendance_settings")
            .select("default_late_after_minutes")
            .eq("singleton_id", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      event.attendance_enabled
        ? supabase
            .from("event_attendance")
            .select(
              "event_id,member_id,attendance_status,check_in_method,checked_in_at,recorded_at,corrected_at,correction_reason",
            )
            .eq("event_id", eventId)
            .order("recorded_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (
    minutesResult.error ||
    sessionResult.error ||
    settingsResult.error ||
    attendanceResult.error
  ) {
    redirect(`/events/${eventId}/attendance?notice=operation-failed`);
  }

  const minutes = minutesResult.data as MinutesRow | null;
  const session = sessionResult.data as SessionRow | null;
  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const ownAttendance = attendance.find((row) => row.member_id === memberId);
  const sessionOpen = Boolean(session && !session.closed_at);
  const defaultCutoff = settingsResult.data?.default_late_after_minutes ?? 15;
  let members = new Map<string, MemberRow>();
  let audits: AuditRow[] = [];

  if (canReviewAttendance && attendance.length > 0) {
    const { data, error } = await supabase
      .from("member_profiles")
      .select("id,full_name,username,status")
      .in(
        "id",
        attendance.map((row) => row.member_id),
      );
    if (error)
      redirect(`/events/${eventId}/attendance?notice=operation-failed`);
    members = new Map((data ?? []).map((row) => [row.id, row as MemberRow]));
  }

  if (isOfficer && event.attendance_enabled) {
    const { data, error } = await supabase
      .from("audit_log")
      .select(
        "id,action,entity_type,entity_id,target_member_id,before_data,after_data,reason,occurred_at",
      )
      .eq("event_id", eventId)
      .in("entity_type", [
        "event_minutes",
        "attendance_settings",
        "attendance_session",
        "event_attendance",
      ])
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (error)
      redirect(`/events/${eventId}/attendance?notice=operation-failed`);
    audits = (data ?? []) as AuditRow[];
  }

  const notice = query.notice ? noticeText[query.notice] : null;
  const mutableForSession =
    event.status === "scheduled" && event.archived_at === null;
  const eventStatusLabel = event.archived_at
    ? "Archived"
    : event.status === "scheduled"
      ? "Scheduled"
      : event.status === "completed"
        ? "Completed"
        : event.status === "cancelled"
          ? "Cancelled"
          : "Status unavailable";
  const eventStatusStyle = event.archived_at
    ? "archived"
    : event.status === "scheduled"
      ? "scheduled"
      : "closed";

  return (
    <main className="attendance-page">
      <header className="attendance-page-header">
        <div className="attendance-page-title">
          <p className="eyebrow">Event record · meetings and attendance</p>
          <h1>{event.title}</h1>
          <time className="muted" dateTime={event.starts_at}>
            {dateTime(event.starts_at)}
          </time>
        </div>
        <div className="attendance-page-actions">
          <span
            className={`status-pill attendance-event-status ${eventStatusStyle}`}
          >
            {eventStatusLabel}
          </span>
          <nav aria-label="Event pages" className="attendance-event-nav">
            <Link href="/events">All events</Link>
            <Link href={`/events/${eventId}/finance`}>Event finances</Link>
          </nav>
        </div>
      </header>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      {event.minutes_enabled ? (
        <section aria-labelledby="minutes-heading" className="page-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Visible to active members</p>
              <h2 id="minutes-heading">Meeting minutes</h2>
            </div>
            {minutes ? (
              <span className="status-pill">
                Revision {minutes.revision_number}
              </span>
            ) : null}
          </div>
          {minutes ? (
            <div className="event-minutes-content">{minutes.content}</div>
          ) : (
            <p className="muted">Minutes have not been saved yet.</p>
          )}
          {minutes ? (
            <p className="muted">
              Last saved {shortDateTime(minutes.updated_at)}.
            </p>
          ) : null}
          {canWriteMinutes ? (
            <form
              action={saveEventMinutesAction}
              className="event-form stack-form"
            >
              <input name="event_id" type="hidden" value={eventId} />
              <label>
                {minutes ? "Update minutes" : "Write minutes"}
                <textarea
                  defaultValue={minutes?.content ?? ""}
                  maxLength={20000}
                  name="content"
                  required
                  rows={12}
                />
              </label>
              {minutes ? (
                <label>
                  Reason for editing
                  <input maxLength={500} name="reason" required />
                </label>
              ) : null}
              <button className="button-primary" type="submit">
                {minutes ? "Save revised minutes" : "Save minutes"}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {event.attendance_enabled ? (
        <section aria-labelledby="attendance-heading" className="page-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Member check-in and event record</p>
              <h2 id="attendance-heading">Attendance</h2>
            </div>
            <span
              className={`status-pill attendance-session-status ${sessionOpen ? "open" : session ? "closed" : "not-opened"}`}
            >
              {session ? (sessionOpen ? "Open" : "Closed") : "Not opened"}
            </span>
          </div>

          {session ? (
            <dl className="event-details attendance-session-details">
              <div>
                <dt>Opened</dt>
                <dd>{shortDateTime(session.opened_at)}</dd>
              </div>
              <div>
                <dt>Late after</dt>
                <dd>{shortDateTime(session.late_after_at)} WAT</dd>
              </div>
              {session.closed_at ? (
                <div>
                  <dt>Closed</dt>
                  <dd>{shortDateTime(session.closed_at)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="attendance-state-note" role="status">
              {mutableForSession
                ? "An Admin or Executive can open attendance for this scheduled event."
                : "This event is not scheduled and active, so check-in cannot be opened."}
            </p>
          )}

          <div className="attendance-self-checkin">
            <h3>Your check-in</h3>
            <AttendanceCheckIn
              alreadyCheckedIn={Boolean(ownAttendance)}
              eventId={eventId}
              sessionOpen={
                sessionOpen &&
                event.status === "scheduled" &&
                event.archived_at === null
              }
            />
            {ownAttendance ? (
              <p className="muted">
                Status:{" "}
                {statusLabels[ownAttendance.attendance_status] ??
                  ownAttendance.attendance_status}
                .
                {ownAttendance.checked_in_at
                  ? ` Recorded ${shortDateTime(ownAttendance.checked_in_at)}.`
                  : ""}
              </p>
            ) : null}
            {!canReviewAttendance ? (
              <p className="attendance-privacy-note">
                Only your own attendance record is shown to you on this page.
              </p>
            ) : null}
          </div>

          {canControl ? (
            <details className="attendance-officer-panel">
              <summary>Attendance session controls</summary>
              <p className="muted">
                Admin and Executive control session timing and QR issuance.
                Backup Admin can review and correct attendance but does not
                receive these controls.
              </p>
              {canControl && !session && mutableForSession ? (
                <form
                  action={openEventAttendanceAction}
                  className="event-form stack-form"
                >
                  <input name="event_id" type="hidden" value={eventId} />
                  <label>
                    Event-specific late cutoff in minutes
                    <input
                      max="240"
                      min="0"
                      name="late_after_minutes"
                      placeholder={`Use club default: ${defaultCutoff}`}
                      type="number"
                    />
                  </label>
                  <p className="muted">
                    Leave blank to use the club default. A check-in is late only
                    after the stored cutoff time, shown in WAT.
                  </p>
                  <button className="button-primary" type="submit">
                    Open check-in
                  </button>
                </form>
              ) : null}

              {sessionOpen ? (
                <div className="attendance-officer-tools">
                  <AttendanceQrIssuer eventId={eventId} />
                  <form action={closeEventAttendanceAction}>
                    <input name="event_id" type="hidden" value={eventId} />
                    <button className="button-secondary" type="submit">
                      Close attendance and mark missing members absent
                    </button>
                  </form>
                </div>
              ) : null}

              <form
                action={setAttendanceDefaultAction}
                className="event-form stack-form attendance-cutoff-form"
              >
                <input name="event_id" type="hidden" value={eventId} />
                <h3>Club-wide late cutoff</h3>
                <label>
                  Minutes after event start
                  <input
                    defaultValue={defaultCutoff}
                    max="240"
                    min="0"
                    name="late_after_minutes"
                    required
                    type="number"
                  />
                </label>
                <label>
                  Reason for changing the default
                  <input maxLength={500} name="reason" required />
                </label>
                <button className="button-secondary" type="submit">
                  Save club default
                </button>
              </form>
            </details>
          ) : null}

          {canReviewAttendance ? (
            <section
              aria-labelledby="attendance-roster-heading"
              className="event-section"
            >
              <h3 id="attendance-roster-heading">Attendance roster</h3>
              <p className="muted">
                This roster is available under your role. Corrections are
                audited and require a reason.
              </p>
              <details className="attendance-roster-disclosure">
                <summary>
                  View {attendance.length} attendance{" "}
                  {attendance.length === 1 ? "record" : "records"}
                </summary>
                {attendance.length ? (
                  <ul className="attendance-roster">
                    {attendance.map((row) => {
                      const person = members.get(row.member_id);
                      return (
                        <li key={row.member_id}>
                          <div className="attendance-member">
                            <strong>
                              {person
                                ? `${person.full_name} (@${person.username})`
                                : "Former member"}
                            </strong>
                            <span
                              className={`status-pill ${row.attendance_status === "absent" || row.attendance_status === "rejected" ? "cancelled" : "scheduled"}`}
                            >
                              {statusLabels[row.attendance_status] ??
                                row.attendance_status}
                            </span>
                            <span className="muted">
                              {row.checked_in_at
                                ? `${row.check_in_method === "qr" ? "QR" : "Button"} · ${shortDateTime(row.checked_in_at)}`
                                : `No check-in · ${shortDateTime(row.recorded_at)}`}
                            </span>
                            {row.correction_reason ? (
                              <span className="muted">
                                Correction: {row.correction_reason}
                              </span>
                            ) : null}
                          </div>
                          <details className="attendance-correction">
                            <summary>Correct record</summary>
                            <form
                              action={correctEventAttendanceAction}
                              className="stack-form"
                            >
                              <input
                                name="event_id"
                                type="hidden"
                                value={eventId}
                              />
                              <input
                                name="member_id"
                                type="hidden"
                                value={row.member_id}
                              />
                              <label>
                                Attendance status
                                <select
                                  defaultValue=""
                                  name="attendance_status"
                                  required
                                >
                                  <option disabled value="">
                                    Choose a status
                                  </option>
                                  {row.attendance_status === "late" ? (
                                    <option disabled value="late">
                                      Late (automatic)
                                    </option>
                                  ) : null}
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="rejected">
                                    Reject check-in
                                  </option>
                                </select>
                              </label>
                              <label>
                                Correction reason
                                <input maxLength={500} name="reason" required />
                              </label>
                              <button
                                className="button-secondary"
                                type="submit"
                              >
                                Save correction
                              </button>
                            </form>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="muted">No attendance records yet.</p>
                )}
              </details>
            </section>
          ) : null}
        </section>
      ) : null}

      {isOfficer && audits.length ? (
        <section aria-labelledby="meeting-audit-heading" className="page-panel">
          <h2 id="meeting-audit-heading">Officer audit history</h2>
          <details className="attendance-audit-disclosure">
            <summary>Review {audits.length} recent audited changes</summary>
            <ul className="attendance-audit-list">
              {audits.map((audit) => (
                <li key={audit.id}>
                  <strong>{audit.action.replaceAll(".", " ")}</strong>
                  <time dateTime={audit.occurred_at}>
                    {shortDateTime(audit.occurred_at)}
                  </time>
                  <p>{audit.reason}</p>
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {!event.minutes_enabled && !event.attendance_enabled ? (
        <section className="page-panel">
          <p className="muted">
            This event has no meeting or attendance features enabled.
          </p>
        </section>
      ) : null}
    </main>
  );
}
