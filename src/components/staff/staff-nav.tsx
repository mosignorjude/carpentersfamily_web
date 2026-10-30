"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions";
import { clubBrand } from "@/lib/brand";

const staffLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/staff", label: "Staff accounts" },
  { href: "/admin/governance", label: "Governance" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
];

export default function StaffNav({
  fullName,
  username,
}: {
  fullName: string;
  username: string;
}) {
  const pathname = usePathname();

  return (
    <header className="staff-header">
      <div className="staff-header-bar">
        <div className="staff-brand">
          {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
          <img
            alt={clubBrand.logoAlt}
            className="staff-brand-mark"
            height={40}
            src={clubBrand.logoSrc}
            width={40}
          />
          <div>
            <p className="staff-brand-eyebrow">{clubBrand.shortName}</p>
            <p className="staff-brand-title">Staff administration</p>
          </div>
        </div>
        <div className="staff-session">
          <div className="staff-session-id">
            <p className="staff-session-name">{fullName}</p>
            <p className="staff-session-role">
              @{username} · System administrator
            </p>
          </div>
          <form action={signOutAction}>
            <button className="button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Staff administration" className="staff-nav">
        <ul>
          {staffLinks.map((link) => {
            const isCurrent =
              link.href === "/admin"
                ? pathname === "/admin"
                : pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  aria-current={isCurrent ? "page" : undefined}
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
