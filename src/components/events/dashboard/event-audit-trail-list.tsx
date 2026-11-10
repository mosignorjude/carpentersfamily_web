"use client";

import type { ActivityLogItem } from "./dashboard-types";

export interface EventAuditTrailListProps {
  activityLogs: ActivityLogItem[];
}

export function EventAuditTrailList({
  activityLogs,
}: EventAuditTrailListProps) {
  if (activityLogs.length === 0) {
    return (
      <p className="text-xs text-[#7A685D] py-6 text-center">
        No audit activity recorded yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[#E5DDD3]">
      {activityLogs.map((log) => (
        <div
          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          key={log.id}
        >
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-[#3D291F]">{log.action}</span>
              <span className="text-[10px] uppercase font-semibold text-[#174C37] bg-[#174C37]/10 px-2 py-0.5 rounded-full">
                {log.category}
              </span>
            </div>
            <p className="text-xs text-[#5C4638]">{log.details}</p>
            <span className="text-[11px] text-[#7A685D]">
              Authorized by: <strong>{log.user}</strong> ({log.userRole})
            </span>
          </div>

          <span className="font-mono text-[11px] text-[#7A685D] shrink-0 self-end sm:self-center">
            {log.timestamp}
          </span>
        </div>
      ))}
    </div>
  );
}
