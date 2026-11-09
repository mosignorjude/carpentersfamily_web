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
  X,
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
import { useModalHygiene } from "@/lib/use-modal-hygiene";

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
  const [isMeetingSelectorModalOpen, setIsMeetingSelectorModalOpen] =
    useState(false);

  // Meeting Hub Section Accordion States (Inside Switch Meeting Modal)
  const [upcomingOpen, setUpcomingOpen] = useState(true);
  const [pastOpen, setPastOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);

  useModalHygiene({
    isOpen: isMeetingSelectorModalOpen,
    onClose: () => setIsMeetingSelectorModalOpen(false),
  });

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

  // Helper renderer for meeting items in the Switch Meeting modal
  const renderModalMeetingItem = (meeting: EventRow) => {
    const isSelected = selectedEvent?.id === meeting.id;
    const isArchived = Boolean(meeting.archived_at);
    const isCancelled = meeting.status === "cancelled";

    return (
      <button
        className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
          isSelected
            ? "border-[#174C37] bg-[#174C37]/5 ring-1 ring-[#174C37]/20"
            : "border-[#E5DDD3] bg-white hover:bg-[#FAF6F0]"
        }`}
        key={meeting.id}
        onClick={() => {
          handleEventChange(meeting.id);
          setIsMeetingSelectorModalOpen(false);
        }}
        type="button"
      >
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs text-[#3D291F] truncate">
              {meeting.title}
            </span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold capitalize ${
                isArchived
                  ? "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]"
                  : isCancelled
                    ? "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                    : meeting.status === "scheduled"
                      ? "bg-[#174C37]/10 text-[#174C37]"
                      : "bg-[#FAF6F0] text-[#5C4638]"
              }`}
            >
              {isArchived ? "Archived" : meeting.status}
            </span>
          </div>
          <span className="text-[11px] text-[#7A685D] block truncate">
            {formatEventDateSpan(meeting.starts_at, meeting.duration_days)} ·{" "}
            {formatEventTime(meeting.starts_at)} WAT
            {meeting.location ? ` · ${meeting.location}` : ""}
          </span>
        </div>

        <div className="shrink-0">
          {isSelected ? (
            <span className="text-xs font-bold text-[#174C37] inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Selected</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-[#7A685D] hover:text-[#174C37]">
              Select
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Compact Page Header & Quick Action */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#174C37] bg-[#174C37]/10 px-2 py-0.5 rounded-md">
              Secretariat
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#3D291F] tracking-tight mt-1">
            Meeting Hub
          </h1>
          <p className="text-xs text-[#7A685D] mt-0.5">
            Live meeting check-in, official minutes, and attendance records.
          </p>
        </div>

        {canCreate && (
          <button
            className="px-3.5 py-2 rounded-xl bg-[#174C37] hover:bg-[#0C3325] text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 shrink-0 min-h-[40px] cursor-pointer"
            onClick={() => setIsNewMeetingModalOpen(true)}
            type="button"
          >
            <Plus className="w-4 h-4 text-[#D6A23A]" />
            <span>New Meeting</span>
          </button>
        )}
      </div>

      {/* 2. Spotlight Meeting Card (Active Meeting) */}
      {selectedEvent ? (
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 shadow-xs space-y-3 relative overflow-hidden">
          {/* Top Green Accent Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-[#174C37]" />

          {/* Card Header & Meeting Switcher Pill */}
          <div className="flex flex-wrap items-start justify-between gap-2 pt-0.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/30">
                  Active Meeting
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF6F0] text-[#5C4638] border border-[#E5DDD3] capitalize">
                  {selectedEvent.archived_at
                    ? "Archived"
                    : selectedEvent.status}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#3D291F]">
                {selectedEvent.title}
              </h2>
            </div>

            {/* Clean Meeting Switcher Trigger */}
            <button
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] hover:bg-[#E5DDD3]/60 border border-[#E5DDD3] text-xs font-bold text-[#5C4638] transition-colors cursor-pointer min-h-[36px]"
              onClick={() => setIsMeetingSelectorModalOpen(true)}
              type="button"
            >
              <Calendar className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Switch Meeting</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#7A685D]" />
            </button>
          </div>

          {/* Key Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5C4638] pt-1">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#174C37] shrink-0" />
              <span className="font-medium">
                {formatEventDateSpan(
                  selectedEvent.starts_at,
                  selectedEvent.duration_days,
                )}{" "}
                ·{" "}
                <strong className="text-[#3D291F] font-bold">
                  {formatEventTime(selectedEvent.starts_at)} WAT
                </strong>
              </span>
            </div>
            {selectedEvent.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#7A685D] shrink-0" />
                <span className="truncate">{selectedEvent.location}</span>
              </div>
            )}
          </div>

          {/* Collapsible Agenda Outline */}
          {selectedEvent.description && (
            <div className="pt-2 border-t border-[#E5DDD3]/70 text-xs">
              <details className="group cursor-pointer">
                <summary className="flex items-center justify-between text-[#7A685D] font-bold hover:text-[#3D291F] select-none">
                  <span>Agenda & Notice Outline</span>
                  <span className="text-[11px] text-[#174C37] group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <p className="mt-2 text-[#5C4638] leading-relaxed bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3]">
                  {selectedEvent.description}
                </p>
              </details>
            </div>
          )}
        </section>
      ) : (
        <section className="bg-white rounded-2xl border border-[#E5DDD3] p-8 text-center space-y-3 shadow-xs">
          <Calendar className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
          <h2 className="text-base font-bold text-[#3D291F]">
            No Meetings Scheduled Yet
          </h2>
          <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
            Meetings created by the Secretariat will appear here for check-in
            and minutes.
          </p>
          {canCreate && (
            <button
              className="mt-2 px-4 py-2 rounded-xl bg-[#174C37] hover:bg-[#0C3325] text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              onClick={() => setIsNewMeetingModalOpen(true)}
              type="button"
            >
              <Plus className="w-4 h-4 text-[#D6A23A]" />
              <span>Create First Meeting</span>
            </button>
          )}
        </section>
      )}

      {/* 3. Workspace Tabs Navigation Bar */}
      {selectedEvent && (
        <nav
          aria-label="Meeting Sections"
          className="flex items-center gap-1.5 p-1 bg-white rounded-xl border border-[#E5DDD3] shadow-2xs overflow-x-auto text-xs font-bold"
        >
          <button
            className={`px-3.5 py-2 rounded-lg transition-all min-h-[38px] flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "session"
                ? "bg-[#174C37] text-white shadow-xs"
                : "text-[#5C4638] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => handleTabChange("session")}
            type="button"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Attendance</span>
          </button>

          <button
            className={`px-3.5 py-2 rounded-lg transition-all min-h-[38px] flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "minutes"
                ? "bg-[#174C37] text-white shadow-xs"
                : "text-[#5C4638] hover:bg-[#FAF6F0]"
            }`}
            id="tab-minutes-transcripts"
            onClick={() => handleTabChange("minutes")}
            type="button"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Minutes</span>
          </button>

          <button
            className={`px-3.5 py-2 rounded-lg transition-all min-h-[38px] flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === "history"
                ? "bg-[#174C37] text-white shadow-xs"
                : "text-[#5C4638] hover:bg-[#FAF6F0]"
            }`}
            onClick={() => handleTabChange("history")}
            type="button"
          >
            <History className="w-3.5 h-3.5" />
            <span>Standing</span>
          </button>

          {isOfficer && (
            <button
              className={`px-3.5 py-2 rounded-lg transition-all min-h-[38px] flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeTab === "audit"
                  ? "bg-[#174C37] text-white shadow-xs"
                  : "text-[#5C4638] hover:bg-[#FAF6F0]"
              }`}
              onClick={() => handleTabChange("audit")}
              type="button"
            >
              <Shield className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Audit Log</span>
            </button>
          )}
        </nav>
      )}

      {/* 4. Tab Panels */}

      {/* TAB 1: Attendance Panel */}
      {selectedEvent && activeTab === "session" && (
        <div
          className="scroll-target tab-panel-focus space-y-4 animate-in fade-in duration-150"
          id="attendance-session"
          tabIndex={-1}
        >
          {selectedEvent.attendance_enabled ? (
            <>
              {/* Member Self Check-in Card */}
              <CheckinCard
                canReviewAttendance={canReviewAttendance}
                eventId={selectedEvent.id}
                isMutable={mutableForSession}
                ownAttendance={ownAttendance}
                returnTo="hub"
                sessionOpen={sessionOpen}
              />

              {/* 3-Tile KPI Summary Strip */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-white rounded-xl border border-[#E5DDD3] p-3 shadow-2xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
                    Live Session
                  </span>
                  <span
                    className={`text-xs sm:text-sm font-extrabold block ${
                      sessionOpen ? "text-[#174C37]" : "text-[#3D291F]"
                    }`}
                  >
                    {sessionOpen ? "Active" : "Inactive"}
                  </span>
                  <span className="text-[10px] text-[#7A685D] block truncate">
                    {sessionOpen
                      ? `Cutoff: ${session?.late_after_minutes ?? defaultCutoff}m`
                      : `Cutoff: ${defaultCutoff}m`}
                  </span>
                </div>

                <div className="bg-white rounded-xl border border-[#E5DDD3] p-3 shadow-2xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
                    My Standing
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#174C37] block font-mono tabular-nums">
                    {attendanceRate}%
                  </span>
                  <span className="text-[10px] text-[#7A685D] block truncate">
                    {attendedCount} of {totalTrackedMeetings} attended
                  </span>
                </div>

                <div className="bg-white rounded-xl border border-[#E5DDD3] p-3 shadow-2xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
                    Attendance
                  </span>
                  <span className="text-xs sm:text-sm font-extrabold text-[#3D291F] block font-mono tabular-nums">
                    {attendance.length} Total
                  </span>
                  <span className="text-[10px] text-[#7A685D] block truncate">
                    {presentCount} present · {lateCount} late
                  </span>
                </div>
              </div>

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
              <h3 className="text-sm font-bold text-[#3D291F]">
                Attendance Tracking Not Enabled
              </h3>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                This meeting does not have attendance verification enabled.
                Switch meeting above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Minutes Panel */}
      {selectedEvent && activeTab === "minutes" && (
        <div
          className="scroll-target tab-panel-focus space-y-4 animate-in fade-in duration-150"
          id="attendance-minutes"
          tabIndex={-1}
        >
          {selectedEvent.minutes_enabled ? (
            <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#174C37] block">
                    Secretariat Records
                  </span>
                  <h2 className="text-sm sm:text-base font-extrabold text-[#3D291F]">
                    Minutes — {selectedEvent.title}
                  </h2>
                  <p className="text-[11px] text-[#7A685D]">
                    Convened on{" "}
                    {formatEventDateSpan(
                      selectedEvent.starts_at,
                      selectedEvent.duration_days,
                    )}
                    , {formatEventTime(selectedEvent.starts_at)} WAT
                  </p>
                </div>

                {minutes?.content && (
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      className="px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-bold text-[#5C4638] hover:bg-[#E5DDD3] transition-colors flex items-center gap-1.5 min-h-[36px] cursor-pointer"
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
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    <button
                      className="px-3 py-1.5 rounded-lg bg-[#174C37] text-white text-xs font-bold hover:bg-[#0C3325] transition-colors flex items-center gap-1.5 min-h-[36px] cursor-pointer"
                      onClick={() => window.print()}
                      type="button"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#D6A23A]" />
                      <span>Print</span>
                    </button>
                  </div>
                )}
              </div>

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
              <h3 className="text-sm font-bold text-[#3D291F]">
                Minutes Not Enabled For This Meeting
              </h3>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                Official minutes transcription is not active for this meeting.
                Switch meeting above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Standing Panel */}
      {selectedEvent && activeTab === "history" && (
        <div
          className="scroll-target tab-panel-focus space-y-4 animate-in fade-in duration-150"
          id="attendance-history"
          tabIndex={-1}
        >
          <section className="bg-white rounded-2xl border border-[#E5DDD3] p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
              <div>
                <h2 className="text-sm font-extrabold text-[#3D291F]">
                  My Attendance Record
                </h2>
                <p className="text-[11px] text-[#7A685D]">
                  Member:{" "}
                  <strong className="text-[#3D291F]">
                    {currentUser.fullName}
                  </strong>{" "}
                  (@{currentUser.username})
                </p>
              </div>
              {attendanceRate >= 80 && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/30">
                  Good Standing
                </span>
              )}
            </div>

            {/* Rate Banner */}
            <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-between">
              <div>
                <span className="text-2xl font-black font-mono text-[#174C37]">
                  {attendanceRate}%
                </span>
                <span className="text-xs text-[#7A685D] block mt-0.5">
                  {attendedCount} of {totalTrackedMeetings} meetings attended on
                  record
                </span>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
                <Check className="w-6 h-6 text-[#174C37]" />
              </div>
            </div>

            {/* History List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
                Recent Meetings
              </h3>
              {memberAttendanceHistory.length > 0 ? (
                <div className="border border-[#E5DDD3] rounded-xl divide-y divide-[#E5DDD3] text-xs">
                  {memberAttendanceHistory.map((row) => (
                    <div
                      className="p-3 bg-white flex items-center justify-between gap-2 hover:bg-[#FAF6F0]/50 transition-colors"
                      key={row.eventId}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <button
                          className="font-bold text-[#3D291F] hover:text-[#174C37] text-left truncate block bg-transparent border-0 cursor-pointer"
                          onClick={() => {
                            handleEventChange(row.eventId);
                          }}
                          type="button"
                        >
                          {row.title}
                        </button>
                        <span className="text-[11px] text-[#7A685D] block">
                          {eventDateOnly.format(new Date(row.startsAt))} ·{" "}
                          {row.method ? row.method.replace("_", " ") : "Portal"}
                          {row.checkedInAt &&
                            ` · ${watShortDate.format(new Date(row.checkedInAt))} WAT`}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                          row.status === "present"
                            ? "bg-[#174C37]/10 text-[#174C37]"
                            : row.status === "late"
                              ? "bg-[#BA3C2A]/10 text-[#BA3C2A]"
                              : "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]"
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center space-y-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3]">
                  <p className="text-xs font-bold text-[#3D291F]">
                    No recorded meetings yet
                  </p>
                  <p className="text-[11px] text-[#7A685D]">
                    Your attendance history will appear here as you check in to
                    club meetings.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: Officer Audit Trail */}
      {selectedEvent && activeTab === "audit" && isOfficer && (
        <div
          className="scroll-target tab-panel-focus space-y-4 animate-in fade-in duration-150"
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

      {/* MODAL 1: Switch Meeting Modal */}
      {isMeetingSelectorModalOpen && (
        <div
          aria-labelledby="switch-meeting-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
          role="dialog"
        >
          <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg p-5 shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5DDD3] pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#174C37]" />
                <h3
                  className="text-sm font-extrabold text-[#3D291F]"
                  id="switch-meeting-title"
                >
                  Switch Meeting
                </h3>
              </div>
              <button
                aria-label="Close switch meeting"
                className="p-1 rounded-lg text-[#7A685D] hover:text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer"
                onClick={() => setIsMeetingSelectorModalOpen(false)}
                type="button"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#7A685D]">
              Select a meeting to view its check-in session, official minutes,
              and records.
            </p>

            {/* 3 Collapsible Meeting Sections inside Modal */}
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {/* Section 1: Upcoming Meetings */}
              <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
                <button
                  aria-controls="upcoming-meetings-panel"
                  aria-expanded={upcomingOpen}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
                  onClick={() => setUpcomingOpen((prev) => !prev)}
                  type="button"
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-[#174C37]" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#3D291F]">
                        Upcoming Meetings
                      </span>
                      <span className="text-[11px] font-mono font-medium text-[#7A685D]">
                        ({upcomingMeetings.length})
                      </span>
                    </div>
                  </div>
                  {upcomingOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#174C37]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#7A685D]" />
                  )}
                </button>

                {upcomingOpen && (
                  <div
                    className="p-3 pt-0 border-t border-[#E5DDD3] space-y-2"
                    id="upcoming-meetings-panel"
                  >
                    {upcomingMeetings.length > 0 ? (
                      upcomingMeetings.map((evt) => renderModalMeetingItem(evt))
                    ) : (
                      <div className="p-3 text-center text-xs text-[#7A685D] bg-white rounded-lg border border-[#E5DDD3]">
                        No upcoming meetings scheduled.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Past Meetings */}
              <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
                <button
                  aria-controls="past-meetings-panel"
                  aria-expanded={pastOpen}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
                  onClick={() => setPastOpen((prev) => !prev)}
                  type="button"
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 text-[#7A685D]" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#3D291F]">
                        Past Meetings
                      </span>
                      <span className="text-[11px] font-mono font-medium text-[#7A685D]">
                        ({pastMeetings.length})
                      </span>
                    </div>
                  </div>
                  {pastOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#174C37]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#7A685D]" />
                  )}
                </button>

                {pastOpen && (
                  <div
                    className="p-3 pt-0 border-t border-[#E5DDD3] space-y-2"
                    id="past-meetings-panel"
                  >
                    {pastMeetings.length > 0 ? (
                      pastMeetings.map((evt) => renderModalMeetingItem(evt))
                    ) : (
                      <div className="p-3 text-center text-xs text-[#7A685D] bg-white rounded-lg border border-[#E5DDD3]">
                        No past meetings on record.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 3: Cancelled / Archived Meetings */}
              <div className="bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-hidden">
                <button
                  aria-controls="archived-meetings-panel"
                  aria-expanded={archivedOpen}
                  className="w-full flex items-center justify-between p-3.5 text-left hover:bg-[#F5EFE6] transition-colors cursor-pointer"
                  onClick={() => setArchivedOpen((prev) => !prev)}
                  type="button"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#7A685D]" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-[#3D291F]">
                        Cancelled / Archived Meetings
                      </span>
                      <span className="text-[11px] font-mono font-medium text-[#7A685D]">
                        ({cancelledOrArchivedMeetings.length})
                      </span>
                    </div>
                  </div>
                  {archivedOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#174C37]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#7A685D]" />
                  )}
                </button>

                {archivedOpen && (
                  <div
                    className="p-3 pt-0 border-t border-[#E5DDD3] space-y-2"
                    id="archived-meetings-panel"
                  >
                    {cancelledOrArchivedMeetings.length > 0 ? (
                      cancelledOrArchivedMeetings.map((evt) =>
                        renderModalMeetingItem(evt),
                      )
                    ) : (
                      <div className="p-3 text-center text-xs text-[#7A685D] bg-white rounded-lg border border-[#E5DDD3]">
                        No cancelled or archived meetings.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#E5DDD3] flex justify-end">
              <button
                className="px-4 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#E5DDD3] text-xs font-bold text-[#5C4638] transition-colors cursor-pointer"
                onClick={() => setIsMeetingSelectorModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: New Meeting Modal */}
      {canCreate && (
        <NewMeetingModal
          isOpen={isNewMeetingModalOpen}
          onClose={() => setIsNewMeetingModalOpen(false)}
        />
      )}
    </div>
  );
}
