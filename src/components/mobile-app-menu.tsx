"use client";

import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import AppNavigationLinks from "@/components/app-navigation-links";

type NavigationItem = { href: string; label: string };

export default function MobileAppMenu({
  items,
  children,
  showIcons = false,
}: {
  items: NavigationItem[];
  children?: ReactNode;
  showIcons?: boolean;
}) {
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
        <span aria-hidden="true" className="app-menu-icon">
          {isOpen ? "×" : "☰"}
        </span>
      </button>
      {isOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-70 bg-black/20 backdrop-blur-[1px] lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <nav
        aria-label="Mobile primary navigation"
        className="app-mobile-menu-panel"
        hidden={!isOpen}
        id="mobile-primary-navigation"
        onKeyDown={closeOnEscape}
      >
        <AppNavigationLinks
          items={items}
          onNavigate={() => setIsOpen(false)}
          showIcons={showIcons}
        />
        {children}
      </nav>
    </div>
  );
}
