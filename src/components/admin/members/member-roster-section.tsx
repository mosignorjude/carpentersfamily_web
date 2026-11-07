"use client";

import {
  Filter,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { TableScroll } from "@/components/ui/table-scroll";
import { getMemberProfileStateLabel } from "@/lib/member-administration-presentation.mjs";
import type { ClubMemberRecord } from "./member-admin-types";

type RosterStatusFilter = "all" | "active" | "deactivated" | "rejected";

const STATUS_SORT_ORDER: Record<string, number> = {
  active: 0,
  deactivated: 1,
  rejected: 2,
};

function getRegistrationTimestamp(member: ClubMemberRecord): number {
  if (member.createdAt) {
    const parsed = Date.parse(member.createdAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  const datePart = member.requestDateWAT?.split("·")[0]?.trim();
  if (datePart) {
    const parsed = Date.parse(datePart);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

interface MemberRosterSectionProps {
  members: ClubMemberRecord[];
  currentOfficerId: string;
  isAdminOrPresident: boolean;
  roleLookupFailed: boolean;
  onOpenDeactivateModal: (member: ClubMemberRecord) => void;
  onOpenReactivateModal: (member: ClubMemberRecord) => void;
  onOpenChangeClubRoleModal: (
    member: ClubMemberRecord,
    targetRole: "Member" | "Executive",
  ) => void;
}

export const MemberRosterSection: React.FC<MemberRosterSectionProps> = ({
  members,
  currentOfficerId,
  isAdminOrPresident,
  roleLookupFailed,
  onOpenDeactivateModal,
  onOpenReactivateModal,
  onOpenChangeClubRoleModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<RosterStatusFilter>("all");

  // Exclude pending requests from the member roster (they belong only in Pending Requests)
  const rosterMembers = useMemo(
    () => members.filter((member) => member.accountStatus !== "pending"),
    [members],
  );

  // Filtered and sorted members: Active (by registration date) -> Deactivated -> Rejected
  const filteredMembers = useMemo(() => {
    return rosterMembers
      .filter((member) => {
        const matchesSearch =
          member.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          member.username.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus =
          statusFilter === "all" ? true : member.accountStatus === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const statusOrderA = STATUS_SORT_ORDER[a.accountStatus] ?? 99;
        const statusOrderB = STATUS_SORT_ORDER[b.accountStatus] ?? 99;
        if (statusOrderA !== statusOrderB) {
          return statusOrderA - statusOrderB;
        }
        const timeDiff =
          getRegistrationTimestamp(a) - getRegistrationTimestamp(b);
        if (timeDiff !== 0) return timeDiff;
        return a.fullName.localeCompare(b.fullName);
      });
  }, [rosterMembers, searchQuery, statusFilter]);

  const activeCount = useMemo(
    () => rosterMembers.filter((m) => m.accountStatus === "active").length,
    [rosterMembers],
  );
  const deactivatedCount = useMemo(
    () => rosterMembers.filter((m) => m.accountStatus === "deactivated").length,
    [rosterMembers],
  );
  const rejectedCount = useMemo(
    () => rosterMembers.filter((m) => m.accountStatus === "rejected").length,
    [rosterMembers],
  );

  const statusBadges: Record<
    "active" | "deactivated" | "rejected",
    { label: string; className: string }
  > = {
    active: {
      label: "Active",
      className: "bg-[#174C37]/10 text-[#174C37] border-[#174C37]/30",
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

  const roleBadges = {
    Admin: "bg-[#3D291F] text-white",
    President: "bg-[#103D2B] text-white",
    Executive:
      "bg-[#D6A23A]/20 text-[#8A641A] border border-[#D6A23A]/40 font-semibold",
    Member: "bg-neutral-100 text-[#3D291F] border border-[#E5DDD3]",
  };

  return (
    <section className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#3D291F]">Member Roster</h2>
          <p className="text-xs text-[#7A685D]">
            Club directory sorted by status and registration date. Email
            addresses and personal dues are kept private.
          </p>
        </div>
        <span className="text-xs text-[#7A685D] self-start sm:self-auto font-medium">
          Showing {filteredMembers.length} of {rosterMembers.length} members
        </span>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#7A685D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            aria-label="Search members by full name or username"
            placeholder="Search by name or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-base sm:text-xs text-[#3D291F] placeholder-[#7A685D] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-4 h-4 text-[#7A685D]" />
          <select
            aria-label="Filter members by account status"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as RosterStatusFilter)
            }
            className="px-3 py-2.5 bg-[#FAF6F0] border border-[#E5DDD3] rounded-lg text-base sm:text-xs font-semibold text-[#3D291F] focus:outline-hidden focus:ring-2 focus:ring-[#174C37]"
          >
            <option value="all">All ({rosterMembers.length})</option>
            <option value="active">Active ({activeCount})</option>
            <option value="deactivated">
              Deactivated ({deactivatedCount})
            </option>
            <option value="rejected">Rejected ({rejectedCount})</option>
          </select>
        </div>
      </div>

      {filteredMembers.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#7A685D] space-y-1">
          <Users className="w-8 h-8 text-[#7A685D] mx-auto opacity-50" />
          <p className="font-semibold text-[#3D291F]">
            No Members Match Search
          </p>
          <p>Try modifying your search query or status filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="sm:hidden text-[11px] font-medium text-[#7A685D]">
            Swipe to view all columns &rarr;
          </p>
          <div className="rounded-xl border border-[#E5DDD3] overflow-hidden">
            <TableScroll label="Member roster">
              <table className="w-full text-left border-collapse min-w-[780px]">
                <thead>
                  <tr className="bg-[#FAF6F0] border-b border-[#E5DDD3] text-[11px] font-bold uppercase tracking-wider text-[#54433A]">
                    <th className="py-3 px-4">Member</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Club Role</th>
                    <th className="py-3 px-4">Profile</th>
                    <th className="py-3 px-4">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD3] text-xs">
                  {filteredMembers.map((member) => {
                    const isCurrentUser = member.id === currentOfficerId;
                    const badge =
                      statusBadges[
                        member.accountStatus as
                          | "active"
                          | "deactivated"
                          | "rejected"
                      ] ?? statusBadges.deactivated;

                    return (
                      <tr
                        key={member.id}
                        className={`transition-colors ${
                          isCurrentUser
                            ? "bg-[#FAF6F0]/80"
                            : "bg-white hover:bg-[#FAF6F0]/40"
                        }`}
                      >
                        <td className="py-3.5 px-4 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#3D291F] text-sm">
                                {member.fullName}
                              </span>
                              {isCurrentUser && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#174C37] text-white font-bold whitespace-nowrap">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-mono text-[#7A685D]">
                              {member.username}
                            </span>
                            {member.lastStatusChangeReason && (
                              <span className="text-[11px] text-[#7A685D] mt-1">
                                <strong className="text-[#3D291F]">
                                  Reason:
                                </strong>{" "}
                                {member.lastStatusChangeReason}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
                              roleBadges[member.clubRole]
                            }`}
                          >
                            {member.clubRole}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 align-middle whitespace-nowrap text-[#3D291F] font-medium">
                          {getMemberProfileStateLabel(member.profileState)}
                        </td>

                        <td className="py-3.5 px-4 align-middle whitespace-nowrap font-mono text-[11px] text-[#5C4638]">
                          {member.requestDateWAT}
                        </td>

                        <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            {member.accountStatus === "active" && (
                              <>
                                {isAdminOrPresident && !roleLookupFailed && (
                                  <>
                                    {member.clubRole === "Member" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onOpenChangeClubRoleModal(
                                            member,
                                            "Executive",
                                          )
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
                                          onOpenChangeClubRoleModal(
                                            member,
                                            "Member",
                                          )
                                        }
                                        className="cf-btn cf-btn--neutral cf-btn--muted-danger"
                                      >
                                        <UserX className="w-3.5 h-3.5 text-[#8B261E]" />
                                        <span>Remove Executive</span>
                                      </button>
                                    )}
                                  </>
                                )}

                                {isAdminOrPresident && (
                                  <button
                                    type="button"
                                    disabled={isCurrentUser}
                                    onClick={() =>
                                      onOpenDeactivateModal(member)
                                    }
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

                            {member.accountStatus === "deactivated" &&
                              isAdminOrPresident && (
                                <button
                                  type="button"
                                  onClick={() => onOpenReactivateModal(member)}
                                  className="cf-btn cf-btn--primary"
                                >
                                  <RefreshCw className="w-3.5 h-3.5 text-[#D6A23A]" />
                                  <span>Reactivate Account</span>
                                </button>
                              )}

                            {member.accountStatus === "rejected" && (
                              <span className="text-xs text-[#7A685D] italic">
                                Application closed
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      )}
    </section>
  );
};
