"use client";

import { AlertCircle, Edit3, X } from "lucide-react";
import { useState } from "react";
import { updateAnnouncementAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import {
  type AnnouncementDurationPreset,
  DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
  formatWatDateTimeLocal,
} from "@/lib/announcement-lifecycle.mjs";
import { AnnouncementDurationFields } from "./announcement-duration-fields";
import type {
  AnnouncementItem,
  AnnouncementPriority,
} from "./communications-types";

interface AnnouncementEditModalProps {
  announcement: AnnouncementItem;
  globalPublisher?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function AnnouncementEditModal({
  announcement,
  globalPublisher = true,
  isOpen,
  onClose,
}: AnnouncementEditModalProps) {
  const [priority, setPriority] = useState<AnnouncementPriority>(
    announcement.priority ?? "standard",
  );
  const [expiryAction, setExpiryAction] = useState<"keep" | "set">("keep");
  const [durationPreset, setDurationPreset] =
    useState<AnnouncementDurationPreset>(
      announcement.durationPreset ?? DEFAULT_ANNOUNCEMENT_DURATION_PRESET,
    );
  const [customExpiresAt, setCustomExpiresAt] = useState(
    formatWatDateTimeLocal(announcement.expiresAt),
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`edit-announcement-${announcement.id}`}
      className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-xl w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37]">
              <Edit3 className="w-4 h-4 text-[#174C37]" />
            </div>
            <div>
              <h3
                id={`edit-announcement-${announcement.id}`}
                className="text-base font-bold text-[#3D291F]"
              >
                Edit Announcement
              </h3>
              <p className="text-xs text-[#7A685D]">
                Revision #{announcement.revisionNumber + 1}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cf-btn cf-btn--icon-close"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form action={updateAnnouncementAction} className="space-y-4 text-xs">
          <input name="announcement_id" type="hidden" value={announcement.id} />

          {/* Title */}
          <div>
            <label
              htmlFor={`edit-title-${announcement.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Announcement Title
            </label>
            <input
              id={`edit-title-${announcement.id}`}
              name="title"
              type="text"
              required
              maxLength={160}
              defaultValue={announcement.title}
              className="w-full min-h-[44px] p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
          </div>

          {/* Priority Level */}
          {globalPublisher ? (
            <div>
              <label
                htmlFor={`edit-priority-${announcement.id}`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Priority Level
              </label>
              <select
                id={`edit-priority-${announcement.id}`}
                name="priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as AnnouncementPriority)
                }
                className="w-full min-h-[44px] p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              >
                <option value="standard">Standard Notice</option>
                <option value="important">Important Notice</option>
                <option value="urgent">Urgent Alert</option>
              </select>
            </div>
          ) : (
            <input name="priority" type="hidden" value={priority} />
          )}

          {/* Duration / Expiry (Keep current by default so copy edits never reset expiry) */}
          <AnnouncementDurationFields
            idPrefix={`edit-${announcement.id}`}
            durationPreset={durationPreset}
            onDurationPresetChange={setDurationPreset}
            customExpiresAt={customExpiresAt}
            onCustomExpiresAtChange={setCustomExpiresAt}
            expiryAction={expiryAction}
            onExpiryActionChange={setExpiryAction}
            allowKeepCurrent={true}
            currentExpiresAtIso={announcement.expiresAt}
            isDraft={announcement.status === "draft"}
          />

          {/* Message */}
          <div>
            <label
              htmlFor={`edit-message-${announcement.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Message Content
            </label>
            <textarea
              id={`edit-message-${announcement.id}`}
              name="message"
              required
              rows={5}
              maxLength={10000}
              defaultValue={announcement.message}
              className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
          </div>

          {/* Audit Reason */}
          <div>
            <label
              htmlFor={`edit-reason-${announcement.id}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Reason for Edit *
            </label>
            <input
              id={`edit-reason-${announcement.id}`}
              name="reason"
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Corrected date and updated publication duration per executive review..."
              className="w-full min-h-[44px] p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
            <p className="text-[11px] text-[#7A685D] mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
              <span>Recorded in the revision history.</span>
            </p>
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
              pendingLabel="Saving Revision…"
              statusToastMessage="Recording announcement revision and audit note."
            >
              Save Changes
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
