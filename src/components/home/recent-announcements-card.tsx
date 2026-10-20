"use client";

import { ChevronRight, Megaphone } from "lucide-react";
import Link from "next/link";
import { announcementPreview } from "@/lib/home-dashboard.mjs";
import type { HomeDashboardAnnouncement } from "@/lib/home-dashboard.server";

function formatAnnouncementDate(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

interface RecentAnnouncementsCardProps {
  announcements: {
    unavailable: boolean;
    rows: HomeDashboardAnnouncement[];
  };
  onOpenAnnouncement: (announcement: HomeDashboardAnnouncement) => void;
}

export function RecentAnnouncementsCard({
  announcements,
  onOpenAnnouncement,
}: RecentAnnouncementsCardProps) {
  if (announcements.unavailable) {
    return (
      <section
        aria-labelledby="announcements-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-[#3D291F]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Club Announcements
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Megaphone className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            Announcements Unavailable
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            Announcements could not be loaded at this time. Please check back
            shortly.
          </p>
        </div>
      </section>
    );
  }

  const rows = announcements.rows ?? [];

  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="announcements-heading"
        className="bg-white rounded-xl border border-[#E5DDD3] p-6 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-[#174C37]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Club Announcements
          </h3>
        </div>
        <div className="p-8 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Megaphone className="w-6 h-6 text-[#174C37] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Announcements Published
          </h4>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            There are no active general circulars or executive announcements at
            this time.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="announcements-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-6 sm:p-7 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-[#174C37]" />
          <h3
            className="text-lg font-bold text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Club Announcements
          </h3>
        </div>

        <Link
          className="text-xs text-[#174C37] font-bold hover:underline flex items-center gap-1"
          href="/announcements"
        >
          <span>View All</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {rows.slice(0, 3).map((ann) => (
          <div
            className="p-5 rounded-xl border border-[#E5DDD3] bg-white hover:border-[#174C37]/50 transition-colors shadow-2xs space-y-2"
            key={ann.id}
          >
            {/* Metadata row */}
            <div className="flex items-center justify-between text-xs gap-2 mb-1">
              <div className="flex items-center gap-2 truncate">
                {ann.priority === "urgent" || ann.priority === "important" ? (
                  <>
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        ann.priority === "urgent"
                          ? "text-[#BA3C2A]"
                          : "text-[#D6A23A]"
                      }`}
                    >
                      {ann.priority === "urgent" ? "Urgent" : "Important"}
                    </span>
                    <span aria-hidden="true" className="text-[#B8ACA0]">
                      ·
                    </span>
                  </>
                ) : null}
                <span className="font-mono text-xs font-semibold text-[#7A685D] shrink-0">
                  {formatAnnouncementDate(ann.createdAt)}
                </span>
              </div>
            </div>

            {/* Title & Excerpt */}
            <h4 className="text-sm font-bold text-[#3D291F] leading-snug">
              {ann.title}
            </h4>
            <p className="text-xs font-normal text-[#5C4638] mt-1 leading-relaxed line-clamp-2">
              {announcementPreview(ann.message, 140)}
            </p>

            {/* Read More button */}
            <div className="mt-3 pt-2.5 border-t border-[#E5DDD3] flex items-center justify-end text-xs">
              <button
                className="text-xs font-semibold text-[#174C37] hover:underline inline-flex items-center gap-1 min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[#FAF6F0]"
                onClick={() => onOpenAnnouncement(ann)}
                type="button"
              >
                <span>Read Full Notice</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RecentAnnouncementsCard;
