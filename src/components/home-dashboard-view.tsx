"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import ClubLogo from "@/components/club-logo";
import AnnouncementDetailModal from "@/components/home/announcement-detail-modal";
import MemberDuesCard from "@/components/home/member-dues-card";
import NextUpEventsCard from "@/components/home/next-up-events-card";
import PersonalNotificationsCard from "@/components/home/personal-notifications-card";
import QuickLinksSection from "@/components/home/quick-links-section";
import RecentAnnouncementsCard from "@/components/home/recent-announcements-card";
import { clubBrand } from "@/lib/brand";
import type {
  HomeDashboardAnnouncement,
  HomeDashboardData,
} from "@/lib/home-dashboard.server";

type HomeDashboardViewProps = {
  dashboard: HomeDashboardData;
  memberName: string;
  roles: string[];
  notice?: string;
};

export default function HomeDashboardView({
  dashboard,
  memberName,
  roles,
  notice: _notice,
}: HomeDashboardViewProps) {
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<HomeDashboardAnnouncement | null>(null);

  return (
    <div className="home-dashboard min-h-full p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full font-sans antialiased text-[#3D291F]">
      {/* Welcoming Family-Oriented Member Header */}
      <section
        aria-labelledby="welcome-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {/* Club Brand Emblem */}
            <div className="hidden sm:flex shrink-0 p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] items-center justify-center shadow-2xs">
              <ClubLogo size="md" variant="dark" />
            </div>

            <div>
              <h1
                className="font-bold text-[#3D291F] tracking-tight"
                id="welcome-heading"
              >
                Welcome, {memberName}
              </h1>

              <p className="home-dashboard-intro-copy mt-2 max-w-2xl text-xs leading-relaxed font-normal sm:text-sm">
                Peace and goodwill to you and your household. Here is your
                private overview of upcoming gatherings, club circulars, and
                personal dues status.
              </p>
            </div>
          </div>

          {/* Location Stamp Capsule */}
          <div className="hidden sm:block bg-[#FAF6F0] p-4 sm:p-5 rounded-xl border border-[#E5DDD3] lg:text-right shrink-0 space-y-1 shadow-2xs">
            <span className="text-xs font-semibold text-[#7A685D] block">
              Club Headquarters
            </span>
            <div className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-[#3D291F] tracking-tight justify-start lg:justify-end">
              <MapPin className="w-4 h-4 text-[#174C37] shrink-0" />
              <span>{clubBrand.location}</span>
            </div>
            <span className="text-xs font-semibold text-[#7A685D] block">
              Nigeria
            </span>
          </div>
        </div>
      </section>

      {/* 1. Signed-in Member's Own Dues Status (Private, month-by-month) */}
      <MemberDuesCard
        currentMonth={dashboard.currentMonth}
        currentYear={dashboard.currentYear}
        dues={dashboard.dues}
        memberName={memberName}
      />

      {/* 2. 2-Column Split: Next Up Scheduled Events & Recent Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Next Up Events */}
        <NextUpEventsCard events={dashboard.events} roles={roles} />

        {/* Recent Announcements */}
        <RecentAnnouncementsCard
          announcements={dashboard.announcements}
          onOpenAnnouncement={(ann) => setSelectedAnnouncement(ann)}
        />
      </div>

      {/* 3. Personal Activity & Notifications */}
      <PersonalNotificationsCard activity={dashboard.activity} />

      {/* 4. Quick Access & Club Services */}
      <QuickLinksSection roles={roles} />

      {/* Announcement Detail Modal */}
      <AnnouncementDetailModal
        announcement={selectedAnnouncement}
        isOpen={Boolean(selectedAnnouncement)}
        onClose={() => setSelectedAnnouncement(null)}
      />
    </div>
  );
}
