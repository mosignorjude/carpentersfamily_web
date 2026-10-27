"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileCode,
  Shield,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type FinanceAuditRow = {
  id: string;
  actor_id: string;
  action: string;
  entity_id: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string;
  occurred_at: string;
};

interface OfficerAuditHistoryProps {
  auditRows: FinanceAuditRow[];
  actorNames: Map<string, string>;
  auditPage: number;
  auditPageCount: number;
  auditCount: number;
  pageSize: number;
  auditError?: boolean;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

function auditPageHref(page: number) {
  return `/finances?${new URLSearchParams({ audit_page: String(page) }).toString()}`;
}

export function OfficerAuditHistory({
  auditRows,
  actorNames,
  auditPage,
  auditPageCount,
  auditCount,
  pageSize,
  auditError = false,
}: OfficerAuditHistoryProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "club_finance_recorded":
        return {
          label: "Inflow / Disbursement Recorded",
          class: "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20",
        };
      case "club_opening_balance_classified":
        return {
          label: "Opening Balance Classified",
          class: "bg-[#FAF6F0] text-[#7A685D] border border-[#E5DDD3]",
        };
      case "club_finance_corrected":
        return {
          label: "Parameter Corrected",
          class: "bg-[#D6A23A]/15 text-[#3D291F] border border-[#D6A23A]/30",
        };
      case "club_finance_voided":
        return {
          label: "Transaction Voided",
          class: "bg-[#BA3C2A]/10 text-[#BA3C2A] border border-[#BA3C2A]/20",
        };
      case "club_finance_receipt_attached":
        return {
          label: "Receipt Attached",
          class: "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20",
        };
      case "finance_category_created":
        return {
          label: "Cost Center Created",
          class: "bg-[#174C37]/10 text-[#174C37] border border-[#174C37]/20",
        };
      case "finance_category_retired":
        return {
          label: "Cost Center Retired",
          class: "bg-[#7A685D]/15 text-[#7A685D] border border-[#7A685D]/30",
        };
      default:
        return {
          label: action.replaceAll("_", " "),
          class: "bg-[#FAF6F0] text-[#3D291F] border border-[#E5DDD3]",
        };
    }
  };

  return (
    <section
      aria-labelledby="finance-audit-heading"
      className="bg-white rounded-2xl border border-[#E5DDD3] overflow-hidden shadow-xs"
    >
      {/* Header */}
      <div className="p-5 sm:p-6 border-b border-[#E5DDD3] bg-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#174C37] text-white flex items-center justify-center shadow-xs">
            <Shield className="w-5 h-5 text-[#D6A23A]" />
          </div>
          <div>
            <h2
              className="text-base sm:text-lg font-extrabold text-[#3D291F]"
              id="finance-audit-heading"
            >
              Officer Financial Audit Trail
            </h2>
            <p className="text-xs text-[#54433A] font-medium">
              Indelible, immutable audit log of all financial mutations and cost
              center adjustments
            </p>
          </div>
        </div>

        <span className="text-[11px] font-mono font-medium text-[#7A685D] self-start sm:self-center">
          {auditCount} total audit events
        </span>
      </div>

      {auditError ? (
        <div className="p-8 text-center text-xs text-[#BA3C2A] flex items-center justify-center gap-2">
          <ShieldAlert className="w-4 h-4" />
          <span>Audit history could not be verified.</span>
        </div>
      ) : auditRows.length === 0 ? (
        <div className="p-10 text-center space-y-2">
          <Shield className="w-10 h-10 text-[#B8ACA0] mx-auto" />
          <h4 className="text-sm font-bold text-[#3D291F]">
            No Financial Audit Records
          </h4>
          <p className="text-xs text-[#7A685D] max-w-sm mx-auto">
            Audit entries generated during ledger modifications will be
            cataloged here with full before and after state diffs.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#E5DDD3]">
          {auditRows.map((entry) => {
            const badge = getActionBadge(entry.action);
            const isExpanded = expandedRows.has(entry.id);
            const actorName = actorNames.get(entry.actor_id) ?? "Club Officer";

            return (
              <article
                className="p-5 hover:bg-[#FAF6F0]/40 transition-colors text-xs text-[#3D291F] space-y-3"
                key={entry.id}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${badge.class}`}
                    >
                      {badge.label}
                    </span>
                    <strong className="font-bold text-[#3D291F]">
                      {actorName}
                    </strong>
                    <span aria-hidden="true" className="text-[#B8ACA0]">
                      ·
                    </span>
                    <span className="text-[11px] font-mono text-[#7A685D]">
                      {formatTimestamp(entry.occurred_at)}
                    </span>
                  </div>

                  <button
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#E5DDD3] bg-white text-[11px] font-bold text-[#54433A] hover:bg-[#FAF6F0] self-start sm:self-center cursor-pointer transition-colors"
                    onClick={() => toggleRow(entry.id)}
                    type="button"
                  >
                    <FileCode className="w-3.5 h-3.5 text-[#174C37]" />
                    <span>
                      {isExpanded ? "Hide State Diff" : "Inspect State Diff"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-[#7A685D]" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-[#7A685D]" />
                    )}
                  </button>
                </div>

                {/* Reason */}
                <div className="bg-[#FAF6F0] p-3 rounded-xl border border-[#E5DDD3] text-xs">
                  <span className="font-bold text-[#54433A]">
                    Audited Governance Reason:{" "}
                  </span>
                  <span className="text-[#3D291F] font-medium">
                    {entry.reason}
                  </span>
                </div>

                {/* Expandable JSON Diff */}
                {isExpanded && (
                  <div className="mt-2 p-3.5 rounded-xl bg-[#1F2421] text-emerald-300 font-mono text-[11px] overflow-x-auto shadow-inner space-y-1">
                    <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-2 border-b border-white/10 pb-1">
                      Target Entity ID: {entry.entity_id}
                    </div>
                    <pre className="whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(
                        {
                          before: entry.before_data,
                          after: entry.after_data,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {!auditError && auditCount > pageSize && (
        <div className="p-4 border-t border-[#E5DDD3] bg-[#FAF6F0]/60 flex items-center justify-between text-xs font-semibold text-[#54433A]">
          {auditPage > 0 ? (
            <Link
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#3D291F] hover:bg-[#FAF6F0] shadow-2xs transition-colors"
              href={auditPageHref(auditPage - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Newer changes</span>
            </Link>
          ) : (
            <div />
          )}

          <span className="text-[11px] font-mono font-medium">
            Audit Page {auditPage + 1} of {auditPageCount}
          </span>

          {(auditPage + 1) * pageSize < auditCount ? (
            <Link
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5DDD3] bg-white text-[#3D291F] hover:bg-[#FAF6F0] shadow-2xs transition-colors"
              href={auditPageHref(auditPage + 1)}
            >
              <span>Older changes</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : (
            <div />
          )}
        </div>
      )}
    </section>
  );
}
