"use client";

import {
  Calendar,
  Clock,
  ExternalLink,
  Lock,
  MapPin,
  UserCog,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import type { EventAssignment, ManagedEvent } from "./member-admin-types";

interface EventStaffingSectionProps {
  events: ManagedEvent[];
  selectedEventId: string;
  onSelectEventId: (eventId: string) => void;
  assignments: EventAssignment[];
  onOpenAssignModal: () => void;
  onOpenRemoveModal: (assignment: EventAssignment) => void;
}

export const EventStaffingSection: React.FC<EventStaffingSectionProps> = ({
  events,
  selectedEventId,
  onSelectEventId,
  assignments,
  onOpenAssignModal,
  onOpenRemoveModal,
}) => {
  const currentSelectedEvent =
    events.find((e) => e.id === selectedEventId) || events[0] || null;

  const currentEventAssignments = assignments.filter(
    (a) => a.eventId === currentSelectedEvent?.id,
  );

  return (
    <section className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs p-5 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#174C37]" />
            <h2 className="text-lg font-bold text-[#3D291F]">
              Event roles & staffing
            </h2>
          </div>
          <p className="text-xs text-[#7A685D] mt-0.5">
            Staff scheduled club events with active members. Event roles are
            distinct from club leadership roles.
          </p>
        </div>

        {/* Event Selector Dropdown */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="event-selector"
            className="text-xs font-semibold text-[#7A685D]"
          >
            Select Event:
          </label>
          <select
            id="event-selector"
            value={selectedEventId}
            onChange={(e) => onSelectEventId(e.target.value)}
            className="px-3 py-2 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          >
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>
                {evt.title} ({evt.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Selected Event Details Card */}
      {currentSelectedEvent ? (
        <div className="p-4 sm:p-5 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/60 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/30">
                  {currentSelectedEvent.type} Event
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    currentSelectedEvent.status.toLowerCase() === "scheduled"
                      ? "bg-[#174C37] text-white border-[#174C37]"
                      : currentSelectedEvent.status.toLowerCase() ===
                          "completed"
                        ? "bg-neutral-200 text-neutral-700 border-neutral-300"
                        : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {currentSelectedEvent.status}
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-[#3D291F]">
                {currentSelectedEvent.title}
              </h3>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#7A685D]">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#D6A23A]" />
                  <span>
                    {currentSelectedEvent.dateFormatted} ·{" "}
                    {currentSelectedEvent.timeWAT}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#D6A23A]" />
                  <span className="truncate">
                    {currentSelectedEvent.location}
                  </span>
                </span>
              </div>
            </div>

            {/* Contextual Link for Party Events */}
            {currentSelectedEvent.type.toLowerCase() === "party" && (
              <div className="shrink-0">
                <Link
                  href={`/events/${currentSelectedEvent.id}/dashboard`}
                  className="cf-btn cf-btn--primary"
                >
                  <span>Open Event Dashboard</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#D6A23A]" />
                </Link>
              </div>
            )}
          </div>

          {/* Read-only notice for completed / cancelled / archived events */}
          {currentSelectedEvent.status.toLowerCase() !== "scheduled" && (
            <div className="p-3 bg-white rounded-lg border border-[#E5DDD3] text-xs text-[#7A685D] flex items-start gap-2">
              <Lock className="w-4 h-4 text-[#D6A23A] shrink-0 mt-0.5" />
              <div>
                <strong className="text-[#3D291F]">
                  Staffing Modifications Locked:
                </strong>{" "}
                This event is{" "}
                <span className="lowercase font-semibold">
                  {currentSelectedEvent.status}
                </span>
                . Role changes are retained for constitutional record and cannot
                be altered unless formally reopened by an Admin.
              </div>
            </div>
          )}

          {/* Staffing Roster for Selected Event */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#3D291F] uppercase tracking-wider">
                Current Staffing Assignments ({currentEventAssignments.length})
              </h4>

              {/* Add Staff Button (Only if event is Scheduled) */}
              {currentSelectedEvent.status.toLowerCase() === "scheduled" && (
                <button
                  type="button"
                  onClick={onOpenAssignModal}
                  className="cf-btn cf-btn--primary cf-btn--compact"
                >
                  <UserCog className="w-3.5 h-3.5 text-[#D6A23A]" />
                  <span>Assign Member to Event</span>
                </button>
              )}
            </div>

            {currentEventAssignments.length === 0 ? (
              <div className="py-6 bg-white rounded-lg border border-[#E5DDD3] text-center text-xs text-[#7A685D]">
                No staff members assigned to this event yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {currentEventAssignments.map((assignment) => {
                  const roleColor =
                    assignment.eventRole === "Event lead"
                      ? "bg-[#3D291F] text-white"
                      : assignment.eventRole === "Event assistant"
                        ? "bg-[#174C37] text-white"
                        : "bg-white border border-[#E5DDD3] text-[#3D291F]";

                  return (
                    <div
                      key={assignment.id}
                      className="bg-white rounded-lg border border-[#E5DDD3] p-3.5 space-y-2 flex flex-col justify-between shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${roleColor}`}
                          >
                            {assignment.eventRole}
                          </span>

                          {/* Remove Assignment (Only if event is Scheduled) */}
                          {currentSelectedEvent.status.toLowerCase() ===
                            "scheduled" && (
                            <button
                              type="button"
                              onClick={() => onOpenRemoveModal(assignment)}
                              className="cf-btn cf-btn--ghost cf-btn--ghost-danger"
                              title="Remove assignment"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="font-bold text-sm text-[#3D291F]">
                          {assignment.memberName}
                        </div>
                        <div className="text-xs font-mono text-[#7A685D]">
                          {assignment.memberUsername}
                        </div>
                      </div>

                      <div className="text-[10px] text-[#7A685D] border-t border-[#E5DDD3]/70 pt-2 space-y-0.5">
                        <p>By {assignment.assignedBy}</p>
                        <p>{assignment.assignedAtWAT}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-[#7A685D]">
          No event selected or available.
        </div>
      )}
    </section>
  );
};
