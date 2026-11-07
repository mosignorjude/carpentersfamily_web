"use client";

import { Download, Printer } from "lucide-react";
import { TableScroll } from "@/components/ui/table-scroll";
import { downloadLedgerCSV, formatNaira, formatPercent } from "@/lib/format";
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
    <div className="space-y-6 min-w-0 max-w-full overflow-hidden">
      {/* Top Actions Bar for Reports */}
      <div className="bg-white sm:bg-transparent rounded-2xl sm:rounded-none border sm:border-0 sm:border-b border-[#E5DDD3] p-4 sm:p-0 sm:pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#174C37] block">
            Financial Report
          </span>
          <h3 className="text-xl font-bold text-[#3D291F] break-words">
            {event.title} — Income Statement
          </h3>
          <p className="text-xs text-[#7A685D]">
            Official income and expense statement.
          </p>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center gap-2">
          <button
            className="px-3.5 py-2 text-xs font-medium text-[#3D291F] bg-white border border-[#E5DDD3] rounded-xl hover:bg-[#FAF6F0] min-h-[40px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            onClick={() => window.print()}
            type="button"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          <button
            className="px-4 py-2 text-xs font-semibold text-white bg-[#174C37] hover:bg-[#103D2B] rounded-xl min-h-[40px] flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            onClick={() => downloadLedgerCSV(transactions)}
            type="button"
          >
            <Download className="w-3.5 h-3.5 text-white" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Embedded Official Financial Statement */}
      <div className="bg-white sm:bg-transparent rounded-2xl sm:rounded-none border sm:border-0 border-[#E5DDD3] p-4 sm:p-0 space-y-6 text-xs text-[#3D291F] min-w-0 max-w-full overflow-hidden">
        {/* Letterhead */}
        <div className="border-b-2 border-[#174C37] pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-4 min-w-0">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#8D5B0E] block">
              Accounting Statement
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0C3325] uppercase tracking-tight mt-0.5 break-words">
              Carpenters Family Social Club
            </h2>
            <p className="text-xs text-[#7A685D]">
              Asaba, Delta State · Est. 1988
            </p>
          </div>

          <div className="text-left sm:text-right font-mono text-[11px] text-[#7A685D] space-y-0.5 min-w-0">
            <div className="truncate">
              Ref:{" "}
              <strong>CFSC-{event.id.slice(0, 6).toUpperCase()}-FIN-01</strong>
            </div>
            <div>
              Standard: <strong>Reconciled Ledger</strong>
            </div>
            <div>
              Status:{" "}
              <span className="text-[#174C37] font-bold">Reconciled</span>
            </div>
          </div>
        </div>

        {/* P&L Executive Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3]">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Revenue
            </span>
            <span className="text-sm sm:text-lg font-bold font-mono text-[#174C37] block mt-0.5 tabular-nums leading-tight">
              {formatNaira(totalRevenue)}
            </span>
            <span className="text-[10px] text-[#7A685D] block truncate">
              {budgetCeiling > 0
                ? `${formatPercent((totalRevenue / safeBudget) * 100)} of Target`
                : "Approved revenue"}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Expenses
            </span>
            <span className="text-sm sm:text-lg font-bold font-mono text-[#BA3C2A] block mt-0.5 tabular-nums leading-tight">
              {formatNaira(totalExpenses)}
            </span>
            <span className="text-[10px] text-[#7A685D] block truncate">
              {budgetCeiling > 0
                ? `${formatPercent((totalExpenses / safeBudget) * 100)} of Ceiling`
                : "Approved expenses"}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Net Surplus
            </span>
            <span className="text-sm sm:text-lg font-bold font-mono text-[#174C37] block mt-0.5 tabular-nums leading-tight">
              {formatNaira(netSurplus)}
            </span>
            <span className="text-[10px] text-[#174C37] font-semibold block truncate">
              {netSurplus >= 0 ? "Surplus" : "Net Deficit"}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Net Margin
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-[#3D291F] block mt-0.5 tabular-nums truncate">
              {totalRevenue > 0
                ? formatPercent((netSurplus / totalRevenue) * 100)
                : "0.0%"}
            </span>
            <span className="text-[10px] text-[#7A685D] block truncate">
              Club event
            </span>
          </div>
        </div>

        {/* Statement of Revenues Table */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-[#0C3325] uppercase tracking-wider border-b border-[#E5DDD3] pb-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
            <span>1. Revenue ({revenueStreams.length} Streams)</span>
            <span className="font-mono text-xs text-[#174C37] font-bold">
              {formatNaira(totalRevenue)}
            </span>
          </h4>

          {/* Revenue Table (Tabular & Horizontally Scrollable on Mobile and Desktop) */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-[#7A685D] sm:hidden">
              Swipe left or right to scroll the revenue table
            </p>
            <TableScroll label="Financial report">
              <table className="w-full text-left min-w-[500px]">
                <thead>
                  <tr className="border-b border-[#E5DDD3] text-[10px] text-[#7A685D] uppercase tracking-wider">
                    <th className="py-2">Category</th>
                    <th className="py-2 text-right">Target (₦)</th>
                    <th className="py-2 text-right">Actual (₦)</th>
                    <th className="py-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD3]">
                  {revenueStreams.length === 0 ? (
                    <tr>
                      <td
                        className="py-4 text-center text-[#7A685D]"
                        colSpan={4}
                      >
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
                              variance >= 0
                                ? "text-[#174C37]"
                                : "text-[#BA3C2A]"
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
            </TableScroll>
          </div>
        </div>

        {/* Statement of Expenses Table */}
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-bold text-[#0C3325] uppercase tracking-wider border-b border-[#E5DDD3] pb-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
            <span>2. Expenses ({costCenters.length} Categories)</span>
            <span className="font-mono text-xs text-[#BA3C2A] font-bold">
              {formatNaira(totalExpenses)}
            </span>
          </h4>

          {/* Disbursements Table (Tabular & Horizontally Scrollable on Mobile and Desktop) */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-[#7A685D] sm:hidden">
              Swipe left or right to scroll the disbursements table
            </p>
            <TableScroll label="Report summary">
              <table className="w-full text-left min-w-[540px]">
                <thead>
                  <tr className="border-b border-[#E5DDD3] text-[10px] text-[#7A685D] uppercase tracking-wider">
                    <th className="py-2">Cost Center</th>
                    <th className="py-2 text-right">Allocated (₦)</th>
                    <th className="py-2 text-right">Spent (₦)</th>
                    <th className="py-2 text-right">Committed (₦)</th>
                    <th className="py-2 text-right">Remaining (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DDD3]">
                  {costCenters.length === 0 ? (
                    <tr>
                      <td
                        className="py-4 text-center text-[#7A685D]"
                        colSpan={5}
                      >
                        No expenses recorded for this event yet.
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
                          <td className="py-2.5 text-right font-mono text-[#8D5B0E]">
                            {formatNaira(c.committed)}
                          </td>
                          <td
                            className={`py-2.5 text-right font-mono font-semibold ${
                              remaining >= 0
                                ? "text-[#174C37]"
                                : "text-[#BA3C2A]"
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
            </TableScroll>
          </div>
        </div>

        {/* Auditor Sign-off */}
        <div className="pt-6 border-t border-[#E5DDD3] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2 text-xs">
            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">Treasury</span>
              <span className="text-[#7A685D]">Treasurer</span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Verified
              </span>
            </div>

            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">Event Lead</span>
              <span className="text-[#7A685D]">Event Director</span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Approved
              </span>
            </div>

            <div className="border-t border-[#3D291F] pt-2">
              <span className="font-bold text-[#3D291F] block">
                Audit Committee
              </span>
              <span className="text-[#7A685D]">Compliance</span>
              <span className="text-[10px] text-[#174C37] block mt-0.5 font-mono">
                Sign-off: Verified
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
