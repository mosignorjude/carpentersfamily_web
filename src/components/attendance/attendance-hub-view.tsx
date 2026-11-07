"use client";

import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileText,
  History,
  MapPin,
  Plus,
  Printer,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NewMeetingModal } from "@/components/attendance/new-meeting-modal";
import { AttendanceAuditHistory } from "@/components/events/attendance/attendance-audit-history";
import { AttendanceRosterTable } from "@/components/events/attendance/attendance-roster-table";
import type {
  AttendanceRow,
  AuditRow,
  EventRow,
  MemberRow,
  MinutesRow,
  SessionRow,
} from "@/components/events/attendance/attendance-types";
import { CheckinCard } from "@/components/events/attendance/checkin-card";
import { MinutesCard } from "@/components/events/attendance/minutes-card";
import { OfficerSessionControls } from "@/components/events/attendance/officer-session-controls";
import {
  formatEventDateSpan,
  formatEventTime,
  isEventLiveOrUpcoming,
} from "@/lib/event-times.mjs";
import {
  getScrollBehavior,
  parseAttendanceTab,
} from "@/lib/tab-navigation.mjs";

export interface MemberAttendanceHistoryItem {
  eventId: string;
  title: string;
  startsAt: string;
  status: string;
  checkedInAt: string | null;
  method: string | null;
}

interface AttendanceHubViewProps {
  events: EventRow[];
  selectedEvent: EventRow | null;
  session: SessionRow | null;
  minutes: MinutesRow | null;
  attendance: AttendanceRow[];
  ownAttendance?: AttendanceRow;
  members: Map<string, MemberRow>;
  audits: AuditRow[];
  memberAttendanceHistory: MemberAttendanceHistoryItem[];
  defaultCutoff: number;
  canControl: boolean;
  canWriteMinutes: boolean;
  canReviewAttendance: boolean;
  isOfficer: boolean;
  canCreateMeeting?: boolean;
  currentUser: {
    id: string;
    fullName: string;
    username: string;
    role: string;
  };
}

type HubTab = "session" | "minutes" | "history" | "audit";

const eventDateOnly = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
});

const watShortDate = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AttendanceHubView({
  events,
  selectedEvent,
  session,
  minutes,
  attendance,
  ownAttendance,
  members,
  audits,
  memberAttendanceHistory,
  defaultCutoff,
  canControl,
  canWriteMinutes,
  canReviewAttendance,
  isOfficer,
  canCreateMeeting = false,
  currentUser,
}: AttendanceHubViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<HubTab>(() =>
    parseAttendanceTab(tabParam),
  );
  const [scrollRequest, setScrollRequest] = useState(0);
  const [copiedMinutes, setCopiedMinutes] = useState(false);
  const [isNewMeetingModalOpen, setIsNewMeetingModalOpen] = useState(false);

  // Meeting Hub Section Accordion States
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Keep the active tab in sync when soft navigation changes only the query string.
  useEffect(() => {
    if (!tabParam) return;
    setActiveTab(parseAttendanceTab(tabParam));
    setScrollRequest((request) => request + 1);
  }, [tabParam]);

  // Scroll after the tab panel has committed to the DOM.
  useEffect(() => {
    if (scrollRequest === 0) return;
    const target = document.getElementById(`attendance-${activeTab}`);
    if (!target) return;
    target.scrollIntoView({
      behavior: getScrollBehavior(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      block: "start",
    });
    target.focus({ preventScroll: true });
  }, [activeTab, scrollRequest]);

  // Meeting Hub Categorization
  const now = Date.now();
  const upcomingMeetings = events
    .filter(
      (evt) =>
        !evt.archived_at &&
        evt.status === "scheduled" &&
        isEventLiveOrUpcoming(evt, now),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const pastMeetings = events
    .filter(
      (evt) =>
        !evt.archived_at &&
        evt.status !== "cancelled" &&
        (!isEventLiveOrUpcoming(evt, now) || evt.status === "concluded"),
    )
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  const cancelledOrArchivedMeetings = events
    .filter((evt) => Boolean(evt.archived_at) || evt.status === "cancelled")
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

  // Switch tab and sync with URL
  const handleTabChange = (tab: HubTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/meeting-hub?${params.toString()}#attendance-${tab}`, {
      scroll: false,
    });
    if (tabParam === tab) {
      setScrollRequest((request) => request + 1);
    }
  };

  // Switch selected event
  const handleEventChange = (eventId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", eventId);
    router.push(`/meeting-hub?${params.toString()}`);
  };

  const handleSelectMeetingAndTab = (eventId: string, tab: HubTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", eventId);
    params.set("tab", tab);
    router.push(`/meeting-hub?${params.toString()}#attendance-${tab}`);
  };

  // Copy minutes text to clipboard
  const handleCopyMinutes = () => {
    if (!minutes?.content) return;
    navigator.clipboard.writeText(minutes.content);
    setCopiedMinutes(true);
    setTimeout(() => setCopiedMinutes(false), 2000);
  };

  const sessionOpen = Boolean(session && !session.closed_at);
  const mutableForSession =
    selectedEvent?.status === "scheduled" &&
    selectedEvent?.archived_at === null;

  // Personal attendance statistics
  const totalTrackedMeetings = memberAttendanceHistory.length;
  const attendedCount = memberAttendanceHistory.filter(
    (h) => h.status === "present" || h.status === "late",
  ).length;
  const attendanceRate =
    totalTrackedMeetings > 0
      ? Math.round((attendedCount / totalTrackedMeetings) * 100)
      : 100;

  // Selected meeting roll-call counts
  const presentCount = attendance.filter(
    (a) => a.attendance_status === "present",
  ).length;
  const lateCount = attendance.filter(
    (a) => a.attendance_status === "late",
  ).length;

  const canCreate = canCreateMeeting || canControl || isOfficer;

  // Card renderer for meeting item lists inside sections
  const renderMeetingCard = (meeting: EventRow) => {
    const isSelected = selectedEvent?.id === meeting.id;
    const isArchived = Boolean(meeting.archived_at);
    const isCancelled = meeting.status === "cancelled";

    return (
      <div
        className={`p-4 rounded-xl border transition-all ${
          isSelected
            ? "bg-[#174C37]/5 border-[#174C37] shadow-xs ring-1 ring-[#174C37]/30"
            : "bg-white border-[#E5DDD3] hover:border-[#174C37]/40 hover:bg-[#FAF6F0]"
        }`}
        key={meeting.id}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold text-[#3D291F] truncate">
                {meeting.title}
              </span>
              {isSelected && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#174C37] text-white">
                  Active Context
                </span>
              )}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                  isArchived
                    ? "text-[#7A685D] bg-white border-[#E5DDD3]"
                    : isCancelled
                      ? "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30"
                      : meeting.status === "scheduled"
                        ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
                        : "text-[#5C4638] bg-white border-[#E5DDD3]"
                }`}
              >
                {isArchived ? "Archived" : meeting.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B5D53]">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
                <span>
                  {formatEventDateSpan(
                    meeting.starts_at,
                    meeting.duration_days,
                  )}
                  , {formatEventTime(meeting.starts_at)} WAT
                </span>
              </div>
              {meeting.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
                  <span className="truncate max-w-[280px]">
                    {meeting.location}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
            {isSelected ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#174C37] bg-white border border-[#174C37]/30 inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>Selected</span>
              </span>
            ) : (
              <button
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#174C37] bg-[#FAF6F0] border border-[#E5DDD3] hover:bg-white hover:border-[#174C37] transition-colors cursor-pointer min-h-[36px]"
                onClick={() => handleEventChange(meeting.id)}
                type="button"
              >
                View Records
              </button>
            )}

            {meeting.attendance_enabled && (
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#5C4638] hover:text-[#174C37] hover:bg-white transition-colors cursor-pointer min-h-[36px]"
                onClick={() => handleSelectMeetingAndTab(meeting.id, "session")}
                title="Jump to Attendance for this meeting"
                type="button"
              >
                Attendance
              </button>
            )}

            {meeting.minutes_enabled && (
              <button
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#5C4638] hover:text-[#174C37] hover:bg-white transition-colors cursor-pointer min-h-[36px]"
                onClick={() => handleSelectMeetingAndTab(meeting.id, "minutes")}
                title="Jump to Minutes for this meeting"
                type="button"
              >
                Minutes
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A685D] mb-1.5">
              <span className="font-extrabold text-[#174C37] uppercase tracking-wider text-[11px]">
                Secretariat & Meeting Records
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Meeting Hub
            </h1>
            <p className="text-xs sm:text-sm text-[#7A685D] mt-1 max-w-2xl">
              Live meeting check-in, official minutes, and attendance records.
            </p>
          </div>

          {canCreate && (
            <button
              className="cf-btn cf-btn--primary min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
              onClick={() => setIsNewMeetingModalOpen(true)}
              type="button"
            >
              <Plus className="w-4 h-4 text-[#D6A23A]" />
              <span>New Meeting</span>
            </button>
          )}
        </div>

        {/* 3 Collapsible Meeting Sections */}
        <div className="space-y-4">
          {/* SECTION 1: Upcoming Meetings (Open by default) */}
          <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
            <button
              aria-controls="upcoming-meetings-panel"
              aria-expanded={upcomingOpen}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
              onClick={() => setUpcomingOpen((prev) => !prev)}
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#174C37]/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-[#174C37]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                      Upcoming Meetings
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-[#174C37]/15 text-[#174C37]">
                      {upcomingMeetings.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7A685D] mt-0.5">
                    Scheduled general and executive meetings
                  </p>
                </div>
              </div>
              <div className="p-1 rounded-lg text-[#7A685D]">
                {upcomingOpen ? (
                  <ChevronUp className="w-5 h-5 text-[#174C37]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#7A685D]" />
                )}
              </div>
            </button>

            {upcomingOpen && (
              <div
                className="p-4 sm:p-5 pt-0 border-t border-[#E5DDD3] space-y-3"
                id="upcoming-meetings-panel"
              >
                {upcomingMeetings.length > 0 ? (
                  upcomingMeetings.map((evt) => renderMeetingCard(evt))
                ) : (
                  <div className="p-5 text-center space-y-1 bg-white rounded-xl border border-[#E5DDD3]">
                    <p className="text-xs font-bold text-[#3D291F]">
                      No upcoming meetings currently scheduled
                    </p>
                    <p className="text-[11px] text-[#7A685D]">
                      Use the New Meeting button to schedule a General House
                      meeting.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 2: Past Meetings (Collapsed by default) */}
          <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
            <button
              aria-controls="past-meetings-panel"
              aria-expanded={pastOpen}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
              onClick={() => setPastOpen((prev) => !prev)}
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E5DDD3] flex items-center justify-center shrink-0">
                  <History className="w-4 h-4 text-[#7A685D]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                      Past Meetings
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-[#E5DDD3] text-[#5C4638]">
                      {pastMeetings.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7A685D] mt-0.5">
                    Past meetings, attendance, and minutes
                  </p>
                </div>
              </div>
              <div className="p-1 rounded-lg text-[#7A685D]">
                {pastOpen ? (
                  <ChevronUp className="w-5 h-5 text-[#174C37]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#7A685D]" />
                )}
              </div>
            </button>

            {pastOpen && (
              <div
                className="p-4 sm:p-5 pt-0 border-t border-[#E5DDD3] space-y-3"
                id="past-meetings-panel"
              >
                {pastMeetings.length > 0 ? (
                  pastMeetings.map((evt) => renderMeetingCard(evt))
                ) : (
                  <div className="p-5 text-center space-y-1 bg-white rounded-xl border border-[#E5DDD3]">
                    <p className="text-xs font-bold text-[#3D291F]">
                      No past meetings on record
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 3: Cancelled / Archived Meetings (Collapsed by default) */}
          <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
            <button
              aria-controls="archived-meetings-panel"
              aria-expanded={archivedOpen}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
              onClick={() => setArchivedOpen((prev) => !prev)}
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E5DDD3] flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-[#7A685D]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                      Cancelled / Archived Meetings
                    </h2>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-[#E5DDD3] text-[#7A685D]">
                      {cancelledOrArchivedMeetings.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7A685D] mt-0.5">
                    Cancelled and archived meetings
                  </p>
                </div>
              </div>
              <div className="p-1 rounded-lg text-[#7A685D]">
                {archivedOpen ? (
                  <ChevronUp className="w-5 h-5 text-[#174C37]" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-[#7A685D]" />
                )}
              </div>
            </button>

            {archivedOpen && (
              <div
                className="p-4 sm:p-5 pt-0 border-t border-[#E5DDD3] space-y-3"
                id="archived-meetings-panel"
              >
                {cancelledOrArchivedMeetings.length > 0 ? (
                  cancelledOrArchivedMeetings.map((evt) =>
                    renderMeetingCard(evt),
                  )
                ) : (
                  <div className="p-5 text-center space-y-1 bg-white rounded-xl border border-[#E5DDD3]">
                    <p className="text-xs font-bold text-[#3D291F]">
                      No cancelled or archived meetings
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected Event Details Banner */}
        {selectedEvent && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-xs font-extrabold text-[#174C37]">
                  Active Meeting:
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#3D291F] truncate max-w-[220px] sm:max-w-none">
                  {selectedEvent.title}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                    selectedEvent.archived_at
                      ? "text-[#7A685D] bg-white border-[#E5DDD3]"
                      : selectedEvent.status === "scheduled"
                        ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
                        : "text-[#5C4638] bg-white border-[#E5DDD3]"
                  }`}
                >
                  {selectedEvent.status}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#6B5D53]">
                <Calendar className="w-3.5 h-3.5 text-[#174C37]" />
                <span>
                  {formatEventDateSpan(
                    selectedEvent.starts_at,
                    selectedEvent.duration_days,
                  )}
                  , {formatEventTime(selectedEvent.starts_at)} WAT
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                aria-label="Switch active meeting"
                className="h-9 pl-3 pr-8 bg-white border border-[#E5DDD3] rounded-lg text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] cursor-pointer"
                id="meeting-selector-input"
                onChange={(e) => handleEventChange(e.target.value)}
                value={selectedEvent.id}
              >
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.title} (
                    {new Date(evt.starts_at).toLocaleDateString("en-GB", {
                      month: "short",
                      day: "numeric",
                      timeZone: "Africa/Lagos",
                    })}
                    )
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* KPI Cards: 2x2 matrix on mobile, 4-col on desktop */}
        {selectedEvent && (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            {/* Card 1: Live Session Status */}
            <div className="p-3 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
              <div className="flex items-center justify-between text-xs text-[#6B5D53]">
                <span className="font-bold">Live Check-In</span>
                <Clock className="w-4 h-4 text-[#174C37]" />
              </div>
              <div className="text-base sm:text-xl font-extrabold text-[#3D291F]">
                {sessionOpen ? "Session Open" : "Session Inactive"}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#6B5D53] truncate">
                {sessionOpen
                  ? `Cutoff: ${session?.late_after_minutes}m`
                  : "Awaiting activation"}
              </p>
            </div>

            {/* Card 2: Personal Attendance Standing */}
            <div className="p-3 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
              <div className="flex items-center justify-between text-xs text-[#6B5D53]">
                <span className="font-bold">My Standing</span>
                <UserCheck className="w-4 h-4 text-[#D6A23A]" />
              </div>
              <div className="text-base sm:text-xl font-extrabold text-[#174C37]">
                {attendanceRate}%
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#6B5D53] truncate">
                {attendedCount} of {totalTrackedMeetings} attended
              </p>
            </div>

            {/* Card 3: Secretariat Minutes */}
            <div className="p-3 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
              <div className="flex items-center justify-between text-xs text-[#6B5D53]">
                <span className="font-bold">Minutes</span>
                <FileText className="w-4 h-4 text-[#174C37]" />
              </div>
              <div className="text-base sm:text-xl font-extrabold text-[#3D291F]">
                {minutes ? `Rev. ${minutes.revision_number}` : "Pending"}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#6B5D53] truncate">
                {minutes ? "Ratified" : "Not published yet"}
              </p>
            </div>

            {/* Card 4: Meeting Roll Call */}
            <div className="p-3 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
              <div className="flex items-center justify-between text-xs text-[#6B5D53]">
                <span className="font-bold">Attendance</span>
                <Users className="w-4 h-4 text-[#174C37]" />
              </div>
              <div className="text-base sm:text-xl font-extrabold text-[#3D291F]">
                {attendance.length} Total
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#6B5D53] truncate">
                {presentCount} Present · {lateCount} Late
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs Bar — Shortened Headings */}
        {selectedEvent && (
          <div className="flex items-center gap-1.5 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto">
            <button
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shrink-0 ${
                activeTab === "session"
                  ? "bg-[#174C37] text-white shadow-xs border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              onClick={() => handleTabChange("session")}
              type="button"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Attendance</span>
            </button>

            <button
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shrink-0 ${
                activeTab === "minutes"
                  ? "bg-[#174C37] text-white shadow-xs border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              id="tab-minutes-transcripts"
              onClick={() => handleTabChange("minutes")}
              type="button"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Minutes</span>
            </button>

            <button
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shrink-0 ${
                activeTab === "history"
                  ? "bg-[#174C37] text-white shadow-xs border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              onClick={() => handleTabChange("history")}
              type="button"
            >
              <History className="w-3.5 h-3.5" />
              <span>Standing</span>
            </button>

            {isOfficer && (
              <button
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shrink-0 ${
                  activeTab === "audit"
                    ? "bg-[#174C37] text-white shadow-xs border-0"
                    : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
                }`}
                onClick={() => handleTabChange("audit")}
                type="button"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Audit Log</span>
              </button>
            )}
          </div>
        )}
      </section>

      {/* TAB 1: Attendance */}
      {selectedEvent && activeTab === "session" && (
        <div
          className="scroll-target tab-panel-focus space-y-6 animate-in fade-in duration-150"
          id="attendance-session"
          tabIndex={-1}
        >
          {selectedEvent.attendance_enabled ? (
            <>
              {/* Member Self Check-in */}
              <CheckinCard
                canReviewAttendance={canReviewAttendance}
                eventId={selectedEvent.id}
                isMutable={mutableForSession}
                ownAttendance={ownAttendance}
                returnTo="hub"
                sessionOpen={sessionOpen}
              />

              {/* Officer Session Controls (Admins/Executives) */}
              {canControl && (
                <OfficerSessionControls
                  defaultCutoff={defaultCutoff}
                  eventId={selectedEvent.id}
                  mutableForSession={mutableForSession}
                  returnTo="hub"
                  session={session}
                  sessionOpen={sessionOpen}
                />
              )}

              {/* Attendance Roster Table (Officers / Reviewers) */}
              {canReviewAttendance && (
                <AttendanceRosterTable
                  attendance={attendance}
                  canCorrect={canControl || isOfficer}
                  eventId={selectedEvent.id}
                  members={members}
                  returnTo="hub"
                />
              )}
            </>
          ) : (
            <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
              <Clock className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
              <h2 className="text-sm font-bold text-[#3D291F]">
                Attendance Tracking Not Enabled
              </h2>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                This meeting does not have attendance verification enabled.
                Select another meeting above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Minutes */}
      {selectedEvent && activeTab === "minutes" && (
        <div
          className="scroll-target tab-panel-focus space-y-6 animate-in fade-in duration-150"
          id="attendance-minutes"
          tabIndex={-1}
        >
          {selectedEvent.minutes_enabled ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#174C37] block">
                    Meeting Minutes
                  </span>
                  <h2 className="text-lg font-extrabold text-[#3D291F]">
                    Minutes — {selectedEvent.title}
                  </h2>
                  <p className="text-xs text-[#7A685D]">
                    Convened on{" "}
                    {formatEventDateSpan(
                      selectedEvent.starts_at,
                      selectedEvent.duration_days,
                    )}
                    , {formatEventTime(selectedEvent.starts_at)} WAT
                  </p>
                </div>

                {/* Actions: Print and Copy */}
                {minutes?.content && (
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3.5 py-2 text-xs font-bold text-[#3D291F] bg-white border border-[#E5DDD3] rounded-xl hover:bg-[#FAF6F0] min-h-[38px] flex items-center gap-1.5 transition-colors cursor-pointer"
                      onClick={handleCopyMinutes}
                      type="button"
                    >
                      {copiedMinutes ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#174C37]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#174C37]" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>

                    <button
                      className="px-3.5 py-2 text-xs font-bold text-white bg-[#174C37] hover:bg-[#103D2B] rounded-xl min-h-[38px] flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                      onClick={() => window.print()}
                      type="button"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#D6A23A]" />
                      <span>Print Minutes</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Minutes Card Component */}
              <MinutesCard
                canWriteMinutes={canWriteMinutes}
                eventId={selectedEvent.id}
                minutes={minutes}
                returnTo="hub"
              />
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
              <FileText className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
              <h2 className="text-sm font-bold text-[#3D291F]">
                Minutes Not Enabled For This Meeting
              </h2>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                Official minutes transcription is not active for this meeting.
                Select another meeting above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Standing */}
      {selectedEvent && activeTab === "history" && (
        <div
          className="scroll-target tab-panel-focus space-y-6 animate-in fade-in duration-150"
          id="attendance-history"
          tabIndex={-1}
        >
          <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
              <div>
                <h2 className="text-base font-extrabold text-[#3D291F]">
                  Personal Attendance Ledger
                </h2>
                <p className="text-xs text-[#7A685D]">
                  Member:{" "}
                  <strong className="text-[#3D291F]">
                    {currentUser.fullName}
                  </strong>{" "}
                  (@{currentUser.username})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-[#174C37] bg-[#174C37]/10 border border-[#174C37]/30">
                  Attendance Rate: {attendanceRate}%
                  {attendanceRate >= 80 ? " · Good Standing" : ""}
                </span>
              </div>
            </div>

            {memberAttendanceHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5DDD3] text-[#7A685D] uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4 font-extrabold">
                        Meeting Date (WAT)
                      </th>
                      <th className="py-3 px-4 font-extrabold">
                        Meeting Title
                      </th>
                      <th className="py-3 px-4 font-extrabold">
                        Verified Check-In
                      </th>
                      <th className="py-3 px-4 font-extrabold">Method</th>
                      <th className="py-3 px-4 font-extrabold text-right">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DDD3]">
                    {memberAttendanceHistory.map((row) => (
                      <tr
                        className="hover:bg-[#FAF6F0] transition-colors"
                        key={row.eventId}
                      >
                        <td className="py-3 px-4 font-mono font-medium text-[#5C4638]">
                          {eventDateOnly.format(new Date(row.startsAt))},{" "}
                          {formatEventTime(row.startsAt)} WAT
                        </td>
                        <td className="py-3 px-4 font-bold text-[#3D291F]">
                          <button
                            className="text-[#174C37] bg-transparent border-0 hover:underline cursor-pointer text-left"
                            onClick={() => handleEventChange(row.eventId)}
                            type="button"
                          >
                            {row.title}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#5C4638]">
                          {row.checkedInAt
                            ? `${watShortDate.format(new Date(row.checkedInAt))} WAT`
                            : "—"}
                        </td>
                        <td className="py-3 px-4 capitalize text-[#7A685D]">
                          {row.method ? row.method.replace("_", " ") : "Self"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              row.status === "present"
                                ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
                                : row.status === "late"
                                  ? "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30"
                                  : "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center space-y-2">
                <Calendar className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
                <h3 className="text-sm font-bold text-[#3D291F]">
                  No Recorded Past Meetings Yet
                </h3>
                <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                  Your attendance standing will appear here as soon as you check
                  in to club assemblies.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Officer Audit Trail */}
      {selectedEvent && activeTab === "audit" && isOfficer && (
        <div
          className="scroll-target tab-panel-focus space-y-6 animate-in fade-in duration-150"
          id="attendance-audit"
          tabIndex={-1}
        >
          {audits.length > 0 ? (
            <AttendanceAuditHistory audits={audits} />
          ) : (
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-2 shadow-xs">
              <Shield className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
              <h3 className="text-sm font-bold text-[#3D291F]">
                No Audited Actions on Record
              </h3>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                No session state changes, cutoff adjustments, or manual
                corrections have been logged for this meeting.
              </p>
            </div>
          )}
        </div>
      )}

      {/* New Meeting Modal */}
      {canCreate && (
        <NewMeetingModal
          isOpen={isNewMeetingModalOpen}
          onClose={() => setIsNewMeetingModalOpen(false)}
        />
      )}
    </div>
  );
}
