"use client";

import {
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { createEventAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui";

interface CreateEventDisclosureProps {
  canCreate: boolean;
  userRoleTitle: string;
}

type EventType = "meeting" | "party" | "other";

export function CreateEventDisclosure({
  canCreate,
  userRoleTitle,
}: CreateEventDisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>("meeting");
  const [minutesEnabled, setMinutesEnabled] = useState(true);
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [incomeEnabled, setIncomeEnabled] = useState(false);
  const [expensesEnabled, setExpensesEnabled] = useState(false);
  const [ticketingEnabled, setTicketingEnabled] = useState(false);

  if (!canCreate) return null;

  const handleTypeChange = (newType: EventType) => {
    setEventType(newType);
    if (newType === "meeting") {
      setMinutesEnabled(true);
      setAttendanceEnabled(true);
      setBudgetEnabled(false);
      setIncomeEnabled(false);
      setExpensesEnabled(false);
      setTicketingEnabled(false);
    } else if (newType === "party") {
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
    <section aria-labelledby="create-event-heading" className="space-y-4">
      {/* Collapsible Disclosure Header Card */}
      <div className="bg-white rounded-2xl border border-[#174C37]/30 shadow-xs overflow-hidden">
        <button
          className="cf-btn cf-btn--accordion sm:p-6 cursor-pointer"
          id="create-event-toggle-btn"
          onClick={() => setIsOpen(!isOpen)}
          type="button"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <CalendarPlus className="w-5 h-5 text-[#D6A23A]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  className="text-base font-extrabold text-[#3D291F]"
                  id="create-event-heading"
                >
                  Create New Club Event
                </h3>
                <span className="hidden sm:inline-flex text-[11px] font-mono text-[#174C37] bg-[#FAF6F0] px-2.5 py-0.5 rounded border border-[#E5DDD3] font-bold">
                  Executive Desk
                </span>
              </div>
              <p className="text-xs text-[#7A685D] font-medium mt-0.5">
                Authorized for Executive Council and Club Administrators ·{" "}
                {userRoleTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#174C37] shrink-0">
            <span>{isOpen ? "Hide Creation Form" : "Schedule Event"}</span>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-[#174C37]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#174C37]" />
            )}
          </div>
        </button>

        {/* Collapsible Form Body */}
        {isOpen && (
          <div className="p-6 sm:p-8 border-t border-[#E5DDD3] bg-[#FAF6F0]/40 animate-in fade-in duration-200">
            <form action={createEventAction} className="space-y-6 max-w-4xl">
              {/* Event Title & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label
                    className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                    htmlFor="create-event-title"
                  >
                    Event Title <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="create-event-title"
                    maxLength={120}
                    name="title"
                    placeholder="e.g. End-of-Year Gala & Banquet"
                    required
                  />
                </div>

                <div>
                  <label
                    className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                    htmlFor="create-event-type"
                  >
                    Event Classification{" "}
                    <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <select
                    className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="create-event-type"
                    name="event_type"
                    onChange={(e) =>
                      handleTypeChange(e.target.value as EventType)
                    }
                    required
                    value={eventType}
                  >
                    <option value="meeting">General Meeting</option>
                    <option value="party">Party / Gala Banquet</option>
                    <option value="other">Other Gathering / Outreach</option>
                  </select>
                </div>
              </div>

              {/* Schedule & Venue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                    htmlFor="create-event-starts-at"
                  >
                    Date & Time <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="create-event-starts-at"
                    name="starts_at"
                    required
                    type="datetime-local"
                  />
                  <span className="text-[10px] text-[#7A685D] mt-1 block">
                    Enter the scheduled date and start time for the gathering.
                  </span>
                </div>

                <div>
                  <label
                    className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                    htmlFor="create-event-location"
                  >
                    Location / Venue <span className="text-[#BA3C2A]">*</span>
                  </label>
                  <input
                    className="w-full h-11 px-3.5 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    defaultValue="Club Secretariat & Assembly Hall, Nnebisi Road, Asaba"
                    id="create-event-location"
                    maxLength={200}
                    name="location"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                  htmlFor="create-event-description"
                >
                  Event Description & Agenda Outline
                </label>
                <textarea
                  className="w-full h-20 p-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="create-event-description"
                  maxLength={2000}
                  name="description"
                  placeholder="Official agenda, keynote items, dress code, or special member instructions..."
                  rows={2}
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

                {eventType === "meeting" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] cursor-pointer">
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

                    <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#E5DDD3] bg-[#FAF6F0] text-xs font-semibold text-[#3D291F] cursor-pointer">
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
                )}

                {eventType === "party" && (
                  <div className="space-y-3 pt-1">
                    <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#5C4638] flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-[#174C37] shrink-0 mt-0.5" />
                      <span>
                        Parties & Gala banquets automatically activate the
                        complete financial management suite:
                        <strong className="text-[#3D291F]">
                          {" "}
                          Budget Allocations, Non-Dues Revenues, and
                          Disbursement Tracking
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
                          onChange={(e) =>
                            setTicketingEnabled(e.target.checked)
                          }
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
                          onChange={(e) =>
                            setAttendanceEnabled(e.target.checked)
                          }
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
                  <button
                    className="cf-btn cf-btn--neutral min-h-[44px] px-4 py-2.5 rounded-xl cursor-pointer"
                    onClick={() => setIsOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
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
          </div>
        )}
      </div>
    </section>
  );
}
