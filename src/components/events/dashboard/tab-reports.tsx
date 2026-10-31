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
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#174C37] block">
            Financial Report
          </span>
          <h3 className="text-xl font-bold text-[#3D291F] break-words">
            {event.title} — Income Statement
          </h3>
          <p className="text-xs text-[#7A685D]">Reconciled ledger statement.</p>
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
      <div className="bg-white rounded-2xl border border-[#E5DDD3] p-4 sm:p-6 lg:p-8 space-y-6 text-xs text-[#3D291F] min-w-0 max-w-full overflow-hidden">
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
                : "Reconciled Inflows"}
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
                : "Reconciled Outflows"}
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
              {netSurplus >= 0 ? "Positive Flow" : "Net Deficit"}
            </span>
          </div>

          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-[#7A685D] block">
              Profit Margin
            </span>
            <span className="text-base sm:text-lg font-bold font-mono text-[#3D291F] block mt-0.5 tabular-nums truncate">
              {totalRevenue > 0
                ? formatPercent((netSurplus / totalRevenue) * 100)
                : "0.0%"}
            </span>
            <span className="text-[10px] text-[#7A685D] block truncate">
              Non-profit
            </span>
          </div>
        </div>

        {/* Statement of Revenues Table */}
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-[#0C3325] uppercase tracking-wider border-b border-[#E5DDD3] pb-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4">
            <span>1. Revenues ({revenueStreams.length} Streams)</span>
            <span className="font-mono text-xs text-[#174C37] font-bold">
              {formatNaira(totalRevenue)}
            </span>
          </h4>

          {/* Mobile Revenue Stream Cards (sm:hidden) */}
          <div className="sm:hidden space-y-2.5">
            {revenueStreams.length === 0 ? (
              <div className="py-4 text-center text-[#7A685D]">
                No revenue streams recorded.
              </div>
            ) : (
              revenueStreams.map((s) => {
                const variance = s.actual - s.target;
                return (
                  <div
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2"
                    key={`mobile-rev-${s.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-[#3D291F] block">
                          {s.name}
                        </span>
                        {s.description && (
                          <span className="text-[11px] text-[#7A685D] block truncate">
                            {s.description}
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-mono text-xs font-semibold shrink-0 ${
                          variance >= 0 ? "text-[#174C37]" : "text-[#BA3C2A]"
                        }`}
                      >
                        {variance >= 0
                          ? `+${formatNaira(variance)}`
                          : `-${formatNaira(Math.abs(variance))}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-mono pt-1.5 border-t border-[#E5DDD3]">
                      <span className="text-[#7A685D]">
                        Target:{" "}
                        <strong className="text-[#5C4638]">
                          {formatNaira(s.target)}
                        </strong>
                      </span>
                      <span className="text-[#174C37] font-bold">
                        Actual: {formatNaira(s.actual)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block">
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
            <span>2. Disbursements ({costCenters.length} Centers)</span>
            <span className="font-mono text-xs text-[#BA3C2A] font-bold">
              {formatNaira(totalExpenses)}
            </span>
          </h4>

          {/* Mobile Cost Center Disbursement Cards (sm:hidden) */}
          <div className="sm:hidden space-y-2.5">
            {costCenters.length === 0 ? (
              <div className="py-4 text-center text-[#7A685D]">
                No cost center disbursements recorded.
              </div>
            ) : (
              costCenters.map((c) => {
                const remaining = c.allocated - (c.spent + c.committed);
                return (
                  <div
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#E5DDD3] space-y-2"
                    key={`mobile-cost-${c.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-xs text-[#3D291F] block">
                          {c.name}
                        </span>
                        <span className="text-[11px] text-[#7A685D]">
                          {c.items.length} item{c.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span
                        className={`font-mono text-xs font-semibold shrink-0 px-2 py-0.5 rounded-md ${
                          remaining >= 0
                            ? "bg-[#E9F4EE] text-[#174C37] border border-[#C4E2D0]"
                            : "bg-[#FDF0EE] text-[#BA3C2A] border border-[#F5C7C0]"
                        }`}
                      >
                        {remaining >= 0
                          ? `+${formatNaira(remaining)}`
                          : `-${formatNaira(Math.abs(remaining))}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-white border border-[#E5DDD3] text-center text-xs">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#7A685D] block">
                          Allocated
                        </span>
                        <span className="font-mono font-semibold text-[#5C4638] text-[11px] truncate block">
                          {formatNaira(c.allocated)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#7A685D] block">
                          Spent
                        </span>
                        <span className="font-mono font-bold text-[#BA3C2A] text-[11px] truncate block">
                          {formatNaira(c.spent)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-[#7A685D] block">
                          Committed
                        </span>
                        <span className="font-mono text-[#8D5B0E] text-[11px] truncate block">
                          {formatNaira(c.committed)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table (hidden sm:block) */}
          <div className="hidden sm:block">
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
                        No cost center disbursements recorded for this event
                        yet.
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
