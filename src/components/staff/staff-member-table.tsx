"use client";

import { useMemo, useState } from "react";
import { staffMemberLifecycleAction } from "@/app/(staff)/admin/actions";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface StaffMemberRow {
  id: string;
  fullName: string;
  username: string;
  status: "pending" | "active" | "deactivated" | "rejected";
  profileComplete: boolean;
  requestedAt: string;
}

const statusTabs = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "active", label: "Active" },
  { id: "deactivated", label: "Deactivated" },
  { id: "rejected", label: "Rejected" },
] as const;

const statusStyles: Record<StaffMemberRow["status"], string> = {
  pending: "border-[#D9C8A5] bg-[#F5F0E5] text-[#60451C]",
  active: "border-[#C9DED2] bg-[#F0F7F2] text-[#204F3D]",
  deactivated: "border-[#E5C5C1] bg-[#FAF0EE] text-[#76342D]",
  rejected: "border-[#E5DDD3] bg-[#F4EFE9] text-[#514943]",
};

export default function StaffMemberTable({
  members,
}: {
  members: StaffMemberRow[];
}) {
  const [tab, setTab] = useState<(typeof statusTabs)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((member) => {
      if (tab !== "all" && member.status !== tab) return false;
      if (!needle) return true;
      return (
        member.fullName.toLowerCase().includes(needle) ||
        member.username.toLowerCase().includes(needle)
      );
    });
  }, [members, tab, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
            Member directory
          </p>
          <h2 className="text-lg font-extrabold text-[#3D291F]">
            {visibleMembers.length} of {members.length} members
          </h2>
        </div>
        <label className="grid gap-1 text-xs font-bold text-[#3D291F] sm:w-72">
          Search members
          <input
            className="min-h-10 rounded-lg border border-[#B8ACA0] px-3 text-sm font-normal"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or username"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {statusTabs.map((statusTab) => (
          <button
            aria-pressed={tab === statusTab.id}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              tab === statusTab.id
                ? "border-[#174C37] bg-[#174C37] text-white"
                : "border-[#E5DDD3] bg-[#FBF9F6] text-[#5C4638]"
            }`}
            key={statusTab.id}
            onClick={() => setTab(statusTab.id)}
            type="button"
          >
            {statusTab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E5DDD3] text-[11px] uppercase tracking-wider text-[#7A685D]">
              <th className="py-2 pr-3 font-bold">Member</th>
              <th className="py-2 pr-3 font-bold">Status</th>
              <th className="py-2 pr-3 font-bold">Profile</th>
              <th className="py-2 pr-3 font-bold">Requested</th>
              <th className="py-2 font-bold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((member) => (
              <tr
                className="border-b border-[#F1EBE3] align-top"
                key={member.id}
              >
                <td className="py-3 pr-3">
                  <p className="font-bold text-[#3D291F]">{member.fullName}</p>
                  <p className="text-[#7A685D]">@{member.username}</p>
                </td>
                <td className="py-3 pr-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[member.status]}`}
                  >
                    {member.status}
                  </span>
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">
                  {member.profileComplete ? "Complete" : "Incomplete"}
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">
                  {formatStaffTimestamp(member.requestedAt)}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-2">
                    {member.status === "pending" ? (
                      <>
                        <StaffActionDialog
                          action={staffMemberLifecycleAction}
                          confirmLabel="Approve membership"
                          description="Member access is enabled immediately and the decision is recorded in the audit history."
                          fields={{
                            member_id: member.id,
                            operation: "approve",
                          }}
                          reasonHelp="Required. This reason is recorded against the approved membership."
                          reasonLabel="Reason for approval"
                          title={`Approve ${member.fullName}?`}
                          triggerLabel="Approve"
                        />
                        <StaffActionDialog
                          action={staffMemberLifecycleAction}
                          confirmLabel="Reject request"
                          danger
                          description="The request is declined and the applicant cannot use member features."
                          fields={{
                            member_id: member.id,
                            operation: "reject",
                          }}
                          reasonLabel="Reason for rejection"
                          title={`Reject ${member.fullName}?`}
                          triggerLabel="Reject"
                        />
                      </>
                    ) : null}
                    {member.status === "active" ? (
                      <StaffActionDialog
                        action={staffMemberLifecycleAction}
                        confirmLabel="Deactivate account"
                        danger
                        description="Member access is blocked immediately. The account keeps its role history and can be reactivated later."
                        fields={{
                          member_id: member.id,
                          operation: "deactivate",
                        }}
                        reasonLabel="Reason for deactivation"
                        title={`Deactivate ${member.fullName}?`}
                        triggerLabel="Deactivate"
                      />
                    ) : null}
                    {member.status === "deactivated" ? (
                      <StaffActionDialog
                        action={staffMemberLifecycleAction}
                        confirmLabel="Reactivate account"
                        description="Member access is restored with the previous role assignments."
                        fields={{
                          member_id: member.id,
                          operation: "reactivate",
                        }}
                        reasonLabel="Reason for reactivation"
                        title={`Reactivate ${member.fullName}?`}
                        triggerLabel="Reactivate"
                      />
                    ) : null}
                    {member.status === "rejected" ? (
                      <p className="text-[#7A685D]">No action available.</p>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleMembers.length === 0 ? (
        <p className="rounded-xl border border-[#E5DDD3] bg-[#FBF9F6] p-4 text-xs text-[#7A685D]">
          No member matches this filter.
        </p>
      ) : null}
    </div>
  );
}
