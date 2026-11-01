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
          <p className="text-[11px] font-bold uppercase tracking-wider text-forest">
            Governance audit
          </p>
          <h2
            aria-atomic="true"
            aria-live="polite"
            className="text-lg font-extrabold text-espresso"
          >
            {visibleRows.length} of {rows.length} entries
          </h2>
        </div>
        <div className="sm:w-72">
          <label className="grid gap-1 text-xs font-bold text-espresso">
            Search audit
            <div className="relative flex items-center">
              <input
                className="min-h-11 w-full rounded-lg border border-linen bg-white px-3 text-sm font-normal text-espresso placeholder:text-muted focus-visible:border-forest focus-visible:outline-hidden"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Actor, member, reason, or action"
                type="search"
                value={query}
              />
              {query ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-muted hover:bg-stone-200 hover:text-espresso cursor-pointer"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </label>
        </div>
      </div>

      <fieldset className="m-0 flex flex-wrap gap-2 border-none p-0">
        <legend className="sr-only">Filter audit entries by domain</legend>
        {AUDIT_DOMAINS.map((entry) => (
          <button
            aria-pressed={domain === entry.id}
            className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-xs font-bold cursor-pointer transition-colors ${
              domain === entry.id
                ? "border-forest bg-forest text-white"
                : "border-linen bg-warm-canvas text-body hover:bg-white"
            }`}
            key={entry.id}
            onClick={() => setDomain(entry.id)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </fieldset>

      {/* Mobile Card View (screens < 640px) */}
      <div className="block sm:hidden space-y-3">
        {visibleRows.map((row) => (
          <div
            className="rounded-xl border border-linen bg-white p-4 shadow-2xs space-y-2.5"
            key={row.id}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm text-espresso">
                {humanizeAuditAction(row.action)}
              </p>
              <span className="text-[11px] text-muted whitespace-nowrap">
                {formatStaffTimestamp(row.occurredAt)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y border-linen/60 py-2 text-body">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted">
                  Actor
                </p>
                <p className="font-semibold text-espresso">{row.actorName}</p>
                {row.actorIsPresident ? (
                  <span className="inline-block rounded-md bg-forest/10 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-forest">
                    President
                  </span>
                ) : null}
                {row.actorIsStaff ? (
                  <span className="inline-block rounded-md bg-stone-100 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wider text-muted">
                    Staff admin
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted">
                  Affected member
                </p>
                <p className="font-medium text-espresso">
                  {row.targetName ?? "—"}
                </p>
              </div>
            </div>

            {row.reason ? (
              <p className="text-xs text-muted leading-relaxed">
                <span className="font-bold text-body">Reason: </span>
                {row.reason}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Desktop Table View (screens >= 640px) */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-xs">
          <caption className="sr-only">Governance audit trail log</caption>
          <thead>
            <tr className="border-b border-linen text-[11px] uppercase tracking-wider text-muted">
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Action
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Actor
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Member
              </th>
              <th className="py-2.5 pr-3 font-bold" scope="col">
                Reason
              </th>
              <th className="py-2.5 font-bold" scope="col">
                Recorded
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                className="border-b border-linen/60 align-top hover:bg-warm-canvas/40"
                key={row.id}
              >
                <th
                  className="py-3 pr-3 font-bold text-espresso text-left"
                  scope="row"
                >
                  {humanizeAuditAction(row.action)}
                </th>
                <td className="py-3 pr-3 text-body">
                  <p className="font-medium text-espresso">{row.actorName}</p>
                  {row.actorIsPresident ? (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-forest">
                      President
                    </p>
                  ) : null}
                  {row.actorIsStaff ? (
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      Staff administrator
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-3 text-body">{row.targetName ?? "—"}</td>
                <td className="py-3 pr-3 text-body">{row.reason}</td>
                <td className="py-3 text-body">
                  {formatStaffTimestamp(row.occurredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-xl border border-linen bg-warm-canvas p-4 text-xs text-muted">
          No audit entry matches this filter.
        </p>
      ) : null}
    </div>
  );
}
