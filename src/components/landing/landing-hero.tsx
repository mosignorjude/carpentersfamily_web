export function LandingHero() {
  return (
    <section id="about" className="mx-auto max-w-6xl px-4 pt-6 pb-12">
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg border border-linen min-h-[430px] sm:min-h-[490px] flex items-center justify-center text-center px-6 py-16">
        {/* biome-ignore lint/performance/noImgElement: CSS positioning avoids Next/Image inline styles blocked by the production CSP. */}
        <img
          src="/landing/hero-family.jpg"
          alt="Carpenters Family members united in celebration"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* Warm Forest & Deep Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-deep/90 via-forest/88 to-deep/92" />

        {/* Centered Hero Copy */}
        <div className="relative z-10 max-w-2xl mx-auto text-cream">
          <div className="h-px w-10 bg-ochre mx-auto" />
          <p className="mt-3 text-xs tracking-[.25em] uppercase font-bold text-cream">
            Asaba · Delta State · Nigeria
          </p>
          <h1 className="mt-3 font-serif font-bold text-4xl sm:text-5xl md:text-6xl leading-[1.08]">
            Rooted in Family.
            <br />
            Driven by the Vibe.
          </h1>
          <p className="mt-4 text-sm sm:text-base text-cream/90 leading-relaxed max-w-lg mx-auto">
            Asaba’s premier family and entertainment collective—creating
            landmark shows, elevating lifestyle brands, and standing together
            for life.
          </p>
          <div className="mt-7 flex items-center justify-center">
            <a
              href="#vision"
              className="btn bg-ochre text-deep hover:bg-cream text-xs sm:text-sm uppercase tracking-wider px-8 shadow-md font-bold transition-colors"
            >
              Explore the Family
            </a>
          </div>
          <p className="mt-4 font-serif italic text-sm text-cream">
            “One Family, Endless Vibes.”
          </p>
        </div>
      </div>
    </section>
  );
}
