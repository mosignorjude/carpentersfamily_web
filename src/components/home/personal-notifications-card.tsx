"use client";

import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  ChevronRight,
  RotateCcw,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  markAllNotificationsReadAsyncAction,
  markNotificationReadAsyncAction,
  markNotificationUnreadAsyncAction,
} from "@/app/actions";
import type { HomeDashboardActivity } from "@/lib/home-dashboard.server";

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
    unreadCount: number | null;
    unreadCountUnavailable: boolean;
  };
}

export function PersonalNotificationsCard({
  activity,
}: PersonalNotificationsCardProps) {
  const [items, setItems] = useState<HomeDashboardActivity[]>(
    activity.rows ?? [],
  );
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setItems(activity.rows ?? []);
  }, [activity.rows]);

  const unreadCount = items.filter((item) => item.readAt === null).length;

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
            Recent Member Activity
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            Activity History Unavailable
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            Your notifications could not be retrieved at this time.
          </p>
        </div>
      </section>
    );
  }

  const rows = items;

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
            Recent Member Activity
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Bell className="w-6 h-6 text-[#174C37] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Personal Notifications
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            You are fully caught up. When announcements or updates are issued,
            your personal notices will appear here.
          </p>
        </div>
      </section>
    );
  }

  async function handleMarkRead(id: string) {
    if (isPending) return;
    setIsPending(true);
    const prevItems = items;
    const nowIso = new Date().toISOString();

    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: nowIso } : n)),
    );

    const result = await markNotificationReadAsyncAction(id);
    if (!result?.ok) {
      setItems(prevItems);
    }
    setIsPending(false);
  }

  async function handleMarkUnread(id: string) {
    if (isPending) return;
    setIsPending(true);
    const prevItems = items;

    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: null } : n)),
    );

    const result = await markNotificationUnreadAsyncAction(id);
    if (!result?.ok) {
      setItems(prevItems);
    }
    setIsPending(false);
  }

  async function handleMarkAllRead() {
    if (isPending || unreadCount === 0) return;
    setIsPending(true);
    const prevItems = items;
    const nowIso = new Date().toISOString();

    setItems((prev) =>
      prev.map((n) => (n.readAt === null ? { ...n, readAt: nowIso } : n)),
    );

    const result = await markAllNotificationsReadAsyncAction();
    if (!result?.ok) {
      setItems(prevItems);
    }
    setIsPending(false);
  }

  return (
    <section
      aria-labelledby="notifications-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#174C37]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="notifications-heading"
          >
            Recent Member Activity & Notices
          </h3>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {activity.unreadCountUnavailable ? (
            <span className="text-xs font-semibold text-[#7A685D]">
              Unread count unavailable
            </span>
          ) : unreadCount > 0 ? (
            <div className="flex items-center gap-2.5">
              <span className="font-semibold text-[#174C37]">
                {unreadCount} unread update{unreadCount > 1 ? "s" : ""}
              </span>
              <button
                className="text-xs font-semibold text-[#174C37] hover:underline cursor-pointer inline-flex items-center gap-1 min-h-[44px] px-2.5 py-1 rounded-lg border border-[#E5DDD3] bg-white hover:bg-[#FAF6F0] transition-colors"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                <CheckCheck className="w-3.5 h-3.5 text-[#174C37]" />
                <span>Mark all as read</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold text-[#7A685D]">
              All caught up
            </span>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {rows.slice(0, 4).map((item) => {
          const isUnread = item.readAt === null;

          return (
            <div
              className={`p-4 sm:p-5 rounded-xl border transition-colors space-y-3 ${
                isUnread
                  ? "bg-[#FAF6F0] border-[#174C37]/40 shadow-xs"
                  : "bg-white border-[#E5DDD3] shadow-2xs"
              }`}
              key={item.id}
            >
              {/* Top Row: Category, Read/Unread Tag, Date & Mark Read/Unread action */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span className="shrink-0 p-1.5 rounded-lg bg-white border border-[#E5DDD3]">
                    {getCategoryIcon(item.category)}
                  </span>
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wide ${
                      isUnread ? "text-[#174C37]" : "text-[#7A685D]"
                    }`}
                  >
                    {isUnread ? "Unread" : "Read"}
                  </span>
                  <span aria-hidden="true" className="text-[#B8ACA0]">
                    ·
                  </span>
                  <span className="text-xs font-bold font-mono text-[#7A685D] shrink-0">
                    {formatActivityDate(item.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isUnread ? (
                    <button
                      aria-label={`Mark "${item.title}" as read`}
                      className="text-xs font-bold text-[#174C37] hover:underline cursor-pointer inline-flex items-center gap-1 min-h-[44px] px-2.5 py-1 rounded-lg border border-[#174C37]/30 bg-white hover:bg-[#FAF6F0] transition-colors"
                      disabled={isPending}
                      onClick={() => handleMarkRead(item.id)}
                      type="button"
                    >
                      <Check className="w-3.5 h-3.5 text-[#174C37]" />
                      <span>Mark as read</span>
                    </button>
                  ) : (
                    <button
                      aria-label={`Mark "${item.title}" as unread`}
                      className="text-xs font-semibold text-[#7A685D] hover:underline cursor-pointer inline-flex items-center gap-1 min-h-[44px] px-2.5 py-1 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0] hover:bg-white transition-colors"
                      disabled={isPending}
                      onClick={() => handleMarkUnread(item.id)}
                      type="button"
                    >
                      <RotateCcw className="w-3 h-3 text-[#7A685D]" />
                      <span>Mark as unread</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Title */}
              <h4 className="font-bold text-[#3D291F] text-sm leading-snug">
                {item.title}
              </h4>

              {/* Body */}
              <p className="text-xs font-normal text-[#5C4638] leading-relaxed">
                {item.body}
              </p>

              {/* Bottom: Action link if href exists */}
              {item.href ? (
                <div className="pt-2 border-t border-[#E5DDD3] flex items-center justify-end">
                  <Link
                    className="text-xs font-bold text-[#174C37] hover:underline inline-flex items-center gap-1 min-h-[44px] px-2.5 py-1 rounded-lg hover:bg-[#FAF6F0] transition-colors"
                    href={item.href}
                  >
                    <span>Open Details</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default PersonalNotificationsCard;
