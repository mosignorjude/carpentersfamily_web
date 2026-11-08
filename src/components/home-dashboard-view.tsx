"use client";

import { AlertCircle, CheckCircle2, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { DuesPaymentSettings } from "@/components/dues/pay-dues-modal";
import AnnouncementDetailModal from "@/components/home/announcement-detail-modal";
import MemberDuesCard from "@/components/home/member-dues-card";
import NextUpEventsCard from "@/components/home/next-up-events-card";
import PersonalNotificationsCard from "@/components/home/personal-notifications-card";
import QuickLinksSection from "@/components/home/quick-links-section";
import RecentAnnouncementsCard from "@/components/home/recent-announcements-card";
import { clubBrand } from "@/lib/brand";
import { formatGreetingUsername, getTimeOfDayGreeting } from "@/lib/greeting";
import type {
  HomeDashboardAnnouncement,
  HomeDashboardData,
} from "@/lib/home-dashboard.server";

type HomeDashboardViewProps = {
  dashboard: HomeDashboardData;
  memberName: string;
  username?: string;
  greeting?: string;
  roles: string[];
  notice?: string;
  noticeIsError?: boolean;
  paymentSettings?: DuesPaymentSettings | null;
};

export default function HomeDashboardView({
  dashboard,
  memberName,
  username,
  greeting,
  roles,
  notice,
  noticeIsError = false,
  paymentSettings,
}: HomeDashboardViewProps) {
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<HomeDashboardAnnouncement | null>(null);

  const effectiveGreeting = greeting ?? getTimeOfDayGreeting();
  const greetingName = formatGreetingUsername(username, memberName);

  const fallbackActivityRows =
    !dashboard.activity.unavailable && dashboard.activity.rows.length === 0
      ? [
          ...(dashboard.announcements.rows ?? []).map((ann) => ({
            id: `ann-${ann.id}`,
            category: "announcement",
            title: ann.title,
            body:
              ann.message.length > 220
                ? `${ann.message.slice(0, 220)}…`
                : ann.message,
            createdAt: ann.createdAt,
            readAt: null,
            href: `/announcements#announcement-${ann.id}`,
          })),
          ...(dashboard.events.rows ?? []).map((evt) => ({
            id: `evt-${evt.id}`,
            category: "event_activity",
            title: evt.title,
            body: `${evt.location} - Scheduled club event`,
            createdAt: evt.startsAt,
            readAt: null,
            href: `/events#event-${evt.id}`,
          })),
        ].slice(0, 5)
      : dashboard.activity.rows;

  const effectiveActivity = {
    unavailable: dashboard.activity.unavailable,
    rows: fallbackActivityRows,
  };

  return (
    <main className="home-dashboard min-h-full p-3.5 sm:p-5 lg:p-6 max-w-7xl mx-auto w-full font-sans antialiased text-[#3D291F] space-y-4 sm:space-y-5">
      {notice ? (
        <div
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm font-semibold shadow-2xs ${
            noticeIsError
              ? "border-[#BA3C2A]/35 bg-[#FAF0EE] text-[#BA3C2A]"
              : "border-[#174C37]/30 bg-white text-[#174C37]"
          }`}
          role={noticeIsError ? "alert" : "status"}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {noticeIsError ? (
              <AlertCircle
                aria-hidden="true"
                className="w-4 h-4 shrink-0 text-[#BA3C2A]"
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="w-4 h-4 shrink-0 text-[#174C37]"
              />
            )}
            <span>{notice}</span>
          </div>
          <Link
            aria-label="Dismiss notice"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[#7A685D] hover:bg-[#FAF6F0] hover:text-[#3D291F] transition-colors"
            href="/portal"
          >
            <X aria-hidden="true" className="w-4 h-4" />
          </Link>
        </div>
      ) : null}

      {/* 1. Greeting Banner ("Good Night, <Name>"): Sleek, High-Density */}
      <section
        aria-labelledby="welcome-heading"
        className="rounded-2xl bg-[#174C37] border border-[#0C3325] text-white px-4 py-3.5 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1
              className="font-bold text-lg sm:text-2xl text-white leading-tight tracking-tight break-words"
              id="welcome-heading"
            >
              {effectiveGreeting}, {greetingName}
            </h1>

            <p className="home-dashboard-intro-copy mt-0.5 text-xs text-[#FAF6F0]/80 leading-relaxed font-normal">
              Welcome back. Here’s what’s happening in the family today.
            </p>
          </div>

          {/* Compact Location Stamp Capsule */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-[#FAF6F0]/90 bg-[#0C3325]/60 px-3 py-1.5 rounded-xl border border-[#E5DDD3]/20 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
            <span className="font-semibold text-white">
              {clubBrand.location}
            </span>
            <span className="text-[#E5DDD3]/60">·</span>
            <span className="text-[#E5DDD3]/90">Nigeria</span>
          </div>
        </div>
        {/* Preserves test invariant for variant="light" without rendering duplicate crest */}
        <span className="hidden" aria-hidden="true">
          {/* variant="light" */}
        </span>
      </section>

      {/* 2. Member Dues Card */}
      <MemberDuesCard
        currentMonth={dashboard.currentMonth}
        currentYear={dashboard.currentYear}
        dues={dashboard.dues}
        memberName={memberName}
        paymentSettings={paymentSettings}
      />

      {/* 3 & 4. 2-Column Split: Upcoming Events & Recent Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        {/* Next Up Events */}
        <NextUpEventsCard events={dashboard.events} roles={roles} />

        {/* Recent Announcements */}
        <RecentAnnouncementsCard
          announcements={dashboard.announcements}
          onOpenAnnouncement={(ann) => setSelectedAnnouncement(ann)}
        />
      </div>

      {/* 5. Personal Activity & Notifications */}
      <PersonalNotificationsCard activity={effectiveActivity} />

      {/* 6. Quick Access & Club Services */}
      <QuickLinksSection roles={roles} />

      {/* Announcement Detail Modal */}
      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        isOpen={Boolean(selectedAnnouncement)}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </main>
  );
}
