"use client";

import { Megaphone, Vote } from "lucide-react";
import Link from "next/link";

interface CommunicationsNavProps {
  activeScreen: "announcements" | "polls";
  unreadAnnouncementsCount: number;
  openPollsCount: number;
}

export function CommunicationsNav({
  activeScreen,
  unreadAnnouncementsCount,
  openPollsCount,
}: CommunicationsNavProps) {
  const isAnnouncements = activeScreen === "announcements";
  const isPolls = activeScreen === "polls";

  return (
    <nav
      aria-label="Communications Navigation"
      className="bg-white rounded-xl border border-[#E5DDD3] p-1.5 flex flex-wrap items-center gap-1.5 shadow-xs"
    >
      <Link
        href="/announcements"
        className={`cf-btn cf-btn--tab cf-btn--nav flex-1 sm:flex-initial ${
          isAnnouncements ? "cf-btn--tab-active" : ""
        }`}
        aria-current={isAnnouncements ? "page" : undefined}
      >
        <Megaphone
          className={`w-4 h-4 ${
            isAnnouncements ? "text-[#D6A23A]" : "text-[#7A685D]"
          }`}
        />
        <span>Announcements</span>
        {unreadAnnouncementsCount > 0 && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isAnnouncements
                ? "bg-[#D6A23A] text-[#3D291F]"
                : "bg-[#D6A23A]/20 text-[#8A641A]"
            }`}
          >
            {unreadAnnouncementsCount} unread
          </span>
        )}
      </Link>

      <Link
        href="/polls"
        className={`cf-btn cf-btn--tab cf-btn--nav flex-1 sm:flex-initial ${
          isPolls ? "cf-btn--tab-active" : ""
        }`}
        aria-current={isPolls ? "page" : undefined}
      >
        <Vote
          className={`w-4 h-4 ${isPolls ? "text-[#D6A23A]" : "text-[#7A685D]"}`}
        />
        <span>Polls</span>
        {openPollsCount > 0 && (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isPolls
                ? "bg-[#D6A23A] text-[#3D291F]"
                : "bg-[#174C37]/15 text-[#174C37]"
            }`}
          >
            {openPollsCount} open
          </span>
        )}
      </Link>
    </nav>
  );
}
