"use client";

import { useMemo, useState } from "react";
import { AUDIT_DOMAINS, matchesAuditDomain } from "@/lib/audit-domains.mjs";
import {
  formatStaffTimestamp,
  humanizeAuditAction,
} from "@/lib/staff-presentation.mjs";

export interface StaffAuditRow {
  id: string;
  action: string;
  actorName: string;
  actorIsStaff: boolean;
  actorIsPresident: boolean;
  targetName: string | null;
  reason: string;
  occurredAt: string;
}

export default function StaffAuditTable({ rows }: { rows: StaffAuditRow[] }) {
  const [domain, setDomain] = useState("all");
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesAuditDomain(row.action, domain)) return false;
      if (!needle) return true;
      return (
        row.actorName.toLowerCase().includes(needle) ||
        (row.targetName ?? "").toLowerCase().includes(needle) ||
        row.reason.toLowerCase().includes(needle) ||
        humanizeAuditAction(row.action).toLowerCase().includes(needle)
      );
    });
  }, [rows, domain, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#174C37]">
            Governance audit
          </p>
          <h2 className="text-lg font-extrabold text-[#3D291F]">
            {visibleRows.length} of {rows.length} entries
          </h2>
        </div>
        <label className="grid gap-1 text-xs font-bold text-[#3D291F] sm:w-72">
          Search audit
          <input
            className="min-h-10 rounded-lg border border-[#B8ACA0] px-3 text-sm font-normal"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Actor, member, reason, or action"
            type="search"
            value={query}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIT_DOMAINS.map((entry) => (
          <button
            aria-pressed={domain === entry.id}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              domain === entry.id
                ? "border-[#174C37] bg-[#174C37] text-white"
                : "border-[#E5DDD3] bg-[#FBF9F6] text-[#5C4638]"
            }`}
            key={entry.id}
            onClick={() => setDomain(entry.id)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E5DDD3] text-[11px] uppercase tracking-wider text-[#7A685D]">
              <th className="py-2 pr-3 font-bold">Action</th>
              <th className="py-2 pr-3 font-bold">Actor</th>
              <th className="py-2 pr-3 font-bold">Member</th>
              <th className="py-2 pr-3 font-bold">Reason</th>
              <th className="py-2 font-bold">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className="border-b border-[#F1EBE3] align-top" key={row.id}>
                <td className="py-3 pr-3 font-bold text-[#3D291F]">
                  {humanizeAuditAction(row.action)}
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">
                  <p>{row.actorName}</p>
                  {row.actorIsPresident ? (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#174C37]">
                      President
                    </p>
                  ) : null}
                  {row.actorIsStaff ? (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A685D]">
                      Staff administrator
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">
                  {row.targetName ?? "—"}
                </td>
                <td className="py-3 pr-3 text-[#5C4638]">{row.reason}</td>
                <td className="py-3 text-[#5C4638]">
                  {formatStaffTimestamp(row.occurredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-[#E5DDD3] bg-[#FBF9F6] p-4 text-xs text-[#7A685D]">
          No audit entry matches this filter.
        </p>
      ) : null}
    </div>
  );
}
