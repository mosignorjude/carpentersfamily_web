"use client";

import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { formatEventTime } from "@/lib/event-times.mjs";
import type { HomeDashboardEvent } from "@/lib/home-dashboard.server";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

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
    roles?.some((r) => ["admin", "executive", "president"].includes(r)) ??
    false;

  if (events.unavailable) {
    return (
      <section
        aria-labelledby="events-heading"
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-[#3D291F]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="events-heading"
          >
            Upcoming Events
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Calendar className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            Events Schedule Unavailable
          </h3>
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
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-5 h-5 text-[#174C37]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="events-heading"
          >
            Upcoming Events
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Calendar className="w-6 h-6 text-[#174C37] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            No Upcoming Events
          </h3>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            New club events will appear here once scheduled.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="events-heading"
      className="rounded-2xl bg-white border border-[#E5DDD3] shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5DDD3] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#174C37]" />
          <h2
            className="font-bold text-base text-[#3D291F]"
            id="events-heading"
          >
            Upcoming Events
          </h2>
        </div>

        <Link
          className="text-xs font-semibold text-[#174C37] hover:underline flex items-center gap-1"
          href="/events"
        >
          <span>All Events</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>

      {/* Hairline-Divided Event Rows */}
      <div className="divide-y divide-[#E5DDD3]/80">
        {rows.slice(0, 3).map((evt) => {
          const attendanceRecorded =
            evt.attendanceStatus === "present" ||
            evt.attendanceStatus === "late";
          const attendanceLabel = attendanceRecorded
            ? evt.attendanceStatus === "late"
              ? "Checked In · Late"
              : "Checked In"
            : evt.attendanceStatus === "absent"
              ? "Marked Absent"
              : evt.attendanceStatus === "rejected"
                ? "Check-in Declined"
                : evt.attendanceStatus === "unavailable"
                  ? "Status Unavailable"
                  : "Check In";

          const hasDashboardFeatures = Boolean(
            evt.budgetEnabled ||
              evt.incomeEnabled ||
              evt.expensesEnabled ||
              evt.ticketingEnabled,
          );
          const canTransact = Boolean(
            isOfficer &&
              (evt.ticketingEnabled ||
                evt.incomeEnabled ||
                evt.expensesEnabled),
          );
          const detailsHref =
            isOfficer && hasDashboardFeatures
              ? `/events/${evt.id}/dashboard`
              : "/events";
          const showAttendance =
            evt.attendanceEnabled && evt.eventType !== "party";

          return (
            <div
              className="p-3.5 space-y-2 hover:bg-[#FAF6F0]/40 transition-colors"
              key={evt.id}
            >
              {/* Row 1: Clock + date/time on Left; Category chip on Right */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-[#5C4638] truncate">
                  <Clock className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
                  <span>
                    {dateFormatter.format(new Date(evt.startsAt))},{" "}
                    {formatEventTime(evt.startsAt)}
                  </span>
                </div>

                <span className="px-2 py-0.5 rounded-full bg-[#FAF6F0] border border-[#E5DDD3] text-[10px] font-semibold text-[#5C4638] shrink-0">
                  {eventTypeLabel(evt.eventType)}
                </span>
              </div>

              {/* Row 2: Event Title + Single-line truncated location with MapPin */}
              <div>
                <h3 className="font-bold text-base text-[#3D291F] leading-snug">
                  {evt.title}
                </h3>
                <div className="flex items-center gap-1 text-xs text-[#7A685D] mt-0.5 truncate">
                  <MapPin className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
                  <span className="truncate">{evt.location}</span>
                </div>
              </div>

              {/* Row 3: Action Buttons on Left; View Details on Right (NO extra border-t) */}
              <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {showAttendance ? (
                    <Link
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-semibold transition-colors ${
                        attendanceRecorded
                          ? "bg-[#174C37] text-white shadow-2xs"
                          : "bg-[#FAF6F0] border border-[#E5DDD3] text-[#3D291F] hover:bg-white hover:border-[#174C37]"
                      }`}
                      href={`/meeting-hub?event=${encodeURIComponent(evt.id)}`}
                    >
                      {attendanceRecorded ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
                      )}
                      <span>{attendanceLabel}</span>
                    </Link>
                  ) : null}

                  {canTransact ? (
                    <Link
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg text-xs font-semibold bg-[#174C37] text-white hover:bg-[#103D2B] transition-colors shadow-2xs"
                      href={`/events/${evt.id}/dashboard?action=record-transaction`}
                    >
                      <DollarSign className="w-3 h-3 text-[#D6A23A]" />
                      <span>Record Transaction</span>
                    </Link>
                  ) : null}
                </div>

                <Link
                  className="text-xs font-semibold text-[#3D291F] hover:text-[#174C37] hover:underline inline-flex items-center gap-0.5 min-h-[44px] shrink-0"
                  href={detailsHref}
                >
                  <span>View Details</span>
                  <span aria-hidden="true">›</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default NextUpEventsCard;
