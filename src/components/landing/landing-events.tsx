import Link from "next/link";
import type { PublicTicketedEvent } from "@/components/tickets/tickets-storefront-view";
import { formatNaira } from "@/lib/format";
import { selectLandingEvents } from "@/lib/landing-events.mjs";

interface LandingEventsProps {
  ticketedEvents?: PublicTicketedEvent[];
}

export function LandingEvents({ ticketedEvents }: LandingEventsProps) {
  const cards = selectLandingEvents(ticketedEvents);

  return (
    <section
      id="events"
      className="bg-white border-y border-linen py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[.25em] uppercase font-bold text-terra">
              Events, Impact &amp; Lifestyle
            </p>
            <h2 className="mt-2 font-serif font-bold text-espresso text-3xl sm:text-4xl">
              Upcoming Events
            </h2>
            <p className="mt-2 text-sm text-umber max-w-xl">
              A glimpse into our past raves, brand activations, traditional
              outings, and upcoming events across Delta State.
              {cards.length > 0 && (
                <span className="block mt-1 text-xs text-forest font-semibold">
                  {cards.length} live ticketed{" "}
                  {cards.length === 1 ? "event" : "events"} currently on sale.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/tickets"
              className="btn bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
            >
              Box Office &amp; Tickets →
            </Link>
          </div>
        </div>

        {/* 4-Tile Lifestyle Photo Showcase */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <figure className="relative rounded-2xl overflow-hidden h-48 sm:h-56 group bg-deep">
            {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
            <img
              src="/landing/tile-raves.jpg"
              alt="Signature Rave Crowd Energy & Nightlife"
              className="absolute inset-0 h-full w-full object-cover motion-safe:transition motion-safe:duration-500 motion-safe:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/20 to-transparent p-4 flex flex-col justify-end text-cream">
              <span className="text-[10px] uppercase tracking-widest text-ochre font-bold">
                Signature Rave
              </span>
              <figcaption className="font-serif font-bold text-base">
                Crowd Energy &amp; Nightlife
              </figcaption>
            </div>
          </figure>

          <figure className="relative rounded-2xl overflow-hidden h-48 sm:h-56 group bg-deep">
            {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
            <img
              src="/landing/tile-djs-hype.jpg"
              alt="Pro DJs, MCs & Hype Services"
              className="absolute inset-0 h-full w-full object-cover motion-safe:transition motion-safe:duration-500 motion-safe:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/20 to-transparent p-4 flex flex-col justify-end text-cream">
              <span className="text-[10px] uppercase tracking-widest text-ochre font-bold">
                Talent &amp; Production
              </span>
              <figcaption className="font-serif font-bold text-base">
                Pro DJs, MCs &amp; Hype
              </figcaption>
            </div>
          </figure>

          <figure className="relative rounded-2xl overflow-hidden h-48 sm:h-56 group bg-deep">
            {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
            <img
              src="/landing/tile-brand-activation.jpg"
              alt="Drinks & Lifestyle Brand Activations"
              className="absolute inset-0 h-full w-full object-cover motion-safe:transition motion-safe:duration-500 motion-safe:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/20 to-transparent p-4 flex flex-col justify-end text-cream">
              <span className="text-[10px] uppercase tracking-widest text-ochre font-bold">
                Brand Partnerships
              </span>
              <figcaption className="font-serif font-bold text-base">
                Drinks &amp; Lifestyle Sales
              </figcaption>
            </div>
          </figure>

          <figure className="relative rounded-2xl overflow-hidden h-48 sm:h-56 group bg-deep">
            {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
            <img
              src="/landing/tile-family-galas.jpg"
              alt="Family Galas, Weddings & Outings"
              className="absolute inset-0 h-full w-full object-cover motion-safe:transition motion-safe:duration-500 motion-safe:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/20 to-transparent p-4 flex flex-col justify-end text-cream">
              <span className="text-[10px] uppercase tracking-widest text-ochre font-bold">
                One Family
              </span>
              <figcaption className="font-serif font-bold text-base">
                Galas, Weddings &amp; Outings
              </figcaption>
            </div>
          </figure>
        </div>

        {/* Upcoming events — every card below is a row from
            public.get_public_ticketed_events(), never a hand-written schedule. */}
        {cards.length > 0 ? (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-2xl bg-cream border border-linen p-6 flex flex-col"
              >
                <div className="flex flex-wrap justify-between gap-2 text-xs font-bold">
                  <span className="rounded-full bg-forest/10 text-forest px-3 py-1">
                    {[card.whenLabel, card.timeLabel]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {card.location && (
                    <span className="rounded-full bg-ochre/25 text-espresso px-3 py-1">
                      {card.location}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-serif text-2xl font-bold text-espresso">
                  {card.title}
                </h3>
                {card.blurb && (
                  <p className="mt-2 text-sm text-body flex-1">{card.blurb}</p>
                )}
                <span
                  className={`mt-4 self-start rounded-full text-xs font-bold px-3 py-1 ${
                    card.soldOut
                      ? "bg-terra/10 text-terra"
                      : "bg-ochre/20 text-espresso"
                  }`}
                >
                  {card.soldOut
                    ? "Sold out"
                    : card.cheapestPrice === null
                      ? "Tickets at the box office"
                      : `From ${formatNaira(card.cheapestPrice)}`}
                </span>
                <Link
                  href="/tickets"
                  className="btn mt-5 bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
                >
                  {card.soldOut
                    ? "See the box office"
                    : "Get tickets at the box office"}
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-linen bg-cream p-8 text-center">
            <h3 className="font-serif text-xl font-bold text-espresso">
              No event is on sale right now
            </h3>
            <p className="mt-2 text-sm text-umber max-w-md mx-auto">
              Ticketed shows open for sale as soon as the family confirms the
              date. Members hear first — the box office lists every event the
              moment it goes live.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/tickets"
                className="btn border border-forest text-forest hover:bg-forest hover:text-cream text-xs font-bold transition-colors"
              >
                Check the box office
              </Link>
              <Link
                href="/?modal=membership"
                className="btn bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
              >
                Ask about membership
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
