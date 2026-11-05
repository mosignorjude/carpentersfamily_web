import type { Metadata } from "next";
import Link from "next/link";
import { LandingEvents } from "@/components/landing/landing-events";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingModals } from "@/components/landing/landing-modals";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingRibbon } from "@/components/landing/landing-ribbon";
import { LandingVision } from "@/components/landing/landing-vision";
import { LandingWhatWeDo } from "@/components/landing/landing-what-we-do";
import type { PublicTicketedEvent } from "@/components/tickets/tickets-storefront-view";
import { SITE_ORIGIN } from "@/lib/site.mjs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SYSTEM_NOTICES } from "@/lib/system-notices";

export const metadata: Metadata = {
  title: "Carpenters Family Social Club · Asaba, Nigeria",
  description:
    "Asaba’s premier family and entertainment collective—creating landmark shows, elevating lifestyle brands, and standing together for life. One Family, Endless Vibes.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Carpenters Family Social Club · Asaba, Nigeria",
    description:
      "Asaba’s premier family and entertainment collective—creating landmark shows, elevating lifestyle brands, and standing together for life. One Family, Endless Vibes.",
    url: SITE_ORIGIN,
    siteName: "Carpenters Family Social Club",
    images: [
      {
        url: "/landing/og-share.jpg",
        width: 1200,
        height: 630,
        alt: "Carpenters Family Social Club · Asaba, Delta State",
      },
    ],
    locale: "en_NG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Carpenters Family Social Club · Asaba, Nigeria",
    description:
      "Asaba’s premier family and entertainment collective—creating landmark shows, elevating lifestyle brands, and standing together for life.",
    images: ["/landing/og-share.jpg"],
  },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; modal?: string }>;
}) {
  const params = await searchParams;
  const noticeDef = params.notice ? SYSTEM_NOTICES[params.notice] : undefined;

  let ticketedEvents: PublicTicketedEvent[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data: rpcData } = await supabase.rpc("get_public_ticketed_events");
    if (rpcData && typeof rpcData === "object") {
      const payload = rpcData as { events?: PublicTicketedEvent[] };
      if (Array.isArray(payload.events)) {
        ticketedEvents = payload.events;
      }
    }
  } catch {
    // Render public landing gracefully if database is temporarily unavailable
  }

  return (
    <div className="min-h-screen bg-cream text-body selection:bg-ochre selection:text-deep">
      <LandingRibbon ticketedEvents={ticketedEvents} />
      <LandingNav />

      {/* Notice Banner */}
      {noticeDef && (
        <div role="status" className="mx-auto max-w-6xl px-4 pt-4">
          <div
            className={`rounded-xl border p-4 shadow-sm flex items-start justify-between gap-3 ${
              noticeDef.type === "error"
                ? "bg-terra/5 border-terra/30 text-terra"
                : "bg-forest/10 border-forest/30 text-forest"
            }`}
          >
            <div>
              <p className="font-bold text-sm">{noticeDef.title}</p>
              <p className="text-xs sm:text-sm mt-0.5">{noticeDef.message}</p>
            </div>
            <Link
              href="/"
              className="text-xs font-bold underline underline-offset-2 shrink-0 hover:opacity-80"
            >
              Dismiss
            </Link>
          </div>
        </div>
      )}

      <main id="top">
        <LandingHero />
        <LandingVision />
        <LandingWhatWeDo />
        <LandingEvents ticketedEvents={ticketedEvents} />

        {/* 5. FINANCIAL INTEGRITY & STEWARDSHIP */}
        <section id="leadership" className="bg-deep text-cream py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 grid lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-xs tracking-[.25em] uppercase font-bold text-ochre">
                The Club Distinction
              </p>
              <h2 className="mt-2 font-serif font-bold text-3xl sm:text-4xl">
                Financial Integrity &amp; Stewardship
              </h2>
              <p className="mt-4 text-cream/85 text-sm sm:text-base leading-relaxed max-w-xl">
                Governance you can see: transparent welfare tracking,
                accountable reserves, democratic consensus, and disciplined
                leadership under the Chairman, Secretary General,
                Provost/Welfare, and Treasurer/Financial Secretary.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-cream/90">
                <li className="flex gap-3">
                  <span className="text-ochre">◆</span>
                  Every naira recorded, with dual-signatory bank authorization
                </li>
                <li className="flex gap-3">
                  <span className="text-ochre">◆</span>
                  Open books and periodic financial reports for every active
                  member
                </li>
                <li className="flex gap-3">
                  <span className="text-ochre">◆</span>
                  Decisions and confirmations by majority vote, preserved in
                  minutes
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-ochre/40 bg-forest/40 p-6 sm:p-8">
              <h3 className="font-serif text-2xl font-bold text-ochre">
                Charter of Values
              </h3>
              <div className="mt-4 divide-y divide-cream/15 text-sm">
                <details className="group" open>
                  <summary className="flex items-center justify-between gap-3 font-bold py-2 text-cream cursor-pointer">
                    Mutual Accountability{" "}
                    <span className="text-ochre group-open:rotate-45 transition text-lg">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-cream/80">
                    We answer to one another for our words, our commitments, our
                    event duties, and the family’s funds.
                  </p>
                </details>
                <details className="group">
                  <summary className="flex items-center justify-between gap-3 font-bold py-2 text-cream cursor-pointer">
                    Decorum &amp; Respect{" "}
                    <span className="text-ochre group-open:rotate-45 transition text-lg">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-cream/80">
                    We carry ourselves with dignity at every event and show, and
                    settle differences as one family.
                  </p>
                </details>
                <details className="group">
                  <summary className="flex items-center justify-between gap-3 font-bold py-2 text-cream cursor-pointer">
                    Family &amp; Shared Growth{" "}
                    <span className="text-ochre group-open:rotate-45 transition text-lg">
                      +
                    </span>
                  </summary>
                  <p className="pb-4 text-cream/80">
                    Our success is measured by the welfare of our members and
                    the standard of every event we deliver.
                  </p>
                </details>
              </div>
            </div>
          </div>
        </section>

        {/* 6. MEMBERSHIP TIMELINE & TESTIMONIALS */}
        <section
          id="membership"
          className="mx-auto max-w-6xl px-4 py-16 sm:py-20"
        >
          <div className="grid lg:grid-cols-12 gap-12 items-start">
            {/* Left: 3-Step Membership Timeline */}
            <div className="lg:col-span-6">
              <p className="text-xs tracking-[.25em] uppercase font-bold text-terra">
                Membership
              </p>
              <h2 className="mt-2 font-serif font-bold text-espresso text-3xl sm:text-4xl">
                By Invitation &amp; Vetted Merit
              </h2>
              <ol className="mt-8 relative border-l-2 border-ochre/60 ml-4 space-y-7">
                <li className="pl-7 relative">
                  <span className="absolute -left-[17px] top-0 h-8 w-8 rounded-full bg-forest text-cream grid place-items-center text-xs font-bold">
                    1
                  </span>
                  <h3 className="font-serif text-xl font-bold text-espresso">
                    Nomination &amp; Referral
                  </h3>
                  <p className="mt-1 text-sm text-umber">
                    You must be duly recommended by an active financial member
                    in good standing.
                  </p>
                </li>
                <li className="pl-7 relative">
                  <span className="absolute -left-[17px] top-0 h-8 w-8 rounded-full bg-forest text-cream grid place-items-center text-xs font-bold">
                    2
                  </span>
                  <h3 className="font-serif text-xl font-bold text-espresso">
                    Character &amp; Probationary Vetting
                  </h3>
                  <p className="mt-1 text-sm text-umber">
                    Your conduct, participation, and contribution are observed
                    over a 3-month probationary period.
                  </p>
                </li>
                <li className="pl-7 relative">
                  <span className="absolute -left-[17px] top-0 h-8 w-8 rounded-full bg-forest text-cream grid place-items-center text-xs font-bold">
                    3
                  </span>
                  <h3 className="font-serif text-xl font-bold text-espresso">
                    Family Induction
                  </h3>
                  <p className="mt-1 text-sm text-umber">
                    Confirmed by majority vote of the house, pledging to the
                    family’s welfare and constitution.
                  </p>
                </li>
              </ol>
            </div>

            {/* Right: Voices of the Family */}
            <div className="lg:col-span-6">
              <p className="text-xs tracking-[.25em] uppercase font-bold text-terra">
                Testimonials
              </p>
              <h2 className="mt-2 font-serif font-bold text-espresso text-3xl sm:text-4xl">
                Voices of the Family
              </h2>
              <div className="mt-8 space-y-4">
                <figure className="rounded-2xl bg-white border border-linen p-5 shadow-xs">
                  <blockquote className="font-serif text-lg text-espresso leading-snug">
                    “More than an entertainment powerhouse—this family has stood
                    behind my personal growth and every milestone at home.”
                  </blockquote>
                  <figcaption className="mt-2.5 text-xs text-umber">
                    <strong className="text-forest font-bold">Chairman</strong>{" "}
                    · Executive Council
                  </figcaption>
                </figure>
                <figure className="rounded-2xl bg-white border border-linen p-5 shadow-xs">
                  <blockquote className="font-serif text-lg text-espresso leading-snug">
                    “When Carpenters Family hosts a show or represents a brand,
                    the discipline and crowd energy are unmatched in Delta.”
                  </blockquote>
                  <figcaption className="mt-2.5 text-xs text-umber">
                    <strong className="text-forest font-bold">
                      Secretary General
                    </strong>{" "}
                    · Executive Council
                  </figcaption>
                </figure>
                <figure className="rounded-2xl bg-white border border-linen p-5 shadow-xs">
                  <blockquote className="font-serif text-lg text-espresso leading-snug">
                    “Accountable finances, collective welfare for active
                    members, and celebrations we will never forget.”
                  </blockquote>
                  <figcaption className="mt-2.5 text-xs text-umber">
                    <strong className="text-forest font-bold">
                      Active Member
                    </strong>{" "}
                    · Carpenters Family
                  </figcaption>
                </figure>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FULL-WIDTH CTA BANNER */}
        <section className="relative overflow-hidden py-20 sm:py-24 text-center text-cream">
          {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
          <img
            src="/landing/cta-band.jpg"
            alt="Carpenters Family celebrating together"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-forest/85 mix-blend-multiply" />
          <div className="absolute inset-0 bg-deep/50" />

          <div className="relative z-10 mx-auto max-w-2xl px-4">
            <h2 className="font-serif font-bold text-3xl sm:text-5xl tracking-tight">
              Experience the Vibe. Join the{" "}
              <span className="underline decoration-ochre decoration-4 underline-offset-8">
                FAMILY
              </span>
            </h2>
            <p className="mt-4 text-sm sm:text-base text-cream/90 leading-relaxed max-w-xl mx-auto">
              Know a member in the club to request an introduction, or looking
              to book our DJs, hype team, and brand promotion crew for your next
              big event?
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/?modal=membership"
                className="btn bg-ochre text-deep hover:bg-cream text-xs sm:text-sm uppercase tracking-wider px-7 shadow-md font-bold transition-colors"
              >
                Request Membership
              </Link>
              <Link
                href="/?modal=partnership"
                className="btn bg-ochre text-deep hover:bg-cream text-xs sm:text-sm uppercase tracking-wider px-7 shadow-md font-bold transition-colors"
              >
                Partner With Us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
      <LandingModals initialModal={params.modal} />
    </div>
  );
}
