"use client";

import { Download, Printer } from "lucide-react";
import {
  downloadLedgerCSV,
  formatNaira,
  formatPercent,
} from "./dashboard-mock-data";
import type {
  DashboardCostCenter,
  DashboardEventInfo,
  DashboardRevenueStream,
  DashboardTransaction,
} from "./dashboard-types";

interface TabReportsProps {
  event: DashboardEventInfo;
  revenueStreams: DashboardRevenueStream[];
  costCenters: DashboardCostCenter[];
  transactions: DashboardTransaction[];
  totalRevenue: number;
  totalExpenses: number;
  budgetCeiling: number;
}

export function TabReports({
  event,
  revenueStreams,
  costCenters,
  transactions,
  totalRevenue,
  totalExpenses,
  budgetCeiling,
}: TabReportsProps) {
  const netSurplus = totalRevenue - totalExpenses;
  const safeBudget = budgetCeiling || 1;

  return (
    <div className="space-y-6">
      {/* Top Actions Bar for Reports */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#174C37] block">
            Executive Financial Reporting
          </span>
          <h3 className="text-xl font-bold text-[#3D291F]">
            {event.title} — Statement of Comprehensive Income
          </h3>
          <p className="text-xs text-[#7A685D]">
            Reconciled ledger balance for the Carpenters Family Social Club
            executive committee.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            className="px-3.5 py-2 text-xs font-medium text-[#3D291F] bg-white border border-[#E5DDD3] rounded-xl hover:bg-[#FAF6F0] min-h-[40px] flex items-center gap-1.5 transition-colors cursor-pointer"
            onClick={() => window.print()}
            type="button"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Statement</span>
          </button>

          <button
            className="px-4 py-2 text-xs font-semibold text-white bg-[#174C37] hover:bg-[#103D2B] rounded-xl min-h-[40px] flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            onClick={() => downloadLedgerCSV(transactions)}
            type="button"
          >
            <Download className="w-3.5 h-3.5 text-[#D6A23A]" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Embedded Official Financial Statement */}
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-6 sm:p-8 space-y-6 text-xs text-[#3D291F]">
        {/* Letterhead */}
        <div className="border-b-2 border-[#174C37] pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#D6A23A] block">
              Official Club Accounting Document
            </span>
            <h2 className="text-2xl font-bold text-[#0C3325] uppercase tracking-tight mt-0.5">
              Carpenters Family Social Club
            </h2>
            <p className="text-xs text-[#7A685D]">
              Club Secretariat · Nnebisi Road, Asaba, Delta State, Nigeria ·
              Est. 1988
            </p>
          </div>

          <div className="text-left sm:text-right font-mono text-[11px] text-[#7A685D] space-y-0.5">
            <div>
              Document Ref:{" "}
              <strong>CFSC-{event.id.slice(0, 6).toUpperCase()}-FIN-01</strong>
            </div>
            <div>
              Reporting Standard:{" "}
              <strong>Reconciled Institutional Ledger</strong>
            </div>
            <div>
              Audit Status:{" "}
              <span className="text-[#174C37] font-bold">RECONCILED</span>
            </div>
          </div>
        </div>

        {/* P&L Executive Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Gross Revenue
            </span>
            <span className="text-lg font-bold font-mono text-[#174C37] block mt-0.5">
              {formatNaira(totalRevenue)}
            </span>
            <span className="text-[10px] text-[#7A685D]">
              {budgetCeiling > 0
                ? `${formatPercent((totalRevenue / safeBudget) * 100)} of ${formatNaira(budgetCeiling)} Target`
                : "Reconciled Inflows"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Total Expenditures
            </span>
            <span className="text-lg font-bold font-mono text-[#BA3C2A] block mt-0.5">
              {formatNaira(totalExpenses)}
            </span>
            <span className="text-[10px] text-[#7A685D]">
              {budgetCeiling > 0
                ? `${formatPercent((totalExpenses / safeBudget) * 100)} of Budget Ceiling`
                : "Reconciled Outflows"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Net Operating Surplus
            </span>
            <span className="text-lg font-bold font-mono text-[#174C37] block mt-0.5">
              {formatNaira(netSurplus)}
            </span>
            <span className="text-[10px] text-[#174C37] font-semibold">
              {netSurplus >= 0 ? "Positive Cash Flow" : "Net Deficit"}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Net Profit Margin
            </span>
            <span className="text-lg font-bold font-mono text-[#3D291F] block mt-0.5">
              {totalRevenue > 0
                ? formatPercent((netSurplus / totalRevenue) * 100)
                : "0.0%"}
            </span>
            <span className="text-[10px] text-[#7A685D]">
              Post-tax / Non-profit
            </span>
          </div>
        </div>

        {/* Statement of Revenues Table */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-[#0C3325] uppercase tracking-wider border-b border-[#E5DDD3] pb-1.5 flex items-center justify-between">
            <span>
              1. Statement of Event Revenues ({revenueStreams.length} Streams)
            </span>
            <span className="font-mono text-xs text-[#174C37] font-bold">
              {formatNaira(totalRevenue)}
            </span>
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E5DDD3] text-[10px] text-[#7A685D] uppercase tracking-wider">
                  <th className="py-2">Revenue Category</th>
                  <th className="py-2 text-right">Target (₦)</th>
                  <th className="py-2 text-right">Actual Realized (₦)</th>
                  <th className="py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD3]">
                {revenueStreams.length === 0 ? (
                  <tr>
                    <td className="py-4 text-center text-[#7A685D]" colSpan={4}>
                      No revenue streams recorded for this event yet.
                    </td>
                  </tr>
                ) : (
                  revenueStreams.map((s) => {
                    const variance = s.actual - s.target;
                    return (
                      <tr key={s.id}>
                        <td className="py-2.5">
                          <span className="font-bold text-[#3D291F] block">
                            {s.name}
                          </span>
                          <span className="text-[11px] text-[#7A685D]">
                            {s.description}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#5C4638]">
                          {formatNaira(s.target)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[#174C37]">
                          {formatNaira(s.actual)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-mono font-semibold ${
                            variance >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                          }`}
                        >
                          {variance >= 0
                            ? `+${formatNaira(variance)}`
                            : `-${formatNaira(Math.abs(variance))}`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statement of Expenses Table */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-bold text-[#0C3325] uppercase tracking-wider border-b border-[#E5DDD3] pb-1.5 flex items-center justify-between">
            <span>
              2. Statement of Cost Center Disbursements ({costCenters.length}{" "}
              Centers)
            </span>
            <span className="font-mono text-xs text-[#BA3C2A] font-bold">
              {formatNaira(totalExpenses)}
            </span>
          </h4>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#E5DDD3] text-[10px] text-[#7A685D] uppercase tracking-wider">
                  <th className="py-2">Cost Center</th>
                  <th className="py-2 text-right">Allocated (₦)</th>
                  <th className="py-2 text-right">Spent to Date (₦)</th>
                  <th className="py-2 text-right">Committed (₦)</th>
                  <th className="py-2 text-right">Remaining (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5DDD3]">
                {costCenters.length === 0 ? (
                  <tr>
                    <td className="py-4 text-center text-[#7A685D]" colSpan={5}>
                      No cost center disbursements recorded for this event yet.
                    </td>
                  </tr>
                ) : (
                  costCenters.map((c) => {
                    const remaining = c.allocated - (c.spent + c.committed);
                    return (
                      <tr key={c.id}>
                        <td className="py-2.5">
                          <span className="font-bold text-[#3D291F] block">
                            {c.name}
                          </span>
                          <span className="text-[11px] text-[#7A685D]">
                            {c.items.length} itemized entry
                            {c.items.length === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#5C4638]">
                          {formatNaira(c.allocated)}
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-[#BA3C2A]">
                          {formatNaira(c.spent)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-[#D6A23A]">
                          {formatNaira(c.committed)}
                        </td>
                        <td
                          className={`py-2.5 text-right font-mono font-semibold ${
                            remaining >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                          }`}
                        >
                          {formatNaira(remaining)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auditor Sign-off */}
        <div className="pt-6 border-t border-[#E5DDD3] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 text-xs">
            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">
                Club Treasury
              </span>
              <span className="text-[#7A685D]">
                Treasurer & Financial Secretary
              </span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Verified
              </span>
            </div>

            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">
                Event Planning Lead
              </span>
              <span className="text-[#7A685D]">
                Event Director · {event.title}
              </span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Approved
              </span>
            </div>

            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">
                Internal Audit Committee
              </span>
              <span className="text-[#7A685D]">Club Audit & Compliance</span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Verified &amp; Compliant
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
