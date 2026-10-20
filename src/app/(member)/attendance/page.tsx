import { redirect } from "next/navigation";
import {
  AttendanceHubView,
  type MemberAttendanceHistoryItem,
} from "@/components/attendance/attendance-hub-view";
import type {
  AttendanceRow,
  AuditRow,
  EventRow,
  MemberRow,
  MinutesRow,
  SessionRow,
} from "@/components/events/attendance/attendance-types";
import { getAttendancePageAccess } from "@/lib/attendance-page-access.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const noticeText: Record<string, string> = {
  "minutes-saved":
    "Meeting minutes were saved and recorded in the Secretariat archive.",
  "attendance-opened": "Attendance check-in is now open.",
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

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; notice?: string; tab?: string }>;
}) {
  const query = await searchParams;

  const supabase = await createSupabaseServerClient().catch(() => null);
  if (!supabase) redirect("/?notice=configuration");

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/?notice=sign-in");
  const memberId = authData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("member_profiles")
    .select("status, full_name, username")
    .eq("id", memberId)
    .maybeSingle();

  if (profileError || profile?.status !== "active") {
    redirect("/?notice=sign-in");
  }

  // 1. Fetch Global Roles
  const { data: globalRolesData } = await supabase
    .from("member_role_assignments")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);

  const globalRoles = new Set((globalRolesData ?? []).map((r) => r.role));
  const isGlobalAdmin =
    globalRoles.has("admin") || globalRoles.has("backup_admin");
  const isGlobalExecutive = globalRoles.has("executive");

  let computedRole = "member";
  if (isGlobalAdmin) computedRole = "admin";
  else if (isGlobalExecutive) computedRole = "executive";

  // 2. Fetch all events with attendance or minutes enabled
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select(
      "id, title, event_type, starts_at, location, status, minutes_enabled, attendance_enabled, archived_at",
    )
    .or(
      "event_type.eq.meeting,attendance_enabled.eq.true,minutes_enabled.eq.true",
    )
    .order("starts_at", { ascending: false });

  if (eventsError || !eventsData || eventsData.length === 0) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-[#3D291F]">
            Minutes & Attendance
          </h1>
          <p className="text-xs text-[#7A685D]">
            There are currently no events configured with attendance tracking or
            meeting minutes.
          </p>
        </section>
      </div>
    );
  }

  const events = eventsData as EventRow[];

  // 3. Determine selected event
  let selectedEvent: EventRow = events[0];
  if (query.event) {
    const match = events.find((e) => e.id === query.event);
    if (match) selectedEvent = match;
  } else {
    // Pick event with open session if any
    const { data: openSessions } = await supabase
      .from("event_attendance_sessions")
      .select("event_id")
      .is("closed_at", null)
      .limit(1);

    if (openSessions && openSessions.length > 0) {
      const matchOpen = events.find((e) => e.id === openSessions[0].event_id);
      if (matchOpen) selectedEvent = matchOpen;
    }
  }

  // 4. Fetch permissions for selected event
  const { data: eventRolesData } = await supabase
    .from("event_role_assignments")
    .select("role")
    .eq("event_id", selectedEvent.id)
    .eq("member_id", memberId)
    .is("revoked_at", null);

  const eventRoles = new Set((eventRolesData ?? []).map((r) => r.role));
  const { canControl, canWriteMinutes, canReviewAttendance, isOfficer } =
    getAttendancePageAccess({ roles: globalRoles, eventRoles });

  // 5. Fetch selected event details: Minutes, Session, Settings, Attendance
  const [
    minutesResult,
    sessionResult,
    settingsResult,
    attendanceResult,
    historyResult,
  ] = await Promise.all([
    selectedEvent.minutes_enabled
      ? supabase
          .from("event_minutes")
          .select("event_id, content, revision_number, updated_at")
          .eq("event_id", selectedEvent.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedEvent.attendance_enabled
      ? supabase
          .from("event_attendance_sessions")
          .select(
            "event_id, opened_at, late_after_minutes, late_after_at, closed_at",
          )
          .eq("event_id", selectedEvent.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isOfficer
      ? supabase
          .from("club_attendance_settings")
          .select("default_late_after_minutes")
          .eq("singleton_id", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    selectedEvent.attendance_enabled
      ? supabase
          .from("event_attendance")
          .select(
            "event_id, member_id, attendance_status, check_in_method, checked_in_at, recorded_at, corrected_at, correction_reason",
          )
          .eq("event_id", selectedEvent.id)
          .order("recorded_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("event_attendance")
      .select(
        "event_id, attendance_status, check_in_method, checked_in_at, events:event_id (title, starts_at)",
      )
      .eq("member_id", memberId)
      .order("recorded_at", { ascending: false }),
  ]);

  const minutes = minutesResult.data as MinutesRow | null;
  const session = sessionResult.data as SessionRow | null;
  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const ownAttendance = attendance.find((row) => row.member_id === memberId);
  const defaultCutoff = settingsResult.data?.default_late_after_minutes ?? 15;

  // 6. Fetch profiles for attendees if officer / reviewer
  let members = new Map<string, MemberRow>();
  if (canReviewAttendance && attendance.length > 0) {
    const { data: memberProfiles } = await supabase
      .from("member_profiles")
      .select("id, full_name, username, status")
      .in(
        "id",
        attendance.map((row) => row.member_id),
      );
    members = new Map(
      (memberProfiles ?? []).map((row) => [row.id, row as MemberRow]),
    );
  }

  // 7. Fetch audit logs if officer
  let audits: AuditRow[] = [];
  if (isOfficer) {
    const { data: auditData } = await supabase
      .from("audit_log")
      .select(
        "id, action, entity_type, entity_id, target_member_id, before_data, after_data, reason, occurred_at",
      )
      .eq("event_id", selectedEvent.id)
      .in("entity_type", [
        "event_minutes",
        "attendance_settings",
        "attendance_session",
        "event_attendance",
      ])
      .order("occurred_at", { ascending: false })
      .limit(50);
    audits = (auditData ?? []) as AuditRow[];
  }

  // 8. Transform member history items
  const memberAttendanceHistory: MemberAttendanceHistoryItem[] = (
    historyResult.data ?? []
  ).map((row) => {
    const evt = row.events as { title?: string; starts_at?: string } | null;
    return {
      eventId: row.event_id,
      title: evt?.title ?? "Club Event",
      startsAt: evt?.starts_at ?? "",
      status: row.attendance_status,
      checkedInAt: row.checked_in_at,
      method: row.check_in_method,
    };
  });

  const notice =
    query.notice && Object.hasOwn(noticeText, query.notice)
      ? noticeText[query.notice]
      : null;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <AttendanceHubView
        attendance={attendance}
        audits={audits}
        canControl={canControl}
        canReviewAttendance={canReviewAttendance}
        canWriteMinutes={canWriteMinutes}
        currentUser={{
          id: memberId,
          fullName: profile.full_name,
          username: profile.username,
          role: computedRole,
        }}
        defaultCutoff={defaultCutoff}
        events={events}
        isOfficer={isOfficer}
        memberAttendanceHistory={memberAttendanceHistory}
        members={members}
        minutes={minutes}
        notice={notice}
        ownAttendance={ownAttendance}
        selectedEvent={selectedEvent}
        session={session}
      />
    </div>
  );
}
