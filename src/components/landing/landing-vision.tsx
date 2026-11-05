export function LandingVision() {
  return (
    <section id="vision" className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <div className="grid sm:grid-cols-3 gap-10 text-center">
        {/* Column 1: Our Vision */}
        <article className="flex flex-col items-center">
          <div className="h-16 w-16 grid place-items-center text-forest">
            <svg
              viewBox="0 0 64 64"
              className="h-14 w-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 34c7-11 15-16 24-16s17 5 24 16c-7 11-15 16-24 16S15 45 8 34Z" />
              <circle
                cx="32"
                cy="34"
                r="7"
                className="stroke-ochre"
                strokeWidth="2.2"
              />
              <circle cx="32" cy="34" r="2.5" fill="currentColor" />
              <path
                d="M32 10v4M21 12l2 3.5M43 12l-2 3.5"
                className="stroke-ochre"
              />
              <path d="M22 50c4 3 16 3 20 0" />
            </svg>
          </div>
          <h2 className="mt-3 font-serif font-bold text-lg text-espresso">
            Our Vision
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-umber leading-relaxed max-w-xs">
            To be Delta State’s foremost family and lifestyle powerhouse—where
            unity, culture, and unforgettable entertainment meet.
          </p>
        </article>

        {/* Column 2: Our Mission */}
        <article className="flex flex-col items-center">
          <div className="h-16 w-16 grid place-items-center text-forest">
            <svg
              viewBox="0 0 64 64"
              className="h-14 w-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 14h24v12c0 7-5 12-12 12s-12-5-12-12V14Z" />
              <path d="M20 18h-6v4c0 4 2.5 7 6 7M44 18h6v4c0 4-2.5 7-6 7" />
              <path d="M32 38v10M22 48h20M25 53h14" />
              <path
                d="M32 20l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6L32 20Z"
                className="stroke-ochre"
              />
            </svg>
          </div>
          <h2 className="mt-3 font-serif font-bold text-lg text-espresso">
            Our Mission
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-umber leading-relaxed max-w-xs">
            To produce landmark shows, deliver premier DJ, hype, and brand
            experiences, and create shared prosperity for every active member.
          </p>
        </article>

        {/* Column 3: Our Values */}
        <article className="flex flex-col items-center">
          <div className="h-16 w-16 grid place-items-center text-forest">
            <svg
              viewBox="0 0 64 64"
              className="h-14 w-14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <ellipse
                cx="32"
                cy="32"
                rx="22"
                ry="9"
                transform="rotate(30 32 32)"
              />
              <ellipse
                cx="32"
                cy="32"
                rx="22"
                ry="9"
                transform="rotate(-30 32 32)"
              />
              <path
                d="M32 37s-5-3.2-5-6.2a2.8 2.8 0 0 1 5-1.7 2.8 2.8 0 0 1 5 1.7c0 3-5 6.2-5 6.2Z"
                className="fill-ochre stroke-ochre"
              />
            </svg>
          </div>
          <h2 className="mt-3 font-serif font-bold text-lg text-espresso">
            Our Values
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-umber leading-relaxed max-w-xs">
            Family loyalty, discipline, open-book accountability, and excellence
            in every event, celebration, and brand partnership.
          </p>
        </article>
      </div>
    </section>
  );
}
