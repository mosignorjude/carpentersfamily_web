"use client";

import { AlertCircle, Megaphone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AnnouncementCard } from "./announcement-card";
import { CommunicationsNav } from "./communications-nav";
import { CommunicationsPrivacyBanner } from "./communications-privacy-banner";
import type { AnnouncementItem, EventOption } from "./communications-types";
import { PublishAnnouncementDisclosure } from "./publish-announcement-disclosure";

interface AnnouncementsPageViewProps {
  announcements: AnnouncementItem[];
  unreadAnnouncementsCount: number;
  openPollsCount: number;
  globalPublisher: boolean;
  publishEvents: EventOption[];
  notice?: string;
  errorMessage?: string;
  historyUnavailableMessage?: string;
}

export function AnnouncementsPageView({
  announcements,
  unreadAnnouncementsCount,
  openPollsCount,
  globalPublisher,
  publishEvents,
  notice: _notice,
  errorMessage,
  historyUnavailableMessage,
}: AnnouncementsPageViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "club_wide" | "event">(
    "all",
  );

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((ann) => {
      // Scope filter
      if (scopeFilter === "club_wide" && ann.eventId !== null) return false;
      if (scopeFilter === "event" && ann.eventId === null) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = ann.title.toLowerCase().includes(query);
        const matchesMessage = ann.message.toLowerCase().includes(query);
        const matchesEvent =
          ann.eventTitle?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesMessage && !matchesEvent) return false;
      }

      return true;
    });
  }, [announcements, scopeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <CommunicationsNav
        activeScreen="announcements"
        unreadAnnouncementsCount={unreadAnnouncementsCount}
        openPollsCount={openPollsCount}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#3D291F] tracking-tight">
            Announcements
          </h1>
          <p className="text-sm text-[#7A685D] mt-1 max-w-2xl">
            Club notices and event updates for active members.
          </p>
        </div>

        <span className="text-[11px] px-2.5 py-1 rounded-md bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3] self-start sm:self-auto font-medium">
          Official Club Notices
        </span>
      </div>

      {/* Privacy Banner */}
      <CommunicationsPrivacyBanner view="announcements" />

      {/* Error or History Unavailable Banners */}
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#8B261E] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#8B261E] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {historyUnavailableMessage && (
        <div
          role="status"
          className="p-3.5 bg-[#FFF8E6] border border-[#D6A23A]/50 rounded-xl text-xs text-[#8A641A] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#D6A23A] shrink-0" />
          <span>{historyUnavailableMessage}</span>
        </div>
      )}

      {/* Publishing Tool Disclosure (if authorized) */}
      {(globalPublisher || publishEvents.length > 0) && (
        <PublishAnnouncementDisclosure
          globalPublisher={globalPublisher}
          publishEvents={publishEvents}
        />
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Scope segmented tabs */}
        <div className="bg-white rounded-lg border border-[#E5DDD3] p-1 flex items-center gap-1 self-start sm:self-auto">
          {[
            { id: "all", label: `All Notices (${announcements.length})` },
            {
              id: "club_wide",
              label: `Club-Wide (${announcements.filter((a) => !a.eventId).length})`,
            },
            {
              id: "event",
              label: `Event Updates (${announcements.filter((a) => Boolean(a.eventId)).length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setScopeFilter(tab.id as "all" | "club_wide" | "event")
              }
              className={`cf-btn cf-btn--compact cf-btn--tab ${
                scopeFilter === tab.id ? "cf-btn--tab-active" : ""
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search circulars..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] placeholder-[#7A685D] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5DDD3] p-12 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-[#7A685D] mx-auto opacity-40" />
          <h2 className="text-base font-bold text-[#3D291F]">
            There are no announcements yet
          </h2>
          <p className="text-xs text-[#7A685D] max-w-md mx-auto">
            Club circulars, executive welfare notices, and event updates will
            appear here once published.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
            />
          ))}
        </div>
      )}
    </div>
  );
}
