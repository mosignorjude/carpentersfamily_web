"use client";

import { Megaphone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HomeDashboardAnnouncement } from "@/lib/home-dashboard.server";

function formatDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(timestamp));
}

interface AnnouncementDetailModalProps {
  announcement: HomeDashboardAnnouncement | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AnnouncementDetailModal({
  announcement,
  isOpen,
  onClose,
}: AnnouncementDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] =
    useState<HomeDashboardAnnouncement | null>(announcement);

  useEffect(() => {
    if (announcement) {
      setActiveAnnouncement(announcement);
    }
  }, [announcement]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && activeAnnouncement) {
      previouslyFocusedElementRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
      previouslyFocusedElementRef.current?.focus();
    }
  }, [isOpen, activeAnnouncement]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
    previouslyFocusedElementRef.current?.focus();
    onClose();
  };

  if (!activeAnnouncement) return null;

  return (
    <dialog
      aria-labelledby="announcement-modal-title"
      className="announcement-detail-dialog"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          handleClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          handleClose();
        }
      }}
      ref={dialogRef}
    >
      <div className="w-full">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] flex items-center justify-between bg-[#FAF6F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#174C37]/10 text-[#174C37] flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-[#174C37]" />
            </div>
            <div>
              <span className="text-xs font-bold text-[#174C37] uppercase tracking-wider block">
                {activeAnnouncement.priority === "urgent"
                  ? "Urgent Club Notice"
                  : activeAnnouncement.priority === "important"
                    ? "Important Club Notice"
                    : "Official Club Notice"}
              </span>
              <span className="text-xs font-bold font-mono text-[#7A685D]">
                {formatDateTime(activeAnnouncement.createdAt)}
              </span>
            </div>
          </div>
          <button
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-[#7A685D] hover:text-[#3D291F] hover:bg-[#E5DDD3]/60 rounded-lg transition-colors cursor-pointer"
            onClick={handleClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          <h3
            className="text-xl font-extrabold text-[#3D291F] leading-snug"
            id="announcement-modal-title"
          >
            {activeAnnouncement.title}
          </h3>

          <div className="text-sm font-medium text-[#3D291F] whitespace-pre-line leading-relaxed border-t border-[#E5DDD3] pt-4">
            {activeAnnouncement.message}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#FAF6F0] border-t border-[#E5DDD3] flex justify-end">
          <button
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-5 py-2.5 bg-[#174C37] text-white text-xs font-bold rounded-[10px] hover:bg-[#103D2B] transition-colors shadow-xs cursor-pointer"
            onClick={handleClose}
            type="button"
          >
            Close Notice
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default AnnouncementDetailModal;
