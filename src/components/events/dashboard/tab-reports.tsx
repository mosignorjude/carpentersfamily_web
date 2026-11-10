"use client";

import {
  ChevronDown,
  Download,
  Printer,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { CfButton } from "@/components/ui";
import { downloadLedgerCSV, formatNaira, formatPercent } from "@/lib/format";
import type {
  ActivityLogItem,
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardRevenueStream,
  DashboardTeamMember,
  DashboardTransaction,
} from "./dashboard-types";
import { EventAuditTrailList } from "./event-audit-trail-list";

interface TabReportsProps {
  event: DashboardEventInfo;
  revenueStreams: DashboardRevenueStream[];
  costCenters: DashboardCostCenter[];
  transactions: DashboardTransaction[];
  teamMembers?: DashboardTeamMember[];
  activityLogs?: ActivityLogItem[];
  totalRevenue: number;
  totalExpenses: number;
  budgetCeiling: number;
  pendingTransactionsCount?: number;
  canManageTeamRoles?: boolean;
  onOpenDownloadReportModal?: () => void;
  onOpenAssignTeamModal?: () => void;
  onOpenRevokeTeamModal?: (member: DashboardTeamMember) => void;
}

export function TabReports({
  event,
  revenueStreams,
  costCenters,
  transactions,
  teamMembers = [],
  activityLogs = [],
  totalRevenue,
  totalExpenses,
  budgetCeiling,
  pendingTransactionsCount = 0,
  canManageTeamRoles = false,
  onOpenDownloadReportModal,
  onOpenAssignTeamModal,
  onOpenRevokeTeamModal,
}: TabReportsProps) {
  const [auditExpanded, setAuditExpanded] = useState(false);
  const netSurplus = totalRevenue - totalExpenses;
  const safeBudget = budgetCeiling || 1;
  const isFullyReconciled = pendingTransactionsCount === 0;

  return (
    <div className="space-y-4 min-w-0 max-w-full overflow-hidden">
      {/* Section A: Event Committee & Leads */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#3D291F] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#174C37]" />
              <span>Event Committee &amp; Leads</span>
            </h2>
            <p className="text-xs text-[#5C4638]">
              Members authorized to coordinate operations and record ledger
              entries
            </p>
          </div>
          {canManageTeamRoles && onOpenAssignTeamModal && (
            <CfButton
              onClick={onOpenAssignTeamModal}
              size="default"
              variant="primary"
            >
              <UserPlus className="w-4 h-4 text-[#F0C768] shrink-0" />
              <span>Assign Team Member</span>
            </CfButton>
          )}
        </div>

        {teamMembers.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#7A685D] bg-[#FAF6F0] rounded-xl border border-dashed border-[#E5DDD3]">
            No committee members assigned yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {teamMembers.map((m) => (
              <div
                className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] flex items-center justify-between gap-3"
                key={m.id}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#174C37] text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#3D291F] truncate">
                      {m.name}{" "}
                      {m.username && (
                        <span className="font-mono font-normal text-[#7A685D]">
                          @{m.username}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold text-[#174C37]">
                      {m.role}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-[#174C37]/10 text-[#174C37] text-[10px] font-semibold">
                    Active
                  </span>
                  {canManageTeamRoles &&
                    onOpenRevokeTeamModal &&
                    m.memberId && (
                      <CfButton
                        className="border-[#BA3C2A]/30 bg-white text-[#BA3C2A] hover:bg-[#FDF0EE] hover:border-[#BA3C2A]/50"
                        onClick={() => onOpenRevokeTeamModal(m)}
                        size="compact"
                        variant="secondary"
                      >
                        Remove
                      </CfButton>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section B: Official Reconciled Income Statement */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5DDD3]">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A685D] block">
              Official Financial Report
            </span>
            <h2 className="text-lg sm:text-xl font-bold text-[#3D291F] break-words">
              {event.title} — Income Statement
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <CfButton
              onClick={onOpenDownloadReportModal ?? (() => window.print())}
              size="compact"
              variant="secondary"
            >
              <Printer className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>Print / PDF</span>
            </CfButton>

            <CfButton
              onClick={() => downloadLedgerCSV(transactions)}
              size="compact"
              variant="secondary"
            >
              <Download className="w-3.5 h-3.5 text-[#174C37] shrink-0" />
              <span>Export CSV</span>
            </CfButton>
          </div>
        </div>

        {/* Club Letterhead */}
        <div className="bg-[#FAF6F0] rounded-xl p-4 border border-[#E5DDD3] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#174C37]">
              Accounting Statement
            </div>
            <div className="text-base sm:text-lg font-bold text-[#3D291F] mt-0.5 uppercase">
              Carpenters Family Social Club
            </div>
            <div className="text-xs text-[#5C4638]">
              Asaba, Delta State · Est. 1988
            </div>
          </div>
          <div className="text-xs font-mono space-y-0.5 text-[#5C4638]">
            <div>
              Ref:{" "}
              <strong className="text-[#3D291F]">
                CFSC-{event.id.slice(0, 6).toUpperCase()}-FIN-01
              </strong>
            </div>
            <div>Standard: Reconciled Ledger</div>
            <div
              className={`font-semibold ${
                isFullyReconciled ? "text-[#174C37]" : "text-[#8D5B0E]"
              }`}
            >
              {isFullyReconciled
                ? "Status: Reconciled"
                : `Status: ${pendingTransactionsCount} Pending Verification`}
            </div>
          </div>
        </div>

        {/* 4-Metric Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl border border-[#E5DDD3]">
            <span className="text-[10px] font-semibold uppercase text-[#7A685D] block">
              Revenue
            </span>
            <div className="text-base sm:text-lg font-bold text-[#174C37] mt-0.5 font-mono tabular-nums">
              {formatNaira(totalRevenue)}
            </div>
            <span className="text-[10px] text-[#7A685D]">Verified Inflows</span>
          </div>

          <div className="p-3 rounded-xl border border-[#E5DDD3]">
            <span className="text-[10px] font-semibold uppercase text-[#7A685D] block">
              Expenses
            </span>
            <div className="text-base sm:text-lg font-bold text-[#BA3C2A] mt-0.5 font-mono tabular-nums">
              {formatNaira(totalExpenses)}
            </div>
            <span className="text-[10px] text-[#7A685D]">
              Verified Outflows
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[#E5DDD3]">
            <span className="text-[10px] font-semibold uppercase text-[#7A685D] block">
              Net Balance
            </span>
            <div
              className={`text-base sm:text-lg font-bold mt-0.5 font-mono tabular-nums ${
                netSurplus >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
              }`}
            >
              {netSurplus >= 0 ? "+" : "-"}
              {formatNaira(Math.abs(netSurplus))}
            </div>
            <span className="text-[10px] text-[#7A685D]">
              {isFullyReconciled ? "Reconciled" : "Verified only"}
            </span>
          </div>

          <div className="p-3 rounded-xl border border-[#E5DDD3]">
            <span className="text-[10px] font-semibold uppercase text-[#7A685D] block">
              Net Margin
            </span>
            <div className="text-base sm:text-lg font-bold text-[#3D291F] mt-0.5 font-mono tabular-nums">
              {totalRevenue > 0
                ? formatPercent((netSurplus / totalRevenue) * 100)
                : budgetCeiling > 0
                  ? `${formatPercent((totalExpenses / safeBudget) * 100)} used`
                  : "0.0%"}
            </div>
            <span className="text-[10px] text-[#7A685D]">Club event</span>
          </div>
        </div>

        {/* 1. Revenue Breakdown (Clean 2-Line Rows) */}
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#3D291F]">
              1. Revenue ({revenueStreams.length} Streams)
            </h3>
            <span className="font-mono text-xs font-bold text-[#174C37]">
              {formatNaira(totalRevenue)}
            </span>
          </div>
          {revenueStreams.length === 0 ? (
            <p className="text-xs text-[#7A685D] py-4 text-center">
              No revenue streams recorded for this event yet.
            </p>
          ) : (
            <div className="divide-y divide-[#E5DDD3]/60 mt-1">
              {revenueStreams.map((rs) => {
                const variance = rs.actual - rs.target;
                return (
                  <div
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    key={rs.id}
                  >
                    <div>
                      <span className="font-bold text-[#3D291F] block">
                        {rs.name}
                      </span>
                      <span className="text-[11px] text-[#7A685D]">
                        {rs.target > 0 ? (
                          <>
                            Target:{" "}
                            <span className="font-mono">
                              {formatNaira(rs.target)}
                            </span>
                          </>
                        ) : rs.pending > 0 ? (
                          <>
                            Pending:{" "}
                            <span className="font-mono">
                              {formatNaira(rs.pending)}
                            </span>
                          </>
                        ) : (
                          "Direct inflow"
                        )}
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-[#174C37] block">
                        {formatNaira(rs.actual)}
                      </span>
                      {rs.target > 0 && (
                        <span
                          className={`text-[10px] ${
                            variance >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                          }`}
                        >
                          Var: {variance >= 0 ? "+" : "-"}
                          {formatNaira(Math.abs(variance))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Expenses Breakdown (Clean 2-Line Rows) */}
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-[#E5DDD3]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#3D291F]">
              2. Expenses ({costCenters.length} Categories)
            </h3>
            <span className="font-mono text-xs font-bold text-[#BA3C2A]">
              {formatNaira(totalExpenses)}
            </span>
          </div>
          {costCenters.length === 0 ? (
            <p className="text-xs text-[#7A685D] py-4 text-center">
              No cost center disbursements recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#E5DDD3]/60 mt-1">
              {costCenters.map((cc) => {
                const left = cc.allocated - cc.spent;
                return (
                  <div
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    key={cc.id}
                  >
                    <div>
                      <span className="font-bold text-[#3D291F] block">
                        {cc.name}
                      </span>
                      <span className="text-[11px] text-[#7A685D]">
                        Allocated:{" "}
                        <span className="font-mono">
                          {formatNaira(cc.allocated)}
                        </span>{" "}
                        ({cc.items.length} item
                        {cc.items.length === 1 ? "" : "s"}
                        {cc.committed > 0
                          ? ` · Pending: ${formatNaira(cc.committed)}`
                          : ""}
                        )
                      </span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-[#BA3C2A] block">
                        {formatNaira(cc.spent)}
                      </span>
                      <span
                        className={`text-[10px] ${
                          left >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                        }`}
                      >
                        Left: {left >= 0 ? "" : "-"}
                        {formatNaira(Math.abs(left))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Governance Verification Status Summary (Derived Strictly From Real Telemetry) */}
        <div className="pt-3 border-t border-[#E5DDD3] grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <span className="font-bold text-[#3D291F] block">
              Ledger Verification
            </span>
            <span className="text-[11px] text-[#7A685D] block">
              Transactions checked
            </span>
            <span
              className={`mt-1 inline-block text-[11px] font-semibold ${
                isFullyReconciled ? "text-[#174C37]" : "text-[#8D5B0E]"
              }`}
            >
              {isFullyReconciled
                ? "All entries verified"
                : `${pendingTransactionsCount} awaiting review`}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <span className="font-bold text-[#3D291F] block">Event Leads</span>
            <span className="text-[11px] text-[#7A685D] block">
              Assigned coordinators
            </span>
            <span className="mt-1 inline-block text-[11px] font-semibold text-[#174C37]">
              {teamMembers.length} active role
              {teamMembers.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
            <span className="font-bold text-[#3D291F] block">Event Record</span>
            <span className="text-[11px] text-[#7A685D] block">
              Lifecycle state
            </span>
            <span className="mt-1 inline-block text-[11px] font-semibold text-[#3D291F] capitalize">
              {event.archivedAt ? "Archived" : event.status}
            </span>
          </div>
        </div>
      </div>

      {/* Section C: Collapsible System Audit Trail */}
      <div className="bg-white border border-[#E5DDD3] rounded-2xl p-4 shadow-2xs space-y-3">
        <button
          aria-expanded={auditExpanded}
          className="w-full flex items-center justify-between gap-2 text-left min-h-[44px] cursor-pointer"
          onClick={() => setAuditExpanded((v) => !v)}
          type="button"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#174C37]/10 text-[#174C37] flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#3D291F]">
                System Audit Trail
              </h3>
              <p className="text-xs text-[#7A685D]">
                Permanent log of officer actions on this event
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-[#174C37] bg-[#FAF6F0] px-2.5 py-1 rounded-xl border border-[#E5DDD3]">
              {activityLogs.length} Events
            </span>
            <ChevronDown
              className={`w-4 h-4 text-[#5C4638] transition-transform ${
                auditExpanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>

        {auditExpanded && (
          <div className="pt-2 border-t border-[#E5DDD3] text-xs">
            <EventAuditTrailList activityLogs={activityLogs} />
          </div>
        )}
      </div>
    </div>
  );
}
