"use client";

import { Info, Shield, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { createEventAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";
import {
  MAX_DURATION_DAYS,
  minuteSelectOptions,
} from "@/lib/event-schedule.mjs";
import { formatEventDurationLabel } from "@/lib/event-times.mjs";

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

type SupportedEventType = "party" | "other";

export function CreateEventForm() {
  const [eventType, setEventType] = useState<SupportedEventType>("party");
  const [minutesEnabled, setMinutesEnabled] = useState(false);
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [incomeEnabled, setIncomeEnabled] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const [ticketingEnabled, setTicketingEnabled] = useState(false);

  const handleTypeChange = (newType: SupportedEventType) => {
    setEventType(newType);
    if (newType === "party") {
      setMinutesEnabled(false);
      setAttendanceEnabled(false);
      setBudgetEnabled(true);
      setIncomeEnabled(true);
      setExpensesEnabled(true);
      setTicketingEnabled(false);
    } else if (newType === "other") {
      setMinutesEnabled(false);
      setAttendanceEnabled(true);
      setBudgetEnabled(false);
      setIncomeEnabled(false);
      setExpensesEnabled(false);
      setTicketingEnabled(false);
    }
  };

  return (
    <form action={createEventAction} className="space-y-6">
      {/* Event Title & Type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="create-event-title">
            Event Title <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            className={FIELD_CLASS}
            id="create-event-title"
            maxLength={120}
            name="title"
            placeholder="e.g. End-of-Year Gala & Banquet"
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="create-event-type">
            Event Classification <span className="text-[#BA3C2A]">*</span>
          </label>
          <select
            className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            id="create-event-type"
            name="event_type"
            onChange={(e) =>
              handleTypeChange(e.target.value as SupportedEventType)
            }
            required
            value={eventType}
          >
            <option value="party">Party / Gala Banquet</option>
            <option value="other">Other Event / Outreach</option>
          </select>
        </div>
      </div>

      {/* Schedule & Venue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="create-event-date">
            Start Date <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            className={FIELD_CLASS}
            id="create-event-date"
            name="event_date"
            required
            type="date"
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="create-event-start-hour">
            Start Time <span className="text-[#BA3C2A]">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <select
              className={PART_CLASS}
              defaultValue=""
              id="create-event-start-hour"
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
              id="create-event-start-minute"
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
              id="create-event-meridiem"
              name="meridiem"
              required
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <span className={HINT_CLASS}>12-hour clock, West Africa Time.</span>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="create-event-duration-days">
            Runs For <span className="text-[#BA3C2A]">*</span>
          </label>
          <select
            className={FIELD_CLASS}
            defaultValue="1"
            id="create-event-duration-days"
            name="duration_days"
            required
          >
            {DURATION_OPTIONS.map((days) => (
              <option key={days} value={String(days)}>
                {formatEventDurationLabel(days)}
              </option>
            ))}
          </select>
          <span className={HINT_CLASS}>
            The last day keeps the event live all day, even after its start has
            passed.
          </span>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="create-event-location">
            Location / Venue <span className="text-[#BA3C2A]">*</span>
          </label>
          <input
            className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            defaultValue="Fobbs Apartment, Michael Fidelis Nwaefulu Street, GRA Phase 1, Asaba"
            id="create-event-location"
            maxLength={200}
            name="location"
            required
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className={LABEL_CLASS} htmlFor="create-event-description">
          Event Description & Agenda Outline
        </label>
        <textarea
          className="w-full h-24 p-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          id="create-event-description"
          maxLength={2000}
          name="description"
          placeholder="Official agenda, keynote items, dress code, or special member instructions..."
          rows={3}
        />
      </div>

      {/* Feature Configuration */}
      <div className="bg-white p-5 rounded-2xl border border-[#E5DDD3] space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#E5DDD3]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D6A23A]" />
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#3D291F]">
              Event Feature Configuration
            </h4>
          </div>
          <span className="text-[11px] text-[#7A685D]">
            Feature choices are permanently locked upon event creation
          </span>
        </div>

        {eventType === "party" && (
          <div className="space-y-3 pt-1">
            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
              <span>
                Parties & Gala banquets automatically activate the complete
                financial management suite:{" "}
                <strong className="text-[#3D291F]">
                  Budget Allocations, Non-Dues Revenues, and Disbursement
                  Tracking
                </strong>
                .
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#174C37]/30 bg-[#FAF6F0] text-xs font-semibold text-[#174C37]">
                <input
                  checked={true}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="budget_enabled"
                  readOnly
                  type="checkbox"
                  value="enabled"
                />
                <span>Budget System</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#174C37]/30 bg-[#FAF6F0] text-xs font-semibold text-[#174C37]">
                <input
                  checked={true}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="income_enabled"
                  readOnly
                  type="checkbox"
                  value="enabled"
                />
                <span>Revenues</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#174C37]/30 bg-[#FAF6F0] text-xs font-semibold text-[#174C37]">
                <input
                  checked={true}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="expenses_enabled"
                  readOnly
                  type="checkbox"
                  value="enabled"
                />
                <span>Disbursements</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-semibold text-[#3D291F] cursor-pointer">
                <input
                  checked={ticketingEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37] focus:ring-[#174C37]"
                  name="ticketing_enabled"
                  onChange={(e) => setTicketingEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Ticketing Passes</span>
              </label>
            </div>
          </div>
        )}

        {eventType === "other" && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] cursor-pointer">
                <input
                  checked={minutesEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37] focus:ring-[#174C37]"
                  name="minutes_enabled"
                  onChange={(e) => setMinutesEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Meeting Minutes & Secretarial Record</span>
              </label>

              <label className="flex items-center gap-2 p-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] cursor-pointer">
                <input
                  checked={attendanceEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37] focus:ring-[#174C37]"
                  name="attendance_enabled"
                  onChange={(e) => setAttendanceEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Member Attendance Roster & Check-In</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F] cursor-pointer">
                <input
                  checked={budgetEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="budget_enabled"
                  onChange={(e) => setBudgetEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Budget & Allocations</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F] cursor-pointer">
                <input
                  checked={incomeEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="income_enabled"
                  onChange={(e) => setIncomeEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Other Revenue</span>
              </label>

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E5DDD3] bg-white text-xs font-medium text-[#3D291F] cursor-pointer">
                <input
                  checked={expensesEnabled}
                  className="rounded border-[#E5DDD3] text-[#174C37]"
                  name="expenses_enabled"
                  onChange={(e) => setExpensesEnabled(e.target.checked)}
                  type="checkbox"
                  value="enabled"
                />
                <span>Disbursements</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Form Submission Station */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-[#E5DDD3]">
        <div className="text-xs text-[#7A685D] flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-[#174C37]" />
          <span>Authorized by Executive Council Governance</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            className="cf-btn cf-btn--neutral min-h-[44px] px-5 py-2.5 rounded-xl inline-flex items-center justify-center text-xs font-bold"
            href="/events"
          >
            Cancel
          </Link>
          <FormSubmitButton
            className="cf-btn cf-btn--primary min-h-[44px] px-6 py-2.5 rounded-xl cursor-pointer"
            pendingLabel="Creating Event…"
            statusToastMessage="Publishing new event to the club calendar."
          >
            Publish & Create Event
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}
