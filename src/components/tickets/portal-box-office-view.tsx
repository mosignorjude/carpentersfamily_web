"use client";

import {
  ArrowRight,
  Calendar,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatEventTime } from "@/lib/event-times.mjs";
import { formatNaira } from "@/lib/format";
import { tierRemaining } from "@/lib/ticket-order-state.mjs";
import { OfficerBoxOfficeDesk } from "./officer-box-office-desk";
import type {
  OfficerTicketSummary,
  PortalBoxOfficeEvent,
  PublicBankInfo,
} from "./ticket-types";

interface PortalBoxOfficeViewProps {
  events: PortalBoxOfficeEvent[];
  summary: OfficerTicketSummary | null;
  isOfficer: boolean;
  bank: PublicBankInfo | null;
  canManage?: boolean;
}

export function PortalBoxOfficeView({
  events,
  summary,
  isOfficer,
  bank,
  canManage = true,
}: PortalBoxOfficeViewProps) {
  const [officerTab, setOfficerTab] = useState<"passes" | "desk">("passes");
  const [copiedAccount, setCopiedAccount] = useState(false);

  const handleCopyAccount = () => {
    if (!bank?.account_number) return;
    navigator.clipboard.writeText(bank.account_number);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Breadcrumb & Page Header */}
      <div className="space-y-4">
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-muted flex items-center gap-1.5"
        >
          <Link
            className="hover:text-espresso transition-colors no-underline"
            href="/portal"
          >
            Home
          </Link>
          <span>/</span>
          <span className="font-semibold text-espresso">Box office</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-espresso tracking-tight">
              Box Office & Passes
            </h1>
            <p className="text-xs sm:text-sm text-muted max-w-2xl">
              Official tickets, pass allocations, and celebration admissions for
              Carpenters Family events.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-linen text-body text-xs font-semibold hover:bg-cream transition-colors shadow-2xs no-underline min-h-[44px]"
              href="/tickets/order"
            >
              <FileText className="w-3.5 h-3.5 text-forest" />
              <span>Check Ticket Status</span>
            </Link>

            <Link
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-linen text-body text-xs font-semibold hover:bg-cream transition-colors shadow-2xs no-underline min-h-[44px]"
              href="/tickets?view=public"
              title="View Public Box Office Storefront"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted" />
              <span>Public Storefront</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Officer Segmented View Navigation */}
      {isOfficer && summary && (
        <div className="flex items-center gap-2 p-1 rounded-2xl bg-warm-canvas border border-linen max-w-fit shadow-2xs">
          <button
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              officerTab === "passes"
                ? "bg-white text-espresso shadow-2xs border border-linen/60"
                : "text-muted hover:text-espresso border border-transparent"
            }`}
            id="tab-officer-passes"
            onClick={() => setOfficerTab("passes")}
            type="button"
          >
            <Ticket className="w-4 h-4 text-forest" />
            <span>Browse Events & Passes</span>
          </button>
          <button
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] cursor-pointer ${
              officerTab === "desk"
                ? "bg-white text-espresso shadow-2xs border border-linen/60"
                : "text-muted hover:text-espresso border border-transparent"
            }`}
            id="tab-officer-desk"
            onClick={() => setOfficerTab("desk")}
            type="button"
          >
            <ShieldCheck className="w-4 h-4 text-forest" />
            <span>Operations & Verification Desk</span>
            {summary.pendingVerificationCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-ochre/20 text-espresso text-[11px] font-mono font-bold">
                {summary.pendingVerificationCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Officer Box Office Desk (rendered when active on Desk tab) */}
      {isOfficer && summary && officerTab === "desk" && (
        <OfficerBoxOfficeDesk
          canManage={canManage}
          events={events}
          summary={summary}
        />
      )}

      {/* Active Ticketed Events Section (rendered when on Passes tab or for regular members) */}
      {(!isOfficer || !summary || officerTab === "passes") && (
        <section aria-label="Available Events" className="space-y-5">
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-linen">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-forest" />
              <h2 className="text-sm font-bold text-espresso uppercase tracking-wider">
                Available Events & Passes
              </h2>
            </div>
            <span className="text-xs font-semibold text-muted">
              {events.length} {events.length === 1 ? "Event" : "Events"}{" "}
              Scheduled
            </span>
          </div>

          {events.length === 0 ? (
            <div className="rounded-3xl bg-white border border-linen p-10 text-center space-y-3 shadow-2xs">
              <Ticket className="w-10 h-10 text-forest mx-auto opacity-60" />
              <h3 className="text-lg font-bold text-espresso">
                No Ticketed Events Currently Open
              </h3>
              <p className="text-xs sm:text-sm text-body max-w-md mx-auto leading-relaxed">
                Upcoming club celebrations and ticketed events will appear here
                as soon as box office sales open.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {events.map((event) => {
                const tiers = event.tiers ?? [];
                const isRave =
                  event.title.toLowerCase().includes("rave") ||
                  event.description?.toLowerCase().includes("rave");
                const flyerSrc = isRave
                  ? "/tickets/issele-uku-rave-flyer.jpeg"
                  : null;

                return (
                  <article
                    className="rounded-3xl bg-white border border-linen p-6 sm:p-8 shadow-xs space-y-6 transition-all hover:shadow-sm"
                    key={event.id}
                  >
                    <div
                      className={
                        flyerSrc
                          ? "grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start"
                          : "space-y-4"
                      }
                    >
                      {flyerSrc && (
                        <div className="w-full relative rounded-2xl overflow-hidden border border-linen shadow-2xs bg-warm-canvas">
                          {/* biome-ignore lint/performance/noImgElement: static local asset adhering to CSP */}
                          <img
                            alt={`${event.title} flyer`}
                            className="w-full h-auto object-cover max-h-[300px] mx-auto block"
                            decoding="async"
                            loading="lazy"
                            src={flyerSrc}
                          />
                        </div>
                      )}

                      <div
                        className={
                          flyerSrc ? "md:col-span-2 space-y-5" : "space-y-5"
                        }
                      >
                        <div className="space-y-2">
                          <h3 className="text-xl sm:text-2xl font-bold text-espresso tracking-tight">
                            {event.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-forest" />
                              <span>{formatEventTime(event.starts_at)}</span>
                            </span>
                            {event.location && (
                              <span className="inline-flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-forest" />
                                <span>{event.location}</span>
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-xs sm:text-sm text-body leading-relaxed pt-1">
                              {event.description}
                            </p>
                          )}
                        </div>

                        {/* Tiers List */}
                        <div className="space-y-3 pt-3 border-t border-linen">
                          <span className="text-xs font-bold text-espresso block">
                            Admission Tiers & Pass Pricing
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {tiers.map((tier) => {
                              const remaining = tierRemaining(tier);
                              const isSoldOut =
                                remaining !== null && remaining <= 0;

                              return (
                                <div
                                  className={`rounded-2xl border p-4 space-y-2 transition-all ${
                                    isSoldOut
                                      ? "bg-warm-canvas/60 border-linen opacity-60"
                                      : "bg-warm-canvas border-linen/80 hover:border-forest/40"
                                  }`}
                                  key={tier.id}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold text-sm text-espresso">
                                      {tier.name}
                                    </span>
                                    {isSoldOut ? (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-terra/10 text-terra border border-terra/20">
                                        Sold Out
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-forest/10 text-forest border border-forest/20">
                                        On Sale
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-lg font-extrabold text-forest font-mono tabular-nums">
                                    {formatNaira(tier.price_ngn)}
                                  </div>
                                  <div className="text-[11px] text-muted flex items-center justify-between">
                                    <span>
                                      {tier.capacity !== null
                                        ? `${tier.sold} / ${tier.capacity} passes`
                                        : `${tier.sold} issued`}
                                    </span>
                                    {remaining !== null && !isSoldOut && (
                                      <span className="font-medium text-forest">
                                        {remaining} left
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Action & Member Guidance */}
                        <div className="pt-3 border-t border-linen flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted">
                          <p className="max-w-md">
                            Official club passes and table reservations logged
                            directly in the club ledger.
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {isOfficer && (
                              <Link
                                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-forest text-white text-xs font-semibold hover:bg-forest/90 transition-colors shadow-2xs no-underline min-h-[44px]"
                                href={`/events/${event.id}/dashboard?tab=tickets`}
                              >
                                <span>Manage Event Tickets</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Official Payment Destination (Bank Details) */}
      {bank && (
        <section
          aria-label="Official Payment Details"
          className="rounded-3xl bg-warm-canvas border border-linen p-6 space-y-3"
        >
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-forest" />
            <h3 className="text-xs font-bold text-espresso uppercase tracking-wider">
              Official Club Payment Account
            </h3>
          </div>
          <p className="text-xs text-muted">
            All box office guest payments and bank transfers must be directed
            exclusively to this verified club account.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="rounded-xl bg-white border border-linen p-3">
              <span className="text-muted block text-[11px]">Bank Name</span>
              <span className="font-bold text-espresso">{bank.bank_name}</span>
            </div>
            <div className="rounded-xl bg-white border border-linen p-3">
              <span className="text-muted block text-[11px]">Account Name</span>
              <span className="font-bold text-espresso">
                {bank.account_name}
              </span>
            </div>
            <div className="rounded-xl bg-white border border-linen p-3 flex items-center justify-between gap-2">
              <div>
                <span className="text-muted block text-[11px]">
                  Account Number
                </span>
                <span className="font-bold text-forest font-mono text-sm tracking-wider">
                  {bank.account_number}
                </span>
              </div>
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-warm-canvas border border-linen hover:border-forest/40 text-espresso text-[11px] font-semibold transition-colors min-h-[36px] cursor-pointer"
                id="btn-copy-account"
                onClick={handleCopyAccount}
                title="Copy account number"
                type="button"
              >
                {copiedAccount ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-forest" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
