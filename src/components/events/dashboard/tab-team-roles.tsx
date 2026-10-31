"use client";

import { CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import type {
  DashboardEventInfo,
  DashboardTeamMember,
} from "./dashboard-types";

interface TabTeamRolesProps {
  event: DashboardEventInfo;
  team: DashboardTeamMember[];
}

export function TabTeamRoles({ event, team }: TabTeamRolesProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 space-y-4 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5DDD3] gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#174C37]" />
              <h4 className="text-base font-bold text-[#3D291F]">
                {event.title} Executive Committee & Planning Leads
              </h4>
            </div>
            <p className="text-xs text-[#7A685D] mt-0.5">
              Assigned officers responsible for event ticketing, logistics,
              security, and treasury reconciliation.
            </p>
          </div>
          <span className="text-[#174C37] font-semibold font-mono bg-[#FAF6F0] px-3 py-1.5 rounded-xl border border-[#E5DDD3] shrink-0">
            {team.length} Active Committee Officer{team.length === 1 ? "" : "s"}
          </span>
        </div>

        {team.length === 0 ? (
          <EmptyStateCard
            className="my-4"
            description="No committee officers or event leads have been assigned to this event yet."
            icon={Users}
            title="No Committee Assigned"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {team.map((m) => {
              const isExecutive =
                m.role.includes("Lead") ||
                m.role.includes("Treasurer") ||
                m.role.includes("Executive") ||
                m.role.includes("Admin");

              return (
                <div
                  className="p-4 rounded-2xl border border-[#E5DDD3] bg-white hover:border-[#174C37]/50 transition-colors space-y-2.5"
                  key={m.id}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-sm text-[#3D291F]">
                        {m.name}
                      </h5>
                      <span className="text-[#7A685D] text-xs">
                        Active Member
                      </span>
                    </div>
                    <span className="font-semibold text-xs text-[#174C37] bg-[#174C37]/10 px-2.5 py-1 rounded-md">
                      {m.role}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-[#FAF6F0] text-xs text-[#5C4638] flex items-center justify-between">
                    <span className="text-[#7A685D]">Authorization Level:</span>
                    <strong className="text-[#3D291F]">
                      {isExecutive
                        ? "Full Executive Sign-off"
                        : "Operational Verification"}
                    </strong>
                  </div>

                  <div className="text-[11px] text-[#7A685D] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>Bound by Club Charter &amp; Audit Mandate</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Financial Governance Footer Disclosure */}
        <details className="p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] text-xs text-[#7A685D] group mt-3">
          <summary className="flex items-center justify-between cursor-pointer list-none select-none min-h-[32px]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#174C37]" />
              <span className="font-bold text-[#3D291F] text-xs">
                Financial Governance Rules
              </span>
            </div>
            <span className="text-[11px] font-semibold text-[#174C37] group-open:hidden shrink-0">
              View Rules ▾
            </span>
            <span className="text-[11px] font-semibold text-[#7A685D] hidden group-open:inline shrink-0">
              Hide ▴
            </span>
          </summary>
          <div className="mt-2.5 pt-2.5 border-t border-[#E5DDD3] text-xs text-[#7A685D] leading-relaxed animate-in fade-in duration-150">
            <p>
              All transactions above ₦500,000 require dual executive sign-off
              from the Treasurer and Event Director. Ledger modifications are
              strictly immutable: entries can only be voided with a stated
              reason, retaining their chronological row position with
              strike-through styling to guarantee audit integrity.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
