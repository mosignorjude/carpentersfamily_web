import Link from "next/link";
import { LandingCountdownBadge } from "@/components/landing/landing-countdown-badge";
import type { PublicTicketedEvent } from "@/components/tickets/tickets-storefront-view";
import { selectNextEvent } from "@/lib/landing-events.mjs";

interface LandingRibbonProps {
  ticketedEvents?: PublicTicketedEvent[];
}

export function LandingRibbon({ ticketedEvents }: LandingRibbonProps) {
  const next = selectNextEvent(ticketedEvents);

  return (
    <div className="bg-deep text-cream text-xs sm:text-sm border-b border-forest/40">
      <div className="mx-auto max-w-6xl px-4 py-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        {next ? (
          <span>
            Next event:{" "}
            <strong className="text-ochre font-bold">{next.title}</strong>
            {next.location ? ` · ${next.location}` : ""}
            {next.whenLabel ? ` · ${next.whenLabel}` : ""}
          </span>
        ) : (
          <span>
            Ticketed events open for sale as soon as the family confirms a date
          </span>
        )}
        <Link
          href="/tickets"
          className="underline underline-offset-4 min-h-[44px] inline-flex items-center hover:text-ochre font-medium transition-colors"
        >
          Tickets / Reservations
        </Link>
        <LandingCountdownBadge startsAt={next?.startsAt} />
      </div>
    </div>
  );
}
