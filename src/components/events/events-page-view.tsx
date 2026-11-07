"use client";

import {
  Archive,
  Calendar,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  History,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FormAlertBanner } from "@/components/ui";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
import { groupEventRows } from "@/lib/event-presentation.mjs";
import { EventCard } from "./event-card";
import { EventEditModal } from "./event-edit-modal";
import {
  type EventLifecycleAction,
  EventLifecycleModal,
} from "./event-lifecycle-modal";
import type { EventRow } from "./event-types";

interface EventsPageViewProps {
  events: EventRow[];
  roles: string[];
  eventRolesByEvent: Record<string, string[]>;
  isManager: boolean;
  userRoleTitle: string;
  userName?: string;
  /** Load failure message. Action outcomes are shown by the global flash toast. */
  loadError?: string;
}

export function EventsPageView({
  events,
  roles,
  eventRolesByEvent,
  isManager,
  userRoleTitle: _userRoleTitle,
  userName: _userName,
  loadError,
}: EventsPageViewProps) {
  // Filters
  const [selectedType, setSelectedType] = useState<string>("all");
  const [isArchiveExpanded, setIsArchiveExpanded] = useState<boolean>(false);

  // Modal states
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [lifecycleEvent, setLifecycleEvent] = useState<EventRow | null>(null);
  const [lifecycleAction, setLifecycleAction] =
    useState<EventLifecycleAction | null>(null);

  // Close open modals only after a successful action; keep input on errors.
  useSuccessNotice(() => {
    setEditingEvent(null);
    setLifecycleEvent(null);
    setLifecycleAction(null);
  });

  const handleOpenLifecycle = (
    event: EventRow,
    action: EventLifecycleAction,
  ) => {
    setLifecycleEvent(event);
    setLifecycleAction(action);
  };

  const { scheduledUpcoming, recentPast, retainedArchive } = useMemo(() => {
    const filterFn = (evt: EventRow) => {
      if (selectedType !== "all" && evt.event_type !== selectedType) {
        return false;
      }
      return true;
    };

    const filtered = events.filter(filterFn);

    return groupEventRows(filtered, Date.now());
  }, [events, selectedType]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {loadError && <FormAlertBanner message={loadError} variant="error" />}
      {/* 1. Header & Actions */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Events & Activities
            </h1>

            <p className="text-xs sm:text-sm text-[#7A685D] mt-1.5 max-w-2xl leading-relaxed">
              Schedule, planning, and budgets for club shows, celebrations, and
              projects.
            </p>
          </div>

          {isManager && (
            <div className="shrink-0">
              <Link
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#0C3325] text-white text-xs font-bold transition-colors shadow-xs min-h-[44px]"
                href="/create-event"
              >
                <CalendarPlus className="w-4 h-4 text-[#D6A23A]" />
                <span>New Event</span>
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Segmented Type Filters */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#E5DDD3] overflow-x-auto shadow-xs w-fit">
        {[
          { id: "all", label: "All Types" },
          { id: "party", label: "Parties & Banquets" },
          { id: "other", label: "Other Events" },
        ].map((typeItem) => (
          <button
            aria-pressed={selectedType === typeItem.id}
            key={typeItem.id}
            className={`cf-btn cf-btn--compact cf-btn--tab whitespace-nowrap cursor-pointer ${
              selectedType === typeItem.id ? "cf-btn--tab-active" : ""
            }`}
            onClick={() => setSelectedType(typeItem.id)}
            type="button"
          >
            {typeItem.label}
          </button>
        ))}
      </div>

      {/* ========================================================
          SECTION: UPCOMING EVENTS
          ======================================================== */}
      <section aria-labelledby="upcoming-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F]"
              id="upcoming-heading"
            >
              Upcoming Events
            </h2>
          </div>
          <span className="text-xs text-[#7A685D] font-medium sm:text-right">
            {scheduledUpcoming.length} Scheduled Event
            {scheduledUpcoming.length === 1 ? "" : "s"} · Soonest First
          </span>
        </div>

        {scheduledUpcoming.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
            <Calendar className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
            <h3 className="text-sm font-bold text-[#3D291F]">
              No Upcoming Events
            </h3>
            <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
              No upcoming club events right now. New events will appear here
              once scheduled.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {scheduledUpcoming.map((event) => (
              <EventCard
                event={event}
                eventRoles={eventRolesByEvent[event.id] ?? []}
                key={event.id}
                onOpenEdit={setEditingEvent}
                onOpenLifecycle={handleOpenLifecycle}
                roles={roles}
              />
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION: RECENT HISTORY
          ======================================================== */}
      <section aria-labelledby="history-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F]"
              id="history-heading"
            >
              Recent History
            </h2>
          </div>
          <span className="text-xs text-[#7A685D] font-medium sm:text-right">
            Concluded and past club events
          </span>
        </div>

        {recentPast.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
            <History className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
            <h3 className="text-sm font-bold text-[#3D291F]">
              No Recent Event Records
            </h3>
            <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
              No concluded or cancelled sessions recorded in recent history.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {recentPast.map((event) => (
              <EventCard
                event={event}
                eventRoles={eventRolesByEvent[event.id] ?? []}
                key={event.id}
                onOpenEdit={setEditingEvent}
                onOpenLifecycle={handleOpenLifecycle}
                roles={roles}
              />
            ))}
          </div>
        )}
      </section>

      {/* ========================================================
          SECTION: RETAINED ARCHIVE
          ======================================================== */}
      <section aria-labelledby="archive-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="flex items-center gap-2">
              <Archive className="w-5 h-5 text-[#174C37]" />
              <h2
                className="text-lg font-extrabold text-[#3D291F]"
                id="archive-heading"
              >
                Retained Archive
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FAF6F0] border border-[#E5DDD3] text-[#7A685D]">
                {retainedArchive.length}
              </span>
            </div>

            <button
              aria-controls="retained-archive-panel"
              aria-expanded={isArchiveExpanded}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white hover:bg-[#FAF6F0] text-xs font-bold text-[#174C37] transition-colors cursor-pointer"
              onClick={() => setIsArchiveExpanded((prev) => !prev)}
              type="button"
            >
              <span>{isArchiveExpanded ? "Collapse" : "Expand"}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isArchiveExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
          <span className="text-xs text-[#7A685D] font-medium sm:text-right">
            Archived event records
          </span>
        </div>

        {isArchiveExpanded && (
          <div id="retained-archive-panel">
            {retainedArchive.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
                <Archive className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
                <h3 className="text-sm font-bold text-[#3D291F]">
                  Archive Empty
                </h3>
                <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
                  Historical event records and archived sessions will remain
                  permanently available here for governance reporting.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {retainedArchive.map((event) => (
                  <EventCard
                    archivedGroup={true}
                    event={event}
                    eventRoles={eventRolesByEvent[event.id] ?? []}
                    key={event.id}
                    onOpenEdit={setEditingEvent}
                    onOpenLifecycle={handleOpenLifecycle}
                    roles={roles}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Lifecycle Modal */}
      <EventLifecycleModal
        action={lifecycleAction}
        event={lifecycleEvent}
        isOpen={Boolean(lifecycleAction && lifecycleEvent)}
        onClose={() => {
          setLifecycleEvent(null);
          setLifecycleAction(null);
        }}
      />

      {/* Edit Details Modal */}
      <EventEditModal
        event={editingEvent}
        isOpen={Boolean(editingEvent)}
        onClose={() => setEditingEvent(null)}
      />
    </div>
  );
}
