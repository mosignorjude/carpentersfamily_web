"use client";

import {
  Archive,
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Edit3,
  FileText,
  Lock,
  MapPin,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { getEventCardAccess } from "@/lib/event-card-access.mjs";
import type { EventLifecycleAction } from "./event-lifecycle-modal";
import type { EventRow } from "./event-types";

interface EventCardProps {
  event: EventRow;
  roles: string[];
  eventRoles: string[];
  archivedGroup?: boolean;
  onOpenEdit?: (event: EventRow) => void;
  onOpenLifecycle?: (event: EventRow, action: EventLifecycleAction) => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

export function EventCard({
  event,
  roles,
  eventRoles,
  archivedGroup = false,
  onOpenEdit,
  onOpenLifecycle,
}: EventCardProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const roleSet = new Set(roles);
  const eventRoleSet = new Set(eventRoles);

  const { isManager, canEdit, canSetStatus, canReopen, mutable } =
    getEventCardAccess({
      roles: roleSet,
      eventRoles: eventRoleSet,
      status: event.status,
      archivedAt: event.archived_at,
      archivedGroup,
      budgetReadError: false,
    });

  const isRetainedArchive = Boolean(event.archived_at);
  const isCompleted = event.status === "completed";
  const isCancelled = event.status === "cancelled";
  const isLocked = isRetainedArchive || isCompleted || isCancelled;

  const startDate = new Date(event.starts_at);
  const isPastScheduled =
    event.status === "scheduled" && startDate.getTime() < Date.now();

  // Active feature labels list
  const activeFeatures: string[] = [];
  if (event.minutes_enabled) activeFeatures.push("Meeting Minutes");
  if (event.attendance_enabled) activeFeatures.push("Attendance Tracking");
  if (event.ticketing_enabled) activeFeatures.push("Ticketing Passes");
  if (event.budget_enabled) activeFeatures.push("Budget System");
  if (event.income_enabled) activeFeatures.push("Revenue Streams");
  if (event.expenses_enabled) activeFeatures.push("Disbursements");

  // Status visual configuration
  const statusConfig = isRetainedArchive
    ? {
        text: "Status: Archived",
        badge: "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]",
        border: "border-[#E5DDD3]",
        desc: "Retained indefinitely in club repository. Record is read-only.",
      }
    : isPastScheduled
      ? {
          text: "Status: Awaiting Completion",
          badge: "text-[#D6A23A] bg-[#FAF6F0] border-[#D6A23A]/50",
          border: "border-[#D6A23A]/40",
          desc: "Event date has passed. Awaiting final minutes or completion confirmation from Event Lead/Administration.",
        }
      : event.status === "scheduled"
        ? {
            text: "Status: Scheduled",
            badge: "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30",
            border: "border-[#174C37]/30",
            desc: "Active gathering. Open for member attendance & logistics planning.",
          }
        : isCompleted
          ? {
              text: "Status: Completed",
              badge: "text-[#5C4638] bg-[#FAF6F0] border-[#E5DDD3]",
              border: "border-[#E5DDD3]",
              desc: "Concluded. Planning locked. Only Admin or Backup Admin can reopen.",
            }
          : {
              text: "Status: Cancelled",
              badge: "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30",
              border: "border-[#BA3C2A]/30",
              desc: "Planning halted and locked. Only Admin or Backup Admin can reopen.",
            };

  const formattedDate = dateFormatter.format(startDate);
  const formattedTime = timeFormatter.format(startDate);

  return (
    <article
      aria-labelledby={`event-title-${event.id}`}
      className={`bg-white rounded-2xl border p-5 sm:p-6 transition-all shadow-xs space-y-4 ${
        statusConfig.border
      } ${isLocked ? "bg-[#FAF6F0]/25" : "hover:border-[#174C37]/50"}`}
    >
      {/* Top Header: Unboxed metadata, title, and plain text status */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          {/* Plain unboxed metadata */}
          <div className="flex items-center gap-2 text-xs text-[#7A685D] mb-1">
            <span className="font-extrabold text-[#174C37] uppercase tracking-wider text-[11px]">
              {event.event_type} Event
            </span>
          </div>

          <h3
            className="text-lg sm:text-xl font-extrabold text-[#3D291F] leading-snug"
            id={`event-title-${event.id}`}
          >
            {event.title}
          </h3>
        </div>

        {/* Clear Status Badge */}
        <div className="sm:text-right shrink-0">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusConfig.badge}`}
          >
            {statusConfig.text}
          </span>
          {isLocked && (
            <span className="text-[11px] text-[#7A685D] flex items-center sm:justify-end gap-1 mt-1 font-medium">
              <Lock className="w-3 h-3 text-[#7A685D]" />
              <span>Planning locked</span>
            </span>
          )}
        </div>
      </div>

      {/* Date, Time, Venue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#5C4638] pt-1">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#174C37] shrink-0" />
          <span className="font-semibold text-[#3D291F]">{formattedDate}</span>
          <span aria-hidden="true" className="text-[#E5DDD3]">
            ·
          </span>
          <Clock className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
          <span className="font-mono font-bold text-[#174C37]">
            {formattedTime}
          </span>
        </div>

        <div className="flex items-center gap-2 truncate">
          <MapPin className="w-4 h-4 text-[#174C37] shrink-0" />
          <span className="truncate font-medium text-[#5C4638]">
            {event.location}
          </span>
        </div>
      </div>

      {/* Governance Note for Completed, Cancelled, or Retained Archive */}
      {isLocked && (
        <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] space-y-1">
          <div className="flex items-center gap-2 font-bold text-[#3D291F]">
            <Lock className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
            <span>Governance Note:</span>
            <span className="font-normal text-[#5C4638]">
              {statusConfig.desc}
            </span>
          </div>
          {event.archived_at && (
            <p className="text-[11px] text-[#7A685D] font-mono">
              Archived at: {dateFormatter.format(new Date(event.archived_at))}
            </p>
          )}
        </div>
      )}

      {/* Enabled Features Summary Strip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#7A685D] pt-1">
        <span className="font-bold text-[#3D291F]">Features:</span>
        {activeFeatures.length ? (
          activeFeatures.map((feat, idx) => (
            <React.Fragment key={feat}>
              <span className="text-[#174C37] font-semibold">{feat}</span>
              {idx < activeFeatures.length - 1 && (
                <span aria-hidden="true" className="text-[#E5DDD3]">
                  ·
                </span>
              )}
            </React.Fragment>
          ))
        ) : (
          <span className="italic text-[#7A685D]">Standard Gathering</span>
        )}
      </div>

      {/* Details & Roles Disclosure Button */}
      <div className="pt-2 border-t border-[#E5DDD3]">
        <button
          className="cf-btn cf-btn--link text-xs font-bold flex items-center gap-1.5 py-2 min-h-[44px] cursor-pointer"
          onClick={() => setDetailsExpanded(!detailsExpanded)}
          type="button"
        >
          <span>
            {detailsExpanded
              ? "Hide Details & Governance"
              : "View Details & Committee Roles"}
          </span>
          {detailsExpanded ? (
            <ChevronUp className="w-4 h-4 text-[#174C37]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#174C37]" />
          )}
        </button>

        {detailsExpanded && (
          <div className="mt-3 p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3.5 text-xs text-[#3D291F] animate-in fade-in duration-150">
            <div>
              <span className="font-bold text-[11px] uppercase tracking-wider text-[#7A685D] block mb-1">
                Event Description & Logistics
              </span>
              <p className="text-[#5C4638] leading-relaxed whitespace-pre-wrap">
                {event.description ||
                  "No additional description recorded for this event."}
              </p>
            </div>

            {event.dressCode && (
              <div className="pt-2 border-t border-[#E5DDD3]/70">
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#7A685D] block mb-0.5">
                  Dress Code / Attire
                </span>
                <p className="font-semibold text-[#174C37]">
                  {event.dressCode}
                </p>
              </div>
            )}

            <div className="pt-2 border-t border-[#E5DDD3]/70">
              <span className="font-bold text-[11px] uppercase tracking-wider text-[#7A685D] block mb-1.5">
                Assigned Team & Event Leads
              </span>
              {event.team && event.team.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {event.team.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-[#E5DDD3] text-[11px]"
                    >
                      <span className="font-bold text-[#3D291F]">{t.name}</span>
                      <span className="text-[#174C37] font-semibold font-mono px-1.5 py-0.5 rounded bg-[#174C37]/10">
                        {t.role}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#7A685D] italic">
                  No committee officers or event leads assigned yet.
                </p>
              )}
            </div>

            {((event.budgetCeiling !== null &&
              event.budgetCeiling !== undefined) ||
              (event.ticketsSold !== null &&
                event.ticketsSold !== undefined)) && (
              <div className="pt-2 border-t border-[#E5DDD3]/70 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {event.budgetCeiling !== null &&
                  event.budgetCeiling !== undefined && (
                    <div className="p-2.5 rounded-lg bg-white border border-[#E5DDD3]">
                      <span className="text-[#7A685D] font-medium block">
                        Approved Budget Ceiling:
                      </span>
                      <span className="font-mono font-bold text-sm text-[#174C37]">
                        {formatNaira(event.budgetCeiling)}
                      </span>
                    </div>
                  )}
                {event.ticketsSold !== null &&
                  event.ticketsSold !== undefined && (
                    <div className="p-2.5 rounded-lg bg-white border border-[#E5DDD3]">
                      <span className="text-[#7A685D] font-medium block">
                        Ticket Sales Progress:
                      </span>
                      <span className="font-mono font-bold text-sm text-[#3D291F]">
                        {event.ticketsCapacity && event.ticketsCapacity > 0
                          ? `${event.ticketsSold} / ${event.ticketsCapacity} passes`
                          : `${event.ticketsSold} pass${event.ticketsSold === 1 ? "" : "es"} sold`}
                      </span>
                    </div>
                  )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E5DDD3]">
              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#7A685D] block mb-1">
                  Event Venue / Assembly Point
                </span>
                <p className="font-medium text-[#3D291F]">{event.location}</p>
              </div>

              <div>
                <span className="font-bold text-[11px] uppercase tracking-wider text-[#7A685D] block mb-1">
                  Governance & Audit Schedule
                </span>
                <p className="font-medium text-[#3D291F]">
                  Created {dateFormatter.format(new Date(event.created_at))}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons & Dedicated Workspace Links */}
      <div className="pt-3 border-t border-[#E5DDD3] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Workspace Destination Links */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Party Dashboard Link */}
          {event.event_type === "party" && (
            <Link
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[#174C37] hover:bg-[#103D2B] rounded-xl transition-colors shadow-xs min-h-[44px] no-underline"
              href={`/events/${event.id}/dashboard`}
            >
              <span className="text-white">Open Event Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#D6A23A]" />
            </Link>
          )}

          {/* Minutes & Attendance */}
          {(event.event_type === "meeting" ||
            event.minutes_enabled ||
            event.attendance_enabled) && (
            <Link
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-[#174C37] bg-[#FAF6F0] border border-[#174C37]/30 hover:bg-[#174C37] hover:text-white rounded-xl transition-colors min-h-[44px] no-underline"
              href={`/attendance?event=${encodeURIComponent(event.id)}`}
            >
              <FileText className="w-4 h-4" />
              <span>Minutes & Attendance</span>
            </Link>
          )}

          {/* Meeting / Other: Event Finances */}
          {event.event_type !== "party" &&
            (event.budget_enabled ||
              event.income_enabled ||
              event.expenses_enabled ||
              event.ticketing_enabled) && (
              <Link
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-[#3D291F] bg-white border border-[#E5DDD3] hover:bg-[#FAF6F0] rounded-xl transition-colors min-h-[44px] no-underline"
                href={`/events/${event.id}/finance`}
              >
                <DollarSign className="w-4 h-4 text-[#174C37]" />
                <span>Event Finances</span>
              </Link>
            )}
        </div>

        {/* Management Action Pills */}
        <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
          {/* Edit Details */}
          {canEdit && mutable && onOpenEdit && (
            <button
              className="cf-btn cf-btn--neutral min-h-[44px] px-3.5 py-2 cursor-pointer"
              onClick={() => onOpenEdit(event)}
              type="button"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#5C4638]" />
              <span>Edit Details</span>
            </button>
          )}

          {/* Complete */}
          {canSetStatus && mutable && onOpenLifecycle && (
            <button
              className="cf-btn cf-btn--neutral cf-btn--accent min-h-[44px] px-3.5 py-2 cursor-pointer"
              onClick={() => onOpenLifecycle(event, "complete")}
              type="button"
            >
              Complete
            </button>
          )}

          {/* Cancel */}
          {canSetStatus && mutable && onOpenLifecycle && (
            <button
              className="cf-btn cf-btn--neutral cf-btn--danger-text min-h-[44px] px-3.5 py-2 cursor-pointer"
              onClick={() => onOpenLifecycle(event, "cancel")}
              type="button"
            >
              Cancel
            </button>
          )}

          {/* Reopen */}
          {canReopen &&
            !event.archived_at &&
            (isCompleted || isCancelled) &&
            onOpenLifecycle && (
              <button
                className="cf-btn cf-btn--neutral cf-btn--accent min-h-[44px] px-3.5 py-2 cursor-pointer"
                onClick={() => onOpenLifecycle(event, "reopen")}
                title="Only Admin or Backup Admin can reopen concluded/cancelled records"
                type="button"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen Planning</span>
              </button>
            )}

          {/* Archive */}
          {isManager &&
            !event.archived_at &&
            (isCompleted || isCancelled) &&
            onOpenLifecycle && (
              <button
                className="cf-btn cf-btn--neutral min-h-[44px] px-3.5 py-2 cursor-pointer"
                onClick={() => onOpenLifecycle(event, "archive")}
                type="button"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Archive</span>
              </button>
            )}
        </div>
      </div>
    </article>
  );
}
