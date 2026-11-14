"use client";

import { AlertCircle, Megaphone, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { markAnnouncementReadInlineAction } from "@/app/actions";
import {
  AnnouncementArchiveSection,
  AnnouncementDraftsSection,
} from "./announcement-archive-section";
import { AnnouncementCard } from "./announcement-card";
import { CommunicationsNav } from "./communications-nav";
import { CommunicationsPrivacyBanner } from "./communications-privacy-banner";
import type {
  AnnouncementArchiveItem,
  AnnouncementDraftItem,
  AnnouncementItem,
  EventOption,
} from "./communications-types";
import { PublishAnnouncementDisclosure } from "./publish-announcement-disclosure";

interface AnnouncementsPageViewProps {
  announcements: AnnouncementItem[];
  drafts?: AnnouncementDraftItem[];
  archivedAnnouncements?: AnnouncementArchiveItem[];
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
  drafts = [],
  archivedAnnouncements = [],
  unreadAnnouncementsCount,
  openPollsCount,
  globalPublisher,
  publishEvents,
  notice: _notice,
  errorMessage,
  historyUnavailableMessage,
}: AnnouncementsPageViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<
    "all" | "club_wide" | "event" | "archive"
  >("all");
  const [optimisticReadIds, setOptimisticReadIds] = useState<string[]>([]);
  const [markReadError, setMarkReadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canAccessArchive = globalPublisher || publishEvents.length > 0;
  const readSet = useMemo(
    () => new Set(optimisticReadIds),
    [optimisticReadIds],
  );

  const effectiveAnnouncements = useMemo(
    () =>
      announcements.map((ann) =>
        readSet.has(ann.id) ? { ...ann, isRead: true } : ann,
      ),
    [announcements, readSet],
  );

  const optimisticNewReadsCount = useMemo(
    () =>
      announcements.filter((ann) => !ann.isRead && readSet.has(ann.id)).length,
    [announcements, readSet],
  );
  const effectiveUnreadCount = Math.max(
    0,
    unreadAnnouncementsCount - optimisticNewReadsCount,
  );

  function handleMarkAsRead(announcementId: string) {
    setMarkReadError(null);
    setOptimisticReadIds((previous) =>
      previous.includes(announcementId)
        ? previous
        : [...previous, announcementId],
    );

    startTransition(async () => {
      const result = await markAnnouncementReadInlineAction(announcementId);
      if (!result.ok) {
        setOptimisticReadIds((previous) =>
          previous.filter((id) => id !== announcementId),
        );
        setMarkReadError(
          result.error ?? "Could not mark announcement as read right now.",
        );
      }
    });
  }

  const filteredAnnouncements = useMemo(() => {
    if (scopeFilter === "archive") return [];
    return effectiveAnnouncements.filter((ann) => {
      if (scopeFilter === "club_wide" && ann.eventId !== null) return false;
      if (scopeFilter === "event" && ann.eventId === null) return false;

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
  }, [effectiveAnnouncements, scopeFilter, searchQuery]);

  const filteredArchived = useMemo(() => {
    if (!searchQuery.trim()) return archivedAnnouncements;
    const query = searchQuery.toLowerCase();
    return archivedAnnouncements.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.message.toLowerCase().includes(query) ||
        (item.eventTitle?.toLowerCase().includes(query) ?? false),
    );
  }, [archivedAnnouncements, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Sub-Navigation */}
      <CommunicationsNav
        activeScreen="announcements"
        unreadAnnouncementsCount={effectiveUnreadCount}
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
      </div>

      {/* Error or History Unavailable Banners */}
      {(errorMessage || markReadError) && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-[#8B261E] flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-[#8B261E] shrink-0" />
          <span>{markReadError ?? errorMessage}</span>
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

      {/* Drafts Section (if authorized and drafts exist) */}
      {canAccessArchive && drafts.length > 0 && (
        <AnnouncementDraftsSection
          drafts={drafts}
          globalPublisher={globalPublisher}
        />
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Scope segmented tabs */}
        <div className="bg-white rounded-lg border border-[#E5DDD3] p-1 flex flex-wrap items-center gap-1 self-start sm:self-auto">
          {[
            { id: "all", label: `All (${announcements.length})` },
            {
              id: "club_wide",
              label: `Club-Wide (${announcements.filter((a) => !a.eventId).length})`,
            },
            {
              id: "event",
              label: `Events (${announcements.filter((a) => Boolean(a.eventId)).length})`,
            },
            ...(canAccessArchive
              ? [
                  {
                    id: "archive",
                    label: `Archive (${archivedAnnouncements.length})`,
                  },
                ]
              : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setScopeFilter(
                  tab.id as "all" | "club_wide" | "event" | "archive",
                )
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
            placeholder="Search announcements..."
            className="w-full min-h-[44px] pl-8 pr-3 py-1.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] placeholder-[#7A685D] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
          />
        </div>
      </div>

      {/* Announcements List or Archive View */}
      {scopeFilter === "archive" && canAccessArchive ? (
        <AnnouncementArchiveSection archivedAnnouncements={filteredArchived} />
      ) : filteredAnnouncements.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5DDD3] p-12 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-[#7A685D] mx-auto opacity-40" />
          <h2 className="text-base font-bold text-[#3D291F]">
            No Announcements Yet
          </h2>
          <p className="text-xs text-[#7A685D] max-w-md mx-auto">
            Club notices and event updates will appear here once published.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAnnouncements.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              globalPublisher={globalPublisher}
              onMarkAsRead={handleMarkAsRead}
            />
          ))}
        </div>
      )}

      {/* Page Footer Policy */}
      <footer className="pt-4 border-t border-[#E5DDD3]/75 space-y-4">
        <CommunicationsPrivacyBanner view="announcements" />
      </footer>
    </div>
  );
}
