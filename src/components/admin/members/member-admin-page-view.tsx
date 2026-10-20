"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  assignEventRoleAction,
  clubRoleChangeAction,
  memberLifecycleAction,
  revokeEventRoleAction,
} from "@/app/actions";
import { EventStaffingSection } from "./event-staffing-section";
import { MemberAdminAuditSection } from "./member-admin-audit-section";
import { type ActiveModalType, MemberAdminModals } from "./member-admin-modals";
import { MemberAdminPermissionGuide } from "./member-admin-permission-guide";
import type {
  ClubMemberRecord,
  EventAssignment,
  EventStaffRole,
  ManagedEvent,
  MemberAdminAuditEntry,
  OfficerRole,
} from "./member-admin-types";
import { MemberRosterSection } from "./member-roster-section";
import { MembershipRequestsSection } from "./membership-requests-section";

interface MemberAdminPageViewProps {
  initialMembers?: ClubMemberRecord[];
  initialEvents?: ManagedEvent[];
  initialAssignments?: EventAssignment[];
  initialAuditLog?: MemberAdminAuditEntry[];
  initialOfficerRole?: OfficerRole;
  currentOfficerId?: string;
  roleLookupFailed?: boolean;
  notice?: { message: string; isError: boolean };
}

function sanitizeAuditReason(reason: string, fallback: string) {
  const cleaned = reason.replace(/[\r\n\t]+/g, " ").trim();
  return (cleaned || fallback).slice(0, 500);
}

export const MemberAdminPageView: React.FC<MemberAdminPageViewProps> = ({
  initialMembers = [],
  initialEvents = [],
  initialAssignments = [],
  initialAuditLog = [],
  initialOfficerRole = "admin",
  currentOfficerId = "",
  roleLookupFailed = false,
  notice,
}) => {
  const officerRole = initialOfficerRole;
  const members = initialMembers;
  const events = initialEvents;
  const eventAssignments = initialAssignments;
  const auditLog = initialAuditLog;

  // Selected event for staffing desk
  const [selectedEventId, setSelectedEventId] = useState<string>(
    events[0]?.id || "",
  );

  useEffect(() => {
    if (
      events.length > 0 &&
      (!selectedEventId || !events.some((e) => e.id === selectedEventId))
    ) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  // Modals state
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [selectedMember, setSelectedMember] = useState<ClubMemberRecord | null>(
    null,
  );
  const [selectedAssignment, setSelectedAssignment] =
    useState<EventAssignment | null>(null);
  const [targetClubRole, setTargetClubRole] = useState<"Member" | "Executive">(
    "Executive",
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: close modals when server props refresh
  useEffect(() => {
    setActiveModal(null);
    setSelectedMember(null);
    setSelectedAssignment(null);
  }, [initialMembers, initialAssignments, initialAuditLog, notice]);

  const resolvedOfficerId = currentOfficerId ?? "";

  const isAdminOrBackup =
    officerRole === "admin" || officerRole === "backup_admin";

  const pendingRequests = useMemo(
    () => members.filter((m) => m.accountStatus === "pending"),
    [members],
  );
  const activeMembers = useMemo(
    () => members.filter((m) => m.accountStatus === "active"),
    [members],
  );

  // --- REAL SERVER ACTIONS ---

  const handleApproveMembership = async (member: ClubMemberRecord) => {
    const formData = new FormData();
    formData.set("operation", "approve");
    formData.set("member_id", member.id);
    formData.set(
      "reason",
      "Membership requirements and profile verified by presiding officer.",
    );
    await memberLifecycleAction(formData);
  };

  const handleRejectMembership = async (
    member: ClubMemberRecord,
    reason: string,
  ) => {
    const formData = new FormData();
    formData.set("operation", "reject");
    formData.set("member_id", member.id);
    formData.set(
      "reason",
      sanitizeAuditReason(
        reason,
        "Membership application declined after officer review.",
      ),
    );
    await memberLifecycleAction(formData);
  };

  const handleDeactivateAccount = async (
    member: ClubMemberRecord,
    reason: string,
  ) => {
    const formData = new FormData();
    formData.set("operation", "deactivate");
    formData.set("member_id", member.id);
    formData.set(
      "reason",
      sanitizeAuditReason(reason, "Member account deactivated by officer."),
    );
    await memberLifecycleAction(formData);
  };

  const handleReactivateAccount = async (
    member: ClubMemberRecord,
    reason: string,
  ) => {
    const formData = new FormData();
    formData.set("operation", "reactivate");
    formData.set("member_id", member.id);
    formData.set(
      "reason",
      sanitizeAuditReason(reason, "Member account reactivated by officer."),
    );
    await memberLifecycleAction(formData);
  };

  const handleChangeClubRole = async (
    member: ClubMemberRecord,
    targetRole: "Member" | "Executive",
    reason: string,
  ) => {
    const formData = new FormData();
    formData.set("member_id", member.id);
    formData.set("role", targetRole === "Executive" ? "executive" : "member");
    formData.set(
      "reason",
      sanitizeAuditReason(
        reason,
        `Club role updated to ${targetRole} by administrator.`,
      ),
    );
    await clubRoleChangeAction(formData);
  };

  const handleAssignEventRole = async (
    eventId: string,
    memberId: string,
    role: EventStaffRole,
    reason: string,
  ) => {
    const dbRole =
      role === "Event lead"
        ? "lead"
        : role === "Event assistant"
          ? "assistant"
          : "committee";
    const formData = new FormData();
    formData.set("event_id", eventId);
    formData.set("member_id", memberId);
    formData.set("event_role", dbRole);
    formData.set(
      "reason",
      sanitizeAuditReason(
        reason,
        `Assigned as ${role} per event staffing schedule.`,
      ),
    );
    formData.set("return_to", "admin-members");
    await assignEventRoleAction(formData);
  };

  const handleRemoveEventRole = async (
    assignment: EventAssignment,
    reason: string,
  ) => {
    const formData = new FormData();
    formData.set("event_id", assignment.eventId);
    formData.set("member_id", assignment.memberId);
    formData.set(
      "reason",
      sanitizeAuditReason(reason, "Removed from event staffing assignment."),
    );
    formData.set("return_to", "admin-members");
    await revokeEventRoleAction(formData);
  };

  const currentSelectedEvent =
    events.find((e) => e.id === selectedEventId) || events[0] || null;

  return (
    <div className="space-y-8">
      {/* 3. PAGE HEADER & PERMISSION GUIDE */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#3D291F] tracking-tight">
            Member administration
          </h1>
          <p className="text-sm text-[#7A685D] mt-1 max-w-3xl">
            Review incoming membership applications, maintain member account
            statuses, assign club executive responsibilities, and staff
            scheduled events.
          </p>
        </div>

        <MemberAdminPermissionGuide />
      </div>

      {/* 4. SECTION 1: MEMBERSHIP REQUESTS */}
      <div id="pending-requests">
        <MembershipRequestsSection
          pendingRequests={pendingRequests}
          onOpenApproveModal={(member) => {
            setSelectedMember(member);
            setActiveModal("approve");
          }}
          onOpenRejectModal={(member) => {
            setSelectedMember(member);
            setActiveModal("reject");
          }}
        />
      </div>

      {/* 5. SECTION 2: MEMBER ROSTER */}
      <MemberRosterSection
        members={members}
        currentOfficerId={resolvedOfficerId}
        isAdminOrBackup={isAdminOrBackup}
        roleLookupFailed={roleLookupFailed}
        onOpenDeactivateModal={(member) => {
          setSelectedMember(member);
          setActiveModal("deactivate");
        }}
        onOpenReactivateModal={(member) => {
          setSelectedMember(member);
          setActiveModal("reactivate");
        }}
        onOpenChangeClubRoleModal={(member, targetRole) => {
          setSelectedMember(member);
          setTargetClubRole(targetRole);
          setActiveModal("change_club_role");
        }}
        onScrollToPending={() => {
          const el = document.getElementById("pending-requests");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
      />

      {/* 6. SECTION 3: EVENT STAFFING */}
      <EventStaffingSection
        events={events}
        selectedEventId={selectedEventId}
        onSelectEventId={setSelectedEventId}
        assignments={eventAssignments}
        onOpenAssignModal={() => {
          setActiveModal("assign_event_role");
        }}
        onOpenRemoveModal={(assignment) => {
          setSelectedAssignment(assignment);
          setActiveModal("remove_event_role");
        }}
      />

      {/* 7. SECTION 4: AUDIT HISTORY */}
      <MemberAdminAuditSection auditLog={auditLog} />

      {/* 8. MODAL DIALOGS */}
      <MemberAdminModals
        activeModal={activeModal}
        onClose={() => {
          setActiveModal(null);
          setSelectedMember(null);
          setSelectedAssignment(null);
        }}
        selectedMember={selectedMember}
        selectedAssignment={selectedAssignment}
        selectedEvent={currentSelectedEvent}
        activeMembers={activeMembers}
        targetClubRole={targetClubRole}
        onConfirmApprove={handleApproveMembership}
        onConfirmReject={handleRejectMembership}
        onConfirmDeactivate={handleDeactivateAccount}
        onConfirmReactivate={handleReactivateAccount}
        onConfirmChangeClubRole={handleChangeClubRole}
        onConfirmAssignEventRole={handleAssignEventRole}
        onConfirmRemoveEventRole={handleRemoveEventRole}
        currentOfficerId={resolvedOfficerId}
      />
    </div>
  );
};
