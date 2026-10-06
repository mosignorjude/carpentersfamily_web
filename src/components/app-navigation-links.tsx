"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavigationItem = { href: string; label: string };

export default function AppNavigationLinks({
  items,
  onNavigate,
}: {
  items: NavigationItem[];
  onNavigate?: () => void;
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
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
