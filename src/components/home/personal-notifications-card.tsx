"use client";

import { Bell, Calendar, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { HomeDashboardActivity } from "@/lib/home-dashboard.server";
import { getNotificationCategoryLabel } from "@/lib/notification-page-presentation.mjs";

const RECENT_ACTIVITY_LIMIT = 5;

function getCategoryIcon(category: string) {
  if (category.includes("event")) {
    return <Calendar className="w-3.5 h-3.5 text-[#174C37]" />;
  }
  if (
    category.includes("dues") ||
    category.includes("money") ||
    category.includes("finance")
  ) {
    return <Wallet className="w-3.5 h-3.5 text-[#8A641A]" />;
  }
  return <Bell className="w-3.5 h-3.5 text-[#174C37]" />;
}

function formatShortTimeAgo(timestamp: string, nowMs = Date.now()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const diffSeconds = Math.max(1, Math.floor((nowMs - date.getTime()) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}

const BODY_TOKEN_REGEX =
  /(@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*|₦[\d,]+(?:\.\d+)?)/g;

function formatActivityBody(body: string) {
  if (!body) return null;
  const regex = new RegExp(BODY_TOKEN_REGEX);
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match = regex.exec(body);

  while (match !== null) {
    const matchStart = match.index;
    const matchText = match[0];

    if (matchStart > lastIndex) {
      elements.push(body.slice(lastIndex, matchStart));
    }

    const key = `act-token-${matchStart}`;
    if (matchText.startsWith("@")) {
      elements.push(
        <span
          className="font-mono text-[10px] font-semibold text-[#174C37] bg-[#174C37]/[0.07] px-1 py-0.2 rounded"
          key={key}
        >
          {matchText}
        </span>,
      );
    } else if (matchText.startsWith("₦")) {
      elements.push(
        <span className="font-mono font-bold text-[#174C37]" key={key}>
          {matchText}
        </span>,
      );
    } else {
      elements.push(matchText);
    }

    lastIndex = matchStart + matchText.length;
    match = regex.exec(body);
  }

  if (lastIndex < body.length) {
    elements.push(body.slice(lastIndex));
  }

  return elements.length > 0 ? elements : body;
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
  const [showAll, setShowAll] = useState(false);

  if (activity.unavailable) {
    return (
      <section
        aria-labelledby="notifications-heading"
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-[#3D291F]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Activity
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            Activity History Unavailable
          </h3>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            Recent club activity could not be retrieved at this time.
          </p>
        </div>
      </section>
    );
  }

  const rows = (activity.rows ?? []).slice(0, RECENT_ACTIVITY_LIMIT);
  const visibleRows = showAll ? rows : rows.slice(0, 3);

  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="notifications-heading"
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-5 h-5 text-[#174C37]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Activity
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#174C37] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            No Recent Activity
          </h3>
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
      className="rounded-2xl bg-white border border-[#E5DDD3] shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5DDD3] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#174C37]" />
          <h2
            className="font-bold text-base text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Activity
          </h2>
        </div>

        {rows.length > 3 && (
          <button
            className="text-xs font-semibold text-[#174C37] hover:underline cursor-pointer"
            onClick={() => setShowAll(!showAll)}
            type="button"
          >
            {showAll ? "Show less" : "View all"}
          </button>
        )}
      </div>

      {/* Compact Side-by-Side Feed Rows */}
      <div className="divide-y divide-[#E5DDD3]/80">
        {visibleRows.map((item) => {
          const shortTimeAgo = formatShortTimeAgo(item.createdAt);
          const categoryLabel = getNotificationCategoryLabel(item.category);

          const rowContent = (
            <>
              {/* Left Category Icon Box */}
              <div className="w-7 h-7 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] grid place-items-center shrink-0 mt-0.5">
                {getCategoryIcon(item.category)}
              </div>

              {/* Right Content Column */}
              <div className="flex-1 min-w-0">
                {/* Row 1: Category label on Left, Relative time on Right */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#174C37] truncate">
                    {categoryLabel}
                  </span>
                  <time className="font-mono text-[11px] text-[#7A685D] shrink-0">
                    {shortTimeAgo}
                  </time>
                </div>

                {/* Row 2: Title */}
                <h3 className="mt-0.5 text-xs font-bold text-[#3D291F] group-hover:text-[#174C37] truncate transition-colors">
                  {item.title}
                </h3>

                {/* Row 3: Body formatted with @handles and ₦ amounts */}
                <p className="mt-0.5 text-[11px] text-[#5C4638] line-clamp-1 leading-snug">
                  {formatActivityBody(item.body)}
                </p>
              </div>
            </>
          );

          if (item.href) {
            return (
              <Link
                className="px-4 py-2.5 flex items-start gap-3 hover:bg-[#FAF6F0]/60 transition-colors group"
                href={item.href}
                key={item.id}
              >
                {rowContent}
              </Link>
            );
          }

          return (
            <div className="px-4 py-2.5 flex items-start gap-3" key={item.id}>
              {rowContent}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default PersonalNotificationsCard;
