"use client";

import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import type { HomeDashboardEvent } from "@/lib/home-dashboard.server";

function formatEventDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

function eventTypeLabel(eventType: HomeDashboardEvent["eventType"]) {
  if (eventType === "meeting") return "General Meeting";
  if (eventType === "party") return "Club Celebration";
  return "Official Club Event";
}

interface NextUpEventsCardProps {
  events: {
    unavailable: boolean;
    rows: HomeDashboardEvent[];
  };
  roles?: string[];
}

export function NextUpEventsCard({ events, roles }: NextUpEventsCardProps) {
  const isOfficer =
    roles?.some((r) => ["admin", "executive", "backup_admin"].includes(r)) ??
    false;

  if (events.unavailable) {
    return (
      <section
        aria-labelledby="events-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-[#3D291F]" />
          <h3 className="text-lg font-bold text-[#3D291F]" id="events-heading">
            Next Up: Scheduled Events
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Calendar className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            Events Schedule Unavailable
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            The event calendar could not be loaded at this moment. Please check
            back shortly.
          </p>
        </div>
      </section>
    );
  }

  const rows = events.rows ?? [];

  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="events-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-[#174C37]" />
          <h3 className="text-lg font-bold text-[#3D291F]" id="events-heading">
            Next Up: Scheduled Events
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Calendar className="w-6 h-6 text-[#174C37] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Events Currently Scheduled
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            There are no official club events scheduled on the calendar right
            now.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="events-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-[#174C37]" />
          <h3 className="text-lg font-bold text-[#3D291F]" id="events-heading">
            Next Up: Scheduled Events
          </h3>
        </div>

        <Link
          className="text-xs text-[#174C37] font-bold hover:underline flex items-center gap-1"
          href="/events"
        >
          <span>All Events</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {rows.slice(0, 3).map((evt) => {
          const attendanceRecorded =
            evt.attendanceStatus === "present" ||
            evt.attendanceStatus === "late";
          const attendanceLabel = attendanceRecorded
            ? evt.attendanceStatus === "late"
              ? "Attendance Recorded · Late"
              : "Attendance Recorded"
            : evt.attendanceStatus === "absent"
              ? "Attendance Marked Absent"
              : evt.attendanceStatus === "rejected"
                ? "Attendance Record Rejected"
                : evt.attendanceStatus === "unavailable"
                  ? "Attendance Status Unavailable"
                  : "Open Attendance";

          return (
            <div
              className="p-5 rounded-xl border border-[#E5DDD3] bg-white hover:border-[#174C37]/50 transition-colors space-y-3.5 shadow-2xs"
              key={evt.id}
            >
              {/* Top row: Date & Type */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#174C37]">
                  <Clock className="w-4 h-4 text-[#174C37]" />
                  <span>{formatEventDateTime(evt.startsAt)}</span>
                  <span aria-hidden="true" className="text-[#B8ACA0]">
                    ·
                  </span>
                  <span className="text-xs font-normal text-[#7A685D]">
                    {eventTypeLabel(evt.eventType)}
                  </span>
                </div>
              </div>

              {/* Title */}
              <div>
                <h4 className="text-base font-bold text-[#3D291F] leading-snug">
                  {evt.title}
                </h4>
              </div>

              {/* Location */}
              <div className="flex items-center gap-2 text-xs font-medium text-[#7A685D] pt-2 border-t border-[#E5DDD3]">
                <MapPin className="w-4 h-4 text-[#174C37] shrink-0" />
                <span className="truncate">{evt.location}</span>
              </div>

              {/* Attendance Self-Check & Details Action */}
              <div className="pt-2 flex items-center justify-between gap-3">
                {evt.attendanceEnabled ? (
                  <Link
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-xs font-bold transition-colors min-h-[44px] min-w-[44px] no-underline ${
                      attendanceRecorded
                        ? "bg-[#174C37] !text-white shadow-xs hover:bg-[#103D2B]"
                        : "bg-[#FAF6F0] border-2 border-[#E5DDD3] text-[#3D291F] hover:bg-white hover:border-[#174C37]"
                    }`}
                    href={`/attendance?event=${encodeURIComponent(evt.id)}`}
                  >
                    {attendanceRecorded ? (
                      <CheckCircle2 className="h-4 w-4 text-white shrink-0" />
                    ) : (
                      <Calendar className="h-4 w-4 text-[#7A685D] shrink-0" />
                    )}
                    <span className={attendanceRecorded ? "text-white" : ""}>
                      {attendanceLabel}
                    </span>
                  </Link>
                ) : null}

                {(() => {
                  const hasDashboardFeatures = Boolean(
                    evt.budgetEnabled ||
                      evt.incomeEnabled ||
                      evt.expensesEnabled ||
                      evt.ticketingEnabled,
                  );
                  const detailsHref =
                    isOfficer && hasDashboardFeatures
                      ? `/events/${evt.id}/dashboard`
                      : "/events";

                  return (
                    <Link
                      className="text-xs font-bold text-[#174C37] hover:underline flex items-center gap-1 py-1"
                      href={detailsHref}
                    >
                      <span>View Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default NextUpEventsCard;
