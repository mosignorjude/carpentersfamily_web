"use client";

import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  UserCog,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import type {
  ClubMemberRecord,
  EventAssignment,
  EventStaffRole,
  ManagedEvent,
} from "./member-admin-types";

export type ActiveModalType =
  | null
  | "approve"
  | "reject"
  | "deactivate"
  | "reactivate"
  | "change_club_role"
  | "assign_event_role"
  | "remove_event_role";

interface MemberAdminModalsProps {
  activeModal: ActiveModalType;
  isPending?: boolean;
  onClose: () => void;
  selectedMember: ClubMemberRecord | null;
  selectedAssignment: EventAssignment | null;
  selectedEvent: ManagedEvent | null;
  activeMembers: ClubMemberRecord[];
  targetClubRole: "Member" | "Executive";
  onConfirmApprove: (member: ClubMemberRecord) => void;
  onConfirmReject: (member: ClubMemberRecord, reason: string) => void;
  onConfirmDeactivate: (member: ClubMemberRecord, reason: string) => void;
  onConfirmReactivate: (member: ClubMemberRecord, reason: string) => void;
  onConfirmChangeClubRole: (
    member: ClubMemberRecord,
    targetRole: "Member" | "Executive",
    reason: string,
  ) => void;
  onConfirmAssignEventRole: (
    eventId: string,
    memberId: string,
    role: EventStaffRole,
    reason: string,
  ) => void;
  onConfirmRemoveEventRole: (
    assignment: EventAssignment,
    reason: string,
  ) => void;
  currentOfficerId: string;
}

export const MemberAdminModals: React.FC<MemberAdminModalsProps> = ({
  activeModal,
  isPending = false,
  onClose,
  selectedMember,
  selectedAssignment,
  selectedEvent,
  activeMembers,
  targetClubRole,
  onConfirmApprove,
  onConfirmReject,
  onConfirmDeactivate,
  onConfirmReactivate,
  onConfirmChangeClubRole,
  onConfirmAssignEventRole,
  onConfirmRemoveEventRole,
  currentOfficerId,
}) => {
  const [reasonInput, setReasonInput] = useState<string>("");
  const [targetStaffMemberId, setTargetStaffMemberId] = useState<string>("");
  const [targetEventRole, setTargetEventRole] =
    useState<EventStaffRole>("Committee");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeModal) {
      setReasonInput("");
      setTargetStaffMemberId("");
      setTargetEventRole("Committee");
      setActionError(null);
    }
  }, [activeModal]);

  const resetAndClose = () => {
    if (isPending) return;
    setReasonInput("");
    setTargetStaffMemberId("");
    setTargetEventRole("Committee");
    setActionError(null);
    onClose();
  };

  if (!activeModal) return null;

  return (
    <>
      {/* 1. APPROVE MEMBERSHIP MODAL */}
      {activeModal === "approve" && selectedMember && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#174C37]">
                <CheckCircle2 className="w-5 h-5 text-[#174C37]" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Confirm Membership Approval
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-[#FAF6F0] rounded-xl border border-[#E5DDD3] space-y-2 text-xs">
              <div>
                <span className="text-[#7A685D]">Candidate:</span>
                <p className="font-bold text-sm text-[#3D291F]">
                  {selectedMember.fullName}
                </p>
                <p className="font-mono text-[#7A685D]">
                  {selectedMember.username}
                </p>
              </div>
              <div className="pt-1 border-t border-[#E5DDD3] text-[#7A685D]">
                <p>Request date: {selectedMember.requestDateWAT}</p>
                <p className="text-[#174C37] font-semibold mt-1">
                  ✓ Profile completion and member endorsements verified
                </p>
              </div>
            </div>

            <p className="text-xs text-[#7A685D] leading-relaxed">
              Approving this request will immediately activate{" "}
              <strong>{selectedMember.fullName}</strong> as an Active Member of
              Carpenters Family Social Club with access to member assembly and
              personal dues records.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  onConfirmApprove(selectedMember);
                }}
                className="cf-btn cf-btn--primary cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Approving Member…</span>
                  </>
                ) : (
                  "Confirm & Activate Member"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. REJECT MEMBERSHIP MODAL */}
      {activeModal === "reject" && selectedMember && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B261E]">
                <XCircle className="w-5 h-5" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Reject Membership Application
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Candidate:</span>
              <p className="font-bold text-[#3D291F]">
                {selectedMember.fullName}
              </p>
              <p className="font-mono text-[#7A685D]">
                {selectedMember.username}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reject-reason"
                className="text-xs font-bold text-[#3D291F] flex items-center justify-between"
              >
                <span>Governance Rejection Reason (Mandatory)</span>
                <span className="text-[10px] text-[#7A685D] font-normal">
                  Retained in Audit
                </span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Failure to satisfy residency qualification in Delta State per Article 4.1..."
                className="w-full p-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#8B261E] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <p className="text-[11px] text-[#7A685D] leading-relaxed">
              Note: This action records a formal rejection. The reason is
              permanently retained in the audit log for future secretarial
              verification.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!reasonInput.trim()) {
                    setActionError(
                      "A specific governance reason is required to reject a membership application.",
                    );
                    return;
                  }
                  onConfirmReject(selectedMember, reasonInput.trim());
                }}
                className="cf-btn cf-btn--danger cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Declining Request…</span>
                  </>
                ) : (
                  "Confirm Rejection"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. DEACTIVATE ACCOUNT MODAL */}
      {activeModal === "deactivate" && selectedMember && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B261E]">
                <UserX className="w-5 h-5" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Deactivate Member Account
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Member to Deactivate:</span>
              <p className="font-bold text-[#3D291F]">
                {selectedMember.fullName}
              </p>
              <p className="font-mono text-[#7A685D]">
                {selectedMember.username}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="deactivate-reason"
                className="text-xs font-bold text-[#3D291F] flex items-center justify-between"
              >
                <span>Reason for Deactivation (Mandatory)</span>
                <span className="text-[10px] text-[#7A685D] font-normal">
                  Audit Logged
                </span>
              </label>
              <textarea
                id="deactivate-reason"
                rows={3}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Voluntary hiatus due to relocation, or administrative suspension..."
                className="w-full p-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#8B261E] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <p className="text-[11px] text-[#7A685D]">
              Deactivation suspends active portal login and voting privileges.
              The record is preserved for reinstatement.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetAndClose}
                disabled={isPending}
                className="cf-btn cf-btn--neutral cf-btn--modal disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (selectedMember.id === currentOfficerId) {
                    setActionError(
                      "Self-deactivation is prohibited. Another administrator must execute this action.",
                    );
                    return;
                  }
                  if (!reasonInput.trim()) {
                    setActionError(
                      "A mandatory reason is required to deactivate a member account.",
                    );
                    return;
                  }
                  onConfirmDeactivate(selectedMember, reasonInput.trim());
                }}
                className="cf-btn cf-btn--danger cf-btn--modal cf-btn--wide inline-flex items-center justify-center gap-2 disabled:opacity-75"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Deactivating…</span>
                  </>
                ) : (
                  "Confirm Deactivation"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. REACTIVATE ACCOUNT MODAL */}
      {activeModal === "reactivate" && selectedMember && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#174C37]">
                <RefreshCw className="w-5 h-5 text-[#D6A23A]" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Reactivate Member Account
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Member to Reactivate:</span>
              <p className="font-bold text-[#3D291F]">
                {selectedMember.fullName}
              </p>
              <p className="font-mono text-[#7A685D]">
                {selectedMember.username}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reactivate-reason"
                className="text-xs font-bold text-[#3D291F]"
              >
                Reactivation Reason / Terms (Mandatory)
              </label>
              <textarea
                id="reactivate-reason"
                rows={3}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Return from overseas posting; dues arrears cleared..."
                className="w-full p-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!reasonInput.trim()) {
                    setActionError(
                      "A reason must be recorded to reactivate this member account.",
                    );
                    return;
                  }
                  onConfirmReactivate(selectedMember, reasonInput.trim());
                }}
                className="cf-btn cf-btn--primary cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Reactivating…</span>
                  </>
                ) : (
                  "Reactivate Account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. CHANGE CLUB ROLE MODAL */}
      {activeModal === "change_club_role" && selectedMember && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#174C37]">
                <UserCog className="w-5 h-5 text-[#D6A23A]" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  {targetClubRole === "Executive"
                    ? "Assign Executive Status"
                    : "Remove Executive Status"}
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Target Member:</span>
              <p className="font-bold text-[#3D291F]">
                {selectedMember.fullName}
              </p>
              <p className="text-[#7A685D]">
                Current Role: <strong>{selectedMember.clubRole}</strong> → New
                Role:{" "}
                <strong className="text-[#174C37]">{targetClubRole}</strong>
              </p>
            </div>

            <div className="p-3 bg-[#FFF8E6] rounded-lg border border-[#D6A23A]/50 text-xs text-[#3D291F] flex items-start gap-2">
              <Info className="w-4 h-4 text-[#D6A23A] shrink-0 mt-0.5" />
              <p>
                <strong>Scope Notice:</strong> Changing a member's club
                leadership role modifies general club administrative privileges.
                It does <em>not</em> alter event-specific assignments.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="role-change-reason"
                className="text-xs font-bold text-[#3D291F]"
              >
                Constitutional / Assembly Reason (Mandatory)
              </label>
              <textarea
                id="role-change-reason"
                rows={3}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Ratified by Executive Assembly for the 2026/2027 tenure..."
                className="w-full p-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!reasonInput.trim()) {
                    setActionError(
                      "A governance reason is required when modifying club leadership roles.",
                    );
                    return;
                  }
                  onConfirmChangeClubRole(
                    selectedMember,
                    targetClubRole,
                    reasonInput.trim(),
                  );
                }}
                className="cf-btn cf-btn--primary cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Updating Role…</span>
                  </>
                ) : (
                  "Confirm Role Change"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ASSIGN EVENT ROLE MODAL */}
      {activeModal === "assign_event_role" && selectedEvent && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#174C37]">
                <UserCog className="w-5 h-5 text-[#D6A23A]" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Assign Event Staff Role
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Event:</span>
              <p className="font-bold text-[#3D291F]">{selectedEvent.title}</p>
              <p className="text-[#7A685D]">{selectedEvent.dateFormatted}</p>
            </div>

            {/* Select Active Member */}
            <div className="space-y-1.5">
              <label
                htmlFor="target-staff-member"
                className="text-xs font-bold text-[#3D291F]"
              >
                Select Active Member
              </label>
              <select
                id="target-staff-member"
                value={targetStaffMemberId}
                onChange={(e) => {
                  setTargetStaffMemberId(e.target.value);
                  setActionError(null);
                }}
                className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37]"
              >
                <option value="">-- Choose active member --</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} ({m.username}) · {m.clubRole}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Event Role */}
            <div className="space-y-1.5">
              <label
                htmlFor="target-event-role"
                className="text-xs font-bold text-[#3D291F]"
              >
                Event Role
              </label>
              <select
                id="target-event-role"
                value={targetEventRole}
                onChange={(e) =>
                  setTargetEventRole(e.target.value as EventStaffRole)
                }
                className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:ring-2 focus:ring-[#174C37]"
              >
                <option value="Event lead">
                  Event lead (Principal Organizer)
                </option>
                <option value="Event assistant">
                  Event assistant (Operational Co-lead)
                </option>
                <option value="Committee">
                  Committee (Logistics / Welfare)
                </option>
              </select>
            </div>

            {/* Replacement Notice for Single-Occupancy Roles */}
            {(targetEventRole === "Event lead" ||
              targetEventRole === "Event assistant") && (
              <div className="p-3 bg-[#FFF8E6] rounded-lg border border-[#D6A23A]/50 text-xs text-[#3D291F] space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-[#8A641A]">
                  <AlertCircle className="w-4 h-4 text-[#D6A23A]" />
                  <span>Single-Occupancy Role Notice</span>
                </p>
                <p>
                  Assigning a replacement {targetEventRole} will replace the
                  existing holder. A recorded audit reason is required.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="assign-event-role-reason"
                className="text-xs font-bold text-[#3D291F]"
              >
                Assignment Reason / Notes{" "}
                {targetEventRole !== "Committee" && "(Mandatory if replacing)"}
              </label>
              <textarea
                id="assign-event-role-reason"
                rows={2}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Appointed to oversee hospitality & vendor logistics..."
                className="w-full p-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#174C37] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!targetStaffMemberId) {
                    setActionError("Please select an active member to assign.");
                    return;
                  }
                  onConfirmAssignEventRole(
                    selectedEvent.id,
                    targetStaffMemberId,
                    targetEventRole,
                    reasonInput.trim(),
                  );
                }}
                className="cf-btn cf-btn--primary cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Assigning Role…</span>
                  </>
                ) : (
                  "Confirm Assignment"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. REMOVE EVENT ROLE MODAL */}
      {activeModal === "remove_event_role" && selectedAssignment && (
        <div className="fixed inset-0 z-50 bg-[#0C3325]/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5DDD3] shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#8B261E]">
                <UserX className="w-5 h-5" />
                <h3 className="text-base font-bold text-[#3D291F]">
                  Remove Event Assignment
                </h3>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                className="cf-btn cf-btn--icon-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-[#FAF6F0] rounded-lg border border-[#E5DDD3] text-xs space-y-1">
              <span className="text-[#7A685D]">Staff Member:</span>
              <p className="font-bold text-[#3D291F]">
                {selectedAssignment.memberName}
              </p>
              <p className="text-[#7A685D]">
                Role: <strong>{selectedAssignment.eventRole}</strong> for event{" "}
                <strong className="text-[#3D291F]">
                  {selectedAssignment.eventId}
                </strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="remove-event-role-reason"
                className="text-xs font-bold text-[#3D291F]"
              >
                Reason for Removal (Mandatory)
              </label>
              <textarea
                id="remove-event-role-reason"
                rows={3}
                value={reasonInput}
                onChange={(e) => {
                  setReasonInput(e.target.value);
                  setActionError(null);
                }}
                placeholder="e.g. Schedule conflict; reassigned to technical operations committee..."
                className="w-full p-3 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] focus:ring-2 focus:ring-[#8B261E] focus:outline-hidden"
              />
              {actionError && (
                <p className="text-xs text-[#8B261E] font-medium">
                  {actionError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={resetAndClose}
                className="cf-btn cf-btn--neutral cf-btn--modal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!reasonInput.trim()) {
                    setActionError(
                      "A mandatory reason is required when removing an event staffing assignment.",
                    );
                    return;
                  }
                  onConfirmRemoveEventRole(
                    selectedAssignment,
                    reasonInput.trim(),
                  );
                }}
                className="cf-btn cf-btn--danger cf-btn--modal cf-btn--wide"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Removing Role…</span>
                  </>
                ) : (
                  "Confirm Removal"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
