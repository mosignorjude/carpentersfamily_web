"use client";

import { Edit3, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { updateEventDetailsAction } from "@/app/actions";
import { FormFieldHint } from "@/components/ui";
import { dispatchActionStatusToast } from "@/components/ui/flash-card";
import {
  MAX_DURATION_DAYS,
  minuteSelectOptions,
  splitInstantForForm,
} from "@/lib/event-schedule.mjs";
import { formatEventDurationLabel } from "@/lib/event-times.mjs";
import type { EventRow } from "./event-types";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_unused, index) =>
  String(index + 1),
);
const DURATION_OPTIONS = Array.from(
  { length: MAX_DURATION_DAYS },
  (_unused, index) => index + 1,
);
const FIELD_CLASS =
  "w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const PART_CLASS =
  "w-full h-10 px-2 bg-white border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const LABEL_CLASS =
  "block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5";

interface EventEditModalProps {
  isOpen: boolean;
  event: EventRow | null;
  onClose: () => void;
  returnTo?: string;
}

export function EventEditModal({
  isOpen,
  event,
  onClose,
  returnTo,
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

  const schedule = splitInstantForForm(event.starts_at);
  const minuteOptions = minuteSelectOptions(schedule?.startMinute);

  return (
    <div
      aria-labelledby="event-edit-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex sm:items-center items-end justify-center p-0 sm:p-4 bg-[#0C3325]/75 backdrop-blur-xs"
      ref={dialogRef}
      role="dialog"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5DDD3] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col">
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
                Update schedule, venue, or committee roles for {event.title}.
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
          className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0"
          onSubmit={() => {
            setIsPending(true);
            dispatchActionStatusToast({
              title: "Saving Event Details…",
              message: `Updating logistics and schedule for ${event.title}.`,
            });
          }}
        >
          <input name="event_id" type="hidden" value={event.id} />
          {returnTo && (
            <input name="return_to" type="hidden" value={returnTo} />
          )}

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

          {/* Start date, 12-hour clock, and length */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="edit-event-date">
                Start Date <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className={FIELD_CLASS}
                defaultValue={schedule?.eventDate ?? ""}
                id="edit-event-date"
                name="event_date"
                required
                type="date"
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="edit-event-duration-days">
                Runs For <span className="text-[#BA3C2A]">*</span>
              </label>
              <select
                className={FIELD_CLASS}
                defaultValue={String(event.duration_days ?? 1)}
                id="edit-event-duration-days"
                name="duration_days"
                required
              >
                {DURATION_OPTIONS.map((days) => (
                  <option key={days} value={String(days)}>
                    {formatEventDurationLabel(days)}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className={LABEL_CLASS} htmlFor="edit-event-start-hour">
                Start Time <span className="text-[#BA3C2A]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.startHour ?? ""}
                  id="edit-event-start-hour"
                  name="start_hour"
                  required
                >
                  <option disabled value="">
                    Hour
                  </option>
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.startMinute ?? ""}
                  id="edit-event-start-minute"
                  name="start_minute"
                  required
                >
                  <option disabled value="">
                    Min
                  </option>
                  {minuteOptions.map((minute) => (
                    <option key={minute.value} value={minute.value}>
                      {minute.label}
                    </option>
                  ))}
                </select>
                <select
                  className={PART_CLASS}
                  defaultValue={schedule?.meridiem ?? "PM"}
                  id="edit-event-meridiem"
                  name="meridiem"
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
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
