"use client";

import { ChevronDown, ChevronUp, History } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { MemberAdminAuditEntry } from "./member-admin-types";

interface MemberAdminAuditSectionProps {
  auditLog: MemberAdminAuditEntry[];
}

export const MemberAdminAuditSection: React.FC<
  MemberAdminAuditSectionProps
> = ({ auditLog }) => {
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <section className="bg-white rounded-xl border border-[#E5DDD3] shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="cf-btn cf-btn--accordion"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-center text-[#174C37]">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#3D291F]">
                Member administration audit history
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]">
                {auditLog.length} Records
              </span>
            </div>
            <p className="text-xs text-[#7A685D]">
              Immutable, timestamped audit log of all status decisions, role
              assignments, and governance reasons.
            </p>
          </div>
        </div>
        <span className="p-1.5 text-[#7A685D]" aria-hidden="true">
          {expanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[#E5DDD3] p-5 space-y-3">
          {auditLog.length === 0 ? (
            <p className="text-xs text-[#7A685D] text-center py-4">
              No audit actions recorded yet.
            </p>
          ) : (
            auditLog.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-lg border border-[#E5DDD3] bg-[#FAF6F0]/50 text-xs space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#3D291F]">
                      {log.targetMemberName}
                    </span>
                    <span className="font-mono text-[#7A685D] text-[11px]">
                      {log.targetMemberUsername}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white border border-[#E5DDD3] text-[10px] font-semibold text-[#174C37]">
                      {log.actionType.replace(/_/g, " ").toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[#7A685D] font-mono text-[11px]">
                    {log.timestampWAT}
                  </span>
                </div>

                <p className="text-[#3D291F] font-medium">
                  <strong className="text-[#7A685D]">Reason:</strong>{" "}
                  {log.reason}
                </p>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-[#7A685D] pt-1 border-t border-[#E5DDD3]/50">
                  <span>{log.details}</span>
                  <span>
                    Authorized by: <strong>{log.actorName}</strong> (
                    {log.actorRole})
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};
