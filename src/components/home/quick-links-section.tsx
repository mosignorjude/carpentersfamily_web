"use client";

import {
  ArrowRight,
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
      actionLabel: "View Dues",
    },
    ...(isOfficer
      ? [
          {
            id: "club_finances",
            title: "Club Finances",
            description: "Club balance, income, and expense records.",
            href: "/finances",
            icon: Wallet,
            actionLabel: "View Finances",
          },
        ]
      : []),
    {
      id: "events",
      title: "Events",
      description: "Upcoming shows, project budgets, and planning.",
      href: "/events",
      icon: Calendar,
      actionLabel: "View Events",
    },
    {
      id: "announcements",
      title: "Announcements",
      description: "Club notices, welfare updates, and circulars.",
      href: "/announcements",
      icon: Megaphone,
      actionLabel: "Read Notices",
    },
    {
      id: "polls",
      title: "Polls",
      description: "Anonymous club polls and member voting.",
      href: "/polls",
      icon: CheckSquare,
      actionLabel: "Vote in Polls",
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
            actionLabel: "Manage Members",
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="quick-links-heading" className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
        <h2
          className="text-base font-bold text-[#3D291F]"
          id="quick-links-heading"
        >
          Quick Links
        </h2>
        <span className="text-xs text-[#7A685D]">
          Jump straight to key club sections
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <Link
              className="p-3 sm:p-4 rounded-xl border border-[#E5DDD3] bg-white hover:border-[#174C37]/40 hover:bg-[#FAF6F0]/50 text-left flex flex-col justify-between transition-all min-h-[96px] sm:min-h-[120px] shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              href={link.href}
              key={link.id}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3]">
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>

                  <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#7A685D]" />
                </div>

                <h3 className="text-xs sm:text-sm font-bold text-[#3D291F] leading-snug">
                  {link.title}
                </h3>
                <p className="text-[11px] text-[#7A685D] mt-1 leading-relaxed line-clamp-2">
                  {link.description}
                </p>
              </div>

              <div className="mt-2 sm:mt-3 pt-1.5 sm:pt-2 border-t border-[#E5DDD3]/60 text-[11px] sm:text-xs font-semibold text-[#174C37]">
                {link.actionLabel}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default QuickLinksSection;
