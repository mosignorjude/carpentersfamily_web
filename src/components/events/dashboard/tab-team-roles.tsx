"use client";

import { Users } from "lucide-react";
import { EmptyStateCard } from "@/components/ui/state-screen";
import type {
  DashboardEventInfo,
  DashboardTeamMember,
} from "./dashboard-types";

interface TabTeamRolesProps {
  event: DashboardEventInfo;
  team: DashboardTeamMember[];
}

export function TabTeamRoles({ team }: TabTeamRolesProps) {
  return (
    <div className="space-y-6 min-w-0">
      <div className="bg-white sm:bg-transparent rounded-2xl sm:rounded-none border sm:border-0 border-[#E5DDD3] p-4 sm:p-0 shadow-xs sm:shadow-none space-y-4 text-xs min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E5DDD3] gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#174C37]" />
              <h4 className="text-base font-bold text-[#3D291F]">
                Event Committee & Leads
              </h4>
            </div>
            <p className="text-xs text-[#7A685D] mt-0.5">
              Members assigned to manage this event.
            </p>
          </div>
          <span className="text-[#174C37] font-semibold font-mono bg-[#FAF6F0] px-3 py-1.5 rounded-xl border border-[#E5DDD3] shrink-0">
            {team.length} Assigned
          </span>
        </div>

        {team.length === 0 ? (
          <EmptyStateCard
            className="my-4"
            description="No team members assigned to this event yet."
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
                    <span className="text-[#7A685D]">Access:</span>
                    <strong className="text-[#3D291F]">
                      {isExecutive
                        ? "Full Event Management"
                        : "Event Operations"}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
