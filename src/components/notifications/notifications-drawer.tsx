"use client";

import {
  Bell,
  Calendar,
  CheckCheck,
  ChevronRight,
  Megaphone,
  RotateCcw,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
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

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications: initialList,
  unreadCount: externalUnreadCount,
  onUnreadCountChange,
}: NotificationsDrawerProps) {
  const [items, setItems] = useState<AppNotification[]>(initialList);
  const [isPending, setIsPending] = useState(false);
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
      }
    };
    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
    return () =>
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
  }, []);

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
                    {unreadCount} unread alert{unreadCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span>All alerts caught up</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                className="text-xs text-[#174C37] hover:text-[#0E3325] hover:underline flex items-center gap-1 font-bold px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                disabled={isPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              aria-label="Close notifications"
              className="p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#FAF6F0] transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-white border border-[#E5DDD3] mx-auto flex items-center justify-center text-[#B8ACA0] shadow-2xs">
                <Bell className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-[#3D291F]">
                No notifications
              </p>
              <p className="text-xs text-[#7A685D] max-w-xs mx-auto">
                When official circulars, dues updates, or meeting reminders are
                posted, they will appear here.
              </p>
            </div>
          ) : (
            items.map((notification) => {
              const isUnread = notification.read_at === null;
              const timestamp = getNotificationTimestamp(
                notification.created_at,
              );
              const categoryLabel = getNotificationCategoryLabel(
                notification.category,
              );
              const href = getNotificationHref(notification);

              return (
                <div
                  className={`p-3.5 rounded-xl border transition-all text-xs space-y-2 ${
                    isUnread
                      ? "bg-white border-[#174C37]/35 shadow-xs"
                      : "bg-white/60 border-[#E5DDD3] opacity-85 hover:opacity-100"
                  }`}
                  key={notification.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="p-1 rounded bg-[#FAF6F0] border border-[#E5DDD3] shrink-0">
                        {getCategoryIcon(notification.category)}
                      </span>
                      <span className="font-bold text-[11px] uppercase tracking-wider text-[#174C37] truncate">
                        {categoryLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isUnread ? (
                        <button
                          className="text-[11px] text-[#174C37] hover:underline font-bold disabled:opacity-50"
                          disabled={isPending}
                          onClick={() => handleMarkSingleRead(notification.id)}
                          type="button"
                        >
                          Mark read
                        </button>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-[11px] text-[#5C4638] hover:text-[#174C37] hover:underline font-semibold disabled:opacity-50"
                          disabled={isPending}
                          onClick={() =>
                            handleMarkSingleUnread(notification.id)
                          }
                          type="button"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Mark unread</span>
                        </button>
                      )}
                      <span className="text-[10px] text-[#8C7D73] font-mono">
                        {timestamp.label}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-[#3D291F] text-xs leading-snug">
                    {notification.title}
                  </h3>

                  <p className="text-[#5C4638] text-xs leading-relaxed">
                    {notification.body}
                  </p>

                  <div className="pt-1.5 flex items-center justify-between border-t border-[#E5DDD3]/60 text-[11px]">
                    <Link
                      className="inline-flex items-center gap-1 font-bold text-[#174C37] hover:underline"
                      href={href}
                      onClick={onClose}
                    >
                      <span>Open related page</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>

                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isUnread
                          ? "bg-[#174C37]/15 text-[#174C37]"
                          : "bg-[#E5DDD3]/80 text-[#7A685D]"
                      }`}
                    >
                      {isUnread ? "Unread" : "Read"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Drawer Footer */}
        <div className="p-3.5 border-t border-[#E5DDD3] bg-white flex items-center justify-between text-xs text-[#54433A] shrink-0">
          <span className="font-medium text-[#7A685D]">
            Private Member Portal
          </span>
          <button
            type="button"
            className="font-semibold text-[#174C37] hover:underline cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

export default NotificationsDrawer;
