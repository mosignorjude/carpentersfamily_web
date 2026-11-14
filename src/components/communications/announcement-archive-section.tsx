"use client";

import {
  Archive,
  CalendarClock,
  Clock,
  Edit3,
  FileText,
  Layers,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  publishDraftAnnouncementAction,
  restoreAnnouncementAction,
} from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import {
  type AnnouncementDurationPreset,
  DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
  formatAnnouncementRetentionSummary,
  formatWatDateDisplay,
  formatWatDateTimeLocal,
} from "@/lib/announcement-lifecycle.mjs";
import { AnnouncementDeleteModal } from "./announcement-delete-modal";
import { AnnouncementDurationFields } from "./announcement-duration-fields";
import { AnnouncementEditModal } from "./announcement-edit-modal";
import type {
  AnnouncementArchiveItem,
  AnnouncementDraftItem,
  AnnouncementItem,
} from "./communications-types";

interface AnnouncementDraftsSectionProps {
  drafts: AnnouncementDraftItem[];
  globalPublisher: boolean;
}

export function AnnouncementDraftsSection({
  drafts,
  globalPublisher,
}: AnnouncementDraftsSectionProps) {
  const [editingDraftRef, setEditingDraftRef] = useState<{
    id: string;
    revisionNumber: number;
  } | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  if (drafts.length === 0) return null;

  const editingDraft = editingDraftRef
    ? (drafts.find(
        (draft) =>
          draft.id === editingDraftRef.id &&
          draft.revisionNumber === editingDraftRef.revisionNumber,
      ) ?? null)
    : null;
  const deletingDraft = deletingDraftId
    ? (drafts.find((draft) => draft.id === deletingDraftId) ?? null)
    : null;

  const editableAnnouncement = editingDraft
    ? ({
        id: editingDraft.id,
        eventId: editingDraft.eventId,
        eventTitle: editingDraft.eventTitle,
        title: editingDraft.title,
        message: editingDraft.message,
        createdAt: editingDraft.createdAt,
        updatedAt: editingDraft.updatedAt,
        publishedAt: null,
        revisionNumber: editingDraft.revisionNumber,
        priority: editingDraft.priority,
        status: "draft",
        durationPreset: editingDraft.durationPreset,
        expiresAt: editingDraft.expiresAt,
        isRead: true,
        readStatusUnavailable: false,
        canManage: editingDraft.canManage,
        revisions: [],
      } satisfies AnnouncementItem)
    : null;

  return (
    <section
      aria-labelledby="announcement-drafts-heading"
      className="bg-white rounded-xl border border-[#E5DDD3] p-4 sm:p-5 space-y-3 shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#D6A23A]" />
          <h2
            id="announcement-drafts-heading"
            className="text-sm font-bold text-[#3D291F]"
          >
            Saved Drafts ({drafts.length})
          </h2>
        </div>
        <span className="text-[11px] text-[#7A685D]">
          Drafts do not expire or notify members until published.
        </span>
      </div>

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="rounded-xl border border-[#E5DDD3] bg-[#FAF6F0]/50 p-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FFF8E6] text-[#8A641A] border border-[#D6A23A]/40">
                    Draft
                  </span>
                  {draft.eventId ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#103D2B]/10 text-[#103D2B] border border-[#174C37]/30 font-semibold inline-flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[#D6A23A]" />
                      <span>Event: {draft.eventTitle ?? "Event update"}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white text-[#174C37] border border-[#E5DDD3] font-semibold">
                      Club-Wide
                    </span>
                  )}
                  <span className="text-[11px] text-[#7A685D]">
                    Duration on publish:{" "}
                    {draft.durationPreset === "custom" && draft.expiresAt
                      ? formatWatDateDisplay(draft.expiresAt)
                      : draft.durationPreset}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#3D291F]">
                  {draft.title}
                </h3>
                <p className="text-xs text-[#5C4638] line-clamp-2 whitespace-pre-line">
                  {draft.message}
                </p>
              </div>

              {draft.canManage && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <form action={publishDraftAnnouncementAction}>
                    <input
                      type="hidden"
                      name="announcement_id"
                      value={draft.id}
                    />
                    <FormSubmitButton
                      className="cf-btn cf-btn--primary min-h-[44px]"
                      pendingLabel="Publishing…"
                      statusToastMessage="Publishing announcement and notifying members."
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Publish Now</span>
                    </FormSubmitButton>
                  </form>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingDraftRef({
                        id: draft.id,
                        revisionNumber: draft.revisionNumber,
                      })
                    }
                    className="cf-btn cf-btn--neutral min-h-[44px]"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingDraftId(draft.id)}
                    className="cf-btn cf-btn--neutral min-h-[44px] text-[#8B261E] border-red-200 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {editableAnnouncement && (
        <AnnouncementEditModal
          key={`${editableAnnouncement.id}-${editableAnnouncement.revisionNumber}`}
          announcement={editableAnnouncement}
          globalPublisher={globalPublisher}
          isOpen={true}
          onClose={() => setEditingDraftRef(null)}
        />
      )}

      {deletingDraft && (
        <AnnouncementDeleteModal
          announcementId={deletingDraft.id}
          announcementTitle={deletingDraft.title}
          isOpen={true}
          onClose={() => setDeletingDraftId(null)}
        />
      )}
    </section>
  );
}

interface AnnouncementRestoreModalProps {
  archivedItem: AnnouncementArchiveItem;
  onClose: () => void;
}

function AnnouncementRestoreModal({
  archivedItem,
  onClose,
}: AnnouncementRestoreModalProps) {
  const existingExpiryValid =
    archivedItem.archiveReason !== "expired" &&
    Boolean(archivedItem.expiresAt) &&
    Date.parse(archivedItem.expiresAt ?? "") > Date.now();

  const [expiryAction, setExpiryAction] = useState<"keep" | "set">(
    existingExpiryValid ? "keep" : "set",
  );
  const [durationPreset, setDurationPreset] =
    useState<AnnouncementDurationPreset>(
      archivedItem.durationPreset === "custom"
        ? DEFAULT_ANNOUNCEMENT_DURATION_PRESET
        : archivedItem.durationPreset,
    );
  const [customExpiresAt, setCustomExpiresAt] = useState(
    formatWatDateTimeLocal(archivedItem.expiresAt),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`restore-announcement-${archivedItem.id}`}
      className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-lg w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37]">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3
                id={`restore-announcement-${archivedItem.id}`}
                className="text-base font-bold text-[#3D291F]"
              >
                Restore Announcement
              </h3>
              <p className="text-xs text-[#7A685D]">{archivedItem.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-lg inline-flex items-center justify-center text-[#7A685D] hover:bg-[#FAF6F0]"
            aria-label="Close restore dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form action={restoreAnnouncementAction} className="space-y-4 text-xs">
          <input name="announcement_id" type="hidden" value={archivedItem.id} />

          <AnnouncementDurationFields
            idPrefix={`restore-${archivedItem.id}`}
            durationPreset={durationPreset}
            onDurationPresetChange={setDurationPreset}
            customExpiresAt={customExpiresAt}
            onCustomExpiresAtChange={setCustomExpiresAt}
            expiryAction={expiryAction}
            onExpiryActionChange={setExpiryAction}
            allowKeepCurrent={existingExpiryValid || !archivedItem.publishedAt}
            currentExpiresAtIso={archivedItem.expiresAt}
            isDraft={!archivedItem.publishedAt}
            requireFutureNotice={
              !archivedItem.publishedAt
                ? "Unpublished drafts are restored back to Saved Drafts without sending notifications."
                : existingExpiryValid
                  ? undefined
                  : "This announcement has expired. Select a new active duration or custom future expiry date to restore it."
            }
          />

          <div>
            <label
              htmlFor={`restore-reason-${archivedItem.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Reason for Restoration
            </label>
            <input
              id={`restore-reason-${archivedItem.id}`}
              name="reason"
              type="text"
              required
              maxLength={500}
              defaultValue="Restored from archive"
              className="w-full min-h-[44px] p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5DDD3]">
            <button
              type="button"
              onClick={onClose}
              className="cf-btn cf-btn--neutral min-h-[44px]"
            >
              Cancel
            </button>
            <FormSubmitButton
              className="cf-btn cf-btn--primary min-h-[44px]"
              pendingLabel="Restoring…"
              statusToastMessage="Restoring announcement to active feed."
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore Announcement</span>
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AnnouncementArchiveSectionProps {
  archivedAnnouncements: AnnouncementArchiveItem[];
}

export function AnnouncementArchiveSection({
  archivedAnnouncements,
}: AnnouncementArchiveSectionProps) {
  const [restoringItemRef, setRestoringItemRef] = useState<{
    id: string;
    revisionNumber: number;
  } | null>(null);

  if (archivedAnnouncements.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5DDD3] p-12 text-center space-y-2">
        <Archive className="w-8 h-8 text-[#7A685D] mx-auto opacity-40" />
        <h2 className="text-base font-bold text-[#3D291F]">Archive is Empty</h2>
        <p className="text-xs text-[#7A685D] max-w-md mx-auto">
          Expired or manually deleted announcements remain recoverable here for
          7 days before permanent removal.
        </p>
      </div>
    );
  }

  const restoringItem = restoringItemRef
    ? (archivedAnnouncements.find(
        (item) =>
          item.id === restoringItemRef.id &&
          item.revisionNumber === restoringItemRef.revisionNumber,
      ) ?? null)
    : null;

  return (
    <div className="space-y-4">
      {archivedAnnouncements.map((item) => {
        const retention = formatAnnouncementRetentionSummary({
          archiveReason: item.archiveReason,
          archivedAt: item.archivedAt,
          purgeAfter: item.purgeAfter,
        });

        return (
          <article
            key={item.id}
            className="bg-white rounded-xl border border-[#E5DDD3] p-5 space-y-3 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      item.archiveReason === "expired"
                        ? "bg-[#FFF8E6] text-[#8A641A] border-[#D6A23A]/40"
                        : "bg-red-50 text-[#8B261E] border-red-200"
                    }`}
                  >
                    {retention.reasonLabel}
                  </span>
                  {item.eventId ? (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#103D2B]/10 text-[#103D2B] border border-[#174C37]/30 font-semibold inline-flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[#D6A23A]" />
                      <span>Event: {item.eventTitle ?? "Event update"}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#FAF6F0] text-[#174C37] border border-[#E5DDD3] font-semibold">
                      Club-Wide
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-[#3D291F]">
                  {item.title}
                </h3>
                <p className="text-xs text-[#5C4638] whitespace-pre-line line-clamp-3">
                  {item.message}
                </p>
              </div>

              {item.canManage && retention.isRecoverable && (
                <button
                  type="button"
                  onClick={() =>
                    setRestoringItemRef({
                      id: item.id,
                      revisionNumber: item.revisionNumber,
                    })
                  }
                  className="cf-btn cf-btn--primary min-h-[44px] shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3 border-t border-[#E5DDD3]/70 text-[11px] text-[#5C4638]">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
                <span>
                  Published:{" "}
                  {item.publishedAt
                    ? formatWatDateDisplay(item.publishedAt)
                    : "Draft (unpublished)"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Archive className="w-3.5 h-3.5 text-[#7A685D] shrink-0" />
                <span>
                  Archived: {retention.archivedAtLabel}
                  {item.archivedByName ? ` by ${item.archivedByName}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5 text-[#8B261E] shrink-0" />
                <span>Permanent delete: {retention.scheduledPurgeLabel}</span>
              </div>
              <div>
                <span>Reason: {retention.reasonLabel}</span>
              </div>
            </div>
          </article>
        );
      })}

      {restoringItem && (
        <AnnouncementRestoreModal
          key={`${restoringItem.id}-${restoringItem.revisionNumber}`}
          archivedItem={restoringItem}
          onClose={() => setRestoringItemRef(null)}
        />
      )}
    </div>
  );
}
