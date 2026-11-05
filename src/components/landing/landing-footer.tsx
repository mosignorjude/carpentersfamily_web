import Link from "next/link";

export function LandingFooter() {
  return (
    <footer
      id="footer"
      className="bg-forest text-cream border-t border-cream/15 relative overflow-hidden"
    >
      <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 group focus:outline-hidden"
        >
          <span className="grid place-items-center h-9 w-9 rounded-full bg-deep text-ochre font-serif font-bold text-base ring-2 ring-ochre/60 group-hover:scale-105 transition-transform">
            C
          </span>
          <span className="leading-tight">
            <span className="block font-serif font-bold text-cream text-base">
              Carpenters Family
            </span>
            <span className="block text-[11px] text-cream/75">
              One Family, Endless Vibes · Asaba
            </span>
          </span>
        </Link>

        {/* Center: Links */}
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-cream/90">
          <li>
            <a href="#about" className="hover:text-ochre transition-colors">
              About Us
            </a>
          </li>
          <li>
            <Link
              href="/tickets"
              className="hover:text-ochre transition-colors"
            >
              Box Office
            </Link>
          </li>
          <li>
            <Link
              href="/?modal=constitution"
              className="hover:text-ochre transition-colors"
            >
              Constitution Summary
            </Link>
          </li>
          <li>
            <Link
              href="/?modal=partnership"
              className="hover:text-ochre transition-colors"
            >
              Brand &amp; Event Booking
            </Link>
          </li>
          <li>
            <Link href="/portal" className="hover:text-ochre transition-colors">
              Member Portal
            </Link>
          </li>
        </ul>

        {/* Right: 4 Circular Social Icons */}
        <div className="flex items-center gap-2">
          <a
            href="#footer"
            aria-label="LinkedIn"
            className="h-8 w-8 rounded-full bg-deep text-cream grid place-items-center text-xs font-bold hover:bg-ochre hover:text-deep transition-colors"
          >
            in
          </a>
          <a
            href="#footer"
            aria-label="Instagram"
            className="h-8 w-8 rounded-full bg-terra text-cream grid place-items-center text-xs font-bold hover:bg-ochre hover:text-deep transition-colors"
          >
            IG
          </a>
          <a
            href="#footer"
            aria-label="X"
            className="h-8 w-8 rounded-full bg-deep text-cream grid place-items-center text-xs font-bold hover:bg-ochre hover:text-deep transition-colors"
          >
            𝕏
          </a>
          <a
            href="#footer"
            aria-label="Facebook"
            className="h-8 w-8 rounded-full bg-deep text-cream grid place-items-center text-xs font-bold hover:bg-ochre hover:text-deep transition-colors"
          >
            f
          </a>
        </div>
      </div>
      <div className="bg-deep/60 py-3 text-center text-[11px] text-cream/70">
        © 2026 Carpenters Family Social Club. One Family, Endless Vibes — Asaba,
        Delta State, Nigeria.
      </div>
    </footer>
  );
}
