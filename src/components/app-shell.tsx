import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import AppNavigationLinks from "@/components/app-navigation-links";
import MobileAppMenu from "@/components/mobile-app-menu";
import { clubBrand } from "@/lib/brand";

type NavigationItem = { href: string; label: string };

export default function AppShell({
  children,
  items,
}: {
  children: ReactNode;
  items: NavigationItem[];
}) {
  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside aria-label="Member navigation" className="app-sidebar">
        <Link
          aria-label={`${clubBrand.shortName} home`}
          className="app-brand"
          href="/"
        >
          {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
          <img
            alt=""
            className="app-brand-logo"
            height={40}
            src={clubBrand.logoSrc}
            width={40}
          />
          <span>{clubBrand.shortName}</span>
        </Link>
        <nav aria-label="Primary navigation" className="app-sidebar-nav">
          <AppNavigationLinks items={items} />
        </nav>
        <form action={signOutAction} className="app-signout-form">
          <button className="button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </aside>
      <div className="app-shell-main">
        <header className="app-mobile-header">
          <Link
            aria-label={`${clubBrand.shortName} home`}
            className="app-brand"
            href="/"
          >
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img
              alt=""
              className="app-brand-logo"
              height={40}
              src={clubBrand.logoSrc}
              width={40}
            />
            <span>{clubBrand.shortName}</span>
          </Link>
          <div className="app-mobile-actions">
            <MobileAppMenu items={items} />
            <form action={signOutAction} className="app-signout-form">
              <button className="button-secondary" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <div className="app-page-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
