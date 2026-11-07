"use client";

import {
  ArrowUpRight,
  Calendar,
  CheckSquare,
  DollarSign,
  Megaphone,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";

interface QuickLinksSectionProps {
  roles: string[];
}

export function QuickLinksSection({ roles }: QuickLinksSectionProps) {
  const isOfficer =
    roles.includes("admin") ||
    roles.includes("executive") ||
    roles.includes("president");

  const links = [
    {
      id: "dues",
      title: "Member Dues",
      description: "Payment schedule, receipts, and balance.",
      href: "/dues",
      icon: DollarSign,
    },
    ...(isOfficer
      ? [
          {
            id: "club_finances",
            title: "Club Finances",
            description: "Club balance, income, and expense records.",
            href: "/finances",
            icon: Wallet,
          },
        ]
      : []),
    {
      id: "events",
      title: "Events",
      description: "Upcoming shows, project budgets, and planning.",
      href: "/events",
      icon: Calendar,
    },
    {
      id: "announcements",
      title: "Announcements",
      description: "Club notices, welfare updates, and circulars.",
      href: "/announcements",
      icon: Megaphone,
    },
    {
      id: "polls",
      title: "Polls",
      description: "Anonymous club polls and member voting.",
      href: "/polls",
      icon: CheckSquare,
    },
    ...(isOfficer
      ? [
          {
            id: "member_admin",
            title: "Member Admin",
            description:
              "Approve members, assign roles, and manage the roster.",
            href: "/officers/members",
            icon: Users,
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="quick-links-heading" className="space-y-2.5">
      <div className="flex items-center justify-between pb-1.5 border-b border-[#E5DDD3]">
        <h2
          className="font-serif font-bold text-base text-[#3D291F]"
          id="quick-links-heading"
        >
          Quick Links
        </h2>
        <span className="text-[11px] text-[#7A685D]">
          Direct shortcuts to key portal sections
        </span>
      </div>

      {/* Compact 2x3 Bento Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <Link
              className="p-3 rounded-xl bg-white border border-[#E5DDD3] hover:border-[#174C37] text-left flex flex-col justify-between gap-2.5 transition-all shadow-2xs group focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              href={link.href}
              key={link.id}
            >
              {/* Top Row: Icon + ArrowUpRight */}
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-[#174C37] grid place-items-center shrink-0">
                  <Icon className="w-4 h-4 text-[#174C37]" />
                </div>

                <ArrowUpRight className="w-4 h-4 text-[#7A685D] group-hover:text-[#174C37] transition-colors" />
              </div>

              {/* Bottom Block: Title + 1-Line Description */}
              <div>
                <h3 className="font-bold text-xs text-[#3D291F] group-hover:text-[#174C37] leading-snug transition-colors">
                  {link.title}
                </h3>
                <p className="text-[11px] text-[#7A685D] mt-0.5 line-clamp-1 leading-tight">
                  {link.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default QuickLinksSection;
