"use client";

import { CheckCircle2, Shield, UserCheck } from "lucide-react";
import { AttendanceCheckIn } from "./attendance-controls";
import type { AttendanceRow } from "./attendance-types";

interface CheckinCardProps {
  eventId: string;
  sessionOpen: boolean;
  isMutable: boolean;
  ownAttendance?: AttendanceRow;
  canReviewAttendance: boolean;
  returnTo?: string;
}

const statusConfig: Record<
  string,
  { label: string; badge: string; desc: string }
> = {
  present: {
    label: "Present (On Time)",
    badge: "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30",
    desc: "Your attendance was verified within the scheduled assembly time.",
  },
  late: {
    label: "Late Arrival",
    badge: "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30",
    desc: "Your attendance was recorded after the designated late cutoff.",
  },
  absent: {
    label: "Recorded Absent",
    badge: "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]",
    desc: "Attendance session concluded without a recorded member check-in.",
  },
  rejected: {
    label: "Check-in Rejected",
    badge: "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30",
    desc: "Check-in was rejected by secretariat audit.",
  },
};

const watDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function CheckinCard({
  eventId,
  sessionOpen,
  isMutable,
  ownAttendance,
  canReviewAttendance,
  returnTo,
}: CheckinCardProps) {
  const currentStatus = ownAttendance
    ? (statusConfig[ownAttendance.attendance_status] ?? {
        label: ownAttendance.attendance_status,
        badge: "text-[#3D291F] bg-[#FAF6F0] border-[#E5DDD3]",
        desc: "Attendance status recorded.",
      })
    : null;

  return (
    <section
      aria-labelledby="checkin-card-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <h2
              className="text-base font-extrabold text-[#3D291F]"
              id="checkin-card-heading"
            >
              Member Self-Check-In
            </h2>
            <p className="text-xs text-[#7A685D]">
              Record personal attendance for this session
            </p>
          </div>
        </div>

        {currentStatus ? (
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${currentStatus.badge}`}
          >
            {currentStatus.label}
          </span>
        ) : (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold text-[#7A685D] bg-[#FAF6F0] border border-[#E5DDD3]">
            {sessionOpen ? "Check-In Open" : "Check-In Closed"}
          </span>
        )}
      </div>

      {ownAttendance ? (
        <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#174C37]">
            <CheckCircle2 className="w-4 h-4 text-[#174C37]" />
            <span>Attendance Successfully Confirmed</span>
          </div>
          <p className="text-[#5C4638]">{currentStatus?.desc}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#E5DDD3] text-[#7A685D] font-mono text-[11px]">
            <div>
              Method:{" "}
              <strong className="text-[#3D291F]">
                {ownAttendance.check_in_method === "qr"
                  ? "QR Scan"
                  : "Member Portal"}
              </strong>
            </div>
            {ownAttendance.checked_in_at && (
              <div>
                Time:{" "}
                <strong className="text-[#3D291F]">
                  {watDateTime.format(new Date(ownAttendance.checked_in_at))}{" "}
                  WAT
                </strong>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[#5C4638] leading-relaxed">
            {sessionOpen && isMutable
              ? "The attendance session is currently active. Click below to verify and record your physical presence."
              : "Check-in is currently inactive. An Executive or Club Admin must open the attendance session."}
          </p>

          <div className="pt-1">
            <AttendanceCheckIn
              alreadyCheckedIn={Boolean(ownAttendance)}
              eventId={eventId}
              returnTo={returnTo}
              sessionOpen={sessionOpen && isMutable}
            />
          </div>
        </div>
      )}

      {!canReviewAttendance && (
        <div className="pt-2 border-t border-[#E5DDD3] flex items-center gap-2 text-[11px] text-[#7A685D]">
          <Shield className="w-3.5 h-3.5 text-[#174C37]" />
          <span>
            Under General Assembly privacy policy, only your personal attendance
            record is visible.
          </span>
        </div>
      )}
    </section>
  );
}
