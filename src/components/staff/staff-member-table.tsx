"use client";

import { useMemo, useState } from "react";
import {
  staffMemberLifecycleAction,
  staffResendConfirmationAction,
} from "@/app/(staff)/admin/actions";
import { getMemberProfileStateLabel } from "@/lib/member-administration-presentation.mjs";
import { formatStaffTimestamp } from "@/lib/staff-presentation.mjs";
import StaffActionDialog from "./staff-action-dialog";

export interface StaffMemberRow {
  id: string;
  fullName: string;
  username: string;
  status: "pending" | "active" | "deactivated" | "rejected";
  profileState: string;
  profileStateDescription: string;
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
  pending: "border-amber-300 bg-amber-50 text-amber-900",
  active: "border-emerald-300 bg-emerald-50 text-emerald-900",
  deactivated: "border-rose-300 bg-rose-50 text-rose-900",
  rejected: "border-linen bg-stone-100 text-stone-700",
};

function MemberActions({ member }: { member: StaffMemberRow }) {
  if (member.status === "pending") {
    return (
      <div className="flex flex-wrap gap-2">
        {member.profileState === "complete" ? (
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
        ) : member.profileState === "incomplete_email" ? (
          <>
            <p className="max-w-56 text-xs font-medium text-terracotta">
              {member.profileStateDescription}
            </p>
            <StaffActionDialog
              action={staffResendConfirmationAction}
              confirmLabel="Send confirmation email"
              description="The applicant receives a fresh link to confirm their email address. This attempt is recorded in the audit history and can be repeated after 15 minutes."
              fields={{ member_id: member.id }}
              reasonHelp="Required. Explain why the link is being re-sent, for example that the applicant reported never receiving the confirmation email."
              reasonLabel="Reason for resending"
              title={`Resend the confirmation email to ${member.fullName}?`}
              triggerLabel="Resend confirmation"
            />
          </>
        ) : (
          <p className="max-w-56 text-xs font-medium text-terracotta">
            {member.profileStateDescription}
          </p>
        )}
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
      </div>
    );
  }

  if (member.status === "active") {
    return (
      <div className="flex flex-wrap gap-2">
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
      </div>
    );
  }

  if (member.status === "deactivated") {
    return (
      <div className="flex flex-wrap gap-2">
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
      </div>
    );
  }

  return <p className="text-muted text-xs">No action available.</p>;
}

export default function StaffMemberTable({
  members,
}: {
  members: StaffMemberRow[];
}) {
  const [tab, setTab] = useState<(typeof statusTabs)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: members.length,
      pending: 0,
      active: 0,
      deactivated: 0,
      rejected: 0,
    };
    for (const member of members) {
      if (counts[member.status] !== undefined) {
        counts[member.status]++;
      }
    }
    return counts;
  }, [members]);

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
          <p className="text-[11px] font-bold uppercase tracking-wider text-forest">
            Member directory
          </p>
          <h2
            aria-atomic="true"
            aria-live="polite"
            className="text-lg font-extrabold text-espresso"
          >
            {visibleMembers.length} of {members.length} members
          </h2>
        </div>
        <div className="sm:w-72">
          <label className="grid gap-1 text-xs font-bold text-espresso">
            Search members
            <div className="relative flex items-center">
              <input
                className="min-h-11 w-full rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso placeholder:text-muted focus-visible:border-forest focus-visible:outline-hidden"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name or username"
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-xs font-bold text-muted hover:text-espresso cursor-pointer"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-stone-200">
                    ✕
                  </span>
                </button>
              ) : null}
            </div>
          </label>
        </div>
      </div>

      <fieldset className="m-0 flex flex-wrap gap-2 border-none p-0">
        <legend className="sr-only">Filter members by status</legend>
        {statusTabs.map((statusTab) => (
          <button
            aria-pressed={tab === statusTab.id}
            className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold cursor-pointer transition-colors ${
              tab === statusTab.id
                ? "border-forest bg-forest text-white"
                : "border-linen bg-warm-canvas text-body hover:bg-white"
            }`}
            key={statusTab.id}
            onClick={() => setTab(statusTab.id)}
            type="button"
          >
            <span>{statusTab.label}</span>
            <span
              className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                tab === statusTab.id
                  ? "bg-white/20 text-white"
                  : "bg-stone-200 text-stone-700"
              }`}
            >
              {tabCounts[statusTab.id] ?? 0}
            </span>
          </button>
        ))}
      </fieldset>

      {/* Mobile Card View (screens < 640px) */}
      <div className="block sm:hidden space-y-3">
        {visibleMembers.map((member) => (
          <div
            className="rounded-xl border border-linen bg-white p-4 shadow-2xs space-y-3"
            key={member.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-espresso">
                  {member.fullName}
                </p>
                <p className="text-xs text-muted">@{member.username}</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[member.status]}`}
              >
                {member.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-linen/60 py-2.5 text-body">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted">
                  Profile readiness
                </p>
                <p className="font-medium">
                  {getMemberProfileStateLabel(member.profileState)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted">
                  Requested
                </p>
                <p className="font-medium">
                  {formatStaffTimestamp(member.requestedAt)}
                </p>
              </div>
            </div>

            <div className="pt-1">
              <MemberActions member={member} />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View (screens >= 640px) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
          <caption className="sr-only">
            Active and pending member administration directory
          </caption>
          <thead>
            <tr className="border-b border-linen text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Member
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Status
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Profile
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Requested
              </th>
              <th className="py-2.5 font-bold" scope="col">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map((member) => (
              <tr
                className="border-b border-linen/60 align-top hover:bg-warm-canvas/40"
                key={member.id}
              >
                <th className="py-3 pr-3 text-left font-normal" scope="row">
                  <p className="font-bold text-espresso">{member.fullName}</p>
                  <p className="text-muted">@{member.username}</p>
                </th>
                <td className="py-3 pr-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusStyles[member.status]}`}
                  >
                    {member.status}
                  </span>
                </td>
                <td className="py-3 pr-3 text-body">
                  {getMemberProfileStateLabel(member.profileState)}
                </td>
                <td className="py-3 pr-3 text-body">
                  {formatStaffTimestamp(member.requestedAt)}
                </td>
                <td className="py-3">
                  <MemberActions member={member} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleMembers.length === 0 ? (
        <p className="rounded-xl border border-linen bg-warm-canvas p-4 text-xs text-muted">
          No member matches this filter.
        </p>
      ) : null}
    </div>
  );
}
