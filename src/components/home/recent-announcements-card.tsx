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

function cleanAnnouncementMessage(message: string): string {
  if (!message) return "";
  return message
    .replace(/^(?:🏳\uFE0F|🏳)*\s*OFFICIAL ANNOUNCEMENT:\s*/iu, "")
    .replace(/^OFFICIAL ANNOUNCEMENT:\s*/i, "")
    .trim();
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
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-[#3D291F]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Announcements
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Megaphone className="w-6 h-6 text-[#7A685D] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            Announcements Unavailable
          </h3>
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
        className="rounded-2xl bg-white border border-[#E5DDD3] p-5 shadow-xs"
      >
        <div className="flex items-center gap-2 mb-3">
          <Megaphone className="w-5 h-5 text-[#174C37]" />
          <h2
            className="text-base font-bold text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Announcements
          </h2>
        </div>
        <div className="p-6 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-center space-y-2">
          <Megaphone className="w-6 h-6 text-[#174C37] mx-auto" />
          <h3 className="text-sm font-bold text-[#3D291F]">
            No Announcements Published
          </h3>
          <p className="text-xs font-medium text-[#5C4638] max-w-sm mx-auto leading-relaxed">
            New announcements from club leadership will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="announcements-heading"
      className="rounded-2xl bg-white border border-[#E5DDD3] shadow-xs overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E5DDD3] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#174C37]" />
          <h2
            className="font-bold text-base text-[#3D291F]"
            id="announcements-heading"
          >
            Recent Announcements
          </h2>
        </div>

        <Link
          className="text-xs font-semibold text-[#174C37] hover:underline flex items-center gap-1"
          href="/announcements"
        >
          <span>View All</span>
          <span aria-hidden="true">›</span>
        </Link>
      </div>

      {/* Unified Tappable Rows */}
      <div className="divide-y divide-[#E5DDD3]/80">
        {rows.slice(0, 3).map((ann) => {
          const isUrgent = ann.priority === "urgent";
          const isImportant = ann.priority === "important";
          const cleanedText = cleanAnnouncementMessage(ann.message);
          const previewText = announcementPreview(cleanedText, 140);

          return (
            <button
              className="w-full text-left px-4 py-3 flex items-start justify-between gap-2.5 cursor-pointer hover:bg-[#FAF6F0]/60 transition-colors group"
              key={ann.id}
              onClick={() => onOpenAnnouncement(ann)}
              type="button"
            >
              {/* Left Column */}
              <div className="min-w-0 flex-1">
                {/* Top Meta Line: Optional URGENT/IMPORTANT badge + timestamp */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isUrgent ? (
                    <span className="px-1.5 py-0.5 rounded bg-[#BA3C2A]/10 text-[#BA3C2A] text-[9px] font-bold uppercase tracking-[0.12em]">
                      URGENT
                    </span>
                  ) : isImportant ? (
                    <span className="px-1.5 py-0.5 rounded bg-[#D6A23A]/15 text-[#8A641A] text-[9px] font-bold uppercase tracking-[0.12em]">
                      IMPORTANT
                    </span>
                  ) : null}
                  <span className="font-mono text-[11px] text-[#7A685D]">
                    {formatAnnouncementDate(ann.createdAt)}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mt-1 text-[13px] font-bold text-[#3D291F] group-hover:text-[#174C37] leading-snug transition-colors">
                  {ann.title}
                </h3>

                {/* Snippet with stripped prefix */}
                <p className="mt-0.5 text-xs text-[#5C4638] line-clamp-2 leading-relaxed">
                  {previewText}
                </p>
              </div>

              {/* Right Column: Subtle Chevron */}
              <ChevronRight className="w-4 h-4 text-[#7A685D] group-hover:text-[#174C37] shrink-0 mt-3 transition-colors" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default RecentAnnouncementsCard;
