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
    roles.includes("backup_admin");

  const links = [
    {
      id: "dues",
      title: "My Dues & Contributions",
      description:
        "Review monthly dues, inspect contributions, and view statements.",
      href: "/dues",
      icon: DollarSign,
      actionLabel: "View Dues",
    },
    ...(isOfficer
      ? [
          {
            id: "club_finances",
            title: "Club Finances",
            description:
              "Review shared club income, institutional account balances, and disbursements.",
            href: "/finances",
            icon: Wallet,
            actionLabel: "View Finances",
          },
        ]
      : []),
    {
      id: "events",
      title: "Events & Minutes",
      description:
        "Official schedule of general meetings, annual banquets, and session records.",
      href: "/events",
      icon: Calendar,
      actionLabel: "View Calendar",
    },
    {
      id: "announcements",
      title: "Announcements",
      description:
        "Executive notices, official circulars, and event planning communications.",
      href: "/announcements",
      icon: Megaphone,
      actionLabel: "Read Notices",
    },
    {
      id: "polls",
      title: "Member Polls",
      description:
        "Anonymous club polls, consultations, and member referendums.",
      href: "/polls",
      icon: CheckSquare,
      actionLabel: "Vote in Polls",
    },
    ...(isOfficer
      ? [
          {
            id: "member_admin",
            title: "Member Administration",
            description:
              "Officer review of pending memberships, account status, and role grants.",
            href: "/admin/members",
            icon: Users,
            actionLabel: "Open Administration",
          },
        ]
      : []),
  ];

  return (
    <section aria-labelledby="quick-links-heading" className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
        <h3
          className="text-base font-bold text-[#3D291F]"
          id="quick-links-heading"
        >
          Quick Access & Club Services
        </h3>
        <span className="text-xs text-[#7A685D]">Carpenters Family Portal</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <Link
              className="p-4 rounded-xl border border-[#E5DDD3] bg-white hover:border-[#174C37]/40 hover:bg-[#FAF6F0]/50 text-left flex flex-col justify-between transition-all min-h-[120px] shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              href={link.href}
              key={link.id}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3]">
                    <Icon className="w-4 h-4" />
                  </div>

                  <ArrowRight className="w-4 h-4 text-[#7A685D]" />
                </div>

                <h4 className="text-sm font-bold text-[#3D291F] leading-snug">
                  {link.title}
                </h4>
                <p className="text-[11px] text-[#7A685D] mt-1 leading-relaxed">
                  {link.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#E5DDD3]/60 text-xs font-semibold text-[#174C37]">
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
