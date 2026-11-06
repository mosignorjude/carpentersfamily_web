"use client";

import { Calendar, X } from "lucide-react";
import { createEventAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import {
  MAX_DURATION_DAYS,
  minuteSelectOptions,
} from "@/lib/event-schedule.mjs";
import { formatEventDurationLabel } from "@/lib/event-times.mjs";
import { useModalHygiene } from "@/lib/use-modal-hygiene";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_unused, index) =>
  String(index + 1),
);
const DURATION_OPTIONS = Array.from(
  { length: MAX_DURATION_DAYS },
  (_unused, index) => index + 1,
);
const FIELD_CLASS =
  "w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const PART_CLASS =
  "w-full h-11 px-2 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]";
const LABEL_CLASS =
  "block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5";
const HINT_CLASS = "text-[10px] text-[#7A685D] mt-1 block";

interface NewMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewMeetingModal({ isOpen, onClose }: NewMeetingModalProps) {
  useModalHygiene({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div
      aria-labelledby="new-meeting-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
      role="dialog"
    >
      <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-xl p-6 sm:p-7 shadow-xl space-y-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Calendar className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <h2
                className="text-lg font-extrabold text-[#3D291F]"
                id="new-meeting-title"
              >
                Schedule New Meeting
              </h2>
              <p className="text-xs text-[#7A685D]">
                Create a General House or Executive meeting session.
              </p>
            </div>
          </div>
          <button
            aria-label="Close modal"
            className="p-2 text-[#7A685D] hover:text-[#3D291F] rounded-lg hover:bg-[#FAF6F0] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form action={createEventAction} className="space-y-4">
          <input name="event_type" type="hidden" value="meeting" />
          <input name="minutes_enabled" type="hidden" value="enabled" />
          <input name="attendance_enabled" type="hidden" value="enabled" />

          <div>
            <label className={LABEL_CLASS} htmlFor="new-meeting-title-input">
              Meeting Title <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className={FIELD_CLASS}
              id="new-meeting-title-input"
              maxLength={120}
              name="title"
              placeholder="e.g. Monthly General House Meeting"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS} htmlFor="new-meeting-date">
                Meeting Date <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className={FIELD_CLASS}
                id="new-meeting-date"
                name="event_date"
                required
                type="date"
              />
            </div>

            <div>
              <label className={LABEL_CLASS} htmlFor="new-meeting-start-hour">
                Start Time <span className="text-[#BA3C2A]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  className={PART_CLASS}
                  defaultValue=""
                  id="new-meeting-start-hour"
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
                  defaultValue=""
                  id="new-meeting-start-minute"
                  name="start_minute"
                  required
                >
                  <option disabled value="">
                    Min
                  </option>
                  {minuteSelectOptions("").map((minute) => (
                    <option key={minute.value} value={minute.value}>
                      {minute.label}
                    </option>
                  ))}
                </select>
                <select
                  className={PART_CLASS}
                  defaultValue="PM"
                  id="new-meeting-meridiem"
                  name="meridiem"
                  required
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <span className={HINT_CLASS}>
                12-hour clock, West Africa Time.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                className={LABEL_CLASS}
                htmlFor="new-meeting-duration-days"
              >
                Runs For <span className="text-[#BA3C2A]">*</span>
              </label>
              <select
                className={FIELD_CLASS}
                defaultValue="1"
                id="new-meeting-duration-days"
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

            <div>
              <label className={LABEL_CLASS} htmlFor="new-meeting-location">
                Venue / Location <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className={FIELD_CLASS}
                defaultValue="Fobbs Apartment, Michael Fidelis Nwaefulu Street, GRA Phase 1, Asaba"
                id="new-meeting-location"
                maxLength={200}
                name="location"
                required
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="new-meeting-description">
              Agenda & Notice Outline
            </label>
            <textarea
              className="w-full h-20 p-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              id="new-meeting-description"
              maxLength={2000}
              name="description"
              placeholder="Key agenda topics, secretariat announcements, or special instructions..."
              rows={2}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E5DDD3]">
            <button
              className="cf-btn cf-btn--neutral min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <FormSubmitButton
              className="cf-btn cf-btn--primary min-h-[44px] px-6 py-2 rounded-xl text-xs font-bold cursor-pointer"
              pendingLabel="Scheduling…"
              statusToastMessage="Publishing new meeting to Meeting Hub."
            >
              Schedule Meeting
            </FormSubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
