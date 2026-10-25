"use client";

import { Bell, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions";
import DashboardSearch from "@/components/dashboard-search";
import MobileAppMenu from "@/components/mobile-app-menu";
import {
  type AppNotification,
  NotificationsDrawer,
} from "@/components/notifications/notifications-drawer";
import UserProfileBadge, {
  type UserProfileData,
} from "@/components/user-profile-badge";
import { clubBrand } from "@/lib/brand";
import {
  NOTIFICATION_SYNC_EVENT,
  type NotificationSyncPayload,
} from "@/lib/notification-sync";
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
  userProfile?: UserProfileData;
}

export default function AppHeader({
  memberNavigationItems,
  unreadCount: initialUnreadCount,
  initialNotifications = [],
  currentUserId,
  searchData,
  dashboard = false,
  userProfile,
}: AppHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] =
    useState<AppNotification[]>(initialNotifications);
  const notificationsRef = useRef<AppNotification[]>(initialNotifications);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    notificationsRef.current = initialNotifications;
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // Synchronize with read/unread mutations triggered from the Home card or drawer
  useEffect(() => {
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<NotificationSyncPayload>).detail;
      if (!detail) return;

      if (detail.kind === "mark-all-read") {
        const next = notificationsRef.current.map((n) =>
          n.read_at === null ? { ...n, read_at: detail.readAt } : n,
        );
        notificationsRef.current = next;
        setNotifications(next);
        setUnreadCount(0);
        return;
      }

      if (detail.kind === "mark-read") {
        const current = notificationsRef.current;
        const target = current.find((n) => n.id === detail.id);
        const shouldDecrement = !target || target.read_at === null;
        const next = current.map((n) =>
          n.id === detail.id ? { ...n, read_at: detail.readAt } : n,
        );
        notificationsRef.current = next;
        setNotifications(next);
        if (shouldDecrement) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return;
      }

      if (detail.kind === "mark-unread") {
        const current = notificationsRef.current;
        const target = current.find((n) => n.id === detail.id);
        const shouldIncrement = !target || target.read_at !== null;
        const next = current.map((n) =>
          n.id === detail.id ? { ...n, read_at: null } : n,
        );
        notificationsRef.current = next;
        setNotifications(next);
        if (shouldIncrement) {
          setUnreadCount((c) => c + 1);
        }
        return;
      }

      if (detail.kind === "delete") {
        const current = notificationsRef.current;
        const target = current.find((n) => n.id === detail.id);
        const shouldDecrement = Boolean(target && target.read_at === null);
        const next = current.filter((n) => n.id !== detail.id);
        notificationsRef.current = next;
        setNotifications(next);
        if (shouldDecrement) {
          setUnreadCount((c) => Math.max(0, c - 1));
        }
        return;
      }

      if (detail.kind === "delete-all") {
        notificationsRef.current = [];
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    window.addEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
    return () =>
      window.removeEventListener(NOTIFICATION_SYNC_EVENT, handleSync);
  }, []);

  // Optional Supabase Realtime listener for live alerts (INSERT + UPDATE, deduplicated)
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
          if (!newRow?.id) return;
          const current = notificationsRef.current;
          if (current.some((n) => n.id === newRow.id)) return;
          const next = [newRow, ...current];
          notificationsRef.current = next;
          setNotifications(next);
          if (newRow.read_at === null) {
            setUnreadCount((c) => c + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${currentUserId}`,
        },
        (payload: {
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        }) => {
          const updatedRow = payload.new as unknown as AppNotification;
          if (!updatedRow?.id) return;
          const current = notificationsRef.current;
          const existing = current.find((n) => n.id === updatedRow.id);
          if (existing) {
            if (existing.read_at === null && updatedRow.read_at !== null) {
              setUnreadCount((c) => Math.max(0, c - 1));
            } else if (
              existing.read_at !== null &&
              updatedRow.read_at === null
            ) {
              setUnreadCount((c) => c + 1);
            }
          }
          const next = current.map((n) =>
            n.id === updatedRow.id ? { ...n, ...updatedRow } : n,
          );
          notificationsRef.current = next;
          setNotifications(next);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
        },
        (payload: { old: Record<string, unknown> }) => {
          const deletedId = payload.old?.id;
          if (typeof deletedId !== "string") return;
          const current = notificationsRef.current;
          const existing = current.find((n) => n.id === deletedId);
          if (!existing) return;
          const next = current.filter((n) => n.id !== deletedId);
          notificationsRef.current = next;
          setNotifications(next);
          if (existing.read_at === null) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
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
        {/* Left Side: Mobile Menu & Mobile Brand Logo/Name */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="flex items-center lg:hidden">
            <MobileAppMenu items={memberNavigationItems} showIcons={dashboard}>
              <form action={signOutAction} className="app-mobile-menu-signout">
                <button type="submit">Sign out</button>
              </form>
            </MobileAppMenu>
          </div>

          <Link
            aria-label={`${clubBrand.shortName} home`}
            className="flex items-center gap-2 lg:hidden text-inherit no-underline focus-visible:outline-2 focus-visible:outline-[#174C37] rounded-lg"
            href="/"
          >
            {/* biome-ignore lint/performance/noImgElement: Next/Image adds an inline style rejected by the production CSP. */}
            <img
              alt=""
              className="w-[18px] h-[32px] object-contain shrink-0"
              height={32}
              src={clubBrand.logoSrc}
              width={18}
            />
            <span className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#3D291F] leading-tight">
                {clubBrand.shortName}
              </span>
            </span>
          </Link>
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
            aria-expanded={isDrawerOpen}
            aria-haspopup="dialog"
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

          {/* User Profile Badge (Desktop inline, mobile avatar dropdown) */}
          {userProfile && <UserProfileBadge user={userProfile} />}
        </div>
      </header>

      {/* Slide-over Notification Drawer */}
      <NotificationsDrawer
        isOpen={isDrawerOpen}
        notifications={notifications}
        onClose={() => setIsDrawerOpen(false)}
        onUnreadCountChange={(count) => setUnreadCount(count)}
        unreadCount={unreadCount}
      />
    </>
  );
}
