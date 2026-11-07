"use client";

import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Plus,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { formatEventTime } from "@/lib/event-times.mjs";
import { formatNaira } from "@/lib/format";
import type {
  OfficerTicketSummary,
  PortalBoxOfficeEvent,
} from "./ticket-types";

interface OfficerBoxOfficeDeskProps {
  summary: OfficerTicketSummary;
  events: PortalBoxOfficeEvent[];
  canManage?: boolean;
}

export function OfficerBoxOfficeDesk({
  summary,
  events,
  canManage = true,
}: OfficerBoxOfficeDeskProps) {
  const percentFilled =
    summary.totalCapacity > 0
      ? Math.min(
          100,
          Math.round((summary.totalPassesIssued / summary.totalCapacity) * 100),
        )
      : 0;

  return (
    <section
      aria-label="Officer Box Office Desk"
      className="rounded-3xl bg-white border border-linen p-5 sm:p-7 shadow-xs space-y-6"
    >
      {/* Desk Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-linen">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest/10 border border-forest/20 text-forest text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-forest" />
            <span>Officer Box Office Desk</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-espresso tracking-tight">
            Ticketing Operations & Inventory Desk
          </h2>
          <p className="text-xs sm:text-sm text-muted">
            Cross-event reconciled revenues, inventory allocations, and receipt
            verification queues.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-forest text-white text-xs font-bold hover:bg-forest/90 transition-colors shadow-2xs no-underline"
              href="/create-event"
            >
              <Plus className="w-4 h-4 text-ochre" />
              <span>New Event</span>
            </Link>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Gross Inflow */}
        <div className="rounded-2xl bg-warm-canvas border border-linen p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Ticket Sales Revenue
            </span>
            <div className="w-7 h-7 rounded-lg bg-forest/10 flex items-center justify-center text-forest">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-forest font-mono tabular-nums tracking-tight">
            {formatNaira(summary.totalGrossNgn)}
          </p>
          <p className="text-xs text-muted">
            Approved online orders & officer-recorded tickets.
          </p>
        </div>

        {/* KPI 2: Passes Issued vs Capacity */}
        <div className="rounded-2xl bg-warm-canvas border border-linen p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Tickets Sold / Capacity
            </span>
            <div className="w-7 h-7 rounded-lg bg-espresso/10 flex items-center justify-center text-espresso">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-espresso font-mono tabular-nums tracking-tight">
            {summary.totalPassesIssued}{" "}
            <span className="text-base sm:text-lg font-normal text-muted">
              / {summary.totalCapacity > 0 ? summary.totalCapacity : "∞"}
            </span>
          </p>
          <div className="space-y-1">
            <div
              aria-label="Inventory allocated"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percentFilled}
              className="w-full h-2 rounded-full bg-linen overflow-hidden"
              role="progressbar"
            >
              <div
                className="h-full bg-forest transition-all duration-300 motion-reduce:transition-none"
                style={{ width: `${percentFilled}%` }}
              />
            </div>
            <p className="text-[11px] text-muted">
              {percentFilled}% total inventory allocated.
            </p>
          </div>
        </div>

        {/* KPI 3: Pending Verification Queue */}
        <div
          className={`rounded-2xl border p-4 sm:p-5 space-y-2 ${
            summary.pendingVerificationCount > 0
              ? "bg-ochre/10 border-ochre/30"
              : "bg-warm-canvas border-linen"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Verification Queue
            </span>
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                summary.pendingVerificationCount > 0
                  ? "bg-ochre/20 text-espresso"
                  : "bg-forest/10 text-forest"
              }`}
            >
              {summary.pendingVerificationCount > 0 ? (
                <Clock className="w-4 h-4 text-espresso" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>
          </div>
          <p
            className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight ${
              summary.pendingVerificationCount > 0
                ? "text-espresso"
                : "text-forest"
            }`}
          >
            {summary.pendingVerificationCount}
          </p>
          <p className="text-xs text-muted">
            {summary.pendingVerificationCount > 0
              ? "Orders awaiting transfer receipt review."
              : "All submitted orders are reconciled & verified."}
          </p>
        </div>
      </div>

      {/* Active Events Ticketing Matrix */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-espresso uppercase tracking-wider">
            Active Ticketed Events
          </h3>
          <span className="text-xs text-muted">
            {events.length} {events.length === 1 ? "Event" : "Events"} on Sale
          </span>
        </div>

        {events.length === 0 ? (
          <div className="rounded-2xl bg-warm-canvas border border-linen p-8 text-center space-y-2">
            <Ticket className="w-8 h-8 text-muted mx-auto opacity-60" />
            <p className="text-sm font-bold text-espresso">
              No Ticketed Events Currently Open
            </p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Create a new event or configure ticketing tiers on an existing
              event to open box office sales.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => {
              const tiers = event.tiers ?? [];
              const eventGross = tiers.reduce(
                (sum, t) => sum + (t.sold ?? 0) * t.price_ngn,
                0,
              );
              const eventIssued = tiers.reduce(
                (sum, t) => sum + (t.sold ?? 0),
                0,
              );
              const eventCap = tiers.reduce(
                (sum, t) => sum + (t.capacity ?? 0),
                0,
              );
              const pendingCount = event.pendingOrdersCount ?? 0;

              return (
                <div
                  className="rounded-2xl bg-warm-canvas/60 border border-linen p-4 sm:p-5 space-y-4 transition-all hover:bg-warm-canvas"
                  key={event.id}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-espresso">
                          {event.title}
                        </h4>
                        {pendingCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-ochre/15 border border-ochre/30 text-espresso text-[11px] font-bold">
                            <AlertCircle className="w-3 h-3 text-espresso" />
                            <span>{pendingCount} Awaiting Review</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-forest" />
                          <span>{formatEventTime(event.starts_at)}</span>
                        </span>
                        {event.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-forest" />
                            <span>{event.location}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-forest text-white text-xs font-semibold hover:bg-forest/90 transition-colors shadow-2xs no-underline min-h-[44px]"
                        href={`/events/${event.id}/dashboard?tab=tickets`}
                      >
                        <span>Manage Tiers & Ledger</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Tiers Summary Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-linen/70 text-xs">
                    <div>
                      <span className="text-muted block text-[11px]">
                        Event Inflow
                      </span>
                      <span className="font-bold text-forest font-mono tabular-nums">
                        {formatNaira(eventGross)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">
                        Passes Issued
                      </span>
                      <span className="font-bold text-espresso font-mono tabular-nums">
                        {eventIssued} / {eventCap > 0 ? eventCap : "∞"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">
                        Configured Tiers
                      </span>
                      <span className="font-bold text-espresso">
                        {tiers.length} {tiers.length === 1 ? "Tier" : "Tiers"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">
                        Verification Status
                      </span>
                      <span
                        className={`font-bold ${
                          pendingCount > 0 ? "text-ochre" : "text-forest"
                        }`}
                      >
                        {pendingCount > 0
                          ? `${pendingCount} Needs Check`
                          : "Reconciled"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
