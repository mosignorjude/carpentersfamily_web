"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    function handleHashChange() {
      setMobileMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur-md border-b border-linen">
        <nav
          className="mx-auto max-w-6xl px-4 h-[72px] flex items-center justify-between gap-4"
          aria-label="Main Navigation"
        >
          {/* Left: Circular 'C' Crest + Club Name + Nav Links */}
          <div className="flex items-center gap-6 lg:gap-8">
            <Link
              href="/"
              className="flex items-center gap-3 min-h-[44px] shrink-0 group focus:outline-hidden"
            >
              <span className="grid place-items-center h-10 w-10 rounded-full bg-forest text-ochre font-serif font-bold text-lg ring-2 ring-ochre/60 group-hover:scale-105 transition-transform">
                C
              </span>
              <span className="leading-tight">
                <span className="block font-serif font-bold text-espresso text-base sm:text-lg tracking-tight">
                  Carpenters Family
                </span>
                <span className="block text-[11px] text-umber">
                  Asaba, Delta State
                </span>
              </span>
            </Link>

            <ul className="hidden lg:flex items-center gap-1 text-sm font-medium text-espresso">
              <li>
                <a
                  className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
                  href="#about"
                >
                  About
                </a>
              </li>
              <li>
                <a
                  className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
                  href="#what-we-do"
                >
                  What We Do
                </a>
              </li>
              <li>
                <a
                  className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
                  href="#events"
                >
                  Events &amp; Lifestyle
                </a>
              </li>
              <li>
                <a
                  className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
                  href="#leadership"
                >
                  Stewardship
                </a>
              </li>
              <li>
                <a
                  className="px-3 min-h-[44px] inline-flex items-center hover:text-forest transition-colors"
                  href="#membership"
                >
                  Membership
                </a>
              </li>
            </ul>
          </div>

          {/* Right: Box Office + Member Portal + Social Icons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/tickets"
              className="text-xs font-bold text-forest border border-forest/30 bg-forest/5 hover:bg-forest hover:text-cream px-3.5 py-2 rounded-full transition-all min-h-[38px] inline-flex items-center justify-center"
            >
              Box Office
            </Link>

            <Link
              href="/portal"
              className="text-xs font-bold text-espresso border border-linen bg-white hover:border-forest px-3.5 py-2 rounded-full transition-all min-h-[38px] inline-flex items-center justify-center shadow-xs"
            >
              Member Portal
            </Link>

            <div className="flex items-center gap-1.5">
              <a
                href="#footer"
                title="LinkedIn"
                aria-label="LinkedIn"
                className="h-7 w-7 rounded-full bg-forest text-cream grid place-items-center text-[11px] font-bold hover:bg-ochre hover:text-deep transition-colors"
              >
                in
              </a>
              <a
                href="#footer"
                title="Instagram"
                aria-label="Instagram"
                className="h-7 w-7 rounded-full bg-terra text-cream grid place-items-center text-[11px] font-bold hover:bg-ochre hover:text-deep transition-colors"
              >
                IG
              </a>
              <a
                href="#footer"
                title="X"
                aria-label="X"
                className="h-7 w-7 rounded-full bg-deep text-cream grid place-items-center text-[11px] font-bold hover:bg-ochre hover:text-deep transition-colors"
              >
                𝕏
              </a>
              <a
                href="#footer"
                title="Facebook"
                aria-label="Facebook"
                className="h-7 w-7 rounded-full bg-forest text-cream grid place-items-center text-[11px] font-bold hover:bg-ochre hover:text-deep transition-colors"
              >
                f
              </a>
            </div>
          </div>

          {/* Mobile Menu Trigger Button */}
          <button
            type="button"
            className="lg:hidden h-11 w-11 grid place-items-center rounded-lg border border-linen bg-white text-espresso"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="drawer"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M3 6h16M3 11h16M3 16h16" />
              )}
            </svg>
          </button>
        </nav>
      </header>

      {/* MOBILE SLIDE-OVER DRAWER */}
      {mobileMenuOpen && (
        <div
          id="scrim"
          className="fixed inset-0 z-50 bg-deep/60 backdrop-blur-xs transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        id="drawer"
        className={`fixed top-0 right-0 z-50 h-full w-[85%] max-w-sm bg-cream p-6 transition-transform duration-300 overflow-y-auto shadow-2xl border-l border-linen ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Mobile Menu"
      >
        <div className="flex items-center justify-between pb-3 border-b border-linen">
          <span className="font-serif font-bold text-lg text-espresso">
            Carpenters Family
          </span>
          <button
            type="button"
            className="h-11 w-11 grid place-items-center text-2xl text-espresso"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            ×
          </button>
        </div>
        <ul className="mt-3 font-serif text-xl text-espresso">
          <li>
            <a className="block py-3 border-b border-linen" href="#about">
              About
            </a>
          </li>
          <li>
            <a className="block py-3 border-b border-linen" href="#what-we-do">
              What We Do
            </a>
          </li>
          <li>
            <a className="block py-3 border-b border-linen" href="#events">
              Events &amp; Lifestyle
            </a>
          </li>
          <li>
            <a className="block py-3 border-b border-linen" href="#leadership">
              Stewardship
            </a>
          </li>
          <li>
            <a className="block py-3 border-b border-linen" href="#membership">
              Membership
            </a>
          </li>
        </ul>
        <div className="mt-6 grid gap-3 font-sans text-sm">
          <Link
            href="/tickets"
            className="btn-pill border border-forest/30 bg-forest/5 text-forest text-center font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Box Office / Tickets
          </Link>
          <Link
            href="/portal"
            className="btn-pill border border-linen bg-white text-espresso text-center font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Member Portal Sign In
          </Link>
          <Link
            href="/?modal=membership"
            className="btn-pill bg-forest text-cream text-center font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Request Membership
          </Link>
          <Link
            href="/?modal=partnership"
            className="btn-pill bg-ochre text-deep text-center font-bold"
            onClick={() => setMobileMenuOpen(false)}
          >
            Partner With Us
          </Link>
        </div>
      </aside>
    </>
  );
}
