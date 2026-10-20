"use client";

import { Bell, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { signOutAction } from "@/app/actions";
import DashboardSearch from "@/components/dashboard-search";
import MobileAppMenu from "@/components/mobile-app-menu";
import {
  type AppNotification,
  NotificationsDrawer,
} from "@/components/notifications/notifications-drawer";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface NavigationItem {
  href: string;
  label: string;
}

interface AppHeaderProps {
  memberNavigationItems: NavigationItem[];
  unreadCount: number;
  initialNotifications?: AppNotification[];
  currentUserId?: string;
  searchData?: {
    announcements: { id: string; title: string }[];
    events: { id: string; title: string }[];
  };
  dashboard?: boolean;
}

export default function AppHeader({
  memberNavigationItems,
  unreadCount: initialUnreadCount,
  initialNotifications = [],
  currentUserId,
  searchData,
  dashboard = false,
}: AppHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] =
    useState<AppNotification[]>(initialNotifications);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // Optional Supabase Realtime listener for live alerts
  useEffect(() => {
    if (!currentUserId) return;

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`header-notifications:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const newRow = payload.new as unknown as AppNotification;
          setNotifications((prev) => [newRow, ...prev]);
          setUnreadCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <>
      <header className="app-sticky-header">
        {/* Left Side: Mobile Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 lg:hidden">
          <MobileAppMenu items={memberNavigationItems} showIcons={dashboard}>
            <form action={signOutAction} className="app-mobile-menu-signout">
              <button type="submit">Sign out</button>
            </form>
          </MobileAppMenu>
        </div>

        {/* Center: Search Omnibar */}
        <div className="flex-1 max-w-lg mx-2 sm:mx-4 hidden md:block">
          <DashboardSearch
            announcements={searchData?.announcements ?? []}
            events={searchData?.events ?? []}
            navigation={memberNavigationItems}
          />
        </div>

        {/* Right Side: Security Badge and Notification Bell */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-semibold text-[#174C37] bg-white/75 px-3 py-1.5 rounded-lg border border-[#E5DDD3] shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Private Portal</span>
          </div>

          {/* Interactive Fixed Notification Bell Button */}
          <button
            aria-label={`View notifications (${unreadCount} unread)`}
            className="relative p-2.5 text-[#3D291F] hover:text-[#174C37] hover:bg-white border border-[#E5DDD3] rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center transition-all bg-white/75 shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#174C37]"
            onClick={() => setIsDrawerOpen(true)}
            type="button"
          >
            <Bell className="w-4 h-4 text-[#3D291F]" />
            {unreadCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#BA3C2A] opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#BA3C2A] ring-2 ring-white" />
              </span>
            ) : null}
          </button>
        </div>
      </header>

      {/* Slide-over Notification Drawer */}
      <NotificationsDrawer
        isOpen={isDrawerOpen}
        notifications={notifications}
        onClose={() => setIsDrawerOpen(false)}
        onUnreadCountChange={(count) => setUnreadCount(count)}
      />
    </>
  );
}
