"use client";

import { AlertTriangle, QrCode, Sliders } from "lucide-react";
import { useState } from "react";
import {
  closeEventAttendanceAction,
  openEventAttendanceAction,
  setAttendanceDefaultAction,
} from "@/app/actions";
import { AttendanceQrIssuer } from "./attendance-controls";
import type { SessionRow } from "./attendance-types";

interface OfficerSessionControlsProps {
  eventId: string;
  session: SessionRow | null;
  sessionOpen: boolean;
  defaultCutoff: number;
  mutableForSession: boolean;
  returnTo?: string;
}

const watShortDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function OfficerSessionControls({
  eventId,
  session,
  sessionOpen,
  defaultCutoff,
  mutableForSession,
  returnTo,
}: OfficerSessionControlsProps) {
  const [activeTab, setActiveTab] = useState<"session" | "settings">("session");

  return (
    <section
      aria-labelledby="officer-controls-heading"
      className="bg-white rounded-2xl border border-[#174C37]/30 p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold shadow-xs">
            <Sliders className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-extrabold text-[#3D291F]"
                id="officer-controls-heading"
              >
                Officer Attendance Desk
              </h2>
              <span className="text-[10px] font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
                Admin / Executive
              </span>
            </div>
            <p className="text-xs text-[#7A685D]">
              Manage check-in session timing, issue live 90s QR tokens, and
              configure late arrival policies
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] self-start sm:self-auto">
          <button
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[34px] ${
              activeTab === "session"
                ? "bg-[#174C37] text-white shadow-xs border-0"
                : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
            }`}
            onClick={() => setActiveTab("session")}
            type="button"
          >
            Live Session & QR
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer min-h-[34px] ${
              activeTab === "settings"
                ? "bg-[#174C37] text-white shadow-xs border-0"
                : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
            }`}
            onClick={() => setActiveTab("settings")}
            type="button"
          >
            Club Cutoff Settings
          </button>
        </div>
      </div>

      {activeTab === "session" && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Current Session Telemetry */}
          <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A685D]">
                Session Telemetry
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  sessionOpen
                    ? "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30"
                    : session
                      ? "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]"
                      : "text-[#D6A23A] bg-[#D6A23A]/10 border-[#D6A23A]/30"
                }`}
              >
                {session
                  ? sessionOpen
                    ? "Session Active"
                    : "Session Concluded"
                  : "Not Yet Opened"}
              </span>
            </div>

            {session ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#7A685D] block text-[11px]">
                    Opened At:
                  </span>
                  <span className="font-mono font-bold text-[#3D291F]">
                    {watShortDateTime.format(new Date(session.opened_at))} WAT
                  </span>
                </div>
                <div>
                  <span className="text-[#7A685D] block text-[11px]">
                    Late Cutoff ({session.late_after_minutes}m):
                  </span>
                  <span className="font-mono font-bold text-[#BA3C2A]">
                    {watShortDateTime.format(new Date(session.late_after_at))}{" "}
                    WAT
                  </span>
                </div>
                <div>
                  <span className="text-[#7A685D] block text-[11px]">
                    Status:
                  </span>
                  <span className="font-semibold text-[#174C37]">
                    {session.closed_at
                      ? `Closed at ${watShortDateTime.format(new Date(session.closed_at))} WAT`
                      : "Accepting Member Check-Ins"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#5C4638]">
                {mutableForSession
                  ? "Check-in has not been opened yet. Set the event-specific cutoff or use the club default to begin recording."
                  : "This event is locked or concluded. Attendance sessions can only be opened for scheduled active gatherings."}
              </p>
            )}
          </div>

          {/* Action 1: Open Check-In Session */}
          {!session && mutableForSession && (
            <div className="p-5 rounded-xl border border-[#174C37]/30 bg-white space-y-4 shadow-xs">
              <div>
                <h3 className="text-sm font-extrabold text-[#3D291F]">
                  Open Check-In Session
                </h3>
                <p className="text-xs text-[#7A685D]">
                  Members will be permitted to check in. Check-ins after the
                  cutoff will be automatically marked Late.
                </p>
              </div>

              <form action={openEventAttendanceAction} className="space-y-4">
                <input name="event_id" type="hidden" value={eventId} />
                {returnTo && (
                  <input name="return_to" type="hidden" value={returnTo} />
                )}
                <div className="max-w-xs">
                  <label
                    className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                    htmlFor="open-late-after-minutes"
                  >
                    Event-Specific Late Cutoff (Minutes)
                  </label>
                  <input
                    className="w-full h-10 px-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-xl text-xs font-semibold text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                    id="open-late-after-minutes"
                    max="240"
                    min="0"
                    name="late_after_minutes"
                    placeholder={`Club default: ${defaultCutoff} min`}
                    type="number"
                  />
                  <span className="text-[10px] text-[#7A685D] mt-1 block">
                    Leave blank to inherit the club default ({defaultCutoff}{" "}
                    minutes).
                  </span>
                </div>

                <button
                  className="px-5 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[42px]"
                  type="submit"
                >
                  Open Attendance Session Now
                </button>
              </form>
            </div>
          )}

          {/* Action 2: Session Active Tools (QR Issuer & Close Session) */}
          {sessionOpen && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
              {/* QR Token Issuer */}
              <div className="p-5 rounded-xl border border-[#E5DDD3] bg-white space-y-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#174C37]" />
                  <h3 className="text-sm font-extrabold text-[#3D291F]">
                    Dynamic 90-Second Check-In QR
                  </h3>
                </div>
                <p className="text-xs text-[#7A685D]">
                  Project or display this cryptographic token on the assembly
                  screen. The token automatically expires every 90 seconds.
                </p>
                <div className="pt-2">
                  <AttendanceQrIssuer eventId={eventId} />
                </div>
              </div>

              {/* Close Session Form */}
              <div className="p-5 rounded-xl border border-[#BA3C2A]/30 bg-white space-y-3 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[#BA3C2A]">
                    <AlertTriangle className="w-4 h-4" />
                    <h3 className="text-sm font-extrabold">
                      Conclude Attendance Session
                    </h3>
                  </div>
                  <p className="text-xs text-[#7A685D] mt-1.5 leading-relaxed">
                    Closing the session immediately marks all members who have
                    not checked in as{" "}
                    <strong className="text-[#BA3C2A]">Absent</strong>. Check-in
                    buttons and QR codes will be deactivated.
                  </p>
                </div>

                <form action={closeEventAttendanceAction} className="pt-3">
                  <input name="event_id" type="hidden" value={eventId} />
                  {returnTo && (
                    <input name="return_to" type="hidden" value={returnTo} />
                  )}
                  <button
                    className="w-full px-4 py-2.5 rounded-xl bg-[#BA3C2A] hover:bg-[#9B2F20] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[42px]"
                    type="submit"
                  >
                    Close Session & Mark Missing Absent
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="p-5 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-4 animate-in fade-in duration-150">
          <div>
            <h3 className="text-sm font-extrabold text-[#3D291F]">
              Club-Wide Default Late Cutoff Setting
            </h3>
            <p className="text-xs text-[#7A685D]">
              Sets the baseline minutes after scheduled event start time before
              check-in is flagged late across all club events.
            </p>
          </div>

          <form
            action={setAttendanceDefaultAction}
            className="space-y-4 max-w-lg"
          >
            <input name="event_id" type="hidden" value={eventId} />
            {returnTo && (
              <input name="return_to" type="hidden" value={returnTo} />
            )}

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="default-cutoff-minutes"
              >
                Default Late Cutoff (Minutes){" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                defaultValue={defaultCutoff}
                id="default-cutoff-minutes"
                max="240"
                min="0"
                name="late_after_minutes"
                required
                type="number"
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                htmlFor="default-cutoff-reason"
              >
                Reason for Changing Club Baseline{" "}
                <span className="text-[#BA3C2A]">*</span>
              </label>
              <input
                className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                id="default-cutoff-reason"
                maxLength={500}
                name="reason"
                placeholder="e.g. Club resolution adopting 20-minute traffic grace period"
                required
              />
            </div>

            <div className="pt-2">
              <button
                className="px-5 py-2.5 rounded-xl bg-[#174C37] hover:bg-[#103D2B] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer min-h-[42px]"
                type="submit"
              >
                Save Club-Wide Default Policy
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
