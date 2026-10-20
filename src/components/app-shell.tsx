import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions";
import AppHeader from "@/components/app-header";
import AppNavigationLinks from "@/components/app-navigation-links";
import type { AppNotification } from "@/components/notifications/notifications-drawer";
import { clubBrand } from "@/lib/brand";

type NavigationItem = { href: string; label: string };

export default function AppShell({
  children,
  items,
  dashboard = false,
  unreadCount = 0,
  initialNotifications = [],
  currentUserId,
  searchData,
}: {
  children: ReactNode;
  items: NavigationItem[];
  dashboard?: boolean;
  unreadCount?: number;
  initialNotifications?: AppNotification[];
  currentUserId?: string;
  searchData?: {
    announcements: { id: string; title: string }[];
    events: { id: string; title: string }[];
  };
}) {
  const memberNavigationItems = items;

  return (
    <div className={`app-shell${dashboard ? " app-shell-dashboard" : ""}`}>
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
            width={22}
          />
          <span className="app-brand-copy">
            <strong className="app-brand-name">{clubBrand.shortName}</strong>
            <small className="app-brand-slogan">{clubBrand.slogan}</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation" className="app-sidebar-nav">
          <AppNavigationLinks
            items={memberNavigationItems}
            showIcons={dashboard}
          />
        </nav>
        {dashboard ? (
          <footer className="app-sidebar-footer">
            <p>{clubBrand.location}</p>
            <form action={signOutAction} className="app-signout-form">
              <button
                id="btn-app-signout"
                className="button-secondary"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </footer>
        ) : (
          <form action={signOutAction} className="app-signout-form">
            <button
              id="btn-app-signout-alt"
              className="button-secondary"
              type="submit"
            >
              Sign out
            </button>
          </form>
        )}
      </aside>
      <div className="app-shell-main">
        <AppHeader
          currentUserId={currentUserId}
          dashboard={dashboard}
          initialNotifications={initialNotifications}
          memberNavigationItems={memberNavigationItems}
          searchData={searchData}
          unreadCount={unreadCount}
        />
        <div className="app-page-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
