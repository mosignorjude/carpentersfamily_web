"use client";

import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  DollarSign,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { AttendanceAuditHistory } from "./attendance-audit-history";
import { AttendanceRosterTable } from "./attendance-roster-table";
import type {
  AttendanceRow,
  AuditRow,
  EventRow,
  MemberRow,
  MinutesRow,
  SessionRow,
} from "./attendance-types";
import { CheckinCard } from "./checkin-card";
import { MinutesCard } from "./minutes-card";
import { OfficerSessionControls } from "./officer-session-controls";

interface AttendancePageViewProps {
  event: EventRow;
  minutes: MinutesRow | null;
  session: SessionRow | null;
  defaultCutoff: number;
  attendance: AttendanceRow[];
  ownAttendance?: AttendanceRow;
  members: Map<string, MemberRow>;
  audits: AuditRow[];
  canControl: boolean;
  canWriteMinutes: boolean;
  canReviewAttendance: boolean;
  isOfficer: boolean;
  notice: string | null;
}

const watDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "full",
  timeStyle: "short",
});

export function AttendancePageView({
  event,
  minutes,
  session,
  defaultCutoff,
  attendance,
  ownAttendance,
  members,
  audits,
  canControl,
  canWriteMinutes,
  canReviewAttendance,
  isOfficer,
  notice,
}: AttendancePageViewProps) {
  const sessionOpen = Boolean(session && !session.closed_at);
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

  const eventStatusBadge = event.archived_at
    ? "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]"
    : event.status === "scheduled"
      ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
      : event.status === "completed"
        ? "text-[#5C4638] bg-[#FAF6F0] border-[#E5DDD3]"
        : "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30";

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header & Navigation Banner */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5DDD3]">
          <Link
            className="inline-flex items-center gap-2 text-xs font-bold text-[#174C37] hover:underline cursor-pointer min-h-[36px]"
            href="/events"
          >
            <ArrowLeft className="w-4 h-4 text-[#174C37]" />
            <span>Back to Events & Planning</span>
          </Link>

          <div className="flex items-center gap-2 text-xs text-[#7A685D]">
            <span>Secretariat Roll Call</span>
          </div>
        </div>

        {/* Event Title & Logistics */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A685D] mb-1.5">
              <span className="font-extrabold text-[#174C37] uppercase tracking-wider text-[11px]">
                Minutes & Attendance Workspace
              </span>
              <span aria-hidden="true" className="text-[#E5DDD3]">
                ·
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${eventStatusBadge}`}
              >
                {eventStatusLabel}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              {event.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#5C4638] mt-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#174C37]" />
                <span className="font-semibold text-[#3D291F]">
                  {watDateTime.format(new Date(event.starts_at))}
                </span>
              </div>
            </div>
          </div>

          {/* Quick links to sister event workspaces */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              className="px-3.5 py-2 text-xs font-bold text-[#3D291F] bg-white border border-[#E5DDD3] hover:bg-[#FAF6F0] rounded-xl transition-colors flex items-center gap-1.5 min-h-[40px]"
              href={`/events/${event.id}/finance`}
            >
              <DollarSign className="w-4 h-4 text-[#174C37]" />
              <span>Event Finances</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Notice Banner */}
      {notice && (
        <div
          aria-live="polite"
          className="p-4 rounded-xl bg-[#FAF6F0] border border-[#174C37]/30 text-xs font-semibold text-[#174C37] flex items-center gap-2.5 shadow-xs"
          role="status"
        >
          <AlertCircle className="w-4 h-4 text-[#174C37] shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Meeting Minutes Section */}
      {event.minutes_enabled && (
        <MinutesCard
          canWriteMinutes={canWriteMinutes}
          eventId={event.id}
          minutes={minutes}
        />
      )}

      {/* Attendance Workspace Section */}
      {event.attendance_enabled && (
        <div id="attendance-session" className="scroll-target space-y-6">
          {/* Member Check-in */}
          <div id="checkin" className="scroll-target">
            <CheckinCard
              canReviewAttendance={canReviewAttendance}
              eventId={event.id}
              isMutable={mutableForSession}
              ownAttendance={ownAttendance}
              sessionOpen={sessionOpen}
            />
          </div>

          {/* Officer Session Controls (Admin/Executive) */}
          {canControl && (
            <OfficerSessionControls
              defaultCutoff={defaultCutoff}
              eventId={event.id}
              mutableForSession={mutableForSession}
              session={session}
              sessionOpen={sessionOpen}
            />
          )}

          {/* Attendance Roster Table (Officers / Reviewers) */}
          {canReviewAttendance && (
            <AttendanceRosterTable
              attendance={attendance}
              canCorrect={canControl || isOfficer}
              eventId={event.id}
              members={members}
            />
          )}
        </div>
      )}

      {/* Officer Audit History (Officers) */}
      {isOfficer && audits.length > 0 && (
        <AttendanceAuditHistory audits={audits} />
      )}

      {/* Neither enabled empty state */}
      {!event.minutes_enabled && !event.attendance_enabled && (
        <div className="p-12 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
          <FileText className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
          <h2 className="text-sm font-bold text-[#3D291F]">
            Features Not Enabled
          </h2>
          <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
            This event does not have meeting minutes or attendance tracking
            activated.
          </p>
        </div>
      )}
    </div>
  );
}
