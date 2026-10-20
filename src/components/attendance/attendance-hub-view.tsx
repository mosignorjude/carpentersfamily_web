"use client";

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  History,
  Printer,
  Shield,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
  currentUser: {
    id: string;
    fullName: string;
    username: string;
    role: string;
  };
  notice: string | null;
}

type HubTab = "session" | "minutes" | "history" | "audit";
type EventTypeFilter = "all" | "meeting" | "general";

const watDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "full",
  timeStyle: "short",
});

const watShortDate = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatEventTypeLabel(eventType?: string) {
  if (eventType === "meeting") return "General Meeting";
  if (eventType === "party") return "General Event";
  return "Official Gathering";
}

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
  currentUser,
  notice,
}: AttendanceHubViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as HubTab) || "session";
  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");
  const [copiedMinutes, setCopiedMinutes] = useState(false);

  const filteredEvents = events.filter((evt) => {
    if (selectedEvent && evt.id === selectedEvent.id) return true;
    if (typeFilter === "meeting") return evt.event_type === "meeting";
    if (typeFilter === "general") return evt.event_type !== "meeting";
    return true;
  });

  // Switch tab and sync with URL
  const handleTabChange = (tab: HubTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/attendance?${params.toString()}`);
  };

  // Switch selected event
  const handleEventChange = (eventId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("event", eventId);
    router.push(`/attendance?${params.toString()}`);
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
  const absentCount = attendance.filter(
    (a) => a.attendance_status === "absent",
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#E5DDD3]">
          <Link
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#174C37] hover:underline min-h-[36px]"
            href="/events"
          >
            <ArrowLeft className="w-4 h-4 text-[#174C37]" />
            <span>Back to Events & Planning</span>
          </Link>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#E5DDD3]">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A685D] mb-1.5">
              <span className="font-extrabold text-[#174C37] uppercase tracking-wider text-[11px]">
                Secretariat & Assembly Roll Call
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Minutes & Attendance
            </h1>
            <p className="text-xs sm:text-sm text-[#7A685D] mt-1 max-w-2xl">
              Official meeting minutes transcribed by the Secretariat, live
              assembly check-in sessions, and permanent club attendance ledgers.
            </p>
          </div>

          {/* Quick meeting selector with Event Type filter */}
          <div className="bg-[#FAF6F0] p-3.5 rounded-xl border border-[#E5DDD3] space-y-2.5 shrink-0 min-w-[290px]">
            <div className="flex items-center justify-between gap-2">
              <label
                className="block text-[10px] font-extrabold text-[#5C4638] uppercase tracking-wider"
                htmlFor="meeting-selector-input"
              >
                Select Meeting / Event
              </label>
              <div className="inline-flex items-center rounded-lg bg-white border border-[#E5DDD3] p-0.5">
                {(
                  [
                    { id: "all", label: "All" },
                    { id: "meeting", label: "Meetings" },
                    { id: "general", label: "Events" },
                  ] as const
                ).map((item) => (
                  <button
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                      typeFilter === item.id
                        ? "bg-[#174C37] text-white"
                        : "text-[#5C4638] hover:text-[#3D291F]"
                    }`}
                    key={item.id}
                    onClick={() => setTypeFilter(item.id)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <select
                className="w-full h-10 pl-3 pr-8 bg-white border border-[#E5DDD3] rounded-lg text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] cursor-pointer"
                id="meeting-selector-input"
                onChange={(e) => handleEventChange(e.target.value)}
                value={selectedEvent?.id ?? ""}
              >
                {filteredEvents.map((evt) => (
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
        </div>

        {/* Selected Event Details Banner */}
        {selectedEvent && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold text-[#174C37]">
                  Active Context:
                </span>
                <span className="text-sm font-bold text-[#3D291F]">
                  {selectedEvent.title}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-[#5C4638] border border-[#E5DDD3]">
                  {formatEventTypeLabel(selectedEvent.event_type)}
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
              <div className="flex items-center gap-2 text-xs text-[#5C4638]">
                <Calendar className="w-3.5 h-3.5 text-[#174C37]" />
                <span>
                  {watDateTime.format(new Date(selectedEvent.starts_at))} WAT
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedEvent.event_type === "party" ? (
                <Link
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E5DDD3] hover:bg-[#FAF6F0] text-xs font-bold text-[#174C37] flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
                  href={`/events/${selectedEvent.id}/dashboard`}
                >
                  <span>Event Dashboard</span>
                  <ExternalLink className="w-3 h-3 text-[#174C37]" />
                </Link>
              ) : (
                <Link
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E5DDD3] hover:bg-[#FAF6F0] text-xs font-bold text-[#174C37] flex items-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
                  href="/events"
                >
                  <span>View in Events</span>
                  <ExternalLink className="w-3 h-3 text-[#174C37]" />
                </Link>
              )}
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Live Session Status */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#7A685D]">
              <span className="font-bold">Live Check-In</span>
              <Clock className="w-4 h-4 text-[#174C37]" />
            </div>
            <div className="text-xl font-extrabold text-[#3D291F]">
              {sessionOpen ? "Session Open" : "Session Inactive"}
            </div>
            <p className="text-[11px] text-[#5C4638]">
              {sessionOpen
                ? `Cutoff: ${session?.late_after_minutes}m from start`
                : "Awaiting officer activation"}
            </p>
          </div>

          {/* Card 2: Personal Attendance Standing */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#7A685D]">
              <span className="font-bold">My Standing</span>
              <UserCheck className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <div className="text-xl font-extrabold text-[#174C37]">
              {attendanceRate}%
            </div>
            <p className="text-[11px] text-[#5C4638]">
              {attendedCount} of {totalTrackedMeetings} assemblies attended
            </p>
          </div>

          {/* Card 3: Secretariat Minutes */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#7A685D]">
              <span className="font-bold">Secretariat Record</span>
              <FileText className="w-4 h-4 text-[#174C37]" />
            </div>
            <div className="text-xl font-extrabold text-[#3D291F]">
              {minutes ? `Rev. ${minutes.revision_number}` : "Pending"}
            </div>
            <p className="text-[11px] text-[#5C4638]">
              {minutes ? "Ratified & Transcribed" : "No transcription yet"}
            </p>
          </div>

          {/* Card 4: Meeting Roll Call */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-1">
            <div className="flex items-center justify-between text-xs text-[#7A685D]">
              <span className="font-bold">Roll Call Tally</span>
              <Users className="w-4 h-4 text-[#174C37]" />
            </div>
            <div className="text-xl font-extrabold text-[#3D291F]">
              {attendance.length} Total
            </div>
            <p className="text-[11px] text-[#5C4638]">
              {presentCount} Present · {lateCount} Late · {absentCount} Absent
            </p>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
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
            <span>Check-in & Live Roll Call</span>
          </button>

          <button
            id="tab-minutes-transcripts"
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer min-h-[38px] flex items-center gap-2 shrink-0 ${
              activeTab === "minutes"
                ? "bg-[#174C37] text-white shadow-xs border-0"
                : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
            }`}
            onClick={() => handleTabChange("minutes")}
            type="button"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Meeting Minutes & Transcripts</span>
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
            <span>My Attendance Standing</span>
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
              <span>Officer Audit Trail</span>
            </button>
          )}
        </div>
      </section>

      {/* Notice Banner */}
      {notice &&
        (() => {
          const isError =
            /not allowed|do not have permission|invalid|rejected|could not|Check the|failed/i.test(
              notice,
            );
          return (
            <div
              aria-live="polite"
              className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2.5 shadow-xs ${
                isError
                  ? "bg-[#FFF9F8] border-[#F5C2C2] text-[#BA3C2A]"
                  : "bg-[#FAF6F0] border-[#174C37]/30 text-[#174C37]"
              }`}
              role={isError ? "alert" : "status"}
            >
              <AlertCircle
                className={`w-4 h-4 shrink-0 ${
                  isError ? "text-[#BA3C2A]" : "text-[#174C37]"
                }`}
              />
              <span>{notice}</span>
            </div>
          );
        })()}

      {/* TAB 1: Check-in & Live Roll Call */}
      {activeTab === "session" && selectedEvent && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
                This event does not require attendance verification. Select
                another meeting above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Meeting Minutes & Secretariat Archive */}
      {activeTab === "minutes" && selectedEvent && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {selectedEvent.minutes_enabled ? (
            <>
              {/* Official Secretariat Letterhead Header */}
              <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#7A685D] block">
                      Secretariat Archive Document #CFSC-SEC-
                      {selectedEvent.id.slice(0, 8).toUpperCase()}
                    </span>
                    <h2 className="text-lg font-extrabold text-[#3D291F]">
                      Official Minutes of Assembly — {selectedEvent.title}
                    </h2>
                    <p className="text-xs text-[#7A685D]">
                      Convened on{" "}
                      {watDateTime.format(new Date(selectedEvent.starts_at))}{" "}
                      WAT
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
            </>
          ) : (
            <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
              <FileText className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
              <h2 className="text-sm font-bold text-[#3D291F]">
                Minutes Not Enabled For This Meeting
              </h2>
              <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                Official minutes transcription is not active for this event.
                Select another assembly above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: My Attendance Standing */}
      {activeTab === "history" && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-[#174C37] bg-[#174C37]/10 border border-[#174C37]/30">
                  {attendanceRate >= 80
                    ? "Good Standing"
                    : "Attendance Under Review"}{" "}
                  ({attendanceRate}%)
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
                        Assembly Title
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
                          {watShortDate.format(new Date(row.startsAt))} WAT
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
      {activeTab === "audit" && isOfficer && (
        <div className="space-y-6 animate-in fade-in duration-150">
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
    </div>
  );
}
