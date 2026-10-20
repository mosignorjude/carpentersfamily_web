"use client";

import {
  ArrowRight,
  Filter,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import type { AccountStatus, ClubMemberRecord } from "./member-admin-types";

interface MemberRosterSectionProps {
  members: ClubMemberRecord[];
  currentOfficerId: string;
  isAdminOrBackup: boolean;
  roleLookupFailed: boolean;
  onOpenDeactivateModal: (member: ClubMemberRecord) => void;
  onOpenReactivateModal: (member: ClubMemberRecord) => void;
  onOpenChangeClubRoleModal: (
    member: ClubMemberRecord,
    targetRole: "Member" | "Executive",
  ) => void;
  onScrollToPending: () => void;
}

export const MemberRosterSection: React.FC<MemberRosterSectionProps> = ({
  members,
  currentOfficerId,
  isAdminOrBackup,
  roleLookupFailed,
  onOpenDeactivateModal,
  onOpenReactivateModal,
  onOpenChangeClubRoleModal,
  onScrollToPending,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>(
    "all",
  );

  // Filtered members
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesSearch =
        member.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.username.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ? true : member.accountStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [members, searchQuery, statusFilter]);

  const pendingCount = useMemo(
    () => members.filter((m) => m.accountStatus === "pending").length,
    [members],
  );
  const activeCount = useMemo(
    () => members.filter((m) => m.accountStatus === "active").length,
    [members],
  );
  const deactivatedCount = useMemo(
    () => members.filter((m) => m.accountStatus === "deactivated").length,
    [members],
  );
  const rejectedCount = useMemo(
    () => members.filter((m) => m.accountStatus === "rejected").length,
    [members],
  );

  // Status badges mapping
  const statusBadges = {
    active: {
      label: "Active",
      className: "bg-[#174C37]/10 text-[#174C37] border-[#174C37]/30",
    },
    pending: {
      label: "Pending Request",
      className: "bg-[#D6A23A]/15 text-[#8A641A] border-[#D6A23A]/30",
    },
    deactivated: {
      label: "Deactivated",
      className: "bg-neutral-200 text-neutral-700 border-neutral-300",
    },
    rejected: {
      label: "Rejected",
      className: "bg-red-50 text-[#8B261E] border-red-200",
    },
  };

  // Role badges mapping
  const roleBadges = {
    Admin: "bg-[#3D291F] text-white",
    "Backup Admin": "bg-[#103D2B] text-white",
    Executive:
      "bg-[#D6A23A]/20 text-[#8A641A] border border-[#D6A23A]/40 font-semibold",
    Member: "bg-neutral-100 text-[#3D291F] border border-[#E5DDD3]",
  };

  return (
    <section className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#3D291F]">Member roster</h2>
          <p className="text-xs text-[#7A685D]">
            Search and manage club members. Email addresses and private dues are
            strictly excluded.
          </p>
        </div>
        <span className="text-xs text-[#7A685D] self-start sm:self-auto font-medium">
          Showing {filteredMembers.length} of {members.length} members
        </span>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search members by full name or username"
            placeholder="Search by full name or username (@...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-[#7A685D]" />
          <select
            aria-label="Filter members by account status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | AccountStatus)
            }
            className="px-3 py-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          >
            <option value="all">All Statuses ({members.length})</option>
            <option value="active">Active Members ({activeCount})</option>
            <option value="pending">Pending Requests ({pendingCount})</option>
            <option value="deactivated">
              Deactivated Members ({deactivatedCount})
            </option>
            <option value="rejected">
              Rejected Requests ({rejectedCount})
            </option>
          </select>
        </div>
      </div>

      {/* Member Cards */}
      {filteredMembers.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#7A685D] space-y-1">
          <Users className="w-8 h-8 text-[#7A685D] mx-auto opacity-50" />
          <p className="font-semibold text-[#3D291F]">
            No Members Match Search
          </p>
          <p>Try modifying your search query or status filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMembers.map((member) => {
            const isCurrentUser = member.id === currentOfficerId;

            return (
              <div
                key={member.id}
                className={`p-4 rounded-xl border transition-all ${
                  isCurrentUser
                    ? "border-[#D6A23A] bg-[#FAF6F0]"
                    : "border-[#E5DDD3] bg-white"
                } flex flex-col lg:flex-row lg:items-center justify-between gap-4`}
              >
                {/* Member Identity & Details */}
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[#3D291F] truncate">
                      {member.fullName}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#174C37] text-white font-bold">
                        Current Signed-in Officer
                      </span>
                    )}
                    <span className="text-xs font-mono text-[#7A685D] bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#E5DDD3]">
                      {member.username}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {/* Account Status Badge */}
                    <span
                      className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${
                        statusBadges[member.accountStatus].className
                      }`}
                    >
                      {statusBadges[member.accountStatus].label}
                    </span>

                    {/* Club Role Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        roleBadges[member.clubRole]
                      }`}
                    >
                      {member.clubRole}
                    </span>

                    {/* Profile Completion */}
                    <span className="text-[#7A685D] text-[11px]">
                      Profile:{" "}
                      <strong className="text-[#3D291F]">
                        {member.profileState === "complete"
                          ? "Complete"
                          : "Incomplete"}
                      </strong>
                    </span>

                    {/* Joined Date */}
                    {member.activationDateWAT && (
                      <span className="text-[#7A685D] text-[11px]">
                        Active since: {member.activationDateWAT}
                      </span>
                    )}
                  </div>

                  {/* Notice for deactivated/rejected reason */}
                  {member.lastStatusChangeReason && (
                    <p className="text-xs text-[#7A685D] bg-[#FAF6F0] p-2 rounded-md border border-[#E5DDD3] mt-1">
                      <strong className="text-[#3D291F]">Audit Reason:</strong>{" "}
                      {member.lastStatusChangeReason}
                      {member.lastStatusChangedBy && (
                        <span className="block text-[11px] text-[#7A685D]/80 mt-0.5">
                          By {member.lastStatusChangedBy} on{" "}
                          {member.lastStatusChangedAtWAT}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {/* Permitted Officer Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0">
                  {/* Active member controls */}
                  {member.accountStatus === "active" && (
                    <>
                      {/* Assign / Remove Executive */}
                      {isAdminOrBackup && !roleLookupFailed && (
                        <>
                          {member.clubRole === "Member" && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenChangeClubRoleModal(member, "Executive")
                              }
                              className="cf-btn cf-btn--neutral cf-btn--accent"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-[#D6A23A]" />
                              <span>Assign Executive</span>
                            </button>
                          )}

                          {member.clubRole === "Executive" && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenChangeClubRoleModal(member, "Member")
                              }
                              className="cf-btn cf-btn--neutral cf-btn--muted-danger"
                            >
                              <UserX className="w-3.5 h-3.5 text-[#8B261E]" />
                              <span>Remove Executive</span>
                            </button>
                          )}
                        </>
                      )}

                      {/* Deactivate */}
                      {isAdminOrBackup && (
                        <button
                          type="button"
                          disabled={isCurrentUser}
                          onClick={() => onOpenDeactivateModal(member)}
                          className="cf-btn cf-btn--neutral cf-btn--danger-text"
                          title={
                            isCurrentUser
                              ? "Cannot deactivate currently signed-in administrator"
                              : "Deactivate member account"
                          }
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Deactivate...</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Deactivated member control: Reactivate */}
                  {member.accountStatus === "deactivated" &&
                    isAdminOrBackup && (
                      <button
                        type="button"
                        onClick={() => onOpenReactivateModal(member)}
                        className="cf-btn cf-btn--primary"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#D6A23A]" />
                        <span>Reactivate Account</span>
                      </button>
                    )}

                  {/* Pending member link if shown in roster */}
                  {member.accountStatus === "pending" && (
                    <button
                      type="button"
                      onClick={onScrollToPending}
                      className="cf-btn cf-btn--ghost cf-btn--ghost-accent"
                    >
                      <span>View in Pending Requests</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Rejected status notice */}
                  {member.accountStatus === "rejected" && (
                    <span className="text-xs text-[#7A685D] italic">
                      Application closed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
