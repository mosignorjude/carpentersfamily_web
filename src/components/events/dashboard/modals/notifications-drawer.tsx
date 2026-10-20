"use client";

import { Bell, CheckCheck, X } from "lucide-react";
import type { DashboardNotification } from "../dashboard-types";

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: DashboardNotification[];
  onMarkAllAsRead: () => void;
  onToggleRead: (id: string) => void;
}

export function NotificationsDrawer({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onToggleRead,
}: NotificationsDrawerProps) {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      aria-labelledby="notif-drawer-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-[#0C3325]/50 backdrop-blur-xs"
      role="dialog"
    >
      <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl border-l border-[#E5DDD3]">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#174C37] text-white flex items-center justify-center">
              <Bell className="w-4 h-4 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="notif-drawer-title"
              >
                Event Notifications
              </h3>
              <p className="text-xs text-[#7A685D]">
                {unreadCount} unread alert{unreadCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                className="text-xs text-[#174C37] hover:underline flex items-center gap-1 font-semibold"
                onClick={onMarkAllAsRead}
                type="button"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              aria-label="Close notifications drawer"
              className="p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors"
              onClick={onClose}
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-[#FAF6F0]">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-[#7A685D] text-xs">
              No new event notifications.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                className={`pt-3 first:pt-0 p-3 rounded-xl border transition-colors ${
                  n.read
                    ? "bg-white border-[#E5DDD3]/70 opacity-80"
                    : "bg-[#FAF6F0] border-[#174C37]/30 shadow-xs"
                }`}
                key={n.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-xs text-[#3D291F] leading-snug">
                    {n.title}
                  </h4>
                  <button
                    className="text-[10px] text-[#174C37] hover:underline font-semibold shrink-0"
                    onClick={() => onToggleRead(n.id)}
                    type="button"
                  >
                    {n.read ? "Mark unread" : "Mark read"}
                  </button>
                </div>
                <p className="text-xs text-[#5C4638] mt-1 leading-relaxed">
                  {n.message}
                </p>
                <span className="text-[10px] text-[#7A685D] font-mono mt-2 block">
                  {n.timestamp}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0] text-center text-xs text-[#7A685D]">
          <span>Real-time Event Alert Dispatcher</span>
        </div>
      </div>
    </div>
  );
}
