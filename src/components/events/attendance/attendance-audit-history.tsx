"use client";

import { History } from "lucide-react";
import type { AuditRow } from "./attendance-types";

interface AttendanceAuditHistoryProps {
  audits: AuditRow[];
}

const watShortDateTime = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  dateStyle: "medium",
  timeStyle: "short",
});

export function AttendanceAuditHistory({
  audits,
}: AttendanceAuditHistoryProps) {
  if (!audits.length) return null;

  return (
    <section
      aria-labelledby="attendance-audit-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] p-6 shadow-xs space-y-4"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#E5DDD3]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center font-bold">
            <History className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                className="text-base font-extrabold text-[#3D291F]"
                id="attendance-audit-heading"
              >
                Officer Audit History
              </h2>
              <span className="text-xs font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2.5 py-0.5 rounded-full border border-[#E5DDD3]">
                {audits.length} Audited Events
              </span>
            </div>
            <p className="text-xs text-[#7A685D]">
              Immutable ledger of secretarial changes, status corrections, and
              session timing
            </p>
          </div>
        </div>

        <span className="text-xs text-[#7A685D] font-mono hidden sm:inline">
          Retained for Permanent Compliance
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E5DDD3]">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#FAF6F0] border-b border-[#E5DDD3] text-[#54433A] font-bold text-[11px] uppercase tracking-wider">
              <th className="py-3 px-4">Action & Scope</th>
              <th className="py-3 px-4">Audited Reason</th>
              <th className="py-3 px-4 text-right">WAT Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5DDD3] bg-white">
            {audits.map((audit) => (
              <tr
                key={audit.id}
                className="hover:bg-[#FAF6F0]/40 transition-colors"
              >
                <td className="py-3 px-4">
                  <div className="font-bold text-[#3D291F]">
                    {audit.action.replaceAll(".", " ")}
                  </div>
                  <div className="text-[11px] font-mono text-[#7A685D]">
                    Entity: {audit.entity_type}
                  </div>
                </td>

                <td className="py-3 px-4 text-[#5C4638]">
                  <p className="max-w-md leading-relaxed">{audit.reason}</p>
                </td>

                <td className="py-3 px-4 text-right font-mono text-[#7A685D]">
                  {watShortDateTime.format(new Date(audit.occurred_at))} WAT
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
