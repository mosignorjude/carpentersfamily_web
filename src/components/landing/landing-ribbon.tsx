import Link from "next/link";
import type { PublicTicketedEvent } from "@/components/tickets/tickets-storefront-view";
import { selectNextGathering } from "@/lib/landing-events.mjs";

interface LandingRibbonProps {
  ticketedEvents?: PublicTicketedEvent[];
}

export function LandingRibbon({ ticketedEvents }: LandingRibbonProps) {
  const next = selectNextGathering(ticketedEvents);
  const season = next?.whenLabel.slice(-4);

  return (
    <div className="bg-deep text-cream text-xs sm:text-sm border-b border-forest/40">
      <div className="mx-auto max-w-6xl px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
        {next ? (
          <span>
            Next gathering:{" "}
            <strong className="text-ochre font-bold">{next.title}</strong>
            {next.location ? ` · ${next.location}` : ""}
            {next.whenLabel ? ` · ${next.whenLabel}` : ""}
          </span>
        ) : (
          <span>
            Ticketed gatherings open for sale as soon as the family confirms a
            date
          </span>
        )}
        {season && (
          <span className="rounded-full bg-ochre/20 text-ochre px-3 py-0.5 font-bold text-xs">
            {season} Season
          </span>
        )}
        <Link
          href="/tickets"
          className="underline underline-offset-4 min-h-[32px] inline-flex items-center hover:text-ochre font-medium transition-colors"
        >
          RSVP / Tickets
        </Link>
      </div>
    </div>
  );
}
