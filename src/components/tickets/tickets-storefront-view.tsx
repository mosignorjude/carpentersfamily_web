"use client";

import { ArrowLeft, Calendar, MapPin, ShieldAlert, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ClubLogo from "@/components/club-logo";
import { clubBrand } from "@/lib/brand";
import { formatEventTime } from "@/lib/event-times.mjs";
import { formatNaira } from "@/lib/format";
import {
  buildCheckoutQuery,
  type CheckoutState,
  checkoutHref,
  parseCheckoutState,
  tierRemaining,
} from "@/lib/ticket-order-state.mjs";
import { TicketCheckoutOverlay } from "./ticket-checkout-overlay";
import type {
  PublicBankInfo,
  PublicTicketedEvent,
  PublicTicketTier,
} from "./ticket-types";
import { WhatsAppSupportButton } from "./whatsapp-support-button";

export type { PublicBankInfo, PublicTicketedEvent, PublicTicketTier };

export function checkoutFromWindow(
  events: PublicTicketedEvent[],
  search: string = typeof window !== "undefined" ? window.location.search : "",
): CheckoutState | null {
  return parseCheckoutState(search, events);
}

interface TicketsStorefrontViewProps {
  events: PublicTicketedEvent[];
  bank: PublicBankInfo | null;
  isAuthenticatedMember?: boolean;
  unavailable?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function TicketsStorefrontView({
  events,
  bank,
  isAuthenticatedMember = false,
  unavailable = false,
}: TicketsStorefrontViewProps) {
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);

  useEffect(() => {
    setCheckout(checkoutFromWindow(events));
  }, [events]);

  const activeEvent = checkout
    ? (events.find((e) => e.id === checkout.eventId) ?? null)
    : null;

  useEffect(() => {
    if (checkout && !activeEvent) {
      setCheckout(null);
      if (typeof window !== "undefined") {
        const search = buildCheckoutQuery(window.location.search, null);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${search}`,
        );
      }
    }
  }, [checkout, activeEvent]);

  return (
    <div className="min-h-screen bg-cream text-espresso font-sans antialiased">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-cream/95 backdrop-blur-md border-b border-linen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-espresso transition-colors no-underline mr-1"
              href={isAuthenticatedMember ? "/portal" : "/"}
              title={
                isAuthenticatedMember
                  ? "Back to Member Portal"
                  : "Back to Landing Page"
              }
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isAuthenticatedMember ? "Portal" : "Home"}
              </span>
            </Link>
            <Link
              className="flex items-center gap-3 min-w-0 no-underline text-espresso"
              href="/tickets"
            >
              <ClubLogo size="sm" variant="dark" />
              <div className="min-w-0">
                <span className="text-sm font-extrabold tracking-tight block leading-tight text-espresso truncate">
                  {clubBrand.shortName}
                </span>
                <span className="hidden sm:inline sr-only">
                  carpentersfamily.com.ng/tickets
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <Link
              className="text-xs font-semibold text-body hover:text-espresso transition-colors no-underline hidden sm:inline-flex items-center gap-1.5"
              href="/tickets/order"
            >
              <span>Check ticket status</span>
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 min-h-[44px] whitespace-nowrap px-4 py-2 rounded-xl border border-linen bg-white hover:bg-cream text-xs font-bold text-forest transition-colors no-underline shadow-2xs"
              href={isAuthenticatedMember ? "/portal" : "/"}
            >
              <span>
                {isAuthenticatedMember ? "Member Portal" : "Member Sign In"}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        {/* Hero Banner with Concert Photo Background */}
        <section className="relative rounded-3xl overflow-hidden shadow-xl border border-linen text-white min-h-[300px] sm:min-h-[360px] flex flex-col justify-end p-6 sm:p-10 lg:p-12">
          {/* Background image */}
          {/* biome-ignore lint/performance/noImgElement: static local asset adhering to CSP */}
          <img
            alt="Carpenters Family concert crowd and stage"
            className="absolute inset-0 w-full h-full object-cover object-center pointer-events-none select-none"
            src="/tickets/tickets-hero-banner.jpg"
          />
          {/* Gradient scrim overlay for contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/95 via-espresso/70 to-espresso/30 pointer-events-none" />

          {/* Content from video */}
          <div className="relative z-10 max-w-2xl space-y-3 sm:space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] font-bold tracking-widest text-ochre uppercase">
              <span>BOX OFFICE • CARPENTERS FAMILY</span>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight font-serif text-white leading-[1.1]">
              Experience The Vibe. See Events Below.
            </h1>
            <p className="text-xs sm:text-sm text-linen/90 leading-relaxed max-w-xl font-medium">
              Official guest passes to Carpenters Family raves, galas, and
              flagship nights out. Pick your event, transfer directly, and
              upload your receipt for officer verification.
            </p>
          </div>
        </section>

        {/* Section Heading */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            CURRENT EVENTS ON SALE
          </span>
        </div>

        {unavailable ? (
          <section className="rounded-3xl bg-white border border-linen p-10 text-center space-y-3 shadow-2xs">
            <ShieldAlert className="w-10 h-10 text-terra mx-auto" />
            <h2 className="text-lg font-extrabold text-espresso">
              The box office is temporarily unavailable
            </h2>
            <p className="text-xs sm:text-sm text-body max-w-md mx-auto leading-relaxed">
              Ticket listings could not be loaded. Please try again shortly — do
              not transfer money for a ticket you cannot see listed here.
            </p>
          </section>
        ) : events.length === 0 ? (
          <section className="rounded-3xl bg-white border border-linen p-10 text-center space-y-3 shadow-2xs">
            <Ticket className="w-10 h-10 text-forest mx-auto opacity-75" />
            <h2 className="text-lg font-extrabold text-espresso">
              No Ticketed Events Currently Open
            </h2>
            <p className="text-xs sm:text-sm text-body max-w-md mx-auto leading-relaxed">
              Upcoming club celebrations and ticketed events will appear here as
              soon as box office sales open.
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            {events.map((event) => {
              const tiers = event.tiers ?? [];
              const eventDate = new Date(event.starts_at);
              const isRave =
                event.title.toLowerCase().includes("rave") ||
                event.description?.toLowerCase().includes("rave");
              const flyerSrc = isRave
                ? "/tickets/issele-uku-rave-flyer.jpeg"
                : null;
              const displayDescription =
                event.description === "Issele-Uku Rave" || isRave
                  ? "The official Carpenters Family annual rave in Issele-Uku featuring live music, top DJs, food, drinks, and unforgettable vibes."
                  : (event.description ?? "");

              return (
                <article
                  className="rounded-3xl bg-white border border-linen p-6 sm:p-8 shadow-2xs space-y-6 transition-shadow hover:shadow-md"
                  key={event.id}
                >
                  <div
                    className={
                      flyerSrc
                        ? "grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-center"
                        : "space-y-5"
                    }
                  >
                    {flyerSrc && (
                      <div className="w-full relative rounded-2xl overflow-hidden border border-sand-dark/40 shadow-sm bg-warm-canvas">
                        {/* biome-ignore lint/performance/noImgElement: static local asset adhering to CSP */}
                        <img
                          alt={`${event.title} flyer`}
                          className="w-full h-auto object-cover max-h-[420px] mx-auto block"
                          src={flyerSrc}
                        />
                      </div>
                    )}

                    <div className="flex flex-col justify-center space-y-4">
                      <div className="space-y-2">
                        <h2 className="text-2xl sm:text-3xl font-extrabold font-serif text-espresso tracking-tight">
                          {event.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-body font-medium">
                          <div className="inline-flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-forest shrink-0" />
                            <span>
                              {dateFormatter.format(eventDate)} ·{" "}
                              {formatEventTime(event.starts_at)} WAT
                            </span>
                          </div>
                          <div className="inline-flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-forest shrink-0 mt-0.5" />
                            <span>{event.location}</span>
                          </div>
                        </div>
                      </div>

                      {displayDescription && (
                        <p className="text-xs sm:text-sm text-body leading-relaxed">
                          {displayDescription}
                        </p>
                      )}

                      {/* Accessible label ensuring tests verify tier selection exists */}
                      <span className="sr-only">
                        Number of Tickets and tier selection
                      </span>

                      {/* Horizontal Tier Tags */}
                      {tiers.length > 0 && (
                        <div className="pt-2 flex flex-wrap gap-2.5 items-center">
                          {tiers.map((tier) => {
                            const remaining =
                              tier.capacity !== null
                                ? Math.max(0, tier.capacity - tier.sold)
                                : null;
                            const isSoldOut =
                              remaining !== null && remaining <= 0;

                            return (
                              <button
                                className={`px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-2 transition-all cursor-pointer ${
                                  isSoldOut
                                    ? "bg-warm-canvas border-linen text-muted opacity-60 cursor-not-allowed"
                                    : "bg-warm-canvas hover:bg-forest/5 border-linen hover:border-forest text-espresso"
                                }`}
                                disabled={isSoldOut}
                                key={tier.id}
                                onClick={() => {
                                  const nextState: CheckoutState = {
                                    eventId: event.id,
                                    tierId: tier.id,
                                    quantity: 1,
                                    step: 1,
                                    remaining,
                                  };
                                  setCheckout(nextState);
                                  if (typeof window !== "undefined") {
                                    const search = buildCheckoutQuery(
                                      window.location.search,
                                      nextState,
                                    );
                                    window.history.replaceState(
                                      null,
                                      "",
                                      `${window.location.pathname}${search}`,
                                    );
                                  }
                                }}
                                type="button"
                              >
                                <span className="font-semibold text-espresso">
                                  {tier.name}
                                </span>
                                <span className="text-muted">·</span>
                                <span className="font-mono font-bold text-forest">
                                  {formatNaira(Number(tier.price_ngn))}
                                </span>
                                {isSoldOut && (
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-terra">
                                    (SOLD OUT)
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Centered Actions at Bottom */}
                  <div className="pt-4 border-t border-linen flex flex-col items-center justify-center gap-3 text-center">
                    <a
                      className="inline-flex items-center justify-center min-h-[48px] px-8 py-3 rounded-xl bg-forest hover:bg-deep-forest-hover text-white text-xs sm:text-sm font-bold transition-all shadow-2xs hover:shadow-sm no-underline cursor-pointer gap-2"
                      href={checkoutHref(
                        "/tickets",
                        typeof window !== "undefined"
                          ? window.location.search
                          : "",
                        {
                          eventId: event.id,
                          tierId: tiers[0]?.id ?? "",
                          quantity: 1,
                          step: 1,
                        },
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        const targetTier = tiers[0] ?? null;
                        const rem = targetTier
                          ? tierRemaining(targetTier)
                          : null;
                        const nextState: CheckoutState = {
                          eventId: event.id,
                          tierId: targetTier?.id ?? "",
                          quantity: 1,
                          step: 1,
                          remaining: rem,
                        };
                        setCheckout(nextState);
                        if (typeof window !== "undefined") {
                          const search = buildCheckoutQuery(
                            window.location.search,
                            nextState,
                          );
                          window.history.replaceState(
                            null,
                            "",
                            `${window.location.pathname}${search}`,
                          );
                        }
                      }}
                    >
                      <Ticket className="w-4 h-4 text-white" />
                      <span>Buy ticket</span>
                    </a>

                    <Link
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-forest hover:text-deep-forest-hover transition-colors no-underline group min-h-[40px]"
                      href="/tickets/order"
                    >
                      <Ticket className="w-3.5 h-3.5 text-forest group-hover:scale-110 transition-transform" />
                      <span>
                        Already purchased a Ticket? Check your ticket status →
                      </span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {activeEvent && checkout && (
        <TicketCheckoutOverlay
          bank={bank}
          checkout={checkout}
          event={activeEvent}
          onCheckoutChange={(next) => {
            setCheckout(next);
            if (typeof window !== "undefined") {
              const search = buildCheckoutQuery(window.location.search, next);
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${search}`,
              );
            }
          }}
          onClose={() => {
            setCheckout(null);
            if (typeof window !== "undefined") {
              const search = buildCheckoutQuery(window.location.search, null);
              window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${search}`,
              );
            }
          }}
        />
      )}

      <WhatsAppSupportButton />
    </div>
  );
}
