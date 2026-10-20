"use client";

import { AlertCircle, Edit3, X } from "lucide-react";
import { useState } from "react";
import { updateAnnouncementAction } from "@/app/actions";
import type {
  AnnouncementItem,
  AnnouncementPriority,
} from "./communications-types";

interface AnnouncementEditModalProps {
  announcement: AnnouncementItem;
  isOpen: boolean;
  onClose: () => void;
}

function toWatDateTimeLocal(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function AnnouncementEditModal({
  announcement,
  isOpen,
  onClose,
}: AnnouncementEditModalProps) {
  const [priority, setPriority] = useState<AnnouncementPriority>(
    announcement.priority ?? "standard",
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
                Revision #{announcement.revisionNumber + 1} will be preserved in
                the audit log
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
              className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
          </div>

          {/* Priority & Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              >
                <option value="standard">Standard Notice</option>
                <option value="important">Important Notice</option>
                <option value="urgent">Urgent Alert (Requires Expiry)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor={`edit-expires-${announcement.id}`}
                className="block text-xs font-bold text-[#3D291F] mb-1"
              >
                Highlight Expiry{" "}
                {priority === "urgent"
                  ? "(Required)"
                  : priority === "important"
                    ? "(Optional)"
                    : "(N/A)"}
              </label>
              <input
                id={`edit-expires-${announcement.id}`}
                name="expires_at"
                type="datetime-local"
                disabled={priority === "standard"}
                required={priority === "urgent"}
                defaultValue={toWatDateTimeLocal(announcement.expiresAt)}
                className={`w-full p-2.5 border rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden ${
                  priority === "standard"
                    ? "bg-neutral-100 border-neutral-200 text-neutral-400 cursor-not-allowed"
                    : "bg-[#FAF6F0] border-[#E5DDD3]"
                }`}
              />
            </div>
          </div>

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
              Reason for this Revision (Mandatory Governance Audit)
            </label>
            <input
              id={`edit-reason-${announcement.id}`}
              name="reason"
              type="text"
              required
              maxLength={500}
              placeholder="e.g. Corrected date and updated venue contact details per Welfare Committee resolution..."
              className="w-full p-2.5 bg-white border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
            />
            <p className="text-[11px] text-[#7A685D] mt-1 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-[#D6A23A] shrink-0" />
              <span>
                This reason is permanently appended to the announcement revision
                history.
              </span>
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5DDD3]">
            <button
              type="button"
              onClick={onClose}
              className="cf-btn cf-btn--neutral"
            >
              Cancel
            </button>
            <button type="submit" className="cf-btn cf-btn--primary">
              Save Revision
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
