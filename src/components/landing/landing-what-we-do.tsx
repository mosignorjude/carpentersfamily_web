import Image from "next/image";
import Link from "next/link";

export function LandingWhatWeDo() {
  return (
    <section id="what-we-do" className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        {/* Left Column: Overlapping Photo Collage with Inset Card */}
        <div className="lg:col-span-6 relative pb-12 sm:pb-16 pr-6 sm:pr-12">
          <div className="relative rounded-2xl overflow-hidden shadow-md border border-linen aspect-[4/3] bg-deep">
            <Image
              src="/landing/what-we-do-main.jpg"
              alt="Carpenters Family hosting a live show and lifestyle experience"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>

          {/* Overlapping Bottom-Right Inset Card */}
          <div className="absolute right-0 bottom-0 w-52 sm:w-64 rounded-2xl bg-cream p-2.5 shadow-xl border border-linen">
            <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-forest">
              <Image
                src="/landing/what-we-do-inset.jpg"
                alt="Carpenters Family members smiling together"
                fill
                sizes="(max-width: 640px) 208px, 256px"
                className="object-cover"
              />
              <div className="absolute inset-x-2 bottom-2 bg-[#D8B589] text-espresso px-3 py-2 rounded shadow-md text-center border border-espresso/20">
                <span className="block font-serif italic font-bold text-lg sm:text-xl leading-none">
                  One Family!
                </span>
                <span className="block text-[10px] uppercase tracking-widest font-bold mt-0.5">
                  Endless Vibes · Asaba
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Copy on Entertainment, Brands & Family Welfare */}
        <div className="lg:col-span-6">
          <p className="text-xs tracking-[.25em] uppercase font-bold text-terra">
            Entertainment · Brands · Family
          </p>
          <h2 className="mt-2 font-serif font-bold text-forest text-3xl sm:text-4xl leading-tight">
            What we do as a family to set the pace in Asaba.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-body leading-relaxed">
            Carpenters Family is both a close-knit family and a professional
            entertainment powerhouse. We create the city’s most talked-about
            shows while building lasting wealth, network, and welfare for our
            members.
          </p>

          <div className="mt-6 space-y-3.5 text-sm">
            <div className="p-3.5 rounded-xl bg-white border border-linen flex gap-3.5 items-start">
              <span className="h-7 w-7 rounded-full bg-forest text-ochre font-serif font-bold text-xs grid place-items-center shrink-0 mt-0.5">
                01
              </span>
              <div>
                <h3 className="font-bold text-espresso">
                  Shows, DJ, Hype & Event Hosting
                </h3>
                <p className="text-umber text-xs sm:text-sm mt-0.5">
                  We organize flagship parties and provide top-tier DJs, hype
                  men, MCs, and crowd engagement for corporate and private
                  clients.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-linen flex gap-3.5 items-start">
              <span className="h-7 w-7 rounded-full bg-forest text-ochre font-serif font-bold text-xs grid place-items-center shrink-0 mt-0.5">
                02
              </span>
              <div>
                <h3 className="font-bold text-espresso">
                  Beverage & Lifestyle Brand Promotion
                </h3>
                <p className="text-umber text-xs sm:text-sm mt-0.5">
                  We partner with beverage companies and lifestyle brands to
                  drive real visibility, culture, and product sales at major
                  events.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-linen flex gap-3.5 items-start">
              <span className="h-7 w-7 rounded-full bg-forest text-ochre font-serif font-bold text-xs grid place-items-center shrink-0 mt-0.5">
                03
              </span>
              <div>
                <h3 className="font-bold text-espresso">
                  Family Welfare & Shared Prosperity
                </h3>
                <p className="text-umber text-xs sm:text-sm mt-0.5">
                  We stand by every member during weddings, childbirth, and life
                  milestones—fostering mutual welfare, empowerment, and shared
                  prosperity for active members.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/?modal=partnership"
              className="btn bg-forest text-cream hover:bg-ochre hover:text-deep text-xs sm:text-sm transition-colors"
            >
              Partner With Us / Book Services
            </Link>
            <a
              href="#events"
              className="btn border border-forest text-forest hover:bg-forest hover:text-cream text-xs sm:text-sm transition-colors"
            >
              Explore Past Events →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
