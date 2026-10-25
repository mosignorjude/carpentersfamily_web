"use client";

import { Bell, Calendar, Wallet } from "lucide-react";
import Link from "next/link";
import type { HomeDashboardActivity } from "@/lib/home-dashboard.server";

const RECENT_ACTIVITY_LIMIT = 5;

function formatActivityDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

function getCategoryIcon(category: string) {
  if (category.includes("event")) {
    return <Calendar className="w-4 h-4 text-[#174C37]" />;
  }
  if (
    category.includes("dues") ||
    category.includes("money") ||
    category.includes("finance")
  ) {
    return <Wallet className="w-4 h-4 text-[#D6A23A]" />;
  }
  return <Bell className="w-4 h-4 text-[#174C37]" />;
}

interface PersonalNotificationsCardProps {
  activity: {
    unavailable: boolean;
    rows: HomeDashboardActivity[];
  };
}

export function PersonalNotificationsCard({
  activity,
}: PersonalNotificationsCardProps) {
  if (activity.unavailable) {
    return (
      <section
        aria-labelledby="notifications-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-[#3D291F]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Member Activity & Notices
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            Activity History Unavailable
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            Recent club activity could not be retrieved at this time.
          </p>
        </div>
      </section>
    );
  }

  const rows = (activity.rows ?? []).slice(0, RECENT_ACTIVITY_LIMIT);

  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="notifications-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-[#174C37]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Member Activity & Notices
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#174C37] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Recent Activity
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            New activity and club notices will appear here as they happen.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="notifications-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs space-y-5"
    >
      <div className="flex items-center gap-2 pb-3 border-b border-[#E5DDD3]">
        <Bell className="w-5 h-5 text-[#174C37]" />
        <h3
          className="text-lg font-bold text-[#3D291F]"
          id="notifications-heading"
        >
          Recent Member Activity & Notices
        </h3>
      </div>

      <div className="space-y-3">
        {rows.map((item) => (
          <div
            className="p-4 sm:p-5 rounded-xl border border-[#E5DDD3] bg-white shadow-2xs space-y-3"
            key={item.id}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="shrink-0 p-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3]">
                {getCategoryIcon(item.category)}
              </span>
              <span className="text-xs font-bold font-mono text-[#7A685D]">
                {formatActivityDate(item.createdAt)}
              </span>
            </div>

            {item.href ? (
              <Link
                className="block space-y-1.5 rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-[#FAF6F0] transition-colors focus-visible:outline-2 focus-visible:outline-[#174C37] group"
                href={item.href}
              >
                <h4 className="font-bold text-[#3D291F] group-hover:text-[#174C37] transition-colors text-sm leading-snug">
                  {item.title}
                </h4>

                <p className="text-xs font-normal text-[#5C4638] leading-relaxed">
                  {item.body}
                </p>
              </Link>
            ) : (
              <div className="space-y-1.5">
                <h4 className="font-bold text-[#3D291F] text-sm leading-snug">
                  {item.title}
                </h4>

                <p className="text-xs font-normal text-[#5C4638] leading-relaxed">
                  {item.body}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default PersonalNotificationsCard;
