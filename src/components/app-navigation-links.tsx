"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClubIcon, type ClubIconName } from "@/components/club-icon";

type NavigationItem = { href: string; label: string };
const navigationIcons: Record<string, ClubIconName> = {
  "/": "home",
  "/admin/members": "users",
  "/announcements": "megaphone",
  "/polls": "poll",
  "/dues": "wallet",
  "/events": "calendar",
  "/attendance": "check-circle",
  "/finances": "chart",
};

export default function AppNavigationLinks({
  items,
  onNavigate,
  showIcons = false,
}: {
  items: NavigationItem[];
  onNavigate?: () => void;
  showIcons?: boolean;
}) {
  const pathname = usePathname();

  return (
    <ul className="app-nav-links">
      {items.map((item) => {
        const isCurrent =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Link
              aria-current={isCurrent ? "page" : undefined}
              href={item.href}
              onClick={onNavigate}
            >
              {showIcons ? (
                <>
                  <span aria-hidden="true" className="app-nav-icon">
                    <ClubIcon name={navigationIcons[item.href] ?? "file"} />
                  </span>
                  <span className="app-nav-label">{item.label}</span>
                </>
              ) : (
                item.label
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
