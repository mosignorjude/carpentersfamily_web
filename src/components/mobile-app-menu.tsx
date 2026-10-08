"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import AppNavigationLinks from "@/components/app-navigation-links";

type NavigationItem = { href: string; label: string };

export default function MobileAppMenu({ items }: { items: NavigationItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  function closeOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !isOpen) return;
    setIsOpen(false);
    menuButton.current?.focus();
  }

  return (
    <div className="app-mobile-menu">
      <button
        ref={menuButton}
        aria-controls="mobile-primary-navigation"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="button-secondary app-menu-toggle"
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={closeOnEscape}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="app-menu-icon"
          fill="none"
          focusable="false"
          viewBox="0 0 24 24"
        >
          {isOpen ? (
            <path d="m6 6 12 12M18 6 6 18" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      <nav
        aria-label="Mobile primary navigation"
        className="app-mobile-menu-panel"
        hidden={!isOpen}
        id="mobile-primary-navigation"
        onKeyDown={closeOnEscape}
      >
        <AppNavigationLinks items={items} onNavigate={() => setIsOpen(false)} />
      </nav>
    </div>
  );
}
