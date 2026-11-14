"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { archiveAnnouncementAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";

interface AnnouncementDeleteModalProps {
  announcementId: string;
  announcementTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AnnouncementDeleteModal({
  announcementId,
  announcementTitle,
  isOpen,
  onClose,
}: AnnouncementDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`delete-announcement-${announcementId}`}
      className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center text-[#8B261E]">
              <Trash2 className="w-4 h-4" />
            </div>
            <h3
              id={`delete-announcement-${announcementId}`}
              className="text-base font-bold text-[#3D291F]"
            >
              Delete Announcement
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-lg inline-flex items-center justify-center text-[#7A685D] hover:bg-[#FAF6F0]"
            aria-label="Close delete dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 bg-[#FFF8E6] border border-[#D6A23A]/50 rounded-xl text-xs text-[#5C4638] space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-[#8A641A]">
            <AlertTriangle className="w-4 h-4 text-[#D6A23A] shrink-0" />
            <span>Recoverable for 7 days</span>
          </div>
          <p>
            Deleting <strong>{announcementTitle}</strong> immediately removes it
            from the active announcements feed and moves it to{" "}
            <strong>Archive</strong>. You can restore it within 7 days before it
            is permanently deleted.
          </p>
        </div>

        <form action={archiveAnnouncementAction} className="space-y-4 text-xs">
          <input name="announcement_id" type="hidden" value={announcementId} />

          <div>
            <label
              htmlFor={`delete-reason-${announcementId}`}
              className="block text-xs font-bold text-[#3D291F] mb-1"
            >
              Reason (recorded in audit log)
            </label>
            <input
              id={`delete-reason-${announcementId}`}
              name="reason"
              type="text"
              required
              maxLength={500}
              defaultValue="Manually deleted"
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
              className="cf-btn min-h-[44px] bg-[#8B261E] text-white hover:bg-[#701D17] border border-[#8B261E] px-4 rounded-xl font-bold inline-flex items-center gap-1.5"
              pendingLabel="Moving to Archive…"
              statusToastMessage="Moving announcement to Archive (7-day retention)."
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Move to Archive</span>
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
