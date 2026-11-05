import Image from "next/image";
import Link from "next/link";

interface LandingEventsProps {
  ticketedEvents?: Array<{
    id: string;
    title: string;
    starts_at: string;
    location: string;
  }>;
}

export function LandingEvents({ ticketedEvents }: LandingEventsProps) {
  return (
    <section id="events" className="bg-white border-y border-linen py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-[.25em] uppercase font-bold text-terra">
              Events, Impact &amp; Lifestyle
            </p>
            <h2 className="mt-2 font-serif font-bold text-espresso text-3xl sm:text-4xl">
              The Lifestyle &amp; Flagship Gatherings
            </h2>
            <p className="mt-2 text-sm text-umber max-w-xl">
              A glimpse into our past raves, brand activations, traditional outings,
              and upcoming gatherings across Delta State.
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
            <Image
              src="/landing/tile-raves.jpg"
              alt="Signature Rave Crowd Energy & Nightlife"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 300px"
              className="object-cover group-hover:scale-105 transition duration-500"
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
            <Image
              src="/landing/tile-djs-hype.jpg"
              alt="Pro DJs, MCs & Hype Services"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 300px"
              className="object-cover group-hover:scale-105 transition duration-500"
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
            <Image
              src="/landing/tile-brand-activation.jpg"
              alt="Beverage & Lifestyle Brand Activations"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 300px"
              className="object-cover group-hover:scale-105 transition duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/90 via-deep/20 to-transparent p-4 flex flex-col justify-end text-cream">
              <span className="text-[10px] uppercase tracking-widest text-ochre font-bold">
                Brand Partnerships
              </span>
              <figcaption className="font-serif font-bold text-base">
                Beverage &amp; Lifestyle Sales
              </figcaption>
            </div>
          </figure>

          <figure className="relative rounded-2xl overflow-hidden h-48 sm:h-56 group bg-deep">
            <Image
              src="/landing/tile-family-galas.jpg"
              alt="Family Galas, Weddings & Outings"
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 300px"
              className="object-cover group-hover:scale-105 transition duration-500"
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

        {/* 3 Flagship Event Cards */}
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          <article className="rounded-2xl bg-cream border border-linen p-6 flex flex-col">
            <div className="flex justify-between gap-2 text-xs font-bold">
              <span className="rounded-full bg-forest/10 text-forest px-3 py-1">
                Dec 2026 · Asaba
              </span>
              <span className="rounded-full bg-terra/10 text-terra px-3 py-1">
                Members &amp; Invitees
              </span>
            </div>
            <h3 className="mt-4 font-serif text-2xl font-bold text-espresso">
              Annual End-of-Year Gala
            </h3>
            <p className="mt-2 text-sm text-body flex-1">
              A night of family honours, awards, dining, and celebration to close
              the club year in grand style.
            </p>
            <span className="mt-4 self-start rounded-full bg-ochre/20 text-espresso text-xs font-bold px-3 py-1">
              Black Tie &amp; Velvet
            </span>
            <Link
              href="/tickets"
              className="btn mt-5 bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
            >
              View Schedule &amp; Tickets
            </Link>
          </article>

          <article className="rounded-2xl bg-cream border border-linen p-6 flex flex-col">
            <div className="flex justify-between gap-2 text-xs font-bold">
              <span className="rounded-full bg-forest/10 text-forest px-3 py-1">
                Delta State
              </span>
              <span className="rounded-full bg-ochre/25 text-espresso px-3 py-1">
                Public Tickets &amp; Tables
              </span>
            </div>
            <h3 className="mt-4 font-serif text-2xl font-bold text-espresso">
              The SLK Rave &amp; Shows
            </h3>
            <p className="mt-2 text-sm text-body flex-1">
              Our high-energy signature rave experience: headline DJs, hype men,
              brand activations, and the family at its loudest.
            </p>
            <span className="mt-4 self-start rounded-full bg-ochre/20 text-espresso text-xs font-bold px-3 py-1">
              Vibrant &amp; Colourful
            </span>
            <Link
              href="/tickets"
              className="btn mt-5 bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
            >
              Get Tickets at Box Office
            </Link>
          </article>

          <article className="rounded-2xl bg-cream border border-linen p-6 flex flex-col">
            <div className="flex justify-between gap-2 text-xs font-bold">
              <span className="rounded-full bg-forest/10 text-forest px-3 py-1">
                Last Sunday · 4:00 PM
              </span>
              <span className="rounded-full bg-terra/10 text-terra px-3 py-1">
                Members Only
              </span>
            </div>
            <h3 className="mt-4 font-serif text-2xl font-bold text-espresso">
              Monthly General Assembly
            </h3>
            <p className="mt-2 text-sm text-body flex-1">
              Where the family reviews accounts, tracks event performance, votes
              on resolutions, and plans upcoming shows.
            </p>
            <span className="mt-4 self-start rounded-full bg-ochre/20 text-espresso text-xs font-bold px-3 py-1">
              Smart / Traditional
            </span>
            <Link
              href="/portal"
              className="btn mt-5 bg-forest text-cream hover:bg-ochre hover:text-deep text-xs font-bold transition-colors"
            >
              Member Portal Login
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
