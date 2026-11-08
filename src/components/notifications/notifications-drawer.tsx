"use client";

import {
  Bell,
  Calendar,
  CheckCheck,
  Megaphone,
  MoreHorizontal,
  RotateCcw,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import {
  deleteAllNotificationsAsyncAction,
  deleteNotificationAsyncAction,
  markAllNotificationsReadAsyncAction,
  markNotificationReadAsyncAction,
  markNotificationUnreadAsyncAction,
} from "@/app/actions";
import { dispatchFlashCard } from "@/components/ui/flash-card";
import {
  getNotificationCategoryLabel,
  getNotificationHref,
  getNotificationTimestamp,
} from "@/lib/notification-page-presentation.mjs";
import {
  dispatchNotificationSync,
  NOTIFICATION_SYNC_EVENT,
  type NotificationSyncPayload,
} from "@/lib/notification-sync";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

export interface AppNotification {
  id: string;
  category: string;
  title: string;
  body: string;
  event_id: string | null;
  source_type?: string | null;
  source_id?: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount?: number;
  onUnreadCountChange?: (count: number) => void;
}

type FilterType = "all" | "unread" | "events" | "finance" | "members";

function getCategoryIcon(category: string) {
  if (category.includes("money") || category.includes("dues")) {
    return <Wallet className="w-3.5 h-3.5 text-[#8A641A]" />;
  }
  if (category.includes("event") || category.includes("attendance")) {
    return <Calendar className="w-3.5 h-3.5 text-[#174C37]" />;
  }
  if (category.includes("member")) {
    return <Users className="w-3.5 h-3.5 text-[#51376F]" />;
  }
  if (category.includes("poll")) {
    return <Megaphone className="w-3.5 h-3.5 text-[#174C37]" />;
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

function getTimeBucket(createdAt: string): "TODAY" | "YESTERDAY" | "EARLIER" {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "EARLIER";

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const time = date.getTime();

  if (time >= todayStart) {
    return "TODAY";
  }
  if (time >= yesterdayStart) {
    return "YESTERDAY";
  }
  return "EARLIER";
}

const BODY_TOKEN_REGEX =
  /(@[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*|₦[\d,]+(?:\.\d+)?)/g;

function formatNotificationBody(body: string) {
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

    const key = `token-${matchStart}`;
    if (matchText.startsWith("@")) {
      elements.push(
        <span
          className="font-mono text-xs font-semibold text-[#174C37] bg-[#174C37]/[0.07] px-1.5 py-0.5 rounded"
          key={key}
        >
          {matchText}
        </span>,
      );
    } else if (matchText.startsWith("₦")) {
      elements.push(
        <span className="font-mono font-semibold text-[#174C37]" key={key}>
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

function matchesFilter(
  notification: AppNotification,
  filter: FilterType,
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return notification.read_at === null;
  const cat = (notification.category || "").toLowerCase();
  if (filter === "events") {
    return cat.includes("event") || cat.includes("attendance");
  }
  if (filter === "finance") {
    return (
      cat.includes("money") || cat.includes("dues") || cat.includes("finance")
    );
  }
  if (filter === "members") {
    return (
      cat.includes("member") ||
      cat.includes("poll") ||
      cat.includes("announcement")
    );
  }
  return true;
}

const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "events", label: "Events" },
  { id: "finance", label: "Finance" },
  { id: "members", label: "Members" },
];

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications: initialList,
  unreadCount: externalUnreadCount,
  onUnreadCountChange,
}: NotificationsDrawerProps) {
  const [items, setItems] = useState<AppNotification[]>(initialList);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const titleId = useId();

  useEffect(() => {
    setItems(initialList);
  }, [initialList]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<NotificationSyncPayload>).detail;
      if (!detail) return;
      if (detail.kind === "mark-all-read") {
        setItems((prev) =>
          prev.map((n) =>
            n.read_at === null ? { ...n, read_at: detail.readAt } : n,
          ),
        );
      } else if (detail.kind === "mark-read") {
        setItems((prev) =>
          prev.map((n) =>
            n.id === detail.id ? { ...n, read_at: detail.readAt } : n,
          ),
        );
      } else if (detail.kind === "mark-unread") {
        setItems((prev) =>
          prev.map((n) => (n.id === detail.id ? { ...n, read_at: null } : n)),
        );
      } else if (detail.kind === "delete") {
        setItems((prev) => prev.filter((n) => n.id !== detail.id));
      } else if (detail.kind === "delete-all") {
        setItems([]);
      }
    };
    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
    return () =>
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
  }, []);

  // Close open action menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handleOutsideClick = () => setOpenMenuId(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [openMenuId]);

  useModalHygiene({ isOpen, onClose });

  if (!isOpen) return null;

  const listUnreadCount = items.filter((n) => n.read_at === null).length;
  const unreadCount =
    typeof externalUnreadCount === "number"
      ? externalUnreadCount
      : listUnreadCount;

  async function handleMarkAllRead() {
    if (isPending || unreadCount === 0) return;
    setIsPending(true);

    const prevItems = items;
    const prevUnread = unreadCount;
    const nowIso = new Date().toISOString();
    dispatchNotificationSync({ kind: "mark-all-read", readAt: nowIso });

    const result = await markAllNotificationsReadAsyncAction();
    if (!result?.ok) {
      setItems(prevItems);
      onUnreadCountChange?.(prevUnread);
      dispatchFlashCard({
        type: "error",
        title: "Update Failed",
        message: "Notifications could not be marked as read. Try again.",
      });
    }
    setIsPending(false);
  }

  async function handleMarkSingleRead(id: string) {
    if (isPending) return;
    setIsPending(true);
    const nowIso = new Date().toISOString();

    dispatchNotificationSync({ kind: "mark-read", id, readAt: nowIso });

    const result = await markNotificationReadAsyncAction(id);
    if (!result?.ok) {
      dispatchNotificationSync({ kind: "mark-unread", id });
      dispatchFlashCard({
        type: "error",
        title: "Update Failed",
        message: "The notification could not be marked as read. Try again.",
      });
    }
    setIsPending(false);
  }

  async function handleMarkSingleUnread(id: string) {
    if (isPending) return;
    setIsPending(true);
    const targetPrevReadAt =
      items.find((n) => n.id === id)?.read_at ?? new Date().toISOString();

    dispatchNotificationSync({ kind: "mark-unread", id });

    const result = await markNotificationUnreadAsyncAction(id);
    if (!result?.ok) {
      dispatchNotificationSync({
        kind: "mark-read",
        id,
        readAt: targetPrevReadAt,
      });
      dispatchFlashCard({
        type: "error",
        title: "Update Failed",
        message: "The notification could not be marked as unread. Try again.",
      });
    }
    setIsPending(false);
  }

  async function handleDeleteSingle(id: string) {
    if (isPending) return;
    setIsPending(true);
    const prevItems = items;
    const prevUnread = unreadCount;

    dispatchNotificationSync({ kind: "delete", id });

    const result = await deleteNotificationAsyncAction(id);
    if (!result?.ok) {
      setItems(prevItems);
      onUnreadCountChange?.(prevUnread);
      dispatchFlashCard({
        type: "error",
        title: "Delete Failed",
        message: "The notification could not be deleted. Try again.",
      });
    }
    setIsPending(false);
  }

  async function handleDeleteAll(skipConfirm = false) {
    if (isPending || items.length === 0) return;
    if (
      !skipConfirm &&
      typeof window !== "undefined" &&
      !window.confirm("Clear all notifications? This action cannot be undone.")
    ) {
      return;
    }

    setIsPending(true);
    setConfirmClearAll(false);
    const prevItems = items;
    const prevUnread = unreadCount;

    dispatchNotificationSync({ kind: "delete-all" });

    const result = await deleteAllNotificationsAsyncAction();
    if (!result?.ok) {
      setItems(prevItems);
      onUnreadCountChange?.(prevUnread);
      dispatchFlashCard({
        type: "error",
        title: "Clear All Failed",
        message: "Notifications could not be cleared. Try again.",
      });
    }
    setIsPending(false);
  }

  function handleAlertClick(notification: AppNotification) {
    if (notification.read_at === null) {
      const nowIso = new Date().toISOString();
      dispatchNotificationSync({
        kind: "mark-read",
        id: notification.id,
        readAt: nowIso,
      });
      void markNotificationReadAsyncAction(notification.id);
    }
    const href = getNotificationHref(notification);
    if (href) {
      router.push(href);
    }
    onClose();
  }

  const filterCounts: Record<FilterType, number> = {
    all: items.length,
    unread: items.filter((n) => n.read_at === null).length,
    events: items.filter((n) => matchesFilter(n, "events")).length,
    finance: items.filter((n) => matchesFilter(n, "finance")).length,
    members: items.filter((n) => matchesFilter(n, "members")).length,
  };

  const filteredItems = items.filter((item) =>
    matchesFilter(item, activeFilter),
  );

  const todayItems = filteredItems.filter(
    (n) => getTimeBucket(n.created_at) === "TODAY",
  );
  const yesterdayItems = filteredItems.filter(
    (n) => getTimeBucket(n.created_at) === "YESTERDAY",
  );
  const earlierItems = filteredItems.filter(
    (n) => getTimeBucket(n.created_at) === "EARLIER",
  );

  const timeBuckets = [
    { label: "TODAY", items: todayItems },
    { label: "YESTERDAY", items: yesterdayItems },
    { label: "EARLIER", items: earlierItems },
  ].filter((b) => b.items.length > 0);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
    >
      {/* Backdrop */}
      <button
        aria-label="Close drawer backdrop"
        className="fixed inset-0 bg-[#0C3325]/45 backdrop-blur-xs w-full h-full border-0 p-0 cursor-default animate-in fade-in duration-200"
        onClick={onClose}
        type="button"
      />

      {/* Drawer Panel */}
      <aside className="relative z-10 bg-[#FAF6F0] w-full max-w-md h-full flex flex-col shadow-2xl border-l border-[#E5DDD3] animate-in slide-in-from-right duration-250">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5DDD3] bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-2xs">
              <Bell className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <div>
              <h2
                className="text-base font-bold text-[#3D291F] tracking-tight leading-snug"
                id={titleId}
              >
                Notifications
              </h2>
              <p className="text-xs text-[#7A685D]">
                {unreadCount > 0 ? (
                  <span className="font-semibold text-[#174C37]">
                    {unreadCount} unread
                  </span>
                ) : (
                  <span>All caught up</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                className="text-xs text-[#174C37] hover:text-[#0E3325] hover:underline flex items-center gap-1 font-bold px-2.5 py-1 min-h-[44px] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            {items.length > 0 && !confirmClearAll && (
              <button
                aria-label="Clear all notifications"
                className="text-xs text-[#BA3C2A] hover:text-[#962D1E] hover:underline flex items-center gap-1 font-bold px-2.5 py-1 min-h-[44px] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                disabled={isPending}
                onClick={() => setConfirmClearAll(true)}
                type="button"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all</span>
              </button>
            )}
            <button
              aria-label="Close notifications"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#FAF6F0] transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2-Step Confirmation Strip for Clear All */}
        {confirmClearAll && (
          <div className="px-4 py-2.5 bg-[#FDF2F0] border-b border-[#F4C7C2] flex items-center justify-between gap-3 text-xs shrink-0 animate-in fade-in duration-150">
            <span className="font-semibold text-[#BA3C2A]">
              Clear all notifications?
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="px-2.5 py-1 rounded-md bg-[#BA3C2A] text-white font-bold hover:bg-[#962D1E] transition-colors cursor-pointer disabled:opacity-50 text-xs"
                disabled={isPending}
                onClick={() => {
                  void handleDeleteAll(true);
                }}
                type="button"
              >
                Clear all
              </button>
              <button
                className="px-2.5 py-1 rounded-md text-[#7A685D] hover:text-[#3D291F] hover:bg-[#FAF6F0] transition-colors cursor-pointer text-xs font-semibold"
                disabled={isPending}
                onClick={() => setConfirmClearAll(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Horizontal Scrollable Filter Pill Bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto border-b border-[#E5DDD3] bg-[#FAF6F0] shrink-0 no-scrollbar">
          {FILTER_TABS.map((tab) => {
            const isActive = activeFilter === tab.id;
            const count = filterCounts[tab.id];
            return (
              <button
                className={`px-3.5 py-2 min-h-[44px] rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#174C37] text-white shadow-2xs"
                    : "bg-white/80 text-[#5C4638] hover:bg-white hover:text-[#3D291F] border border-[#E5DDD3]"
                }`}
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                type="button"
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[#174C37]/10 text-[#174C37]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notifications List grouped into Time Buckets */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-white border border-[#E5DDD3] mx-auto flex items-center justify-center text-[#B8ACA0] shadow-2xs">
                <Bell className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-[#3D291F]">
                No notifications
              </p>
              <p className="text-xs text-[#7A685D] max-w-xs mx-auto">
                New announcements, dues updates, and meeting reminders will
                appear here.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <div className="w-10 h-10 rounded-full bg-white border border-[#E5DDD3] mx-auto flex items-center justify-center text-[#B8ACA0] shadow-2xs">
                <Bell className="w-4 h-4" />
              </div>
              <p className="text-sm font-bold text-[#3D291F]">
                No {activeFilter === "unread" ? "unread" : activeFilter}{" "}
                notifications
              </p>
              <p className="text-xs text-[#7A685D] max-w-xs mx-auto">
                There are no notifications matching this filter.
              </p>
              <button
                className="mt-2 text-xs font-semibold text-[#174C37] hover:underline cursor-pointer"
                onClick={() => setActiveFilter("all")}
                type="button"
              >
                View all notifications
              </button>
            </div>
          ) : (
            timeBuckets.map((bucket) => (
              <div className="space-y-2" key={bucket.label}>
                <div className="px-1 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A685D]">
                    {bucket.label}
                  </span>
                </div>

                <div className="space-y-2">
                  {bucket.items.map((notification) => {
                    const isUnread = notification.read_at === null;
                    const timestamp = getNotificationTimestamp(
                      notification.created_at,
                    );
                    const shortTimeAgo = formatShortTimeAgo(
                      notification.created_at,
                    );
                    const categoryLabel = getNotificationCategoryLabel(
                      notification.category,
                    );

                    return (
                      <article
                        className={`relative rounded-xl border transition-all px-3.5 py-3 ${
                          isUnread
                            ? "bg-white border-[#174C37]/35 shadow-xs cursor-pointer"
                            : "bg-white/80 border-[#E5DDD3] hover:bg-white cursor-pointer"
                        }`}
                        key={notification.id}
                        onClick={() => handleAlertClick(notification)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAlertClick(notification);
                          }
                        }}
                      >
                        {/* Unread Left Accent Bar */}
                        {isUnread && (
                          <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[#174C37]" />
                        )}

                        <div className="flex items-start gap-3">
                          {/* Left Category Icon Box with Unread Ochre Dot */}
                          <div className="relative w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] grid place-items-center shrink-0 mt-0.5">
                            {getCategoryIcon(notification.category)}
                            {isUnread && (
                              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D6A23A] ring-2 ring-white" />
                            )}
                          </div>

                          {/* Right Content Column */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1: Category Eyebrow + Inline Timestamp + Single Action Menu Button */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#174C37] truncate">
                                  {categoryLabel}
                                </span>
                                <span className="text-[#E5DDD3]">·</span>
                                <time
                                  className="font-mono text-[11px] text-[#7A685D] shrink-0"
                                  dateTime={timestamp.dateTime}
                                >
                                  {shortTimeAgo}
                                </time>
                              </div>

                              <div className="relative">
                                <button
                                  aria-label="Notification actions"
                                  className="w-7 h-7 rounded-lg text-[#7A685D] hover:text-[#3D291F] hover:bg-[#FAF6F0] grid place-items-center transition-colors cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId((prev) =>
                                      prev === notification.id
                                        ? null
                                        : notification.id,
                                    );
                                  }}
                                  type="button"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>

                                {/* Action Menu Dropdown */}
                                {openMenuId === notification.id && (
                                  <div
                                    aria-orientation="vertical"
                                    className="absolute right-0 top-8 z-30 w-36 rounded-xl bg-white border border-[#E5DDD3] shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                      }
                                    }}
                                    role="menu"
                                    tabIndex={-1}
                                  >
                                    {isUnread ? (
                                      <button
                                        className="w-full text-left px-3 py-1.5 text-xs text-[#174C37] hover:bg-[#FAF6F0] font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        disabled={isPending}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(null);
                                          void handleMarkSingleRead(
                                            notification.id,
                                          );
                                        }}
                                        role="menuitem"
                                        type="button"
                                      >
                                        <CheckCheck className="w-3.5 h-3.5" />
                                        <span>Mark as read</span>
                                      </button>
                                    ) : (
                                      <button
                                        className="w-full text-left px-3 py-1.5 text-xs text-[#5C4638] hover:bg-[#FAF6F0] font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        disabled={isPending}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(null);
                                          void handleMarkSingleUnread(
                                            notification.id,
                                          );
                                        }}
                                        role="menuitem"
                                        type="button"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Mark unread</span>
                                      </button>
                                    )}
                                    <button
                                      className="w-full text-left px-3 py-1.5 text-xs text-[#BA3C2A] hover:bg-[#FAF6F0] font-medium flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                      disabled={isPending}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuId(null);
                                        void handleDeleteSingle(
                                          notification.id,
                                        );
                                      }}
                                      role="menuitem"
                                      type="button"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Delete</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Row 2: Title */}
                            <h3
                              className={`mt-0.5 text-sm leading-snug ${
                                isUnread
                                  ? "font-bold text-[#3D291F]"
                                  : "font-semibold text-[#5C4638]"
                              }`}
                            >
                              {notification.title}
                            </h3>

                            {/* Row 3: Body Copy with Highlighted @handles and ₦ amounts */}
                            <p className="mt-1 text-xs text-[#5C4638] leading-relaxed">
                              {formatNotificationBody(notification.body)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3 border-t border-[#E5DDD3] bg-white flex items-center justify-between text-xs text-[#7A685D] shrink-0">
          <span className="font-medium text-[#7A685D]">
            Private Member Portal
          </span>
          <span className="text-[11px] font-mono text-[#A8988B]">
            {items.length}{" "}
            {items.length === 1 ? "notification" : "notifications"}
          </span>
        </div>
      </aside>
    </div>
  );
}

export default NotificationsDrawer;
