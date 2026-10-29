"use client";

import { Edit2, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { correctEventAttendanceAction } from "@/app/actions";
import { FormSubmitButton } from "@/components/ui/cf-button";
import { useModalHygiene } from "@/lib/use-modal-hygiene";
import type { AttendanceRow, MemberRow } from "./attendance-types";

interface AttendanceRosterTableProps {
  eventId: string;
  attendance: AttendanceRow[];
  members: Map<string, MemberRow>;
  canCorrect: boolean;
  returnTo?: string;
}

const statusLabels: Record<string, string> = {
  present: "Present",
  late: "Late Arrival",
  absent: "Absent",
  rejected: "Rejected",
};

const statusStyles: Record<string, string> = {
  present: "text-[#174C37] bg-[#174C37]/10 border-[#174C37]/30",
  late: "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30",
  absent: "text-[#7A685D] bg-[#FAF6F0] border-[#E5DDD3]",
  rejected: "text-[#BA3C2A] bg-[#BA3C2A]/10 border-[#BA3C2A]/30",
};

const watShortDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AttendanceRosterTable({
  eventId,
  attendance,
  members,
  canCorrect,
  returnTo,
}: AttendanceRosterTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [correctingRecord, setCorrectingRecord] =
    useState<AttendanceRow | null>(null);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((row) => {
      const person = members.get(row.member_id);
      const nameMatch =
        !searchQuery.trim() ||
        (person &&
          (person.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            person.username.toLowerCase().includes(searchQuery.toLowerCase())));

      const statusMatch =
        selectedStatus === "all" || row.attendance_status === selectedStatus;

      return nameMatch && statusMatch;
    });
  }, [attendance, members, searchQuery, selectedStatus]);

  const correctingMember = correctingRecord
    ? members.get(correctingRecord.member_id)
    : null;

  useModalHygiene({
    isOpen: correctingRecord !== null,
    onClose: () => setCorrectingRecord(null),
  });

  return (
    <section
      aria-labelledby="attendance-roster-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
            <Users className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-extrabold text-[#3D291F]"
                id="attendance-roster-heading"
              >
                Verified Attendance Roster
              </h2>
              <span className="text-xs font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2.5 py-0.5 rounded-full border border-[#E5DDD3]">
                {attendance.length} Records
              </span>
            </div>
            <p className="text-xs text-[#7A685D]">
              Secretariat check-in ledger with automated audit justifications
            </p>
          </div>
        </div>

        <span className="text-xs text-[#7A685D] hidden sm:inline">
          Official Quorum Record
        </span>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        {/* Status Filter */}
        <div className="flex items-center gap-1 p-1 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] overflow-x-auto">
          {[
            { id: "all", label: "All Members" },
            { id: "present", label: "Present" },
            { id: "late", label: "Late" },
            { id: "absent", label: "Absent" },
          ].map((statusItem) => (
            <button
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-colors min-h-[38px] cursor-pointer ${
                selectedStatus === statusItem.id
                  ? "bg-[#174C37] text-white shadow-xs border-0"
                  : "bg-transparent border-0 text-[#5C4638] hover:text-[#174C37]"
              }`}
              key={statusItem.id}
              onClick={() => setSelectedStatus(statusItem.id)}
              type="button"
            >
              {statusItem.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="w-full h-9 pl-9 pr-3 text-xs bg-white border border-[#E5DDD3] rounded-xl text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search member name..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Roster Table & Cards */}
      {filteredAttendance.length ? (
        <>
          {/* Mobile Attendance Cards (sm:hidden) */}
          <div className="sm:hidden divide-y divide-[#E5DDD3] rounded-xl border border-[#E5DDD3] bg-white overflow-hidden shadow-2xs">
            {filteredAttendance.map((row) => {
              const person = members.get(row.member_id);
              const statusBadge =
                statusStyles[row.attendance_status] ??
                "text-[#3D291F] bg-[#FAF6F0] border-[#E5DDD3]";

              return (
                <div
                  className="p-3.5 space-y-2.5 bg-white"
                  key={`mobile-attendance-${row.member_id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-[#3D291F]">
                        {person ? person.full_name : "Former Club Member"}
                      </h4>
                      <span className="text-[11px] font-mono text-[#6B5D53]">
                        @{person?.username ?? "unknown"}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge}`}
                    >
                      {statusLabels[row.attendance_status] ??
                        row.attendance_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#6B5D53] pt-1">
                    <div>
                      <span className="block font-medium text-[#3D291F]">
                        {row.checked_in_at
                          ? row.check_in_method === "qr"
                            ? "QR Scan"
                            : "Self Check-In"
                          : "Session Default (No Check-in)"}
                      </span>
                      {row.checked_in_at && (
                        <span className="text-[11px] font-mono text-[#6B5D53]">
                          {watShortDateTime.format(new Date(row.checked_in_at))}{" "}
                          WAT
                        </span>
                      )}
                    </div>

                    {canCorrect && (
                      <button
                        className="px-3 py-1.5 text-xs font-semibold text-[#174C37] bg-[#FAF6F0] border border-[#174C37]/30 hover:bg-[#174C37] hover:text-white rounded-lg transition-colors cursor-pointer min-h-[38px]"
                        onClick={() => setCorrectingRecord(row)}
                        type="button"
                      >
                        Correct
                      </button>
                    )}
                  </div>

                  {row.correction_reason && (
                    <div className="p-2 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#BA3C2A]">
                      <span className="font-bold block">Corrected:</span>
                      <span className="italic">{row.correction_reason}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto rounded-xl border border-[#E5DDD3]">
            <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF6F0] border-b border-[#E5DDD3] text-[#54433A] font-bold text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Attendance Status</th>
                <th className="py-3 px-4">Verification Method & Time</th>
                <th className="py-3 px-4">Audit / Correction</th>
                {canCorrect && (
                  <th className="py-3 px-4 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DDD3] bg-white">
              {filteredAttendance.map((row) => {
                const person = members.get(row.member_id);
                const statusBadge =
                  statusStyles[row.attendance_status] ??
                  "text-[#3D291F] bg-[#FAF6F0] border-[#E5DDD3]";

                return (
                  <tr
                    key={row.member_id}
                    className="hover:bg-[#FAF6F0]/40 transition-colors"
                  >
                    {/* Member */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#3D291F]">
                        {person ? person.full_name : "Former Club Member"}
                      </div>
                      <div className="text-[11px] font-mono text-[#7A685D]">
                        @{person?.username ?? "unknown"}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge}`}
                      >
                        {statusLabels[row.attendance_status] ??
                          row.attendance_status}
                      </span>
                    </td>

                    {/* Method & Time */}
                    <td className="py-3 px-4 text-[#5C4638]">
                      {row.checked_in_at ? (
                        <div>
                          <span className="font-semibold text-[#3D291F]">
                            {row.check_in_method === "qr"
                              ? "QR Scan"
                              : "Self Check-In"}
                          </span>
                          <span className="text-[11px] text-[#7A685D] block font-mono">
                            {watShortDateTime.format(
                              new Date(row.checked_in_at),
                            )}{" "}
                            WAT
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#7A685D] italic">
                          Session Default (No Check-in)
                        </span>
                      )}
                    </td>

                    {/* Audit note */}
                    <td className="py-3 px-4 text-[11px]">
                      {row.correction_reason ? (
                        <div className="p-1.5 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] text-[#BA3C2A]">
                          <span className="font-bold block">Corrected:</span>
                          <span className="italic">
                            {row.correction_reason}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#7A685D]">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    {canCorrect && (
                      <td className="py-3 px-4 text-right">
                        <button
                          className="px-2.5 py-1 text-xs font-semibold text-[#174C37] bg-transparent border-0 hover:bg-[#174C37]/10 rounded-md transition-colors cursor-pointer min-h-[30px]"
                          onClick={() => setCorrectingRecord(row)}
                          type="button"
                        >
                          Correct
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    ) : (
        <div className="p-8 rounded-xl bg-[#FAF6F0]/40 border border-[#E5DDD3] text-center space-y-2">
          <Users className="w-6 h-6 text-[#7A685D] mx-auto opacity-60" />
          <h3 className="text-xs font-bold text-[#3D291F]">
            No Attendance Records Match Filter
          </h3>
          <p className="text-xs text-[#7A685D]">
            Try adjusting your search criteria or filter tags.
          </p>
        </div>
      )}

      {/* Correction Modal */}
      {correctingRecord && (
        <div
          aria-labelledby="attendance-correction-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0C3325]/75 backdrop-blur-xs"
          role="dialog"
        >
          <div className="bg-white rounded-2xl border border-[#E5DDD3] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#174C37] text-white flex items-center justify-center font-bold text-base shadow-xs">
                  <Edit2 className="w-5 h-5 text-[#D6A23A]" />
                </div>
                <div>
                  <h3
                    className="text-base font-extrabold text-[#3D291F]"
                    id="attendance-correction-title"
                  >
                    Correct Attendance Record
                  </h3>
                  <p className="text-xs text-[#7A685D]">
                    Audited administrative correction
                  </p>
                </div>
              </div>

              <button
                aria-label="Close dialog"
                className="p-2 text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] rounded-lg hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
                onClick={() => setCorrectingRecord(null)}
                type="button"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form
              action={correctEventAttendanceAction}
              className="p-6 space-y-4"
            >
              <input name="event_id" type="hidden" value={eventId} />
              {returnTo && (
                <input name="return_to" type="hidden" value={returnTo} />
              )}
              <input
                name="member_id"
                type="hidden"
                value={correctingRecord.member_id}
              />

              <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs">
                <span className="text-[#7A685D] block text-[11px]">
                  Member:
                </span>
                <strong className="text-[#3D291F] text-sm">
                  {correctingMember?.full_name ?? "Club Member"}
                </strong>
                <span className="text-[#7A685D] block text-[11px] font-mono">
                  @{correctingMember?.username ?? ""} · Current:{" "}
                  {statusLabels[correctingRecord.attendance_status] ??
                    correctingRecord.attendance_status}
                </span>
              </div>

              <div>
                <label
                  className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                  htmlFor="correct-attendance-status"
                >
                  New Attendance Status{" "}
                  <span className="text-[#BA3C2A]">*</span>
                </label>
                <select
                  className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-bold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  defaultValue={correctingRecord.attendance_status}
                  id="correct-attendance-status"
                  name="attendance_status"
                  required
                >
                  <option value="present">Present (Verified In Person)</option>
                  <option value="absent">Absent</option>
                  <option value="rejected">Reject Check-in</option>
                </select>
              </div>

              <div>
                <label
                  className="block text-[11px] font-bold text-[#54433A] uppercase tracking-wider mb-1.5"
                  htmlFor="correct-attendance-reason"
                >
                  Governance Correction Reason{" "}
                  <span className="text-[#BA3C2A]">*</span>
                </label>
                <input
                  className="w-full h-10 px-3 bg-white border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#B8ACA0] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
                  id="correct-attendance-reason"
                  maxLength={500}
                  name="reason"
                  placeholder="e.g. Member arrived before adjournment, device camera malfunctioned"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5DDD3]">
                <button
                  className="px-4 py-2 rounded-xl border border-[#E5DDD3] bg-white text-xs font-bold text-[#54433A] hover:bg-[#FAF6F0] cursor-pointer min-h-[40px]"
                  onClick={() => setCorrectingRecord(null)}
                  type="button"
                >
                  Cancel
                </button>
                <FormSubmitButton
                  className="min-h-[40px]"
                  loadingText="Auditing..."
                >
                  Save &amp; Audit Correction
                </FormSubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
