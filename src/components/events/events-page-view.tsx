"use client";

import {
  Archive,
  Calendar,
  CalendarCheck,
  History,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { FormAlertBanner } from "@/components/ui";
import { useSuccessNotice } from "@/components/ui/use-success-notice";
import { CreateEventDisclosure } from "./create-event-disclosure";
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
  userRoleTitle,
  userName: _userName,
  loadError,
}: EventsPageViewProps) {
  // Filters
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          evt.title.toLowerCase().includes(q) ||
          evt.location.toLowerCase().includes(q) ||
          evt.description?.toLowerCase().includes(q)
        );
      }
      return true;
    };

    const filtered = events.filter(filterFn);
    const now = Date.now();

    // Upcoming: Scheduled future events, sorted soonest first
    const upcoming = filtered
      .filter(
        (event) =>
          !event.archived_at &&
          event.status === "scheduled" &&
          new Date(event.starts_at).getTime() >= now,
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    // Past events: Concluded, cancelled, or past scheduled (awaiting completion)
    const past = filtered
      .filter(
        (event) =>
          !event.archived_at &&
          (event.status !== "scheduled" ||
            new Date(event.starts_at).getTime() < now),
      )
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

    // Retained Archive: ONLY events explicitly archived (archived_at is set)
    const archive = filtered
      .filter((event) => Boolean(event.archived_at))
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at));

    return {
      scheduledUpcoming: upcoming,
      recentPast: past,
      retainedArchive: archive,
    };
  }, [events, selectedType, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {loadError && <FormAlertBanner message={loadError} variant="error" />}
      {/* 1. Header & Local Time Convention */}
      <section className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3D291F] tracking-tight">
              Events and planning
            </h1>

            <p className="text-xs sm:text-sm text-[#7A685D] mt-1.5 max-w-2xl leading-relaxed">
              Official schedule, meeting minutes, attendance rosters, and
              planning workspaces for general assemblies, executive council
              sessions, and annual club celebrations.
            </p>
          </div>

          {/* Official Calendar Capsule */}
          <div className="bg-[#FAF6F0] p-4 rounded-xl border border-[#E5DDD3] lg:text-right shrink-0 space-y-1">
            <span className="text-[11px] font-bold text-[#7A685D] uppercase tracking-wider block">
              Official Calendar
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#3D291F] block">
              Scheduled Assemblies &amp; Gatherings
            </span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#174C37] justify-start lg:justify-end">
              <Calendar className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Carpenters Family Portal</span>
            </div>
          </div>
        </div>
      </section>

      {/* Create Event Disclosure (Executive & Admin Only) */}
      <CreateEventDisclosure
        canCreate={isManager}
        userRoleTitle={userRoleTitle}
      />

      {/* Search & Segmented Type Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Segmented Type Filters */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#E5DDD3] overflow-x-auto shadow-xs">
          {[
            { id: "all", label: "All Types" },
            { id: "meeting", label: "Meetings" },
            { id: "party", label: "Parties & Banquets" },
            { id: "other", label: "Other Gatherings" },
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

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            aria-label="Search event title or venue"
            className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] shadow-xs"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event title, venue..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* ========================================================
          SECTION: UPCOMING EVENTS
          ======================================================== */}
      <section aria-labelledby="upcoming-heading" className="space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F]"
              id="upcoming-heading"
            >
              Upcoming Events
            </h2>
          </div>
          <span className="text-xs text-[#7A685D] font-medium">
            {scheduledUpcoming.length} Scheduled Gathering
            {scheduledUpcoming.length === 1 ? "" : "s"} · Soonest First
          </span>
        </div>

        {scheduledUpcoming.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
            <Calendar className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
            <h3 className="text-sm font-bold text-[#3D291F]">
              No Upcoming Events Scheduled
            </h3>
            <p className="text-xs text-[#5C4638] max-w-sm mx-auto">
              There are currently no upcoming events matching your filter
              criteria.
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
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F]"
              id="history-heading"
            >
              Recent History
            </h2>
          </div>
          <span className="text-xs text-[#7A685D] font-medium">
            Past Gatherings, Concluded Sessions, & Overdue Schedules
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
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-[#174C37]" />
            <h2
              className="text-lg font-extrabold text-[#3D291F]"
              id="archive-heading"
            >
              Retained Archive
            </h2>
          </div>
          <span className="text-xs text-[#7A685D] font-medium">
            Permanent Reporting Repository · Club Governance Active
          </span>
        </div>

        {retainedArchive.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#E5DDD3] text-center space-y-2">
            <Archive className="w-8 h-8 text-[#7A685D] mx-auto opacity-60" />
            <h3 className="text-sm font-bold text-[#3D291F]">Archive Empty</h3>
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
