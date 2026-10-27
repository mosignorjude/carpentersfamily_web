"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  History,
  Layers,
} from "lucide-react";
import { useEffect, useState } from "react";
import { markAnnouncementReadAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import { AnnouncementEditModal } from "./announcement-edit-modal";
import type { AnnouncementItem } from "./communications-types";

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatWAT(isoDate: string) {
  try {
    return dateFormatter.format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

interface AnnouncementCardProps {
  announcement: AnnouncementItem;
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRevisionsOpen, setIsRevisionsOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: close modal when announcement revision updates
  useEffect(() => {
    setIsEditOpen(false);
  }, [announcement.revisionNumber, announcement.updatedAt]);

  const priorityBadges = {
    standard: {
      label: "Standard Notice",
      className: "bg-neutral-100 text-[#5C4638] border-neutral-200",
    },
    important: {
      label: "Important Notice",
      className:
        "bg-[#D6A23A]/15 text-[#8A641A] border-[#D6A23A]/40 font-semibold",
    },
    urgent: {
      label: "Urgent Alert",
      className: "bg-[#8B261E]/10 text-[#8B261E] border-[#8B261E]/30 font-bold",
    },
  };

  const priorityConfig =
    priorityBadges[announcement.priority] ?? priorityBadges.standard;
  const isUnread = !announcement.isRead && !announcement.readStatusUnavailable;
  const editRevisionCount = announcement.revisions.filter(
    (revision) => revision.revisionNumber > 1,
  ).length;
  const hasEditedRevisions = editRevisionCount > 0;

  return (
    <article
      id={`announcement-${announcement.id}`}
      className={`scroll-target bg-white rounded-xl border p-5 transition-all shadow-xs space-y-4 ${
        isUnread
          ? "border-[#174C37] ring-1 ring-[#174C37]/20"
          : "border-[#E5DDD3]"
      }`}
    >
      {/* Header Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Label */}
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full border ${priorityConfig.className}`}
            >
              Priority: {priorityConfig.label}
            </span>

            {/* Scope Label */}
            {announcement.eventId ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#103D2B]/10 text-[#103D2B] border border-[#174C37]/30 font-semibold flex items-center gap-1">
                <Layers className="w-3 h-3 text-[#D6A23A]" />
                <span>Event: {announcement.eventTitle ?? "Event update"}</span>
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3] font-semibold">
                Club-Wide Notice
              </span>
            )}

            {/* Personal Read State */}
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                announcement.readStatusUnavailable
                  ? "bg-neutral-100 text-neutral-500 border border-neutral-200"
                  : isUnread
                    ? "bg-[#174C37] text-white"
                    : "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]"
              }`}
            >
              {announcement.readStatusUnavailable
                ? "Read status unavailable"
                : isUnread
                  ? "Unread for you"
                  : "Read by you"}
            </span>
          </div>

          <h3 className="text-base sm:text-lg font-bold text-[#3D291F] pt-0.5 leading-snug">
            {announcement.title}
          </h3>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mark as read button */}
          {!announcement.readStatusUnavailable && isUnread && (
            <form action={markAnnouncementReadAction}>
              <input
                name="announcement_id"
                type="hidden"
                value={announcement.id}
              />
              <FormSubmitButton
                className="cf-btn cf-btn--primary"
                pendingLabel="Marking Read…"
                statusToastMessage="Updating your announcement read status."
              >
                <Check className="w-3.5 h-3.5" />
                <span>Mark as read</span>
              </FormSubmitButton>
            </form>
          )}

          {/* Edit Button */}
          {announcement.canManage && (
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="cf-btn cf-btn--neutral cf-btn--accent"
              title="Edit announcement (requires audit reason)"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#174C37]" />
              <span>Edit...</span>
            </button>
          )}
        </div>
      </div>

      {/* Message Content */}
      <div className="text-xs sm:text-sm text-[#3D291F] leading-relaxed whitespace-pre-line bg-[#FAF6F0]/40 p-4 rounded-xl border border-[#E5DDD3]/70">
        {announcement.message}
      </div>

      {/* Footer Metadata */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-[#7A685D] pt-2 border-t border-[#E5DDD3]/70">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#D6A23A]" />
            <span>Posted: {formatWAT(announcement.createdAt)}</span>
          </span>

          {announcement.expiresAt && (
            <span className="text-[#8A641A] font-medium flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-[#D6A23A]" />
              <span>
                Highlight active until: {formatWAT(announcement.expiresAt)}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span>
            Scope:{" "}
            <strong className="text-[#3D291F]">
              {announcement.eventTitle ?? "Club-wide"}
            </strong>
          </span>

          {/* Revision History Link */}
          {hasEditedRevisions && (
            <button
              type="button"
              onClick={() => setIsRevisionsOpen(!isRevisionsOpen)}
              className="cf-btn cf-btn--link"
            >
              <History className="w-3 h-3 text-[#D6A23A]" />
              <span>
                {editRevisionCount} revision
                {editRevisionCount > 1 ? "s" : ""}
              </span>
              {isRevisionsOpen ? (
                <ChevronUp className="w-3 h-3 text-[#7A685D]" />
              ) : (
                <ChevronDown className="w-3 h-3 text-[#7A685D]" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Revision History Details */}
      {isRevisionsOpen && hasEditedRevisions && (
        <div className="mt-3 p-3.5 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] space-y-2.5 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-[#3D291F]">
            <History className="w-3.5 h-3.5 text-[#174C37]" />
            <span>Preserved Revision History</span>
          </div>
          <div className="space-y-2">
            {announcement.revisions.map((rev) => (
              <div
                key={rev.id}
                className="p-3 bg-white rounded-lg border border-[#E5DDD3] space-y-1 text-[11px]"
              >
                <div className="flex items-center justify-between text-[#7A685D]">
                  <span className="font-semibold text-[#3D291F]">
                    Revision #{rev.revisionNumber}
                  </span>
                  <span>{formatWAT(rev.editedAt)}</span>
                </div>
                <p className="text-[#3D291F]">
                  <strong className="text-[#7A685D]">Reason for edit:</strong>{" "}
                  {rev.reason}
                </p>
                <p className="text-[#7A685D] text-[10px] pt-1 border-t border-[#E5DDD3]/50">
                  Priority: {rev.priority}
                  {rev.expiresAt
                    ? ` · Highlight until ${formatWAT(rev.expiresAt)}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {announcement.canManage && (
        <AnnouncementEditModal
          announcement={announcement}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}
    </article>
  );
}
