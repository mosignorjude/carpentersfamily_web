"use client";

import { Edit3, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateEventDetailsAction } from "@/app/actions";
import { FormFieldHint } from "@/components/ui";
import type { EventRow } from "./event-types";

interface EventEditModalProps {
  isOpen: boolean;
  event: EventRow | null;
  onClose: () => void;
}

function dateTimeLocalValue(value: string) {
  const date = new Date(new Date(value).getTime() + 60 * 60 * 1000);
  return date.toISOString().slice(0, 16);
}

export function EventEditModal({
  isOpen,
  event,
  onClose,
}: EventEditModalProps) {
  const [isPending, setIsPending] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsPending(false);
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Focus the first interactive element
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Tab" && dialog) {
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusableElements.length === 0) return;
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  return (
    <div
      aria-labelledby="event-edit-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs"
      ref={dialogRef}
      role="dialog"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
              <Edit3 className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h3
                className="text-base font-extrabold text-[#3D291F]"
                id="event-edit-title"
              >
                Edit Event Logistics & Details
              </h3>
              <p className="text-xs text-[#54433A] font-medium">
                Update schedule, venue, and description with mandatory audit
                justification
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 bg-transparent border-0 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          action={updateEventDetailsAction}
          className="p-6 space-y-4 overflow-y-auto"
          onSubmit={() => setIsPending(true)}
        >
          <input name="event_id" type="hidden" value={event.id} />

          {/* Event Title */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="edit-event-title"
            >
              Event Title <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="edit-event-title"
              defaultValue={event.title}
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              maxLength={120}
              name="title"
              required
            />
          </div>

          {/* Date & Time */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="edit-event-starts-at"
            >
              Date and Time <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="edit-event-starts-at"
              defaultValue={dateTimeLocalValue(event.starts_at)}
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              name="starts_at"
              required
              type="datetime-local"
            />
          </div>

          {/* Location */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="edit-event-location"
            >
              Venue / Location <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="edit-event-location"
              defaultValue={event.location}
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              maxLength={200}
              name="location"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="edit-event-description"
            >
              Event Description & Agenda
            </label>
            <textarea
              id="edit-event-description"
              defaultValue={event.description ?? ""}
              className="w-full h-24 p-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              maxLength={2000}
              name="description"
              rows={3}
            />
          </div>

          {/* Governance Reason */}
          <div>
            <label
              className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
              htmlFor="edit-event-reason"
            >
              Reason for Logistics Modification{" "}
              <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              id="edit-event-reason"
              className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              maxLength={500}
              name="reason"
              placeholder="e.g. Venue changed due to secretariat renovation schedule"
              required
            />
            <FormFieldHint message="Required by Club Governance to track changes to event dates, venues, or agendas." />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2.5 rounded-lg border border-[#E5DDD3] bg-white text-[#54433A] hover:bg-[#FAF6F0] text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`px-5 py-2.5 rounded-lg bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[44px] ${
                isPending ? "opacity-60 cursor-not-allowed" : ""
              }`}
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving..." : "Save Event Details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
