"use client";

import { AlertTriangle, ShieldAlert, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assignEventRoleAction, revokeEventRoleAction } from "@/app/actions";
import { FormFieldHint } from "@/components/ui";
import { dispatchActionStatusToast } from "@/components/ui/flash-card";
import type {
  DashboardClubMember,
  DashboardTeamMember,
} from "../dashboard-types";

interface EventTeamRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventTitle: string;
  clubMembers: DashboardClubMember[];
  existingMemberIds: string[];
  mode: "assign" | "revoke";
  targetMember?: DashboardTeamMember | null;
  returnTo?: string;
}

export function EventTeamRoleModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  clubMembers,
  existingMemberIds,
  mode,
  targetMember = null,
  returnTo,
}: EventTeamRoleModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState("committee");
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  const availableMembers = useMemo(() => {
    const assigned = new Set(existingMemberIds);
    return clubMembers.filter((m) => !assigned.has(m.id));
  }, [clubMembers, existingMemberIds]);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
      setReason("");
      setSelectedMemberId("");
      setSelectedRole("committee");
      return;
    }

    if (mode === "assign" && availableMembers.length > 0) {
      setSelectedMemberId(availableMembers[0].id);
    }

    const previous = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [isOpen, mode, availableMembers, onClose]);

  if (!isOpen) return null;
  if (mode === "revoke" && !targetMember?.memberId) return null;

  const isRevoke = mode === "revoke";
  const effectiveMembers =
    availableMembers.length > 0 ? availableMembers : clubMembers;

  return (
    <div
      aria-labelledby="team-role-modal-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4 sm:items-center bg-[#0C3325]/75 backdrop-blur-xs animate-in fade-in duration-150"
      ref={dialogRef}
      role="dialog"
    >
      <button
        aria-label="Close modal overlay"
        className="fixed inset-0 cursor-default bg-transparent border-0"
        onClick={onClose}
        type="button"
      />
      <div className="relative z-10 bg-white rounded-t-2xl sm:rounded-2xl border border-[#E5DDD3] w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-[#E5DDD3] bg-[#FAF6F0] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isRevoke ? "bg-[#BA3C2A] text-white" : "bg-[#174C37] text-white"
              }`}
            >
              {isRevoke ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <UserPlus className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3
                className="text-base font-bold text-[#3D291F]"
                id="team-role-modal-title"
              >
                {isRevoke ? "Remove Committee Member" : "Assign Team Member"}
              </h3>
              <p className="text-xs text-[#7A685D]">
                {isRevoke
                  ? `Revoke assignment for ${eventTitle}`
                  : `Delegate planning role for ${eventTitle}`}
              </p>
            </div>
          </div>

          <button
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#7A685D] bg-transparent border-0 hover:text-[#3D291F] hover:bg-[#E5DDD3]/50 transition-colors cursor-pointer"
            onClick={onClose}
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form
          action={isRevoke ? revokeEventRoleAction : assignEventRoleAction}
          className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs"
          onSubmit={() => {
            setIsSubmitting(true);
            dispatchActionStatusToast({
              title: isRevoke ? "Removing Assignment…" : "Assigning Role…",
              message: isRevoke
                ? `Updating committee roster for ${targetMember?.name ?? "member"}.`
                : `Updating committee roster for ${eventTitle}.`,
            });
          }}
        >
          <input name="event_id" type="hidden" value={eventId} />
          {returnTo && (
            <input name="return_to" type="hidden" value={returnTo} />
          )}

          {isRevoke && targetMember ? (
            <>
              <input
                name="member_id"
                type="hidden"
                value={targetMember.memberId}
              />
              <div className="p-3.5 rounded-xl bg-[#FDF2F0] border border-[#BA3C2A]/30 flex items-start gap-2.5 text-[#7A271A]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#BA3C2A]" />
                <div>
                  <span className="font-bold text-[#3D291F] block">
                    {targetMember.name}
                    {targetMember.username
                      ? ` (@${targetMember.username})`
                      : ""}
                  </span>
                  <span className="text-[11px] block mt-0.5">
                    Current role: <strong>{targetMember.role}</strong>. They
                    will no longer be able to coordinate event tasks under this
                    assignment.
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  className="block text-[11px] font-bold text-[#5C4638] uppercase tracking-wider mb-1.5"
                  htmlFor="assign-team-member"
                >
                  Active Club Member
                </label>
                {effectiveMembers.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D] flex items-center gap-2">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>
                      All active club members already have roles here.
                    </span>
                  </div>
                ) : (
                  <select
                    className="w-full min-h-[44px] px-3 py-2 bg-[#FAF6F0] border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] cursor-pointer"
                    id="assign-team-member"
                    name="member_id"
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    required
                    value={selectedMemberId}
                  >
                    {effectiveMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName}
                        {member.username ? ` (@${member.username})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label
                  className="block text-[11px] font-bold text-[#5C4638] uppercase tracking-wider mb-1.5"
                  htmlFor="assign-team-role"
                >
                  Event Role
                </label>
                <select
                  className="w-full min-h-[44px] px-3 py-2 bg-[#FAF6F0] border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37] cursor-pointer"
                  id="assign-team-role"
                  name="event_role"
                  onChange={(e) => setSelectedRole(e.target.value)}
                  required
                  value={selectedRole}
                >
                  <option value="lead">Event Lead</option>
                  <option value="assistant">Event Assistant</option>
                  <option value="committee">Committee Member</option>
                </select>
                <FormFieldHint message="Event Leads & Assistants can record entries and edit logistics while scheduled." />
              </div>
            </>
          )}

          <div>
            <label
              className="block text-[11px] font-bold text-[#5C4638] uppercase tracking-wider mb-1.5"
              htmlFor="team-role-reason"
            >
              Reason (Audit Log) <span className="text-[#BA3C2A]">*</span>
            </label>
            <input
              className="w-full min-h-[44px] px-3 py-2 bg-[#FAF6F0] border border-[#E5DDD3] rounded-xl text-xs font-medium text-[#3D291F] placeholder:text-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
              id="team-role-reason"
              maxLength={500}
              name="reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                isRevoke
                  ? "e.g. Role reassigned to another coordinator"
                  : "e.g. Appointed logistics lead for December event"
              }
              required
              type="text"
              value={reason}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5DDD3]">
            <button
              className="px-4 py-2 min-h-[44px] rounded-xl border border-[#E5DDD3] bg-white text-[#5C4638] font-semibold hover:bg-[#FAF6F0] transition-colors cursor-pointer"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={`px-4 py-2 min-h-[44px] rounded-xl text-white font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                isRevoke
                  ? "bg-[#BA3C2A] hover:bg-[#9B3222]"
                  : "bg-[#174C37] hover:bg-[#103D2B]"
              }`}
              disabled={
                isSubmitting ||
                (!isRevoke && effectiveMembers.length === 0) ||
                !reason.trim()
              }
              type="submit"
            >
              {isSubmitting
                ? "Saving..."
                : isRevoke
                  ? "Remove Member"
                  : "Assign Role"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
